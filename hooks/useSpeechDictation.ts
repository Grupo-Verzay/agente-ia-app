"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Dictado por voz usando la Web Speech API del navegador (gratis, sin backend).
 * Transcribe lo hablado y lo agrega al texto actual del campo objetivo.
 *
 * Uso:
 *   const dictation = useSpeechDictation();
 *   {dictation.supported && (
 *     <Button onClick={() => dictation.toggle(text, setText)}>...</Button>
 *   )}
 */
export function useSpeechDictation(lang = "es-ES") {
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const baseRef = useRef("");

    useEffect(() => {
        const SR =
            typeof window !== "undefined" &&
            ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
        setSupported(!!SR);
        return () => {
            try {
                recognitionRef.current?.stop();
            } catch {
                /* noop */
            }
        };
    }, []);

    const stop = () => {
        try {
            recognitionRef.current?.stop();
        } catch {
            /* noop */
        }
    };

    /**
     * Inicia/detiene el dictado. Conserva el texto actual y le suma lo dictado,
     * llamando a `setValue` con el resultado en vivo.
     */
    const toggle = (current: string, setValue: (value: string) => void) => {
        if (listening) {
            stop();
            return;
        }

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            toast.error("Tu navegador no soporta dictado por voz");
            return;
        }

        const recognition = new SR();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = true;

        baseRef.current = current.trim() ? `${current.trim()} ` : "";

        recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setValue((baseRef.current + transcript).trimStart());
        };
        recognition.onerror = (event: any) => {
            setListening(false);
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                toast.error("Permiso de micrófono denegado");
            } else if (event.error === "no-speech") {
                toast.message("No se detectó voz");
            }
        };
        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
        try {
            recognition.start();
            setListening(true);
        } catch {
            setListening(false);
        }
    };

    return { supported, listening, toggle, stop };
}
