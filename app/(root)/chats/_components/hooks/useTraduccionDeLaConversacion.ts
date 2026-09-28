'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    traduccionesDeLaConversacionAction,
    traducirMensajeAction,
    traducirParaEnviarAction,
} from '@/actions/traduccion-de-chats-actions';
import { esOtroIdioma, type Idioma } from '@/lib/idioma-del-cliente';
import { losIdsQueSePreguntan, type Traduccion } from '@/lib/traduccion-de-chats';

/**
 * La traducción de la conversación ABIERTA, sin ningún botón que la encienda.
 *
 * - Al abrir una conversación pregunta su idioma y las traducciones que ya
 *   tienen sus mensajes; si el cliente no escribe en español y la conversación
 *   la lleva una persona, el servidor traduce ahí mismo lo que falte de lo que
 *   escribió el cliente (y lo cobra a la cuenta dueña).
 * - Cada mensaje nuevo que entra se pregunta solo, una vez.
 * - «Traducir» del menú de un mensaje es el respaldo manual.
 * - Y `prepararElEnvio` traduce lo que escribe el asesor antes de salir.
 *
 * Nada de esto es un reloj propio: va colgado de los mensajes que ya trae la
 * conversación (su sondeo y su tiempo real), así que no añade un ciclo más.
 */

type Conversacion = {
    instanceName?: string;
    remoteJid?: string;
    remoteJidAliases?: string[];
};

type Burbuja = { id: string; content?: string; kind?: string; isNote?: boolean };

/** Lo que se espera entre que cambian los mensajes y se pregunta: junta ráfagas. */
const ESPERA_ANTES_DE_PREGUNTAR_MS = 700;

export type LaTraduccion = {
    idioma: Idioma | null;
    traducciones: ReadonlyMap<string, Traduccion>;
    traducirUno: (messageId: string) => Promise<void>;
    /** Traduce lo que escribió el asesor si hace falta. Nunca lanza. */
    prepararElEnvio: (texto: string) => Promise<{ texto: string; traduccion?: Traduccion }>;
};

