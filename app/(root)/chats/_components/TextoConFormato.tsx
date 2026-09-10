'use client';

import React from 'react';
import { leerFormatoDeWhatsapp, pareceLlevarFormato, type NodoDeTexto } from '@/lib/formato-whatsapp';

/**
 * El texto de un mensaje, con las marcas de WhatsApp ya pintadas.
 *
 * Antes la burbuja sacaba el texto tal cual, así que el asesor leía
 * `*confirmado*` mientras su cliente veía **confirmado** en el teléfono. Aquí
 * solo se pinta: quien entiende las marcas es `lib/formato-whatsapp.ts`.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Todo va en línea** (`<span>`, `<strong>`, `<em>`). El padre es un `<p>`
 *    con `whitespace-pre-wrap` y es él quien conserva los saltos de línea; meter
 *    aquí un bloque los rompería.
 * 2. **Si no hay ninguna marca, se devuelve la cadena y ya.** La conversación se
 *    repinta con cada mensaje que entra y la inmensa mayoría son texto pelado:
 *    no hace falta montar nodos para nada.
 * 3. **Lo que no case, se enseña tal cual.** Un mensaje recortado por «Ver más»
 *    puede partir una marca por la mitad; entonces se ve el asterisco, que es
 *    exactamente lo que hace WhatsApp.
 */
export function TextoConFormato({ texto }: { texto: string }): React.ReactElement | null {
    if (!texto) return null;
    if (!pareceLlevarFormato(texto)) return <>{texto}</>;
    return <>{pintar(leerFormatoDeWhatsapp(texto))}</>;
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
