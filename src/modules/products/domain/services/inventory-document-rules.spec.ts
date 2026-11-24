import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { formatDocumentNumber, hasValidComment, isCommentRequired, isManualReason, mergeDocumentLines, permissionForDocumentKind, sameTotals, totalsByVariant } from './inventory-document-rules';

describe('isManualReason', () => {
  it('acepta los motivos propios del tipo y rechaza el ajuste heredado', () => {
    expect(isManualReason(InventoryDocumentKind.COUNT, 'CONTEO_FISICO')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.TRANSFER, 'TRASLADO')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.COUNT, 'ADJUSTMENT')).toBe(false);
    expect(isManualReason(InventoryDocumentKind.TRANSFER, 'ADJUSTMENT')).toBe(false);
    expect(isManualReason(InventoryDocumentKind.COUNT, 'MERMA')).toBe(false);
  });
});

describe('totalsByVariant y sameTotals', () => {
  it('suma la misma variante repetida y compara sin importar el orden', () => {
    const totals = totalsByVariant([
      { variantId: 'b', quantity: 0.1 },
      { variantId: 'a', quantity: 2 },
      { variantId: 'b', quantity: 0.2 },
    ]);
    expect(totals.get('b')).toBe(0.3);
    expect(sameTotals(totals, new Map([['a', 2], ['b', 0.3]]))).toBe(true);
  });

  it('distingue cantidades distintas y variantes de más o de menos', () => {
    const base = new Map([['a', 1]]);
    expect(sameTotals(base, new Map([['a', 2]]))).toBe(false);
    expect(sameTotals(base, new Map([['a', 1], ['b', 1]]))).toBe(false);
    expect(sameTotals(base, new Map([['b', 1]]))).toBe(false);
  });
});

describe('permissionForDocumentKind', () => {
  it('la entrada pide el permiso de entradas y la salida el de salidas, nunca al revés', () => {
    expect(permissionForDocumentKind(InventoryDocumentKind.ENTRY)).toBe(APP_PERMISSIONS.PRODUCTS_STOCK_ENTRY);
    expect(permissionForDocumentKind(InventoryDocumentKind.EXIT)).toBe(APP_PERMISSIONS.PRODUCTS_STOCK_EXIT);
  });
});

describe('motivos que el usuario puede elegir', () => {
  it('cada tipo acepta solo sus motivos', () => {
    expect(isManualReason(InventoryDocumentKind.EXIT, 'MERMA')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.EXIT, 'DONACION')).toBe(false);
    expect(isManualReason(InventoryDocumentKind.ENTRY, 'DONACION')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.ENTRY, 'MERMA')).toBe(false);
  });

  it('OTRO vale en entradas y en salidas', () => {
    expect(isManualReason(InventoryDocumentKind.ENTRY, 'OTRO')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.EXIT, 'OTRO')).toBe(true);
  });

  it('un motivo de venta o compra no se puede poner a mano', () => {
    for (const reason of ['VENTA', 'COMPRA', 'DEVOLUCION', 'ANULACION_COMPRA', 'INITIAL_STOCK', 'ADJUSTMENT', '']) {
      expect(isManualReason(InventoryDocumentKind.ENTRY, reason)).toBe(false);
      expect(isManualReason(InventoryDocumentKind.EXIT, reason)).toBe(false);
    }
  });

  it('los motivos antiguos ya no se pueden elegir, aunque sigan existiendo para mostrar el historial', () => {
    for (const reason of ['CADUCIDAD', 'OTRO_INGRESO', 'OTRO_EGRESO', 'OTRO_TRASLADO', 'REPOSICION', 'BALANCEO', 'CORRECCION']) {
      for (const kind of Object.values(InventoryDocumentKind)) expect(isManualReason(kind, reason)).toBe(false);
    }
  });

  it('el conteo y el traslado tienen un único motivo, que pone el sistema', () => {
    expect(isManualReason(InventoryDocumentKind.COUNT, 'CONTEO_FISICO')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.TRANSFER, 'TRASLADO')).toBe(true);
    expect(isManualReason(InventoryDocumentKind.TRANSFER, 'MERMA')).toBe(false);
    expect(isManualReason(InventoryDocumentKind.ENTRY, 'TRASLADO')).toBe(false);
  });
});

describe('comentario obligatorio', () => {
  it('toda salida manual y todo OTRO lo exigen; el resto no', () => {
    for (const reason of ['MERMA', 'PERDIDA', 'USO_INTERNO', 'DEVOLUCION_PROVEEDOR', 'OTRO']) expect(isCommentRequired(InventoryDocumentKind.EXIT, reason)).toBe(true);
    expect(isCommentRequired(InventoryDocumentKind.ENTRY, 'OTRO')).toBe(true);
    expect(isCommentRequired(InventoryDocumentKind.ENTRY, 'DONACION')).toBe(false);
    expect(isCommentRequired(InventoryDocumentKind.ENTRY, 'PRODUCCION')).toBe(false);
    expect(isCommentRequired(InventoryDocumentKind.COUNT, 'CONTEO_FISICO')).toBe(false);
    expect(isCommentRequired(InventoryDocumentKind.TRANSFER, 'TRASLADO')).toBe(false);
  });

  it('un comentario válido tiene al menos 4 caracteres sin contar espacios de los lados', () => {
    expect(hasValidComment(undefined)).toBe(false);
    expect(hasValidComment(null)).toBe(false);
    expect(hasValidComment('   .  ')).toBe(false);
    expect(hasValidComment('ok')).toBe(false);
    expect(hasValidComment('abc')).toBe(false);
    expect(hasValidComment('  roto  ')).toBe(true);
    expect(hasValidComment('robo')).toBe(true);
  });
});

describe('formatDocumentNumber', () => {
  it('rellena a seis cifras', () => {
    expect(formatDocumentNumber('ENT', 43)).toBe('ENT-000043');
    expect(formatDocumentNumber('SAL', 1234567)).toBe('SAL-1234567');
  });
});

describe('mergeDocumentLines', () => {
  it('suma la misma variante repetida con exactitud decimal', () => {
    expect(mergeDocumentLines([{ variantId: 'a', quantity: 0.1 }, { variantId: 'a', quantity: 0.2 }])).toEqual([{ variantId: 'a', quantity: 0.3 }]);
  });

  it('costos distintos de la misma variante son líneas separadas', () => {
    const merged = mergeDocumentLines([
      { variantId: 'a', quantity: 1, unitCost: 5 },
      { variantId: 'a', quantity: 2, unitCost: 7 },
      { variantId: 'a', quantity: 3, unitCost: 5 },
    ]);

    expect(merged).toEqual([{ variantId: 'a', quantity: 4, unitCost: 5 }, { variantId: 'a', quantity: 2, unitCost: 7 }]);
  });

  it('ordena por variante, el orden fijo de bloqueo, y no modifica la entrada', () => {
    const input = [{ variantId: 'b', quantity: 1 }, { variantId: 'a', quantity: 1 }];

    expect(mergeDocumentLines(input).map((line) => line.variantId)).toEqual(['a', 'b']);
    expect(input.map((line) => line.variantId)).toEqual(['b', 'a']);
  });
});
