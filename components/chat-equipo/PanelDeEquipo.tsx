"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Users, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { cambiarSonidoDelEquipoAction } from "@/actions/chat-de-equipo-actions";
import {
    avisarDeQueCambioElSonido,
    ponerAvisosDelNavegador,
    quiereAvisosDelNavegador,
} from "@/hooks/useSinLeerDelEquipo";
import {
    FRANJA_LATERAL,
    FRANJA_LATERAL_MOVIL,
    HOJA_LATERAL,
    HOJA_LATERAL_MOVIL,
    PANEL_DEL_EQUIPO,
} from "@/lib/panel-lateral";
import { usePanelLateral } from "@/hooks/usePanelLateral";
import {
    darDeBajaEsteDispositivo,
    suscribirEsteDispositivo,
} from "@/lib/avisos-push-navegador";
import { HiloDelEquipo } from "@/components/chat-equipo/HiloDelEquipo";

/**
 * El chat del equipo, **encima de donde estés**.
 *
 * # Por qué un panel y no solo una ruta
 *
 * Porque el equipo vive en Chats y no va a salir de ahí para hablar. Una ruta
 * obliga a irse de la pantalla en la que se está trabajando, y eso es
 * exactamente lo que hace que no se use — la misma razón por la que la
 * campanita se ignoraba.
 *
 * La ruta `/chat-equipo` **se queda**: es la misma pantalla, montada como
 * módulo para quien la quiera en el menú. Las dos pintan `HiloDelEquipo`, así
 * que no hay dos sitios que mantener a la par.
 *
 * # La forma la pone `lib/panel-lateral`
 *
 * El ancho, dónde arranca y hasta dónde baja no se escriben aquí: son las
 * mismas clases que usa el copiloto, y las dos medidas salen de CSS
 * (`--ancho-lateral`, `--alto-de-la-barra`). Copiadas, el día que se afine una
 * el otro panel se queda atrás y los dos dejan de parecer del mismo sitio.
 *
 * # Y la carga es PEREZOSA
 *
 * El hilo no se pide hasta que alguien abre el panel — lo decide `activo`
 * dentro de `HiloDelEquipo`. Esto cuelga del layout, o sea de **todas** las
 * pantallas de la App: pedirlo al montar sería una consulta más en cada carga
 * de Chats, de Analíticas y de todo lo demás, para algo que la mayoría de las
 * veces no se abre.
 */
export function PanelDeEquipo({
    abierto,
    sonido,
    onCerrar,
    cuentaId,
    personaId,
}: {
    abierto: boolean;
    /** Si esta persona quiere que suene. Lo trae el reloj del contador. */
    sonido: boolean;
    onCerrar: () => void;
    /** Quién entra, para que el hilo vuelva al canal donde se estaba. */
    cuentaId?: string;
    personaId?: string;
}) {
    // Chats acomoda la conversación mientras haya un panel abierto, igual que
    // ya hace con la ficha de Contacto. En el resto de la plataforma esto no
    // hace nada: la regla de CSS está acotada a `[data-chat-view]`.
    //
    // Y el mismo hook aparta a los demás paneles de la franja, que es lo que
    // antes hacía a mano `BotonesDelBorde` — y solo entre estos dos.
    usePanelLateral(PANEL_DEL_EQUIPO, abierto, onCerrar);

    return (
        <>
            <div className={FRANJA_LATERAL}>
                <Marco
                    abierto={abierto}
                    sonido={sonido}
                    onCerrar={onCerrar}
                    cuentaId={cuentaId}
                    personaId={personaId}
                />
            </div>
            <div className={FRANJA_LATERAL_MOVIL}>
                <Marco
                    movil
                    abierto={abierto}
                    sonido={sonido}
                    onCerrar={onCerrar}
                    cuentaId={cuentaId}
                    personaId={personaId}
                />
            </div>
        </>
    );
}

