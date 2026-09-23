"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, FileText, Loader2, PhoneOutgoing, PhoneMissed, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCallDetailAction } from "@/actions/calls-crm-actions";
import type { CallRow } from "@/lib/fila-de-llamada";
import { laDuracionDelReproductor, elTiempoDelReproductor } from "@/lib/reproductor-de-llamada";

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
            <div className="mb-1 text-xs font-medium text-muted-foreground">Grabación</div>
            <ReproductorDeLlamada src={url} durationSecs={call.durationSecs} />
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
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
              {call.transcript}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
              {(cargando || procesando) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {cargando ? "Cargando…" : procesando ? "Procesando…" : "Sin transcripción"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * El reproductor propio. Con `<audio controls>` el total sale «0:00» hasta que
 * el navegador baja los metadatos —con un webm, hasta pulsar play—. Aquí el
 * total es el de la columna Duración desde que se abre, y el del navegador
 * solo cuenta si la fila no lo trae.
 */
function ReproductorDeLlamada({ src, durationSecs }: { src: string; durationSecs: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [actual, setActual] = useState(0);
  const [delAudio, setDelAudio] = useState<number | null>(null);

  const total = laDuracionDelReproductor(durationSecs, delAudio);

  const alternar = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err) => console.warn("[llamadas] no se pudo reproducir la grabacion", err));
    } else {
      a.pause();
    }
  };

  const buscar = (valor: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(valor)) return;
    a.currentTime = valor;
    setActual(valor);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1.5" data-reproductor>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
        onTimeUpdate={(e) => setActual(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDelAudio(e.currentTarget.duration)}
        onDurationChange={(e) => setDelAudio(e.currentTarget.duration)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={alternar}
        aria-label={sonando ? "Pausar" : "Reproducir"}
      >
        {sonando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <input
        type="range"
        min={0}
        max={total || 0}
        step={0.1}
        value={Math.min(actual, total || 0)}
        onChange={(e) => buscar(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-violet-600"
        aria-label="Posición de la grabación"
      />
      <span className="shrink-0 tabular-nums text-xs text-muted-foreground" data-tiempo>
        {elTiempoDelReproductor(actual)} / {elTiempoDelReproductor(total)}
      </span>
    </div>
  );
}
