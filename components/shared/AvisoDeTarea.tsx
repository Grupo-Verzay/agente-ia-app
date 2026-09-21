"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtSign,
  BellRing,
  CalendarClock,
  CheckCircle2,
  LifeBuoy,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  atenderLosAvisosAction, avisosPorSaltarAction,
} from "@/actions/avisos-de-tarea-actions";
import {
  aDondeLleva,
  type AvisoDeTarea,
  type TipoDeAviso,
} from "@/lib/avisos-de-tarea-tipos";

/**
 * El aviso que INTERRUMPE.
 *
 * ## Por qué existe, si ya hay campanita
 *
 * Porque la campanita se ignora. Se asignaba una tarea y la persona no se
 * enteraba: está en Chats, no entra a Proyectos, y el numerito rojo se pierde
 * entre los demás. Esto es lo contrario de un aviso que espera: se pone delante
 * y no se va.
 *
 * ## Las cuatro cosas que lo hacen distinto de un `toast`
 *
 * 1. **No se cierra solo y no caduca.** Nada de temporizadores. Un aviso que se
 *    desvanece a los cinco segundos es un aviso que no se lee si en ese momento
 *    estabas mirando otra pestaña. Y si la persona no estaba conectada, **le
 *    sale al entrar**: lo pendiente vive en la base, no en esta pestaña.
 * 2. **El clic es obligatorio.** No se cierra con Escape, ni pulsando fuera, ni
 *    con la X —de ahí `hideCloseButton` y los dos `preventDefault`—. Se sale por
 *    uno de los dos caminos, abrir o cerrar, y los dos cuentan como leído.
 * 3. **Es UNA ventana, aunque haya cinco avisos.** Se agrupan en una lista
 *    dentro de la misma ventana. Encadenadas una detrás de otra se convierten
 *    en cinco clics para volver a lo que estabas haciendo, y eso se aprende a
 *    despachar sin leer — que es en lo que se había convertido la campanita.
 * 4. **Está donde esté la persona.** Cuelga de la barra superior, que es la
 *    misma en todas las pantallas, así que salta en Chats, en Analíticas o
 *    donde sea.
 *
 * ## Leído y visto no son lo mismo
 *
 * El clic de aquí marca **leído**: descuenta de la campanita y calla la
 * ventana. El punto del tablero es otra cosa —**visto**— y solo se apaga al
 * abrir la tarea. Cerrar esta ventana no es haber leído la tarea, así que la
 * tarjeta sigue marcada hasta que se entra en ella.
 *
 * ## Y llega por el reloj, no por el tiempo real
 *
 * Es la primera regla de este proyecto: **el reloj responde**. Un sondeo corto
 * y fijo contra una consulta de un solo índice. No depende de que el socket
 * esté vivo ni de en qué sala esté la pestaña, que es de donde salen los fallos
 * mudos que cuestan noches enteras.
 *
 * Eso es además lo que cierra la ventana **en todas partes**: si la tarea se
 * abre en otra pestaña o en el móvil, allí queda atendida en la base, y la
 * vuelta siguiente del reloj deja de traerla aquí. No hace falta que las
 * pestañas se hablen entre ellas.
 *
 * Con la pestaña de fondo no se pregunta —nadie está mirando— y al volver a
 * ella se pregunta de inmediato, así que no se pierde ningún aviso: solo se
 * deja de preguntar mientras no hay quien lo lea.
 */

/** Corto a propósito: esto es un aviso que interrumpe, no un informe. */
const CADA_CUANTO_MS = 15_000;

// Los dos mapas llevan TODOS los tipos, y por eso van tipados contra
// `TipoDeAviso`: sin el `Record`, añadir un tipo nuevo compila y en pantalla
// sale un aviso sin icono y sin color, que no se parece a un error. Lo cazó
// `tsc` al añadir `vence`.
const ICONO: Record<TipoDeAviso, LucideIcon> = {
  asignada: UserPlus,
  hecha: CheckCircle2,
  comentario: MessageSquare,
  mencion: AtSign,
  // Un vencimiento no lo hizo nadie: lo dispara el calendario. Aunque este
  // aviso no saca la ventana —solo va a la campanita—, el mapa tiene que
  // conocerlo: el historial de la campanita usa estos mismos dos.
  vence: CalendarClock,
  // Un ticket de soporte: no cuelga de ninguna tarea y su clic aterriza por el
  // `enlace`, pero para la ventana es un aviso más.
  ticket: LifeBuoy,
};