function Marco({
    abierto,
    sonido,
    onCerrar,
    movil = false,
    cuentaId,
    personaId,
}: {
    abierto: boolean;
    sonido: boolean;
    onCerrar: () => void;
    movil?: boolean;
    cuentaId?: string;
    personaId?: string;
}) {
    return (
        <section
            id={movil ? "chat-equipo-movil" : "chat-equipo-escritorio"}
            aria-label="Chat del equipo"
            aria-hidden={!abierto}
            className={cn(
                movil ? HOJA_LATERAL_MOVIL : HOJA_LATERAL,
                abierto ? "translate-x-0" : "translate-x-full",
            )}
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                    </span>
                    <h2 className="truncate text-base font-semibold">Chat del equipo</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Campana sonido={sonido} />
                    <AvisosDelNavegador />
                    <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Cerrar chat del equipo"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
                {/* El reloj y la carga solo corren con el panel abierto: con él
                    cerrado no hay nadie mirando, y esto cuelga de TODAS las
                    pantallas. */}
                <HiloDelEquipo
                    activo={abierto}
                    cuentaId={cuentaId}
                    personaId={personaId}
                />
            </div>
        </section>
    );
}

/** El aspecto de los tres botones de la cabecera. Escrito una vez. */
const BOTON_DE_CABECERA =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

/**
 * El sonido, de un toque.
 *
 * **Se pinta al momento y se pregunta después**, como mover a una carpeta o
 * borrar un chat: pulsar y esperar una vuelta de red a que el icono cambie se
 * lee como un botón que no hace nada. Si el servidor dice que no, vuelve a su
 * sitio y lo dice.
 *
 * Y al guardar se avisa al reloj (`avisarDeQueCambioElSonido`): el contador vive
 * en otro componente y con su propio ciclo, así que sin eso se acaba de apagar
 * el sonido y el pitido siguiente llegaría igual, hasta quince segundos después.
 */
