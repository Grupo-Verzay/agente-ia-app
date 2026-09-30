/**
 * Lo COMÚN a la guía pública de cualquier módulo (`/guia/<modulo>`): la forma
 * de una sección y de un paso, la barra de arriba de la plataforma —que es la
 * misma en todas las pantallas— y cómo se arman la carpeta de capturas, el
 * vídeo y la navegación entre secciones.
 *
 * Cada guía pone solo su contenido (`lib/guia-leads.ts`, `lib/guia-catalogo.ts`)
 * y lo pasa por `laGuiaDe`. Con estas piezas escritas en cada guía, la segunda
 * saldría con otra carpeta, otra forma de numerar o un paso de más en la barra
 * de arriba, y las dos guías dejarían de parecerse — que es justo lo que se
 * pidió que fueran: simétricas.
 *
 * Puro: lo usan las páginas públicas, los scripts de capturas y los bancos.
 */

export type Paso = {
    titulo: string;
    /** Una o dos frases. La captura explica; el texto solo pone nombre a lo que se ve. */
    texto: string;
    /** Nombre del fichero en la carpeta de capturas de la guía, sin carpeta. */
    imagen: string;
    alt: string;
};

/** Los iconos que puede llevar una sección (ver `IconoDeSeccion`, `components/guia/Guia.tsx`). */
export const ICONOS_DE_SECCION = [
    "LayoutDashboard",
    "Columns3",
    "ToggleRight",
    "Filter",
    "Search",
    "Download",
    "UserPlus",
    "MoreHorizontal",
    "Link2",
    "MessageCircle",
    "Palette",
    "Type",
    "Share2",
    "SlidersHorizontal",
    "Store",
    "PlusCircle",
    "Users",
    "FolderOpen",
    "PenLine",
    "GitBranch",
    "StickyNote",
    "LayoutGrid",
] as const;

export type Seccion = {
    slug: string;
    titulo: string;
    resumen: string;
    /** Nombre de un icono de lucide-react de `ICONOS_DE_SECCION`. */
    icono: (typeof ICONOS_DE_SECCION)[number];
    /**
     * La captura de la tarjeta en el índice: `mini-<slug>.webp`, PROPIA de la
     * tarjeta y no la de un paso. Lleva el enfoque —la zona de la sección
     * nítida y en su recuadro, el resto atenuado— y es 16:9 como la tarjeta
     * (`taller-de-la-guia.mjs › miniatura`).
     */
    miniatura: string;
    pasos: Paso[];
    /** Lo que conviene saber y no cabe en un paso. Corto. */
    consejos?: string[];
};

/**
 * Las partes de la BARRA DE ARRIBA, en su orden, con el componente que pinta
 * cada una en `components/custom/Breadcrumbs.tsx`. Es la MISMA barra en todas
 * las pantallas, así que está aquí y no en cada guía: el banco lee esa barra y
 * exige que tenga exactamente estas, en este orden. Un botón nuevo arriba sin
 * su nombre en las guías las pone en rojo.
 */
export const PARTES_DE_LA_BARRA_DE_ARRIBA = [
    { nombre: "Abrir o recoger el menú", componente: "SidebarTrigger" },
    { nombre: "Pasar a Chats o a Correos", componente: "AlternarBandeja" },
    { nombre: "Ver tutoriales", componente: "Ver tutoriales" },
    { nombre: "Buscar en toda la plataforma", componente: "GlobalSearch" },
    { nombre: "Soporte", componente: "BotonDeSoporte" },
    { nombre: "Tus notificaciones", componente: "NotificationCenter" },
] as const;

/** El texto del paso «La barra de arriba», igual en todas las guías: las seis partes numeradas. */
export const TEXTO_DE_LA_BARRA_DE_ARRIBA = PARTES_DE_LA_BARRA_DE_ARRIBA.map((p, i) => `${i + 1} ${p.nombre}`).join(" · ") + ".";

export type Contenido = { titulo: string; subtitulo: string; descripcion: string; secciones: Seccion[] };

/**
 * Una guía con todo lo que cuelga de su nombre: `carpeta` es a la vez la
 * dirección de las páginas (`/guia/<modulo>`) y la de sus capturas en
 * `public/` (`public/guia/<modulo>/`).
 */
export function laGuiaDe(modulo: string, contenido: Contenido) {
    const carpeta = `/guia/${modulo}`;
    const secciones: readonly Seccion[] = contenido.secciones;
    const portada = `${carpeta}/portada.webp`;
    return {
        modulo,
        carpeta,
        video: `${carpeta}/demostracion.webm`,
        portada,
        secciones,
        laSeccion(slug: string): Seccion | null {
            return secciones.find((s) => s.slug === slug) ?? null;
        },
        /** La anterior y la siguiente, para navegar sin volver al índice. */
        lasVecinas(slug: string): { anterior: Seccion | null; siguiente: Seccion | null } {
            const i = secciones.findIndex((s) => s.slug === slug);
            if (i < 0) return { anterior: null, siguiente: null };
            return { anterior: secciones[i - 1] ?? null, siguiente: secciones[i + 1] ?? null };
        },
        /** Todas las capturas que la guía enseña, sin repetir: lo que el script tiene que tomar. */
        lasCapturasQueSeEnsenan(): string[] {
            const todas = new Set<string>([portada.split("/").pop()!]);
            for (const s of secciones) {
                todas.add(s.miniatura);
                for (const p of s.pasos) todas.add(p.imagen);
            }
            return [...todas];
        },
        laRutaDeLaCaptura(nombre: string): string {
            return `${carpeta}/${nombre}`;
        },
    };
}

export type Guia = ReturnType<typeof laGuiaDe>;
