'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Check } from 'lucide-react';

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
import { comoParametroDeCuentas, type CuentaDeFinanzas } from '@/lib/finanzas-de-la-familia';

/**
 * Elegir qué cuentas de la familia se miran: una sola, o varias consolidadas.
 *
 * La selección vive en la **URL** (`?cuentas=a,b,c`) y no en un estado del
 * navegador, por dos cosas: la página es un componente de servidor, así que es
 * lo único que puede leer para consultar; y así un enlace a «las tres de
 * ventas» se puede guardar y compartir, igual que `?month=`.
 *
 * Quién lo ve lo decide el servidor (`resolverLasCuentasDeFinanzas`). Aquí solo
 * se pinta: si no llegan cuentas, no hay nada que elegir y no se pinta nada.
 */
export function SelectorDeCuentas({
    disponibles,
    elegidas,
}: {
    disponibles: CuentaDeFinanzas[];
    elegidas: string[];
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [abierto, setAbierto] = useState(false);

    const puestas = useMemo(() => new Set(elegidas), [elegidas]);

    if (disponibles.length === 0) return null;

    const irA = (ids: string[]) => {
        const params = new URLSearchParams(searchParams.toString());

        // Volver a la cuenta propia y sola es el estado de siempre, así que se
        // escribe quitando el parámetro en vez de repitiéndolo: la URL limpia
        // es la que ya funcionaba antes de que esto existiera.
        const soloLaPropia = ids.length === 1 && disponibles.find((c) => c.id === ids[0])?.esLaPropia;
        if (ids.length === 0 || soloLaPropia) params.delete('cuentas');
        else params.set('cuentas', comoParametroDeCuentas(ids));

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    };

    const alternar = (id: string) => {
        const siguiente = new Set(puestas);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);

        // Dejarlo sin ninguna no es un estado: se cae a la cuenta propia, que
        // es lo que la pantalla enseñaría de todas formas. Sin esto, quitar la
        // última casilla deja una pantalla vacía sin explicar por qué.
        const ids = disponibles.map((c) => c.id).filter((c) => siguiente.has(c));
        irA(ids);
    };

    const rotulo = () => {
        if (elegidas.length > 1) return `${elegidas.length} cuentas`;
        const unica = disponibles.find((c) => c.id === elegidas[0]);
        return unica?.nombre ?? 'Cuenta';
    };

    const consolidando = elegidas.length > 1;

    return (
        <DropdownMenu open={abierto} onOpenChange={setAbierto}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={`h-9 max-w-[16rem] shrink-0 justify-start gap-2 ${
                        consolidando ? 'border-blue-500 text-blue-600' : ''
                    }`}
                >
                    <Building2 className="h-4 w-4 shrink-0" />
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
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                                {cuenta.moneda}
                            </span>
                        </span>
                    </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => irA(disponibles.map((c) => c.id))} className="gap-2">
                    <Check className="h-4 w-4" />
                    Consolidar todas
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => irA([])} className="gap-2">
                    <Building2 className="h-4 w-4" />
                    Solo mi cuenta
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
