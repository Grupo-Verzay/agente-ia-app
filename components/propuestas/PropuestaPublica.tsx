import { CalendarDays, CheckCircle2, FileText, RefreshCw, ScrollText } from "lucide-react";

import {
    comoSeLeeElImporte,
    comoSeLeeLaFecha,
    elTotal,
    lasIniciales,
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
 * Sin `"use client"`: no hay nada que hacer en el navegador, así que se pinta
 * entera en el servidor y llega como HTML — que es lo que carga rápido con la
 * conexión de un móvil.
 */
export function PropuestaPublica({ propuesta }: { propuesta: Datos }) {
    const total = elTotal(propuesta.servicios);
    const { negocio } = propuesta;
    const conMantenimiento = propuesta.mantenimientoMensual !== null;

    return (
        <article data-propuesta className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
            {/* Cabecera: de quién es y para quién */}
            <header className="flex items-center gap-3">
                {negocio.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={negocio.logo}
                        alt={negocio.nombre || "Logo"}
                        className="h-12 w-12 shrink-0 rounded-xl border bg-white object-contain"
                    />
                ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold text-white">
                        {lasIniciales(negocio.nombre)}
                    </div>
                )}
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900" title={negocio.nombre}>
                        {negocio.nombre || "Propuesta comercial"}
                    </p>
                    <p className="text-xs text-slate-500">Propuesta comercial</p>
                </div>
            </header>

            <section className="mt-6 rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:p-7">
                <p className="text-xs uppercase tracking-wide text-slate-300">Preparada para</p>
                <h1 data-cliente className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl">
                    {propuesta.cliente}
                </h1>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-300">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    {comoSeLeeLaFecha(propuesta.fecha)}
                </p>
                <div className="mt-5 border-t border-white/15 pt-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Inversión total</p>
                    <p data-total className="mt-1 break-words text-3xl font-bold sm:text-4xl">
                        {comoSeLeeElImporte(total, propuesta.moneda)}
                    </p>
                    {conMantenimiento ? (
                        <p className="mt-1 text-sm text-slate-300">
                            + {comoSeLeeElImporte(propuesta.mantenimientoMensual!, propuesta.moneda)} / mes de mantenimiento
                        </p>
                    ) : null}
                </div>
            </section>

            {/* Servicios */}
            <section className="mt-8">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-slate-500" />
                    Servicios
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
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                                        {s.alcance}
                                    </p>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ol>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-900/10 bg-slate-100 px-4 py-3 sm:px-5">
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
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                            {propuesta.mantenimientoDescripcion}
                        </p>
                    ) : null}
                </section>
            ) : null}

            {propuesta.condiciones ? (
                <section data-condiciones className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <ScrollText className="h-4 w-4 text-slate-500" />
                        Condiciones
                    </h2>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                        {propuesta.condiciones}
                    </p>
                </section>
            ) : null}

            <footer className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Propuesta preparada por {negocio.nombre || "el equipo"}
            </footer>
        </article>
    );
}
