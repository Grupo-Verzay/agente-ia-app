"use client";

import { useEffect, useState } from "react";

import { CallDialog } from "@/app/(root)/chats/_components/CallDialog";

/**
 * Lo que hace falta para colocar una llamada de WhatsApp.
 *
 * El número va en dígitos, como lo espera `CallDialog`. Lo demás es opcional:
 * el nombre para la tarjeta, y la línea por la que sale —si no se pasa, la
 * tarjeta resuelve la de la cuenta que se está gestionando—.
 */
export interface DatosDeLaLlamada {
    phone: string;
    contactName?: string;
    instanceType?: string;
    instanceName?: string;
}

/**
 * El anfitrión de la llamada de WhatsApp: cuelga del layout, como el oyente de
 * llamadas del equipo y el panel de una reunión.
 *
 * # Por qué vive aquí y no en el chat
 *
 * `CallDialog` sostiene la conexión viva: el `RTCPeerConnection`, el micrófono,
 * el `<audio>` y los relojes que vigilan la llamada. Montado dentro de
 * `ChatHeader` —o de una fila del CRM, o de una burbuja— se desmontaba al
 * **cambiar de conversación** (la cabecera se rehace) y al **navegar a otra
 * pantalla** (el árbol de la ruta entero se va), y su `cleanup` de desmontaje
 * cerraba la conexión: la llamada se cortaba a media frase, sin que nadie la
 * colgara.
 *
 * Un layout **no se remonta al navegar entre pantallas del mismo grupo**, así
 * que lo que cuelga de él sobrevive. Es exactamente lo que ya hacen
 * `OyenteDeLlamadas` (el timbre del equipo) y `ReunionEnLaPlataforma` (el panel
 * de video), y por el mismo motivo: una llamada tiene que seguir viva estés
 * donde estés dentro de la App.
 *
 * # Cómo se abre, y por qué por un evento y no por un contexto
 *
 * Igual que la reunión (`abrirLaReunionAqui`): quien la dispara puede estar en
 * cualquier pantalla —la cabecera de un chat, el menú de una fila del CRM, una
 * burbuja, el marcador de Llamadas—. Con un contexto habría que envolver media
 * aplicación para que un botón de una tabla le hablara a un panel del layout.
 *
 * **No pinta nada mientras no hay ninguna llamada**, así que estar aquí no
 * cuesta: ni `getStats`, ni micrófono pedido, ni `<audio>`.
 */
export function AnfitrionDeLlamada() {
    /**
     * La llamada en curso, con un `nonce` que sube en cada apertura.
     *
     * El `nonce` es la `key` de `CallDialog`, y hace falta: llamar otra vez —al
     * mismo número o a otro— tiene que **empezar una llamada nueva de cero**, y
     * eso se consigue remontando la tarjeta. Sin la `key`, pedir una segunda
     * llamada al mismo número mientras la primera sigue abierta no volvería a
     * arrancar `startCall` (su efecto depende de `open`, que ya era `true`), y
     * el botón no haría nada. Con ella, la tarjeta anterior se desmonta —su
     * `cleanup` cierra esa conexión— y la nueva arranca: una llamada a la vez,
     * como la reunión cambia de sala en vez de apilar dos.
     */
    const [llamada, setLlamada] = useState<(DatosDeLaLlamada & { nonce: number }) | null>(null);

    useEffect(() => {
        const alAbrir = (e: Event) => {
            const d = (e as CustomEvent<DatosDeLaLlamada>).detail;
            const phone = (d?.phone ?? "").replace(/\D/g, "");
            if (!phone) return;
            setLlamada((prev) => ({
                phone,
                contactName: d?.contactName,
                instanceType: d?.instanceType,
                instanceName: d?.instanceName,
                nonce: (prev?.nonce ?? 0) + 1,
            }));
        };
        window.addEventListener("llamada:abrir", alAbrir);
        return () => window.removeEventListener("llamada:abrir", alAbrir);
    }, []);

    if (!llamada) return null;

    return (
        <CallDialog
            key={llamada.nonce}
            open
            onClose={() => setLlamada(null)}
            phone={llamada.phone}
            contactName={llamada.contactName}
            instanceType={llamada.instanceType}
            instanceName={llamada.instanceName}
        />
    );
}

/**
 * Colocar una llamada de WhatsApp desde cualquier pantalla.
 *
 * Le habla al anfitrión del layout por un evento del navegador, igual que
 * `abrirLaReunionAqui`. Quien lo llama no monta ninguna tarjeta ni sostiene
 * ninguna conexión: solo dice a quién llamar.
 */
export function abrirLlamadaAqui(datos: DatosDeLaLlamada): void {
    window.dispatchEvent(new CustomEvent("llamada:abrir", { detail: datos }));
}
