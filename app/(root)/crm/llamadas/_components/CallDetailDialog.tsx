"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, FileText, Loader2, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getSessionIdByPhone, type CallRow } from "@/actions/calls-crm-actions";
import {
  getSessionLatestSummarySnapshot,
  createManualSynthesis,
  updateFollowUpSummarySnapshot,
} from "@/actions/crm-follow-up-actions";

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

export function CallDetailDialog({
  call,
  recordingUrl,
  open,
  onOpenChange,
  onSynthesisSaved,
}: {
  call: CallRow;
  recordingUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSynthesisSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [synthesis, setSynthesis] = useState("");
  const [savedSynthesis, setSavedSynthesis] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadLead = useCallback(async () => {
    setLoading(true);
    try {
      const sid = await getSessionIdByPhone(call.phone);
      setSessionId(sid);
      if (sid) {
        const res = await getSessionLatestSummarySnapshot(sid);
        if (res.success && res.data) {
          setFollowUpId(res.data.id);
          setSynthesis(res.data.summarySnapshot ?? "");
          setSavedSynthesis(res.data.summarySnapshot ?? "");
          setHasFollowUp(true);
        } else {
          setFollowUpId(null);
          setSynthesis("");
          setSavedSynthesis("");
          setHasFollowUp(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [call.phone]);

  useEffect(() => {
    if (open) loadLead();
  }, [open, loadLead]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (followUpId) {
        const res = await updateFollowUpSummarySnapshot(followUpId, synthesis);
        if (res.success) {
          toast.success("Síntesis actualizada");
          setSavedSynthesis(synthesis);
          onSynthesisSaved?.();
        } else {
          toast.error(res.message);
        }
      } else if (sessionId) {
        const res = await createManualSynthesis(sessionId, synthesis);
        if (res.success && res.data) {
          toast.success("Síntesis guardada");
          setFollowUpId(res.data.id);
          setHasFollowUp(true);
          setSavedSynthesis(synthesis);
          onSynthesisSaved?.();
        } else {
          toast.error(res.message);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isOut = call.direction === "outgoing";
  const synthesisChanged = synthesis.trim() !== savedSynthesis.trim();
  const hasCallContent = recordingUrl || call.summary || call.transcript;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
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
        {recordingUrl && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Grabación</div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls preload="none" src={recordingUrl} className="h-9 w-full" />
          </div>
        )}

        {/* Resumen IA de la llamada */}
        {call.summary && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Resumen IA
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{call.summary}</p>
          </div>
        )}

        {/* Transcripción */}
        {call.transcript && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Transcripción
            </div>
            <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
              {call.transcript}
            </p>
          </div>
        )}

        {!hasCallContent && call.hasRecording && (
          <p className="text-xs text-muted-foreground">Procesando transcripción…</p>
        )}

        {/* Detalle / síntesis editable del lead */}
        <div className="border-t pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-indigo-600" /> Detalle del lead (síntesis)
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessionId ? (
            <>
              {!hasFollowUp && (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Este lead aún no tiene síntesis. Escribe una para registrar el contexto comercial.
                </p>
              )}
              <Textarea
                value={synthesis}
                onChange={(e) => setSynthesis(e.target.value)}
                className="min-h-[150px] resize-y"
                placeholder="Escribe la síntesis / contexto comercial del lead..."
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No se encontró un lead asociado a este número.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cerrar
          </Button>
          {sessionId && (
            <Button
              variant="save"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !synthesisChanged || !synthesis.trim()}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
