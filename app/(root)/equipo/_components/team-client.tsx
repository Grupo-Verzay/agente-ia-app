"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, UserCheck, LayoutGrid, Bot, Users, Download, MoreHorizontal, UserPlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdvisorRow, ModuleOption, TeamMetrics } from "@/actions/team-actions";
import { TeamKpiCards } from "./TeamMetrics";
import { TeamCharts } from "./TeamCharts";
import {
  createAdvisor,
  updateAdvisorPassword,
  updateAdvisorRole,
  toggleAdvisorAvailability,
  deleteAdvisor,
  linkExistingAdvisor,
  getAdvisorModuleIds,
  getOwnerModules,
  getAutoAssignSettings,
  getTeamMetrics,
  saveAdvisorModules,
  saveAutoAssignSettings,
} from "@/actions/team-actions";
import { resetAllLinkedAccounts } from "@/actions/linked-account-actions";
import { bulkAutoAssign } from "@/actions/advisor-assign-actions";
import { cn } from "@/lib/utils";

function StatCell({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn("text-xs font-semibold tabular-nums", value > 0 ? colorClass.replace("bg-", "text-") : "text-muted-foreground")}>
        {value}
      </span>
      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", value > 0 ? colorClass : "")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function getInitials(name: string | null, email: string) {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type ModulesForm = { advisorId: string; advisorName: string; enabledIds: string[]; loading: boolean };
type AutoAssignSettings = { autoAssignEnabled: boolean; autoAssignMaxChats: number };

type Props = {
  initialAdvisors: AdvisorRow[];
  ownerModules: ModuleOption[];
  initialAutoAssign: AutoAssignSettings;
  teamMetrics: TeamMetrics | null;
};

type CreateForm = { name: string; email: string; password: string; role: "agente" | "administrador" };
type PasswordForm = { advisorId: string; advisorName: string; newPassword: string };

export function TeamClient({ initialAdvisors, ownerModules, initialAutoAssign, teamMetrics }: Props) {
  const [advisors, setAdvisors] = useState<AdvisorRow[]>(initialAdvisors);
  const [availableModules, setAvailableModules] = useState<ModuleOption[]>(ownerModules);
  const [metrics, setMetrics] = useState<TeamMetrics | null>(teamMetrics);
  const [isPending, startTransition] = useTransition();

  const [autoAssignEnabled, setAutoAssignEnabled] = useState(initialAutoAssign.autoAssignEnabled);
  const [autoAssignMaxChats, setAutoAssignMaxChats] = useState(initialAutoAssign.autoAssignMaxChats);
  const [autoAssignSaving, setAutoAssignSaving] = useState(false);

  function handleAutoAssignToggle(enabled: boolean) {
    setAutoAssignEnabled(enabled);
    setAutoAssignSaving(true);
    saveAutoAssignSettings({ enabled, maxChats: autoAssignMaxChats }).then((res) => {
      if (!res.success) toast.error(res.message);
      setAutoAssignSaving(false);
    });
  }

  function handleMaxChatsChange(val: string) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1) return;
    setAutoAssignMaxChats(n);
  }

  function handleMaxChatsBlur() {
    setAutoAssignSaving(true);
    saveAutoAssignSettings({ enabled: autoAssignEnabled, maxChats: autoAssignMaxChats }).then((res) => {
      if (!res.success) toast.error(res.message);
      else toast.success("Configuración guardada.");
      setAutoAssignSaving(false);
    });
  }

  function downloadCsv() {
    const metricsMap = new Map((teamMetrics?.advisors ?? []).map((a) => [a.id, a]));
    const date = new Date().toISOString().split("T")[0];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["Asesor", "Email", "Rol", "Disponible", "Activas", "Cerradas", "Calientes", "Convertidas", "Última actividad"];
    const rows = advisors.map((a) => {
      const m = metricsMap.get(a.id);
      return [
        a.name ?? "", a.email, a.advisorRole ?? "",
        a.advisorAvailable ? "Sí" : "No",
        String(a.activeCount),
        String(m?.closedCount ?? 0),
        String(m?.hotCount ?? 0),
        String(m?.convertedCount ?? 0),
        a.lastActivity ? new Date(a.lastActivity).toLocaleDateString("es-CO") : "Sin actividad",
      ];
    });
    const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `equipo_${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", email: "", password: "", role: "agente" });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkRole, setLinkRole] = useState<"agente" | "administrador">("agente");
  const [pwForm, setPwForm] = useState<PasswordForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdvisorRow | null>(null);
  const [modulesForm, setModulesForm] = useState<ModulesForm | null>(null);
  const [resetLinksOpen, setResetLinksOpen] = useState(false);

  async function refreshAdvisors() {
    const { getTeamAdvisors } = await import("@/actions/team-actions");
    const list = await getTeamAdvisors();
    if (list.success && list.data) setAdvisors(list.data);
  }

  useEffect(() => {
    void refreshAdvisors();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadTeamData() {
      const [modulesRes, autoAssignRes, metricsRes] = await Promise.allSettled([
        getOwnerModules(),
        getAutoAssignSettings(),
        getTeamMetrics(),
      ]);

      if (!alive) return;

      if (modulesRes.status === "fulfilled" && modulesRes.value.success && modulesRes.value.data) {
        setAvailableModules(modulesRes.value.data);
      }

      if (autoAssignRes.status === "fulfilled" && autoAssignRes.value.success && autoAssignRes.value.data) {
        setAutoAssignEnabled(autoAssignRes.value.data.autoAssignEnabled);
        setAutoAssignMaxChats(autoAssignRes.value.data.autoAssignMaxChats);
      }

      if (metricsRes.status === "fulfilled" && metricsRes.value.success) {
        setMetrics(metricsRes.value.data ?? null);
      }
    }

    void loadTeamData();

    return () => {
      alive = false;
    };
  }, []);

  function handleCreateField(field: keyof CreateForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  async function openModules(advisor: AdvisorRow) {
    setModulesForm({ advisorId: advisor.id, advisorName: advisor.name ?? advisor.email, enabledIds: [], loading: true });
    const res = await getAdvisorModuleIds(advisor.id);
    const ids = res.success && res.data && res.data.length > 0 ? res.data : availableModules.map((m) => m.id);
    setModulesForm((prev) => prev ? { ...prev, enabledIds: ids, loading: false } : null);
  }

  function handleSaveModules() {
    if (!modulesForm) return;
    startTransition(async () => {
      const res = await saveAdvisorModules(modulesForm.advisorId, modulesForm.enabledIds);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Módulos guardados.");
      setModulesForm(null);
    });
  }

  function handleLink() {
    startTransition(async () => {
      const res = await linkExistingAdvisor(linkEmail, linkRole);
      if (!res.success) {
        if (res.message.toLowerCase().includes("ya está vinculado") || res.message.toLowerCase().includes("ya esta vinculado")) {
          toast.info("Ese asesor ya estaba vinculado. Actualizando la lista...");
          await refreshAdvisors();
        } else {
          toast.error(res.message);
        }
        return;
      }
      toast.success(res.message ?? "Asesor vinculado.");
      setLinkOpen(false);
      setLinkEmail("");
      setLinkRole("agente");
      await refreshAdvisors();
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createAdvisor(createForm);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Asesor creado.");
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "agente" });
      await refreshAdvisors();
    });
  }

  function handleUpdatePassword() {
    if (!pwForm) return;
    startTransition(async () => {
      const res = await updateAdvisorPassword({ advisorId: pwForm.advisorId, newPassword: pwForm.newPassword });
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Contraseña actualizada.");
      setPwForm(null);
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteAdvisor(deleteTarget.id);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Asesor eliminado.");
      setAdvisors((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    });
  }

  function handleResetLinks() {
    startTransition(async () => {
      const res = await resetAllLinkedAccounts();
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.warning ?? "Vínculos reiniciados.");
      setResetLinksOpen(false);
      await refreshAdvisors();
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Sección fija: KPI cards + barra de acciones */}
      <div className="flex flex-col gap-3 shrink-0 pb-3">

      {/* KPI cards — primera fila */}
      {metrics && <TeamKpiCards metrics={metrics} />}

      {/* Auto-assign + acciones en una sola barra */}
      <div className={cn(
        "rounded-xl border bg-card px-4 py-3 flex items-center justify-between gap-4 transition-colors",
        autoAssignEnabled ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-border"
      )}>
        {/* Lado izquierdo: icono + toggle + max chats */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className={cn(
              "flex items-center justify-center h-9 w-9 rounded-lg shrink-0",
              autoAssignEnabled ? "bg-emerald-100 dark:bg-emerald-950" : "bg-muted"
            )}>
              <Bot className={cn("h-4 w-4", autoAssignEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">Auto-asignación</p>
              {autoAssignSaving && <p className="text-xs text-muted-foreground leading-tight mt-0.5">Guardando...</p>}
            </div>
          </div>
          <Switch
            id="auto-assign-toggle"
            checked={autoAssignEnabled}
            onCheckedChange={handleAutoAssignToggle}
          />
          {autoAssignEnabled && (
            <div className="flex items-center gap-2">
              <Label htmlFor="max-chats" className="text-xs text-muted-foreground whitespace-nowrap">
                Máx. chats
              </Label>
              <Input
                id="max-chats"
                type="number"
                min={1}
                max={500}
                className="h-8 w-16 text-sm"
                value={autoAssignMaxChats}
                onChange={(e) => handleMaxChatsChange(e.target.value)}
                onBlur={handleMaxChatsBlur}
              />
            </div>
          )}
        </div>
        {/* Lado derecho: botones — siempre en la misma línea */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const res = await bulkAutoAssign();
                if (!res.success) { toast.error(res.message ?? "Error."); return; }
                const n = res.assigned ?? 0;
                toast.success(n > 0 ? `${n} conversación${n !== 1 ? 'es' : ''} asignada${n !== 1 ? 's' : ''}.` : "No hay conversaciones pendientes.");
              });
            }}
          >
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Asignar sin atender
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
            Vincular existente
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Agregar asesor
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadCsv} disabled={advisors.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setResetLinksOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Reiniciar vínculos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
      </div>{/* /fixed-top */}

      {/* Área scrollable: tabla + gráficas */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pb-3">

      {/* Tabla unificada */}
      {advisors.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
          <UserPlus className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-base font-semibold text-foreground">Sin asesores aún</p>
          <p className="text-xs text-muted-foreground">Agrega el primero para empezar a gestionar tu equipo</p>
        </div>
      ) : (() => {
        // Mapa de métricas por asesor para lookup O(1)
        const metricsMap = new Map(
          (teamMetrics?.advisors ?? []).map((a) => [a.id, a])
        );

        // Máximos del equipo para barras relativas
        const maxActive    = Math.max(...advisors.map((a) => a.activeCount), 1);
        const maxHot       = Math.max(...(teamMetrics?.advisors ?? []).map((a) => a.hotCount), 1);
        const maxConverted = Math.max(...(teamMetrics?.advisors ?? []).map((a) => a.convertedCount), 1);

        return (
          <div className="rounded-xl border overflow-hidden shrink-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="pl-4 whitespace-nowrap">Asesor</TableHead>
                  <TableHead className="whitespace-nowrap">Rol</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Disponible</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Activas</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Cerradas</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Calientes</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Convertidas</TableHead>
                  <TableHead className="whitespace-nowrap">Última actividad</TableHead>
                  <TableHead className="text-right pr-4 whitespace-nowrap">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advisors.map((advisor) => {
                  const m = metricsMap.get(advisor.id);
                  return (
                    <TableRow key={advisor.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background shadow-sm ${colorFor(advisor.id)}`}>
                              {getInitials(advisor.name, advisor.email)}
                            </span>
                            <span className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                              advisor.advisorAvailable ? "bg-emerald-500" : "bg-zinc-400"
                            )} />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium leading-tight truncate">{advisor.name ?? advisor.email}</p>
                            {/* Barra de carga */}
                            {autoAssignEnabled && (() => {
                              const loadPct = Math.min((advisor.activeCount / autoAssignMaxChats) * 100, 100);
                              const loadColor = loadPct >= 80 ? "bg-red-500" : loadPct >= 50 ? "bg-amber-400" : "bg-emerald-400";
                              return (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all", loadColor)} style={{ width: `${loadPct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground tabular-nums">{advisor.activeCount}/{autoAssignMaxChats}</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={advisor.advisorRole ?? "agente"}
                          onValueChange={(val) => {
                            startTransition(async () => {
                              const res = await updateAdvisorRole(advisor.id, val as "agente" | "administrador");
                              if (!res.success) { toast.error(res.message); return; }
                              setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorRole: val } : a));
                            });
                          }}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agente">Agente</SelectItem>
                            <SelectItem value="administrador">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={advisor.advisorAvailable}
                          onCheckedChange={(val) => {
                            setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorAvailable: val } : a));
                            toggleAdvisorAvailability(advisor.id, val).then((res) => {
                              if (!res.success) {
                                toast.error(res.message);
                                setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorAvailable: !val } : a));
                              }
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatCell value={advisor.activeCount} max={maxActive} colorClass="bg-emerald-500" />
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-sm text-muted-foreground">
                        {m?.closedCount ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatCell value={m?.hotCount ?? 0} max={maxHot} colorClass="bg-orange-500" />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatCell value={m?.convertedCount ?? 0} max={maxConverted} colorClass="bg-blue-500" />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {advisor.lastActivity
                          ? new Date(advisor.lastActivity).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
                          : <span className="italic">Sin actividad</span>}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openModules(advisor)}>
                              <LayoutGrid className="w-4 h-4 mr-2" />
                              Módulos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPwForm({ advisorId: advisor.id, advisorName: advisor.name ?? advisor.email, newPassword: "" })}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              Cambiar contraseña
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(advisor)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>
        );
      })()}

      {/* Gráficas */}
      {metrics && <TeamCharts metrics={metrics} maxChats={autoAssignMaxChats} />}

      </div>{/* /scrollable */}

      {/* Modules dialog */}
      <Dialog open={Boolean(modulesForm)} onOpenChange={(open) => !open && setModulesForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Módulos — {modulesForm?.advisorName}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {modulesForm?.loading ? (
              <p className="text-sm text-muted-foreground">Cargando módulos...</p>
            ) : availableModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay módulos disponibles.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {modulesForm?.enabledIds.length ?? 0} de {availableModules.length} habilitados
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setModulesForm((prev) => prev ? { ...prev, enabledIds: availableModules.map((m) => m.id) } : null)}>
                      Todos
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setModulesForm((prev) => prev ? { ...prev, enabledIds: [] } : null)}>
                      Ninguno
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {availableModules.map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between gap-2 pr-2">
                      <Label className="text-xs">{mod.label}</Label>
                      <Switch
                        checked={modulesForm?.enabledIds.includes(mod.id) ?? false}
                        onCheckedChange={(val) =>
                          setModulesForm((prev) =>
                            prev ? { ...prev, enabledIds: val ? [...prev.enabledIds, mod.id] : prev.enabledIds.filter((id) => id !== mod.id) } : null
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModulesForm(null)}>Cancelar</Button>
            <Button onClick={handleSaveModules} disabled={isPending || modulesForm?.loading}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

        <AlertDialog open={resetLinksOpen} onOpenChange={setResetLinksOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reiniciar vínculos de cuentas</AlertDialogTitle>
              <AlertDialogDescription>
                Esto eliminará todas las relaciones entre cuentas y dejará a cada usuario independiente.
                No borra usuarios ni cuentas, solo los vínculos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleResetLinks();
                }}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reiniciar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Link existing dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular usuario existente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="link-role">Rol en esta cuenta</Label>
            <Select value={linkRole} onValueChange={(value) => setLinkRole(value as "agente" | "administrador")}>
              <SelectTrigger id="link-role">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administrador">Administrador — ve y gestiona todo</SelectItem>
                <SelectItem value="agente">Agente — ve conversaciones asignadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-email">Email del usuario</Label>
            <Input id="link-email" type="email" placeholder="asesor@empresa.com" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} />
          </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
            <Button onClick={handleLink} disabled={isPending || !linkEmail.trim()}>
              {isPending ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo asesor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="adv-name">Nombre</Label>
              <Input id="adv-name" placeholder="Juan Pérez" value={createForm.name} onChange={(e) => handleCreateField("name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-email">Email</Label>
              <Input id="adv-email" type="email" placeholder="asesor@empresa.com" value={createForm.email} onChange={(e) => handleCreateField("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-pw">Contraseña</Label>
              <Input id="adv-pw" type="password" placeholder="Mínimo 6 caracteres" value={createForm.password} onChange={(e) => handleCreateField("password", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-role">Rol</Label>
              <Select value={createForm.role} onValueChange={(val) => setCreateForm((prev) => ({ ...prev, role: val as "agente" | "administrador" }))}>
                <SelectTrigger id="adv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agente">Agente — solo ve conversaciones asignadas</SelectItem>
                  <SelectItem value="administrador">Administrador — ve todas las conversaciones</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? "Creando..." : "Crear asesor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={Boolean(pwForm)} onOpenChange={(open) => !open && setPwForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña — {pwForm?.advisorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="new-pw">Nueva contraseña</Label>
              <Input id="new-pw" type="password" placeholder="Mínimo 6 caracteres" value={pwForm?.newPassword ?? ""}
                onChange={(e) => setPwForm((prev) => prev ? { ...prev, newPassword: e.target.value } : null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwForm(null)}>Cancelar</Button>
            <Button onClick={handleUpdatePassword} disabled={isPending}>
              {isPending ? "Actualizando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asesor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cuenta de <strong>{deleteTarget?.name ?? deleteTarget?.email}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
