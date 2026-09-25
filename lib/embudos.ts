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
 * Cada color trae las clases de los CUATRO sitios donde una etapa se pinta, y
 * eso es lo que hace que los cuatro digan lo mismo: la cabecera de la columna
 * del tablero (`cabecera`), el borde de su tarjeta (`borde`), el punto de la
 * lista del selector (`punto`), el icono de la cabecera del chat (`texto`) y la
 * pastilla de la fila de la bandeja (`pastilla`). Con las clases escritas en
 * cada pantalla, el día que se afine la paleta la misma etapa saldría de un
 * color en el tablero y de otro en la fila.
 *
 * Las clases van escritas enteras —nada de `bg-${x}`— porque Tailwind solo
 * genera lo que ve literal, y `tailwind.config.ts` mira `lib/`.
 */
export const COLORES_DE_ETAPA = [
    {
        nombre: "Gris",
        cabecera: "bg-slate-500",
        borde: "#64748B",
        punto: "bg-slate-400",
        texto: "text-slate-500 dark:text-slate-400",
        pastilla: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    },
    {
        nombre: "Azul",
        cabecera: "bg-blue-500",
        borde: "#3B82F6",
        punto: "bg-blue-500",
        texto: "text-blue-500 dark:text-blue-400",
        pastilla: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300",
    },
    {
        nombre: "Ámbar",
        cabecera: "bg-amber-500",
        borde: "#F59E0B",
        punto: "bg-amber-500",
        texto: "text-amber-500 dark:text-amber-400",
        pastilla: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    {
        nombre: "Rojo",
        cabecera: "bg-red-500",
        borde: "#EF4444",
        punto: "bg-red-500",
        texto: "text-red-500 dark:text-red-400",
        pastilla: "border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
    },
    {
        nombre: "Verde",
        cabecera: "bg-green-600",
        borde: "#16A34A",
        punto: "bg-green-500",
        texto: "text-green-600 dark:text-green-400",
        pastilla: "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300",
    },
    {
        nombre: "Gris oscuro",
        cabecera: "bg-gray-500",
        borde: "#6B7280",
        punto: "bg-gray-400",
        texto: "text-gray-500 dark:text-gray-400",
        pastilla: "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
    },
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

/**
 * El ÍNDICE en la paleta del color de una etapa: el elegido, o el de su
 * posición.
 *
 * Es índice y no color a propósito: la fila de la bandeja no tiene delante la
 * lista de etapas de su embudo —solo la suya—, así que el servidor le manda el
 * índice ya resuelto y la pastilla lo pinta sin volver a deducir nada. Si lo
 * dedujera otra vez con una posición que no tiene, la misma etapa saldría de un
 * color en el tablero y de otro en la fila.
 */
export function elIndiceDelColorDeLaEtapa(color: number | null | undefined, posicion: number): number {
    const n = COLORES_DE_ETAPA.length;
    const elegido =
        typeof color === "number" && Number.isInteger(color) && color >= 0 && color < n ? color : null;
    return elegido ?? (((posicion % n) + n) % n);
}

/** El color de una etapa: el elegido, o el de su posición. */
export function elColorDeLaEtapa(color: number | null | undefined, posicion: number): ColorDeEtapa {
    return COLORES_DE_ETAPA[elIndiceDelColorDeLaEtapa(color, posicion)];
}

/**
 * La etapa de una conversación tal como viaja a la fila de la bandeja: lo justo
 * para pintar su pastilla.
 *
 * `color` es el ÍNDICE ya resuelto de `COLORES_DE_ETAPA`, no el guardado: la
 * fila no sabe en qué posición está la etapa dentro de su embudo, y sin esa
 * posición el color por defecto no se puede deducir.
 */
export type EtapaDeLaFila = {
    id: string;
    nombre: string;
    color: number;
};

/**
 * # El texto de la pastilla se corta a 14 caracteres
 *
 * La fila de la bandeja ya va justa —«Descartado» + la etapa + «Asignar» + tres
 * contadores + las etiquetas— y un nombre de etapa puede tener hasta
 * `TOPE_DE_NOMBRE` (40). Sin recorte, una etapa llamada «Esperando respuesta
 * del cliente» empuja a «Asignar» y a los contadores fuera de la fila.
 *
 * 14 porque es lo que mide «Sin clasificar», que es la pastilla de al lado: así
 * las dos ocupan lo mismo en el peor caso y la fila se lee pareja. El corte
 * INCLUYE los puntos suspensivos (13 + «…»), o un nombre de 15 saldría más
 * ancho que la referencia justo en el caso que esto viene a acotar.
 *
 * El nombre entero no se pierde: se lee en el globo al posar el cursor.
 */
export const TOPE_DE_TEXTO_DE_PASTILLA = 14;

/**
 * El tope de ancho de la pastilla, la red de seguridad del recorte de arriba.
 *
 * Los 14 caracteres acotan cuántas letras se pintan, no cuánto miden: «WWWWWWW»
 * ocupa el doble que «Sin clasificar». Con este tope la pastilla se recorta
 * también a lo ancho («…» por CSS) y la fila no se desborda con ningún nombre.
 *
 * 6.75rem = 108 px, y el número está medido, no elegido: «Sin clasificar» mide
 * **89,2 px** en esta fila y el nombre de 14 caracteres más largo que se ha
 * medido («Esperando res…») **106,4**. Así que 108 es a la vez *un poco más
 * ancha que la referencia* (+21 %) y lo justo para que un nombre de 14
 * caracteres normales NO se recorte dos veces —por caracteres y por ancho—.
 * Por encima solo muerde con letras anchas, que es para lo que está.
 *
 * El banco lo mide contra la pastilla de al lado en vez de darlo por bueno: el
 * tope no puede pasar del 25 % sobre ella, y un nombre de 14 caracteres tiene
 * que caber sin topar.
 */
export const ANCHO_DE_LA_PASTILLA = "max-w-[6.75rem]";

/** El nombre de la etapa recortado para su pastilla, con «…» si no cabe. */
export function elTextoDeLaPastilla(nombre: string): string {
    const limpio = nombre.trim();
    if (limpio.length <= TOPE_DE_TEXTO_DE_PASTILLA) return limpio;
    return `${limpio.slice(0, TOPE_DE_TEXTO_DE_PASTILLA - 1).trimEnd()}…`;
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
