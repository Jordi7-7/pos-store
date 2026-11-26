import { MigrationInterface, QueryRunner } from 'typeorm';

interface Rule {
  table: string;
  /** Columnas que identifican un duplicado, sin distinguir mayúsculas en el texto. */
  columns: string[];
  index: string;
  /** Cómo se llama lo que se repite, para el mensaje. */
  what: string;
}

const RULES: Rule[] = [
  { table: 'categories', columns: ['tenant_id', 'name'], index: 'UQ_categories_tenant_name', what: 'categorías' },
  { table: 'attributes', columns: ['tenant_id', 'name'], index: 'UQ_attributes_tenant_name', what: 'atributos' },
  { table: 'roles', columns: ['tenant_id', 'name'], index: 'UQ_roles_tenant_name', what: 'roles' },
  { table: 'attribute_values', columns: ['attribute_id', 'value'], index: 'UQ_attribute_values_attribute_value', what: 'opciones de atributo' },
];

/**
 * Nombre único entre categorías, atributos, opciones de un atributo y roles (entre los no eliminados). Hasta ahora solo lo comprobaba
 * el código antes de insertar, así que dos peticiones a la vez (doble clic, dos terminales) podían crear el mismo nombre dos
 * veces. La regla es la misma que ya aplicaba el código: el nombre exacto, sin tocar mayúsculas. Si ya hay repetidos se
 * detiene con un mensaje claro, sin borrar ni fusionar nada: hay que resolverlos a mano y reintentar.
 */
export class AddUniqueCatalogNames1794400000000 implements MigrationInterface {
  name = 'AddUniqueCatalogNames1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const rule of RULES) {
      const columns = rule.columns.map((column) => `"${column}"`).join(', ');
      const duplicates: Array<Record<string, string>> = await queryRunner.query(
        `SELECT ${columns}, COUNT(*) AS total FROM "${rule.table}" WHERE "deleted_at" IS NULL GROUP BY ${columns} HAVING COUNT(*) > 1`,
      );
      if (duplicates.length > 0) {
        const sample = duplicates
          .slice(0, 5)
          .map((row) => `"${row[rule.columns[1] as string]}" (x${row.total})`)
          .join('; ');
        throw new Error(`Hay ${duplicates.length} nombres repetidos entre ${rule.what}; resuélvelos antes de migrar. Ejemplos: ${sample}`);
      }
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${rule.index}" ON "${rule.table}" (${columns}) WHERE "deleted_at" IS NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const rule of RULES) await queryRunner.query(`DROP INDEX IF EXISTS "${rule.index}"`);
  }
}
