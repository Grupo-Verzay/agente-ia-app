"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
    CADA_CUANTO_SE_MANDA_MS,
    EL_MANDO_CADUCA_MS,
    MAXIMO_POR_VUELTA_MS,
    cuentaEsteRato,
    mandaEstaPestana,
    seccionDeLaRuta,
    type MandoDeLaPestana,
    type Seccion,
} from "@/lib/actividad-del-equipo";

/**
 * El contador de jornada. Cuelga del layout, así que corre en todas las
 * pantallas y no pinta nada.
 *
 * ## No es un latido
 *
 * La vuelta del reloj **no manda nada**: solo suma segundos a un contador en
 * memoria. Lo que viaja, una vez por minuto, es el **total acumulado** de esta
 * pestaña en cada sección. De ahí salen las dos cosas que se pidieron:
 *
 * - La base no se llena: el servidor guarda un cubo por sección y día, así que
 *   una jornada entera son seis filas y no novecientas.
 * - Y reenviar es inofensivo, porque el servidor guarda `GREATEST` del total y
 *   no una suma. Un corte de red no descuadra nada: el envío siguiente ya trae
 *   lo que faltaba.
 *
 * ## Qué pasa si se cierra el navegador de golpe
 *
 * Lo que no se haya mandado se pierde, y eso es **como mucho un minuto**. No
 * hay nada más que perder porque **no hay ninguna fila abierta**: no existe un
 * evento de «salida» que pueda faltar. Modelado como entrada y salida, un
 * cierre a lo bruto dejaría la fila abierta para siempre y la persona
 * aparecería con catorce horas.
 *
 * Aun así se intenta no perder ese minuto, en el orden correcto:
 *
 * 1. `visibilitychange` → `hidden` y `pagehide`, que son los que **sí** se
 *    disparan al cerrar la pestaña, al navegar fuera y al mandar el navegador
 *    a segundo plano en un móvil. `beforeunload` no vale: en móvil no se
 *    dispara, y es justo donde más se cierra a lo bruto.
 * 2. Con `sendBeacon`, que el navegador se encarga de entregar aunque la
 *    página ya no exista. Un `fetch` en ese momento lo cancela él mismo.
 *
 * Y si es un corte de luz o el navegador muere sin avisar, no se dispara nada
 * de esto y se pierde ese minuto. Eso es el suelo y no se disimula.
 */

/** Cada cuánto suma el contador. Corto: es lo que da el grano de la medida. */
const VUELTA_MS = 2000;

const LLAVE_DEL_MANDO = "verzay:actividad:mando";
const LLAVE_DE_LA_PESTANA = "verzay:actividad:pestana";

/**
 * El id de esta pestaña.
 *
 * En `sessionStorage` a propósito: sobrevive a una recarga —que si no
 * multiplicaría las filas por cada F5— y muere con la pestaña, que es lo que
 * hace que dos pestañas nunca compartan id.
 *
 * Y **todo va en `try/catch` con un respaldo en memoria**: en una ventana
 * privada, o con el almacenamiento bloqueado, leer puede lanzar. Sin eso el
 * contador entero se cae en los navegadores donde más se mira la privacidad.
 */
