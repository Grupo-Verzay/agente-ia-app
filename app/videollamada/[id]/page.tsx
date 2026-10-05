import type { Metadata } from "next";
import SalaDeLaVideollamada from "@/components/videollamada/SalaDeLaVideollamada";
import { CENTRADO_QUE_NO_SE_CORTA, PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { abrirLaVideollamada, type ResultadoAlAbrir } from "@/lib/videollamada-ia.server";
import { deInstanteAReloj } from "@/lib/zona-de-la-cuenta";

/**
 * El enlace que recibe el cliente para su videollamada con IA. Es PÚBLICO (lo
 * abre sin sesión) y la puerta es el propio id de la cita: aquí se crea la
 * conversación de Tavus y se monta su sala aquí
 * (`SalaDeLaVideollamada`), con la pantalla del avatar al lado. Antes de tiempo, pasada la franja o cancelada, se dice.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Videollamada",
    robots: { index: false, follow: false },
};

function elMensaje(resultado: Exclude<ResultadoAlAbrir, { estado: "ir" }>): { titulo: string; texto: string } {
    switch (resultado.estado) {
        case "temprano":
            return {
                titulo: "Tu videollamada todavía no ha empezado",
                texto: `La sala se abre el ${deInstanteAReloj(resultado.abreEn, resultado.zona)}. Vuelve a abrir este enlace a esa hora.`,
            };
        case "cerrada":
            return {
                titulo: "Esta videollamada ya terminó",
                texto: "El horario de la cita ya pasó. Escríbenos por WhatsApp si quieres agendar otra.",
            };
        case "cancelada":
            return { titulo: "Esta cita fue cancelada", texto: "Escríbenos por WhatsApp si quieres agendar otra." };
        case "sin_configurar":
            return {
                titulo: "La videollamada no está disponible",
                texto: "Este negocio no tiene la videollamada con IA activa. Escríbenle por WhatsApp.",
            };
        case "fallo":
            return { titulo: "No pudimos abrir tu videollamada", texto: `${resultado.motivo} Vuelve a intentarlo en un momento.` };
        default:
            return { titulo: "Este enlace no existe", texto: "Revisa que el enlace esté completo." };
    }
}

export default async function PaginaDeLaVideollamada({ params }: { params: { id: string } }) {
    const resultado = await abrirLaVideollamada(decodeURIComponent(params.id ?? ""));
    if (resultado.estado === "ir") return <SalaDeLaVideollamada url={resultado.url} />;
    const { titulo, texto } = elMensaje(resultado);
    return (
        <main className={`${PANTALLA_PUBLICA_QUE_SE_DESPLAZA} bg-slate-50 dark:bg-slate-950`}>
            <div className={`${CENTRADO_QUE_NO_SE_CORTA} px-4 py-10`}>
                <section
                    data-videollamada={resultado.estado}
                    className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{titulo}</h1>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{texto}</p>
                </section>
            </div>
        </main>
    );
}
