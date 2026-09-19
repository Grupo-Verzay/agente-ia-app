'use client';

import React from 'react';
import Link from 'next/link';

import { leerFormatoDeWhatsapp, pareceLlevarFormato, type NodoDeTexto } from '@/lib/formato-whatsapp';
import {
    laRutaDeLaPlataforma,
    pareceLlevarEnlaces,
    partirPorEnlaces,
} from '@/lib/enlaces-del-texto';

/**
 * El texto de un mensaje, con las marcas de WhatsApp ya pintadas.
 *
 * Antes la burbuja sacaba el texto tal cual, así que el asesor leía
 * `*confirmado*` mientras su cliente veía **confirmado** en el teléfono. Aquí
 * solo se pinta: quien entiende las marcas es `lib/formato-whatsapp.ts`.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Todo va en línea** (`<span>`, `<strong>`, `<em>`, `<a>`). El padre es un
 *    `<p>` con `whitespace-pre-wrap` y es él quien conserva los saltos de
 *    línea; meter aquí un bloque los rompería.
 * 2. **Si no hay ninguna marca, se devuelve la cadena y ya.** La conversación
 *    se repinta con cada mensaje que entra y la inmensa mayoría son texto
 *    pelado: no hace falta montar nodos para nada.
 * 3. **Lo que no case, se enseña tal cual.** Un mensaje recortado por «Ver más»
 *    puede partir una marca por la mitad; entonces se ve el asterisco, que es
 *    exactamente lo que hace WhatsApp.
 */
export function TextoConFormato({
    texto,
    enlaces = false,
    origen = '',
}: {
    texto: string;
    /**
     * Si las direcciones se vuelven pulsables.
     *
     * **Apagado por defecto, y eso no es pereza.** Este componente lo comparten
     * el chat del equipo y Chats, y en Chats el texto viene de un contacto de
     * WhatsApp que puede ser cualquiera: convertir en un clic el enlace de un
     * desconocido es una decisión de producto, no un detalle de pintado, y no
     * se toma de refilón al arreglar otra pantalla. Encendido donde el texto lo
     * escribió alguien del equipo.
     */
    enlaces?: boolean;
    /**
     * El origen de esta plataforma, para saber qué enlace es de dentro.
     *
     * Llega de fuera y no se lee aquí de `window` a propósito: este componente
     * también se pinta en el servidor, donde `window` no existe, y leerlo al
     * pintar daría una salida en el servidor y otra en el navegador — o sea una
     * hidratación rota. Quien lo tiene es la pantalla.
     */
    origen?: string;
}): React.ReactElement | null {
    if (!texto) return null;

    if (enlaces && pareceLlevarEnlaces(texto)) {
        // Los ENLACES primero y el formato después. Es el orden, y el porqué
        // está en `lib/enlaces-del-texto.ts`: hay direcciones que llevan `_` o
        // `*` dentro, y pasando el formato antes salen sin ellos — un enlace
        // que lleva a otro sitio y que en pantalla parece normal.
        return (
            <>
                {partirPorEnlaces(texto).map((parte, i) =>
                    parte.tipo === 'enlace' ? (
                        <Enlace key={i} texto={parte.texto} href={parte.href} origen={origen} />
                    ) : (
                        <React.Fragment key={i}>{conFormato(parte.texto)}</React.Fragment>
                    ),
                )}
            </>
        );
    }

    return <>{conFormato(texto)}</>;
}

function conFormato(texto: string): React.ReactNode {
    if (!texto) return null;
    if (!pareceLlevarFormato(texto)) return texto;
    return pintar(leerFormatoDeWhatsapp(texto));
}

/**
 * Una dirección dentro de un mensaje.
 *
 * Dos caminos, y la diferencia importa:
 *
 * - **De dentro**: un `Link`, que navega **sin recargar**. Con un `<a>` normal
 *   la plataforma entera se vuelve a cargar —sesión, menú, módulos— para ir a
 *   una pantalla que ya estaba ahí, y se pierde lo que hubiera abierto: un
 *   panel, una reunión plegada.
 * - **De fuera**: pestaña nueva con `rel="noopener noreferrer"`. `noopener`
 *   no es cosmético: sin él, la página que se abre recibe un `window.opener`
 *   con el que puede **cambiar la dirección de esta pestaña** por otra que se
 *   le parezca. `noreferrer` además evita contarle de qué sitio se venía.
 */
function Enlace({
    texto,
    href,
    origen,
}: {
    texto: string;
    href: string;
    origen: string;
}): React.ReactElement {
    const clases = 'break-all underline underline-offset-2 hover:opacity-80';
    const ruta = laRutaDeLaPlataforma(href, origen);

    if (ruta) {
        return (
            <Link href={ruta} className={clases}>
                {texto}
            </Link>
        );
    }
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={clases}>
            {texto}
        </a>
    );
}

function pintar(nodos: NodoDeTexto[]): React.ReactNode[] {
    return nodos.map((nodo, i) => {
        if (nodo.tipo === 'texto') return <React.Fragment key={i}>{nodo.texto}</React.Fragment>;
        if (nodo.tipo === 'mono') {
            return (
                <code key={i} className="font-mono text-[0.9em] break-words">
                    {nodo.texto}
                </code>
            );
        }
        if (nodo.tipo === 'negrilla') return <strong key={i} className="font-semibold">{pintar(nodo.hijos)}</strong>;
        if (nodo.tipo === 'cursiva') return <em key={i}>{pintar(nodo.hijos)}</em>;
        return <s key={i}>{pintar(nodo.hijos)}</s>;
    });
}
