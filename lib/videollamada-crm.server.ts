import "server-only";

import { db } from "@/lib/db";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { esLaCuentaDeVerzy } from "@/lib/videollamada-crm";

/**
 * Qué cuenta es «Verzay Ventas»: la que navega la pantalla de Verzy
 * (`lib/pantalla-de-verzy.server.ts`) con su token de servicio.
 *
 * La cuenta sale de `VERZY_CUENTA_ID` (el stack) y, si no está, de su nombre.
 */

const MEMORIA_MS = 10 * 60_000;
let recordada: { en: number; id: string | null } | null = null;

export async function laCuentaDeVerzy(ahora = Date.now()): Promise<{ id: string; nombre: string } | null> {
    const fija = String(process.env.VERZY_CUENTA_ID ?? "").trim();
    if (!fija && recordada && ahora - recordada.en < MEMORIA_MS && recordada.id) {
        const c = await db.user.findUnique({ where: { id: recordada.id }, select: { id: true, company: true, name: true, email: true } });
        if (c) return { id: c.id, nombre: nombreDeLaCuenta(c) };
    }
    if (fija) {
        const c = await db.user.findUnique({ where: { id: fija }, select: { id: true, company: true, name: true, email: true } });
        if (c) return { id: c.id, nombre: nombreDeLaCuenta(c) };
        console.warn("[videollamada] VERZY_CUENTA_ID no es ninguna cuenta; se busca por nombre", { id: fija });
    }
    const candidatas = await db.user.findMany({
        where: {
            ownerId: null,
            OR: [{ company: { contains: "ventas", mode: "insensitive" } }, { name: { contains: "ventas", mode: "insensitive" } }],
        },
        select: { id: true, company: true, name: true, email: true },
        take: 50,
    });
    const la = candidatas.find((c) => esLaCuentaDeVerzy(c.company) || esLaCuentaDeVerzy(c.name));
    recordada = { en: ahora, id: la?.id ?? null };
    if (!la) {
        console.warn("[videollamada] no se encontró la cuenta «Verzay Ventas»: pon VERZY_CUENTA_ID en el stack");
        return null;
    }
    return { id: la.id, nombre: nombreDeLaCuenta(la) };
}
