"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalaDeVideo } from "@/components/video/SalaDeVideo";
import { comoSeGuardaElNombre } from "@/lib/sala-de-video";
import {
    comoEntroAction,
    llamarALaPuertaAction,
} from "@/actions/salas-de-video-actions";

/**
 * Los tres caminos de quien abre un enlace de reunión.
 *
 * | quién | qué ve |
 * | --- | --- |
 * | el enlace ya no vale | por qué, y a quién pedirle otro |
 * | del equipo, y pertenece al canal | dentro, sin esperar a nadie |
 * | cualquier otro | su nombre, y la sala de espera |
 *
 * Y quién es cada uno **lo decide el servidor**, no esta pantalla: aquí solo se
 * pinta lo que contesta `comoEntroAction`. Es la misma regla de siempre —la
 * pantalla es la fachada, la puerta está en la acción— y aquí importa más que
 * en ningún otro sitio, porque esta página la abre gente de fuera.
 */
export function LaReunion({ codigo }: { codigo: string }) {
    const [como, setComo] = useState<
        | { paso: "mirando" }
        | { paso: "cerrada"; motivo: string }
        | { paso: "puerta" }
        | { paso: "esperando"; token: string }
        | { paso: "dentro" }
    >({ paso: "mirando" });
    const [nombre, setNombre] = useState("");
    const [llamando, setLlamando] = useState(false);
    /**
     * La dirección de esta misma página, para poder pasársela a alguien más.
     *
     * Se lee en un efecto y no al pintar: `window` no existe en el servidor, y
     * leerlo directamente rompería la hidratación. Y es la de la barra, no una
     * compuesta a mano: esta página se abre por el dominio que sea, y un
     * enlace compuesto con otro es un enlace que no abre.
     */
    const [enlace, setEnlace] = useState<string | null>(null);
    useEffect(() => setEnlace(window.location.href), []);
    /** Para no volver a preguntar en cada repintado. */
    const preguntado = useRef(false);

    useEffect(() => {
        if (preguntado.current) return;
        preguntado.current = true;
        void (async () => {
            try {
                const res = await comoEntroAction(codigo);
                if (!res.success) {
                    setComo({ paso: "cerrada", motivo: res.message });
                    return;
                }
                if (res.como.modo === "cerrada") {
                    setComo({ paso: "cerrada", motivo: res.como.motivo });
                } else if (res.como.modo === "dentro") {
                    setComo({ paso: "dentro" });
                } else {
                    setComo({ paso: "puerta" });
                }
            } catch (error) {
                // Mudo aquí es una pantalla en blanco sobre un enlace que
                // alguien acaba de recibir: el peor sitio para no decir nada.
                console.warn("[reunion] no se pudo abrir el enlace", error);
                setComo({
                    paso: "cerrada",
                    motivo: "No se pudo abrir la reunión. Revisa tu conexión.",
                });
            }
        })();
    }, [codigo]);

    const llamar = useCallback(async () => {
        const limpio = comoSeGuardaElNombre(nombre);
        if (!limpio) {
            toast.error("Pon tu nombre para que sepan quién entra.");
            return;
        }
        if (llamando) return;
        setLlamando(true);
        try {
            const res = await llamarALaPuertaAction(codigo, limpio);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            // El token vive SOLO en memoria, no en `localStorage`: es la
            // credencial de esta pestaña para esta reunión y no tiene por qué
            // sobrevivir a cerrarla. Guardado, quedaría en el equipo de alguien
            // de fuera mucho después de que la reunión acabara.
            setComo({ paso: "esperando", token: res.token });
        } catch (error) {
            console.warn("[reunion] no se pudo llamar a la puerta", error);
            toast.error("No se pudo entrar. Inténtalo otra vez.");
        } finally {
            setLlamando(false);
        }
    }, [codigo, llamando, nombre]);

    if (como.paso === "mirando") {
        return (
            <Centrada>
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </Centrada>
        );
    }

    if (como.paso === "cerrada") {
        return (
            <Centrada>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
                    <Video className="h-6 w-6 text-zinc-400" />
                </span>
                <p className="text-base font-medium text-zinc-100">{como.motivo}</p>
            </Centrada>
        );
    }

    if (como.paso === "puerta") {
        return (
            <Centrada>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
                    <Video className="h-6 w-6 text-zinc-300" />
                </span>
                <div className="space-y-1">
                    <p className="text-lg font-medium text-zinc-100">Entrar a la reunión</p>
                    <p className="text-sm text-zinc-400">
                        Pon tu nombre. Quien organiza la reunión te dejará pasar.
                    </p>
                </div>
                <form
                    className="flex w-full max-w-sm flex-col gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void llamar();
                    }}
                >
                    <Input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Tu nombre"
                        maxLength={40}
                        autoFocus
                        className="border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                    <Button type="submit" disabled={llamando || !nombre.trim()}>
                        {llamando ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Entrando…
                            </>
                        ) : (
                            "Entrar"
                        )}
                    </Button>
                </form>
                {/* Se dice ANTES de pulsar, no después con el diálogo del
                    navegador ya encima: quien abre un enlace de una reunión
                    tiene derecho a saber que le van a pedir la cámara. */}
                <p className="max-w-sm text-xs text-zinc-500">
                    Al entrar, el navegador te pedirá permiso para usar el micrófono y la
                    cámara.
                </p>
            </Centrada>
        );
    }

    return (
        <SalaDeVideo
            codigo={codigo}
            token={como.paso === "esperando" ? como.token : null}
            enlace={enlace}
            alSalir={() =>
                setComo({
                    paso: "cerrada",
                    motivo: "Has salido de la reunión.",
                })
            }
        />
    );
}

function Centrada({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            {children}
        </div>
    );
}
