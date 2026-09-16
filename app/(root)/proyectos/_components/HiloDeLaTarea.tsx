"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  comentarLaTareaAction, leerElHiloAction,
} from "@/actions/avisos-de-tarea-actions";
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
 * Dos cosas de comportamiento:
 *
 * 1. **Abrirlo cuenta como haberlo leído.** `leerElHiloAction` quita de paso el
 *    punto del tablero y calla lo que quedara por saltar en la ventana
 *    emergente. Por eso este componente se monta también para quien no puede
 *    editar la tarea: el asignado tiene que poder leer y contestar, y es justo
 *    la persona a la que va dirigido todo esto.
 * 2. **El botón se ve pulsado.** Pasa a «Enviando…» antes de que conteste el
 *    servidor; si no, se pulsa cinco veces.
 */
export function HiloDeLaTarea({ taskId, userId }: { taskId: number; userId: string }) {
  const [comentarios, setComentarios] = useState<ComentarioDeTarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finalRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
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

  const enviar = useCallback(async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    const res = await comentarLaTareaAction({ taskId, texto: limpio });
    setEnviando(false);
    if (!res.success || !res.data) { toast.error(res.message); return; }
    setComentarios((previos) => [...previos, res.data!]);
    setTexto("");
  }, [taskId, texto, enviando]);

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
        onChange={(e) => setTexto(e.target.value.slice(0, TOPE_DE_COMENTARIO))}
        rows={2}
        className="min-h-[3.5rem] resize-y bg-background"
        placeholder="Escribe un comentario…"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {texto.length > TOPE_DE_COMENTARIO - 200
            ? `${TOPE_DE_COMENTARIO - texto.length} caracteres`
            : ""}
        </span>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!texto.trim() || enviando}
          onClick={() => void enviar()}
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {enviando ? "Enviando…" : "Comentar"}
        </Button>
      </div>
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
