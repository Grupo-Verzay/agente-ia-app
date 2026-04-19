"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function assertCanManageContacts(targetUserId: string): Promise<void> {
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

const labelSchema = z.string().max(30, "La etiqueta no puede superar 30 caracteres.").optional();

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationContact = {
    id: string;
    phone: string;
    label: string | null;
    createdAt: Date;
};

export type NotificationContactsResult = {
    success: boolean;
    message: string;
    data?: NotificationContact[];
};

export type NotificationContactResult = {
    success: boolean;
    message: string;
    data?: NotificationContact;
};

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los contactos de notificación adicionales del usuario.
 * (El número primario vive en User.notificationNumber y se gestiona aparte.)
 */
export async function getNotificationContacts(
    userId: string,
): Promise<NotificationContactsResult> {
    if (!userId) return { success: false, message: "userId requerido." };

    try {
        const contacts = await db.userNotificationContact.findMany({
            where: { userId },
            select: { id: true, phone: true, label: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });
        return { success: true, message: "OK", data: contacts };
    } catch {
        return { success: false, message: "Error al obtener contactos." };
    }
}

/**
 * Agrega un nuevo número de notificación para el usuario.
 */
export async function addNotificationContact(
    userId: string,
    phone: string,
    label?: string,
): Promise<NotificationContactResult> {
    if (!userId) return { success: false, message: "userId requerido." };

    try { await assertCanManageContacts(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    const phoneResult = phoneSchema.safeParse(phone);
    if (!phoneResult.success) {
        return { success: false, message: phoneResult.error.errors[0].message };
    }

    const labelResult = labelSchema.safeParse(label);
    if (!labelResult.success) {
        return { success: false, message: labelResult.error.errors[0].message };
    }

    const normalizedPhone = phone.trim();

    try {
        // Prevent duplicates within the same user (contacts table)
        const existing = await db.userNotificationContact.findFirst({
            where: { userId, phone: normalizedPhone },
        });
        if (existing) {
            return { success: false, message: "Este número ya está registrado." };
        }

        const contact = await db.userNotificationContact.create({
            data: { userId, phone: normalizedPhone, label: label?.trim() || null },
            select: { id: true, phone: true, label: true, createdAt: true },
        });

        revalidatePath("/profile");
        return { success: true, message: "Número agregado.", data: contact };
    } catch {
        return { success: false, message: "Error al agregar el contacto." };
    }
}

/**
 * Actualiza el teléfono y/o etiqueta de un contacto existente.
 */
export async function updateNotificationContact(
    id: string,
    userId: string,
    phone: string,
    label?: string,
): Promise<NotificationContactResult> {
    if (!id || !userId) return { success: false, message: "Parámetros requeridos." };

    try { await assertCanManageContacts(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    const phoneResult = phoneSchema.safeParse(phone);
    if (!phoneResult.success) {
        return { success: false, message: phoneResult.error.errors[0].message };
    }

    const labelResult = labelSchema.safeParse(label);
    if (!labelResult.success) {
        return { success: false, message: labelResult.error.errors[0].message };
    }

    try {
        const contact = await db.userNotificationContact.updateMany({
            where: { id, userId },
            data: { phone: phone.trim(), label: label?.trim() || null },
        });

        if (contact.count === 0) {
            return { success: false, message: "Contacto no encontrado." };
        }

        revalidatePath("/profile");
        return {
            success: true,
            message: "Contacto actualizado.",
            data: { id, phone: phone.trim(), label: label?.trim() || null, createdAt: new Date() },
        };
    } catch {
        return { success: false, message: "Error al actualizar el contacto." };
    }
}

/**
 * Elimina un contacto de notificación del usuario.
 */
export async function removeNotificationContact(
    id: string,
    userId: string,
): Promise<{ success: boolean; message: string }> {
    if (!id || !userId) return { success: false, message: "Parámetros requeridos." };

    try { await assertCanManageContacts(userId); }
    catch { return { success: false, message: "No autorizado." }; }

    try {
        const deleted = await db.userNotificationContact.deleteMany({
            where: { id, userId },
        });

        if (deleted.count === 0) {
            return { success: false, message: "Contacto no encontrado." };
        }

        revalidatePath("/profile");
        return { success: true, message: "Número eliminado." };
    } catch {
        return { success: false, message: "Error al eliminar el contacto." };
    }
}
