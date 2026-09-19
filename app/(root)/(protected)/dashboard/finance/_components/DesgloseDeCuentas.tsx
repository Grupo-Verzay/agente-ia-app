import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Consolidado } from '@/lib/finanzas-de-la-familia';

type Moneda = { code: string; symbol: string; decimals: number };

function moneyFormat(meta: Moneda | undefined, code: string, value: number) {
  const decimals = typeof meta?.decimals === 'number' ? meta.decimals : 2;

  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    const symbol = meta?.symbol ? `${meta.symbol} ` : '';
    return `${symbol}${value.toFixed(decimals)} ${code}`;
  }
}

/**
 * El total de lo consolidado y, debajo, lo que aporta cada cuenta.
 *
 * **Cada fila va en SU moneda**, no en la del total. Es lo que hace que el
 * desglose siga siendo cierto cuando las cuentas no comparten moneda y el total
 * no se puede calcular: ahí arriba no hay cifra, pero abajo cada cuenta dice lo
 * suyo sin mentir.
 */
export function DesgloseDeCuentas({
  consolidado,
  monthLabel,
  currencies,
}: {
  consolidado: Consolidado;
  monthLabel: string;
  currencies: Moneda[];
}) {
  const meta = (code: string) => currencies.find((c) => c.code === code);
  const dinero = (code: string, value: number) => moneyFormat(meta(code), code, value);

  return (
    <Card className="border-border">
      <CardHeader className="px-2 pb-1 pt-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Consolidado de {monthLabel}</CardTitle>
          <Badge variant="outline" className="h-5 shrink-0 px-2 text-[10px]">
            {consolidado.filas.length} cuentas
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-2 pt-0">
        {consolidado.total && consolidado.moneda ? (
          <div className="mb-2 grid grid-cols-3 overflow-hidden rounded-md border border-border">
            <div className="border-r border-border px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Ingresos</div>
              <div className="truncate text-sm font-semibold text-emerald-600">
                {dinero(consolidado.moneda, consolidado.total.ingresos)}
              </div>
            </div>
            <div className="border-r border-border px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Gastos</div>
              <div className="truncate text-sm font-semibold text-destructive">
                {dinero(consolidado.moneda, consolidado.total.gastos)}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Balance</div>
              <div
                className={`truncate text-sm font-semibold ${
                  consolidado.total.balance < 0 ? 'text-destructive' : ''
                }`}
              >
                {dinero(consolidado.moneda, consolidado.total.balance)}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-2 rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-900">
            {consolidado.sinTotalPorque}
          </div>
        )}

        {/* `table-fixed` con un ancho mínimo: el nombre de una cuenta es un token
            largo, y sin fijar el reparto se come las tres columnas de cifras. Por
            debajo de ese ancho la tabla se desplaza, que es preferible a recortar
            justo los números que se vienen a leer. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <th className="w-[13rem] px-2 py-1 text-left font-medium">Cuenta</th>
                <th className="w-[7rem] px-2 py-1 text-right font-medium">Ingresos</th>
                <th className="w-[7rem] px-2 py-1 text-right font-medium">Gastos</th>
                <th className="w-[7rem] px-2 py-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.filas.map((fila) => (
                <tr key={fila.cuentaId} className="border-b border-border last:border-b-0">
                  <td className="truncate px-2 py-1.5" title={fila.nombre}>
                    {fila.nombre}
                  </td>
                  <td className="truncate px-2 py-1.5 text-right tabular-nums">
                    {dinero(fila.moneda, fila.ingresos)}
                  </td>
                  <td className="truncate px-2 py-1.5 text-right tabular-nums">
                    {dinero(fila.moneda, fila.gastos)}
                  </td>
                  <td
                    className={`truncate px-2 py-1.5 text-right font-medium tabular-nums ${
                      fila.balance < 0 ? 'text-destructive' : ''
                    }`}
                  >
                    {dinero(fila.moneda, fila.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
