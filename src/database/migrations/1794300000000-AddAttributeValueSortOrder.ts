import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Orden propio de las opciones de un atributo (S, M, L, XL…). Hasta ahora no tenían ninguno: la lista salía como la
 * devolviera la base. La columna se rellena con el orden de creación dentro de cada atributo, así que a nadie le cambia
 * lo que ve. Solo añade una columna; los datos existentes no se modifican salvo ese valor.
 */
export class AddAttributeValueSortOrder1794300000000 implements MigrationInterface {
  name = 'AddAttributeValueSortOrder1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attribute_values" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(
      `UPDATE "attribute_values" AS v
          SET "sort_order" = ranked.position
         FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "attribute_id" ORDER BY "created_at", "id") AS position FROM "attribute_values") AS ranked
        WHERE v."id" = ranked."id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attribute_values" DROP COLUMN IF EXISTS "sort_order"`);
  }
}
