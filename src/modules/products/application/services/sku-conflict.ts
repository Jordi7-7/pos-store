import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../common/errors/database-errors';
import { PRODUCT_VARIANT_SKU_INDEX } from '../../domain/entities/product-variant.entity';

/**
 * Ejecuta una operación que escribe variantes y traduce la violación del índice único de SKU a
 * SKU_TAKEN. La comprobación previa de SKU no basta: dos peticiones simultáneas pueden pasarla a la
 * vez y solo la base de datos las serializa.
 */
export async function translatingSkuConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, PRODUCT_VARIANT_SKU_INDEX)) {
      throw new AppException(ErrorCode.SkuTaken, 'El SKU ya está registrado en el sistema.', HttpStatus.CONFLICT);
    }
    throw error;
  }
}
