import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { Attribute } from '../../../domain/entities/attribute.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { Category } from '../../../domain/entities/category.entity';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { ImportRowError, PlannedProduct, planImport } from '../../../domain/import-plan';
import { CreateSimpleProductCommand } from '../create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../create-simple-product/create-simple-product.handler';
import { CreateVariableProductCommand } from '../create-variable-product/create-variable-product.command';
import { CreateVariableProductHandler } from '../create-variable-product/create-variable-product.handler';
import { ImportVariantProductsCommand } from './import-variant-products.command';

export const MAX_IMPORT_ROWS = 2000;
const CHUNK = 500;

export interface ImportVariantsSummary {
  products: number;
  variants: number;
  units: number;
  /** Lo que el archivo trae y aún no existe: se crea al importar. */
  newCategories: string[];
  newAttributes: string[];
  newAttributeValues: number;
}

export interface ImportVariantsReport {
  valid: boolean;
  /** `true` si se escribió en la base de datos; una validación (`dryRun`) devuelve `false`. */
  applied: boolean;
  errors: ImportRowError[];
  summary: ImportVariantsSummary;
}

const lower = (text: string): string => text.trim().toLowerCase();

/** Lo que la tienda ya tiene del catálogo, indexado sin distinguir mayúsculas. */
interface Catalog {
  categories: Map<string, Category>;
  attributes: Map<string, { attribute: Attribute; values: Map<string, AttributeValue> }>;
}

/**
 * Importación masiva de productos con variantes (una fila por variante). Primero valida todo y devuelve un informe con los errores
 * por fila; solo si no hay ninguno (y no es una simple validación) crea categorías, atributos, productos y existencias en una
 * única transacción: o se importa todo o no se toca nada.
 */
@CommandHandler(ImportVariantProductsCommand)
export class ImportVariantProductsHandler implements ICommandHandler<ImportVariantProductsCommand> {
  private readonly logger = new Logger(ImportVariantProductsHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: ImportVariantProductsCommand): Promise<ImportVariantsReport> {
    const { tenantId, userId, branchId, dryRun, rows } = command;
    this.logger.log(`Import by variants (${dryRun ? 'validation' : 'apply'}): ${rows.length} row(s) for Tenant: ${tenantId}`);

    if (rows.length === 0) throw new AppException(ErrorCode.ImportEmpty, 'El archivo no tiene filas para importar.', HttpStatus.BAD_REQUEST);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppException(ErrorCode.ImportLimitExceeded, `El archivo tiene ${rows.length} filas; el máximo por importación es ${MAX_IMPORT_ROWS}.`, HttpStatus.BAD_REQUEST, { received: rows.length, max: MAX_IMPORT_ROWS });
    }

