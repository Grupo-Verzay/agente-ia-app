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
 * capacidad (créditos, catálogo, asistencia…), la lista de «Qué incluye este
 * plan», con los MISMOS ítems y en el MISMO orden que su página pública, y
 * «Todo incluido, sin sorpresas» (lo que trae sin costo adicional).
 *
 * Y la propuesta guarda la misma referencia (`planes`), no una copia del video
 * ni del enlace: la página pública de la propuesta los resuelve al abrirse, así
 * que un plan que se edita o se apaga en el panel se ve tal cual está hoy.
 * Lo que se COPIA a la propuesta es solo la fila de servicio (nombre, alcance y
 * precio), que es texto que se puede retocar a mano en esa propuesta.
 */

import { comoAsistencia, elNivelDelSlug, NIVELES_DE_PLAN, type Asistencia, type NivelDePlan } from "@/lib/enlaces-de-planes";
import type { BotonDelPlan, FuncionQueSeEnsena, TarjetaDeCapacidad, TodoIncluidoDelPlan, VideoDelPlan } from "@/lib/pagina-de-plan";

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
    /** «Todo incluido, sin sorpresas», como sale en su página; `null` = no tiene. */
    todoIncluido?: TodoIncluidoDelPlan | null;
    /** ¿Tiene video principal en el panel? Sale en la propuesta. */
    video: boolean;
    /** La dirección de su página pública; `null` si no tiene (el plan está apagado). */
    enlace: string | null;
};

const ENCABEZADO_DE_LO_QUE_INCLUYE = "Qué incluye este plan:";

/**
 * El alcance del servicio que sale de un plan: los recuadros de capacidad, una
 * línea cada uno, debajo la lista de lo que incluye y, al final, «Todo
 * incluido, sin sorpresas» con su texto. Topado al tope del campo: lo que no
 * cabe se dice («…y N más»), no se corta a media palabra. El bloque de «Todo
 * incluido» tiene su sitio APARTADO (hasta la mitad del campo): una lista
 * larga de funciones no lo deja fuera.
 */
export function elAlcanceDelPlan(
    p: Pick<PlanParaCargar, "capacidad" | "funciones"> & { todoIncluido?: TodoIncluidoDelPlan | null },
    tope: number,
): string {
    const incluido = p.todoIncluido && p.todoIncluido.texto.trim()
        ? `${p.todoIncluido.titulo.trim().replace(/:$/, "")}:\n${p.todoIncluido.texto.trim()}`
        : "";
    const reserva = incluido ? Math.min(incluido.length + 2, Math.floor(tope / 2)) : 0;
    const cuerpo = elCuerpoDelAlcance(p, tope - reserva);
    if (!incluido) return cuerpo;
    const hueco = tope - cuerpo.length - (cuerpo ? 2 : 0);
    if (hueco <= 1) return cuerpo;
    const cola = incluido.length <= hueco ? incluido : `${incluido.slice(0, hueco - 1).replace(/\s+\S*$/, "")}…`;
    return (cuerpo ? `${cuerpo}\n\n${cola}` : cola).slice(0, tope);
}

