/**
 * La barrita de arriba que alterna entre Chats y Correos sin pasar por el
 * menú. Pura, para poder probarla sin navegador.
 *
 * Dos reglas:
 * 1. **Solo sale en las dos pantallas que alterna.** En cualquier otra no hay
 *    nada que alternar.
 * 2. **Y solo si la persona tiene LAS DOS en su menú.** Ofrecer Correos a quien
 *    no lo tiene es un enlace que lleva a una puerta cerrada; con una sola no
 *    hay nada que elegir.
 */
export const BANDEJAS = [
    { clave: "chats", ruta: "/chats", nombre: "Chats" },
    { clave: "correo", ruta: "/correo", nombre: "Correos" },
] as const;

export type ClaveDeBandeja = (typeof BANDEJAS)[number]["clave"];

function esLaRuta(pathname: string, ruta: string): boolean {
    return pathname === ruta || pathname.startsWith(ruta + "/");
}

/** Cuál de las dos se está mirando, o `null` si ninguna. */
export function laBandejaActiva(pathname: string | null | undefined): ClaveDeBandeja | null {
    if (!pathname) return null;
    return BANDEJAS.find((b) => esLaRuta(pathname, b.ruta))?.clave ?? null;
}

/** ¿Se pinta la barrita? `rutas` son las del menú de la persona. */
export function seVeLaBarritaDeBandejas(
    pathname: string | null | undefined,
    rutas: (string | null | undefined)[],
): boolean {
    if (!laBandejaActiva(pathname)) return false;
    const tiene = new Set(rutas.filter((r): r is string => typeof r === "string").map((r) => r.replace(/\/+$/, "")));
    return BANDEJAS.every((b) => tiene.has(b.ruta));
}
