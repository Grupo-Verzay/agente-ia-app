"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { sinLeerDelEquipoAction } from "@/actions/chat-de-equipo-actions";
import {
    SILENCIO_ENTRE_AVISOS_MS,
    TONO_DEL_EQUIPO,
    laMarcaDespues,
    llaveDeLaMarca,
    loQueMereceSonar,
    type AvisoDelEquipo,
} from "@/lib/aviso-del-equipo";

/**
 * Cuántos mensajes del equipo quedan por leer, y el sonido de los que importan.
 *
 * # Por qué tiene su propio reloj
 *
 * Porque **la gracia es enterarse con el panel CERRADO**. El reloj del hilo
 * solo corre con el panel abierto, y a propósito: cuelga del layout, o sea de
 * todas las pantallas. Este es lo contrario — tiene que correr siempre — así
 * que va mucho más espaciado y no se trae ni un mensaje, solo cuenta.
 *
 * Quince segundos, el mismo ritmo que la ventana que interrumpe. No es el chat
 * abierto de la bandeja, que va a cinco: esto es un aviso de que hay algo, y
 * quien quiera leerlo abre el panel y ahí sí corre el reloj corto.
 *
 * Es un `setInterval` montado **una sola vez**, no una cadena de `setTimeout`:
 * si una vuelta no llegara a programar la siguiente, el contador se quedaría
 * clavado y nadie se enteraría de nada — que es el fallo de partida.
 *
 * # Y con la pestaña de FONDO también pregunta
 *
 * Esto cambió, y es lo que hace posible el sonido. Antes se saltaba la vuelta
 * con `document.hidden`, igual que el oyente de llamadas: tenía sentido cuando
 * lo único que hacía era pintar un número que nadie estaba mirando. Con sonido
 * es al revés — **la pestaña de fondo es justo el caso** para el que esto
 * existe—, así que el guardián se fue.
 *
 * Lo que hay que saber del coste, porque no es gratis ni es lo que parece: el
 * navegador **ralentiza** los temporizadores de una pestaña de fondo, y a los
 * cinco minutos escondida los deja en una vuelta por minuto. O sea que con la
 * pestaña detrás esto pregunta MENOS que con ella delante, no más, y el sonido
 * puede llegar con hasta un minuto de retraso. No se puede esquivar desde el
 * código de la página: es el navegador, y va a seguir ahí.
 *
 * # Y baja al momento, no en la vuelta siguiente
 *
 * Abrir un canal lo marca leído en el servidor, pero el contador vive aquí: sin
 * nada más, el número se quedaría puesto hasta quince segundos después de haber
 * leído, y eso se ve como un contador roto.
 *
 * Se avisa con un evento del navegador y no con un contexto porque el hilo se
 * pinta en **dos sitios** —el panel, que cuelga del layout, y la ruta, que no—.
 * Un contexto obligaría a envolver los dos; el evento llega igual desde
 * cualquiera.
 */

/** Cada cuánto se pregunta. Corto y fijo, como el resto de relojes de la App. */
export const CADA_CUANTO_CUENTA_MS = 15_000;

/** Lo que dispara el hilo cuando acaba de marcar un canal como leído. */
export const YA_LO_LEI = "chat-equipo:leido";

/** Cuando alguien enciende o apaga el sonido desde la cabecera del panel. */
export const CAMBIO_EL_SONIDO = "chat-equipo:sonido";

export function avisarDeQueSeLeyo() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(YA_LO_LEI));
}

export function avisarDeQueCambioElSonido() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(CAMBIO_EL_SONIDO));
}

// ── Qué canal se tiene DELANTE ───────────────────────────────────────────────
//
// Una variable de módulo y no un contexto, por lo mismo que el evento de
// arriba: el hilo se pinta en dos sitios y esto cuelga de un tercero. Vale
// porque los tres viven en el mismo paquete, así que es el mismo módulo.
//
// «Delante» lo completa quien pregunta con la otra mitad —si la pestaña está a
// la vista—, y las dos hacen falta: con la pestaña de fondo el canal sigue
// abierto en la pantalla y no lo está mirando nadie.

let canalDelante: string | null = null;

export function avisarDelCanalAbierto(canalId: string | null) {
    canalDelante = canalId;
}

// ── El sonido ────────────────────────────────────────────────────────────────

let contexto: AudioContext | null = null;

/**
 * El tono, con WebAudio y no con un fichero.
 *
 * Un `.mp3` habría que subirlo, servirlo y esperar a que cargue justo cuando
 * hace falta que suene ya — y son dos notas. Es el mismo criterio que el timbre
 * de las llamadas.
 *
 * El `AudioContext` se monta una vez y se reutiliza: uno por aviso los va
 * dejando abiertos hasta que el navegador se queja. Y se le pide `resume()`
 * porque un contexto creado sin que nadie haya tocado la página nace
 * suspendido; si el navegador no lo deja, no suena y no pasa nada más.
 */
