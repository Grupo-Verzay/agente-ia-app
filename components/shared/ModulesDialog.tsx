"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ClientInterface } from "@/lib/types";
import { ModuleWithItems } from "@/schema/module";
import { getUserModuleIds } from "@/actions/user-module-actions";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  handleModules: (userId: string, moduleIds: string[]) => void;
  user: ClientInterface;
  allModules: ModuleWithItems[];
}

/** Las variantes de "Panel": del equipo, del reseller y del cliente. */
const PANEL_ROUTES = ["/panel", "/admin", "/panel-admin", "/reseller-panel", "/client-panel"];

export const ModulesDialog = ({ open, setOpen, handleModules, user, allModules }: Props) => {
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // De los tres módulos llamados "Panel" solo se lista el que le toca a esta
  // cuenta por su rol. Los otros dos no los ve nunca, así que ponerlos aquí solo
  // deja tres filas iguales sin forma de saber cuál es cuál.
  const suPanel = ["admin", "super_admin"].includes(user.role)
    ? ["/panel", "/admin"]
    : user.role === "reseller"
      ? ["/reseller-panel"]
      : ["/client-panel"];
  const modules = allModules.filter(
    (m) => !PANEL_ROUTES.includes(m.route) || suPanel.includes(m.route),
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUserModuleIds(user.id).then((res) => {
      setEnabledModuleIds(res.data.length > 0 ? res.data : modules.map((m) => m.id));
      setLoading(false);
    });
  }, [user.id, open, allModules]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Módulos habilitados</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="text-xs text-muted-foreground mb-4">
            {user.name || user.company} — Plan {user.plan}
          </p>
          {loading ? (
            <span className="text-sm text-muted-foreground">Cargando módulos...</span>
          ) : modules.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No hay módulos disponibles.
            </span>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {modules.map((mod) => {
                const isEnabled = enabledModuleIds.includes(mod.id);
                return (
                  <div key={mod.id} className="flex items-center justify-between gap-2 pr-2">
                    {/* La ruta debajo del nombre: hay módulos distintos que se
                        llaman igual (dos "Panel", uno /panel y otro
                        /client-panel) y sin la ruta las dos filas son
                        indistinguibles, así que se apaga la que no era. */}
                    <Label className="flex min-w-0 flex-col text-xs text-foreground">
                      <span className="truncate">{mod.label}</span>
                      <span className="truncate font-normal text-[10px] text-muted-foreground">
                        {mod.route}
                      </span>
                    </Label>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(val) =>
                        setEnabledModuleIds((prev) =>
                          val ? [...prev, mod.id] : prev.filter((id) => id !== mod.id)
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="save"
            onClick={() => handleModules(user.id, enabledModuleIds)}
            disabled={loading}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
