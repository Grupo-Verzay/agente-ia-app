/**
 * ¿Puede una cuenta LLEGAR a otra? La regla, pura.
 *
 * Es la misma que ya rige en el CRM (`lasCuentasQueCuelganDe`): **el alcance
 * va HACIA ABAJO**. Aquí se aplica a las puertas que dejan actuar sobre otra
 * cuenta —«Ingresar» (`impersonateUser` y la cookie que lee `currentUser()`) y
 * `assertCanAccessTargetUser`, que es la puerta de más de sesenta acciones—.
 *
 * Tres cosas no se alcanzan nunca, salvo el superadministrador de verdad:
 *
 * 1. **Una cuenta de superadministrador.** Entrar en ella es heredar la
 *    plataforma entera.
 * 2. **Una cuenta por ENCIMA de la propia** (su madre, la madre de su madre).
 *    Es la fuga de Yair: administrador de Verzay | Atencion, que con rol de
 *    `admin` podía «Ingresar» a Carlos Arcos, que está encima de él, y actuar
 *    como él.
 * 3. **Una cuenta de la CASA** (`admin`) que no cuelgue de la propia. Una
 *    hermana es de la misma familia y no es de uno: verla sería ver hacia los
 *    lados, que es la otra mitad de la fuga.
 *
 * Lo que queda —un cliente (`user`) de la plataforma, o una cuenta que sí
 * cuelga de la propia— sigue decidiéndose como siempre, con las reglas de rol de
 * cada puerta (admin sobre sus clientes, el reseller sobre su cartera, el
 * colaborador sobre los que le asignaron). Esto solo QUITA; no abre nada.
 *
 * Y la mitad que se olvida: el objetivo se juzga por su **CUENTA**
 * (`ownerId ?? id`), no solo por su fila. Entrar como una persona del equipo de
 * Carlos es actuar con el alcance de Carlos: su fila tiene rol `user`, pero su
 * cuenta es la de arriba.
 */
import { isAdminLike } from "@/lib/rbac";
import {
    lasCuentasPorEncimaDe,
    lasCuentasQueCuelganDe,
} from "@/lib/crm-de-la-familia";

export type EnlaceEntreCuentas = { de: string; a: string };

export type Objetivo = {
    /** La fila a la que se quiere llegar. */
    id: string;
    role: string | null;
    /** Su cuenta: `ownerId ?? id`. */
    cuentaId: string;
    /** El rol de esa cuenta. Igual que `role` si la fila ya es la cuenta. */
    rolDeLaCuenta: string | null;
};

export type Veredicto =
    | { puede: true }
    | { puede: false; motivo: "superadmin" | "por-encima" | "otra-cuenta-de-la-casa" };

/**
 * `cuenta` es la cuenta por la que actúa quien pregunta (`cuentaQueManda`), y
 * `enlaces` los de su familia **con su sentido** (`de` vinculó a `a`), más el
 * salto por `owner_id` si esa cuenta cuelga de otra.
 */
export function puedeLlegarA(input: {
    esSuperAdmin: boolean;
    cuenta: string;
    objetivo: Objetivo;
    enlaces: readonly EnlaceEntreCuentas[];
}): Veredicto {
    if (input.esSuperAdmin) return { puede: true };

    const cuenta = String(input.cuenta ?? "").trim();
    const { objetivo } = input;
    const destino = String(objetivo.cuentaId || objetivo.id || "").trim();

    // Lo propio —su cuenta o alguien de su equipo— no es otra cuenta. Pero ni
    // siquiera ahí se entra como un superadministrador.
    if (objetivo.role === "super_admin" || objetivo.rolDeLaCuenta === "super_admin") {
        return { puede: false, motivo: "superadmin" };
    }
    if (!cuenta || destino === cuenta) return { puede: true };

    if (lasCuentasPorEncimaDe(cuenta, input.enlaces).includes(destino)) {
        return { puede: false, motivo: "por-encima" };
    }

    if (
        isAdminLike(objetivo.rolDeLaCuenta ?? objetivo.role) &&
        !lasCuentasQueCuelganDe(cuenta, input.enlaces).includes(destino)
    ) {
        return { puede: false, motivo: "otra-cuenta-de-la-casa" };
    }

    return { puede: true };
}

/** ¿Cuelga `destino` de `cuenta`, bajando por los enlaces? */
export function cuelgaHaciaAbajo(
    cuenta: string,
    destino: string,
    enlaces: readonly EnlaceEntreCuentas[],
): boolean {
    const c = String(cuenta ?? "").trim();
    const d = String(destino ?? "").trim();
    if (!c || !d || c === d) return false;
    return lasCuentasQueCuelganDe(c, enlaces).includes(d);
}
