"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserBackupManager } from "@/components/backup/UserBackupManager";
import type { ClientInterface } from "@/lib/types";

export function UserBackupDialog({
  openBackupDialog,
  setOpenBackupDialog,
  user,
}: {
  openBackupDialog: boolean;
  setOpenBackupDialog: (open: boolean) => void;
  user: ClientInterface;
}) {
  const label = user.company || user.name || user.email || "este usuario";

  return (
    <Dialog open={openBackupDialog} onOpenChange={setOpenBackupDialog}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Backup del usuario</DialogTitle>
          <DialogDescription>
            Gestiona exportación e importación para {label}.
          </DialogDescription>
        </DialogHeader>

        <UserBackupManager
          targetUserId={user.id}
          subjectLabel={label}
          onImported={() => setOpenBackupDialog(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
