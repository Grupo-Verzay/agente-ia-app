"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { laOrdenDeLaPantalla, laRutaYElAncla, type PaginaDelAvatar } from "@/lib/pantalla-del-avatar";

/** Baja al ancla dentro del marco (es del mismo origen). La landing pinta
 * sus secciones después de cargar, así que se insiste unos segundos. */
function bajarAlAncla(marco: HTMLIFrameElement | null, ancla: string | null) {
    if (!marco) return;
    let vueltas = 0;
    const intentar = () => {
        try {
            const doc = marco.contentDocument;
            if (!ancla) { marco.contentWindow?.scrollTo({ top: 0, behavior: "smooth" }); return; }
            const el = doc?.getElementById(ancla);
            if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        } catch (error) {
            console.warn("[videollamada] no se pudo bajar al ancla de la pantalla", { ancla, error });
            return;
        }
        if (++vueltas < 25) window.setTimeout(intentar, 200);
        else console.warn("[videollamada] el ancla de la pantalla no apareció", { ancla });
    };
    intentar();
}

/**
 * La sala de la videollamada con IA. No redirige a Tavus: monta su sala de
 * Daily aquí (a un lado) y la PANTALLA DEL AVATAR al otro. La pantalla la
 * decide Verzy con su herramienta `mostrar_pantalla`, que llega por el canal
 * de Daily (`app-message`) y se lee con `laOrdenDeLaPantalla` — lo demás que
 * viaje por ese canal se ignora.
 *
 * Varios humanos pueden abrir el mismo enlace: todos entran a la MISMA
 * conversación (el servidor la reutiliza) y cada uno ve la pantalla que
 * comparte el avatar, porque la orden les llega a todos.
 */
export default function SalaDeLaVideollamada({ url }: { url: string }) {
    const contenedor = useRef<HTMLDivElement>(null);
    const [pagina, setPagina] = useState<PaginaDelAvatar | null>(null);
    const marco = useRef<HTMLIFrameElement>(null);
    const destino = pagina ? laRutaYElAncla(pagina.ruta) : null;
    // Cambiar de sección en la misma página no recarga el marco: solo baja.
    useEffect(() => {
        if (destino) bajarAlAncla(marco.current, destino.ancla);
    }, [destino?.ruta, destino?.ancla]); // eslint-disable-line react-hooks/exhaustive-deps
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const caja = contenedor.current;
        if (!caja) return;
        let llamada: DailyCall | null = null;
        try {
            llamada = DailyIframe.createFrame(caja, {
                iframeStyle: { width: "100%", height: "100%", border: "0" },
                showLeaveButton: true,
                showFullscreenButton: true,
            });
        } catch (e) {
            console.error("[videollamada] no se pudo montar la sala", e);
            setError("No pudimos abrir la sala. Recarga la página.");
            return;
        }
        llamada.on("app-message", (ev) => {
            const orden = laOrdenDeLaPantalla(ev?.data);
            if (!orden) return;
            setPagina(orden.accion === "mostrar" ? orden.pagina : null);
        });
        llamada.on("error", (ev) => {
            console.error("[videollamada] error de la sala", ev);
            setError("Se cortó la videollamada. Recarga la página para volver a entrar.");
        });
        llamada.join({ url }).catch((e) => {
            console.error("[videollamada] no se pudo entrar", e);
            setError("No pudimos entrar a la videollamada. Recarga la página.");
        });
        return () => {
            void llamada?.destroy();
        };
    }, [url]);

    return (
        <main className="flex h-[100dvh] w-full flex-col bg-slate-950 text-slate-100 lg:flex-row">
            <section
                data-zona="sala"
                className={`relative min-h-0 ${pagina ? "h-[45dvh] lg:h-auto lg:w-[38%]" : "flex-1"}`}
            >
                <div ref={contenedor} className="h-full w-full" />
                {error && (
                    <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-red-600/90 px-3 py-2 text-sm">
                        {error}
                    </p>
                )}
            </section>
            {pagina && (
                <section
                    data-zona="pantalla-del-avatar"
                    data-pagina={pagina.clave}
                    className="flex min-h-0 flex-1 flex-col border-t border-slate-800 lg:border-l lg:border-t-0"
                >
                    <header className="flex h-10 shrink-0 items-center gap-2 px-4 text-sm text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                        Verzy te está mostrando: <strong className="text-slate-100">{pagina.titulo}</strong>
                    </header>
                    <iframe
                        ref={marco}
                        key={destino!.ruta}
                        src={destino!.ruta}
                        onLoad={() => bajarAlAncla(marco.current, destino!.ancla)}
                        title={`Pantalla de Verzy: ${pagina.titulo}`}
                        className="min-h-0 w-full flex-1 bg-white"
                    />
                </section>
            )}
        </main>
    );
}
