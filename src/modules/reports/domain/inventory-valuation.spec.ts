import { valueStock } from './inventory-valuation';

describe('valueStock', () => {
  it('valora con el costo de cada lote y da el costo medio por unidad', () => {
    // 10 a 4 y 10 a 6
    expect(valueStock({ quantity: 20, layersQuantity: 20, layersValue: 100, currentCost: 99 })).toEqual({ totalValue: 100, unitCost: 5 });
  });

  it('lo vendido ya no cuenta: solo el valor de las unidades que quedan en sus lotes', () => {
    // De 10 a 4 y 10 a 6 se vendieron 12 en orden FIFO: quedan 8 a 6
    expect(valueStock({ quantity: 8, layersQuantity: 8, layersValue: 48, currentCost: 5 })).toEqual({ totalValue: 48, unitCost: 6 });
  });

  it('las unidades sin lote se valoran al costo vigente', () => {
    // 6 en lotes a 4 (24) y 4 sin lote al costo vigente de 9 (36)
    expect(valueStock({ quantity: 10, layersQuantity: 6, layersValue: 24, currentCost: 9 })).toEqual({ totalValue: 60, unitCost: 6 });
    expect(valueStock({ quantity: 5, layersQuantity: 0, layersValue: 0, currentCost: 4 })).toEqual({ totalValue: 20, unitCost: 4 });
  });

  it('una venta sin stock (cantidad negativa) resta a su costo vigente', () => {
    expect(valueStock({ quantity: -3, layersQuantity: 0, layersValue: 0, currentCost: 4 })).toEqual({ totalValue: -12, unitCost: 4 });
    expect(valueStock({ quantity: 0, layersQuantity: 0, layersValue: 0, currentCost: 4 })).toEqual({ totalValue: 0, unitCost: 4 });
  });

  it('si los lotes suman más que el stock (otra sucursal en el filtro) no valora de más', () => {
    // El stock de la sucursal es 5 pero los lotes de la variante suman 8: se valora lo que hay
    expect(valueStock({ quantity: 5, layersQuantity: 8, layersValue: 40, currentCost: 5 }).unitCost).toBe(5);
  });

  it('redondea a centavos', () => {
    expect(valueStock({ quantity: 3, layersQuantity: 3, layersValue: 1, currentCost: 0 })).toEqual({ totalValue: 1, unitCost: 0.33 });
  });
});
