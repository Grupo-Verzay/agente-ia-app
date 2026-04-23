"use client";

import { useState, useCallback } from "react";
import { FileText, Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualSynthesis,
  getSessionLatestSummarySnapshot,
  updateFollowUpSummarySnapshot,
} from "@/actions/crm-follow-up-actions";

interface SintesisEditDialogProps {
  sessionId: number;
  onUpdated?: () => void | Promise<void>;
}

export function SintesisEditDialog({ sessionId, onUpdated }: SintesisEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState("");
  const [hasFollowUp, setHasFollowUp] = useState(false);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    setIsLoading(true);
    try {
      const result = await getSessionLatestSummarySnapshot(sessionId);
      if (result.success && result.data) {
        setFollowUpId(result.data.id);
        setSynthesis(result.data.summarySnapshot ?? "");
        setHasFollowUp(true);
      } else {
        setHasFollowUp(false);
        setSynthesis("");
        setFollowUpId(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const handleSave = async () => {
    if (!followUpId) return;
    setIsSaving(true);
    try {
      const result = await updateFollowUpSummarySnapshot(followUpId, synthesis);
      if (result.success) {
        toast.success("Síntesis actualizada");
        setOpen(false);
        await onUpdated?.();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const result = await createManualSynthesis(sessionId, synthesis);
      if (result.success && result.data) {
        toast.success("Síntesis guardada");
        setFollowUpId(result.data.id);
        setHasFollowUp(true);
        setOpen(false);
        await onUpdated?.();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="h-7 gap-1.5 text-xs px-2 border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 hover:text-indigo-900"
        title="Ver/editar síntesis del lead"
      >
        <FileText className="h-3.5 w-3.5" />
        Síntesis
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Síntesis del lead</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {!hasFollowUp && (
                <p className="text-xs text-muted-foreground -mb-1">
                  Este lead aún no tiene follow-up. Puedes escribir una síntesis
                  manual para registrar contexto del lead.
                </p>
              )}
              <Textarea
                value={synthesis}
                onChange={(e) => setSynthesis(e.target.value)}
                placeholder="Escribe la síntesis del lead..."
                rows={8}
                className="resize-y min-h-[160px]"
              />
            </>
          )}

          {!isLoading && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                Cancelar
              </Button>
              {hasFollowUp ? (
                <Button onClick={handleSave} disabled={isSaving || !synthesis.trim()}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              ) : (
                <Button onClick={handleCreate} disabled={isSaving || !synthesis.trim()}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="mr-2 h-4 w-4" />
                  )}
                  Guardar síntesis
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