function sonar() {
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;
        if (!Ctor) return;
        contexto ??= new Ctor();
        const ctx = contexto;
        if (ctx.state === "suspended") void ctx.resume();

        const gain = ctx.createGain();
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.connect(gain);

        const t = ctx.currentTime;
        const { desde, hasta, duracion, volumen } = TONO_DEL_EQUIPO;
        osc.frequency.setValueAtTime(desde, t);
        osc.frequency.exponentialRampToValueAtTime(hasta, t + duracion * 0.6);
        // Entra y sale con rampa: un corte en seco se oye como un clic.
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(volumen, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
        osc.start(t);
        osc.stop(t + duracion + 0.02);
    } catch (error) {
        // Sin sonido el número sigue subiendo: es una ayuda, no la función.
        // Pero se dice, que si no «a mí no me suena» no se puede explicar.
        console.warn("[chat-equipo] no se pudo sonar", error);
    }
}

// ── Los avisos del navegador ─────────────────────────────────────────────────
//
// Van APARTE del sonido y por eso su preferencia también: el permiso es del
// NAVEGADOR y de este dispositivo. Guardarla contra la persona diría «activados»
// en el ordenador de la oficina donde nadie dio el permiso nunca — un
// interruptor encendido que no hace nada.

export const LLAVE_DE_LOS_AVISOS = "equipo_avisos_del_navegador";

export function quiereAvisosDelNavegador(): boolean {
    try {
        return localStorage.getItem(LLAVE_DE_LOS_AVISOS) === "si";
    } catch {
        return false;
    }
}

export function ponerAvisosDelNavegador(quiere: boolean) {
    try {
        localStorage.setItem(LLAVE_DE_LOS_AVISOS, quiere ? "si" : "no");
    } catch {
        // Ventana privada: se queda para esta sesión y ya.
    }
}

function avisarEnElSistema(aviso: AvisoDelEquipo) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!quiereAvisosDelNavegador()) return;
    try {
        const n = new Notification(
            aviso.motivo === "directo" ? "Mensaje del equipo" : "Te mencionaron",
            {
                body:
                    aviso.motivo === "directo"
                        ? "Tienes un mensaje directo sin leer."
                        : "Te mencionaron en el chat del equipo.",
                icon: "/icon-192.png",
                badge: "/favicon-48.png",
                // La etiqueta es **la del canal**, y tiene que ser LA MISMA
                // que usa el empuje de `lib/empujar-aviso.ts`. Dos motivos, y
                // el segundo es el que obligó a cambiarla:
                //
                // 1. Dentro de una conversación los avisos se sustituyen en vez
                //    de apilarse, que es de donde sale el volumen y lo que
                //    convierte la bandeja del sistema en una lista que nadie
                //    lee. Dos conversaciones distintas sí son dos avisos: son
                //    dos cosas distintas que atender.
                // 2. **Con la pestaña abierta llegan los DOS caminos**: este y
                //    el empuje. Con etiquetas distintas el mismo mensaje saldría
                //    dos veces —uno genérico y otro con el texto—, que es
                //    exactamente el avisar de más del que viene todo esto. Con
                //    la misma, el segundo sustituye al primero y sale uno.
                tag: `chat-equipo-${aviso.canalId}`,
                data: { url: `/chat-equipo?canal=${encodeURIComponent(aviso.canalId)}` },
            },
        );
        setTimeout(() => n.close(), 8000);
    } catch (error) {
        console.warn("[chat-equipo] no se pudo avisar en el sistema", error);
    }
}

// ── Que no suene dos veces con dos pestañas ──────────────────────────────────

/**
 * Apuntarse el aviso, si nadie se lo ha apuntado ya.
 *
 * Devuelve `true` solo para la pestaña que de verdad lo escribió. `localStorage`
 * es lo ÚNICO que comparten las pestañas de un mismo sitio —no se hablan entre
 * ellas—, así que la marca de «esto ya sonó» vive ahí y la primera que llega se
 * la lleva; las demás leen un número que ya es mayor o igual que el suyo y se
 * callan.
 *
 * Y va dentro de un candado de `navigator.locks`, que sí es común a todas las
 * pestañas: sin él, dos que preguntaran a la vez podrían leer las dos antes de
 * que escribiera ninguna y sonar las dos. El candado no está en todos los
 * navegadores, así que sin él se hace igual — la ventana para colarse es de
 * milisegundos y lo que se pierde es un pitido de más, no un mensaje.
 */
async function meLoApunto(llave: string, hasta: number): Promise<boolean> {
    const intentar = (): boolean => {
        try {
            const antes = Number(localStorage.getItem(llave) ?? 0);
            if (Number.isFinite(antes) && antes >= hasta) return false;
            localStorage.setItem(llave, String(hasta));
            return true;
        } catch {
            // Sin `localStorage` no hay forma de coordinarse: suena esta
            // pestaña. Preferible a que no suene ninguna.
            return true;
        }
    };

    const conCandado = navigator.locks?.request;
    if (typeof conCandado !== "function") return intentar();
    try {
        return await navigator.locks.request(llave, intentar);
    } catch {
        return intentar();
    }
}

