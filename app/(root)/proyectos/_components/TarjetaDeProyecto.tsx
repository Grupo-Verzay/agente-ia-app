"use client";

import { Paperclip, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DistintivoDeVencimiento } from "@/components/shared/DistintivoDeVencimiento";
import type { TaskData } from "@/lib/task-types";
import { textoCompletoDeLaTarea, tituloDeLaTarjeta } from "@/lib/titulo-de-la-tarea";

/**
 * La tarjeta del tablero de Proyectos.
 *
 * Vive en su propio fichero —y no dentro de `ProjectBoard`— por lo mismo que
 * `TarjetaDeTicket`: es pura (solo pinta, no llama a ninguna acción), así que se
 * puede montar en un banco de Chromium sin arrastrar el grafo de acciones del
 * tablero. Lo comprueba `lib/__tests__/tarjeta-de-proyecto.test.mjs`.
 */
export function TaskCard({
  task,
  ahora,
  dragging = false,
}: {
  task: TaskData;
  /** El reloj, uno para todas las tarjetas del repintado. */
  ahora: number;
  dragging?: boolean;
}) {
  const isDone = task.status === "done";
  // Algo que ESTA persona no ha abierto: se lo asignaron, alguien comentó,
  // alguien la dio por hecha. No se quita al pasar por encima ni con el tiempo:
  // solo al abrir la tarea, que es cuando de verdad se ha leído.
  const sinVer = task.tieneAlgoSinVer === true;

  return (
    <div
      className={cn(
        // `flex flex-col gap-2` y no `space-y-2`, por el punto de aviso.
        //
        // `space-y-*` reparte el hueco con márgenes (`> * + *`), y un hijo
        // ABSOLUTO también entra en esa cuenta: siendo el primero le regalaba un
        // `mt-2` al título —la tarjeta con aviso salía 8px más alta— y puesto al
        // final el margen se le sumaba a su propio `top`, o sea que el punto se
        // movía 8px hacia abajo. Con `gap` no hay márgenes: lo que está fuera
        // del flujo no cuenta ni recibe nada, y el punto se queda clavado en su
        // esquina mida lo que mida la tarjeta.
        "relative flex select-none flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-sm",
        sinVer && "border-indigo-400 ring-1 ring-indigo-400/40",
        dragging && "rotate-1 scale-105 opacity-80 shadow-lg",
      )}
    >
      {/* Fuera del flujo, en la esquina: un punto dentro de la fila le quitaría
          ancho al título, que es lo que de verdad se lee. */}
      {sinVer && (
        <span
          className="absolute -right-1 -top-1 flex h-3 w-3"
          title="Tiene algo que no has visto"
          aria-label="Tiene algo que no has visto"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500 ring-2 ring-background" />
        </span>
      )}

      {/* EL TÍTULO, que ahora es corto de verdad.

          Antes aquí se pintaba el texto largo —lo que se pega es «Empresa: …
          Fecha: … Tarea: …»— recortado a dos líneas, y no se entendía a golpe
          de vista. Ahora `title` es el título y el «Qué hay que hacer» se lee
          al abrir la tarea.

          `tituloDeLaTarjeta` es lo que hace que las tareas de ANTES se lean
          igual de bien sin tocar ni una fila: de su texto largo enseña la
          primera línea. En una tarea nueva el título ya es de una línea, así
          que lo devuelve tal cual.

          Se queda el recorte a dos líneas por si el título es de los largos, y
          `min-h-[2.75em]` reserva sitio para las dos **aunque use una**: es lo
          que iguala las alturas. El número no es a ojo: son 2 × 1.375em, lo que
          mide una línea con `leading-snug`. Con `2.5em` —el de Diagramas, que
          va con otro interlineado— las tarjetas quedaban 4px descuadradas.

          Y el `title` del elemento lleva las DOS partes: posar el cursor sigue
          diciendo todo lo que decía antes. */}
      <p
        title={textoCompletoDeLaTarea(task.title, task.detalle)}
        className={cn(
          "line-clamp-2 min-h-[2.75em] break-words text-sm font-medium leading-snug",
          isDone && "text-muted-foreground line-through",
        )}
      >
        {tituloDeLaTarjeta(task.title)}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">{task.type}</Badge>
        <span className="flex items-center gap-1">
          <User className="h-2.5 w-2.5" />
          {task.assignedToName ?? "Sin asignar"}
        </span>
        {/* El adjunto va INLINE en esta fila, no en un renglón propio, que es
            lo que hacía crecer la tarjeta y dejaba disparejas las de una misma
            columna. Es el mismo patrón que la tarjeta de Tickets: el clip con
            su número en la fila del responsable, sin la palabra «archivo» que
            aquí solo pedía ancho. El archivo se abre igual al abrir la tarea. */}
        {(task.adjuntos?.length ?? 0) > 0 && (
          <span
            className="inline-flex items-center gap-0.5"
            title={`${task.adjuntos!.length} ${task.adjuntos!.length === 1 ? "archivo adjunto" : "archivos adjuntos"}`}
          >
            <Paperclip className="h-3 w-3" />
            {task.adjuntos!.length}
          </span>
        )}
        {/* El vencimiento, con su color.

            Antes aquí se comparaba `new Date(dueDate) < new Date()`, o sea por
            INSTANTE: una tarea que vencía hoy a las 18:00 salía en rojo a las
            18:01, y a las 09:00 ya estaba roja si la hora guardada eran las
            08:00. Un vencimiento es un DÍA. Lo decide `lib/vencimiento.ts`, el
            mismo módulo que usan el filtro de aquí arriba, la tarjeta de
            Tickets y el trabajo diario que manda los avisos: con la cuenta
            escrita en cada sitio, una tarjeta podía salir en rojo sin que
            hubiera salido ningún aviso. */}
        <DistintivoDeVencimiento vence={task.dueDate} ahora={ahora} terminada={isDone} />
      </div>
    </div>
  );
}
