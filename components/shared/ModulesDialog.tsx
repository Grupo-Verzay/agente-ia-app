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

export const ModulesDialog = ({ open, setOpen, handleModules, user, allModules }: Props) => {
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUserModuleIds(user.id).then((res) => {
      setEnabledModuleIds(res.data.length > 0 ? res.data : allModules.map((m) => m.id));
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
          ) : allModules.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No hay módulos disponibles.
            </span>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {allModules.map((mod) => {
                const isEnabled = enabledModuleIds.includes(mod.id);
                return (
                  <div key={mod.id} className="flex items-center justify-between gap-2 pr-2">
                    <Label className="text-xs text-foreground">{mod.label}</Label>
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