function laMarcaGuardada(llave: string): number {
    try {
        const n = Number(localStorage.getItem(llave) ?? 0);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function guardarLaMarca(llave: string, hasta: number) {
    try {
        const antes = laMarcaGuardada(llave);
        if (hasta > antes) localStorage.setItem(llave, String(hasta));
    } catch {
        // Ventana privada: se sonará de más al recargar, nada peor.
    }
}

export function useSinLeerDelEquipo() {
    const [total, setTotal] = useState(0);
    const [sonido, setSonido] = useState(true);
    /**
     * En cuántas CONVERSACIONES del equipo hay algo dirigido a esta persona:
     * un directo, o una mención en cualquier canal. Es lo que pinta la
     * insignia del favicon.
     *
     * Sale **gratis** de la misma vuelta: `avisos` ya viene en la respuesta
     * —es lo que decide si suena— y hasta ahora se leía y se tiraba. Un
     * contador aparte habría sido un segundo reloj en todas las pantallas
     * para contar lo que ya estaba encima de la mesa.
     *
     * Dos cosas de lo que este número ES, y ninguna es un detalle:
     *
     * - **No es `total`.** Ese son todos los mensajes sin leer, el general
     *   incluido, y el general es el canal donde está todo el mundo. Un icono
     *   que sube con cada cosa que se dice ahí se aprende a ignorar, y
     *   entonces deja de servir para lo que sí había que contestar — la misma
     *   razón por la que el general sin mención no suena.
     * - **Son conversaciones, no mensajes**: la consulta agrupa por canal. Eso
     *   lo hace sumable con los chats sin leer, que también se cuentan por
     *   conversación. Con uno en mensajes y otro en chats, la suma no
     *   significaría nada.
     */
    const [dirigidos, setDirigidos] = useState(0);

    const sonidoRef = useRef(true);
    sonidoRef.current = sonido;
    /** Lo último que sonó en ESTA pestaña, para no encadenar pitidos. */
    const ultimoPitidoRef = useRef(0);

    const preguntar = useCallback(async () => {
        try {
            const res = await sinLeerDelEquipoAction();
            if (!res.success) {
                console.warn("[chat-equipo] no se pudo contar lo que falta por leer", res.message);
                return;
            }
            setTotal(res.data.total);
            setSonido(res.data.sonido);

            const llave = llaveDeLaMarca(res.data.personaId);
            const avisos = res.data.avisos ?? [];
            // En cuántas conversaciones hay algo dirigido a esta persona. El
            // servidor ya lo decidió al marcar el `motivo` y ya agrupó por
            // canal, así que aquí solo se cuenta.
            setDirigidos(avisos.length);
            const marca = laMarcaGuardada(llave);

            const cual = loQueMereceSonar(avisos, {
                canalAbierto: canalDelante,
                aLaVista: typeof document === "undefined" || !document.hidden,
                marca,
            });

            // La marca avanza SUENE O NO: lo que se descarta por tenerlo
            // delante ya está visto, y dejarlo detrás de la marca lo haría
            // sonar al cambiar de canal.
            const despues = laMarcaDespues(avisos, marca);

            if (!cual) {
                guardarLaMarca(llave, despues);
                return;
            }

            // Quien escribe la marca es quien suena, y solo uno la escribe.
            const mia = await meLoApunto(llave, despues);
            if (!mia) return;

            const ahora = Date.now();
            if (ahora - ultimoPitidoRef.current < SILENCIO_ENTRE_AVISOS_MS) return;
            ultimoPitidoRef.current = ahora;

            if (sonidoRef.current) sonar();
            avisarEnElSistema(cual);
        } catch (error) {
            // Mudo aquí se ve como «el contador nunca sube».
            console.warn("[chat-equipo] falló una vuelta del contador", error);
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        // Sin el guardián de `document.hidden` que tenía antes: la pestaña de
        // fondo es justo el caso para el que existe el sonido.
        const vuelta = () => {
            if (vivo) void preguntar();
        };
        vuelta();

        const id = window.setInterval(vuelta, CADA_CUANTO_CUENTA_MS);
        // Al volver a la pestaña se pregunta de inmediato: el navegador la
        // tenía ralentizada y puede haber cosas de hace un minuto.
        const alVolver = () => {
            if (!document.hidden) vuelta();
        };
        document.addEventListener("visibilitychange", alVolver);
        window.addEventListener(YA_LO_LEI, vuelta);
        window.addEventListener(CAMBIO_EL_SONIDO, vuelta);

        return () => {
            vivo = false;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
            window.removeEventListener(YA_LO_LEI, vuelta);
            window.removeEventListener(CAMBIO_EL_SONIDO, vuelta);
        };
    }, [preguntar]);

    return { total, sonido, dirigidos };
}
