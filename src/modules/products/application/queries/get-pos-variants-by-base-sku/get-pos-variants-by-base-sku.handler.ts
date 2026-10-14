import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPosVariantsByBaseSkuQuery } from './get-pos-variants-by-base-sku.query';
import { Product } from '../../../domain/entities/product.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';

export interface PosVariableProductOptionValue {
  id: string;
  value: string;
}

export interface PosVariableProductAttribute {
  id: string;
  name: string;
  values: PosVariableProductOptionValue[];
}

export interface PosVariableProductResponse {
  productId: string;
  productName: string;
  productType: ProductType;
  baseSku: string | null;
  description?: string;
  imageUrl?: string | null;
  attributes: PosVariableProductAttribute[];
  variants: Array<{
    id: string;
    sku: string;
    barcode: string;
    purchasePrice: number;
    salePrice: number;
    wholesalePrice: number | null;
    stock: number;
    imageUrl?: string | null;
    attributes: Array<{
      name: string;
      value: string;
    }>;
    attributeValues: Array<{
      attributeId: string;
      attributeName: string;
      valueId: string;
      valueName: string;
    }>;
  }>;
}

@QueryHandler(GetPosVariantsByBaseSkuQuery)
export class GetPosVariantsByBaseSkuHandler implements IQueryHandler<GetPosVariantsByBaseSkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosVariantsByBaseSkuQuery): Promise<PosVariableProductResponse | null> {
    const { tenantId, baseSku, branchId } = query;
    const searchString = baseSku.trim();
    const productRepo = this.entityManager.getRepository(Product);

    // Indexed lookup on (tenant_id, base_sku)
    const product = await productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'productImage')
      .innerJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('variant.images', 'variantImage')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValue')
      .leftJoinAndSelect('attributeValue.attribute', 'attribute')
      .leftJoinAndSelect('variant.stocks', 'stock', 'stock.branchId = :branchId', { branchId })
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('product.baseSku = :searchString', { searchString })
      .andWhere('product.type = :productType', { productType: ProductType.VARIABLE })
      .getOne();

    if (!product || !product.variants || product.variants.length === 0) {
      return null;
    }

    // Build unique dynamic attributes list from variants
    const attributesMap = new Map<string, { id: string; name: string; valuesMap: Map<string, string> }>();

    const mappedVariants = product.variants.map((variant) => {
      const branchStock = variant.stocks ? variant.stocks.find((s) => s.branchId === branchId) : null;
      const stockQuantity = branchStock ? Number(branchStock.quantity) : 0;
      const variantImage = variant.images && variant.images.length > 0 ? variant.images[0].url : null;

      const variantAttributes = (variant.attributeValues || []).map((av) => {
        const attrId = av.attribute?.id || av.attributeId;
        const attrName = av.attribute?.name || 'Atributo';
        const valId = av.id;
        const valName = av.value;

        if (attrId) {
          if (!attributesMap.has(attrId)) {
            attributesMap.set(attrId, {
              id: attrId,
              name: attrName,
              valuesMap: new Map(),
            });
          }
          if (valId && valName) {
            attributesMap.get(attrId)!.valuesMap.set(valId, valName);
          }
        }

        return {
          attributeId: attrId,
          attributeName: attrName,
          valueId: valId,
          valueName: valName,
        };
      });

      return {
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        purchasePrice: variant.purchasePrice,
        salePrice: variant.salePrice,
        wholesalePrice: variant.wholesalePrice !== null ? Number(variant.wholesalePrice) : null,
        stock: stockQuantity,
        imageUrl: variantImage || (product.images && product.images.length > 0 ? product.images[0].url : null),
        attributes: variantAttributes.map((va) => ({
          name: va.attributeName,
          value: va.valueName,
        })),
        attributeValues: variantAttributes,
      };
    });

    const attributes: PosVariableProductAttribute[] = Array.from(attributesMap.values()).map((attr) => ({
      id: attr.id,
      name: attr.name,
      values: Array.from(attr.valuesMap.entries()).map(([id, value]) => ({ id, value })),
    }));

    const primaryImage =
      (product.images && product.images.length > 0 ? product.images[0].url : null) ||
      (mappedVariants.find((v) => v.imageUrl)?.imageUrl || null);

    return {
      productId: product.id,
      productName: product.name,
      productType: product.type,
      baseSku: product.baseSku,
      description: product.description,
      imageUrl: primaryImage,
      attributes,
      variants: mappedVariants,
    };
  }
}
