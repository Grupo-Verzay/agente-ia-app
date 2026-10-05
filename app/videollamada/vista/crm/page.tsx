import type { Metadata } from "next";

import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { elCrmDelProspecto } from "@/lib/videollamada-crm.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

/**
 * La pizarra de Verzy: la ficha del prospecto en la cuenta REAL «Verzay Ventas»
 * (embudo, recordatorios, citas y conversación). Solo lectura y sin sesión: la
 * puerta es la firma de la cita, y lo que se lee lo resuelve el servidor.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CRM del prospecto", robots: { index: false, follow: false } };

const ESTADOS: Record<string, string> = {
    FRIO: "Frío",
    TIBIO: "Tibio",
    CALIENTE: "Caliente",
    FINALIZADO: "Finalizado",
    DESCARTADO: "Descartado",
};

export default async function CrmDeLaVideollamada({ searchParams }: { searchParams: { c?: string; f?: string } }) {
    const citaId = String(searchParams.c ?? "");
    const crm = citaId && esLaFirmaDeLaCita(citaId, searchParams.f) ? await elCrmDelProspecto(citaId) : null;
    if (!crm) {
        return (
            <main className={`${PANTALLA_PUBLICA_QUE_SE_DESPLAZA} grid place-items-center bg-slate-50 p-6 text-slate-500`}>
                Esta ficha no está disponible.
            </main>
        );
    }
    return (
        <main data-vista="crm" className={`${PANTALLA_PUBLICA_QUE_SE_DESPLAZA} bg-slate-100 text-slate-900`}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Agente IA · {crm.cuenta}</p>
                    <h1 className="truncate text-lg font-semibold">{crm.nombre}</h1>
                </div>
                {crm.telefono ? <span className="shrink-0 text-sm text-slate-500">+{crm.telefono}</span> : null}
            </header>
            <div className="mx-auto grid max-w-4xl gap-4 p-5">
                <section id="ficha" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-semibold">Ficha del prospecto</h2>
                    {crm.encontrado ? (
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <Fila nombre="Calificación" valor={crm.estado ? ESTADOS[crm.estado] ?? crm.estado : "Sin calificar"} />
                            <Fila nombre="Puntaje" valor={crm.puntaje != null ? `${crm.puntaje}/100` : "—"} />
                        </dl>
                    ) : (
                        <p className="mt-2 text-sm text-slate-500">Todavía no está en el CRM: lo creamos con esta reunión.</p>
                    )}
                    {crm.etiquetas.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {crm.etiquetas.map((t) => (
                                <span key={t.nombre} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: t.color ?? undefined }}>
                                    {t.nombre}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {crm.porQue ? <p className="mt-3 text-sm text-slate-600">{crm.porQue}</p> : null}
                </section>
                <section id="embudo" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-semibold">Embudo de ventas</h2>
                    {crm.etapa ? (
                        <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: crm.etapa.color }} />
                            {crm.etapa.nombre}
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-slate-500">Sin etapa todavía.</p>
                    )}
                </section>
                <section id="recordatorios" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-semibold">Recordatorios y citas</h2>
                    {crm.citas.length || crm.recordatorios.length ? (
                        <ul className="mt-3 grid gap-2 text-sm">
                            {crm.citas.map((c, i) => (
                                <li key={`c${i}`} className="flex justify-between gap-3"><span>Cita</span><span className="text-slate-600">{c.cuando}</span></li>
                            ))}
                            {crm.recordatorios.map((r, i) => (
                                <li key={`r${i}`} className="grid gap-0.5 border-t border-slate-100 pt-2">
                                    <span className="flex justify-between gap-3"><span>{r.tipo}</span><span className="text-slate-600">{r.cuando}</span></span>
                                    {r.texto ? <span className="line-clamp-2 text-slate-500">{r.texto}</span> : null}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-sm text-slate-500">No hay nada programado.</p>
                    )}
                </section>
                <section id="conversacion" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-semibold">Historial de la conversación</h2>
                    {crm.conversacion.length ? (
                        <ul className="mt-3 grid gap-2 text-sm">
                            {crm.conversacion.map((m, i) => (
                                <li key={i} className={`max-w-[85%] rounded-xl px-3 py-2 ${m.deQuien === "negocio" ? "justify-self-end bg-blue-50" : "bg-slate-100"}`}>
                                    <p className="whitespace-pre-line">{m.texto}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{m.hora}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-sm text-slate-500">Todavía no hay mensajes con este número.</p>
                    )}
                </section>
            </div>
        </main>
    );
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
    return (
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">{nombre}</dt>
            <dd className="text-right font-medium">{valor}</dd>
        </div>
    );
}
