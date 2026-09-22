'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Check, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    comoParametroDeCuentas,
    estaConsolidando,
    laMonedaDeLaSeleccion,
    lasCuentasElegidas,
    type CuentaDeFinanzas,
} from '@/lib/finanzas-de-la-familia';

/**
 * Elegir qué cuentas de la familia se miran: una sola, o varias consolidadas.
 *
 * Vivía en `dashboard/finance/_components/`, o sea dentro de la pantalla del
 * resumen. Al extenderlo a Ventas, Gastos, Clientes y Proveedores **se mudó
 * aquí en vez de copiarse**: con cinco copias, el día que se afine dónde vive
 * la selección o cómo se lee el rótulo se afina en una y las otras cuatro se
 * quedan atrás — y eso no se ve como un error, se ve como que «en Gastos el
 * selector a veces no hace lo mismo».
 *
 * La selección vive en la **URL** (`?cuentas=a,b,c`) y no en un estado del
 * navegador, por dos cosas: las cinco páginas son componentes de servidor, así
 * que es lo único que pueden leer para consultar; y así un enlace a «las tres
 * de ventas» se puede guardar y compartir, igual que `?month=`.
 *
 * Quién lo ve lo decide el servidor (`resolverLasCuentasDeFinanzas`, y en el CRM
 * `resolverLasCuentasDelCrm`): manda en su cuenta, es la MADRE de su familia, y
 * la familia tiene más de una cuenta. Una cuenta hija recibe la lista vacía y
 * aquí no se pinta nada.
 *
 * # Y `porDefecto` es lo único que cambia entre Finanzas y el CRM
 *
 * | | sin parámetro en la URL |
 * | --- | --- |
 * | Finanzas (`propia`) | solo la cuenta propia: consolidar es una elección |
 * | CRM (`todas`) | TODAS las de la familia: la vista unificada es el punto de partida |
 *
 * De ahí sale lo que este componente hace distinto, y es **una sola cosa**:
 * **cuál es el estado que se escribe quitando el parámetro**. La URL limpia
 * tiene que ser la que ya funcionaba, así que en Finanzas se limpia al volver a
 * la cuenta propia y en el CRM al volver a todas — o sea que allí el parámetro
 * se escribe para AMPLIAR y aquí para REDUCIR.
 *
 * Y `conMoneda` apaga la columna de moneda y su aviso de mezcla: en el CRM no
 * se suma dinero por ningún lado, así que un triángulo ámbar diciendo que esas
 * cifras no se pueden sumar hablaría de una suma que no existe.
 */
