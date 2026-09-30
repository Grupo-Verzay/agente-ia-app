/**
 * El CENTRO DE AYUDA (`/ayuda`, el botón «Ayuda» de la barra de arriba): las
 * diez categorías —una por cada grupo del menú lateral—, en qué categoría cae
 * cada guía publicada y el buscador que las recorre todas.
 *
 * Puro y SIN las guías dentro: lo importan las pantallas de cliente, y meter
 * aquí el contenido de las quince guías lo empaquetaría entero hacia el
 * navegador. Quien arma la lista de guías es `lib/guias-del-centro-de-ayuda.ts`,
 * en el servidor, y a la pantalla le baja solo lo que pinta.
 *
 * # Las guías se clasifican SOLAS, por la RUTA de su pantalla
 *
 * Una guía publicada ya dice en qué pantalla sale su tarjeta (`ruta` de
 * `GUIAS_PUBLICADAS`). Esa ruta vive en un grupo del menú, y ese grupo es su
 * categoría: nadie la clasifica a mano. Una guía nueva aparece en su categoría
 * el día que se publica, con solo registrar su fila como ya se hacía.
 *
 * Las pantallas de cada grupo son las del menú de un CLIENTE, el mismo que
 * siembran las guías (`scripts/menu-de-un-cliente.mjs`). El banco compara las
 * dos listas: si el menú gana una pantalla o la mueve de grupo, se pone rojo.
 *
 * # Las diez se enseñan siempre
 *
 * Aunque no tengan ninguna guía todavía. Una categoría que desaparece se lee
 * como que esa parte de la plataforma no tiene ayuda nunca; una que dice
 * «Estamos trabajando en esta guía» dice que viene.
 */
import { sinTildes } from "@/lib/pantalla-de-notas";

/** Los iconos de las categorías: los de su grupo en el menú (`iconMap`, heroicons). */
export type IconoDeCategoria =
    | "ShieldCheckIcon"
    | "ChatBubbleLeftRightIcon"
    | "IdentificationIcon"
    | "PuzzlePieceIcon"
    | "AdjustmentsHorizontalIcon"
    | "LifebuoyIcon"
    | "UsersIcon"
    | "SparklesIcon"
    | "BoltIcon"
    | "Cog6ToothIcon";

export type PantallaDelMenu = { nombre: string; ruta: string };

export type CategoriaDeAyuda = {
    slug: string;
    nombre: string;
    icono: IconoDeCategoria;
    /** Las pantallas del grupo, en el orden del menú. De aquí sale la clasificación. */
    pantallas: readonly PantallaDelMenu[];
};

/**
 * Las diez, en el orden del menú lateral. `Panel` cuenta además la ruta del
 * propio módulo (`/client-panel`): es una pantalla del grupo aunque no sea una
 * de sus pestañas.
 */
export const CATEGORIAS_DE_AYUDA: readonly CategoriaDeAyuda[] = [
    {
        slug: "panel",
        nombre: "Panel",
        icono: "ShieldCheckIcon",
        pantallas: [
            { nombre: "Panel", ruta: "/client-panel" },
            { nombre: "Embudos", ruta: "/embudos" },
            { nombre: "Calificación", ruta: "/crm/kanban" },
            { nombre: "Catálogo", ruta: "/mis-catalogo" },
            { nombre: "Cobros", ruta: "/cobros" },
            { nombre: "Proyectos", ruta: "/proyectos" },
            { nombre: "Diagramas", ruta: "/diagramas" },
            { nombre: "Reuniones", ruta: "/reuniones" },
            { nombre: "Mis tickets", ruta: "/mis-tickets" },
            { nombre: "Finanzas", ruta: "/dashboard/finance" },
            { nombre: "Estadísticas", ruta: "/crm/dashboard" },
            { nombre: "Resumen", ruta: "/crm/reportes" },
        ],
    },
    {
        slug: "bandeja",
        nombre: "Bandeja",
        icono: "ChatBubbleLeftRightIcon",
        pantallas: [
            { nombre: "Chats", ruta: "/chats" },
            { nombre: "Correos", ruta: "/correo" },
            { nombre: "Llamadas", ruta: "/crm/llamadas" },
        ],
    },
    {
        slug: "contactos",
        nombre: "Contactos",
        icono: "IdentificationIcon",
        pantallas: [
            { nombre: "Leads", ruta: "/sessions" },
            { nombre: "Agenda", ruta: "/schedule" },
            { nombre: "Etiquetas", ruta: "/tags" },
        ],
    },
    {
        slug: "integraciones",
        nombre: "Integraciones",
        icono: "PuzzlePieceIcon",
        pantallas: [
            { nombre: "Mis datos", ruta: "/my-data" },
            { nombre: "Multiagenda", ruta: "/bookings" },
            { nombre: "Google Sheets", ruta: "/google-sheets" },
        ],
    },
    {
        slug: "herramientas",
        nombre: "Herramientas",
        icono: "AdjustmentsHorizontalIcon",
        pantallas: [
            { nombre: "Copiloto", ruta: "/copiloto" },
            { nombre: "Mis notas", ruta: "/notas" },
            { nombre: "Mis tareas", ruta: "/tareas" },
        ],
    },
    {
        slug: "apps-externas",
        nombre: "Apps Externas",
        icono: "LifebuoyIcon",
        pantallas: [
            { nombre: "Integrar URLs", ruta: "/integraciones" },
            { nombre: "AI Imágenes", ruta: "/ai-image" },
            { nombre: "Mis formularios", ruta: "/mis-formularios" },
        ],
    },
    {
        slug: "entrenamiento",
        nombre: "Entrenamiento",
        icono: "UsersIcon",
        pantallas: [
            { nombre: "Usuarios", ruta: "/equipo" },
            { nombre: "Agente IA", ruta: "/ia" },
            { nombre: "Productos", ruta: "/products" },
        ],
    },
    {
        slug: "creacion-de-flujos",
        nombre: "Creación de Flujos",
        icono: "SparklesIcon",
        pantallas: [
            { nombre: "Campañas", ruta: "/campaigns" },
            { nombre: "Crear flujos", ruta: "/workflow" },
            { nombre: "Follow-ups IA", ruta: "/crm/rules" },
        ],
    },
    {
        slug: "automatizaciones",
        nombre: "Automatizaciones",
        icono: "BoltIcon",
        pantallas: [
            { nombre: "Mis macros", ruta: "/macros" },
            { nombre: "Recordatorios", ruta: "/reminders" },
            { nombre: "Respuestas Rápidas", ruta: "/auto-replies" },
        ],
    },
    {
        slug: "conexion-y-ajustes",
        nombre: "Conexión y Ajustes",
        icono: "Cog6ToothIcon",
        pantallas: [{ nombre: "Conexión y Ajustes", ruta: "/profile" }],
    },
];

