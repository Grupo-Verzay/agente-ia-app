import { CalendarClock, CalendarDays, CheckCircle2, CreditCard, FileText, Package, RefreshCw, ScrollText, StickyNote } from "lucide-react";

import {
    comoSeLeeElImporte,
    comoSeLeeLaFecha,
    elTotal,
    lasIniciales,
    losRotulosDeItems,
    type PropuestaPublica as Datos,
} from "@/lib/propuestas";

/**
 * Cómo se ve una propuesta comercial por dentro, para el cliente.
 *
 * **Mobile-first**: se pinta primero para un teléfono de 360 px —que es desde
 * donde se abre, por WhatsApp— y de `sm` para arriba solo gana aire y una
 * columna más ancha. Nada de tablas: una tabla de servicios con alcance e
 * inversión en un teléfono se lee desplazándose a lo ancho, y un cliente no
 * hace eso. Cada servicio es una tarjeta, con la inversión a la vista.
 *
 * **El azul es el de la plataforma, claro** (`blue-500` → `blue-400`): el
 * `slate-900` de antes se leía como un azul casi negro y apagado que no casaba
 * con ningún logo. Vive en `AZUL_DE_LA_PROPUESTA` para que la cabecera, las
 * iniciales y el total no puedan salir de dos azules distintos.
 *
 * Sin `"use client"`: no hay nada que hacer en el navegador, así que se pinta
 * entera en el servidor y llega como HTML — que es lo que carga rápido con la
 * conexión de un móvil.
 */
export const AZUL_DE_LA_PROPUESTA = "bg-gradient-to-br from-blue-500 to-blue-400";

/**
 * El ancho del contenedor. Hasta `md` (teléfono y tableta) es el de siempre,
 * `max-w-2xl`; en escritorio crece por escalones —896, 1024 y 1152 px— para
 * no quedar como una tira de 672 px en medio de una pantalla de 1440 o 1920,
 * y **nunca llega al ancho entero**: siempre queda margen a los lados.
 */
export const ANCHO_DE_LA_PROPUESTA = "max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl";

/**
 * El tope de un párrafo largo (alcance, notas, condiciones, pago). Con el
 * contenedor ancho, un texto de 14 px pasaría de 140 caracteres por línea y
 * se leería mal: se topa en ~100 (`max-w-3xl`). Los títulos, importes y
 * tarjetas sí ocupan el ancho entero.
 */
export const TOPE_DE_LECTURA = "max-w-3xl";

