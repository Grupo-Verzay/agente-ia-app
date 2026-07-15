"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, ArrowLeft, Loader2, Pencil } from "lucide-react";
import type { Registro, TipoRegistro } from "@prisma/client";
import { toast } from "sonner";

import { getRegistrosBySessionId, deleteRegistro } from "@/actions/registro-action";
import { getSessionLegacySeguimientos } from "@/actions/seguimientos-actions";
import { getSessionCrmFollowUps, getSessionLatestSummarySnapshot, updateFollowUpSummarySnapshot, createManualSynthesis } from "@/actions/crm-follow-up-actions";
import { getRemindersByRemoteJid } from "@/actions/reminders-actions";
import { getAppointmentsBySession } from "@/actions/appointments-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RegistrosTable } from "../../crm/components/RegistrosTable";
import { RegistroUpsertDialog } from "../../crm/components/RegistroUpsertDialog";
import { ResumeCard } from "../../crm/components/ResumeCard";
import { LeadSeguimientosTab } from "../../crm/components/LeadSeguimientosTab";
import type { SimpleTag } from "@/types/session";

/* ===== CONSTANTES ===== */

const TIPOS: TipoRegistro[] = ["SOLICITUD", "PEDIDO", "RECLAMO", "PAGO", "RESERVA", "PRODUCTO"];

const TIPO_LABELS: Record<TipoRegistro, string> = {
  REPORTE: "Reportes",
  SOLICITUD: "Solicitudes",
  PEDIDO: "Pedidos",
  RECLAMO: "Reclamos",
  PAGO: "Pagos",
  RESERVA: "Reservas",
  PRODUCTO: "Productos",
};

const NUEVO_TIPO_LABEL: Partial<Record<string, string>> = {
  SOLICITUD: "Nueva Solicitud",
  PEDIDO:    "Nuevo Pedido",
  RECLAMO:   "Nuevo Reclamo",
  PAGO:      "Nuevo Pago",
  RESERVA:   "Nueva Reserva",
  PRODUCTO:  "Nuevo Producto",
  REPORTE:   "Nuevo Reporte",
};

const TAB_LABELS: Record<string, string> = {
  RESUMEN:      "Resumen",
  SOLICITUD:    "Solicitudes",
  PEDIDO:       "Pedidos",
  RECLAMO:      "Reclamos",
  PAGO:         "Pagos",
  RESERVA:      "Reservas",
  PRODUCTO:     "Productos",
  REPORTE:      "Reportes",
  SEGUIMIENTOS: "Seguimientos",
  NOTAS_IA:     "Notas IA",
};

const AGENDA_MODE_LABELS: Record<string, string> = {
  legacy:       "Seguimientos",
  reminders:    "Recordatorios",
  appointments: "Citas",
  crm:          "Follow-ups IA",
  all:          "Agenda",
};

const TIPO_ACCENT: Record<string, string> = {
  SOLICITUD: "border-l-[3px] border-l-blue-400",
  PEDIDO:    "border-l-[3px] border-l-orange-400",
  RECLAMO:   "border-l-[3px] border-l-red-400",
  PAGO:      "border-l-[3px] border-l-green-400",
  RESERVA:   "border-l-[3px] border-l-teal-400",
  PRODUCTO:  "border-l-[3px] border-l-purple-400",
  REPORTE:   "border-l-[3px] border-l-slate-400",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  FRIO: "Frío", TIBIO: "Tibio", CALIENTE: "Caliente",
  FINALIZADO: "Finalizado", DESCARTADO: "Descartado",
};

const LEAD_STATUS_CLASSES: Record<string, string> = {
  FRIO:       "border-blue-300 bg-blue-100 text-blue-800",
  TIBIO:      "border-amber-300 bg-amber-100 text-amber-800",
  CALIENTE:   "border-red-300 bg-red-100 text-red-800",
  FINALIZADO: "border-emerald-300 bg-emerald-100 text-emerald-800",
  DESCARTADO: "border-slate-300 bg-slate-200 text-slate-700",
};

/* ===== COMPONENTE ===== */

type RegistrosSnapshot = {
  registros: Registro[];
  seguimientosPendingCount: number;
  seguimientosPendientes: number;
  recordatoriosCount: number;
  citasCount: number;
  sintesis: string | null;
  followUpId: string | null;
  hasFollowUp: boolean;
};
// Cache por sesión (nivel módulo): al REABRIR el sheet de un lead ya visto se muestra
// al instante lo último conocido y se refresca en 2º plano (la 1ª vez sí carga: es
// data viva del lead). Evita el skeleton en cada reapertura.
const registrosSnapshotCache = new Map<number, RegistrosSnapshot>();

