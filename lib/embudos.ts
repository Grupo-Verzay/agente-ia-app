/**
 * Embudos: las reglas, puras y sin imports.
 *
 * Un embudo es de la CUENTA. Lo crean y lo editan el dueño y los
 * administradores —los dos «mandan», con los mismos permisos—, y cada asesor
 * tiene asignado UNO. El asesor ve solo ese, con solo sus conversaciones, y lo
 * único que puede hacer en él es mover sus tarjetas de etapa.
 *
 * Todo lo que decide «qué ve quién» y «dónde cae cada conversación» vive aquí,
 * y lo usan la pantalla y el servidor. Con la regla escrita en los dos lados, el
 * día que se afine una la otra se queda atrás, y eso no se ve como un error: se
 * ve como una tarjeta que sale en el tablero y al moverla dice «No autorizado».
 *
 * # De qué embudo es una conversación
 *
 * No se guarda: se **deduce del asesor que la lleva**. Guardarlo obligaría a
 * que cada camino que reasigna una conversación —la bandeja, la transferencia,
 * el reparto automático, el escalado, el backend— se acordara de moverla de
 * embudo, y el que se olvide la deja en un tablero que ya no es el suyo.
 *
 * - Lleva asesor, y ese asesor tiene embudo → ese embudo.
 * - Sin asesor, o con uno que no tiene embudo (el dueño que la tomó él mismo,
 *   alguien que salió del equipo) → el embudo **por defecto** de la cuenta.
 *
 * # En qué etapa está
 *
 * Se guarda **por conversación y embudo**. Así, si pasa a un asesor con otro
 * embudo entra en la primera etapa de ese, y si vuelve recupera la que tenía.
 * Una etapa guardada que ya no existe —se borró— también cae en la primera: una
 * tarjeta nunca desaparece del tablero por culpa de su etapa.
 */

export type Embudo = {
    id: string;
    nombre: string;
    porDefecto: boolean;
    orden: number;
};

export type Etapa = {
    id: string;
    embudoId: string;
    nombre: string;
    /** Índice en `COLORES_DE_ETAPA`, o `null` = el de su posición. */
    color: number | null;
    orden: number;
};

/**
 * La paleta de las columnas, la misma del Kanban de estados del CRM y en el
 * mismo orden (gris, azul, ámbar, rojo, verde, gris). Una etapa nace con el
 * color de su posición y se puede cambiar a cualquiera de estos.
 *
 * Las clases van escritas enteras —nada de `bg-${x}`— porque Tailwind solo
 * genera lo que ve literal, y `tailwind.config.ts` mira `lib/`.
 */
export const COLORES_DE_ETAPA = [
    { nombre: "Gris", cabecera: "bg-slate-500", borde: "#64748B", punto: "bg-slate-400" },
    { nombre: "Azul", cabecera: "bg-blue-500", borde: "#3B82F6", punto: "bg-blue-500" },
    { nombre: "Ámbar", cabecera: "bg-amber-500", borde: "#F59E0B", punto: "bg-amber-500" },
    { nombre: "Rojo", cabecera: "bg-red-500", borde: "#EF4444", punto: "bg-red-500" },
    { nombre: "Verde", cabecera: "bg-green-600", borde: "#16A34A", punto: "bg-green-500" },
    { nombre: "Gris oscuro", cabecera: "bg-gray-500", borde: "#6B7280", punto: "bg-gray-400" },
] as const;

export type ColorDeEtapa = (typeof COLORES_DE_ETAPA)[number];

/** Topes: una lista que llega del navegador no puede crecer sin fin. */
export const TOPE_DE_ETAPAS = 20;
export const TOPE_DE_NOMBRE = 40;
export const TOPE_DE_EMBUDOS = 30;
/** Cuántas tarjetas trae un tablero. Lo que quede fuera se dice. */
export const TOPE_DE_TARJETAS = 500;

/** Las etapas con las que nace un embudo nuevo. Se editan en el acto. */
export const ETAPAS_INICIALES = ["Nuevo", "En proceso", "Cerrado"] as const;

/** El color de una etapa: el elegido, o el de su posición. */
export function elColorDeLaEtapa(color: number | null | undefined, posicion: number): ColorDeEtapa {
    const n = COLORES_DE_ETAPA.length;
    const elegido =
        typeof color === "number" && Number.isInteger(color) && color >= 0 && color < n ? color : null;
    const i = elegido ?? (((posicion % n) + n) % n);
    return COLORES_DE_ETAPA[i];
}

/** Lo que llega como color se acepta solo si es un índice de la paleta. */
export function comoColor(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isInteger(n) && n >= 0 && n < COLORES_DE_ETAPA.length ? n : null;
}

/** Un nombre saneado, o `null` si no queda nada. */
export function comoNombre(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.replace(/\s+/g, " ").trim().slice(0, TOPE_DE_NOMBRE);
    return limpio || null;
}

/**
 * El embudo por defecto: el marcado, y si no hay ninguno marcado, el primero
 * por orden. Sin eso, en una cuenta donde nadie ha marcado uno las
 * conversaciones sin asesor no saldrían en ningún tablero.
 */
export function elEmbudoPorDefecto(embudos: readonly Embudo[]): Embudo | null {
    if (embudos.length === 0) return null;
    const ordenados = [...embudos].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
    return ordenados.find((e) => e.porDefecto) ?? ordenados[0];
}

