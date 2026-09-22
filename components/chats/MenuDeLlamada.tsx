"use client";

import { useState } from "react";
import { Bot, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirLlamadaAqui, type DatosDeLaLlamada } from "@/components/chats/AnfitrionDeLlamada";
import { startBotCallAction } from "@/actions/voicebot-actions";
import { cn } from "@/lib/utils";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA } from "@/lib/paneles-flotantes";

/**
 * El botón verde de la cabecera de Chats: ahora un menú con DOS formas de
 * llamar, no dos botones.
 *
 * # Por qué un menú y no un segundo botón
 *
 * La cabecera del chat abierto ya va llena —asesor, recordatorio, cita, tarea,
 * registros, compartir, acciones— y en la fila de herramientas del móvil todo
 * eso vive en un carril que se desplaza. Un botón más le quita ancho a lo que
 * ya estaba, y encima **llamar con IA no es lo de todos los días**: lo normal
 * es llamar uno mismo. Es la misma regla del menú de Acciones: lo que crece o
 * lo que se usa de vez en cuando se pliega.
 *
 * # Y las DOS opciones salen de aquí, no de cada sitio que pinta el botón
 *
 * La cabecera lo pinta en dos sitios —la fila de escritorio y la fila
 * expandible del móvil—, así que con el menú escrito en cada uno, el día que se
 * afine una opción se afina en uno y el otro se queda atrás. Eso no se ve como
 * un error: se ve como que «en el móvil no está lo de llamar con IA».
 *
 * # La LÍNEA es la de la conversación abierta, y viaja en los dos caminos
 *
 * `abrirLlamadaAqui` ya recibía `instanceName` (ver *la salida es la línea de
 * la CONVERSACIÓN*), y `startBotCallAction` lo acepta como segundo parámetro
 * desde el #849. Pasarla es lo único que hace que la llamada con IA salga por
 * el número de la cuenta dueña de ESA línea y que su burbuja se anote en ESA
 * conversación — sin ella se cae en la cuenta de quien mira, que es el fallo
 * que aquel documento describe entero.
 *
 * # Dónde se abre: colgado de SU icono, y sin tapar Macros
 *
 * Pegado al icono con el `sideOffset` de siempre, el menú caía sobre la segunda
 * fila de la cabecera y tapaba el botón Macros. Ahora nace con su borde
 * izquierdo en el del icono y **bajo la cabecera entera**, como los otros
 * paneles de esa fila (`colgadoDelIcono`, en `lib/paneles-flotantes.ts`).
 *
 * Y la segunda opción dice «Llamar IA», igual que el botón de la ventana de
 * Llamar de CRM › Llamadas: la misma acción no puede llamarse de dos formas.
 */
export interface DatosParaLlamar extends DatosDeLaLlamada {}

export function MenuDeLlamada({
    datos,
    className,
    iconoClassName,
}: {
    datos: DatosParaLlamar;
    /** Las clases del disparador: cada fila de la cabecera trae las suyas. */
    className?: string;
    /** El tamaño del icono del disparador (3.5 en la fila del móvil, 4 fuera). */
    iconoClassName?: string;
}) {
    const [llamandoConIa, setLlamandoConIa] = useState(false);
    const panel = usePanelFlotante("colgadoDelIcono", "menu");

    // Los dígitos se resuelven aquí y no en cada opción: las dos llaman al
    // mismo número, y con dos limpiezas una podría aceptar lo que la otra no.
    const digitos = (datos.phone ?? "").replace(/\D/g, "");

    const llamar = () => {
        if (!digitos) {
            toast.error("No hay número de WhatsApp para llamar.");
            return;
        }
        // Exactamente lo que hacía el botón verde: la tarjeta la sostiene el
        // anfitrión del layout, no esta cabecera, así que la llamada aguanta al
        // cambiar de conversación o de pantalla.
        abrirLlamadaAqui({ ...datos, phone: digitos });
    };

    const llamarConIa = async () => {
        if (!digitos) {
            toast.error("No hay número de WhatsApp para llamar.");
            return;
        }
        if (llamandoConIa) return;
        setLlamandoConIa(true);
        // La línea de la conversación abierta. Sin ella la llamada sale con el
        // número de la cuenta de quien mira y la burbuja cae en otra
        // conversación.
        const res = await startBotCallAction(digitos, datos.instanceName ?? null);
        setLlamandoConIa(false);
        if (res.success) toast.success("El asistente de voz IA está llamando…");
        else toast.error(res.message ?? "No se pudo iniciar la llamada con IA.");
    };

    return (
        <DropdownMenu onOpenChange={panel.alAbrir}>
            <DropdownMenuTrigger asChild ref={panel.disparador}>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-menu-llamada
                    className={cn(
                        "shrink-0 rounded-full bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-950/40 dark:hover:bg-green-900/50",
                        className,
                    )}
                    title="Llamar"
                    aria-label="Llamar"
                >
                    {llamandoConIa ? (
                        <Loader2 className={cn("animate-spin", iconoClassName ?? "h-4 w-4")} />
                    ) : (
                        <Phone className={iconoClassName ?? "h-4 w-4"} />
                    )}
                </Button>
            </DropdownMenuTrigger>
            {/* Dos entradas cortas: mide lo que ocupan (`w-max`), con el
                borde izquierdo en el del icono y bajo la cabecera entera. */}
            <DropdownMenuContent
                data-menu-llamada-contenido
                {...panel.props}
                className={cn("w-max", PANEL_QUE_SE_DESPLAZA)}
            >
                <DropdownMenuItem data-opcion="llamar" onSelect={() => llamar()}>
                    <Phone className="mr-2 h-4 w-4" /> Llamar
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-opcion="llamar-ia"
                    onSelect={() => void llamarConIa()}
                    disabled={llamandoConIa}
                >
                    <Bot className="mr-2 h-4 w-4" /> Llamar IA
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
