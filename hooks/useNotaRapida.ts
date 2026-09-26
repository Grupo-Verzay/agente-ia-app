"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    MS_ANTES_DE_GUARDAR,
    TOPE_DE_LA_NOTA,
    comoTextoDeLaNota,
    hayQueGuardar,
    type EstadoDeLaNota,
} from "@/lib/nota-rapida";
import {
    guardarMiNotaRapidaAction,
    leerMiNotaRapidaAction,
    mandarLaNotaAlModuloAction,
} from "@/actions/nota-rapida-actions";

/**
 * La nota rápida: leerla, guardarla sola y ascenderla a Notas.
 *
 * # Lo que hace que «se guarde sola» sea cierto y no casi
 *
 * Un reloj de guardado por sí solo pierde lo último que se escribe cada vez que
 * alguien cierra la pestaña antes de que salte. Así que hay **cuatro
 * momentos** en los que se vuelca, y los tres últimos no esperan a nadie:
 *
 * 1. Al dejar de teclear (`MS_ANTES_DE_GUARDAR`).
 * 2. Al **cerrar el panel**.
 * 3. Al **esconderse la pestaña** (cambiar de pestaña, minimizar, y en un móvil
 *    lo que pasa antes de que el sistema se lleve la página).
 * 4. Al **irse la página** (`pagehide`), que es el único caso en el que el
 *    navegador ya no va a esperar a nadie: ahí va por
 *    `fetch(..., { keepalive: true })`, que es lo único que sale con la página
 *    muerta. Una acción de servidor no sobrevive a eso.
 *
 * # Lo que se compara es lo GUARDADO, no lo mandado
 *
 * `guardadoRef` es lo último que el servidor confirmó. Con lo último *mandado*,
 * un guardado que falló contaría como hecho y la tecla siguiente no volvería a
 * intentarlo: el texto se quedaría solo en la pantalla y se perdería al
 * recargar, sin un solo error a la vista.
 *
 * # Y no se pide nada hasta que alguien abre el panel
 *
 * Esto cuelga del layout, o sea de TODAS las pantallas. Cargar la nota al
 * entrar a la App sería una consulta por carga para un panel que casi nunca se
 * abre; es el mismo `activo` con el que el chat del equipo no monta su reloj.
 */