/**
 * De qué embudo es una conversación, dado quién la lleva.
 *
 * `asignaciones` es persona → embudo. Un embudo asignado que ya no existe se
 * trata como «sin embudo»: la conversación cae en el por defecto en vez de
 * quedarse fuera de todos los tableros.
 */
export function elEmbudoDeLaConversacion(
    asesorId: string | null | undefined,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): string | null {
    const existentes = new Set(embudos.map((e) => e.id));
    const suyo = asesorId ? asignaciones[asesorId] : undefined;
    if (suyo && existentes.has(suyo)) return suyo;
    return elEmbudoPorDefecto(embudos)?.id ?? null;
}

/**
 * Qué asesores caen en un embudo, para acotar la consulta de conversaciones.
 *
 * - `asesores`: los que tienen este embudo asignado.
 * - `incluyeSinEmbudo`: si es el por defecto, entran además las conversaciones
 *   sin asesor y las de asesores sin embudo — o sea, todas las que NO sean de
 *   `ajenos` (los asesores de los demás embudos).
 */
export function quienCaeEnElEmbudo(
    embudoId: string,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): { asesores: string[]; incluyeSinEmbudo: boolean; ajenos: string[] } {
    const existentes = new Set(embudos.map((e) => e.id));
    const asesores: string[] = [];
    const ajenos: string[] = [];
    for (const [persona, embudo] of Object.entries(asignaciones)) {
        if (!existentes.has(embudo)) continue;
        if (embudo === embudoId) asesores.push(persona);
        else ajenos.push(persona);
    }
    const incluyeSinEmbudo = elEmbudoPorDefecto(embudos)?.id === embudoId;
    return { asesores, incluyeSinEmbudo, ajenos };
}

/**
 * La etapa de una conversación en un embudo: la guardada si sigue existiendo en
 * ESE embudo, y si no, la primera.
 */
export function laEtapaDeLaConversacion(
    guardada: string | null | undefined,
    etapasDelEmbudo: readonly Etapa[],
): string | null {
    if (etapasDelEmbudo.length === 0) return null;
    if (guardada && etapasDelEmbudo.some((e) => e.id === guardada)) return guardada;
    const primera = [...etapasDelEmbudo].sort((a, b) => a.orden - b.orden)[0];
    return primera.id;
}

/** Quién mira, en lo que a embudos importa. */
export type QuienMira = {
    /** La persona (firma). */
    personaId: string;
    /** Dueño o administrador: los dos tienen los mismos permisos. */
    manda: boolean;
};

/**
 * ¿Puede mover esta tarjeta? Quien manda, cualquiera; un asesor, solo las suyas.
 */
export function puedeMoverLaTarjeta(quien: QuienMira, asesorDeLaTarjeta: string | null | undefined): boolean {
    if (quien.manda) return true;
    return Boolean(asesorDeLaTarjeta) && asesorDeLaTarjeta === quien.personaId;
}

/**
 * Qué embudo abre quien mira.
 *
 * - Quien manda: el pedido si existe; si no, el por defecto.
 * - Un asesor: el suyo, pida lo que pida. Sin embudo asignado, ninguno — y la
 *   pantalla lo dice en vez de enseñarle el de otro.
 */
export function elEmbudoQueSeAbre(
    quien: QuienMira,
    pedido: string | null | undefined,
    asignaciones: Readonly<Record<string, string>>,
    embudos: readonly Embudo[],
): string | null {
    const existentes = new Set(embudos.map((e) => e.id));
    if (quien.manda) {
        if (pedido && existentes.has(pedido)) return pedido;
        return elEmbudoPorDefecto(embudos)?.id ?? null;
    }
    const suyo = asignaciones[quien.personaId];
    return suyo && existentes.has(suyo) ? suyo : null;
}

/** Una etapa tal como llega al guardar la lista entera. */
export type EtapaPedida = { id?: string | null; nombre: string; color: number | null };

/**
 * Sanea la lista de etapas que llega del navegador: nombres limpios, colores de
 * la paleta, ids que solo cuentan si son de ESTE embudo, sin repetidos, y entre
 * 1 y `TOPE_DE_ETAPAS`. Devuelve el motivo si no se puede guardar.
 */
export function comoListaDeEtapas(
    valor: unknown,
    idsDelEmbudo: ReadonlySet<string>,
): { ok: true; etapas: EtapaPedida[] } | { ok: false; motivo: string } {
    if (!Array.isArray(valor)) return { ok: false, motivo: "La lista de etapas no es válida." };
    const vistos = new Set<string>();
    const etapas: EtapaPedida[] = [];
    for (const bruto of valor) {
        if (!bruto || typeof bruto !== "object") continue;
        const b = bruto as Record<string, unknown>;
        const nombre = comoNombre(b.nombre);
        if (!nombre) return { ok: false, motivo: "Todas las etapas necesitan un nombre." };
        const id = typeof b.id === "string" && idsDelEmbudo.has(b.id) && !vistos.has(b.id) ? b.id : null;
        if (id) vistos.add(id);
        etapas.push({ id, nombre, color: comoColor(b.color) });
    }
    if (etapas.length === 0) return { ok: false, motivo: "Un embudo necesita al menos una etapa." };
    if (etapas.length > TOPE_DE_ETAPAS) {
        return { ok: false, motivo: `Un embudo puede tener como mucho ${TOPE_DE_ETAPAS} etapas.` };
    }
    return { ok: true, etapas };
}
