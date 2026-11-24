-- Conciliación de inventario: SOLO LECTURA (no modifica nada).
--
-- Uso:  psql -h <host> -U <usuario> -d <base> -X -f scripts/reconcile-inventory.sql
-- Cuándo: antes y después de aplicar migraciones en producción, y cada cierto tiempo.
--
-- Qué comprueba: que las fuentes de cantidades del inventario cuenten lo mismo (docs/estado.md, architecture_guide.md §6):
--   product_stocks.quantity        existencia por sucursal y variante (manda para "cuánto hay")
--   product_batches.remaining_*    capas FIFO (mandan para el costo y la valoración)
--   inventory_movements            historial (no se usa para calcular stock); cada línea nueva guarda `balance_after`
--   inventory_documents + counters cabeceras y numeración de las operaciones manuales
-- Resultado esperado: todas las cifras de «no cuadran» en 0. Si no, no corrijas con SQL a mano: investiga con el detalle
-- de la sección A y corrige con un conteo físico o un ajuste, para que quede historial.

SET default_transaction_read_only = on;

\echo
\echo '== A. Existencia contra capas FIFO (esperado: 0 y 0)'
\echo '   Con existencia > 0 la suma de capas debe ser igual. Con existencia <= 0 no debe quedar ninguna capa (la deuda de stock negativo no tiene capa).'
SELECT count(*)                                                                                  AS filas_revisadas,
       count(*) FILTER (WHERE s.quantity > 0 AND s.quantity <> COALESCE(l.remaining, 0))         AS positivas_que_no_cuadran,
       count(*) FILTER (WHERE s.quantity <= 0 AND COALESCE(l.remaining, 0) <> 0)                 AS nulas_o_negativas_con_capas
  FROM product_stocks s
  LEFT JOIN (SELECT branch_id, variant_id, SUM(remaining_quantity) AS remaining
               FROM product_batches GROUP BY branch_id, variant_id) l USING (branch_id, variant_id);

\echo
\echo '   Detalle de las que no cuadran (máx. 50):'
SELECT t.slug AS tienda, b.name AS sucursal, v.sku, s.quantity AS existencia, COALESCE(l.remaining, 0) AS suma_capas,
       to_char((SELECT max(m.created_at) FROM inventory_movements m
                 WHERE m.variant_id = s.variant_id AND (m.origin_branch_id = s.branch_id OR m.destination_branch_id = s.branch_id)), 'YYYY-MM-DD') AS ultimo_movimiento
  FROM product_stocks s
  JOIN product_variants v ON v.id = s.variant_id
  JOIN branches b ON b.id = s.branch_id
  JOIN tenants t ON t.id = b.tenant_id
  LEFT JOIN (SELECT branch_id, variant_id, SUM(remaining_quantity) AS remaining
               FROM product_batches GROUP BY branch_id, variant_id) l USING (branch_id, variant_id)
 WHERE (s.quantity > 0 AND s.quantity <> COALESCE(l.remaining, 0))
    OR (s.quantity <= 0 AND COALESCE(l.remaining, 0) <> 0)
 ORDER BY t.slug, v.sku
 LIMIT 50;

\echo
\echo '== B. Documentos de inventario (esperado: 0, 0 y 0)'
SELECT (SELECT count(*) FROM inventory_documents)                                                                       AS documentos,
       (SELECT count(*) FROM inventory_documents d
         WHERE NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.document_id = d.id))                             AS sin_lineas,
       (SELECT count(*) FROM inventory_movements m JOIN inventory_documents d ON d.id = m.document_id
         WHERE m.reason <> d.reason)                                                                                    AS linea_con_motivo_distinto_al_de_su_documento,
       (SELECT count(*) FROM batches b
         WHERE b.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_documents d WHERE d.id = b.document_id)) AS lotes_huerfanos;

\echo
\echo '== C. Contador de numeración contra el último número usado (esperado: contador = ultimo_usado en cada fila)'
SELECT t.slug AS tienda, c.prefix, c.last_number AS contador,
       COALESCE(MAX(substring(d.number FROM '[0-9]+$')::int), 0) AS ultimo_usado
  FROM inventory_document_counters c
  JOIN tenants t ON t.id = c.tenant_id
  LEFT JOIN inventory_documents d ON d.tenant_id = c.tenant_id AND d.number LIKE c.prefix || '-%'
 GROUP BY t.slug, c.tenant_id, c.prefix, c.last_number
