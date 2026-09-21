"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmblemaDeLaReunion } from "@/components/video/EmblemaDeLaReunion";
import { SalaDeVideo } from "@/components/video/SalaDeVideo";
import { comoSeGuardaElNombre, laDireccionDeLaSala } from "@/lib/sala-de-video";
import type { EstadoDeLaVentana } from "@/lib/ventana-de-reunion";
import {
    comoEntroAction,
    llamarALaPuertaAction,
} from "@/actions/salas-de-video-actions";

/**
 * Entrar a una reunión: la puerta y, detrás de ella, la sala.
 *
 * # Por qué esto existe y no vive dentro de cada pantalla
 *
 * **`comoEntroAction` es lo único que inscribe a alguien del equipo en
 * `sala_participantes`** (`entrarConCuenta`), y sin esa fila el latido contesta
 * «Todavía no has entrado a esta reunión» en cada vuelta. La sala no lo hace
 * por su cuenta: `useMallaDeVideo` da por hecho que ya se entró.
 *
 * Eso lo hacía solo la página pública. El panel de dentro de la plataforma
 * —que se añadió después— montaba `SalaDeVideo` a pelo, así que la vista se
 * abría, la cámara se encendía, y el servidor contestaba, con toda la razón,
 * que esa persona no estaba en la reunión. Desde fuera: dos personas pulsan
 * Entrar, cada una se ve solo a sí misma, y no hay ningún error que mirar
 * porque no había ninguno — **faltaba el paso, no fallaba nada**.
 *
 * Por eso la puerta y la sala van juntas en un componente y **nadie monta
 * `SalaDeVideo` por su cuenta**: los dos sitios que abren una reunión montan
 * esto. Con el paso escrito en cada pantalla, la tercera se lo vuelve a dejar
 * — que es literalmente lo que pasó.
 *
 * # Los tres caminos, y quién los decide
 *
 * | quién | qué ve |
 * | --- | --- |
 * | el enlace ya no vale | por qué, y cómo cerrar |
 * | del equipo, y pertenece al canal | dentro, sin esperar a nadie |
 * | cualquier otro | su nombre, y la sala de espera |
 *
 * Y **lo decide el servidor**, no esta pantalla: aquí solo se pinta lo que
 * contesta `comoEntroAction`. Es la regla de siempre —la pantalla es la
 * fachada, la puerta está en la acción— y aquí importa más que en ningún otro
 * sitio, porque a la página pública llega gente de fuera.
 */
