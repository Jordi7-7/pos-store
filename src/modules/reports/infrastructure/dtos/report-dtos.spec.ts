import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { GetReportDto } from './get-report.dto';
import { GetValuedInventoryDto } from './get-valued-inventory.dto';

const UUID = '3f2b8a52-1d4c-4c0e-9d57-6f1f4a1d2b10';

describe('DTOs de reportes (ValidationPipe global)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const query = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({ type: 'query', metatype });

  it('un branchId vacío, "null" o "undefined" se toma como sin filtro', async () => {
    for (const branchId of ['', 'null', 'undefined']) {
      await expect(pipe.transform({ branchId }, query(GetReportDto))).resolves.toMatchObject({ branchId: undefined });
      await expect(pipe.transform({ branchId }, query(GetValuedInventoryDto))).resolves.toMatchObject({ branchId: undefined });
    }
  });

  it('un branchId que no es UUID se rechaza con 400 en vez de llegar a la consulta', async () => {
    await expect(pipe.transform({ branchId: 'no-uuid' }, query(GetReportDto))).rejects.toThrow();
    await expect(pipe.transform({ branchId: "1' OR '1'='1" }, query(GetValuedInventoryDto))).rejects.toThrow();
    await expect(pipe.transform({ branchId: UUID }, query(GetReportDto))).resolves.toMatchObject({ branchId: UUID });
  });

  it('las fechas deben ser ISO 8601', async () => {
    await expect(pipe.transform({ startDate: 'ayer' }, query(GetReportDto))).rejects.toThrow();
    await expect(pipe.transform({ startDate: '2026-11-01', endDate: '2026-11-30' }, query(GetReportDto))).resolves.toBeDefined();
  });

  it('page y limit del inventario valuado son enteros positivos', async () => {
    await expect(pipe.transform({ page: '2', limit: '50' }, query(GetValuedInventoryDto))).resolves.toMatchObject({ page: 2, limit: 50 });
    await expect(pipe.transform({ page: '0' }, query(GetValuedInventoryDto))).rejects.toThrow();
    await expect(pipe.transform({ limit: 'abc' }, query(GetValuedInventoryDto))).rejects.toThrow();
  });
});
