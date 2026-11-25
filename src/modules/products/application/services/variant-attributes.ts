import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { findVariantAttributeProblem } from '../../domain/variant-attributes';

/** Lanza si las variantes (cada una con el atributo de cada uno de sus valores) mezclan atributos o repiten uno. */
export function assertVariantAttributesAreConsistent(attributeIdsPerVariant: readonly (readonly string[])[]): void {
  const problem = findVariantAttributeProblem(attributeIdsPerVariant);
  if (!problem) return;
  if (problem === 'REPEATED') {
    throw new AppException(
      ErrorCode.VariantAttributesInconsistent,
      'Una variante no puede tener dos valores del mismo atributo (por ejemplo, dos tallas).',
      HttpStatus.BAD_REQUEST,
      { problem },
    );
  }
  throw new AppException(
    ErrorCode.VariantAttributesInconsistent,
    'Todas las variantes de un producto deben usar los mismos atributos (por ejemplo, todas con talla y color).',
    HttpStatus.BAD_REQUEST,
    { problem },
  );
}
