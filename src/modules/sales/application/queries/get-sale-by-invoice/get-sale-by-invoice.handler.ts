import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetSaleByInvoiceQuery } from './get-sale-by-invoice.query';
import { Sale } from '../../../domain/entities/sale.entity';
import { Refund } from '../../../domain/entities/refund.entity';

@QueryHandler(GetSaleByInvoiceQuery)
export class GetSaleByInvoiceHandler implements IQueryHandler<GetSaleByInvoiceQuery> {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
  ) {}

  async execute(query: GetSaleByInvoiceQuery) {
    const { tenantId, invoiceNumber } = query;

    const sale = await this.saleRepo.findOne({
      where: { tenantId, invoiceNumber },
      relations: {
        items: {
          variant: {
            product: true,
            attributeValues: {
              attribute: true,
            },
          },
        },
        customer: true,
        branch: true,
        user: true,
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`No se encontró la venta con folio "${invoiceNumber}"`);
    }

    // Load all refunds for this sale to know already-refunded quantities per variant
    const existingRefunds = await this.refundRepo.find({
      where: { saleId: sale.id },
      relations: { items: { variant: { product: true } }, user: true },
      order: { createdAt: 'ASC' },
    });

    // Accumulate total refunded qty per variantId
    const refundedQtyByVariant: Record<string, number> = {};
    for (const refund of existingRefunds) {
      for (const ri of refund.items) {
        refundedQtyByVariant[ri.variantId] =
          (refundedQtyByVariant[ri.variantId] ?? 0) + Number(ri.quantity);
      }
    }

    // Map to a clean response the frontend can consume
    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      total: Number(sale.total),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      status: sale.status,
      branchId: sale.branchId,
      cashSessionId: sale.cashSessionId,
      createdAt: sale.createdAt,
      isFullyRefunded: sale.status === 'REFUNDED',
      branch: sale.branch
        ? { id: sale.branch.id, name: sale.branch.name, address: sale.branch.address }
        : null,
      user: sale.user ? { id: sale.user.id, name: sale.user.name } : null,
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        amount: Number(payment.amount),
      })),
      refunds: existingRefunds.map((refund) => ({
        id: refund.id,
        createdAt: refund.createdAt,
        reason: refund.reason,
        totalRefunded: Number(refund.totalRefunded),
        user: refund.user ? { id: refund.user.id, name: refund.user.name } : null,
        items: refund.items.map((item) => ({
          id: item.id,
          variantId: item.variantId,
          sku: item.variant?.sku ?? '',
          productName: item.variant?.product?.name ?? 'Producto',
          quantity: Number(item.quantity),
          priceRefunded: Number(item.priceRefunded),
        })),
      })),
      customer: sale.customer
        ? { id: sale.customer.id, name: sale.customer.name }
        : null,
      items: sale.items.map((item) => {
        const attrs = (item.variant?.attributeValues ?? [])
          .map((av) => `${av.attribute?.name ?? ''}: ${av.value}`)
          .join(' / ');

        const refundedQty = refundedQtyByVariant[item.variantId] ?? 0;
        const refundableQty = Math.max(0, Number(item.quantity) - refundedQty);

        return {
          saleItemId: item.id,
          variantId: item.variantId,
          productName: item.variant?.product?.name ?? 'Producto',
          sku: item.variant?.sku ?? '',
          attributes: attrs,
          quantity: Number(item.quantity),       // original qty sold
          refundedQty,                            // already refunded
          refundableQty,                          // remaining available to refund
          price: Number(item.price),
          cost: Number(item.cost),
          discountAmount: Number(item.discountAmount),
          lineTotal: Number(item.price) * Number(item.quantity) - Number(item.discountAmount),
        };
      }),
    };
  }
}

