import type { Metadata } from "next";

import { CENTRADO_QUE_NO_SE_CORTA, PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { laFichaDelProspecto } from "@/lib/videollamada-en-vivo.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

/**
 * Lo que Verzy enseña cuando resume lo que sabe del prospecto. Solo lectura y
 * sin sesión: la puerta es la firma de la cita (la pone la sala en el marco).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu ficha", robots: { index: false, follow: false } };

const ESTADOS: Record<string, string> = {
    FRIO: "Frío",
    TIBIO: "Tibio",
    CALIENTE: "Caliente",
    FINALIZADO: "Finalizado",
    DESCARTADO: "Descartado",
};

export default async function FichaDeLaVideollamada({ searchParams }: { searchParams: { c?: string; f?: string } }) {
    const citaId = String(searchParams.c ?? "");
    const ficha = citaId && esLaFirmaDeLaCita(citaId, searchParams.f) ? await laFichaDelProspecto(citaId) : null;
    return (
        <main className={`${PANTALLA_PUBLICA_QUE_SE_DESPLAZA} bg-slate-50 text-slate-900`}>
            <div className={`${CENTRADO_QUE_NO_SE_CORTA} p-6`}>
                {ficha ? (
                    <section data-vista="ficha" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-sm font-medium text-blue-600">Lo que sabemos de tu negocio</p>
                        <h1 className="mt-1 text-2xl font-semibold">{ficha.nombre}</h1>
                        <dl className="mt-5 grid gap-3 text-sm">
                            {ficha.telefono ? <Fila nombre="WhatsApp" valor={`+${ficha.telefono}`} /> : null}
                            {ficha.servicio ? <Fila nombre="Te interesa" valor={ficha.servicio} /> : null}
                            <Fila nombre="Esta cita" valor={ficha.citaEl} />
                            {ficha.estado ? <Fila nombre="Calificación" valor={ESTADOS[ficha.estado] ?? ficha.estado} /> : null}
                            {ficha.puntaje != null ? <Fila nombre="Puntaje" valor={`${ficha.puntaje}/100`} /> : null}
                        </dl>
                        {ficha.resumen || ficha.porQue ? (
                            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                                <p className="mb-1 font-medium text-slate-900">Resumen</p>
                                <p className="whitespace-pre-line">{ficha.resumen ?? ficha.porQue}</p>
                            </div>
                        ) : null}
                    </section>
                ) : (
                    <p className="text-slate-500">Esta ficha no está disponible.</p>
                )}
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