export function SelectorDeCuentas({
    disponibles,
    elegidas,
    porDefecto = 'propia',
    conMoneda = true,
}: {
    disponibles: CuentaDeFinanzas[];
    elegidas: string[];
    porDefecto?: 'propia' | 'todas';
    conMoneda?: boolean;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [abierto, setAbierto] = useState(false);

    const puestas = useMemo(() => new Set(elegidas), [elegidas]);

    /**
     * El aviso de monedas, con la MISMA función que decide si el resumen puede
     * sumar. Aquí no hay ningún total que esconder —una lista enseña cada fila
     * en su moneda, que es cierta— así que lo que se hace es **decirlo donde se
     * elige**: quien marca dos cuentas que no comparten moneda ve por qué esas
     * cifras no se van a sumar en ninguna parte.
     */
    const mezcla = useMemo(() => {
        if (!conMoneda) return null;
        const puestas = lasCuentasElegidas(disponibles, elegidas);
        if (!estaConsolidando(elegidas)) return null;
        return laMonedaDeLaSeleccion(puestas).motivo;
    }, [conMoneda, disponibles, elegidas]);

    if (disponibles.length === 0) return null;

    const irA = (ids: string[]) => {
        const params = new URLSearchParams(searchParams.toString());

        // Volver al estado de siempre se escribe QUITANDO el parámetro, no
        // repitiéndolo: la URL limpia es la que ya funcionaba antes de que esto
        // existiera. Y cuál es ese estado lo dice `porDefecto` — en Finanzas la
        // cuenta propia y sola, en el CRM la familia entera.
        const soloLaPropia = ids.length === 1 && disponibles.find((c) => c.id === ids[0])?.esLaPropia;
        const yaEsElPorDefecto =
            porDefecto === 'todas' ? ids.length === disponibles.length : soloLaPropia;
        if (ids.length === 0 || yaEsElPorDefecto) params.delete('cuentas');
        else params.set('cuentas', comoParametroDeCuentas(ids));

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    };

    const alternar = (id: string) => {
        const siguiente = new Set(puestas);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);

        // Dejarlo sin ninguna no es un estado: se cae al de por defecto, que es
        // lo que la pantalla enseñaría de todas formas. Sin esto, quitar la
        // última casilla deja una pantalla vacía sin explicar por qué.
        const ids = disponibles.map((c) => c.id).filter((c) => siguiente.has(c));
        irA(ids);
    };

    const rotulo = () => {
        // Con la familia entera puesta el rótulo lo dice con palabras y no con
        // un número: «5 cuentas» se lee como un filtro puesto, y en el CRM eso
        // es el estado de siempre.
        if (porDefecto === 'todas' && elegidas.length === disponibles.length) {
            return 'Todas las cuentas';
        }
        if (elegidas.length > 1) return `${elegidas.length} cuentas`;
        const unica = disponibles.find((c) => c.id === elegidas[0]);
        return unica?.nombre ?? 'Cuenta';
    };

    const consolidandoDeVerdad =
        porDefecto === 'todas'
            ? elegidas.length !== disponibles.length
            : estaConsolidando(elegidas);

    return (
        <DropdownMenu open={abierto} onOpenChange={setAbierto}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    // Ámbar por encima de azul: con monedas mezcladas lo que hay
                    // que decir no es «estás consolidando», es «esto no se suma».
                    className={`h-10 max-w-[16rem] shrink-0 justify-start gap-2 ${
                        mezcla
                            ? 'border-amber-500 text-amber-700'
                            : consolidandoDeVerdad
                              ? 'border-blue-500 text-blue-600'
                              : ''
                    }`}
                    title={mezcla ?? undefined}
                >
                    {mezcla ? (
                        <TriangleAlert className="h-4 w-4 shrink-0" />
                    ) : (
                        <Building2 className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{rotulo()}</span>
                </Button>
            </DropdownMenuTrigger>

            {/* La lista crece con la familia, así que lleva su propio scroll
                acotado al hueco de verdad y no a `vh` — con el botón abajo, un
                `70vh` a secas abre un menú que se sale por arriba. */}
            <DropdownMenuContent
                align="start"
                className="w-72 overflow-y-auto"
                style={{ maxHeight: 'min(70vh, var(--radix-dropdown-menu-content-available-height))' }}
            >
                <DropdownMenuLabel>Cuentas de la familia</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {disponibles.map((cuenta) => (
                    <DropdownMenuCheckboxItem
                        key={cuenta.id}
                        checked={puestas.has(cuenta.id)}
                        // El menú NO se cierra al marcar: consolidar es elegir
                        // varias, y cerrarse en la primera obliga a reabrirlo
                        // una vez por cuenta.
                        onSelect={(event) => {
                            event.preventDefault();
                            alternar(cuenta.id);
                        }}
                    >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate" title={cuenta.nombre}>
                                {cuenta.nombre}
                            </span>
                            {conMoneda && (
                                <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                                    {cuenta.moneda}
                                </span>
                            )}
                        </span>
                    </DropdownMenuCheckboxItem>
                ))}

                {mezcla && (
                    <>
                        <DropdownMenuSeparator />
                        <p className="px-2 py-1.5 text-[11px] leading-snug text-amber-700">{mezcla}</p>
                    </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => irA(disponibles.map((c) => c.id))} className="gap-2">
                    <Check className="h-4 w-4" />
                    {porDefecto === 'todas' ? 'Todas las cuentas' : 'Consolidar todas'}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => irA(disponibles.filter((c) => c.esLaPropia).map((c) => c.id))}
                    className="gap-2"
                >
                    <Building2 className="h-4 w-4" />
                    Solo mi cuenta
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
