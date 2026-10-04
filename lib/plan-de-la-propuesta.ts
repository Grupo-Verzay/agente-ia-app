/**
 * Una plantilla de Propuestas ENLAZADA a un plan del panel de Planes: lo que se
 * decide sin base ni navegador.
 *
 * Las plantillas a mano (`lib/plantillas-de-planes.ts`) se COPIAN y no saben
 * nada del panel de Planes: un plan renombrado o con otro precio seguía saliendo
 * en las propuestas nuevas con lo de antes, y sin créditos, sin catálogo, sin lo
 * que incluye, sin su video y sin su página pública.
 *
 * Una plantilla enlazada guarda SOLO la referencia al plan —su NIVEL y su
 * modalidad (`RefDePlan`), que son lo que identifica un plan en el panel y no
 * cambian nunca— y todo lo demás se lee EN VIVO al cargarla
 * (`lib/plan-de-la-propuesta.server.ts`): nombre, precio, recuadros de
 * capacidad (créditos, catálogo, asistencia…) y la lista de «Qué incluye este
 * plan», con los MISMOS ítems y en el MISMO orden que su página pública.
 *
 * Y la propuesta guarda la misma referencia (`planes`), no una copia del video
 * ni del enlace: la página pública de la propuesta los resuelve al abrirse, así
 * que un plan que se edita o se apaga en el panel se ve tal cual está hoy.
 * Lo que se COPIA a la propuesta es solo la fila de servicio (nombre, alcance y
 * precio), que es texto que se puede retocar a mano en esa propuesta.
 */

import { comoAsistencia, elNivelDelSlug, NIVELES_DE_PLAN, type Asistencia, type NivelDePlan } from "@/lib/enlaces-de-planes";
import type { VideoDelPlan } from "@/lib/pagina-de-plan";

export type RefDePlan = { nivel: NivelDePlan; asistencia: Asistencia };

/** Cuántos planes puede llevar una propuesta (uno por servicio, como mucho). */
export const TOPE_DE_PLANES_EN_UNA_PROPUESTA = 30;

/** La referencia a un plan de lo que llega de fuera, o `null` si no es un plan. */
export function comoRefDePlan(raw: unknown): RefDePlan | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const nivel = typeof r.nivel === "string" ? elNivelDelSlug(r.nivel) : null;
    const asistencia = comoAsistencia(r.asistencia);
    return nivel && asistencia ? { nivel, asistencia } : null;
}

/** La llave de un plan: un nivel en una modalidad. */
export function laLlaveDelPlan(ref: RefDePlan): string {
    return `${ref.nivel}:${ref.asistencia}`;
}