function idDeEstaPestana(): string {
    const nuevo = () =>
        `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
        const ya = sessionStorage.getItem(LLAVE_DE_LA_PESTANA);
        if (ya) return ya;
        const id = nuevo();
        sessionStorage.setItem(LLAVE_DE_LA_PESTANA, id);
        return id;
    } catch {
        return nuevo();
    }
}

/** Quién manda ahora, según lo que dejó escrito la última pestaña que se tocó. */
function leerElMando(): MandoDeLaPestana | null {
    try {
        const crudo = localStorage.getItem(LLAVE_DEL_MANDO);
        if (!crudo) return null;
        const v = JSON.parse(crudo) as Partial<MandoDeLaPestana>;
        if (typeof v?.pestanaId !== "string" || typeof v?.desdeMs !== "number") return null;
        return { pestanaId: v.pestanaId, desdeMs: v.desdeMs };
    } catch {
        return null;
    }
}

function escribirElMando(pestanaId: string): void {
    try {
        localStorage.setItem(
            LLAVE_DEL_MANDO,
            JSON.stringify({ pestanaId, desdeMs: Date.now() }),
        );
    } catch {
        // Sin `localStorage` no hay forma de coordinar pestañas. Se sigue
        // contando: es mejor que una persona con dos pestañas salga de más que
        // que no salga nadie. Ver `mandaEstaPestana`, que sin mando dice «sí».
    }
}

export function ContadorDeJornada() {
    const ruta = usePathname();

    // Todo por referencia: el ciclo se monta UNA vez y lee lo de dentro en
    // cada vuelta. Con la ruta en las dependencias del efecto, cada cambio de
    // pantalla desmontaría y volvería a montar el reloj, y en ese hueco se
    // perderían segundos. Es la misma regla que el ciclo del chat abierto.
    const rutaRef = useRef(ruta);
    rutaRef.current = ruta;

    const segundosRef = useRef<Partial<Record<Seccion, number>>>({});
    const ultimoToqueRef = useRef<number>(Date.now());
    const pestanaIdRef = useRef<string>("");
    const mandadoRef = useRef<Partial<Record<Seccion, number>>>({});

    useEffect(() => {
        pestanaIdRef.current = idDeEstaPestana();
        const yo = pestanaIdRef.current;

        // Al abrir, esta pestaña es la última que se tocó: está recién abierta.
        escribirElMando(yo);

        /** Cualquier señal de vida reclama el mando y reinicia la inactividad. */
        const tocar = () => {
            ultimoToqueRef.current = Date.now();
            const mando = leerElMando();
            // Se reescribe solo cuando hace falta: en cada movimiento de ratón
            // sería escribir en `localStorage` decenas de veces por segundo, y
            // eso se nota en el hilo que también pinta la pantalla.
            if (!mando || mando.pestanaId !== yo || Date.now() - mando.desdeMs > 5000) {
                escribirElMando(yo);
            }
        };

        const eventos = ["keydown", "pointerdown", "pointermove", "wheel", "scroll"] as const;
        for (const e of eventos) {
            window.addEventListener(e, tocar, { passive: true });
        }

        /** Lo que hay sin mandar, listo para viajar. */
        const loQueFalta = () => {
            const trozos: Array<{ seccion: Seccion; segundos: number }> = [];
            for (const [seccion, segundos] of Object.entries(segundosRef.current)) {
                if (!segundos || segundos <= 0) continue;
                // Se manda el total aunque ya se mandara: es idempotente, y es
                // lo que hace que un envío perdido se arregle solo. Solo se
                // salta lo que no ha cambiado desde el último envío bueno.
                if (mandadoRef.current[seccion as Seccion] === segundos) continue;
                trozos.push({ seccion: seccion as Seccion, segundos: Math.floor(segundos) });
            }
            return trozos;
        };

        const mandar = (deDespedida: boolean) => {
            const trozos = loQueFalta();
            if (trozos.length === 0) return;
            const cuerpo = JSON.stringify({ pestanaId: yo, trozos });

            if (deDespedida) {
                // La página se está yendo: `sendBeacon` o nada. No se apunta
                // como mandado porque no hay forma de saber si llegó — y no
                // hace falta: esta pestaña ya no va a mandar nada más.
                try {
                    navigator.sendBeacon?.(
                        "/api/actividad",
                        new Blob([cuerpo], { type: "application/json" }),
                    );
                } catch {
                    // Un `sendBeacon` que no se puede ni intentar no puede
                    // tumbar el cierre de la pestaña.
                }
                return;
            }

            void fetch("/api/actividad", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: cuerpo,
                keepalive: true,
            })
                .then((r) => {
                    if (!r.ok) throw new Error(String(r.status));
                    // Solo se da por mandado lo que el servidor aceptó. Si
                    // falla, el acumulado se queda y la vuelta siguiente lo
                    // lleva otra vez: como se guarda el total y no un
                    // incremento, repetirlo no cuenta dos veces.
                    for (const t of trozos) mandadoRef.current[t.seccion] = t.segundos;
                })
                .catch((error) => {
                    // Un refresco que falla en silencio no se nota como un
                    // error: se nota como un equipo que trabaja menos.
                    console.warn("[actividad] no se pudo mandar la jornada", error);
                });
        };

        const vuelta = window.setInterval(() => {
            const ahora = Date.now();
            const manda = mandaEstaPestana(yo, leerElMando(), ahora);

            if (
                cuentaEsteRato({
                    visible: document.visibilityState === "visible",
                    ultimoToqueMs: ultimoToqueRef.current,
                    ahoraMs: ahora,
                    mandaEstaPestana: manda,
                })
            ) {
                // El tope por vuelta es lo que protege de un reloj que salta:
                // un portátil que despierta de suspensión da un `elapsed` de
                // horas, y esas horas no se trabajaron.
                const seccion = seccionDeLaRuta(rutaRef.current || "/");
                const suma = Math.min(VUELTA_MS, MAXIMO_POR_VUELTA_MS) / 1000;
                segundosRef.current[seccion] = (segundosRef.current[seccion] ?? 0) + suma;
            }

            // Quien manda renueva su marca, para que al morir caduque y otra
            // pestaña tome el relevo.
            if (manda && document.visibilityState === "visible") {
                const mando = leerElMando();
                if (!mando || mando.pestanaId !== yo) escribirElMando(yo);
                else if (ahora - mando.desdeMs > EL_MANDO_CADUCA_MS / 2) escribirElMando(yo);
            }
        }, VUELTA_MS);

        const reloj = window.setInterval(() => mandar(false), CADA_CUANTO_SE_MANDA_MS);

        const alIrse = () => {
            if (document.visibilityState === "hidden") mandar(true);
        };
        document.addEventListener("visibilitychange", alIrse);
        window.addEventListener("pagehide", () => mandar(true));

        return () => {
            window.clearInterval(vuelta);
            window.clearInterval(reloj);
            for (const e of eventos) window.removeEventListener(e, tocar);
            document.removeEventListener("visibilitychange", alIrse);
            mandar(true);
        };
        // Se monta UNA vez. La ruta entra por referencia, no por dependencia.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