export const RUTA_DEL_CENTRO_DE_AYUDA = "/ayuda";

/** Lo que se enseña cuando una categoría no tiene ninguna guía todavía. */
export const SIN_GUIAS_TODAVIA = "Estamos trabajando en esta guía";

export function laCategoria(slug: string | null | undefined): CategoriaDeAyuda | null {
    return CATEGORIAS_DE_AYUDA.find((c) => c.slug === slug) ?? null;
}

export function elEnlaceDeLaCategoria(slug: string): string {
    return `${RUTA_DEL_CENTRO_DE_AYUDA}/${slug}`;
}

/** La ruta sin dominio, sin parámetros y sin barra final, para comparar. */
function laRutaLimpia(ruta: string): string {
    const sinNada = (ruta || "").trim().split(/[?#]/)[0] ?? "";
    const sinBarra = sinNada.replace(/\/+$/, "");
    return sinBarra.startsWith("/") ? sinBarra : `/${sinBarra}`;
}

/**
 * La categoría de la pantalla de una ruta: la del grupo del menú donde vive.
 * Vale también una SUBpantalla (`/dashboard/finance/sales` cae en Panel), y
 * gana la ruta más larga que encaje, cortando por SEGMENTO: `/crm/llamadas`
 * es de Bandeja aunque `/crm/kanban` sea de Panel, y `/tagsx` no es `/tags`.
 * `null` si la ruta no está en el menú.
 */
export function laCategoriaDeLaRuta(ruta: string): string | null {
    const r = laRutaLimpia(ruta);
    let mejor: { slug: string; largo: number } | null = null;
    for (const c of CATEGORIAS_DE_AYUDA) {
        for (const p of c.pantallas) {
            const encaja = r === p.ruta || r.startsWith(`${p.ruta}/`);
            if (encaja && (!mejor || p.ruta.length > mejor.largo)) mejor = { slug: c.slug, largo: p.ruta.length };
        }
    }
    return mejor?.slug ?? null;
}

/** Una sección de una guía: lo que el buscador también mira. */
export type SeccionDeAyuda = { slug: string; titulo: string; claves: string };

/** Lo que la pantalla necesita de una guía publicada, y nada más. */
export type GuiaDeAyuda = {
    modulo: string;
    /** «Guía de Leads»: el mismo título que su tarjeta en «Ver tutoriales». */
    titulo: string;
    /** La descripción de su tarjeta («Aprende a … en la plataforma»). */
    descripcion: string;
    /** El nombre de la guía («Leads»), el de su pantalla en el menú. */
    nombre: string;
    subtitulo: string;
    url: string;
    ruta: string;
    categoria: string | null;
    secciones: readonly SeccionDeAyuda[];
};

/** Las guías de una categoría, en el orden en que se publicaron. */
export function lasGuiasDeLaCategoria(guias: readonly GuiaDeAyuda[], slug: string): GuiaDeAyuda[] {
    return guias.filter((g) => g.categoria === slug);
}

/** Cuántas guías tiene cada categoría (las diez, también las que tienen cero). */
export function cuantasPorCategoria(guias: readonly GuiaDeAyuda[]): Record<string, number> {
    const cuenta: Record<string, number> = Object.fromEntries(CATEGORIAS_DE_AYUDA.map((c) => [c.slug, 0]));
    for (const g of guias) if (g.categoria && g.categoria in cuenta) cuenta[g.categoria] += 1;
    return cuenta;
}

/** «1 guía», «3 guías». */
export function elNumeroDeGuias(n: number): string {
    return n === 1 ? "1 guía" : `${n} guías`;
}

/** Las pantallas de una categoría, en una frase: «Chats, Correos y Llamadas». */
export function lasPantallasEnUnaFrase(c: CategoriaDeAyuda): string {
    const nombres = c.pantallas.filter((p) => p.nombre !== c.nombre).map((p) => p.nombre);
    if (nombres.length === 0) return c.nombre;
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* El buscador                                                         */
/* ------------------------------------------------------------------ */

/** Un resultado del buscador: la guía, y la sección si lo que coincidió es de una. */
export type ResultadoDeAyuda = {
    guia: GuiaDeAyuda;
    seccion: SeccionDeAyuda | null;
    /** A dónde lleva: la guía, o directo a su sección. */
    url: string;
    puntos: number;
};

/** Cuántos resultados enseña el buscador de arriba como mucho. */
export const TOPE_DE_RESULTADOS = 8;

/**
 * Sin tildes ni mayúsculas, con las MISMAS letras que el buscador de Mis notas
 * y el de Guías (`sinTildes`): «catalogo» encuentra «Catálogo».
 *
 * Las guías que coinciden con lo que se escribió, de la que más encaja a la
 * que menos. Cada palabra tiene que aparecer en algún sitio de la guía («crear
 * formulario» encuentra la guía de Mis formularios aunque las dos palabras no
 * vayan juntas), y pesa más dónde aparece:
 *
 *   el nombre de la guía > su descripción > el título de una sección > lo demás.
 *
 * Si lo que más encaja es una SECCIÓN, el resultado lleva directo a ella: quien
 * busca «exportar» quiere la sección de exportar, no el principio de Leads.
 */
export function buscarEnLasGuias(guias: readonly GuiaDeAyuda[], consulta: string, tope = TOPE_DE_RESULTADOS): ResultadoDeAyuda[] {
    const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];

    const resultados: ResultadoDeAyuda[] = [];
    for (const g of guias) {
        const nombre = sinTildes(`${g.nombre} ${g.titulo}`);
        const descripcion = sinTildes(`${g.descripcion} ${g.subtitulo}`);
        const secciones = g.secciones.map((s) => ({ s, titulo: sinTildes(s.titulo), claves: sinTildes(s.claves) }));

        let puntos = 0;
        let enTodas = true;
        const porSeccion = new Map<string, number>();
        for (const w of palabras) {
            let mejor = 0;
            if (nombre.includes(w)) mejor = 100;
            else if (descripcion.includes(w)) mejor = 40;
            for (const x of secciones) {
                const aqui = x.titulo.includes(w) ? 20 : x.claves.includes(w) ? 8 : 0;
                if (aqui > 0) porSeccion.set(x.s.slug, (porSeccion.get(x.s.slug) ?? 0) + aqui);
                mejor = Math.max(mejor, aqui);
            }
            if (mejor === 0) {
                enTodas = false;
                break;
            }
            puntos += mejor;
        }
        if (!enTodas) continue;

        // La guía entera cuando la palabra está en su nombre; si no, la sección
        // donde más encajó (la primera, a igualdad: van en el orden de la guía).
        const guiaPorNombre = palabras.some((w) => nombre.includes(w));
        let seccion: SeccionDeAyuda | null = null;
        if (!guiaPorNombre) {
            let mejorSeccion = 0;
            for (const x of secciones) {
                const p = porSeccion.get(x.s.slug) ?? 0;
                if (p > mejorSeccion) {
                    mejorSeccion = p;
                    seccion = x.s;
                }
            }
        }
        resultados.push({ guia: g, seccion, url: seccion ? `${g.url}/${seccion.slug}` : g.url, puntos });
    }
    // Estable: a igualdad de puntos, el orden en que se publicaron.
    return resultados
        .map((r, i) => ({ r, i }))
        .sort((a, b) => b.r.puntos - a.r.puntos || a.i - b.i)
        .slice(0, tope)
        .map(({ r }) => r);
}

/**
 * El filtro de la lista de UNA categoría: como el de Guías —título y
 * descripción, sin mayúsculas ni tildes— y también el nombre de sus secciones.
 */
export function pasaElFiltroDeLaCategoria(g: GuiaDeAyuda, consulta: string): boolean {
    const q = sinTildes(consulta.trim());
    if (!q) return true;
    return [g.titulo, g.descripcion, g.nombre, ...g.secciones.map((s) => s.titulo)].some((c) => sinTildes(c).includes(q));
}
