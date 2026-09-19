'use client';

import React, { createContext, useContext, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { transcribirNotaDeChatAction } from '@/actions/chat-manual-actions';
import {
    TOPE_DE_SEGUNDOS,
    costoDeLaNota,
    laMarcaVieja,
    porQueNoSeTranscribio,
    sePuedeReintentar,
    type NoSeTranscribio,
} from '@/lib/transcripcion-de-voz';

/**
 * El botón de transcribir de una nota de voz, y su resultado.
 *
 * # Bajo demanda, y con el precio delante
 *
 * Antes esto no existía: las notas se transcribían solas al llegar, cada una de
 * decenas de clientes, **la leyera alguien o no**. Ahora no se gasta un crédito
 * hasta que alguien pulsa, y el botón dice cuánto cuesta — **la duración ES el
 * precio**, así que ocultarlo sería un cheque en blanco, y eso reaparece como
 * «¿por qué bajaron mis créditos?».
 *
 * # La conversación viaja por CONTEXTO, no por props
 *
 * Hacen falta la línea y el contacto para pedirla, y esto se pinta al fondo de
 * `MessageBubble` → `MediaRenderer`. Bajarlos como props por los tres serían
 * tres ficheros tocados para transportar dos cadenas; el contexto es el mismo
 * patrón que ya usa el visor de medios de esta misma lista
 * (`useMediaGallery`). Fuera de una conversación no hay proveedor y el botón
 * sencillamente no se pinta, que es lo correcto.
 */

type ConversacionDeLaNota = {
    instanceName?: string;
    remoteJid?: string;
    remoteJidAliases?: string[];
    apiKeyData?: { url: string; key: string };
};

const Contexto = createContext<ConversacionDeLaNota | null>(null);

export const ConversacionDeLaNotaProvider = Contexto.Provider;

export function useConversacionDeLaNota(): ConversacionDeLaNota | null {
    return useContext(Contexto);
}

/** «3 créditos», y «1 crédito» en singular. */
function comoSeLeeElCosto(creditos: number): string {
    return creditos === 1 ? '1 crédito' : `${creditos} créditos`;
}

export function TranscribirNota({
    messageId,
    segundos,
    transcripcion,
    transcripcionMotivo,
}: {
    messageId: string;
    /** Lo que dura la nota: de aquí sale el precio. */
    segundos?: number;
    /** El texto ya pagado, si alguien la pidió antes. */
    transcripcion?: string;
    /** La marca que dejó el paso automático mientras existió. */
    transcripcionMotivo?: 'muy_larga' | 'fallo';
}) {
    const conversacion = useConversacionDeLaNota();
    const [pidiendo, setPidiendo] = useState(false);
    const [texto, setTexto] = useState<string | null>(null);
    const [fallo, setFallo] = useState<{ motivo: NoSeTranscribio; message: string } | null>(null);

    // El del servidor manda: lo que se pidió en esta pestaña vale hasta que el
    // reloj de la conversación lo traiga guardado, y entonces son el mismo texto.
    const elTexto = transcripcion || texto;

    if (elTexto) {
        return (
            <p className="mt-1 whitespace-pre-wrap break-words px-1 text-[13px] leading-snug text-gray-700 dark:text-gray-200">
                {elTexto}
            </p>
        );
    }

    // Sin conversación no se puede pedir nada, así que no se ofrece un botón que
    // al pulsarlo daría error.
    const instanceName = conversacion?.instanceName;
    const remoteJid = conversacion?.remoteJid;
    if (!instanceName || !remoteJid || !messageId) return null;

    // Una marca vieja de `muy_larga` es firme y se explica; una de `fallo` NO
    // lo es —se escribía ante cualquier tropiezo, y en toda línea de WhatsApp
    // Mensajería se escribía siempre— así que se ignora y la nota vuelve a
    // ofrecer su botón. Ver `laMarcaVieja`.
    const vieja = laMarcaVieja(transcripcionMotivo);
    if ('explicar' in vieja) {
        return (
            <p className="mt-1 px-1 text-[11px] italic text-gray-500 dark:text-gray-400">
                {vieja.explicar}
            </p>
        );
    }

    // Una nota por encima del tope no se transcribe, así que **no se ofrece**: un
    // botón que al pulsarlo da error es peor que no tenerlo. Y se dice por qué —
    // sin eso, una nota sin botón al lado de otras con botón se lee como que la
    // función está rota.
    const dura = Number.isFinite(segundos) && (segundos ?? 0) > 0 ? (segundos as number) : 0;
    if (dura > TOPE_DE_SEGUNDOS) {
        return (
            <p className="mt-1 px-1 text-[11px] italic text-gray-500 dark:text-gray-400">
                {porQueNoSeTranscribio('muy_larga')}
            </p>
        );
    }

    const pedirla = async () => {
        if (pidiendo) return;
        setPidiendo(true);
        setFallo(null);
        try {
            const res = await transcribirNotaDeChatAction(
                { apiKeyData: conversacion?.apiKeyData, instanceName },
                remoteJid,
                messageId,
                { remoteJidAliases: conversacion?.remoteJidAliases },
            );
            if (!res.success) {
                setFallo({ motivo: res.motivo, message: res.message });
                return;
            }
            setTexto(res.transcripcion);
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y
            // entonces el «Transcribiendo…» se quedaría puesto para siempre.
            console.warn('[chats] la transcripción de la nota reventó', error);
            setFallo({
                motivo: 'no_transcribio',
                message: porQueNoSeTranscribio('no_transcribio'),
            });
        } finally {
            setPidiendo(false);
        }
    };

    // **El motivo se queda debajo de la nota, no en un aviso que se va.** Quien
    // pulsa y ve pasar un mensaje de un segundo no sabe después por qué no hay
    // texto; y el motivo decide qué hacer —recargar créditos, avisar a soporte,
    // o sencillamente volver a pulsar—.
    const puedeReintentar = !fallo || sePuedeReintentar(fallo.motivo);
    const costo = costoDeLaNota(dura).creditos;

    return (
        <div className="mt-1 flex flex-col gap-0.5 px-1">
            {fallo && (
                <p className="text-[11px] italic text-amber-700 dark:text-amber-400">
                    {fallo.message}
                </p>
            )}
            {puedeReintentar && (
                <button
                    type="button"
                    onClick={() => void pedirla()}
                    disabled={pidiendo}
                    className="self-start text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-100"
                >
                    {pidiendo ? (
                        <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Transcribiendo…
                        </span>
                    ) : fallo ? (
                        'Reintentar'
                    ) : (
                        `Transcribir (${comoSeLeeElCosto(costo)})`
                    )}
                </button>
            )}
        </div>
    );
}
