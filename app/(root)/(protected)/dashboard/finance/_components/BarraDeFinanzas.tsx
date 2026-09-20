'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusCircle, Search, Trash2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { SelectorDeCuentas } from '@/components/shared/SelectorDeCuentas';
import type { CuentaDeFinanzas } from '@/lib/finanzas-de-la-familia';

import { VaciarContabilidad } from './VaciarContabilidad';

/**
 * La barra de `/dashboard/finance`, que se había escapado del barrido.
 *
 * # Qué había
 *
 * Tres mandos en tres sitios distintos: el **botón azul** metido en la esquina
 * de la fila de pestañas, el **selector de cuentas** suelto en su propia línea
 * a la izquierda, y **«Vaciar contabilidad»** como un enlace gris al final de
 * la página. Ningún buscador. Puesta al lado de cualquier otra pantalla, esta
 * no se parecía a ninguna.
 *
 * Ahora es la fila de siempre: buscador fijo a la izquierda, el selector en el
 * carril, y el azul con el `⋯` pegados al borde derecho.
 *
 * # El buscador NAVEGA, y eso es a propósito
 *
 * Esta pantalla no tiene una lista debajo: tiene el resumen anual y la gráfica.
 * Un buscador que filtrara «lo de abajo» aquí no tendría qué filtrar, y **un
 * mando que no hace nada es peor que no tenerlo** — es lo que enseña a no
 * pulsar los demás.
 *
 * Lo que sí se busca desde aquí es un **movimiento**: una venta por su
 * concepto. Así que la caja lleva a Ventas con ese texto ya puesto en su
 * buscador (`?q=`), que es adonde iba a ir quien lo teclea. Aterriza filtrado,
 * no en la lista entera: un buscador que te deja en un sitio donde hay que
 * volver a buscar no ha buscado nada.
 *
 * Y busca sobre **todas** las ventas, no sobre el mes que se estaba mirando:
 * Ventas abre en su pestaña «todas» (`tab` nace en `'total'`), así que una
 * venta de marzo se encuentra aunque se buscara desde diciembre. Acotarlo al
 * mes daría «sin resultados» sobre algo que sí existe, que es la peor respuesta
 * posible de un buscador. El mes viaja igual, para que el selector de mes de
 * esa pantalla siga diciendo de dónde se venía.
 */
export function BarraDeFinanzas({
    disponibles,
    elegidas,
    puedeElegir,
    monthValue,
    accountLabel,
}: {
    disponibles: CuentaDeFinanzas[];
    elegidas: string[];
    puedeElegir: boolean;
    monthValue: string;
    accountLabel?: string | null;
}) {
    const router = useRouter();
    const [texto, setTexto] = useState('');
    const [vaciando, setVaciando] = useState(false);

    const buscar = () => {
        const limpio = texto.trim();
        if (!limpio) return;
        router.push(`/dashboard/finance/sales?month=${monthValue}&q=${encodeURIComponent(limpio)}`);
    };

    return (
        <>
            <BarraDeAcciones
                buscador={
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={texto}
                            onChange={(evento) => setTexto(evento.target.value)}
                            // Enter y nada más: es el gesto de cualquier buscador
                            // que lleva a otra pantalla, y sin él habría que
                            // añadir un botón de lupa que gasta el ancho que esta
                            // fila no tiene.
                            onKeyDown={(evento) => {
                                if (evento.key === 'Enter') buscar();
                            }}
                            placeholder="Buscar una venta..."
                            className="h-10 w-56 shrink-0 pl-8 sm:w-72"
                        />
                    </div>
                }
                filtros={
                    puedeElegir ? (
                        <SelectorDeCuentas disponibles={disponibles} elegidas={elegidas} />
                    ) : null
                }
                crear={
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <BotonDeCrear>Nuevo</BotonDeCrear>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Agregar</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/finance/sales?month=${monthValue}&create=1`} className="flex items-center gap-2">
                                    <PlusCircle className="h-4 w-4" />
                                    Agregar venta
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/finance/expenses?month=${monthValue}&create=1`} className="flex items-center gap-2">
                                    <PlusCircle className="h-4 w-4" />
                                    Agregar gasto
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
                acciones={
                    // Vaciar la contabilidad es exactamente lo que este menú
                    // recoge: algo que se le hace a MUCHAS filas y que no se usa
                    // a diario. Estaba como un enlace gris al final de la página,
                    // o sea el sitio donde uno no busca una acción destructiva.
                    <AccionesMasivas
                        seleccionados={[]}
                        queSon="movimientos"
                        puedeEliminar={false}
                        extras={[
                            {
                                clave: 'vaciar',
                                etiqueta: 'Vaciar contabilidad',
                                icono: <Trash2 className="h-4 w-4" />,
                                destructiva: true,
                                sinSeleccion: true,
                                onSelect: () => setVaciando(true),
                            },
                        ]}
                    />
                }
            />

            {/* El diálogo se queda fuera del menú: Radix desmonta su contenido al
                cerrarse, así que dentro se iría con él antes de que nadie pudiera
                escribir «VACIAR». */}
            <VaciarContabilidad
                accountLabel={accountLabel}
                abierto={vaciando}
                onAbiertoChange={setVaciando}
            />
        </>
    );
}