const COLOR: Record<TipoDeAviso, string> = {
  asignada: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  hecha: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  comentario: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  mencion: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  vence: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  ticket: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

function cuando(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat("es", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(fecha);
}

export function AvisoDeTareaEmergente() {
  const [avisos, setAvisos] = useState<AvisoDeTarea[]>([]);
  const [saliendo, setSaliendo] = useState(false);
  // Lo ya atendido en esta pestaña. El servidor tarda una vuelta en enterarse,
  // y sin esto el sondeo siguiente lo devolvería y la ventana volvería a salir.
  const atendidos = useRef<Set<string>>(new Set());

  const preguntar = useCallback(async () => {
    const res = await avisosPorSaltarAction();
    if (!res.success || !res.data) return;
    const frescos = res.data.filter((a) => !atendidos.current.has(a.id));
    setAvisos((previos) => {
      // Se compara para no re-renderizar en cada vuelta cuando no hay nada
      // nuevo: esto corre cada 15 s en todas las pestañas del equipo.
      const iguales =
        previos.length === frescos.length &&
        previos.every((a, i) => a.id === frescos[i].id);
      return iguales ? previos : frescos;
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    const vuelta = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void preguntar().catch(() => {});
    };
    vuelta();

    // Un `setInterval` montado una sola vez, no una cadena de `setTimeout`: si
    // una vuelta no llegara a programar la siguiente, el ciclo moriría en
    // silencio y no volvería a saltar ningún aviso hasta recargar.
    const id = window.setInterval(() => { if (vivo) vuelta(); }, CADA_CUANTO_MS);
    const alVolver = () => { if (!document.hidden) vuelta(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [preguntar]);

  /**
   * Los dos caminos de salida pasan por aquí, y los dos atienden la ventana
   * ENTERA: es una sola, así que se sale de ella de una vez.
   *
   * `aDonde` es la tarea que se quiere abrir, si se pulsó una de la lista.
   */
  const atender = useCallback(async (aDonde: AvisoDeTarea | null) => {
    if (!avisos.length || saliendo) return;
    setSaliendo(true);

    const ids = avisos.map((a) => a.id);
    for (const id of ids) atendidos.current.add(id);
    setAvisos([]);

    // Si el servidor fallara, los avisos siguen sin atender en la base y
    // vuelven en la siguiente sesión: se prefiere repetirlos a perderlos.
    const res = await atenderLosAvisosAction(ids).catch(() => null);
    if (!res?.success) {
      console.warn("[tareas] no se pudieron marcar los avisos como leídos", { cuantos: ids.length });
    }
    setSaliendo(false);

    if (aDonde) window.location.href = aDondeLleva(aDonde);
  }, [avisos, saliendo]);

  if (!avisos.length) return null;

  const unico = avisos.length === 1 ? avisos[0] : null;

  return (
    <Dialog open>
      <DialogContent
        hideCloseButton
        className="sm:max-w-md"
        // Las tres puertas de salida de un diálogo normal, cerradas. Este aviso
        // se cierra pulsando, y solo pulsando: es su motivo de existir.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <BellRing className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="text-base leading-snug">
                {unico ? "Tienes un aviso" : `Tienes ${avisos.length} avisos`}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {unico
                  ? "Pulsa para verlo o ciérralo."
                  : "Pulsa el que quieras abrir, o ciérralos."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Con pocos avisos la lista se ve entera; con muchos, se desplaza ella
            sola y la ventana no crece hasta salirse de la pantalla. */}
        <ScrollArea className="max-h-[min(50vh,320px)]">
          <ul className="space-y-1.5 pr-2">
            {avisos.map((aviso) => {
              const Icono = ICONO[aviso.tipo] ?? BellRing;
              const fecha = cuando(aviso.creadoEn);
              return (
                <li key={aviso.id}>
                  <button
                    type="button"
                    disabled={saliendo}
                    onClick={() => void atender(aviso)}
                    className="flex w-full gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:opacity-60"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${COLOR[aviso.tipo]}`}>
                      <Icono className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{aviso.titulo}</span>
                      {fecha && (
                        <span className="block text-[11px] text-muted-foreground">{fecha}</span>
                      )}
                      {aviso.texto && (
                        // `whitespace-pre-wrap`: un comentario se escribe en un
                        // textarea y puede traer saltos de línea.
                        <span className="mt-1 block whitespace-pre-wrap break-words text-xs text-muted-foreground line-clamp-3">
                          {aviso.texto}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Las tareas que no abras siguen marcadas en el tablero.
          </span>
          <Button variant="outline" disabled={saliendo} onClick={() => void atender(null)}>
            {unico ? "Cerrar" : "Cerrar todos"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
