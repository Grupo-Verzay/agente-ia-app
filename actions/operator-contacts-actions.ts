"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Directorio de operarios/expertos que la IA consulta por WhatsApp (puente/
// triangulación). Calca el patrón de notification-contacts-actions.ts.

// ── Auth helper ───────────────────────────────────────────────────────────────

async function assertCanManage(targetUserId: string): Promise<void> {
    const me = await currentUser();
    if (!me) throw new Error("No autorizado.");
    const isAdminLike = me.role === "admin" || me.role === "super_admin" || me.role === "reseller";
    if (me.id !== targetUserId && !isAdminLike) {
        throw new Error("No autorizado.");
    }
}

// ── Validation ────────────────────────────────────────────────────────────────

const phoneSchema = z
    .string()
    .min(7, "Ingresa un número válido (mínimo 7 dígitos).")
    .max(20, "El número no puede superar 20 caracteres.")
    .regex(/^[0-9+\-\s()]+$/, "Solo se permiten números y caracteres +, -, (, ).");

const nameSchema = z
    .string()
    .min(1, "Ingresa un nombre.")
    .max(40, "El nombre no puede superar 40 caracteres.");

// Especialidad/tema del operario: la IA la usa para elegir a quién consultar.
const descriptionSchema = z
    .string()
    .max(120, "La especialidad no puede superar 120 caracteres.")
    .optional();

// El webhook compara el número del operario con el remitente entrante
// (remoteJid = "573001234567@s.whatsapp.net"), así que guardamos SOLO dígitos.
function toDigits(phone: string): string {
    return (phone || "").replace(/\D/g, "");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OperatorContact = {
    id: string;
    name: string;
    phone: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
};

export type OperatorContactsResult = {
    success: boolean;
    message: string;
    data?: OperatorContact[];
    bridgeEnabled?: boolean;
};

export type OperatorContactResult = {
    success: boolean;
    message: string;
    data?: OperatorContact;
};

// ── Actions ───────────────────────────────────────────────────────────────────

/** Lista los operarios del usuario + el estado del toggle "Puente con operario". */
export async function getOperatorContacts(userId: string): Promise<OperatorContactsResult> {
    if (!userId) return { success: false, message: "userId requerido." };

    try { await assertCanManage(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    try {
        const [contacts, user] = await Promise.all([
            db.operatorContact.findMany({
                where: { userId },
                select: { id: true, name: true, phone: true, description: true, isActive: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),
            db.user.findUnique({ where: { id: userId }, select: { operatorBridgeEnabled: true } }),
        ]);
        return { success: true, message: "OK", data: contacts, bridgeEnabled: !!user?.operatorBridgeEnabled };
    } catch {
        return { success: false, message: "Error al obtener los operarios." };
    }
}

/** Activa/desactiva el puente con operario para la cuenta. */
export async function setOperatorBridgeEnabled(
    userId: string,
    enabled: boolean,
): Promise<{ success: boolean; message: string }> {
    if (!userId) return { success: false, message: "userId requerido." };

    try { await assertCanManage(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    try {
        await db.user.update({ where: { id: userId }, data: { operatorBridgeEnabled: enabled } });
        revalidatePath("/profile");
        return { success: true, message: enabled ? "Puente activado." : "Puente desactivado." };
    } catch {
        return { success: false, message: "Error al guardar la configuración." };
    }
}

/** Agrega un operario. */
export async function addOperatorContact(
    userId: string,
    name: string,
    phone: string,
    description?: string,
): Promise<OperatorContactResult> {
    if (!userId) return { success: false, message: "userId requerido." };

    try { await assertCanManage(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    const nameResult = nameSchema.safeParse(name);
    if (!nameResult.success) return { success: false, message: nameResult.error.errors[0].message };

    const phoneResult = phoneSchema.safeParse(phone);
    if (!phoneResult.success) return { success: false, message: phoneResult.error.errors[0].message };

    const descResult = descriptionSchema.safeParse(description);
    if (!descResult.success) return { success: false, message: descResult.error.errors[0].message };

    const normalizedPhone = toDigits(phone);
    if (normalizedPhone.length < 7) {
        return { success: false, message: "Ingresa un número válido (mínimo 7 dígitos)." };
    }

    try {
        const existing = await db.operatorContact.findFirst({
            where: { userId, phone: normalizedPhone },
        });
        if (existing) return { success: false, message: "Este operario ya está registrado." };

        const contact = await db.operatorContact.create({
            data: { userId, name: name.trim(), phone: normalizedPhone, description: description?.trim() || null },
            select: { id: true, name: true, phone: true, description: true, isActive: true, createdAt: true },
        });

        revalidatePath("/profile");
        return { success: true, message: "Operario agregado.", data: contact };
    } catch {
        return { success: false, message: "Error al agregar el operario." };
    }
}

/** Actualiza nombre, teléfono y/o disponibilidad de un operario. */
export async function updateOperatorContact(
    id: string,
    userId: string,
    data: { name?: string; phone?: string; description?: string; isActive?: boolean },
): Promise<{ success: boolean; message: string }> {
    if (!id || !userId) return { success: false, message: "Parámetros requeridos." };

    try { await assertCanManage(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    const patch: { name?: string; phone?: string; description?: string; isActive?: boolean } = {};

    if (data.name !== undefined) {
        const r = nameSchema.safeParse(data.name);
        if (!r.success) return { success: false, message: r.error.errors[0].message };
        patch.name = data.name.trim();
    }
    if (data.phone !== undefined) {
        const r = phoneSchema.safeParse(data.phone);
        if (!r.success) return { success: false, message: r.error.errors[0].message };
        const digits = toDigits(data.phone);
        if (digits.length < 7) return { success: false, message: "Ingresa un número válido (mínimo 7 dígitos)." };
        patch.phone = digits;
    }
    if (data.description !== undefined) {
        const r = descriptionSchema.safeParse(data.description);
        if (!r.success) return { success: false, message: r.error.errors[0].message };
        patch.description = data.description.trim();
    }
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    try {
        const res = await db.operatorContact.updateMany({ where: { id, userId }, data: patch });
        if (res.count === 0) return { success: false, message: "Operario no encontrado." };

        revalidatePath("/profile");
        return { success: true, message: "Operario actualizado." };
    } catch {
        return { success: false, message: "Error al actualizar el operario." };
    }
}

/** Elimina un operario. */
export async function removeOperatorContact(
    id: string,
    userId: string,
): Promise<{ success: boolean; message: string }> {
    if (!id || !userId) return { success: false, message: "Parámetros requeridos." };

    try { await assertCanManage(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    try {
        const deleted = await db.operatorContact.deleteMany({ where: { id, userId } });
        if (deleted.count === 0) return { success: false, message: "Operario no encontrado." };

        revalidatePath("/profile");
        return { success: true, message: "Operario eliminado." };
    } catch {
        return { success: false, message: "Error al eliminar el operario." };
    }
}