/** La lista de planes de una propuesta: sin lo que no se entiende, sin repetidos y topada. */
export function comoListaDeRefs(raw: unknown, tope = TOPE_DE_PLANES_EN_UNA_PROPUESTA): RefDePlan[] {
    let lista: unknown = raw;
    if (typeof raw === "string") {
        try {
            lista = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(lista)) return [];
    const vistas = new Set<string>();
    const fuera: RefDePlan[] = [];
    for (const item of lista) {
        const ref = comoRefDePlan(item);
        if (!ref || vistas.has(laLlaveDelPlan(ref))) continue;
        vistas.add(laLlaveDelPlan(ref));
        fuera.push(ref);
        if (fuera.length >= tope) break;
    }
    return fuera;
}

/** Con un plan más, al final y sin repetirlo. */
export function conElPlan(refs: readonly RefDePlan[], ref: RefDePlan, tope = TOPE_DE_PLANES_EN_UNA_PROPUESTA): RefDePlan[] {
    return comoListaDeRefs([...refs, ref], tope);
}

/** Sin un plan. */
export function sinElPlan(refs: readonly RefDePlan[], ref: RefDePlan): RefDePlan[] {
    return refs.filter((r) => laLlaveDelPlan(r) !== laLlaveDelPlan(ref)).map((r) => ({ ...r }));
}

/** El número del nivel (1 a 6). */
export function elNumeroDelNivel(nivel: NivelDePlan): number {
    return NIVELES_DE_PLAN.indexOf(nivel) + 1;
}

export function elNombreDeLaAsistencia(asistencia: Asistencia): string {
    return asistencia === "HUMANO" ? "IA + humana" : "IA";
}

/** Un plan del panel de Planes, como se ofrece en el selector de una plantilla. */
export type PlanParaElegir = { ref: RefDePlan; nombre: string; activo: boolean };

export function elRotuloDelPlan(p: PlanParaElegir): string {
    const apagado = p.activo ? "" : " (apagado)";
    return `Nivel ${elNumeroDelNivel(p.ref.nivel)} · ${p.nombre} · ${elNombreDeLaAsistencia(p.ref.asistencia)}${apagado}`;
}

/** En el orden del panel: por nivel y, dentro del nivel, IA antes que humana. */
export function ordenarPlanesParaElegir<T extends { ref: RefDePlan }>(lista: readonly T[]): T[] {
    const orden = (r: RefDePlan) => elNumeroDelNivel(r.nivel) * 2 + (r.asistencia === "HUMANO" ? 1 : 0);
    return [...lista].sort((a, b) => orden(a.ref) - orden(b.ref));
}

/** Lo que trae un plan al cargarlo en una propuesta. Todo leído en vivo. */
export type PlanParaCargar = {
    ref: RefDePlan;
    nombre: string;
    activo: boolean;
    /** El precio en cada moneda que el panel sabe dar; `null` = no lo sabe. */
    precios: { COP: number | null; USD: number | null };
    /** Los recuadros de capacidad de su página pública (créditos, catálogo, asistencia…). */
    capacidad: { titulo: string; valor: string }[];
    /** «Qué incluye este plan»: los mismos ítems y en el mismo orden que su página pública. */
    funciones: string[];
    /** ¿Tiene video principal en el panel? Sale en la propuesta. */
    video: boolean;
    /** La dirección de su página pública; `null` si no tiene (el plan está apagado). */
    enlace: string | null;
};

const ENCABEZADO_DE_LO_QUE_INCLUYE = "Qué incluye este plan:";

/**
 * El alcance del servicio que sale de un plan: los recuadros de capacidad, una
 * línea cada uno, y debajo la lista de lo que incluye. Topado al tope del campo:
 * lo que no cabe se dice («…y N más»), no se corta a media palabra.
 */
export function elAlcanceDelPlan(p: Pick<PlanParaCargar, "capacidad" | "funciones">, tope: number): string {
    const capacidad = p.capacidad
        .map((c) => `${c.titulo.trim()}: ${c.valor.trim()}`)
        .filter((l) => l.length > 2);
    const partes: string[] = [...capacidad];
    if (p.funciones.length) {
        if (partes.length) partes.push("");
        partes.push(ENCABEZADO_DE_LO_QUE_INCLUYE);
    }
    const base = partes.join("\n");
    let texto = base;
    for (let i = 0; i < p.funciones.length; i++) {
        const linea = `• ${p.funciones[i]!.trim()}`;
        const resto = p.funciones.length - i - 1;
        const cola = resto > 0 ? `\n…y ${resto} más` : "";
        const siguiente = texto ? `${texto}\n${linea}` : linea;
        if ((siguiente + cola).length > tope) {
            const quedan = p.funciones.length - i;
            const aviso = `…y ${quedan} más`;
            return (texto ? `${texto}\n${aviso}` : aviso).slice(0, tope);
        }
        texto = siguiente;
    }
    return texto.slice(0, tope);
}

/** El precio del plan en la moneda de la propuesta, o `null` si el panel no lo da en esa. */
export function elPrecioEnLaMoneda(p: Pick<PlanParaCargar, "precios">, moneda: string): number | null {
    if (moneda === "COP" || moneda === "USD") {
        const v = p.precios[moneda];
        return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
    }
    return null;
}

/** La fila de servicio/producto que sale del plan, con cadenas nuevas. Sin precio en esa moneda, la inversión va vacía. */
export function laFilaDelPlan(p: PlanParaCargar, moneda: string, tope: number): { nombre: string; alcance: string; inversion: string } {
    const precio = elPrecioEnLaMoneda(p, moneda);
    return {
        nombre: String(p.nombre),
        alcance: elAlcanceDelPlan(p, tope),
        inversion: precio === null ? "" : String(precio),
    };
}

/**
 * La dirección como se lee: sin `https://`, sin la barra del final y SIN la
 * consulta. El enlace lleva `?tipo=` —quien abre la propuesta no tiene la
 * cookie de la modalidad— pero eso es para el servidor, no para leerlo.
 */
export function elTextoDelEnlace(href: string): string {
    return href.replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/\/$/, "");
}

/** Lo que la página pública de una propuesta enseña de cada plan, resuelto EN VIVO al abrirla. */
export type PlanDeLaPropuesta = {
    llave: string;
    nombre: string;
    /** El video principal del plan en el panel; `null` = no tiene. */
    video: (VideoDelPlan & { titulo: string; miniatura: string | null }) | null;
    /** La dirección de su página pública; `null` = el plan está apagado y no la tiene. */
    enlace: string | null;
};

/** Lo que de verdad se pinta: un plan sin video ni enlace no deja un recuadro vacío. */
export function losPlanesQueSeEnsenan<T extends Pick<PlanDeLaPropuesta, "video" | "enlace">>(planes: readonly T[]): T[] {
    return planes.filter((p) => Boolean(p.video || p.enlace));
}

/** El rótulo del enlace a la página de un plan. */
export function elRotuloDelEnlaceDelPlan(nombre: string): string {
    const limpio = nombre.trim();
    return limpio ? `Ver todo lo que incluye el plan ${limpio}` : "Ver todo lo que incluye el plan";
}

/** El aviso cuando un plan no tiene página pública. */
export function elAvisoDelPlanApagado(nombre: string): string {
    return `El plan «${nombre}» está apagado en el panel de Planes: su página pública no existe, así que la propuesta no lleva el enlace. Actívalo para que salga.`;
}
