"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Registro, TipoRegistro } from "@prisma/client";

import { getRegistrosBySessionId, deleteRegistro } from "@/actions/registro-action";
import { getSessionLegacySeguimientos } from "@/actions/seguimientos-actions";
import { getSessionCrmFollowUps } from "@/actions/crm-follow-up-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const TAB_BASE = "text-[11px] px-2 py-1 rounded-md font-medium data-[state=active]:shadow-none";

const TAB_LABELS: Record<string, string> = {
  RESUMEN:      "Resumen",
  SOLICITUD:    "Solicitudes",
  PEDIDO:       "Pedidos",
  RECLAMO:      "Reclamos",
  PAGO:         "Pagos",
  RESERVA:      "Reservas",
  PRODUCTO:     "Productos",
  FLUJOS:       "Flujos",
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
  FLUJOS:       "bg-blue-600   text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-blue-600",
  SEGUIMIENTOS: "bg-amber-500  text-white opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-amber-500",
};

export function ChatRegistrosSheet({
  open,
  onOpenChange,
  sessionId,
  sessionPushName,
  whatsapp,
  userId,
  remoteJid,
  instanceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: number;
  sessionPushName?: string | null;
  whatsapp: string;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [flujosEjecutados, setFlujosEjecutados] = useState(0);
  const [seguimientosPendientes, setSeguimientosPendientes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("RESUMEN");

  const [upsertOpen, setUpsertOpen] = useState(false);
  const [upsertMode, setUpsertMode] = useState<"create" | "edit">("create");
  const [upsertTipo, setUpsertTipo] = useState<TipoRegistro>("REPORTE");
  const [editingRegistro, setEditingRegistro] = useState<Registro | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRegistro, setDeletingRegistro] = useState<Registro | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [regResult, legacyResult, crmResult] = await Promise.all([
      getRegistrosBySessionId(sessionId),
      getSessionLegacySeguimientos(remoteJid),
      getSessionCrmFollowUps(sessionId, userId),
    ]);
    if (regResult.success && regResult.data) setRegistros(regResult.data);
    if (legacyResult.success && legacyResult.data)
      setFlujosEjecutados(legacyResult.data.filter((i) => i.followUpStatus === "sent").length);
    if (crmResult.success && crmResult.data)
      setSeguimientosPendientes(
        crmResult.data.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length
      );
    setLoading(false);
  }, [sessionId, userId, remoteJid]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const countByTipo = useMemo(() => {
    const counts = {} as Record<TipoRegistro, number>;
    for (const t of TIPOS) counts[t] = 0;
    for (const r of registros) {
      const t = r.tipo as TipoRegistro;
      if (TIPOS.includes(t)) counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [registros]);

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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                Registros — {sessionPushName ?? whatsapp}
              </SheetTitle>
              <Button size="sm" className="h-8" onClick={() => openCreate("SOLICITUD")}>
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
              </Button>
            </div>
          </SheetHeader>

          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((n) => <Skeleton key={n} className="h-16 w-full rounded-md" />)}
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 px-4 pt-3">
              <TabsList className="flex gap-1 mb-3 h-auto bg-transparent p-0 w-full justify-between">
                {(["RESUMEN", ...TIPOS, "FLUJOS", "SEGUIMIENTOS"] as string[]).map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className={`${TAB_BASE} ${TAB_COLORS[key] ?? ""}`}
                  >
                    {TAB_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* RESUMEN */}
              <TabsContent value="RESUMEN" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-3 pb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {TIPOS.map((tipo) => (
                        <ResumeCard key={tipo} label={TIPO_LABELS[tipo]} value={countByTipo[tipo]} />
                      ))}
                      <button
                        type="button"
                        onClick={() => setActiveTab("FLUJOS")}
                        className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors"
                      >
                        <span className="text-sm text-muted-foreground">Flujos</span>
                        <span className="text-sm font-bold">{flujosEjecutados}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("SEGUIMIENTOS")}
                        className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors"
                      >
                        <span className="text-sm text-muted-foreground">Seguimientos</span>
                        <span className="text-sm font-bold">{seguimientosPendientes}</span>
                      </button>
                    </div>

                    {registros.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Este lead aún no tiene registros.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">Actividad reciente</p>
                        {registros.slice(0, 5).map((r) => (
                          <div
                            key={r.id}
                            className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{TIPO_LABELS[r.tipo as TipoRegistro]}</span>
                              <span className="text-muted-foreground line-clamp-2">
                                {r.resumen || r.detalles || "Sin detalles"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
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

              {/* FLUJOS */}
              <TabsContent value="FLUJOS" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <div className="h-full flex flex-col">
                  <LeadSeguimientosTab
                    sessionId={sessionId}
                    userId={userId}
                    remoteJid={remoteJid}
                    instanceId={instanceId}
                    mode="legacy"
                  />
                </div>
              </TabsContent>

              {/* SEGUIMIENTOS */}
              <TabsContent value="SEGUIMIENTOS" className="flex-1 min-h-0 mt-0 overflow-hidden">
                <div className="h-full flex flex-col">
                  <LeadSeguimientosTab
                    sessionId={sessionId}
                    userId={userId}
                    remoteJid={remoteJid}
                    instanceId={instanceId}
                    mode="crm"
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

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
