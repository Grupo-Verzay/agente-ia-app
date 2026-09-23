"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, FileText, AudioWaveform, Loader2, PhoneOutgoing, PhoneMissed, Bot, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCallDetailAction } from "@/actions/calls-crm-actions";
import type { CallRow } from "@/lib/fila-de-llamada";
import { NotaDeVozSuelta } from "@/components/shared/NotaDeVoz";
import { losTurnos, type QuienHabla } from "@/lib/turnos-de-la-transcripcion";

const DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtDuration(secs: number): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Mientras la grabación está pero la transcripción no, se vuelve a preguntar
 * cada tanto: el procesado corre de fondo y puede acabar con el diálogo
 * abierto. Con tope, para que un diálogo olvidado no pregunte para siempre.
 */
const ESPERA_ENTRE_CONSULTAS_MS = 8000;
const TOPE_DE_CONSULTAS = 15;

/**
 * Detalle de una llamada: su resumen de IA, su transcripción y su grabación.
 *
 * La síntesis del lead NO va aquí: es contexto del chat y se edita en el chat.
 *
 * Y la llamada se pide FRESCA al abrir (`getCallDetailAction`). La fila de la
 * tabla es la foto de cuando se cargó la lista: una llamada que se procesó
 * después —la transcripción llega minutos más tarde— abría «sin resumen y sin
 * transcripción» aunque ya las tuviera en la base.
 */
export function CallDetailDialog({
  call: callDeLaLista,
  recordingUrl,
  open,
  onOpenChange,
  onDetalle,
}: {
  call: CallRow;
  recordingUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo que se trajo fresco, para que la fila de la tabla se ponga al día. */
  onDetalle?: (fresca: CallRow) => void;
}) {
  const [fresca, setFresca] = useState<CallRow | null>(null);
  const [cargando, setCargando] = useState(false);
  const onDetalleRef = useRef(onDetalle);
  onDetalleRef.current = onDetalle;

  const call = fresca && fresca.id === callDeLaLista.id ? fresca : callDeLaLista;

  const traer = useCallback(async (): Promise<CallRow | null> => {
    try {
      const r = await getCallDetailAction(callDeLaLista.id);
      if (r) {
        setFresca(r);
        onDetalleRef.current?.(r);
      } else {
        console.warn("[llamadas] el detalle no volvio; se enseña la fila de la lista", { id: callDeLaLista.id });
      }
      return r;
    } catch (err) {
      console.warn("[llamadas] no se pudo traer el detalle de la llamada", { id: callDeLaLista.id, err });
      return null;
    }
  }, [callDeLaLista.id]);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    let vueltas = 0;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    setCargando(true);
    const vuelta = async () => {
      const r = await traer();
      if (!vivo) return;
      setCargando(false);
      vueltas += 1;
      const base = r ?? callDeLaLista;
      if (base.hasRecording && !base.transcript && vueltas < TOPE_DE_CONSULTAS) {
        temporizador = setTimeout(vuelta, ESPERA_ENTRE_CONSULTAS_MS);
      }
    };
    void vuelta();
    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
    };
    // callDeLaLista se lee solo como respaldo; lo que manda es el id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, traer]);

  const isOut = call.direction === "outgoing";
  const url = recordingUrl ?? call.recordingUrl;
  const procesando = call.hasRecording && !call.transcript;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] overflow-y-auto" data-detalle-de-llamada>
        <DialogHeader>
          <DialogTitle>Detalle de la llamada</DialogTitle>
        </DialogHeader>

        {/* Cabecera del contacto */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{call.contactName || `+${call.phone}`}</span>
          {call.contactName && <span className="text-muted-foreground">+{call.phone}</span>}
          {isOut ? (
            <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700">
              <PhoneOutgoing className="h-3 w-3" /> Saliente
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
              <PhoneMissed className="h-3 w-3" /> Perdida
            </Badge>
          )}
          <span className="text-muted-foreground">
            · {fmtDuration(call.durationSecs)} · {DATE_FMT.format(new Date(call.ts))}
          </span>
        </div>

        {/* Grabación */}
        {url && (
          <div>
            {/* Onda de sonido y no micrófono: la nota ya lleva el suyo dentro. */}
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <AudioWaveform className="h-3.5 w-3.5" /> Grabación
            </div>
            {/* La MISMA nota de voz que pinta Chats (ver
                `components/shared/NotaDeVoz.tsx`); lo único propio es el
                largo: ocupa todo el recuadro. */}
            <NotaDeVozSuelta src={url} ancho="w-full" />
          </div>
        )}

        {/* Resumen IA de la llamada */}
        <div data-bloque="resumen">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Resumen IA
          </div>
          {call.summary ? (
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{call.summary}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              {cargando ? "Cargando…" : procesando ? "Procesando…" : "Sin resumen"}
            </p>
          )}
        </div>

        {/* Transcripción completa */}
        <div data-bloque="transcripcion">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Transcripción
          </div>
          {call.transcript ? (
            <Transcripcion texto={call.transcript} />
          ) : (
            <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
              {(cargando || procesando) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {cargando ? "Cargando…" : procesando ? "Procesando…" : "Sin transcripción"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const QUIEN: Record<QuienHabla, { Icono: typeof Bot; rotulo: string; color: string }> = {
  asistente: { Icono: Bot, rotulo: "Asistente", color: "text-violet-600" },
  persona: { Icono: User, rotulo: "Persona", color: "text-sky-600" },
};

/**
 * La transcripción. Cuando el texto trae quién habla, cada turno empieza con
 * su icono; cuando no —OpenAI devuelve un texto corrido—, se pinta tal cual y
 * NO se reparte: eso sería inventar quién habló. Ver
 * `lib/turnos-de-la-transcripcion.ts`.
 */
function Transcripcion({ texto }: { texto: string }) {
  const turnos = losTurnos(texto);
  if (!turnos) {
    return (
      <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">{texto}</p>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md bg-muted/40 p-2 text-sm text-muted-foreground" data-turnos>
      {turnos.map((t, i) => {
        const { Icono, rotulo, color } = QUIEN[t.quien];
        return (
          <div key={i} className="flex items-start gap-1.5" data-turno={t.quien}>
            <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} aria-label={rotulo}>
              <title>{rotulo}</title>
            </Icono>
            <p className="min-w-0 whitespace-pre-wrap">{t.texto}</p>
          </div>
        );
      })}
    </div>
  );
}
