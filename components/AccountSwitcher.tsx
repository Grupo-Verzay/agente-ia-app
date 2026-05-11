"use client";

import { useState, useEffect, useTransition } from "react";
import { ChevronsUpDown, Check, Plus, Trash2, Loader2, Users } from "lucide-react";
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
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import {
  getMyLinkedAccounts,
  switchToAccount,
  addLinkedAccount,
  removeLinkedAccount,
  type LinkedAccountsPayload,
  type LinkedAccountInfo,
} from "@/actions/linked-account-actions";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";

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

interface AccountSwitcherProps {
  user: User;
}

export function AccountSwitcher({ user }: AccountSwitcherProps) {
  const { isMobile } = useSidebar();
  const [payload, setPayload] = useState<LinkedAccountsPayload | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getMyLinkedAccounts().then((res) => {
      if (res.success && res.data) setPayload(res.data);
    });
  }, []);

  const handleSwitch = (targetId: string) => {
    if (payload?.activeAccountId === targetId) return;
    startTransition(async () => {
      const res = await switchToAccount(targetId);
      if (!res.success) {
        toast.error((res as any).message ?? "Error al cambiar de cuenta.");
        return;
      }
      window.location.reload();
    });
  };

  const handleAdd = () => {
    if (!emailInput.trim()) return;
    startTransition(async () => {
      const res = await addLinkedAccount(emailInput);
      if (!res.success) {
        toast.error((res as any).message ?? "Error al vincular cuenta.");
        return;
      }
      toast.success("Cuenta vinculada correctamente.");
      setEmailInput("");
      setAddDialogOpen(false);
      const updated = await getMyLinkedAccounts();
      if (updated.success && updated.data) setPayload(updated.data);
    });
  };

  const handleRemove = (linkedUserId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      const res = await removeLinkedAccount(linkedUserId);
      if (!res.success) {
        toast.error((res as any).message ?? "Error al desvincular.");
        return;
      }
      toast.success("Cuenta desvinculada.");
      const updated = await getMyLinkedAccounts();
      if (updated.success && updated.data) setPayload(updated.data);
      if (payload?.activeAccountId === linkedUserId) window.location.reload();
    });
  };

  const activeId = payload?.activeAccountId ?? payload?.realUserId;
  const master = payload?.masterUser;
  const linked = payload?.accounts ?? [];

  // Cuenta activa para mostrar en el trigger
  const activeName =
    activeId === payload?.realUserId
      ? displayName({ name: master?.name ?? null, email: master?.email ?? "", company: user.company })
      : displayName(linked.find((a) => a.linkedUserId === activeId) ?? { name: null, email: "", company: user.company });

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
                  {initials(user.name, user.email, user.company)}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{activeName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {linked.length > 0 ? `${linked.length + 1} cuenta${linked.length + 1 !== 1 ? "s" : ""}` : "Mi cuenta"}
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
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cambiar de cuenta
              </DropdownMenuLabel>

              {/* Cuenta maestra */}
              {master && (
                <DropdownMenuItem
                  onSelect={() => handleSwitch(master.id)}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                >
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", colorFor(master.id))}>
                    {initials(master.name, master.email, master.company)}
                  </div>
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="truncate text-sm font-medium">{displayName(master)}</span>
                    <span className="truncate text-[10px] text-muted-foreground">Administrador</span>
                  </div>
                  {activeId === master.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              )}

              {/* Cuentas vinculadas */}
              {linked.map((a) => (
                <DropdownMenuItem
                  key={a.linkedUserId}
                  onSelect={() => handleSwitch(a.linkedUserId)}
                  className="group flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                >
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", colorFor(a.linkedUserId))}>
                    {initials(a.name, a.email, a.company)}
                  </div>
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="truncate text-sm font-medium">{displayName(a)}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{a.label ?? "Administrador"}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {activeId === a.linkedUserId && <Check className="h-3.5 w-3.5 text-primary" />}
                    <button
                      type="button"
                      onClick={(e) => handleRemove(a.linkedUserId, e)}
                      className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                      title="Desvincular"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setAddDialogOpen(true); }}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm">Agregar cuenta</span>
              </DropdownMenuItem>
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
