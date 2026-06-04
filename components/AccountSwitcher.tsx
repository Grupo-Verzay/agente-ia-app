"use client";

import { useState, useEffect, useTransition } from "react";
import { ChevronsUpDown, Check, Plus, Loader2, Users, Trash2, CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import {
  getMyLinkedAccounts,
  switchToAccount,
  addLinkedAccount,
  removeLinkedAccount,
  type LinkedAccountsPayload,
} from "@/actions/linked-account-actions";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { canManageLinkedAccounts, getAdvisorRoleLabel } from "@/lib/permissions";

const PALETTE = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500",
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string | null, email: string, company: string) {
  const src = company?.trim() || name?.trim() || email;
  const parts = src.split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
function displayName(a: { name: string | null; email: string; company: string }) {
  return a.company?.trim() || a.name?.trim() || a.email;
}

const PLAN_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  lite: "Lite",
  unico: "Unico",
  basico: "Basico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  personalizado: "Personalizado",
};

function getPlanLabel(plan?: string | null) {
  return PLAN_LABELS[plan ?? ""] ?? "Basico";
}

function getAccountCountLabel(count: number) {
  return count === 1 ? "1 cuenta" : `${count} cuentas`;
}

function getSwitcherRoleLabel(user: User, currentRole: "agente" | "administrador" | null) {
  if (currentRole) return getAdvisorRoleLabel(currentRole);
  if (user.advisorRole) return getAdvisorRoleLabel(user.advisorRole);
  if (user.role === "admin" || user.role === "super_admin" || user.role === "reseller") return "Administrador";
  return "Agente";
}

interface AccountSwitcherProps {
  user: User;
}

export function AccountSwitcher({ user }: AccountSwitcherProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [payload, setPayload] = useState<LinkedAccountsPayload | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<"agente" | "administrador">("agente");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getMyLinkedAccounts().then((res) => {
      if (res.success && res.data) setPayload(res.data);
    });
  }, []);

  const handleSwitch = (targetId: string) => {
    if (payload?.activeAccountId === targetId) return;
    startTransition(async () => {
      try {
        if (isMobile) setOpenMobile(false);
        const res = await switchToAccount(targetId);
        if (!res.success) {
          toast.error(res.message ?? "Error al cambiar de cuenta.");
          return;
        }
        window.location.reload();
      } catch {
        toast.error("Error al cambiar de cuenta. Intenta nuevamente.");
      }
    });
  };

  const handleAdd = () => {
    if (!emailInput.trim()) return;
    startTransition(async () => {
      try {
        const res = await addLinkedAccount(emailInput, roleInput);
        if (!res.success) {
          toast.error(res.message ?? "Error al vincular cuenta.");
          return;
        }
        toast.success("Cuenta vinculada correctamente.");
        setEmailInput("");
        setRoleInput("agente");
        setAddDialogOpen(false);
        const updated = await getMyLinkedAccounts();
        if (updated.success && updated.data) setPayload(updated.data);
      } catch {
        toast.error("Error al vincular cuenta. Intenta nuevamente.");
      }
    });
  };

  const handleUnlink = (linkedUserId: string) => {
    startTransition(async () => {
      try {
        const res = await removeLinkedAccount(linkedUserId);
        if (!res.success) {
          toast.error(res.message ?? "Error al desvincular cuenta.");
          return;
        }
        toast.success("Cuenta desvinculada.");
        const updated = await getMyLinkedAccounts();
        if (updated.success && updated.data) setPayload(updated.data);
      } catch {
        toast.error("Error al desvincular cuenta. Intenta nuevamente.");
      }
    });
  };

  const activeId = payload?.activeAccountId ?? payload?.realUserId;
  const linked = payload?.accounts ?? [];
  const currentAccount = payload?.currentAccount ?? null;
  const currentRole = payload?.currentRole ?? null;
  const canManageAccounts = canManageLinkedAccounts(user);
  const accessibleCount = linked.length + 1;
  const activePlan = currentAccount?.plan ?? user.plan;
  const effectiveRoleLabel = getSwitcherRoleLabel(user, currentRole);

  // Cuenta activa para mostrar en el trigger
  const activeName =
    currentAccount
      ? displayName({ name: currentAccount.name ?? null, email: currentAccount.email, company: currentAccount.company })
      : displayName({ name: user.name ?? null, email: user.email, company: user.company });

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", colorFor(activeId ?? user.id))}>
                  {initials(currentAccount?.name ?? user.name, currentAccount?.email ?? user.email, currentAccount?.company ?? user.company)}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{activeName}</span>
                  <span className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                    {getPlanLabel(activePlan)}
                  </span>
                </div>
                {isPending ? (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin shrink-0 opacity-50" />
                ) : (
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg p-1"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="px-2 py-2">
                <div className="flex items-start gap-2">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", colorFor(activeId ?? user.id))}>
                    {initials(currentAccount?.name ?? user.name, currentAccount?.email ?? user.email, currentAccount?.company ?? user.company)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{activeName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {currentAccount?.email ?? user.email}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Badge variant="outline" className="justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                    <CreditCard className="h-3 w-3" />
                    {getPlanLabel(activePlan)}
                  </Badge>
                  <Badge variant="outline" className="justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                    <Users className="h-3 w-3" />
                    {getAccountCountLabel(accessibleCount)}
                  </Badge>
                  <Badge variant="outline" className="col-span-2 justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                    <ShieldCheck className="h-3 w-3" />
                    {effectiveRoleLabel}
                  </Badge>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cambiar de cuenta
              </DropdownMenuLabel>

              {currentAccount && (
                <DropdownMenuItem
                  onSelect={() => handleSwitch(currentAccount.id)}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                >
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", colorFor(currentAccount.id))}>
                    {initials(currentAccount.name, currentAccount.email, currentAccount.company)}
                  </div>
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="truncate text-sm font-medium">{displayName(currentAccount)}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {currentAccount?.id === payload?.realUserId
                        ? "Mi cuenta"
                        : getAdvisorRoleLabel(currentRole)}
                    </span>
                  </div>
                  {activeId === currentAccount.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              )}

              {linked.length > 0 && <DropdownMenuSeparator />}

              {/* Cuentas accesibles */}
              {linked.map((a) => (
                <div key={a.accountUserId} className="flex items-center gap-1">
                  <DropdownMenuItem
                    onSelect={() => handleSwitch(a.accountUserId)}
                    className="flex flex-1 items-center gap-2 px-2 py-1.5 cursor-pointer"
                  >
                    <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", colorFor(a.accountUserId))}>
                      {initials(a.name, a.email, a.company)}
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="truncate text-sm font-medium">{displayName(a)}</span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {a.label ?? (a.role === "administrador" ? "Administrador" : "Agente")}
                      </span>
                    </div>
                    {activeId === a.accountUserId && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                  {canManageAccounts && a.accountUserId !== activeId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUnlink(a.accountUserId);
                      }}
                      title="Desvincular cuenta"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}

              {canManageAccounts && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setAddDialogOpen(true); }}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm">Agregar cuenta</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Dialog para agregar cuenta */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Vincular cuenta
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ingresa el email de la cuenta que quieres vincular. Ambas cuentas deben existir en el sistema.
          </p>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Rol en esta cuenta</span>
            <Select value={roleInput} onValueChange={(value) => setRoleInput(value as "agente" | "administrador")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agente">Agente</SelectItem>
                <SelectItem value="administrador">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="email@ejemplo.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            disabled={isPending}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={isPending || !emailInput.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
