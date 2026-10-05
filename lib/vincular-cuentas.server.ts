import "server-only";

import bcrypt from "bcryptjs";

import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { db } from "@/lib/db";
import { losEnlacesDeLaCuenta } from "@/lib/alcance-entre-cuentas.server";
import { lasCuentasPorEncimaDe } from "@/lib/crm-de-la-familia";
import {
    CORREO_O_CONTRASENA_NO_COINCIDEN,
    DEMASIADOS_INTENTOS,
    SOLO_LO_QUE_YA_ADMINISTRAS,
    porQueNoSeVinculaConContrasena,
} from "@/lib/vincular-cuentas";

/**
 * La puerta de VINCULAR una cuenta existente bajo la de quien llama.
 *
 * 1. Si esa cuenta ya se alcanza (`assertCanAccessTargetUser`), pasa: es lo de
 *    siempre para la casa y el reseller, y no pide nada más.
 * 2. Si no, solo con la CONTRASEÑA de esa cuenta: saberla prueba que también es
 *    de quien la vincula. Y aun así solo una cuenta de cliente que no esté por
 *    encima de la propia (`porQueNoSeVinculaConContrasena`).
 *
 * La usan las DOS acciones que escriben esa fila (`linkExistingAdvisor` en
 * Usuarios y `addLinkedAccount` en el conmutador). No lanza: devuelve el motivo.
 * Nunca escribe la contraseña en ningún sitio.
 */
export async function puertaParaVincular(
    objetivoId: string | null,
    opciones: { cuentaId: string; contrasena?: string | null } = { cuentaId: "" },
): Promise<{ puede: true } | { puede: false; motivo: string }> {
    if (objetivoId) {
        try {
            await assertCanAccessTargetUser(objetivoId);
            return { puede: true };
        } catch {
            // No se alcanza: queda el camino de la contraseña.
        }
    }

    const contrasena = typeof opciones.contrasena === "string" ? opciones.contrasena : "";
    if (!contrasena) {
        if (objetivoId) {
            console.warn("[vincular] se pidió vincular una cuenta que no se alcanza", { objetivoId });
        }
        return { puede: false, motivo: objetivoId ? SOLO_LO_QUE_YA_ADMINISTRAS : "No existe un usuario con ese email." };
    }

    const cuentaId = String(opciones.cuentaId ?? "").trim();
    if (!cuentaId) return { puede: false, motivo: SOLO_LO_QUE_YA_ADMINISTRAS };
    if (demasiadosIntentos(cuentaId)) return { puede: false, motivo: DEMASIADOS_INTENTOS };

    const objetivo = objetivoId
        ? await db.user.findUnique({
              where: { id: objetivoId },
              select: { id: true, ownerId: true, role: true, deletedAt: true, password: true },
          })
        : null;

    // Se compara siempre, también sin cuenta, para no delatar por el tiempo si existe.
    const ok = await bcrypt.compare(contrasena, objetivo?.password ?? HASH_DE_RELLENO);
    if (!objetivo || !objetivo.password || !ok) {
        apuntarFallo(cuentaId);
        console.warn("[vincular] correo o contraseña que no coinciden", { cuentaId });
        return { puede: false, motivo: CORREO_O_CONTRASENA_NO_COINCIDEN };
    }

    let porEncima: string[];
    try {
        porEncima = lasCuentasPorEncimaDe(cuentaId, await losEnlacesDeLaCuenta(cuentaId));
    } catch (error) {
        console.warn("[vincular] no se pudieron leer los vínculos de la cuenta", {
            cuentaId,
            motivo: error instanceof Error ? error.message : String(error),
        });
        return { puede: false, motivo: "No se pudo comprobar la cuenta. Intenta de nuevo." };
    }

    const motivo = porQueNoSeVinculaConContrasena({ cuentaId, objetivo, porEncima });
    if (motivo) {
        console.warn("[vincular] cuenta que no se puede vincular con contraseña", { cuentaId, objetivoId: objetivo.id });
        return { puede: false, motivo };
    }
    olvidarFallos(cuentaId);
    return { puede: true };
}

// Un hash de bcrypt cualquiera (de una cadena al azar), para comparar contra algo.
const HASH_DE_RELLENO = "$2a$10$teZhszFoZSUkDYXr88oSFeVA3EbLhOXp8OlsnKV9fnLF44h3itmWG";

/** Intentos fallidos por cuenta: 10 en 15 minutos y se para. En memoria del proceso. */
const TOPE_DE_FALLOS = 10;
const VENTANA_DE_FALLOS_MS = 15 * 60 * 1000;
const fallos = new Map<string, number[]>();

function losRecientes(cuentaId: string): number[] {
    const ahora = Date.now();
    const lista = (fallos.get(cuentaId) ?? []).filter((t) => ahora - t < VENTANA_DE_FALLOS_MS);
    fallos.set(cuentaId, lista);
    return lista;
}
function demasiadosIntentos(cuentaId: string): boolean {
    return losRecientes(cuentaId).length >= TOPE_DE_FALLOS;
}
function apuntarFallo(cuentaId: string) {
    losRecientes(cuentaId).push(Date.now());
}
function olvidarFallos(cuentaId: string) {
    fallos.delete(cuentaId);
}
