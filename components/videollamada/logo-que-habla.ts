"use client";

import {
    ALTO_DEL_LOGO,
    ANCHO_DEL_LOGO,
    CUADROS_DEL_LOGO,
    elCuadroDelLogo,
    elNivelDeLaVoz,
    suavizar,
} from "@/lib/logo-que-habla";
import { LOGO_DE_LA_PORTADA } from "@/lib/disposicion-de-la-videollamada";

/**
 * El VIDEO de Verzy con el motor propio: el logo de Verzay en un lienzo que
 * late con su voz, pasado a pista (`captureStream`). Las cuentas del dibujo
 * están en `lib/logo-que-habla.ts`.
 *
 * Se dibuja con un reloj y no con `requestAnimationFrame`: con la pestaña de
 * fondo el cuadro sigue saliendo (más lento), y la grabación no se queda en
 * negro.
 */
export type LogoQueHabla = {
    pista: MediaStreamTrack;
    /** Cambia la voz que mueve el logo (la de Verzy, o ninguna). */
    escuchar: (voz: MediaStreamTrack | null) => void;
    /** El nivel con el que se dibujó el último cuadro (lo mira el banco). */
    nivel: () => number;
    parar: () => void;
};

let contexto: AudioContext | null = null;
/** Un solo `AudioContext` para la sala: el navegador lo suelta cuando hay un gesto. */
export function elContextoDeAudio(): AudioContext | null {
    if (contexto) return contexto;
    const Ctx = (typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) || null;
    if (!Ctx) return null;
    try {
        contexto = new Ctx();
    } catch (error) {
        console.warn("[sala-propia] no hay audio para el logo", error);
        return null;
    }
    // Sin gesto, el navegador puede dejarlo «suspendido»: el primer toque lo despierta.
    const despertar = () => void contexto?.resume().catch(() => {});
    window.addEventListener("pointerdown", despertar, { once: true, capture: true });
    window.addEventListener("keydown", despertar, { once: true, capture: true });
    void contexto.resume().catch(() => {});
    return contexto;
}

export function crearElLogoQueHabla(): LogoQueHabla {
    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO_DEL_LOGO;
    lienzo.height = ALTO_DEL_LOGO;
    const g = lienzo.getContext("2d");
    const imagen = new Image();
    imagen.src = LOGO_DE_LA_PORTADA;
    let analizador: AnalyserNode | null = null;
    let fuente: MediaStreamAudioSourceNode | null = null;
    const muestras = new Uint8Array(512);
    let nivel = 0;
    let t = 0;

    const dibujar = () => {
        if (!g) return;
        t += 1 / CUADROS_DEL_LOGO;
        if (analizador) {
            analizador.getByteTimeDomainData(muestras);
            nivel = suavizar(nivel, elNivelDeLaVoz(muestras));
        } else {
            nivel = suavizar(nivel, 0);
        }
        const cuadro = elCuadroDelLogo(nivel);
        const cx = ANCHO_DEL_LOGO / 2;
        const cy = ALTO_DEL_LOGO / 2;
        // El fondo de la portada de la sala (azul noche con el centro claro).
        const fondo = g.createRadialGradient(cx, cy * 0.85, 10, cx, cy, ANCHO_DEL_LOGO * 0.62);
        fondo.addColorStop(0, "#10305f");
        fondo.addColorStop(1, "#071224");
        g.fillStyle = fondo;
        g.fillRect(0, 0, ANCHO_DEL_LOGO, ALTO_DEL_LOGO);
        const base = ALTO_DEL_LOGO * 0.36;
        // Los anillos: salen del logo mientras habla, como ondas de voz.
        if (cuadro.anillos > 0) {
            for (let i = 0; i < 3; i++) {
                const fase = (t * 0.9 + i / 3) % 1;
                g.beginPath();
                g.arc(cx, cy, base * (0.62 + fase * 0.55) * cuadro.escala, 0, Math.PI * 2);
                g.strokeStyle = `rgba(56, 189, 248, ${(cuadro.anillos * (1 - fase)).toFixed(3)})`;
                g.lineWidth = 3;
                g.stroke();
            }
        }
        // El círculo de la «foto de perfil» y el logo dentro.
        const radio = base * 0.6 * cuadro.escala;
        g.save();
        g.beginPath();
        g.arc(cx, cy, radio, 0, Math.PI * 2);
        g.fillStyle = "#0b1f3f";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = cuadro.hablando ? "rgba(56, 189, 248, 0.9)" : "rgba(148, 163, 184, 0.35)";
        g.stroke();
        g.clip();
        if (imagen.complete && imagen.naturalWidth > 0) {
            const lado = radio * 1.5;
            g.drawImage(imagen, cx - lado / 2, cy - lado / 2, lado, lado);
        }
        g.restore();
    };
    dibujar();
    const reloj = window.setInterval(dibujar, Math.round(1000 / CUADROS_DEL_LOGO));
    const pista = lienzo.captureStream(CUADROS_DEL_LOGO).getVideoTracks()[0];

    return {
        pista,
        escuchar(voz) {
            try {
                fuente?.disconnect();
            } catch {
                // Ya estaba suelta.
            }
            fuente = null;
            analizador = null;
            if (!voz) return;
            const ctx = elContextoDeAudio();
            if (!ctx) return;
            try {
                fuente = ctx.createMediaStreamSource(new MediaStream([voz]));
                analizador = ctx.createAnalyser();
                analizador.fftSize = 1024;
                fuente.connect(analizador);
            } catch (error) {
                console.warn("[sala-propia] el logo no puede oír la voz de Verzy; queda quieto", error);
                analizador = null;
            }
        },
        nivel: () => nivel,
        parar() {
            window.clearInterval(reloj);
            try {
                fuente?.disconnect();
            } catch {
                // Ya estaba suelta.
            }
            pista.stop();
        },
    };
}