HAVING c.last_number <> COALESCE(MAX(substring(d.number FROM '[0-9]+$')::int), 0);

\echo '   (sin filas = todos los contadores coinciden)'

\echo
\echo '== D. Para contexto: movimientos del kardex con y sin documento (los de venta, compra y devolución no llevan documento)'
SELECT COALESCE(d.kind, '(sin documento)') AS origen, count(*) AS movimientos
  FROM inventory_movements m
  LEFT JOIN inventory_documents d ON d.id = m.document_id
 GROUP BY 1 ORDER BY 2 DESC;

\echo
\echo '== E. Movimientos sin categoría (esperado: 0; solo los escribe una versión anterior de la API durante un despliegue)'
SELECT count(*) AS sin_categoria FROM inventory_movements WHERE category IS NULL;

\echo
\echo '== E2. Movimientos con una dirección que no es IN ni OUT (esperado: 0; la comprobación F los trataría como salidas)'
SELECT type AS tipo_invalido, count(*) AS movimientos FROM inventory_movements WHERE type NOT IN ('IN', 'OUT') GROUP BY type;
\echo '   (sin filas = todas las direcciones son válidas)'

\echo
\echo '== F. Saldo del kardex contra la existencia (esperado: ninguna fila)'
\echo '   Cada línea nueva guarda la existencia que quedó tras ella. Las líneas de una sucursal y variante forman una cadena (el saldo'
\echo '   anterior de cada una es el saldo de la que la precede), así que el saldo final de la cadena debe ser igual a la existencia.'
\echo '   Se compara sin ordenar por fecha (varias operaciones simultáneas no tienen un orden fiable por hora). Una cadena rota significa'
\echo '   que el stock cambió sin dejar movimiento o que falta una línea. Las líneas anteriores a esta versión no cuentan (saldo nulo).'
-- @begin drift
WITH lines AS (
  SELECT COALESCE(m.origin_branch_id, m.destination_branch_id) AS branch_id, m.variant_id,
         m.balance_after AS balance,
         m.balance_after - CASE m.type WHEN 'IN' THEN m.quantity ELSE -m.quantity END AS before
    FROM inventory_movements m
   WHERE m.balance_after IS NOT NULL
), ends AS (
  SELECT branch_id, variant_id, balance AS value, 1 AS weight FROM lines
  UNION ALL
  SELECT branch_id, variant_id, before AS value, -1 AS weight FROM lines
), unmatched AS (
  SELECT branch_id, variant_id, value, SUM(weight) AS net
    FROM ends GROUP BY branch_id, variant_id, value HAVING SUM(weight) <> 0
), chains AS (
  SELECT g.branch_id, g.variant_id,
         COALESCE(SUM(u.net) FILTER (WHERE u.net > 0), 0) AS finales,
         max(u.value) FILTER (WHERE u.net > 0)             AS saldo_final
    FROM (SELECT DISTINCT branch_id, variant_id FROM lines) g
    LEFT JOIN unmatched u USING (branch_id, variant_id)
   GROUP BY g.branch_id, g.variant_id
)
SELECT t.slug AS tienda, b.name AS sucursal, v.sku, s.quantity AS existencia, c.saldo_final,
       CASE WHEN c.finales > 1 THEN 'cadena rota (falta una línea o el stock cambió sin movimiento)'
            ELSE 'el saldo final no coincide con la existencia' END AS problema
  FROM chains c
  JOIN product_stocks s  ON s.branch_id = c.branch_id AND s.variant_id = c.variant_id
  JOIN product_variants v ON v.id = c.variant_id
  JOIN branches b         ON b.id = c.branch_id
  JOIN tenants t          ON t.id = b.tenant_id
 WHERE c.finales > 1
    OR (c.finales = 1 AND c.saldo_final <> s.quantity)
    OR (c.finales = 0 AND NOT EXISTS (SELECT 1 FROM lines l WHERE l.branch_id = c.branch_id AND l.variant_id = c.variant_id AND l.balance = s.quantity))
 ORDER BY t.slug, v.sku
 LIMIT 50
-- @end drift
;
