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

        const originalQty = Number(item.quantity || 0);
        const refundedQty = Number(item.refundedQuantity || 0);
        const refundableQty = Math.max(0, originalQty - refundedQty);
        const unitPrice = Number(item.price || 0);
        const fallbackSubtotal = unitPrice * originalQty;
        const lineDiscount = Number(item.discountAmount || 0);
        const globalDiscount = Number(item.globalDiscountAmount || 0);
        const fallbackTotal = Math.max(0, fallbackSubtotal - lineDiscount - globalDiscount);

        return {
          saleItemId: item.id,
          variantId: item.variantId,
          productName: item.variant?.product?.name ?? 'Producto',
          sku: item.variant?.sku ?? '',
          attributes: attrs,
          quantity: originalQty,
          refundedQty,
          refundableQty,
          price: unitPrice,
          cost: Number(item.cost || 0),
          discountAmount: lineDiscount,
          globalDiscountAmount: globalDiscount,
          subtotal: Number(item.subtotal ?? fallbackSubtotal),
          lineTotal: Number(item.total ?? fallbackTotal),
        };
      }),
    };
  }
}

