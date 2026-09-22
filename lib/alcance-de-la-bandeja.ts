/**
 * Qué cuentas alcanza la bandeja de Chats de alguien. La regla, pura.
 *
 * Es la misma que ya rigen el CRM (`lasCuentasQueCuelganDe`) y las puertas de
 * #898 (`lib/alcance-entre-cuentas.ts`): **el alcance va HACIA ABAJO**.
 *
 * - La cuenta por la que se actúa, la fila de la persona y la fila efectiva.
 * - Las cuentas que cuelgan de esa cuenta, bajando por `linked_accounts` y sin
 *   pasar nunca por una que también la alcanza a ella (`lasCuentasQueCuelganDe`).
 * - **Nunca** la cuenta madre ni las hermanas.
 * - El superadministrador de verdad, la familia entera: todas cuelgan de él.
 * - Un `agente`, solo lo propio: trabaja en UNA cuenta.
 *
 * # Por qué hacía falta
 *
 * La bandeja juntaba las líneas de las cuentas vinculadas **en los dos
 * sentidos** —las que uno vinculó y aquellas que lo vincularon a uno—. Desde
 * #898 las acciones solo llegan hacia abajo, así que las líneas de la madre
 * salían en la bandeja de la hija y cualquier cosa que se hiciera sobre ellas
 * contestaba «No autorizado»: menú abierto, puerta cerrada. Es el punto 5 de la
 * auditoría de alcance.
 *
 * Una pareja recíproca (`A ↔ B`) se anula, igual que en el CRM: un enlace de
 * ida y vuelta no dice quién es la madre, y adivinarlo es lo que abrió la fuga.
 */
import { lasCuentasQueCuelganDe } from "@/lib/crm-de-la-familia";

export type EntradaDeLaBandeja = {
    /** La cuenta por la que se actúa: `ownerId ?? id`. */
    cuenta: string;
    /** La fila de la persona sentada delante (`sessionUserId ?? id`). */
    persona: string;
    /** La fila efectiva que devuelve `currentUser()`. */
    efectiva: string;
    esSuperAdmin: boolean;
    esAgente?: boolean;
    /** Solo se mira si es superadministrador: el componente entero. */
    familia?: readonly string[];
    /** Los enlaces con sentido (`de` vinculó a `a`). */
    enlaces?: readonly { de: string; a: string }[];
};

/** Sin repetidos, y la cuenta por la que se actúa SIEMPRE primera. */
export function lasCuentasDeLaBandeja(e: EntradaDeLaBandeja): string[] {
    const cuenta = String(e.cuenta ?? "").trim();
    const base = [cuenta, e.persona, e.efectiva]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean);
    if (!cuenta) return Array.from(new Set(base));

    const mas = e.esAgente
        ? []
        : e.esSuperAdmin
            ? [...(e.familia ?? [])]
            : lasCuentasQueCuelganDe(cuenta, e.enlaces ?? []);

    return Array.from(new Set([...base, ...mas.map((x) => String(x ?? "").trim()).filter(Boolean)]));
}

/** ¿Es un agente de su cuenta? Participa en UNA cuenta, no en las vinculadas. */
export function esAgenteDeLaCuenta(persona: {
    ownerId?: string | null;
    advisorRole?: string | null;
}): boolean {
    return !!persona?.ownerId && persona?.advisorRole !== "administrador";
}