export function LaReunion({
    codigo,
    alCerrar,
    ventana,
    onVentana,
    estadosQueOfrece,
    asa,
}: {
    codigo: string;
    /**
     * Cerrar el panel, cuando esto va dentro de la plataforma.
     *
     * Sin él —la pestaña pública— no hay nada que cerrar y la pantalla lo dice
     * con otras palabras. **Con él hace falta de verdad**: un panel flotante
     * con un «este enlace no vale» y sin botón es un cartel pegado encima del
     * trabajo de alguien sin forma de quitarlo.
     */
    alCerrar?: () => void;
    /**
     * Cómo se ve la ventana, y qué tamaños se ofrecen aquí.
     *
     * Se pasan tal cual a la sala, que es quien pinta los mandos. **Quien entra
     * por el enlace público recibe solo dos** de los tres —`maximizada` y
     * `completa`— porque ahí la reunión ES la pestaña: plegarla a una pastilla
     * dejaría una página en blanco con una pastilla encima.
     */
    ventana: EstadoDeLaVentana;
    onVentana: (v: EstadoDeLaVentana) => void;
    estadosQueOfrece: readonly EstadoDeLaVentana[];
    asa?: { className?: string } & Record<string, unknown>;
}) {
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
     * El logo del negocio dueño de la reunión, para pintarlo en la puerta.
     *
     * Lo trae `comoEntroAction` —la misma vuelta que ya decide el paso—, así que
     * no hay una consulta aparte. `null` significa que la cuenta no tiene logo, y
     * la puerta cae al icono de cámara; es el mismo respaldo que agendar, solo
     * que allí el respaldo es otra imagen y aquí es el icono.
     */
    const [logo, setLogo] = useState<string | null>(null);
    /**
     * La dirección de la reunión, para pasársela a alguien más.
     *
     * Se compone con `location.origin`, que es el dominio por el que se está
     * entrando ahora mismo, y con la MISMA función que la escribe en el
     * servidor. Nunca con un dominio de constante: la App se abre por más de
     * uno y un enlace compuesto con otro es un enlace que no abre. Y se lee en
     * un efecto y no al pintar, porque `window` no existe en el servidor y
     * leerlo directamente rompería la hidratación.
     */
    const [enlace, setEnlace] = useState<string | null>(null);
    useEffect(() => {
        setEnlace(laDireccionDeLaSala(codigo, window.location.origin));
    }, [codigo]);

    /**
     * Preguntar la entrada, y volver a preguntarla cuando haga falta.
     *
     * `entrarConCuenta` es un `INSERT … ON CONFLICT DO UPDATE` que revive la
     * fila, así que llamar otra vez es **volver a entrar**, no duplicar nada.
     * Eso es lo que hace que «Volver a entrar» funcione después de que el
     * servidor saque a quien dejó la pestaña dormida — sin ello, esa persona
     * se queda mirando un cartel hasta que cierra y vuelve a pulsar Entrar.
     */
    const entrar = useCallback(async () => {
        try {
            const res = await comoEntroAction(codigo);
            if (!res.success) {
                setComo({ paso: "cerrada", motivo: res.message });
                return;
            }
            setLogo(res.logo);
            if (res.como.modo === "cerrada") {
                setComo({ paso: "cerrada", motivo: res.como.motivo });
            } else if (res.como.modo === "dentro") {
                setComo({ paso: "dentro" });
            } else {
                setComo({ paso: "puerta" });
            }
        } catch (error) {
            // Mudo aquí es una pantalla en blanco sobre un enlace que alguien
            // acaba de recibir: el peor sitio para no decir nada.
            console.warn("[reunion] no se pudo abrir el enlace", error);
            setComo({
                paso: "cerrada",
                motivo: "No se pudo abrir la reunión. Revisa tu conexión.",
            });
        }
    }, [codigo]);

    /** Para no volver a preguntar en cada repintado. */
    const preguntado = useRef(false);
    useEffect(() => {
        if (preguntado.current) return;
        preguntado.current = true;
        void entrar();
    }, [entrar]);

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
                {alCerrar ? (
                    <Button variant="outline" size="sm" onClick={alCerrar}>
                        Cerrar
                    </Button>
                ) : (
                    <p className="text-sm text-zinc-400">Puedes cerrar esta pestaña.</p>
                )}
            </Centrada>
        );
    }

    if (como.paso === "puerta") {
        return (
            <Centrada>
                {/* El logo del negocio, misma fuente que agendar; sin logo, el
                    icono de cámara de siempre. Lo decide `EmblemaDeLaReunion`. */}
                <EmblemaDeLaReunion logo={logo} />
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
                {alCerrar ? (
                    <Button variant="ghost" size="sm" onClick={alCerrar}>
                        Cancelar
                    </Button>
                ) : null}
            </Centrada>
        );
    }

    return (
        <SalaDeVideo
            codigo={codigo}
            token={como.paso === "esperando" ? como.token : null}
            enlace={enlace}
            ventana={ventana}
            onVentana={onVentana}
            estadosQueOfrece={estadosQueOfrece}
            asa={asa}
            alSalir={
                alCerrar ??
                (() =>
                    setComo({ paso: "cerrada", motivo: "Has salido de la reunión." }))
            }
            // Volver a entrar es **solo para quien entró con su cuenta**: a un
            // invitado lo identifica su token, y `comoEntroAction` no lo
            // conoce — le devolvería la puerta y tendría que dar su nombre
            // otra vez y que alguien volviera a abrirle. Ofrecerle un botón
            // que hace eso es ofrecerle uno que no vuelve a entrar.
            alVolverAEntrar={como.paso === "dentro" ? entrar : undefined}
        />
    );
}

function Centrada({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center">
            {children}
        </div>
    );
}