/** Los recuadros y la lista de lo que incluye, topados a `tope`. */
function elCuerpoDelAlcance(p: Pick<PlanParaCargar, "capacidad" | "funciones">, tope: number): string {
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

/**
 * Lo que la página pública de una propuesta enseña de cada plan, resuelto EN
 * VIVO al abrirla, con las MISMAS funciones que la página pública del plan: el
 * video con su título, los recuadros de capacidad, «Qué incluye este plan»,
 * «Todo incluido, sin sorpresas» y el precio con su botón. Lo demás de esa página («para quién es», el caso típico,
 * las preguntas y el plan superior) no entra en una propuesta.
 */
export type PlanDeLaPropuesta = {
    llave: string;
    nombre: string;
    /** El video principal del plan en el panel; `null` = no tiene. */
    video: (VideoDelPlan & { titulo: string; miniatura: string | null }) | null;
    /** La dirección de su página pública; `null` = el plan está apagado y no la tiene. */
    enlace: string | null;
    /** El nivel (`basico`…), que decide el color del marco del video. */
    plan?: string;
    tipo?: "IA" | "HUMANO";
    activo?: boolean;
    /** Los recuadros de capacidad de su página pública, en su orden. */
    capacidad?: TarjetaDeCapacidad[];
    /** «Qué incluye este plan»: las mismas tarjetas y en el mismo orden que su página. */
    funciones?: FuncionQueSeEnsena[];
    /** «Todo incluido, sin sorpresas», como en su página; `null` = no tiene. */
    todoIncluido?: TodoIncluidoDelPlan | null;
    precio?: { texto: string; aConsultar: boolean };
    /** El botón de comenzar de su página; `null` = el plan está apagado. */
    boton?: BotonDelPlan | null;
};

/** ¿Tiene algo que pintar? Un plan sin nada no deja un recuadro vacío. */
function tieneQuePintar(p: Pick<PlanDeLaPropuesta, "video" | "enlace" | "capacidad" | "funciones" | "todoIncluido">): boolean {
    return Boolean(p.video || p.enlace || (p.capacidad?.length ?? 0) > 0 || (p.funciones?.length ?? 0) > 0 || p.todoIncluido);
}

/** Lo que de verdad se pinta: un plan sin nada que enseñar no deja un recuadro vacío. */
export function losPlanesQueSeEnsenan<T extends Pick<PlanDeLaPropuesta, "video" | "enlace" | "capacidad" | "funciones" | "todoIncluido">>(
    planes: readonly T[],
): T[] {
    return planes.filter(tieneQuePintar);
}

/**
 * El nombre con el que se empareja un servicio de la propuesta con un plan:
 * sin mayúsculas, sin tildes, sin espacios de más y sin un «Plan » delante.
 * La fila de servicio que carga un plan lleva su nombre (`laFilaDelPlan`), así
 * que al abrir la propuesta se sabe a qué servicio pertenece cada plan.
 */
export function elNombreParaEmparejar(nombre: string): string {
    return String(nombre ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^plan\s+/, "")
        .trim();
}

/**
 * A qué servicio pertenece cada plan. Cada servicio se queda con el PRIMER plan
 * de su mismo nombre que no se haya llevado otro; un plan se usa una sola vez.
 * Lo que no casa con ningún servicio sale aparte (`sueltos`), en el orden de la
 * propuesta: un plan renombrado en el panel después de hacer la propuesta deja
 * de llamarse como su fila, y se enseña igual, debajo de los servicios.
 */
export function losPlanesDeCadaServicio<P extends { nombre: string }>(
    servicios: readonly { nombre: string }[],
    planes: readonly P[],
): { porServicio: (P | null)[]; sueltos: P[] } {
    const usados = new Set<number>();
    const porServicio = servicios.map((s) => {
        const llave = elNombreParaEmparejar(s.nombre);
        if (!llave) return null;
        const i = planes.findIndex((p, j) => !usados.has(j) && elNombreParaEmparejar(p.nombre) === llave);
        if (i < 0) return null;
        usados.add(i);
        return planes[i]!;
    });
    return { porServicio, sueltos: planes.filter((_, j) => !usados.has(j)) };
}

/** Lo que dice el precio al final del plan, como en su página. */
export function elTextoDelPrecioDelPlan(precio: { texto: string; aConsultar: boolean }): string {
    return precio.aConsultar ? "Precio a consultar según tu operación." : `${precio.texto} USD al mes`;
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

/**
 * Las guías que NO salen dentro de una propuesta. Una propuesta la lee quien
 * está DECIDIENDO si compra, y la guía del Agente IA («Entrena al asistente que
 * atiende a tus clientes») es para quien ya compró: le enseña a configurar algo
 * que todavía no tiene. Una función cuyo tutorial es una de estas sale en
 * «Qué incluye» con su nombre y su descripción, sin «Ver tutorial», sin video y
 * sin guía. La página pública del plan no cambia: allí sí salen.
 */
export const GUIAS_FUERA_DE_LA_PROPUESTA: ReadonlySet<string> = new Set(["agente-ia"]);

/** Las guías publicadas que SÍ pueden salir dentro de una propuesta. */
export function lasGuiasDeLaPropuesta(publicadas: Iterable<string>): Set<string> {
    const fuera = new Set<string>();
    for (const modulo of publicadas) if (!GUIAS_FUERA_DE_LA_PROPUESTA.has(modulo)) fuera.add(modulo);
    return fuera;
}
