import "server-only";

import { db } from "@/lib/db";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { lasMadresDe, type Mencionable } from "@/lib/menciones-de-la-madre";

export type AdministradorDeLaMadre = Mencionable & {
    /** La cuenta madre de la que es administrador. */
    cuentaId: string;
    cuentaNombre: string;
};

/**
 * Los administradores de la(s) cuenta(s) MADRE de `cuentaId`: el dueño de la
 * madre (su propia fila, el inicio de sesión) y la gente de su equipo con papel
 * de `administrador`. Un `agente` de la madre no entra: esto es para avisar a
 * quien manda.
 *
 * Solo LEE. Quién es la madre lo decide `lasMadresDe` (pura) sobre la malla de
 * `linked_accounts` de siempre (`laFamiliaDeLaCuenta`), y el resultado solo
 * sirve para ofrecer y aceptar una mención: no abre ni amplía nada.
 *
 * Una cuenta sin madre devuelve `[]` sin preguntar por nadie más. Un fallo
 * también devuelve `[]` —se ve de menos, nunca de más— pero se dice.
 */
export async function losAdministradoresDeLaMadre(
    cuentaId: string,
): Promise<AdministradorDeLaMadre[]> {
    const cuenta = String(cuentaId ?? "").trim();
    if (!cuenta) return [];
    try {
        const familia = await laFamiliaDeLaCuenta(cuenta);
        const madres = lasMadresDe(cuenta, familia.enlaces ?? [], familia.raiz);
        if (!madres.length) return [];

        const filas = await db.user.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { id: { in: madres } },
                    { ownerId: { in: madres }, advisorRole: "administrador" },
                ],
            },
            select: { id: true, name: true, email: true, company: true, ownerId: true },
        });
        const cuentas = new Map(
            filas.filter((f) => madres.includes(f.id)).map((f) => [f.id, nombreDeLaCuenta(f)]),
        );

        return filas
            .map((f) => {
                const madre = madres.includes(f.id) ? f.id : (f.ownerId ?? "");
                return {
                    id: f.id,
                    // El nombre REAL de la persona; el correo solo si no tiene.
                    name: f.name?.trim() || f.email,
                    email: f.email,
                    cuentaId: madre,
                    cuentaNombre: cuentas.get(madre) ?? "",
                };
            })
            .filter((a) => a.cuentaId && a.id !== cuenta)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es"));
    } catch (error) {
        console.warn("[notas internas] no se pudieron leer los administradores de la cuenta madre", {
            cuenta,
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}
