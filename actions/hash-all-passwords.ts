"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { isAdminLike } from "@/lib/rbac";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";

type HashProgress = {
    success: boolean;
    phase: "auth" | "scan" | "hash" | "done" | "error";
    message: string;
    totalFound?: number;
    totalToUpdate?: number;
    updatedSoFar?: number;
    batchSize?: number;
    batchIndex?: number;
    batchesTotal?: number;
    updatedInBatch?: number;
    skippedAlreadyBcrypt?: number;
    skippedNullPassword?: number;
    errors?: string[];
};

const isBcryptHash = (p: string) =>
    p.startsWith("$2a$") || p.startsWith("$2b$") || p.startsWith("$2y$");

export async function hashAllPasswords(): Promise<HashProgress> {
    try {
        // 0) Seguridad básica (solo admin)
        const session = await auth();
        if (!session?.user?.id) {
            return { success: false, phase: "auth", message: "No auth" };
        }
        if (!isAdminLike(session.user.role)) {
            return { success: false, phase: "auth", message: "No autorizado (solo admin)" };
        }

        const PLAIN_PASSWORD = "IA@verzay.1234";
        const batchSize = 200;

        // 1) Scan
        const users = await db.user.findMany({
            select: { id: true, password: true },
        });

        const totalFound = users.length;

        let skippedNullPassword = 0;
        let skippedAlreadyBcrypt = 0;

        const toUpdateIds: string[] = [];
        for (const u of users) {
            const p = (u.password ?? "").trim();
            if (!p) {
                skippedNullPassword++;
                continue;
            }
            if (isBcryptHash(p)) {
                skippedAlreadyBcrypt++;
                continue;
            }
            toUpdateIds.push(u.id);
        }

        const totalToUpdate = toUpdateIds.length;

        if (totalToUpdate === 0) {
            return {
                success: true,
                phase: "done",
                message: "No hay usuarios con password plano para actualizar.",
                totalFound,
                totalToUpdate,
                updatedSoFar: 0,
                batchSize,
                batchesTotal: 0,
                skippedAlreadyBcrypt,
                skippedNullPassword,
            };
        }

        // 2) Hash una sola vez (misma password para todos)
        const hash = await bcrypt.hash(PLAIN_PASSWORD, LENGTH_PASSWORD_HASH);

        // 3) Procesar en batches
        const batchesTotal = Math.ceil(totalToUpdate / batchSize);
        let updatedSoFar = 0;
        const errors: string[] = [];

        for (let batchIndex = 0; batchIndex < batchesTotal; batchIndex++) {
            const chunk = toUpdateIds.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

            try {
                const res = await db.user.updateMany({
                    where: { id: { in: chunk } },
                    data: {
                        password: hash,
                        tokenVersion: { increment: 1 }, // logout global
                    },
                });

                updatedSoFar += res.count;
            } catch (e: any) {
                errors.push(`Batch ${batchIndex + 1}/${batchesTotal} failed: ${e?.message ?? String(e)}`);
            }
        }

        return {
            success: errors.length === 0,
            phase: "done",
            message:
                errors.length === 0
                    ? "Proceso finalizado."
                    : "Proceso finalizado con errores (revisa errors).",
            totalFound,
            totalToUpdate,
            updatedSoFar,
            batchSize,
            batchesTotal,
            skippedAlreadyBcrypt,
            skippedNullPassword,
            errors: errors.length ? errors : undefined,
        };
    } catch (e: any) {
        return {
            success: false,
            phase: "error",
            message: e?.message ?? "Error desconocido",
            errors: [e?.stack ?? String(e)],
        };
    }
}
