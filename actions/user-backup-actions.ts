"use server";

import { revalidatePath } from "next/cache";

import {
  exportUserBackup,
  importUserBackup,
} from "@/lib/backup/user-backup-service";

type BackupActionResult =
  | {
      success: true;
      message: string;
      fileName: string;
      fileContents: string;
      payload: Awaited<ReturnType<typeof exportUserBackup>>["payload"];
    }
  | {
      success: false;
      message: string;
    };

export async function exportUserBackupAction(
  targetUserId: string
): Promise<BackupActionResult> {
  try {
    const exported = await exportUserBackup(targetUserId);

    return {
      success: true,
      message: "Backup generado correctamente.",
      fileName: exported.fileName,
      fileContents: exported.json,
      payload: exported.payload,
    };
  } catch (error) {
    console.error("[exportUserBackupAction]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo generar el backup.",
    };
  }
}

export async function importUserBackupAction(input: {
  targetUserId: string;
  rawBackup: string;
}) {
  try {
    const imported = await importUserBackup(input.targetUserId, input.rawBackup);

    revalidatePath("/profile");
    revalidatePath("/admin/clientes");
    revalidatePath("/crm");
    revalidatePath("/crm/dashboard");
    revalidatePath("/sessions");
    revalidatePath("/schedule");
    revalidatePath("/products");
    revalidatePath("/workflow");
    revalidatePath("/flow");
    revalidatePath("/messages");
    revalidatePath("/tags");
    revalidatePath("/credits");
    revalidatePath("/tools");
    revalidatePath("/connection");
    revalidatePath("/reminders");
    revalidatePath("/ai");

    return {
      success: true as const,
      message: "Backup importado correctamente.",
      restoredCollections: imported.result.restoredCollections,
      payload: imported.backup,
    };
  } catch (error) {
    console.error("[importUserBackupAction]", error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo importar el backup.",
    };
  }
}
