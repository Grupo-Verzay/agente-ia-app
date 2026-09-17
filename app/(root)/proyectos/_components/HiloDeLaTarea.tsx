"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { leerElHiloAction } from "@/actions/avisos-de-tarea-actions";
import {
  TOPE_DE_COMENTARIO, type ComentarioDeTarea,
} from "@/lib/avisos-de-tarea-tipos";

/**
 * El hilo de una tarea: se comenta DENTRO de ella, no en un chat aparte.
 *
 * Ahí está el contexto —el título, la fecha, los archivos, quién la lleva— y
 * queda escrito quién dijo qué y cuándo, para leerlo después. Un chat aparte
 * obliga a contar otra vez de qué se está hablando.
 *
 * Tres cosas de comportamiento:
 *
 * 1. **Abrirlo cuenta como haberlo leído.** `leerElHiloAction` quita de paso el
 *    punto del tablero y calla lo que quedara por saltar en la ventana
 *    emergente. Por eso este componente se monta también para quien no puede
 *    editar la tarea: el asignado tiene que poder leer y contestar, y es justo
 *    la persona a la que va dirigido todo esto.
 * 2. **El bloque sale también al CREAR la tarea** (`taskId` en `null`). Antes
 *    iba detrás de un `task &&` y no aparecía nunca al crear, ni creándola ya
 *    en curso: había que guardar, reabrir y entonces escribir, justo cuando lo
 *    que se quiere decir se tiene en la cabeza. Sin id no hay hilo que leer
 *    —todavía no existe—, pero sí se puede escribir.
 * 3. **No tiene botón propio.** El comentario se guarda **con el resto del
 *    formulario**, al guardar la tarea. Por eso el texto no vive aquí sino en
 *    el formulario, que es quien guarda: con el borrador dentro de este
 *    componente no habría forma de que el guardado lo alcanzara. Un «Comentar»
 *    al lado de «Guardar» son dos botones para una misma acción, y el de
 *    guardar no se llevaba lo escrito.
 */
export function HiloDeLaTarea({
  taskId,
  userId,
  texto,
  onTexto,
}: {
  /** `null` mientras la tarea no existe: se puede escribir, no hay hilo. */
  taskId: number | null;
  userId: string;
  texto: string;
  onTexto: (texto: string) => void;
}) {
  const [comentarios, setComentarios] = useState<ComentarioDeTarea[]>([]);
  const [cargando, setCargando] = useState(taskId !== null);
  const finalRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    // Sin tarea no hay nada que pedir, y pedirlo sería un «No autorizado» por
    // un id que no existe.
    if (taskId === null) { setComentarios([]); setCargando(false); return; }
    setCargando(true);
    const res = await leerElHiloAction(taskId);
    if (res.success && res.data) setComentarios(res.data);
    // Un fallo aquí no puede ser mudo: sin aviso parece que la tarea no tiene
    // comentarios, que es muy distinto de no haber podido leerlos.
    else toast.error(res.message);
    setCargando(false);
  }, [taskId]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Al fondo, que es donde está lo último.
  useEffect(() => {
    finalRef.current?.scrollIntoView({ block: "end" });
  }, [comentarios.length]);

  return (
    <div className="space-y-2.5 rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-violet-600 shadow-sm">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none">Comentarios</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cargando
              ? "Cargando el hilo…"
              : taskId === null
                ? "Se guardará junto con la tarea."
                : comentarios.length === 0
                  ? "Nadie ha escrito todavía."
                  : `${comentarios.length} en el hilo. A los implicados les salta el aviso.`}
          </p>
        </div>
      </div>

      {cargando ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : comentarios.length > 0 && (
        <ScrollArea className="max-h-56">
          <ul className="space-y-2 pr-2">
            {comentarios.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "rounded-md border bg-background px-2.5 py-2",
                  c.autorId === userId && "border-primary/30 bg-primary/5",
                )}
              >
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold">
                    {c.autorId === userId ? "Tú" : c.autorNombre || "Alguien del equipo"}
                  </span>
                  <span className="text-muted-foreground">{cuando(c.creadoEn)}</span>
                </p>
                {/* `whitespace-pre-wrap`: se escribe en un textarea y puede
                    traer saltos de línea; sin esto se pintan todos seguidos. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.texto}</p>
              </li>
            ))}
            <div ref={finalRef} />
          </ul>
        </ScrollArea>
      )}

      <Textarea
        value={texto}
        onChange={(e) => onTexto(e.target.value.slice(0, TOPE_DE_COMENTARIO))}
        rows={2}
        className="min-h-[3.5rem] resize-y bg-background"
        placeholder="Escribe un comentario…"
      />
      {/* Sin botón: lo escrito aquí se guarda con «Guardar», abajo. Se dice,
          porque un recuadro de texto sin botón al lado se lee como que no se
          va a guardar y la gente no lo usa. */}
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Se envía al guardar la tarea.</span>
        <span>
          {texto.length > TOPE_DE_COMENTARIO - 200
            ? `${TOPE_DE_COMENTARIO - texto.length} caracteres`
            : ""}
        </span>
      </p>
    </div>
  );
}

function cuando(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(fecha);
}
