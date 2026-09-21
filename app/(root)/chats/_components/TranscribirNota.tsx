'use client';

import React, { createContext, useContext, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

import { transcribirNotaDeChatAction } from '@/actions/chat-manual-actions';
import { cn } from '@/lib/utils';
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
 * # Dos nodos y un solo estado: por eso es un HOOK
 *
 * Lo que se pinta va a **dos sitios distintos de la burbuja**: la pastilla al
 * renglón de la hora —donde ya viven «Asesor», «Agente IA», «Editado» y
 * «Eliminado»— y el texto debajo del reproductor, que es donde se lee. Con dos
 * componentes serían dos estados que mantener a la par: se pulsa arriba y el
 * texto tiene que salir abajo.
 *
 * Así que el estado vive en un hook y quien lo llama coloca cada nodo donde le
 * toca. Es lo mismo que hacía el componente de antes, solo que sin obligar a
 * que las dos mitades estén pegadas.
 *
 * # Por qué el renglón de la hora y no uno propio
 *
 * En un renglón propio la burbuja crece de alto por cada nota —y una
 * conversación de notas son todas— y un botón suelto debajo del audio se lee
 * como un texto de error, que es justo lo que había antes aquí. El pie de la
 * burbuja ya es la fila de los rótulos pequeños: cabe sin ocupar nada.
 *
 * # La conversación viaja por CONTEXTO, no por props
 *
 * Hacen falta la línea y el contacto para pedirla, y esto se usa al fondo de
 * `MessageBubble`. Bajarlos como props por toda la lista serían tres ficheros
 * tocados para transportar dos cadenas; el contexto es el mismo patrón que ya
 * usa el visor de medios de esta misma lista (`useMediaGallery`). Fuera de una
 * conversación no hay proveedor y el botón sencillamente no se pinta, que es lo
 * correcto.
 */

type ConversacionDeLaNota = {
    instanceName?: string;
    /**
     * Por donde conecta esa linea. No lo usa la transcripcion: lo usa el boton
     * de «devolver llamada» de una burbuja, que tiene que llamar por la linea
     * de la conversacion y no por la de la cuenta de quien mira.
     */
    instanceType?: string;
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

export type LoDeLaNota = {
    /** La pastilla, para el renglón de la hora. */
    pastilla: React.ReactNode | null;
    /** El texto —o el motivo por el que no lo hay—, para debajo del audio. */
    debajoDelAudio: React.ReactNode | null;
};

const NADA: LoDeLaNota = { pastilla: null, debajoDelAudio: null };

export function useTranscribirNota({
    messageId,
    segundos,
    transcripcion,
    transcripcionMotivo,
    esNotaEntrante,
}: {
    messageId?: string;
    /** Lo que dura la nota: de aquí sale el precio, y baja del servidor. */
    segundos?: number;
    /** El texto ya pagado, si alguien la pidió antes. */
    transcripcion?: string;
    /** La marca que dejó el paso automático mientras existió. */
    transcripcionMotivo?: 'muy_larga' | 'fallo';
    /** Solo las notas que ENTRAN se transcriben: lo propio ya está en texto. */
    esNotaEntrante: boolean;
}): LoDeLaNota {
    const conversacion = useConversacionDeLaNota();
    const [pidiendo, setPidiendo] = useState(false);
    const [texto, setTexto] = useState<string | null>(null);
    const [fallo, setFallo] = useState<{ motivo: NoSeTranscribio; message: string } | null>(null);

    // El del servidor manda: lo que se pidió en esta pestaña vale hasta que el
    // reloj de la conversación lo traiga guardado, y entonces son el mismo texto.
    const elTexto = transcripcion || texto;

    const parrafo = (contenido: string, clase: string) => (
        <p className={cn('mt-1 whitespace-pre-wrap break-words px-1 leading-snug', clase)}>
            {contenido}
        </p>
    );

    if (elTexto) {
        return {
            pastilla: null,
            debajoDelAudio: parrafo(
                elTexto,
                'text-[13px] text-gray-700 dark:text-gray-200',
            ),
        };
    }

    if (!esNotaEntrante) return NADA;

    // Sin conversación no se puede pedir nada, así que no se ofrece un botón que
    // al pulsarlo daría error.
    const instanceName = conversacion?.instanceName;
    const remoteJid = conversacion?.remoteJid;
    if (!instanceName || !remoteJid || !messageId) return NADA;

    // Una marca vieja de `muy_larga` es firme y se explica; una de `fallo` NO
    // lo es —se escribía ante cualquier tropiezo, y en toda línea de WhatsApp
    // Mensajería se escribía siempre— así que se ignora y la nota vuelve a
    // ofrecer su botón. Ver `laMarcaVieja`.
    const vieja = laMarcaVieja(transcripcionMotivo);
    if ('explicar' in vieja) {
        return {
            pastilla: null,
            debajoDelAudio: parrafo(
                vieja.explicar,
                'text-[11px] italic text-gray-500 dark:text-gray-400',
            ),
        };
    }

    // Una nota por encima del tope no se transcribe, así que **no se ofrece**: un
    // botón que al pulsarlo da error es peor que no tenerlo. Y se dice por qué —
    // sin eso, una nota sin botón al lado de otras con botón se lee como que la
    // función está rota.
    const dura = Number.isFinite(segundos) && (segundos ?? 0) > 0 ? (segundos as number) : 0;
    if (dura > TOPE_DE_SEGUNDOS) {
        return {
            pastilla: null,
            debajoDelAudio: parrafo(
                porQueNoSeTranscribio('muy_larga'),
                'text-[11px] italic text-gray-500 dark:text-gray-400',
            ),
        };
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
    // o sencillamente volver a pulsar—. Va abajo y no en la pastilla porque son
    // frases enteras: en el renglón de la hora partirían la fila.
    const puedeReintentar = !fallo || sePuedeReintentar(fallo.motivo);
    const costo = costoDeLaNota(dura).creditos;

    return {
        pastilla: puedeReintentar ? (
            <button
                type="button"
                onClick={() => void pedirla()}
                disabled={pidiendo}
                title={
                    fallo
                        ? 'Volver a intentarlo. No se cobró nada.'
                        : `Transcribir esta nota de voz (${comoSeLeeElCosto(costo)})`
                }
                className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5',
                    'text-[0.6rem] font-medium leading-none transition-colors',
                    'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    'dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20',
                    'disabled:cursor-default disabled:opacity-60',
                )}
            >
                {pidiendo ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                ) : (
                    <FileText className="h-2.5 w-2.5" aria-hidden />
                )}
                <span>{pidiendo ? 'Transcribiendo…' : fallo ? 'Reintentar' : 'Transcribir'}</span>
                {/* El precio, más claro que la palabra: informa sin competir
                  * con la acción. Y va SIEMPRE que haya botón, también al
                  * reintentar, porque lo que se va a gastar es lo mismo. */}
                {!pidiendo && (
                    <span className="font-normal text-gray-400 dark:text-gray-400">
                        {comoSeLeeElCosto(costo)}
                    </span>
                )}
            </button>
        ) : null,
        debajoDelAudio: fallo
            ? parrafo(fallo.message, 'text-[11px] italic text-amber-700 dark:text-amber-400')
            : null,
    };
}