export function useNotaRapida(activo: boolean) {
    const [texto, ponerTexto] = useState("");
    const [estado, ponerEstado] = useState<EstadoDeLaNota>("inactivo");
    const [cargando, ponerCargando] = useState(false);
    const [aviso, ponerAviso] = useState<string | null>(null);
    const [recortada, ponerRecortada] = useState(false);

    const textoRef = useRef("");
    const guardadoRef = useRef("");
    const cargadaRef = useRef(false);
    const relojRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    textoRef.current = texto;

    /* ── La primera apertura trae lo apuntado ─────────────────────────────── */
    useEffect(() => {
        if (!activo || cargadaRef.current) return;
        cargadaRef.current = true;
        let vivo = true;
        ponerCargando(true);
        leerMiNotaRapidaAction()
            .then((r) => {
                if (!vivo) return;
                if (!r.success) {
                    // Que no se pueda leer NO se pinta como una nota vacía: eso
                    // se lee como que se borró sola, y encima invita a escribir
                    // encima de lo que sí hay guardado.
                    cargadaRef.current = false;
                    ponerAviso(r.message ?? "No se pudo abrir la nota.");
                    ponerEstado("fallo");
                    return;
                }
                // Se sanea lo que VUELVE, no solo lo que se manda: una
                // respuesta que no traiga una cadena —un despliegue a medias,
                // una acción que cambió de forma— dejaría el papel en
                // `undefined` y la pantalla se cae al primer `trim()`. Lo cazó
                // el banco, con las acciones mudas.
                const traido = comoTextoDeLaNota(r.texto);
                guardadoRef.current = traido;
                ponerTexto(traido);
                ponerEstado("inactivo");
                ponerAviso(null);
            })
            .catch((error) => {
                if (!vivo) return;
                cargadaRef.current = false;
                console.error("[nota-rapida] no se pudo abrir la nota", error);
                ponerAviso("No se pudo abrir la nota.");
                ponerEstado("fallo");
            })
            .finally(() => {
                if (vivo) ponerCargando(false);
            });
        return () => {
            vivo = false;
        };
    }, [activo]);

    /** Guarda lo que haya, si cambió. Devuelve si quedó guardado. */
    const guardarAhora = useCallback(async (): Promise<boolean> => {
        const actual = textoRef.current;
        if (!cargadaRef.current) return true;
        if (!hayQueGuardar(guardadoRef.current, actual)) return true;
        ponerEstado("guardando");
        try {
            const r = await guardarMiNotaRapidaAction(actual);
            if (!r.success) {
                ponerEstado("fallo");
                ponerAviso(r.message ?? "No se pudo guardar.");
                return false;
            }
            const quedo = comoTextoDeLaNota(r.texto);
            guardadoRef.current = quedo;
            ponerRecortada(Boolean(r.recortada));
            // Lo que de verdad quedó guardado vuelve del servidor: si se
            // recortó, la pantalla tiene que enseñar eso y no lo que se
            // escribió, o la siguiente comparación diría que falta por guardar
            // algo que nunca va a caber.
            if (quedo !== actual) ponerTexto(quedo);
            ponerEstado("guardado");
            ponerAviso(null);
            return true;
        } catch (error) {
            console.error("[nota-rapida] no se pudo guardar la nota", error);
            ponerEstado("fallo");
            ponerAviso("No se pudo guardar.");
            return false;
        }
    }, []);

    const guardarAhoraRef = useRef(guardarAhora);
    guardarAhoraRef.current = guardarAhora;

    /** Lo que se escribe: se pinta al momento y se guarda al parar. */
    const escribir = useCallback((valor: string) => {
        const limpio = comoTextoDeLaNota(valor);
        ponerRecortada(valor.length > TOPE_DE_LA_NOTA);
        ponerTexto(limpio);
        textoRef.current = limpio;
        if (relojRef.current) clearTimeout(relojRef.current);
        relojRef.current = setTimeout(() => {
            relojRef.current = null;
            void guardarAhoraRef.current();
        }, MS_ANTES_DE_GUARDAR);
    }, []);

    /* ── Cerrar el panel vuelca lo que haya ───────────────────────────────── */
    const abiertoAntes = useRef(activo);
    useEffect(() => {
        const seCerro = abiertoAntes.current && !activo;
        abiertoAntes.current = activo;
        if (!seCerro) return;
        if (relojRef.current) {
            clearTimeout(relojRef.current);
            relojRef.current = null;
        }
        void guardarAhoraRef.current();
    }, [activo]);

    /* ── Esconderse la pestaña e irse la página ───────────────────────────── */
    useEffect(() => {
        if (typeof window === "undefined") return;

        const alEsconderse = () => {
            if (document.visibilityState !== "hidden") return;
            if (relojRef.current) {
                clearTimeout(relojRef.current);
                relojRef.current = null;
            }
            void guardarAhoraRef.current();
        };

        const alIrse = () => {
            if (!cargadaRef.current) return;
            const actual = textoRef.current;
            if (!hayQueGuardar(guardadoRef.current, actual)) return;
            // La página ya se está yendo: lo único que sale de aquí es un
            // `keepalive`. No se espera la respuesta porque no va a haber quien
            // la lea, y la marca de guardado se mueve a propósito para que un
            // `pagehide` que no acabe en cierre no lo vuelva a mandar.
            guardadoRef.current = actual;
            try {
                void fetch("/api/nota-rapida", {
                    method: "POST",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ texto: actual }),
                });
            } catch (error) {
                console.warn("[nota-rapida] no se pudo volcar al cerrar", error);
            }
        };

        document.addEventListener("visibilitychange", alEsconderse);
        window.addEventListener("pagehide", alIrse);
        return () => {
            document.removeEventListener("visibilitychange", alEsconderse);
            window.removeEventListener("pagehide", alIrse);
        };
    }, []);

    /* ── Y al desmontar, lo mismo: nada se va sin guardar ─────────────────── */
    useEffect(() => {
        return () => {
            if (relojRef.current) clearTimeout(relojRef.current);
            void guardarAhoraRef.current();
        };
    }, []);

    /** Asciende lo apuntado a nota formal. Vacía el papel si sale bien. */
    const mandarAlModulo = useCallback(async () => {
        if (relojRef.current) {
            clearTimeout(relojRef.current);
            relojRef.current = null;
        }
        const actual = textoRef.current;
        ponerEstado("guardando");
        try {
            const r = await mandarLaNotaAlModuloAction(actual);
            if (!r.success) {
                ponerEstado("fallo");
                ponerAviso(r.message ?? "No se pudo guardar en Notas.");
                return r;
            }
            guardadoRef.current = "";
            ponerTexto("");
            textoRef.current = "";
            ponerRecortada(false);
            ponerEstado("inactivo");
            ponerAviso(null);
            return r;
        } catch (error) {
            console.error("[nota-rapida] no se pudo mandar la nota a Notas", error);
            ponerEstado("fallo");
            ponerAviso("No se pudo guardar en Notas.");
            return { success: false as const, message: "No se pudo guardar en Notas." };
        }
    }, []);

    return { texto, escribir, estado, cargando, aviso, recortada, guardarAhora, mandarAlModulo };
}