function Campana({ sonido }: { sonido: boolean }) {
    const [encendido, setEncendido] = useState(sonido);
    const [guardando, setGuardando] = useState(false);

    // Lo que manda es el servidor: cada vuelta del reloj trae la preferencia de
    // verdad, y con ella se corrige lo que se hubiera pintado de más.
    useEffect(() => setEncendido(sonido), [sonido]);

    const alternar = async () => {
        if (guardando) return;
        const quiero = !encendido;
        setEncendido(quiero);
        setGuardando(true);
        try {
            const res = await cambiarSonidoDelEquipoAction(quiero);
            if (!res.success) {
                setEncendido(!quiero);
                toast.error(res.message);
                return;
            }
            avisarDeQueCambioElSonido();
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y
            // entonces el icono se quedaría mintiendo.
            console.warn("[chat-equipo] no se pudo guardar el sonido", error);
            setEncendido(!quiero);
            toast.error("No se pudo guardar. Revisa la conexión.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void alternar()}
            aria-pressed={encendido}
            aria-label={encendido ? "Silenciar el chat del equipo" : "Activar el sonido"}
            title={encendido ? "Sonido activado" : "Sonido silenciado"}
            className={cn(BOTON_DE_CABECERA, encendido && "text-primary")}
        >
            {encendido ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>
    );
}

/**
 * Los avisos del navegador, aparte del sonido.
 *
 * # El permiso se pide AQUÍ y en ningún otro sitio
 *
 * Nunca al entrar. Un cuadro de permiso que salta solo al abrir la App se
 * despacha con «Bloquear» sin leerlo —es lo que hace todo el mundo— y entonces
 * la decisión queda tomada **para siempre y en contra**: `denied` es terminal,
 * el navegador no vuelve a preguntar por mucho que se le pida. Pedirlo detrás
 * de un botón que dice lo que hace es la única forma de que la respuesta
 * signifique algo.
 *
 * # Y si dicen que no, se dice y se sigue
 *
 * El interruptor **no se queda encendido** fingiendo: vuelve a su sitio, y se
 * explica que hay que desbloquearlo desde el candado de la barra de
 * direcciones, que es el único camino que queda. El sonido sigue funcionando
 * igual — son dos cosas distintas y por eso son dos botones.
 *
 * La preferencia vive en este DISPOSITIVO y no contra la persona, a diferencia
 * del sonido: el permiso es del navegador. Guardada contra la persona, el
 * ordenador de la oficina —donde nadie dio permiso— diría «activados» y no
 * avisaría nunca.
 */
function AvisosDelNavegador() {
    const [encendido, setEncendido] = useState(false);
    const [sePuede, setSePuede] = useState(false);

    useEffect(() => {
        const hay = typeof window !== "undefined" && "Notification" in window;
        setSePuede(hay);
        // Encendido solo si además el permiso sigue concedido: quien lo revoca
        // desde el navegador no puede quedarse con el icono en azul.
        const puesto =
            hay && Notification.permission === "granted" && quiereAvisosDelNavegador();
        setEncendido(puesto);
        // Y se refresca la suscripción de quien ya los tenía puestos. Dos
        // motivos, y el segundo es el que no se ve: el navegador puede rotar
        // una suscripción por su cuenta, y **quien activó los avisos antes de
        // que esto existiera no tiene ninguna** — sin esta línea seguiría sin
        // recibir nada con la plataforma cerrada, sin un solo error, hasta que
        // se le ocurriera apagar y volver a encender el botón.
        if (puesto) void suscribirEsteDispositivo();
    }, []);

    if (!sePuede) return null;

    const alternar = async () => {
        if (encendido) {
            ponerAvisosDelNavegador(false);
            setEncendido(false);
            // Apagar los avisos da de baja el dispositivo, no solo apaga el
            // icono: si solo se apagara aquí, el empuje seguiría llegándole al
            // teléfono a quien lo apagó desde el portátil.
            void darDeBajaEsteDispositivo();
            return;
        }
        let permiso = Notification.permission;
        // Solo aquí, y solo si no se ha decidido ya: pedirlo con `denied`
        // puesto no abre nada y con `granted` sobra.
        if (permiso === "default") {
            try {
                permiso = await Notification.requestPermission();
            } catch (error) {
                console.warn("[chat-equipo] no se pudo pedir el permiso de avisos", error);
                toast.error("El navegador no dejó pedir el permiso.");
                return;
            }
        }
        if (permiso !== "granted") {
            ponerAvisosDelNavegador(false);
            setEncendido(false);
            toast.error(
                "El navegador tiene bloqueados los avisos de este sitio. Se desbloquean desde el candado de la barra de direcciones. El sonido sigue funcionando.",
            );
            return;
        }
        ponerAvisosDelNavegador(true);
        setEncendido(true);

        // Y la otra mitad: suscribir este dispositivo para que además llegue
        // con la plataforma CERRADA. Se hace después de encender el icono, no
        // antes: con el permiso ya concedido los avisos de pestaña abierta
        // funcionan seguro, y esto solo puede añadir.
        //
        // Un `false` aquí **no es un fallo del botón**: lo más probable es que
        // las llaves VAPID todavía no estén puestas en el servidor. Se dice lo
        // que sí funciona, que es lo único que le importa a quien lo pulsa.
        const conLaAppCerrada = await suscribirEsteDispositivo();
        toast.success(
            conLaAppCerrada
                ? "Avisos del navegador activados, también con la plataforma cerrada."
                : "Avisos del navegador activados mientras la plataforma esté abierta.",
        );
    };

    return (
        <button
            type="button"
            onClick={() => void alternar()}
            aria-pressed={encendido}
            aria-label={
                encendido ? "Desactivar los avisos del navegador" : "Activar los avisos del navegador"
            }
            title={
                encendido
                    ? "Avisos del navegador activados"
                    : "Avisar también fuera de la pestaña"
            }
            className={cn(BOTON_DE_CABECERA, encendido && "text-primary")}
        >
            <BellRing className="h-4 w-4" />
        </button>
    );
}