export function ChatRegistrosSheet({
  open,
  onOpenChange,
  sessionId,
  sessionPushName,
  whatsapp,
  userId,
  remoteJid,
  instanceId,
  initialTab,
  flujos,
  leadStatus,
  leadScore,
  leadScoreReason,
  tags,
  sessionSeguimientos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: number;
  sessionPushName?: string | null;
  whatsapp: string;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
  initialTab?: string;
  flujos?: string | null;
  leadStatus?: string | null;
  leadScore?: number | null;
  leadScoreReason?: string | null;
  tags?: SimpleTag[];
  sessionSeguimientos?: string | null;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [seguimientosPendingCount, setSeguimientosPendingCount] = useState(0);
  const [seguimientosPendientes, setSeguimientosPendientes] = useState(0);
  const [recordatoriosCount, setRecordatoriosCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [sintesis, setSintesis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab ?? "RESUMEN");
  const [agendaMode, setAgendaMode] = useState<"all" | "legacy" | "crm" | "reminders" | "appointments">("all");
  const [sintesisExpanded, setSintesisExpanded] = useState(false);

  const goToAgenda = (mode: "legacy" | "reminders" | "appointments" | "crm") => {
    setAgendaMode(mode);
    setActiveTab("SEGUIMIENTOS");
  };

  const [upsertOpen, setUpsertOpen] = useState(false);
  const [upsertMode, setUpsertMode] = useState<"create" | "edit">("create");
  const [upsertTipo, setUpsertTipo] = useState<TipoRegistro>("REPORTE");
  const [editingRegistro, setEditingRegistro] = useState<Registro | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRegistro, setDeletingRegistro] = useState<Registro | null>(null);

  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [sintesisEditing, setSintesisEditing] = useState(false);
  const [sintesisDraft, setSintesisDraft] = useState("");
  const [sintesisSaving, setSintesisSaving] = useState(false);

  const applySnapshot = useCallback((s: RegistrosSnapshot) => {
    setRegistros(s.registros);
    setSeguimientosPendingCount(s.seguimientosPendingCount);
    setSeguimientosPendientes(s.seguimientosPendientes);
    setRecordatoriosCount(s.recordatoriosCount);
    setCitasCount(s.citasCount);
    setSintesis(s.sintesis);
    setFollowUpId(s.followUpId);
    setHasFollowUp(s.hasFollowUp);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const [regResult, legacyResult, crmResult, remResult, apptResult, synResult] = await Promise.all([
      getRegistrosBySessionId(sessionId),
      getSessionLegacySeguimientos(remoteJid),
      getSessionCrmFollowUps(sessionId, userId),
      getRemindersByRemoteJid(userId, remoteJid),
      getAppointmentsBySession(sessionId),
      getSessionLatestSummarySnapshot(sessionId),
    ]);
    // Para consultas que fallen, se conserva el último valor cacheado (no borrar la
    // vista por un error transitorio durante el refresco en 2º plano).
    const prev = registrosSnapshotCache.get(sessionId);
    const snapshot: RegistrosSnapshot = {
      registros: regResult.success && regResult.data ? regResult.data : prev?.registros ?? [],
      seguimientosPendingCount:
        legacyResult.success && legacyResult.data
          ? legacyResult.data.filter((i) => i.followUpStatus === "pending").length
          : prev?.seguimientosPendingCount ?? 0,
      seguimientosPendientes:
        crmResult.success && crmResult.data
          ? crmResult.data.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length
          : prev?.seguimientosPendientes ?? 0,
      recordatoriosCount:
        remResult.success && remResult.data ? remResult.data.length : prev?.recordatoriosCount ?? 0,
      citasCount:
        apptResult.success && apptResult.data
          ? apptResult.data.filter((a) => !["FINALIZADO", "DESCARTADO", "CANCELADA"].includes(a.status)).length
          : prev?.citasCount ?? 0,
      sintesis:
        synResult.success && synResult.data ? synResult.data.summarySnapshot ?? null : prev?.sintesis ?? null,
      followUpId: synResult.success && synResult.data ? synResult.data.id ?? null : prev?.followUpId ?? null,
      hasFollowUp: synResult.success && synResult.data ? true : prev?.hasFollowUp ?? false,
    };
    registrosSnapshotCache.set(sessionId, snapshot);
    applySnapshot(snapshot);
    setLoading(false);
  }, [sessionId, userId, remoteJid, applySnapshot]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab ?? "RESUMEN");
      setSintesisEditing(false);
      const cached = registrosSnapshotCache.get(sessionId);
      if (cached) {
        applySnapshot(cached); // reapertura: instantáneo, sin skeleton
        void load({ silent: true }); // refresca en 2º plano
      } else {
        void load(); // 1ª vez para este lead: con skeleton
      }
    }
  }, [open, sessionId, initialTab, load, applySnapshot]);

  const countByTipo = useMemo(() => {
    const counts = {} as Record<TipoRegistro, number>;
    for (const t of TIPOS) counts[t] = 0;
    for (const r of registros) {
      const t = r.tipo as TipoRegistro;
      if (TIPOS.includes(t)) counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [registros]);

  const { flujosCount, flujosNames } = useMemo(() => {
    const str = (flujos ?? "").trim();
    if (!str || str === "-") return { flujosCount: 0, flujosNames: [] as string[] };
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const names = parsed.filter((f) => !!f?.name).map((f) => String(f.name));
        return { flujosCount: names.length, flujosNames: names };
      }
    } catch { /* legacy */ }
    const names = str.split(",").map((s) => s.trim()).filter(Boolean);
    return { flujosCount: names.length, flujosNames: names };
  }, [flujos]);

  const notasIa = useMemo(() => {
    return (sessionSeguimientos ?? "")
      .split("\n")
      .map((line) => {
        const match = line.match(/^\[(.+?)\]\s(.+)$/);
        return match ? { timestamp: match[1], text: match[2] } : null;
      })
      .filter((n): n is { timestamp: string; text: string } => n !== null);
  }, [sessionSeguimientos]);

  async function handleSintesisSave() {
    setSintesisSaving(true);
    try {
      if (hasFollowUp && followUpId) {
        const res = await updateFollowUpSummarySnapshot(followUpId, sintesisDraft);
        if (res.success) { setSintesis(sintesisDraft); setSintesisEditing(false); toast.success("Síntesis actualizada"); }
        else toast.error(res.message);
      } else {
        const res = await createManualSynthesis(sessionId, sintesisDraft);
        if (res.success && res.data) {
          setSintesis(sintesisDraft);
          setFollowUpId(res.data.id);
          setHasFollowUp(true);
          setSintesisEditing(false);
          toast.success("Síntesis guardada");
        } else toast.error(res.message);
      }
    } finally {
      setSintesisSaving(false);
    }
  }

  function openCreate(tipo: TipoRegistro) {
    setUpsertMode("create");
    setEditingRegistro(null);
    setUpsertTipo(tipo);
    setUpsertOpen(true);
  }

  function openEdit(r: Registro) {
    setUpsertMode("edit");
    setEditingRegistro(r);
    setUpsertTipo(r.tipo as TipoRegistro);
    setUpsertOpen(true);
  }

  function askDelete(r: Registro) {
    setDeletingRegistro(r);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deletingRegistro) return;
    await deleteRegistro(deletingRegistro.id);
    setDeletingRegistro(null);
    load();
  }

  const totalSeguimientos = seguimientosPendingCount + seguimientosPendientes + recordatoriosCount + citasCount;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-3xl h-[85vh] flex flex-col p-0 gap-0 [&>button]:hidden">
          <DialogHeader className="px-4 pt-3 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {activeTab !== "RESUMEN" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-md hover:bg-muted"
                    onClick={() => { setActiveTab("RESUMEN"); setAgendaMode("all"); }}
                    title="Volver al resumen"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <DialogTitle className="text-base font-semibold truncate">
                  {activeTab === "RESUMEN"
                    ? `Registros — ${sessionPushName ?? whatsapp}`
                    : activeTab === "SEGUIMIENTOS"
                      ? `${AGENDA_MODE_LABELS[agendaMode] ?? "Agenda"} — ${sessionPushName ?? whatsapp}`
                      : `${TAB_LABELS[activeTab] ?? activeTab} — ${sessionPushName ?? whatsapp}`}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeTab === "RESUMEN" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white">
                        + Nuevo
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TIPOS.map((tipo) => (
                        <DropdownMenuItem key={tipo} onClick={() => openCreate(tipo)}>
                          {NUEVO_TIPO_LABEL[tipo]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : NUEVO_TIPO_LABEL[activeTab] ? (
                  <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => openCreate(activeTab as TipoRegistro)}>
                    {"+ " + NUEVO_TIPO_LABEL[activeTab]}
                  </Button>
                ) : null}
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md border border-border text-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:border-red-800 dark:hover:text-red-400">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((n) => <Skeleton key={n} className="h-16 w-full rounded-md" />)}
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 px-4 pt-3 pb-3">

              {/* ===== RESUMEN ===== */}
              <TabsContent value="RESUMEN" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-5 pb-4">

                    {/* INFO DEL LEAD */}
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 flex flex-col gap-2.5 shadow-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="h-3 w-0.5 rounded-full bg-violet-500 shrink-0" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info del lead</p>
                        {leadStatus && (
                          <Badge variant="outline" className={LEAD_STATUS_CLASSES[leadStatus] ?? "border-slate-200 bg-slate-50 text-slate-600"}>
                            {LEAD_STATUS_LABELS[leadStatus] ?? leadStatus}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => { setSintesisDraft(sintesis ?? ""); setSintesisEditing(true); }}
                          className="ml-auto text-sm text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {leadScore != null && (
                          <span className="text-xs text-muted-foreground">
                            Score: <span className="font-semibold text-foreground">{leadScore}</span>
                            {leadScoreReason && <span className="ml-1 italic">— {leadScoreReason}</span>}
                          </span>
                        )}
                      </div>

                      {tags && tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border"
                              style={tag.color ? { borderColor: `${tag.color}60`, backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {sintesisEditing ? (
                        <div className="flex flex-col gap-2">
                          <Textarea
                            value={sintesisDraft}
                            onChange={(e) => setSintesisDraft(e.target.value)}
                            placeholder="Escribe la síntesis del lead..."
                            rows={4}
                            className="resize-y min-h-[80px] text-sm"
                          />
                          <div className="flex items-center justify-between">
                            <button type="button" onClick={() => setSintesisEditing(false)} disabled={sintesisSaving} className="text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
                            <button type="button" onClick={handleSintesisSave} disabled={sintesisSaving || !sintesisDraft.trim()} className="text-sm font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1">
                              {sintesisSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : sintesis ? (
                        <div className="flex flex-col gap-1">
                          <div
                            className={`rounded-md bg-background/70 border border-border/40 px-2.5 py-2 text-sm text-muted-foreground whitespace-pre-wrap overflow-hidden transition-all duration-200 ${sintesisExpanded ? "" : "max-h-24"}`}
                          >
                            {sintesis}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSintesisExpanded((v) => !v)}
                            className="self-end text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                          >
                            {sintesisExpanded ? "Ver menos ▲" : "Ver más ▼"}
                          </button>
                        </div>
                      ) : null}

                      {!leadStatus && !leadScore && (!tags || tags.length === 0) && !sintesis && (
                        <p className="text-xs text-muted-foreground">Sin información del lead aún.</p>
                      )}
                    </div>

                    {/* REGISTROS CRM */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-0.5 rounded-full bg-blue-500 shrink-0" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registros CRM</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {TIPOS.map((tipo) => (
                          <ResumeCard
                            key={tipo}
                            label={TIPO_LABELS[tipo]}
                            value={countByTipo[tipo]}
                            onClick={() => setActiveTab(tipo)}
                            accentClass={TIPO_ACCENT[tipo]}
                          />
                        ))}
                      </div>
                    </div>

                    {/* AGENDA */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-0.5 rounded-full bg-teal-500 shrink-0" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {flujosCount === 0 ? (
                          <ResumeCard label="Flujos ejecutados" value={0} accentClass="border-l-[3px] border-l-indigo-400" />
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="rounded-md border border-l-[3px] border-l-indigo-400 bg-background px-3 py-2.5 flex items-center justify-between gap-2 w-full text-left hover:bg-accent transition-colors cursor-pointer shadow-sm"
                              >
                                <span className="text-sm font-medium text-muted-foreground">Flujos ejecutados</span>
                                <span className="text-base font-bold text-foreground">{flujosCount}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-3">
                              <p className="text-xs font-semibold mb-2">Flujos ejecutados</p>
                              <ul className="space-y-1">
                                {flujosNames.map((name, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                                    {name}
                                  </li>
                                ))}
                              </ul>
                            </PopoverContent>
                          </Popover>
                        )}
                        {([
                          { label: "Seguimientos",  value: seguimientosPendingCount, accent: "border-l-amber-400",   agenda: "legacy"       as const },
                          { label: "Recordatorios", value: recordatoriosCount,        accent: "border-l-sky-400",     agenda: "reminders"    as const },
                          { label: "Citas",         value: citasCount,                accent: "border-l-rose-400",    agenda: "appointments" as const },
                          { label: "Follow-ups IA", value: seguimientosPendientes,    accent: "border-l-emerald-400", agenda: "crm"          as const },
                          { label: "Reportes",      value: registros.filter((r) => r.tipo === "REPORTE").length, accent: "border-l-slate-400", tab: "REPORTE" },
                        ] as { label: string; value: number; accent: string; agenda?: "legacy" | "reminders" | "appointments" | "crm"; tab?: string }[]).map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => item.agenda ? goToAgenda(item.agenda) : setActiveTab(item.tab ?? "SEGUIMIENTOS")}
                            className={`rounded-md border border-l-[3px] ${item.accent} bg-background px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-accent transition-colors shadow-sm`}
                          >
                            <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                            <span className={`text-base font-bold ${item.value > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>{item.value}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ACTIVIDAD RECIENTE */}
                    {registros.some((r) => r.tipo !== "REPORTE") && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-0.5 rounded-full bg-amber-500 shrink-0" />
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actividad reciente</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {registros.filter((r) => r.tipo !== "REPORTE").slice(0, 5).map((r) => (
                            <div key={r.id} className={`rounded-md border ${TIPO_ACCENT[r.tipo] ?? ""} bg-background px-3 py-2 text-xs shadow-sm`}>
                              <span className="font-medium">{TIPO_LABELS[r.tipo as TipoRegistro]}</span>
                              <p className="text-muted-foreground line-clamp-2 mt-0.5">
                                {r.resumen || r.detalles || "Sin detalles"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NOTAS IA */}
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 flex flex-col gap-2.5 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-0.5 rounded-full bg-fuchsia-500 shrink-0" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notas IA</p>
                      </div>
                      {notasIa.length === 0 ? (
                        <p className="text-xs text-muted-foreground">El agente no ha registrado notas aún.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {notasIa.slice(0, 3).map((nota, i) => (
                            <div key={i} className="rounded-md border border-l-[3px] border-l-fuchsia-400 bg-background px-3 py-2 shadow-sm">
                              <p className="text-[11px] text-muted-foreground mb-0.5">{nota.timestamp}</p>
                              <p className="text-xs text-foreground">{nota.text}</p>
                            </div>
                          ))}
                          {notasIa.length > 3 && (
                            <button
                              type="button"
                              onClick={() => setActiveTab("NOTAS_IA")}
                              className="self-end text-xs text-fuchsia-600 hover:text-fuchsia-700 transition-colors mt-1"
                            >
                              Ver todas ({notasIa.length}) ▼
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </ScrollArea>
              </TabsContent>

              {/* TABS POR TIPO */}
              {([...TIPOS, "REPORTE"] as TipoRegistro[]).map((tipo) => (
                <TabsContent key={tipo} value={tipo} className="flex-1 min-h-0 mt-0">
                  <RegistrosTable
                    tipo={tipo}
                    registros={registros.filter((r) => r.tipo === tipo)}
                    whatsapp={whatsapp}
                    onNew={(t) => openCreate(t)}
                    onEdit={openEdit}
                    onDelete={askDelete}
                    onStateChange={load}
                  />
                </TabsContent>
              ))}

              {/* SEGUIMIENTOS */}
              <TabsContent value="SEGUIMIENTOS" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <div className="h-full flex flex-col">
                  <LeadSeguimientosTab
                    sessionId={sessionId}
                    userId={userId}
                    remoteJid={remoteJid}
                    instanceId={instanceId}
                    mode={agendaMode}
                  />
                </div>
              </TabsContent>

              {/* NOTAS IA */}
              <TabsContent value="NOTAS_IA" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-2 pb-4">
                    {notasIa.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">El agente no ha registrado notas aún.</p>
                    ) : (
                      notasIa.map((nota, i) => (
                        <div key={i} className="rounded-md border border-l-[3px] border-l-fuchsia-400 bg-background px-3 py-2.5 shadow-sm">
                          <p className="text-[11px] text-muted-foreground mb-1">{nota.timestamp}</p>
                          <p className="text-sm text-foreground">{nota.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <RegistroUpsertDialog
        open={upsertOpen}
        onOpenChange={setUpsertOpen}
        mode={upsertMode}
        sessionId={sessionId}
        sessionPushName={sessionPushName}
        initialTipo={upsertTipo}
        registro={editingRegistro}
        onSuccess={() => { load(); }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
