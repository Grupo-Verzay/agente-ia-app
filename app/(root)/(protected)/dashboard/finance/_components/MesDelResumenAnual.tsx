import Link from 'next/link';

export type MesDelResumen = {
  key: string;
  label: string;
  sales: number;
  expenses: number;
  balance: number;
  active: boolean;
};

/**
 * El fondo del mes elegido en «Resumen anual por mes».
 *
 * Era `bg-sky-50` a secas: un celeste claro FIJO, que no cambia con el tema.
 * El número no lleva color propio —hereda el del texto de la tarjeta—, así que
 * en modo oscuro salía casi blanco sobre ese celeste casi blanco: medido, 1,02
 * de contraste, o sea que el valor del mes que se tiene delante no se veía. En
 * claro se veía bien y por eso no saltaba.
 *
 * En modo oscuro el fondo pasa a ser el mismo celeste en su tono oscuro
 * (`sky-950`): sigue siendo el que marca el mes elegido —distinto del de los
 * demás meses, con su anillo— y el número hereda el claro del tema encima. En
 * modo claro no cambia nada.
 */
export const FONDO_DEL_MES_ELEGIDO = 'bg-sky-50 ring-1 ring-inset ring-sky-400 dark:bg-sky-950';

/**
 * Un balance en negativo.
 *
 * `text-destructive` en modo oscuro es un rojo OSCURO (`--destructive` del
 * tema oscuro es el de los botones de borrar, que llevan texto blanco encima),
 * y sobre el fondo oscuro de la tarjeta se quedaba en 2 de contraste: el mes
 * en pérdidas era justo el que no se leía. En oscuro va el rojo claro; en
 * claro sigue siendo `text-destructive`, como siempre.
 */
export const CIFRA_NEGATIVA = 'text-destructive dark:text-red-400';

/**
 * Una casilla de la rejilla anual: el nombre del mes arriba y su balance
 * debajo, enlazando a ese mes. Los colores salen de las dos constantes de
 * arriba y de ningún otro sitio: con la clase escrita en la página otra vez,
 * el arreglo del modo oscuro vive en una copia y la otra se queda atrás.
 */
export function MesDelResumenAnual({
  mes,
  href,
  formato,
}: {
  mes: MesDelResumen;
  href: string;
  formato: (n: number) => string;
}) {
  return (
    <Link
      href={href}
      title={`Ingresos: ${formato(mes.sales)} | Gastos: ${formato(mes.expenses)}`}
      data-mes-del-resumen={mes.key}
      aria-current={mes.active ? 'date' : undefined}
      className={`min-h-[62px] overflow-hidden border-border transition hover:bg-muted/40 lg:border-r [&:nth-child(-n+6)]:border-b lg:[&:nth-child(6n)]:border-r-0 ${
        mes.active ? FONDO_DEL_MES_ELEGIDO : 'bg-background'
      }`}
    >
      <div className="flex h-7 items-center justify-center bg-slate-950 px-2 text-xs font-semibold uppercase text-white">
        {mes.label}
      </div>
      <div className="flex h-9 items-center justify-center px-2 text-center">
        <span className={`text-sm font-semibold leading-none ${mes.balance < 0 ? CIFRA_NEGATIVA : ''}`}>
          {formato(mes.balance)}
        </span>
      </div>
    </Link>
  );
}
