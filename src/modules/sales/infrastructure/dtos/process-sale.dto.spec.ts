import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ProcessSaleDto } from './process-sale.dto';

const UUID = '3f2b8a52-1d4c-4c0e-9d57-6f1f4a1d2b10';

const validBody = () => ({
  branchId: UUID,
  cashSessionId: UUID,
  items: [{ variantId: UUID, quantity: 2, price: 15.299999999999999 }],
  payments: [{ paymentMethod: 'EFECTIVO', amount: 30.6 }],
});

describe('ProcessSaleDto (ValidationPipe global)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata: ArgumentMetadata = { type: 'body', metatype: ProcessSaleDto };
  const reject = (body: unknown) => expect(pipe.transform(body, metadata)).rejects.toThrow();

  it('acepta una venta válida (incluye decimales con artefactos de coma flotante)', async () => {
    await expect(pipe.transform(validBody(), metadata)).resolves.toBeDefined();
  });

  it('rechaza cantidades 0 o negativas', async () => {
    const zero = validBody();
    zero.items[0].quantity = 0;
    await reject(zero);

    const negative = validBody();
    negative.items[0].quantity = -3;
    await reject(negative);
  });

  it('rechaza precios y pagos negativos o en cero', async () => {
    const price = validBody();
    price.items[0].price = -1;
    await reject(price);

    const payment = validBody();
    payment.payments[0].amount = 0;
    await reject(payment);
  });

  it('rechaza una tasa de descuento fuera de 0–100', async () => {
    await reject({ ...validBody(), discountRate: 150 });
    await reject({ ...validBody(), discountRate: -5 });
  });

  it('rechaza listas vacías y demasiados productos', async () => {
    await reject({ ...validBody(), items: [] });
    await reject({ ...validBody(), payments: [] });
    await reject({ ...validBody(), items: Array.from({ length: 201 }, () => validBody().items[0]) });
  });

  it('rechaza ids que no son UUID', async () => {
    await reject({ ...validBody(), branchId: 'no-uuid' });
  });
});
