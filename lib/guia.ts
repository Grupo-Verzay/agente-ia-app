/**
 * Lo COMÚN de las guías públicas (`/guia/<módulo>`): la forma de un paso y de
 * una sección, y los iconos que puede llevar una tarjeta.
 *
 * Cada módulo escribe su contenido en su propio fichero puro
 * (`lib/guia-leads.ts`, `lib/guia-reuniones.ts`) y lo pintan las MISMAS piezas
 * (`components/guia/Guia.tsx`). Con la forma escrita una vez, una guía nueva no
 * puede traer un campo que las piezas no sepan pintar, y las dos se ven igual
 * por construcción: la simetría entre guías no depende de que alguien copie
 * bien la de al lado.
 */

/**
 * Los iconos de lucide que puede llevar una sección. `components/guia/Guia.tsx`
 * los traduce a su componente con un `Record` de este tipo, así que un nombre
 * nuevo aquí sin su icono allí no compila.
 */
export const ICONOS_DE_SECCION = [
    // Leads
    "LayoutDashboard",
    "Columns3",
    "ToggleRight",
    "Filter",
    "Search",
    "Download",
    "UserPlus",
    "MoreHorizontal",
    // Reuniones
    "CalendarPlus",
    "Video",
    "Mic",
    "LayoutGrid",
    "DoorOpen",
    "MessageSquare",
    "CircleDot",
    "History",
] as const;

export type IconoDeSeccion = (typeof ICONOS_DE_SECCION)[number];

export type Paso = {
    titulo: string;
    /** Una o dos frases. La captura explica; el texto solo pone nombre a lo que se ve. */
    texto: string;
    /** Nombre del fichero en la carpeta de capturas de la guía, sin carpeta. */
    imagen: string;
    alt: string;
};

export type Seccion<Icono extends IconoDeSeccion = IconoDeSeccion> = {
    slug: string;
    titulo: string;
    resumen: string;
    icono: Icono;
    /** La captura de la tarjeta en el índice: `mini-<slug>.webp`, 16:9 y con enfoque. */
    miniatura: string;
    pasos: Paso[];
    /** Lo que conviene saber y no cabe en un paso. Corto. */
    consejos?: string[];
};

/** Dónde se sirve una captura: la carpeta de la guía (en `public/`) y el fichero. */
export function laRutaEnLaCarpeta(carpeta: string, nombre: string): string {
    return `${carpeta}/${nombre}`;
}

/** La anterior y la siguiente de una lista de secciones. */
export function lasVecinasEn<S extends { slug: string }>(
    secciones: readonly S[],
    slug: string,
): { anterior: S | null; siguiente: S | null } {
    const i = secciones.findIndex((s) => s.slug === slug);
    if (i < 0) return { anterior: null, siguiente: null };
    return { anterior: secciones[i - 1] ?? null, siguiente: secciones[i + 1] ?? null };
}

/** Las capturas que enseña una guía, sin repetir: la portada, las miniaturas y los pasos. */
export function lasCapturasDe(
    secciones: readonly Pick<Seccion, "miniatura" | "pasos">[],
    portada: string,
): string[] {
    const todas = new Set<string>([portada.split("/").pop()!]);
    for (const s of secciones) {
        todas.add(s.miniatura);
        for (const p of s.pasos) todas.add(p.imagen);
    }
    return [...todas];
}