export function PropuestaPublica({ propuesta }: { propuesta: Datos }) {
    const total = elTotal(propuesta.servicios);
    const { negocio } = propuesta;
    const conMantenimiento = propuesta.mantenimientoMensual !== null;
    const rotulos = losRotulosDeItems(propuesta.tipoDeItems);
    const conPago = Boolean(propuesta.metodoPago || propuesta.medioPago);

    return (
        <article data-propuesta className={`mx-auto w-full ${ANCHO_DE_LA_PROPUESTA} px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:px-8`}>
            {/* Cabecera: el logo con «Propuesta comercial» debajo, y a la
                derecha el eslogan de la cuenta si lo tiene. El nombre de la
                cuenta ya no va aquí: el logo lo dice, y sale en el pie.
                `items-center`: el eslogan va a la altura del CENTRO del bloque
                del logo, no pegado arriba (con `items-start` y un `pt-1` quedaba
                a la altura del logo y descolgado del rótulo). */}
            <header data-cabecera className="flex items-center justify-between gap-4">
                <div className="flex shrink-0 flex-col items-start gap-1.5">
                    {negocio.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={negocio.logo}
                            alt={negocio.nombre || "Logo"}
                            className="h-12 w-12 shrink-0 rounded-xl border bg-white object-contain"
                        />
                    ) : (
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white ${AZUL_DE_LA_PROPUESTA}`}>
                            {lasIniciales(negocio.nombre)}
                        </div>
                    )}
                    <p data-rotulo-propuesta className="text-xs font-medium text-slate-500">Propuesta comercial</p>
                </div>
                {negocio.eslogan ? (
                    <p
                        data-eslogan
                        className="min-w-0 max-w-[60%] break-words text-right text-sm font-bold leading-snug text-slate-700"
                    >
                        {negocio.eslogan}
                    </p>
                ) : null}
            </header>

            <section data-hero className={`mt-6 rounded-2xl p-5 text-white shadow-sm sm:p-7 ${AZUL_DE_LA_PROPUESTA}`}>
                <p className="text-xs uppercase tracking-wide text-white/80">Preparada para</p>
                <h1 data-cliente className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl">
                    {propuesta.cliente}
                </h1>
                {propuesta.empresa ? (
                    <p data-empresa className="mt-1 break-words text-base font-medium text-white/90">
                        {propuesta.empresa}
                    </p>
                ) : null}
                <p className="mt-3 flex items-center gap-1.5 text-sm text-white/80">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    {comoSeLeeLaFecha(propuesta.fecha)}
                </p>
                {propuesta.vigencia ? (
                    <p data-vigencia className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                        <CalendarClock className="h-4 w-4 shrink-0" />
                        Válida hasta el {comoSeLeeLaFecha(propuesta.vigencia)}
                    </p>
                ) : null}
                <div className="mt-5 border-t border-white/25 pt-4">
                    <p className="text-xs uppercase tracking-wide text-white/80">Inversión total</p>
                    <p data-total className="mt-1 break-words text-3xl font-bold sm:text-4xl">
                        {comoSeLeeElImporte(total, propuesta.moneda)}
                    </p>
                    {conMantenimiento ? (
                        <p className="mt-1 text-sm text-white/80">
                            + {comoSeLeeElImporte(propuesta.mantenimientoMensual!, propuesta.moneda)} / mes de mantenimiento
                        </p>
                    ) : null}
                </div>
            </section>

            {/* Servicios o productos: lo eligió quien creó la propuesta */}
            <section className="mt-8">
                <h2 data-titulo-items className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    {propuesta.tipoDeItems === "productos" ? (
                        <Package className="h-4 w-4 text-slate-500" />
                    ) : (
                        <FileText className="h-4 w-4 text-slate-500" />
                    )}
                    {rotulos.plural}
                </h2>
                <ol className="mt-3 space-y-3">
                    {propuesta.servicios.map((s, i) => (
                        <li key={i} data-servicio className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <h3 className="min-w-0 break-words text-base font-semibold text-slate-900">
                                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                                    {s.nombre}
                                </h3>
                                <p className="shrink-0 text-base font-semibold text-slate-900 sm:text-right">
                                    {comoSeLeeElImporte(s.inversion, propuesta.moneda)}
                                </p>
                            </div>
                            {s.alcance ? (
                                <div className="mt-2">
                                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Alcance</p>
                                    <p data-lectura className={`mt-1 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600`}>
                                        {s.alcance}
                                    </p>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ol>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 sm:px-5">
                    <span className="text-sm font-medium text-slate-600">Total</span>
                    <span className="text-right text-base font-bold text-slate-900">
                        {comoSeLeeElImporte(total, propuesta.moneda)}
                    </span>
                </div>
            </section>

            {conMantenimiento ? (
                <section data-mantenimiento className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <RefreshCw className="h-4 w-4 text-slate-500" />
                        Mantenimiento mensual
                    </h2>
                    <p className="mt-2 text-xl font-bold text-slate-900">
                        {propuesta.mantenimientoMensual === 0
                            ? "Incluido"
                            : `${comoSeLeeElImporte(propuesta.mantenimientoMensual!, propuesta.moneda)} / mes`}
                    </p>
                    {propuesta.mantenimientoDescripcion ? (
                        <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600`}>
                            {propuesta.mantenimientoDescripcion}
                        </p>
                    ) : null}
                </section>
            ) : null}

            {propuesta.nota ? (
                <section data-nota className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <StickyNote className="h-4 w-4 text-slate-500" />
                        Nota
                    </h2>
                    <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600`}>
                        {propuesta.nota}
                    </p>
                </section>
            ) : null}

            {propuesta.condiciones ? (
                <section data-condiciones className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <ScrollText className="h-4 w-4 text-slate-500" />
                        Condiciones
                    </h2>
                    <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600`}>
                        {propuesta.condiciones}
                    </p>
                </section>
            ) : null}

            {/* Cómo pagar: después de las condiciones y antes del pie. Sin días
                de licencia ni vencimientos — el cliente todavía no contrató. */}
            {conPago ? (
                <section data-pago className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <CreditCard className="h-4 w-4 text-slate-500" />
                        Información de pago
                    </h2>
                    <dl className="mt-2 space-y-3">
                        {propuesta.metodoPago ? (
                            <div data-metodo-pago>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Método de pago</dt>
                                <dd className="mt-1 break-words text-sm leading-relaxed text-slate-700">{propuesta.metodoPago}</dd>
                            </div>
                        ) : null}
                        {propuesta.medioPago ? (
                            <div data-medio-pago>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Medio de pago</dt>
                                <dd data-lectura className={`mt-1 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700`}>
                                    {propuesta.medioPago}
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </section>
            ) : null}

            <footer className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Propuesta preparada por {negocio.nombre || "el equipo"}
            </footer>
        </article>
    );
}