    return this.entityManager.transaction(async (manager) => {
      if (branchId) {
        await assertUserCanOperateInBranch(manager, this.redisService, { tenantId, userId, branchId, actionDescription: 'importar productos' });
        if (!(await manager.getRepository(Branch).existsBy({ id: branchId, tenantId }))) {
          throw new AppException(ErrorCode.BranchNotFound, `La sucursal con ID "${branchId}" no existe.`, HttpStatus.NOT_FOUND, { branchId });
        }
      }

      const plan = planImport(rows);
      const errors = [...plan.errors, ...(await this.databaseErrors(manager, tenantId, plan.products, rows, branchId))].sort((a, b) => a.row - b.row);
      const catalog = await this.loadCatalog(manager, tenantId);
      const summary = this.summarize(plan.products, catalog);

      if (errors.length > 0 && !dryRun) {
        throw new AppException(ErrorCode.ImportInvalid, `El archivo tiene ${errors.length} problema(s); corrígelos y vuelve a importar.`, HttpStatus.BAD_REQUEST, { errors: errors.slice(0, 200), total: errors.length });
      }
      if (dryRun || errors.length > 0) return { valid: errors.length === 0, applied: false, errors, summary };

      await this.apply(manager, tenantId, branchId, plan.products, catalog);
      return { valid: true, applied: true, errors: [], summary };
    });
  }

  /** Lo que solo se sabe mirando la tienda: SKU y SKU base ya usados, y existencias sin sucursal. */
  private async databaseErrors(manager: EntityManager, tenantId: string, products: readonly PlannedProduct[], rows: readonly { row: number; quantity: number | null }[], branchId: string | undefined): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const firstRow = (product: PlannedProduct): number => product.variants[0]?.row ?? 0;

    if (!branchId) {
      for (const row of rows) {
        if ((row.quantity ?? 0) > 0) errors.push({ row: row.row, field: 'quantity', message: 'Elige una sucursal para guardar las existencias.' });
      }
    }

    const skus = products.flatMap((product) => product.variants.map((variant) => variant.sku));
    const takenSkus = new Set<string>();
    for (let i = 0; i < skus.length; i += CHUNK) {
      const found = await manager.getRepository(ProductVariant).find({ where: { tenantId, sku: In(skus.slice(i, i + CHUNK)) }, select: { sku: true } });
      for (const variant of found) takenSkus.add(variant.sku.toUpperCase());
    }
    for (const product of products) {
      for (const variant of product.variants) {
        if (takenSkus.has(variant.sku)) errors.push({ row: variant.row, field: 'sku', message: `El SKU ${variant.sku} ya existe en la tienda.` });
      }
    }

    const bases = products.map((product) => product.baseSku);
    const takenBases = new Set<string>();
    const variableBases = new Set<string>();
    for (let i = 0; i < bases.length; i += CHUNK) {
      const chunk = bases.slice(i, i + CHUNK);
      const found = await manager.getRepository(Product).createQueryBuilder('product').select(['product.baseSku', 'product.type']).where('product.tenantId = :tenantId', { tenantId }).andWhere('UPPER(product.baseSku) IN (:...chunk)', { chunk }).getMany();
      for (const product of found) takenBases.add((product.baseSku ?? '').toUpperCase());
    }
    for (const product of products) {
      // Un producto simple usa su SKU como base: ese choque ya sale como SKU repetido
      if (product.kind === 'VARIABLE' && (takenBases.has(product.baseSku) || takenSkus.has(product.baseSku))) {
        errors.push({ row: firstRow(product), field: 'baseSku', message: `El SKU base ${product.baseSku} ya lo usa otro producto de la tienda.` });
      }
      if (product.kind === 'VARIABLE') variableBases.add(product.baseSku);
    }

    // El SKU de una variante no puede ser el SKU base de otro producto con variantes que ya existe
    for (let i = 0; i < skus.length; i += CHUNK) {
      const chunk = skus.slice(i, i + CHUNK);
      const found = await manager.getRepository(Product).createQueryBuilder('product').select('product.baseSku', 'baseSku').where('product.tenantId = :tenantId', { tenantId }).andWhere('product.type = :type', { type: ProductType.VARIABLE }).andWhere('UPPER(product.baseSku) IN (:...chunk)', { chunk }).getRawMany<{ baseSku: string }>();
      const clashing = new Set(found.map((item) => item.baseSku.toUpperCase()));
      for (const product of products) {
        for (const variant of product.variants) {
          if (clashing.has(variant.sku) && !takenSkus.has(variant.sku)) errors.push({ row: variant.row, field: 'sku', message: `El SKU ${variant.sku} es el SKU base de otro producto de la tienda.` });
        }
      }
    }
    return errors;
  }

  private async loadCatalog(manager: EntityManager, tenantId: string): Promise<Catalog> {
    const categories = new Map((await manager.getRepository(Category).find({ where: { tenantId } })).map((category) => [lower(category.name), category]));
    const attributes = new Map(
      (await manager.getRepository(Attribute).find({ where: { tenantId }, relations: { values: true } })).map((attribute) => [lower(attribute.name), { attribute, values: new Map((attribute.values ?? []).map((value) => [lower(value.value), value])) }]),
    );
    return { categories, attributes };
  }

  private summarize(products: readonly PlannedProduct[], catalog: Catalog): ImportVariantsSummary {
    const newCategories = new Map<string, string>();
    const newAttributes = new Map<string, string>();
    const newValues = new Set<string>();
    for (const product of products) {
      if (product.category && !catalog.categories.has(lower(product.category))) newCategories.set(lower(product.category), product.category);
      for (const variant of product.variants) {
        for (const { name, value } of variant.attributes) {
          const existing = catalog.attributes.get(lower(name));
          if (!existing) newAttributes.set(lower(name), name);
          if (!existing?.values.has(lower(value))) newValues.add(`${lower(name)}=${lower(value)}`);
        }
      }
    }
    return {
      products: products.length,
      variants: products.reduce((total, product) => total + product.variants.length, 0),
      units: products.reduce((total, product) => total + product.variants.reduce((sum, variant) => sum + variant.quantity, 0), 0),
      newCategories: [...newCategories.values()],
      newAttributes: [...newAttributes.values()],
      newAttributeValues: newValues.size,
    };
  }

  private async apply(manager: EntityManager, tenantId: string, branchId: string | undefined, products: readonly PlannedProduct[], catalog: Catalog): Promise<void> {
    // Categorías, atributos y valores que faltan (con la grafía del archivo)
    for (const product of products) {
      if (product.category && !catalog.categories.has(lower(product.category))) {
        const category = await manager.getRepository(Category).save(manager.getRepository(Category).create({ tenantId, name: product.category }));
        catalog.categories.set(lower(product.category), category);
      }
      for (const variant of product.variants) {
        for (const { name, value } of variant.attributes) {
          let entry = catalog.attributes.get(lower(name));
          if (!entry) {
            const attribute = await manager.getRepository(Attribute).save(manager.getRepository(Attribute).create({ tenantId, name }));
            entry = { attribute, values: new Map() };
            catalog.attributes.set(lower(name), entry);
          }
          if (!entry.values.has(lower(value))) {
            entry.values.set(lower(value), await manager.getRepository(AttributeValue).save(manager.getRepository(AttributeValue).create({ attributeId: entry.attribute.id, value })));
          }
        }
      }
    }

    // Cada producto con los mismos casos de uso que la pantalla de alta (mismas reglas y mismos errores)
    const simple = new CreateSimpleProductHandler(manager);
    const variable = new CreateVariableProductHandler(manager);
    for (const product of products) {
      const categoryId = product.category ? catalog.categories.get(lower(product.category))?.id : undefined;
      const stocksOf = (quantity: number) => (branchId && quantity > 0 ? [{ branchId, quantity }] : undefined);
      if (product.kind === 'SIMPLE') {
        const [only] = product.variants;
        if (!only) continue;
        await simple.execute(new CreateSimpleProductCommand(tenantId, product.name, '', only.sku, only.barcode, only.purchasePrice, only.salePrice, only.wholesalePrice ?? undefined, categoryId, undefined, stocksOf(only.quantity)));
      } else {
        await variable.execute(
          new CreateVariableProductCommand(
            tenantId,
            product.name,
            '',
            product.variants.map((variant) => ({
              sku: variant.sku,
              barcode: variant.barcode || undefined,
              purchasePrice: variant.purchasePrice,
              salePrice: variant.salePrice,
              wholesalePrice: variant.wholesalePrice,
              attributeValues: variant.attributes.map(({ name, value }) => ({ attributeValueId: (catalog.attributes.get(lower(name))?.values.get(lower(value)) as AttributeValue).id })),
              stocks: stocksOf(variant.quantity),
            })),
            undefined,
            categoryId,
            product.baseSku,
          ),
        );
      }
    }
  }
}