export function useTraduccionDeLaConversacion(
    conversacion: Conversacion,
    burbujas: Burbuja[],
): LaTraduccion {
    const instanceName = conversacion.instanceName ?? '';
    const remoteJid = conversacion.remoteJid ?? '';
    const llave = instanceName && remoteJid ? `${instanceName}::${remoteJid}` : '';

    const [estado, setEstado] = useState<{
        llave: string;
        idioma: Idioma | null;
        traducciones: Map<string, Traduccion>;
    }>({ llave: '', idioma: null, traducciones: new Map() });

    // Lo ya preguntado en ESTA conversación, y si el servidor dijo que no puede
    // traducir (sin créditos, sin IA): entonces no se insiste hasta reabrirla.
    const preguntados = useRef<Set<string>>(new Set());
    const sinTraduccion = useRef(false);
    const llaveRef = useRef(llave);
    const aliasesRef = useRef(conversacion.remoteJidAliases);
    aliasesRef.current = conversacion.remoteJidAliases;

    if (llaveRef.current !== llave) {
        llaveRef.current = llave;
        preguntados.current = new Set();
        sinTraduccion.current = false;
    }

    const ids = useMemo(() => losIdsQueSePreguntan(burbujas), [burbujas]);
    const faltan = useMemo(
        () => ids.filter((id) => !preguntados.current.has(id)),
        // `estado` va en las dependencias a propósito: tras cada respuesta se
        // vuelven a mirar los que quedaron por traducir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [ids, estado],
    );
    const firmaDeLoQueFalta = faltan.join('|');

    useEffect(() => {
        if (!llave || !faltan.length) return;
        const pedidos = faltan;
        const deEsta = llave;
        const t = window.setTimeout(() => {
            for (const id of pedidos) preguntados.current.add(id);
            void traduccionesDeLaConversacionAction(
                { instanceName, remoteJid, aliases: aliasesRef.current },
                pedidos,
            )
                .then((r) => {
                    if (llaveRef.current !== deEsta) return;
                    if (!r.success) {
                        console.warn('[traduccion] no se pudieron pedir las traducciones', r.message);
                        return;
                    }
                    if (r.aviso && !sinTraduccion.current) {
                        sinTraduccion.current = true;
                        toast.warning(`No se tradujeron los mensajes del cliente: ${r.aviso}`);
                    }
                    // Lo que quedó por traducir (más de una vuelta) se vuelve a
                    // preguntar: se quitan de «preguntados» los que siguen sin
                    // traducción del cliente.
                    if (r.quedan > 0 && !sinTraduccion.current) {
                        for (const id of pedidos) if (!r.traducciones[id]) preguntados.current.delete(id);
                    }
                    setEstado((prev) => {
                        const base = prev.llave === deEsta ? prev.traducciones : new Map<string, Traduccion>();
                        const siguiente = new Map(base);
                        for (const [id, tr] of Object.entries(r.traducciones)) siguiente.set(id, tr);
                        return { llave: deEsta, idioma: r.idioma, traducciones: siguiente };
                    });
                })
                .catch((error) => {
                    // Una acción no solo devuelve `success: false`: puede
                    // reventar. Se suelta para reintentarlo en la vuelta siguiente.
                    for (const id of pedidos) preguntados.current.delete(id);
                    console.warn('[traduccion] la consulta de traducciones reventó', error);
                });
        }, ESPERA_ANTES_DE_PREGUNTAR_MS);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [llave, firmaDeLoQueFalta]);

    const esDeEsta = estado.llave === llave;
    const idioma = esDeEsta ? estado.idioma : null;
    const traducciones = esDeEsta ? estado.traducciones : VACIO;

    const traducirUno = useCallback(
        async (messageId: string) => {
            if (!llave) return;
            const deEsta = llave;
            const aviso = toast.loading('Traduciendo…');
            try {
                const r = await traducirMensajeAction(
                    { instanceName, remoteJid, aliases: aliasesRef.current },
                    messageId,
                );
                if (!r.success) {
                    toast.error(r.message, { id: aviso });
                    return;
                }
                toast.dismiss(aviso);
                if (llaveRef.current !== deEsta) return;
                setEstado((prev) => {
                    const siguiente = new Map(prev.llave === deEsta ? prev.traducciones : []);
                    siguiente.set(messageId, r.traduccion);
                    return { llave: deEsta, idioma: prev.llave === deEsta ? prev.idioma : null, traducciones: siguiente };
                });
            } catch (error) {
                console.warn('[traduccion] la traducción del mensaje reventó', error);
                toast.error('No se pudo traducir el mensaje.', { id: aviso });
            }
        },
        [llave, instanceName, remoteJid],
    );

    const idiomaRef = useRef(idioma);
    idiomaRef.current = idioma;

    const prepararElEnvio = useCallback(
        async (texto: string): Promise<{ texto: string; traduccion?: Traduccion }> => {
            // Sin idioma extranjero conocido no se pregunta nada: la conversación
            // en español sale exactamente como hoy, sin una vuelta de más.
            if (!llave || !esOtroIdioma(idiomaRef.current) || !texto.trim()) return { texto };
            try {
                const r = await traducirParaEnviarAction(
                    { instanceName, remoteJid, aliases: aliasesRef.current },
                    texto,
                );
                if (!r.success) {
                    toast.warning(`Se envió sin traducir: ${r.message}`);
                    return { texto };
                }
                if (r.aviso) toast.warning(r.aviso);
                return { texto: r.texto, ...(r.traduccion ? { traduccion: r.traduccion } : {}) };
            } catch (error) {
                console.warn('[traduccion] la traducción del envío reventó', error);
                toast.warning('Se envió sin traducir: no se pudo traducir en este momento.');
                return { texto };
            }
        },
        [llave, instanceName, remoteJid],
    );

    return { idioma, traducciones, traducirUno, prepararElEnvio };
}

const VACIO: ReadonlyMap<string, Traduccion> = new Map();
