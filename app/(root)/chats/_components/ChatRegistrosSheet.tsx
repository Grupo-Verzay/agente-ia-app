"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Registro, TipoRegistro } from "@prisma/client";

import { getRegistrosBySessionId, deleteRegistro } from "@/actions/registro-action";
import { getSessionLegacySeguimientos } from "@/actions/seguimientos-actions";
import { getSessionCrmFollowUps, getSessionLatestSummarySnapshot } from "@/actions/crm-follow-up-actions";
import { getRemindersByRemoteJid } from "@/actions/reminders-actions";
import { getAppointmentsBySession } from "@/actions/appointments-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
};

const TAB_BASE = "text-xs px-2.5 py-1.5 rounded-md font-medium data-[state=active]:shadow-none";

const TAB_LABELS: Record<string, string> = {
  RESUMEN:      "Resumen",
  SOLICITUD:    "Solicitudes",
  PEDIDO:       "Pedidos",
  RECLAMO:      "Reclamos",
  PAGO:         "Pagos",
  RESERVA:      "Reservas",
  PRODUCTO:     "Productos",
  SEGUIMIENTOS: "Seguimientos",
};

const TAB_COLORS: Record<string, string> = {
  RESUMEN:      "bg-slate-700  text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-slate-700 data-[state=active]:text-white",
  SOLICITUD:    "bg-blue-500   text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-blue-500",
  PEDIDO:       "bg-orange-500 text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-orange-500",
  RECLAMO:      "bg-red-500    text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-red-500",
  PAGO:         "bg-green-500  text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-green-500",
  RESERVA:      "bg-teal-500   text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-teal-500",
  PRODUCTO:     "bg-purple-500 text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-purple-500",
  SEGUIMIENTOS: "bg-amber-500  text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-amber-500",
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
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [seguimientosPendingCount, setSeguimientosPendingCount] = useState(0);
  const [seguimientosPendientes, setSeguimientosPendientes] = useState(0);
  const [recordatoriosCount, setRecordatoriosCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [sintesis, setSintesis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab ?? "RESUMEN");

  const [upsertOpen, setUpsertOpen] = useState(false);
  const [upsertMode, setUpsertMode] = useState<"create" | "edit">("create");
  const [upsertTipo, setUpsertTipo] = useState<TipoRegistro>("REPORTE");
  const [editingRegistro, setEditingRegistro] = useState<Registro | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRegistro, setDeletingRegistro] = useState<Registro | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [regResult, legacyResult, crmResult, remResult, apptResult, synResult] = await Promise.all([
      getRegistrosBySessionId(sessionId),
      getSessionLegacySeguimientos(remoteJid),
      getSessionCrmFollowUps(sessionId, userId),
      getRemindersByRemoteJid(userId, remoteJid),
      getAppointmentsBySession(sessionId),
      getSessionLatestSummarySnapshot(sessionId),
    ]);
    if (regResult.success && regResult.data) setRegistros(regResult.data);
    if (legacyResult.success && legacyResult.data)
      setSeguimientosPendingCount(legacyResult.data.filter((i) => i.followUpStatus === "pending").length);
    if (crmResult.success && crmResult.data)
      setSeguimientosPendientes(crmResult.data.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length);
    if (remResult.success && remResult.data) setRecordatoriosCount(remResult.data.length);
    if (apptResult.success && apptResult.data)
      setCitasCount(apptResult.data.filter((a) => !["FINALIZADO", "DESCARTADO", "CANCELADA"].includes(a.status)).length);
    if (synResult.success && synResult.data) setSintesis(synResult.data.summarySnapshot ?? null);
    setLoading(false);
  }, [sessionId, userId, remoteJid]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab ?? "RESUMEN");
      load();
    }
  }, [open, load, initialTab]);

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
              <DialogTitle className="text-base font-semibold">
                Registros — {sessionPushName ?? whatsapp}
              </DialogTitle>
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
              <TabsList className="flex gap-1 mb-3 h-auto bg-transparent p-0 w-full justify-between">
                {(["RESUMEN", ...TIPOS, "SEGUIMIENTOS"] as string[]).map((key) => (
                  <TabsTrigger key={key} value={key} className={`${TAB_BASE} ${TAB_COLORS[key] ?? ""}`}>
                    {TAB_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* ===== RESUMEN ===== */}
              <TabsContent value="RESUMEN" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-4 pb-4">

                    {/* INFO DEL LEAD */}
                    <div className="rounded-md border bg-background p-3 flex flex-col gap-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info del lead</p>

                      <div className="flex flex-wrap items-center gap-2">
                        {leadStatus && (
                          <Badge variant="outline" className={LEAD_STATUS_CLASSES[leadStatus] ?? "border-slate-200 bg-slate-50 text-slate-600"}>
                            {LEAD_STATUS_LABELS[leadStatus] ?? leadStatus}
                          </Badge>
                        )}
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

                      {sintesis && (
                        <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                          {sintesis}
                        </div>
                      )}

                      {!leadStatus && !leadScore && (!tags || tags.length === 0) && !sintesis && (
                        <p className="text-xs text-muted-foreground">Sin información del lead aún.</p>
                      )}
                    </div>

                    <Separator />

                    {/* REGISTROS CRM */}
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registros CRM</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {TIPOS.map((tipo) => (
                          <ResumeCard key={tipo} label={TIPO_LABELS[tipo]} value={countByTipo[tipo]} onClick={() => setActiveTab(tipo)} />
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* AGENDA */}
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {flujosCount === 0 ? (
                          <ResumeCard label="Flujos ejecutados" value={0} />
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 w-full text-left hover:bg-accent transition-colors cursor-pointer"
                              >
                                <span className="text-sm text-muted-foreground">Flujos ejecutados</span>
                                <span className="text-sm font-bold">{flujosCount}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-3">
                              <p className="text-xs font-semibold mb-2">Flujos ejecutados</p>
                              <ul className="space-y-1">
                                {flujosNames.map((name, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                    {name}
                                  </li>
                                ))}
                              </ul>
                            </PopoverContent>
                          </Popover>
                        )}
                        <button type="button" onClick={() => setActiveTab("SEGUIMIENTOS")} className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors">
                          <span className="text-sm text-muted-foreground">Seguimientos</span>
                          <span className="text-sm font-bold">{seguimientosPendingCount}</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab("SEGUIMIENTOS")} className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors">
                          <span className="text-sm text-muted-foreground">Recordatorios</span>
                          <span className="text-sm font-bold">{recordatoriosCount}</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab("SEGUIMIENTOS")} className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors">
                          <span className="text-sm text-muted-foreground">Citas</span>
                          <span className="text-sm font-bold">{citasCount}</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab("SEGUIMIENTOS")} className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors">
                          <span className="text-sm text-muted-foreground">Follow-ups IA</span>
                          <span className="text-sm font-bold">{seguimientosPendientes}</span>
                        </button>
                      </div>
                    </div>

                    {/* ACTIVIDAD RECIENTE */}
                    {registros.length > 0 && (
                      <>
                        <Separator />
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actividad reciente</p>
                          {registros.slice(0, 5).map((r) => (
                            <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium">{TIPO_LABELS[r.tipo as TipoRegistro]}</span>
                                <span className="text-muted-foreground line-clamp-2">
                                  {r.resumen || r.detalles || "Sin detalles"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* TABS POR TIPO */}
              {TIPOS.map((tipo) => (
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
                    mode="all"
                  />
                </div>
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
