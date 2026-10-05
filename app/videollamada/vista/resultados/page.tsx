import type { Metadata } from "next";

import { CENTRADO_QUE_NO_SE_CORTA, PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { losResultadosDeLaCasa } from "@/lib/videollamada-en-vivo.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

/**
 * Lo que Verzy enseña como prueba social: solo cifras agregadas de la
 * plataforma, sin nombres de clientes. Puerta: la firma de la cita.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resultados", robots: { index: false, follow: false } };

const NUMERO = new Intl.NumberFormat("es-CO");

export default async function ResultadosDeLaVideollamada({ searchParams }: { searchParams: { c?: string; f?: string } }) {
    const citaId = String(searchParams.c ?? "");
    const r = citaId && esLaFirmaDeLaCita(citaId, searchParams.f) ? await losResultadosDeLaCasa() : null;
    return (
        <main className={`${PANTALLA_PUBLICA_QUE_SE_DESPLAZA} bg-slate-50 text-slate-900`}>
            <div className={`${CENTRADO_QUE_NO_SE_CORTA} p-6`}>
                {r ? (
                    <section data-vista="resultados" className="w-full max-w-3xl">
                        <h1 className="text-center text-2xl font-semibold">Lo que Verzay hace por los negocios</h1>
                        <p className="mt-1 text-center text-sm text-slate-500">Últimos {r.dias} días</p>
                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                            <Cifra valor={r.negocios} texto="negocios activos" />
                            <Cifra valor={r.conversaciones} texto="conversaciones nuevas atendidas" />
                            <Cifra valor={r.citas} texto="citas agendadas" />
                        </div>
                    </section>
                ) : (
                    <p className="text-slate-500">Estos resultados no están disponibles.</p>
                )}
            </div>
        </main>
    );
}

function Cifra({ valor, texto }: { valor: number; texto: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-4xl font-bold text-blue-600">{NUMERO.format(valor)}</p>
            <p className="mt-2 text-sm text-slate-600">{texto}</p>
        </div>
    );
}
