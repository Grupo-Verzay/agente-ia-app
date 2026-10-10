"use client";

import { API_DE_LLAMADAS_DEL_MOTOR, CANAL_DEL_MOTOR } from "@/lib/motor-de-verzay";

/**
 * La conexión del navegador con OpenAI Realtime (el motor propio), por WebRTC:
 * la voz del cliente sale por una pista, la de Verzy llega por otra, y los
 * eventos van por el canal de datos `oai-events`. La autoriza la clave de UN
 * uso que da el servidor (`/api/videollamada/motor`); la de la cuenta nunca
 * llega aquí.
 *
 * Es lo único de la sala propia que habla con OpenAI: el banco lo cambia por
 * uno de mentira con el mismo contrato.
 */
export type ConexionDelMotor = {
    /** La voz de Verzy. */
    voz: MediaStreamTrack;
    enviar: (evento: Record<string, unknown>) => void;
    alEvento: (fn: (evento: unknown) => void) => void;
    /** Se cortó sin que nadie la cerrara. */
    alCaerse: (fn: (porque: string) => void) => void;
    /** Cambia la voz que oye Verzy (el micrófono, o la mezcla con un asesor). */
    cambiarLaEntrada: (pista: MediaStreamTrack | null) => void;
    cerrar: () => void;
};

/** Lo más que se espera a que el motor conteste y abra su canal. */
export const ESPERA_DEL_MOTOR_MS = 15_000;

export async function conectarElMotor(input: { clave: string; entrada: MediaStreamTrack | null }): Promise<ConexionDelMotor> {
    const pc = new RTCPeerConnection();
    const transceptor = pc.addTransceiver("audio", { direction: "sendrecv" });
    if (input.entrada) await transceptor.sender.replaceTrack(input.entrada);
    const canal = pc.createDataChannel(CANAL_DEL_MOTOR);
    const oyentes: Array<(e: unknown) => void> = [];
    const caidas: Array<(porque: string) => void> = [];
    let cerrada = false;
    const caer = (porque: string) => {
        if (cerrada) return;
        cerrada = true;
        caidas.forEach((f) => f(porque));
    };

    const voz = new Promise<MediaStreamTrack>((resolve) => {
        pc.addEventListener("track", (ev) => {
            if (ev.track.kind === "audio") resolve(ev.track);
        });
    });
    const abierto = new Promise<void>((resolve) => canal.addEventListener("open", () => resolve(), { once: true }));
    canal.addEventListener("message", (ev) => {
        let evento: unknown = null;
        try {
            evento = JSON.parse(String(ev.data));
        } catch {
            return;
        }
        oyentes.forEach((f) => f(evento));
    });
    canal.addEventListener("close", () => caer("canal cerrado"));
    pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") caer(`conexión ${pc.connectionState}`);
    });

    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const respuesta = await fetch(API_DE_LLAMADAS_DEL_MOTOR, {
        method: "POST",
        body: oferta.sdp,
        headers: { authorization: `Bearer ${input.clave}`, "content-type": "application/sdp" },
    });
    if (!respuesta.ok) {
        pc.close();
        throw new Error(`el motor no aceptó la conexión (${respuesta.status})`);
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await respuesta.text() });

    let tope: number | undefined;
    const plazo = new Promise<never>((_, reject) => {
        tope = window.setTimeout(() => reject(new Error("el motor no contestó a tiempo")), ESPERA_DEL_MOTOR_MS);
    });
    let pistaDeVerzy: MediaStreamTrack;
    try {
        [pistaDeVerzy] = await Promise.race([Promise.all([voz, abierto]), plazo]);
    } catch (error) {
        pc.close();
        throw error;
    } finally {
        window.clearTimeout(tope);
    }

    return {
        voz: pistaDeVerzy,
        enviar(evento) {
            if (canal.readyState !== "open") {
                console.warn("[motor] el canal no está abierto; no salió", { tipo: evento.type });
                return;
            }
            canal.send(JSON.stringify(evento));
        },
        alEvento: (fn) => void oyentes.push(fn),
        alCaerse: (fn) => void caidas.push(fn),
        cambiarLaEntrada(pista) {
            void transceptor.sender.replaceTrack(pista).catch((e) => console.warn("[motor] no se pudo cambiar la voz que oye Verzy", e));
        },
        cerrar() {
            cerrada = true;
            try {
                canal.close();
            } catch {
                // Ya cerrado.
            }
            pc.close();
        },
    };
}
