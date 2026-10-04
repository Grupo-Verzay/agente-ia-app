/**
 * La página pública de un plan (`/planes/<plan>`), decidida sin pintar nada.
 *
 * Puro a propósito: lo usan la página, el panel de Planes (para avisar de lo
 * que la página no va a enseñar) y el banco, que lo prueba sin base ni
 * navegador (`scripts/banco-pagina-de-plan.sh`).
 *
 * # Todo sale de lo que hay configurado en el panel
 *
 * La página tenía su propio texto: estadísticas, testimonios, galerías, títulos
 * del hero y un bloque de cierre, escritos una vez y nunca más tocados. Se
 * quedaban atrás en cuanto el plan cambiaba de nombre, de créditos o de
 * funciones. Ahora lo que se ve es:
 *
 *   1. el video del plan (un enlace o un archivo .mp4 subido desde el panel),
 *      directo: sin un encabezado que repita el nombre, el tipo de asistencia,
 *      la descripción y el precio — eso ya lo dijo la tarjeta de la landing;
 *   2. «para quién es»: a quién le sirve y un caso típico de negocio;
 *   3. el resumen de capacidad: los recuadros que el panel decida para ESE
 *      plan (cuántos, en qué orden y qué dato destaca cada uno), con los datos
 *      vivos (`{creditos}`, `{catalogo}`…). Uno sin dato no sale: nunca «No
 *      incluido»;
 *   4. las funciones ENCENDIDAS, una tarjeta por función y en el orden del
 *      editor (sin agrupar por categoría), con su tutorial;
 *   5. las preguntas frecuentes de ese plan;
 *   6. el botón de comenzar, UNA vez, con una línea discreta al plan
 *      inmediato superior, si existe.
 *
 * Ese es el orden de FÁBRICA: el panel puede arrastrar los bloques
 * (`BLOQUES_DE_LA_PAGINA`, `comoOrdenDeBloques`), y la página los pinta así.
 *
 * # Encendida y destacada son DOS preguntas
 *
 * `activa` dice si el plan la trae: apagada no sale en ninguna parte. `destacada`
 * dice si, ADEMÁS, sale en la tarjeta corta de la landing. Quitarla de la
 * tarjeta no la quita del plan, y la página de detalle las enseña todas.
 *
 * # Las funciones viven en DOS sitios, y uno manda
 *
 * `SubscriptionPlan.features` es una lista de textos que leen una docena de
 * pantallas (la landing, la de un reseller, elegir plan…). La categoría, la
 * descripción, el tutorial y el interruptor de cada función viven al lado, en
 * `plan_funciones` (tabla de la App). **Las funciones encendidas son
 * exactamente `features`, en su orden**: lo que no esté ahí no está encendido,
 * y una función nueva en `features` sin datos guardados se deduce
 * (`sugerirLaFuncion`). Así la lista vieja nunca se queda atrás de la nueva.
 *
 * # Lo que contradice al plan NO sale
 *
 * Una pregunta que dice «12.000 créditos» en un plan de 8.000, o que llama al
 * plan por un nombre viejo, es texto desactualizado. No sale en la página y el
 * panel la marca con el motivo (`losAvisosDelTexto`); para que no vuelva a
 * pasar, el texto puede usar `{creditos}`, `{plan}`, `{catalogo}`, `{precio}` y
 * `{asistencia}`, que se cambian por los datos vivos.
 */
import type { Plan } from "@prisma/client";
import { CATEGORIAS_DE_AYUDA } from "@/lib/centro-de-ayuda";
import { sinTildes } from "@/lib/pantalla-de-notas";
import { elTopeDeProductos } from "@/lib/limite-de-catalogo";
import { laPosicionDelNivel } from "@/lib/nivel-de-la-licencia";
import { conCreditosIncluidos } from "@/lib/creditos-incluidos";
import { elEnlaceDeLaPaginaDelPlan, elEnlaceDeRegistro } from "@/lib/enlaces-de-planes";

/* ─── Funciones ────────────────────────────────────────────────────────── */

export type FuncionDelPlan = {
    /** Estable entre ediciones: es la llave de la fila en el editor. */
    id: string;
    /** El texto de la función, el mismo que va en `features`. */
    nombre: string;
    /** Opcional: una línea que la explica en la página. */
    descripcion: string;
    /** Una de `CATEGORIAS_DEL_PLAN`. */
    categoria: string;
    /** Apagada: no sale en la página ni en ninguna lista del plan. */
    activa: boolean;
    /**
     * Sale en la tarjeta CORTA del plan en la landing. Solo cuenta si está
     * encendida; apagarla en la tarjeta no la quita del plan ni del detalle.
     */
    destacada: boolean;
    /** El módulo de una guía publicada (`leads`) o un enlace `https://`. */
    tutorial: string | null;
};

export type CategoriaDelPlan = { slug: string; nombre: string; seLista: boolean };

export const CATEGORIA_INCLUYE = "incluye";
export const CATEGORIA_GENERAL = "general";
export const CATEGORIA_CAPACIDAD = "capacidad";

/**
 * La categoría de una función ya NO agrupa ni ordena la página —cada función
 * es su propia tarjeta, en el orden del editor—: sirve para sugerir el
 * tutorial y para apartar las de `capacidad`, que no se listan (lo dicen los
 * recuadros del resumen). Se conserva el orden de antes para el desplegable:
 * lo que se hereda del plan anterior, las diez del menú y lo demás.
 */
export const CATEGORIAS_DEL_PLAN: readonly CategoriaDelPlan[] = [
    { slug: CATEGORIA_INCLUYE, nombre: "Incluye", seLista: true },
    ...CATEGORIAS_DE_AYUDA.map((c) => ({ slug: c.slug, nombre: c.nombre, seLista: true })),
    { slug: CATEGORIA_GENERAL, nombre: "Otras funciones", seLista: true },
    { slug: CATEGORIA_CAPACIDAD, nombre: "Resumen de capacidad", seLista: false },
];

const SLUGS_DE_CATEGORIA = new Set(CATEGORIAS_DEL_PLAN.map((c) => c.slug));

export const TOPE_DE_FUNCIONES = 60;
export const TOPE_DEL_NOMBRE = 120;
export const TOPE_DE_LA_DESCRIPCION = 400;
const TOPE_DEL_TUTORIAL = 500;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;
const MODULO_VALIDO = /^[a-z0-9-]{1,40}$/;

/** Para comparar dos nombres: sin tildes, sin mayúsculas y sin espacios de más. */
export function laLlaveDelNombre(texto: string): string {
    return sinTildes(texto).replace(/\s+/g, " ").trim();
}

function elHash(texto: string): string {
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/** El id de una función deducida: el mismo para el mismo nombre y la misma vez que aparece. */
export function idDeLaFuncion(nombre: string, vez = 0): string {
    return `f-${elHash(laLlaveDelNombre(nombre))}-${vez}`;
}

/** `https://…`, `/guia/<modulo>` o el nombre del módulo de una guía. Lo demás, nada. */
export function comoTutorial(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.trim().slice(0, TOPE_DEL_TUTORIAL);
    if (!limpio) return null;
    if (/^https?:\/\//i.test(limpio)) {
        try {
            const url = new URL(limpio);
            if (url.protocol !== "https:" && url.protocol !== "http:") return null;
            if (!url.hostname.includes(".")) return null;
            return url.toString();
        } catch {
            return null;
        }
    }
    const deGuia = /^\/?guia\/([a-z0-9-]{1,40})\/?$/.exec(limpio);
    if (deGuia) return deGuia[1];
    return MODULO_VALIDO.test(limpio) ? limpio : null;
}

/**
 * El tutorial que guarda el editor del panel: una guía PUBLICADA (`guias`, que
 * pone quien llama) o una dirección web completa. Lo que se está escribiendo a
 * medias en «Enlace propio» («ht», «www.algo») no se guarda: `comoTutorial`
 * lo tomaría por el nombre de un módulo que no existe.
 */
export function elTutorialQueSeGuarda(valor: string | null, guias: readonly string[]): string | null {
    const t = (valor ?? "").trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return comoTutorial(t);
    return guias.includes(t) ? t : null;
}

/** «Enlace propio» a medio escribir o mal escrito: no se guarda, y el editor lo dice. */
export function elEnlaceDelTutorialNoSirve(valor: string | null): boolean {
    const t = (valor ?? "").trim();
    if (!t) return false;
    return !(/^https?:\/\//i.test(t) && comoTutorial(t));
}

/**
 * Lo que llega del navegador o de la base, saneado: textos recortados, sin
 * funciones vacías, categoría conocida (o «Otras funciones»), ids únicos y un
 * tope de cuántas. Nunca lanza.
 */
export function comoFunciones(raw: unknown): FuncionDelPlan[] {
    if (!Array.isArray(raw)) return [];
    const fuera: FuncionDelPlan[] = [];
    const usados = new Set<string>();
    const veces = new Map<string, number>();
    for (const item of raw) {
        if (fuera.length >= TOPE_DE_FUNCIONES) break;
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const nombre = typeof o.nombre === "string" ? o.nombre.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_NOMBRE) : "";
        if (!nombre) continue;
        const descripcion =
            typeof o.descripcion === "string" ? o.descripcion.trim().slice(0, TOPE_DE_LA_DESCRIPCION) : "";
        const categoria =
            typeof o.categoria === "string" && SLUGS_DE_CATEGORIA.has(o.categoria) ? o.categoria : CATEGORIA_GENERAL;
        const llave = laLlaveDelNombre(nombre);
        const vez = veces.get(llave) ?? 0;
        veces.set(llave, vez + 1);
        let id = typeof o.id === "string" && ID_VALIDO.test(o.id) ? o.id : idDeLaFuncion(nombre, vez);
        if (usados.has(id)) id = `${idDeLaFuncion(nombre, vez)}-${fuera.length}`;
        usados.add(id);
        fuera.push({
            id,
            nombre,
            descripcion,
            categoria,
            activa: o.activa !== false,
            // Lo guardado antes de que existiera la marca sale en la tarjeta,
            // como salía: sin ella, todas las funciones se irían de la landing.
            destacada: o.destacada !== false,
            tutorial: comoTutorial(o.tutorial),
        });
    }
    return fuera;
}

/** Los textos de las funciones ENCENDIDAS, en su orden: lo que se guarda en `features`. */
export function losFeaturesDeLasFunciones(funciones: readonly FuncionDelPlan[]): string[] {
    return funciones.filter((f) => f.activa && f.nombre.trim()).map((f) => f.nombre.trim());
}

/**
 * Los textos que salen en la tarjeta CORTA de la landing: las encendidas Y
 * destacadas, en su orden. Una apagada no sale aunque esté marcada: lo que el
 * plan no trae no se anuncia en ninguna parte.
 */
export function lasFuncionesDestacadas(funciones: readonly FuncionDelPlan[]): string[] {
    return funciones.filter((f) => f.activa && f.destacada && f.nombre.trim()).map((f) => f.nombre.trim());
}

/* ─── Sugerir la categoría y el tutorial de una función ───────────────── */

type Regla = { si: RegExp; categoria: string; tutorial: string | null };

/**
 * En orden: gana la PRIMERA que encaja, así que lo más concreto va antes
 * («lectura de imágenes» es del agente, «imágenes con IA» es de AI Imágenes).
 * Cada tutorial es el módulo de una guía publicada; el banco comprueba que
 * existan todos. Se compara sin tildes ni mayúsculas.
 */
const REGLAS: readonly Regla[] = [
    { si: /^incluye todo/, categoria: CATEGORIA_INCLUYE, tutorial: null },
    { si: /\d[\d.,]*\s*(k\s*)?creditos|creditos\s+(de\s+)?ia/, categoria: CATEGORIA_CAPACIDAD, tutorial: null },
    { si: /catalogo[^,;]*\d|\d+\s*(items|productos)/, categoria: CATEGORIA_CAPACIDAD, tutorial: null },
    { si: /^asistencia|asistencia (con )?ia|humano hrs/, categoria: CATEGORIA_CAPACIDAD, tutorial: null },
    { si: /google sheets|hoja de calculo/, categoria: "integraciones", tutorial: "google-sheets" },
    { si: /multiagenda|varias agendas/, categoria: "integraciones", tutorial: "multiagenda" },
    { si: /datos externos|importacion|metadatos/, categoria: "integraciones", tutorial: "mis-datos" },
    { si: /llamada/, categoria: "bandeja", tutorial: "llamadas" },
    { si: /correo|email/, categoria: "bandeja", tutorial: "correo" },
    { si: /campana/, categoria: "creacion-de-flujos", tutorial: "campanas" },
    { si: /follow.?up|seguimiento|retargeting/, categoria: "creacion-de-flujos", tutorial: "follow-ups" },
    { si: /\bflujo|\bflow|inactividad/, categoria: "creacion-de-flujos", tutorial: "flujos" },
    { si: /macro/, categoria: "automatizaciones", tutorial: "macros" },
    { si: /recordatorio/, categoria: "automatizaciones", tutorial: "recordatorios" },
    // Lo que hace el agente en la conversación, antes que «citas»: «Toma de
    // solicitudes, citas, etc.» es del agente, no de la Agenda.
    { si: /solicitud/, categoria: "entrenamiento", tutorial: "agente-ia" },
    // Lo que queda registrado en el CRM es de Leads; antes que «dashboard».
    { si: /(captura|registro)[^,;]*(crm|dashboard)/, categoria: "contactos", tutorial: "leads" },
    { si: /respuestas rapidas/, categoria: "automatizaciones", tutorial: "respuestas-rapidas" },
    // «capacitación» lleva «cita» dentro: por eso la palabra entera.
    { si: /\bagenda|\bcitas?\b/, categoria: "contactos", tutorial: "agenda" },
    { si: /etiqueta|\btags?\b/, categoria: "contactos", tutorial: "etiquetas" },
    { si: /\bleads?\b|contactos/, categoria: "contactos", tutorial: "leads" },
    { si: /kanban|embudo|tablero/, categoria: "panel", tutorial: null },
    { si: /catalogo/, categoria: "panel", tutorial: "catalogo" },
    { si: /reporte|analitica|metrica|dashboard|estadistica/, categoria: "panel", tutorial: null },
    { si: /finanza|venta|gasto/, categoria: "panel", tutorial: "finanzas" },
    { si: /reunion|videollamada/, categoria: "panel", tutorial: "reuniones" },
    { si: /diagrama/, categoria: "panel", tutorial: "diagramas" },
    { si: /imagenes? (con )?ia|generador de imagenes/, categoria: "apps-externas", tutorial: "ai-imagenes" },
    { si: /formulario/, categoria: "apps-externas", tutorial: "formularios" },
    { si: /\bchats?\b|\bcrm\b|multimedia|archivos/, categoria: "bandeja", tutorial: "chats" },
    { si: /\bnotas?\b/, categoria: "herramientas", tutorial: "notas" },
    { si: /tarea/, categoria: "herramientas", tutorial: "tareas" },
    { si: /copiloto/, categoria: "herramientas", tutorial: "copiloto" },
    { si: /multiusuario|usuarios|asesor|autoasignacion|equipo/, categoria: "entrenamiento", tutorial: "usuarios" },
    { si: /producto/, categoria: "entrenamiento", tutorial: "productos" },
    {
        si: /audio|imagen|memoria|concatenacion|agente|solicitud|captura|herramientas|tools/,
        categoria: "entrenamiento",
        tutorial: "agente-ia",
    },
    {
        si: /marca|logo|color|personalizacion|conexion|notificacion|whatsapp/,
        categoria: "conexion-y-ajustes",
        tutorial: "conexion",
    },
];

/** Los módulos que sugiere `sugerirLaFuncion`. El banco exige que estén publicados. */
export const MODULOS_QUE_SE_SUGIEREN: readonly string[] = [
    ...new Set(REGLAS.map((r) => r.tutorial).filter((t): t is string => !!t)),
];

/** Dónde cae una función y qué tutorial le toca, por lo que dice. Sin nada que encaje, «Otras funciones». */
export function sugerirLaFuncion(nombre: string): { categoria: string; tutorial: string | null } {
    const texto = laLlaveDelNombre(nombre);
    for (const r of REGLAS) if (r.si.test(texto)) return { categoria: r.categoria, tutorial: r.tutorial };
    return { categoria: CATEGORIA_GENERAL, tutorial: null };
}

/**
 * Las funciones del plan: las encendidas son `features`, en su orden; detrás,
 * las apagadas que se guardaron.
 *
 * Si lo guardado coincide con `features`, se usa tal cual. Si no —alguien tocó
 * `features` por otro camino, o el plan nunca pasó por el editor nuevo—, cada
 * texto de `features` se empareja con una guardada del mismo nombre (y se queda
 * su categoría, descripción y tutorial) o se deduce; una guardada encendida que
 * ya no está en `features` se da por quitada.
 */
export function lasFuncionesDelPlan(features: readonly string[], guardadas: unknown): FuncionDelPlan[] {
    const lista = comoFunciones(guardadas);
    const activas = features.map((f) => (typeof f === "string" ? f.replace(/\s+/g, " ").trim() : "")).filter(Boolean);
    const llavesActivas = activas.map(laLlaveDelNombre);
    const encendidas = lista.filter((f) => f.activa).map((f) => laLlaveDelNombre(f.nombre));
    if (
        lista.length > 0 &&
        encendidas.length === llavesActivas.length &&
        encendidas.every((l, i) => l === llavesActivas[i])
    ) {
        return lista;
    }

    const usadas = new Set<string>();
    const veces = new Map<string, number>();
    const fuera: FuncionDelPlan[] = [];
    activas.slice(0, TOPE_DE_FUNCIONES).forEach((texto, i) => {
        const llave = llavesActivas[i];
        const vez = veces.get(llave) ?? 0;
        veces.set(llave, vez + 1);
        const previa = lista.find((f) => !usadas.has(f.id) && laLlaveDelNombre(f.nombre) === llave);
        if (previa) {
            usadas.add(previa.id);
            fuera.push({ ...previa, nombre: texto.slice(0, TOPE_DEL_NOMBRE), activa: true });
            return;
        }
        let id = idDeLaFuncion(texto, vez);
        while (fuera.some((f) => f.id === id) || lista.some((f) => f.id === id && !usadas.has(f.id))) id = `${id}x`;
        fuera.push({
            id,
            nombre: texto.slice(0, TOPE_DEL_NOMBRE),
            descripcion: "",
            ...sugerirLaFuncion(texto),
            activa: true,
            destacada: true,
        });
    });
    for (const f of lista) {
        if (fuera.length >= TOPE_DE_FUNCIONES) break;
        if (!f.activa && !usadas.has(f.id) && !fuera.some((g) => g.id === f.id)) fuera.push(f);
    }
    return fuera;
}

/* ─── Datos vivos del plan ─────────────────────────────────────────────── */

/** Los nombres con los que nació cada nivel. Un texto que los use hoy puede estar viejo. */
export const NOMBRES_DE_FABRICA: Record<Plan, string> = {
    lite: "Lite",
    basico: "Básico",
    intermedio: "Intermedio",
    avanzado: "Avanzado",
    enterprise: "Enterprise",
    personalizado: "Personalizado",
};

export const ETIQUETAS_DE_NIVEL: Record<Plan, string> = {
    lite: "Nivel 1",
    basico: "Nivel 2",
    intermedio: "Nivel 3",
    avanzado: "Nivel 4",
    enterprise: "Nivel 5",
    personalizado: "Nivel 6",
};

/** El nombre del plan: el que le pusieron en el panel o, si no tiene, su nivel. Como la landing. */
export function elNombreDelPlan(plan: { plan: string; name?: string | null }): string {
    return plan.name?.trim() || (ETIQUETAS_DE_NIVEL as Record<string, string>)[plan.plan] || plan.plan;
}

export type DatosDelPlan = {
    plan: string;
    nombre: string;
    creditos: number;
    /** El tope del catálogo (`null`: a la medida). */
    catalogo: number | null;
    precioUSD: number;
    asistencia: "IA" | "HUMANO";
    /** Los nombres que tienen HOY los planes de la plataforma (activos o no). */
    nombresEnUso: readonly string[];
};

export function losDatosDelPlan(
    plan: { plan: string; name?: string | null; credits?: number | null; priceUSD?: unknown; assistanceType?: string | null },
    nombresEnUso: readonly string[],
): DatosDelPlan {
    const precio = Number(plan.priceUSD ?? 0);
    return {
        plan: plan.plan,
        nombre: elNombreDelPlan(plan),
        creditos: Number.isFinite(plan.credits) ? Number(plan.credits) : 0,
        catalogo: elTopeDeProductos(plan.plan),
        precioUSD: Number.isFinite(precio) ? precio : 0,
        asistencia: plan.assistanceType === "HUMANO" ? "HUMANO" : "IA",
        nombresEnUso: nombresEnUso.filter((n) => typeof n === "string" && n.trim()),
    };
}

/** 15000 → «15.000». Igual en el servidor y en el navegador: no depende del idioma de nadie. */
export function elNumero(n: number): string {
    if (!Number.isFinite(n)) return "0";
    const entero = Math.trunc(Math.abs(n));
    const decimales = Math.round((Math.abs(n) - entero) * 100);
    const agrupado = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const signo = n < 0 ? "-" : "";
    return decimales > 0 ? `${signo}${agrupado},${String(decimales).padStart(2, "0")}` : `${signo}${agrupado}`;
}

export function elPrecio(n: number): string {
    return `$${elNumero(n)} USD`;
}

export function elTextoDelCatalogo(tope: number | null): string {
    if (tope === null) return "un catálogo a la medida";
    if (tope <= 0) return "sin catálogo";
    return `${elNumero(tope)} productos`;
}

export function elTextoDeLaAsistencia(asistencia: "IA" | "HUMANO"): string {
    return asistencia === "HUMANO" ? "asistencia IA y humana" : "asistencia IA";
}

/** Lo que se puede escribir entre llaves en una pregunta o un botón, y por qué se cambia. */
export const DATOS_QUE_SE_PUEDEN_USAR: readonly { clave: string; ejemplo: string }[] = [
    { clave: "{plan}", ejemplo: "el nombre del plan" },
    { clave: "{creditos}", ejemplo: "los créditos de IA" },
    { clave: "{catalogo}", ejemplo: "cuántos productos caben" },
    { clave: "{precio}", ejemplo: "el precio al mes" },
    { clave: "{asistencia}", ejemplo: "el tipo de asistencia" },
];

/** Cambia `{plan}`, `{creditos}`… por los datos vivos. Sin tildes ni mayúsculas en la llave. */
export function conLosDatosDelPlan(texto: string, datos: DatosDelPlan): string {
    return texto.replace(/\{\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*\}/g, (todo, clave: string) => {
        switch (sinTildes(clave)) {
            case "plan":
                return datos.nombre;
            case "creditos":
                return elNumero(datos.creditos);
            case "catalogo":
                return elTextoDelCatalogo(datos.catalogo);
            case "precio":
                return elPrecio(datos.precioUSD);
            case "asistencia":
                return elTextoDeLaAsistencia(datos.asistencia);
            default:
                return todo;
        }
    });
}

/* ─── Lo que contradice al plan ────────────────────────────────────────── */

function elValorDelNumero(texto: string): number {
    return Number(texto.replace(/[.,](?=\d{3}(\D|$))/g, ""));
}

function aparece(texto: string, palabra: string): boolean {
    const p = laLlaveDelNombre(palabra).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!p) return false;
    return new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, "u").test(laLlaveDelNombre(texto));
}

/**
 * Los nombres que, dichos en un texto de este plan, delatan que el texto es
 * viejo: el nombre de fábrica y el nivel de ESTE plan cuando ya se llama de
 * otra forma, y los nombres de fábrica que hoy no usa ningún plan.
 */
function losNombresViejos(datos: DatosDelPlan): { nombre: string; propio: boolean }[] {
    const propio = datos.nombre;
    const enUso = datos.nombresEnUso;
    const propios = [
        (NOMBRES_DE_FABRICA as Record<string, string>)[datos.plan],
        (ETIQUETAS_DE_NIVEL as Record<string, string>)[datos.plan],
    ].filter(Boolean);
    const sinUso = [...Object.values(NOMBRES_DE_FABRICA), ...Object.values(ETIQUETAS_DE_NIVEL)].filter(
        (n) => !enUso.some((u) => laLlaveDelNombre(u) === laLlaveDelNombre(n)),
    );
    const vistos = new Set<string>();
    const fuera: { nombre: string; propio: boolean }[] = [];
    for (const [nombre, esPropio] of [
        ...propios.map((n) => [n, true] as const),
        ...sinUso.map((n) => [n, false] as const),
    ]) {
        const llave = laLlaveDelNombre(nombre);
        if (vistos.has(llave) || aparece(propio, nombre)) continue;
        vistos.add(llave);
        fuera.push({ nombre, propio: esPropio });
    }
    return fuera;
}

/**
 * Por qué un texto de este plan está desactualizado, con sus palabras. Vacío:
 * el texto no contradice nada que se sepa. Se mira:
 *
 *   - un número de créditos que no es el del plan («12.000 créditos» en uno de
 *     8.000); un rango («3.000-5.000 créditos») no cuenta: es un consumo;
 *   - un número de productos que no es el tope del catálogo;
 *   - el plan llamado por un nombre que ya no es el suyo («Plan Intermedio»
 *     en el que hoy se llama Starter).
 */
export function losAvisosDelTexto(textoCrudo: string, datos: DatosDelPlan): string[] {
    const texto = laLlaveDelNombre(conLosDatosDelPlan(textoCrudo, datos));
    const avisos: string[] = [];

    const creditos = /(?<![\d.,\-–])(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(k\s*)?creditos/g;
    for (const m of texto.matchAll(creditos)) {
        let valor = elValorDelNumero(m[1]);
        if (m[2]) valor *= 1000;
        if (valor < 100 || valor === datos.creditos) continue;
        avisos.push(`Dice ${elNumero(valor)} créditos y el plan tiene ${elNumero(datos.creditos)}.`);
    }

    if (datos.catalogo !== null) {
        const productos = /(?<![\d.,\-–])(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(items|productos)/g;
        for (const m of texto.matchAll(productos)) {
            const valor = elValorDelNumero(m[1]);
            if (valor === datos.catalogo) continue;
            avisos.push(
                `Dice ${elNumero(valor)} ${m[2] === "items" ? "ítems" : "productos"} y el catálogo de este plan es de ${elNumero(datos.catalogo)}.`,
            );
        }
    }

    for (const viejo of losNombresViejos(datos)) {
        const v = laLlaveDelNombre(viejo.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?<![\\p{L}\\p{N}])(plan|del?)\\s+${v}(?![\\p{L}\\p{N}])`, "u").test(texto)) {
            avisos.push(
                viejo.propio
                    ? `Llama al plan «${viejo.nombre}» y hoy se llama «${datos.nombre}».`
                    : `Nombra el plan «${viejo.nombre}», un nombre que hoy no tiene ningún plan.`,
            );
        }
    }
    return [...new Set(avisos)];
}

/**
 * El texto de un botón. Un botón es corto y nombra un plan sin «plan» delante
 * («Solicitar demo Enterprise»), así que aquí basta con que aparezca CUALQUIER
 * nombre que no sea el de este plan. Si está viejo, sale el de siempre.
 */
export function elTextoDelBoton(texto: string | null | undefined, porDefecto: string, datos: DatosDelPlan): string {
    const limpio = conLosDatosDelPlan((texto ?? "").trim(), datos);
    if (!limpio) return porDefecto;
    // Un botón que dice otros créditos o nombra otro plan está tan viejo como
    // cualquier texto: el panel lo avisa con las mismas dos reglas.
    if (losAvisosDelBoton(limpio, datos).length > 0 || losAvisosDelTexto(limpio, datos).length > 0) return porDefecto;
    return limpio;
}

export function losAvisosDelBoton(textoCrudo: string, datos: DatosDelPlan): string[] {
    const texto = conLosDatosDelPlan(textoCrudo, datos);
    const conocidos = [
        ...Object.values(NOMBRES_DE_FABRICA),
        ...Object.values(ETIQUETAS_DE_NIVEL),
        ...datos.nombresEnUso,
    ].filter((n) => n.trim() && !aparece(datos.nombre, n));
    const nombra = [...new Set(conocidos)].find((n) => aparece(texto, n));
    return nombra ? [`Nombra el plan «${nombra}» y este plan se llama «${datos.nombre}».`] : [];
}

/* ─── Preguntas frecuentes ─────────────────────────────────────────────── */

export type PreguntaDelPlan = { question: string; answer: string };

export function comoPreguntas(raw: unknown): PreguntaDelPlan[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((f) => {
            const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
            return {
                question: typeof o.question === "string" ? o.question.trim() : "",
                answer: typeof o.answer === "string" ? o.answer.trim() : "",
            };
        })
        .filter((f) => f.question && f.answer);
}

/** Cada pregunta con lo que la deja fuera de la página. Para el panel. */
export function revisarLasPreguntas(raw: unknown, datos: DatosDelPlan): { pregunta: PreguntaDelPlan; avisos: string[] }[] {
    return comoPreguntas(raw).map((p) => ({
        pregunta: p,
        avisos: losAvisosDelTexto(`${p.question}\n${p.answer}`, datos),
    }));
}

/** Las que salen en la página: completas, con los datos vivos y sin contradecir al plan. */
export function lasPreguntasQueSalen(raw: unknown, datos: DatosDelPlan): PreguntaDelPlan[] {
    return revisarLasPreguntas(raw, datos)
        .filter((r) => r.avisos.length === 0)
        .map((r) => ({
            question: conLosDatosDelPlan(r.pregunta.question, datos),
            answer: conLosDatosDelPlan(r.pregunta.answer, datos),
        }));
}

/* ─── Resumen de capacidad ─────────────────────────────────────────────── */

/**
 * Los recuadros del resumen los decide el panel, POR PLAN y aparte de las
 * funciones: cuántos salen (de ninguno a `TOPE_DE_RECUADROS`), en qué orden,
 * con qué icono y qué dato destaca cada uno. Eran tres fijos —créditos,
 * catálogo y asistencia— y el de asistencia tomaba su texto de una función, así
 * que tocar las funciones movía el resumen sin querer.
 *
 * Se guarda la LISTA tal cual se escribió, o `null`: «sin tocar», que es la de
 * fábrica armada con los datos del plan (`losRecuadrosDeFabrica`). Una lista
 * vacía es una decisión —el bloque no sale— y no es lo mismo que `null`.
 *
 * # Un recuadro sin dato no sale, nunca «No incluido»
 *
 * `porQueNoSaleElRecuadro` es la regla, y la usan la página y el panel (que
 * dice el motivo al lado de cada recuadro). Un recuadro sin valor, con un valor
 * que es cero o «sin catálogo», con «no incluido» en cualquier campo, o que
 * contradice al plan (otros créditos, otro tope de catálogo, un nombre viejo)
 * no se pinta. Lo que el plan no trae no se anuncia: se calla.
 */

export const ICONOS_DE_RECUADRO = [
    { clave: "creditos", nombre: "Créditos" },
    { clave: "catalogo", nombre: "Catálogo" },
    { clave: "asistencia", nombre: "Asistencia" },
    { clave: "usuarios", nombre: "Usuarios" },
    { clave: "lineas", nombre: "Líneas de WhatsApp" },
    { clave: "mensajes", nombre: "Mensajes" },
    { clave: "llamadas", nombre: "Llamadas" },
    { clave: "agenda", nombre: "Agenda" },
    { clave: "soporte", nombre: "Soporte" },
    { clave: "estrella", nombre: "Destacado" },
] as const;

export type IconoDeRecuadro = (typeof ICONOS_DE_RECUADRO)[number]["clave"];

const CLAVES_DE_ICONO = new Set<string>(ICONOS_DE_RECUADRO.map((i) => i.clave));

/** Un recuadro tal cual lo escribe el panel: con `{creditos}`, `{catalogo}`… sin cambiar. */
export type RecuadroDeCapacidad = {
    id: string;
    icono: IconoDeRecuadro;
    titulo: string;
    valor: string;
    detalle: string;
};

/** Lo que pinta la página: el mismo recuadro, con los datos vivos ya puestos. */
export type TarjetaDeCapacidad = RecuadroDeCapacidad;

export const TOPE_DE_RECUADROS = 6;

export const TOPES_DEL_RECUADRO = { titulo: 40, valor: 40, detalle: 160 } as const;

const ID_DE_RECUADRO = /^[a-z0-9-]{1,40}$/;

function elTextoDelRecuadro(v: unknown, tope: number): string {
    return typeof v === "string" ? v.replace(/[ \t\r\n]+/g, " ").trim().slice(0, tope) : "";
}

/** Si el plan trae catálogo. Sin catálogo no hay recuadro de catálogo de fábrica. */
export function elPlanTraeCatalogo(datos: DatosDelPlan): boolean {
    return datos.catalogo === null || datos.catalogo > 0;
}

/**
 * Los de fábrica, con los datos vivos ESCRITOS como datos vivos (`{creditos}`,
 * `Hasta {catalogo}`): así, quien los toma de base en el panel y los guarda
 * sigue diciendo la verdad cuando el plan cambia de créditos. Los créditos
 * entran siempre (un plan sin créditos los calla por la regla de siempre); el
 * catálogo, solo si el plan lo trae.
 */
export function losRecuadrosDeFabrica(datos: DatosDelPlan): RecuadroDeCapacidad[] {
    const fuera: RecuadroDeCapacidad[] = [
        {
            id: "creditos",
            icono: "creditos",
            titulo: "Créditos de IA",
            valor: "{creditos}",
            detalle: "Incluidos cada mes con tu plan",
        },
    ];
    if (elPlanTraeCatalogo(datos)) {
        fuera.push({
            id: "catalogo",
            icono: "catalogo",
            titulo: "Catálogo",
            valor: datos.catalogo === null ? "A la medida" : "Hasta {catalogo}",
            detalle: datos.catalogo === null ? "Productos sin un tope fijo" : "Para mostrar y vender por WhatsApp",
        });
    }
    fuera.push({
        id: "asistencia",
        icono: "asistencia",
        titulo: "Asistencia",
        valor: datos.asistencia === "HUMANO" ? "IA + humana" : "IA 24/7",
        detalle:
            datos.asistencia === "HUMANO"
                ? "La IA responde siempre y un asesor en horario laboral"
                : "Tu agente responde a toda hora",
    });
    return fuera;
}

/** Un id para un recuadro nuevo que no choque con los de la lista. */
export function unIdNuevo(lista: readonly { id: string }[]): string {
    const usados = new Set(lista.map((r) => r.id));
    let n = lista.length + 1;
    while (usados.has(`r${n}`)) n++;
    return `r${n}`;
}

/** Un recuadro en blanco para el panel. En blanco no sale: le falta el dato. */
export function unRecuadroNuevo(lista: readonly { id: string }[]): RecuadroDeCapacidad {
    return { id: unIdNuevo(lista), icono: "estrella", titulo: "", valor: "", detalle: "" };
}

/**
 * Una LISTA de recuadros saneada, sin mirar el plan: lo que se guarda tal cual
 * llega del panel. Un recuadro en blanco no dice nada y no saldría nunca, así
 * que no se guarda; los ids se rehacen si faltan o se repiten; el icono que no
 * se conoce es «Destacado». Lo que no es una lista es `null` (sin tocar).
 */
export function laListaQueSeGuarda(raw: unknown): RecuadroDeCapacidad[] | null {
    if (!Array.isArray(raw)) return null;
    const fuera: RecuadroDeCapacidad[] = [];
    for (const v of raw) {
        if (fuera.length >= TOPE_DE_RECUADROS) break;
        const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
        const recuadro = {
            id: typeof o.id === "string" && ID_DE_RECUADRO.test(o.id) ? o.id : "",
            icono: (typeof o.icono === "string" && CLAVES_DE_ICONO.has(o.icono) ? o.icono : "estrella") as IconoDeRecuadro,
            titulo: elTextoDelRecuadro(o.titulo, TOPES_DEL_RECUADRO.titulo),
            valor: elTextoDelRecuadro(o.valor, TOPES_DEL_RECUADRO.valor),
            detalle: elTextoDelRecuadro(o.detalle, TOPES_DEL_RECUADRO.detalle),
        };
        if (!recuadro.titulo && !recuadro.valor && !recuadro.detalle) continue;
        if (!recuadro.id || fuera.some((r) => r.id === recuadro.id)) recuadro.id = unIdNuevo(fuera);
        fuera.push(recuadro);
    }
    return fuera;
}

/**
 * Lo que llega del panel o de la base, saneado. `null`: sin tocar (la de
 * fábrica). Nunca lanza. Entiende también la forma de antes —un objeto con
 * `catalogo` y `asistencia` editables sobre los tres fijos—, que se convierte
 * en la lista que decía: lo apagado fuera y lo escrito encima de lo de fábrica.
 */
export function comoListaDeRecuadros(raw: unknown, datos: DatosDelPlan): RecuadroDeCapacidad[] | null {
    if (raw === null || raw === undefined) return null;
    if (Array.isArray(raw)) return laListaQueSeGuarda(raw);
    if (typeof raw === "object") {
        const viejo = raw as Record<string, unknown>;
        return losRecuadrosDeFabrica(datos).flatMap((r) => {
            const escrito = viejo[r.id];
            if (r.id === "creditos" || !escrito || typeof escrito !== "object" || Array.isArray(escrito)) return [r];
            const e = escrito as Record<string, unknown>;
            if (e.visible === false) return [];
            const campo = (k: "titulo" | "valor" | "detalle") => elTextoDelRecuadro(e[k], TOPES_DEL_RECUADRO[k]) || r[k];
            return [{ ...r, titulo: campo("titulo"), valor: campo("valor"), detalle: campo("detalle") }];
        });
    }
    return null;
}

/** La lista que vale para este plan: la guardada o, sin tocar, la de fábrica. */
export function laListaDeRecuadros(raw: unknown, datos: DatosDelPlan): RecuadroDeCapacidad[] {
    return comoListaDeRecuadros(raw, datos) ?? losRecuadrosDeFabrica(datos);
}

/** Si la lista dice exactamente lo de fábrica (el id no cuenta). Entonces no hace falta guardarla. */
export function esLaListaDeFabrica(lista: readonly RecuadroDeCapacidad[], datos: DatosDelPlan): boolean {
    const fabrica = losRecuadrosDeFabrica(datos);
    return (
        lista.length === fabrica.length &&
        lista.every(
            (r, i) =>
                r.icono === fabrica[i].icono &&
                r.titulo === fabrica[i].titulo &&
                r.valor === fabrica[i].valor &&
                r.detalle === fabrica[i].detalle,
        )
    );
}

/** Un valor que dice que el plan NO trae algo: cero, «sin catálogo», «ninguno». */
function esUnValorQueNoTrae(valor: string): boolean {
    const llave = laLlaveDelNombre(valor).replace(/[.,\s]/g, "");
    return /^(0+|ninguno|ninguna|nada|no|na|n\/a|-|—|–|sincatalogo|noaplica)$/.test(llave);
}

/**
 * Por qué un recuadro no sale en la página, con sus palabras. Vacío: sale. Lo
 * usan la página (para callarlo) y el panel (para decir el motivo al lado).
 */
export function porQueNoSaleElRecuadro(recuadro: RecuadroDeCapacidad, datos: DatosDelPlan): string[] {
    if (!recuadro.valor.trim()) return ["No tiene dato: escribe qué destaca este recuadro."];
    const valor = conLosDatosDelPlan(recuadro.valor, datos);
    const motivos: string[] = [];
    if (esUnValorQueNoTrae(valor)) {
        motivos.push(`Dice «${valor}»: lo que el plan no trae no se anuncia.`);
    }
    const textos = [recuadro.titulo, recuadro.valor, recuadro.detalle].filter(Boolean);
    for (const t of textos) {
        const llave = laLlaveDelNombre(conLosDatosDelPlan(t, datos));
        if (/\bno\s+incluid[oa]s?\b|\bno\s+incluye\b/.test(llave)) {
            motivos.push("Dice «no incluido»: lo que el plan no trae no se anuncia.");
        }
        if (/\bsin\s+catalogo\b/.test(llave)) {
            motivos.push("Dice «sin catálogo»: lo que el plan no trae no se anuncia.");
        }
        // Solo la regla de los textos: la de los botones avisa de cualquier
        // palabra que sea el nombre de un plan, y en un texto libre «lo básico»
        // no nombra al plan Básico.
        motivos.push(...losAvisosDelTexto(t, datos));
    }
    if (recuadro.icono === "catalogo" && datos.catalogo !== null) {
        for (const m of valor.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+)(?![\d])/g)) {
            const n = elValorDelNumero(m[1]);
            if (n === datos.catalogo || n === 0) continue;
            motivos.push(`Dice ${elNumero(n)} y el catálogo de este plan es de ${elNumero(datos.catalogo)}.`);
        }
    }
    return [...new Set(motivos)];
}

/** Cada recuadro con lo que lo deja fuera y cómo sale. Para el panel. */
export function revisarLosRecuadros(
    lista: readonly RecuadroDeCapacidad[],
    datos: DatosDelPlan,
): { recuadro: RecuadroDeCapacidad; motivos: string[]; comoSale: TarjetaDeCapacidad | null }[] {
    return lista.map((recuadro) => {
        const motivos = porQueNoSaleElRecuadro(recuadro, datos);
        return {
            recuadro,
            motivos,
            comoSale:
                motivos.length > 0
                    ? null
                    : {
                          ...recuadro,
                          // Los créditos son «incluidos», nunca «gratis».
                          titulo: conCreditosIncluidos(conLosDatosDelPlan(recuadro.titulo, datos)),
                          valor: conCreditosIncluidos(conLosDatosDelPlan(recuadro.valor, datos)),
                          detalle: conCreditosIncluidos(conLosDatosDelPlan(recuadro.detalle, datos)),
                      },
        };
    });
}

/** Las tarjetas del resumen, en el orden del panel y solo las que tienen dato. */
export function laCapacidadDelPlan(datos: DatosDelPlan, raw?: unknown): TarjetaDeCapacidad[] {
    return revisarLosRecuadros(laListaDeRecuadros(raw, datos), datos)
        .map((r) => r.comoSale)
        .filter((t): t is TarjetaDeCapacidad => t !== null);
}

/* ─── Qué incluye: una tarjeta por función ─────────────────────────────── */

/**
 * El texto del enlace al tutorial de una función: **siempre este, nunca el
 * nombre de la guía**. Varias funciones sin relación entre sí cuelgan de la
 * misma guía (todo lo del agente, de «Agente IA»), y con su nombre la lista
 * repetía «Guía de Agente IA» al lado de cosas que no tienen que ver.
 */
export const TEXTO_DEL_TUTORIAL = "Ver tutorial";

export type TutorialDeLaFuncion = {
    /** Dónde se abre entero: la guía o el enlace propio. Siempre en otra pestaña. */
    url: string;
    titulo: typeof TEXTO_DEL_TUTORIAL;
    externo: boolean;
    /** Lo que se reproduce DENTRO de la página al abrir la función. `null`: solo el enlace. */
    video: VideoDelPlan | null;
    /** La imagen del video antes de darle a reproducir (la portada de la guía). */
    portada: string | null;
};

export type FuncionQueSeEnsena = {
    id: string;
    nombre: string;
    descripcion: string;
    tutorial: TutorialDeLaFuncion | null;
};

/**
 * El video y la portada de una guía publicada. Es la convención de
 * `laGuiaDe` (`lib/guia-de-modulo.ts`): `public/guia/<modulo>/` guarda las dos,
 * y el banco comprueba que existan para cada guía publicada.
 */
export function elVideoDeLaGuia(modulo: string): { video: VideoDelPlan; portada: string } {
    return {
        video: { tipo: "archivo", url: `/guia/${modulo}/demostracion.webm` },
        portada: `/guia/${modulo}/portada.webp`,
    };
}

/**
 * Los reproductores que se dejan meter en una página ajena. Un enlace propio
 * que NO es de uno de estos (o un archivo de video) no se inserta: casi todas
 * las páginas web se niegan a ir dentro de otra y quedaría un recuadro en
 * blanco. Esos se abren en otra pestaña.
 */
const REPRODUCTORES_QUE_SE_INSERTAN =
    /^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/|www\.loom\.com\/embed\/|drive\.google\.com\/file\/d\/)/;

/** El video de un tutorial que es un enlace propio, si se puede ver dentro de la página. */
export function elVideoDelTutorial(url: string): VideoDelPlan | null {
    const v = elVideoDelPlan(url);
    if (!v) return null;
    return v.tipo === "archivo" || REPRODUCTORES_QUE_SE_INSERTAN.test(v.url) ? v : null;
}

/**
 * El tutorial de una función: una guía PUBLICADA (si el módulo ya no existe,
 * nada) o una dirección web. `guias` lo pone quien llama, en el servidor: la
 * lista de guías es pesada y no viaja al navegador; aquí solo se pregunta si
 * el módulo está.
 */
export function elTutorialDeLaFuncion(
    tutorial: string | null,
    guias: { has(modulo: string): boolean },
): TutorialDeLaFuncion | null {
    const t = comoTutorial(tutorial);
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) {
        return { url: t, titulo: TEXTO_DEL_TUTORIAL, externo: true, video: elVideoDelTutorial(t), portada: null };
    }
    if (!guias.has(t)) return null;
    return { url: `/guia/${t}`, titulo: TEXTO_DEL_TUTORIAL, externo: false, ...elVideoDeLaGuia(t) };
}

/**
 * Las funciones encendidas que se listan, cada una su propia tarjeta y **en el
 * orden del editor del panel** (el que se arrastra): la categoría ya no agrupa
 * ni reordena nada. Las de capacidad no salen (las dicen los recuadros) y las
 * que contradicen al plan tampoco.
 */
export function lasFuncionesQueSeEnsenan(
    funciones: readonly FuncionDelPlan[],
    datos: DatosDelPlan,
    guias: { has(modulo: string): boolean },
): FuncionQueSeEnsena[] {
    const seListan = new Set(CATEGORIAS_DEL_PLAN.filter((c) => c.seLista).map((c) => c.slug));
    return funciones
        .filter(
            (f) =>
                f.activa &&
                seListan.has(f.categoria) &&
                losAvisosDelTexto(`${f.nombre}\n${f.descripcion}`, datos).length === 0,
        )
        .map((f) => ({
            id: f.id,
            // Los créditos son «incluidos», nunca «gratis» (`conCreditosIncluidos`).
            nombre: conCreditosIncluidos(conLosDatosDelPlan(f.nombre, datos)),
            descripcion: conCreditosIncluidos(conLosDatosDelPlan(f.descripcion, datos)),
            tutorial: elTutorialDeLaFuncion(f.tutorial, guias),
        }));
}

/* ─── El orden de los bloques de la página ─────────────────────────────── */

export type BloqueDeLaPagina = "video" | "paraquien" | "capacidad" | "funciones" | "preguntas" | "comenzar";

/** Todos los bloques, en el orden de fábrica. El panel los arrastra; la página los pinta así. */
export const BLOQUES_DE_LA_PAGINA: readonly { clave: BloqueDeLaPagina; nombre: string; ayuda: string }[] = [
    { clave: "video", nombre: "Video del plan", ayuda: "Sale si el plan tiene video." },
    { clave: "paraquien", nombre: "Para quién es este plan", ayuda: "A quién le sirve y un caso típico." },
    { clave: "capacidad", nombre: "Resumen de capacidad", ayuda: "Los recuadros que decidas, con su dato." },
    { clave: "funciones", nombre: "Qué incluye", ayuda: "Una tarjeta por función encendida." },
    { clave: "preguntas", nombre: "Preguntas frecuentes", ayuda: "Sale si el plan tiene preguntas." },
    { clave: "comenzar", nombre: "Comenzar", ayuda: "El precio, los botones y el plan siguiente." },
];

export const ORDEN_DE_FABRICA: readonly BloqueDeLaPagina[] = BLOQUES_DE_LA_PAGINA.map((b) => b.clave);

const CLAVES_DE_BLOQUE = new Set<string>(ORDEN_DE_FABRICA);

/**
 * El orden guardado, saneado: sin repetidos ni claves que no existen, y con
 * TODOS los bloques dentro. Un bloque que falta (uno nuevo, o una lista vieja)
 * entra detrás del que tiene delante en el orden de fábrica: así no salta al
 * principio ni se pierde. Lo que no es una lista es el orden de fábrica.
 */
export function comoOrdenDeBloques(raw: unknown): BloqueDeLaPagina[] {
    if (!Array.isArray(raw)) return [...ORDEN_DE_FABRICA];
    const orden: BloqueDeLaPagina[] = [];
    for (const v of raw) {
        if (typeof v === "string" && CLAVES_DE_BLOQUE.has(v) && !orden.includes(v as BloqueDeLaPagina)) {
            orden.push(v as BloqueDeLaPagina);
        }
    }
    ORDEN_DE_FABRICA.forEach((bloque, i) => {
        if (orden.includes(bloque)) return;
        const delante = ORDEN_DE_FABRICA.slice(0, i).reverse().find((b) => orden.includes(b));
        orden.splice(delante ? orden.indexOf(delante) + 1 : 0, 0, bloque);
    });
    return orden;
}

export function esElOrdenDeFabrica(orden: readonly string[]): boolean {
    return orden.length === ORDEN_DE_FABRICA.length && orden.every((b, i) => b === ORDEN_DE_FABRICA[i]);
}

/* ─── Qué plan se enseña ───────────────────────────────────────────────── */

/**
 * El plan que se enseña en `/planes/nivel-N` (con la modalidad de la cookie,
 * `lib/enlaces-de-planes.ts`): el del tipo pedido si está
 * ACTIVO, y si no, el del otro tipo si lo está. Un plan apagado no se enseña:
 * la landing no lo ofrece y la página no puede venderlo.
 */
export function elPlanQueSeEnsena<T extends { plan: string; assistanceType: string | null; isActive: boolean }>(
    planes: readonly T[],
    plan: string,
    tipo: "IA" | "HUMANO",
): T | null {
    const delNivel = planes.filter((p) => p.plan === plan && p.isActive);
    return (
        delNivel.find((p) => (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") === tipo) ??
        delNivel.find((p) => (p.assistanceType === "HUMANO" ? "HUMANO" : "IA") !== tipo) ??
        null
    );
}

/* ─── El video del plan ────────────────────────────────────────────────── */

export type VideoDelPlan = {
    /** `iframe`: YouTube, Vimeo, Loom, Drive o cualquier reproductor web; `archivo`: un .mp4 o .webm. */
    tipo: "iframe" | "archivo";
    url: string;
};

const ID_DE_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const EXTENSION_DE_VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;

/** «90», «1m30s» o «1h2m3s» → segundos. Lo que no se entiende, nada. */
function losSegundosDelInicio(t: string | null): number | null {
    if (!t) return null;
    if (/^\d+$/.test(t)) return Number(t);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
    if (!m || !(m[1] || m[2] || m[3])) return null;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Cómo se pinta el video de un plan. El enlace se pega tal cual sale del
 * navegador («watch?v=…&t=1m», «youtu.be/…?si=…», un Short) y aquí se
 * convierte en el de insertar: la página vieja lo hacía con un `replace`, así
 * que «watch?v=ID&list=…» acababa en «embed/ID&list=…», que no existe.
 *
 * Solo `https` (en una página `https` el navegador bloquea lo demás) o un
 * archivo de la propia plataforma (`/…mp4`). Lo que no sirve, `null`: mejor
 * sin video que un recuadro negro.
 */
export function elVideoDelPlan(valor: unknown): VideoDelPlan | null {
    if (typeof valor !== "string") return null;
    const crudo = valor.trim();
    if (!crudo) return null;
    if (crudo.startsWith("/") && !crudo.startsWith("//")) {
        return EXTENSION_DE_VIDEO.test(crudo.split(/[?#]/)[0]) ? { tipo: "archivo", url: crudo } : null;
    }
    let url: URL;
    try {
        url = new URL(crudo);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
    const host = url.hostname.replace(/^(www|m)\./, "");
    const trozos = url.pathname.split("/").filter(Boolean);

    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
        let id: string | null = null;
        if (host === "youtu.be") id = trozos[0] ?? null;
        else if (trozos[0] === "watch") id = url.searchParams.get("v");
        else if (["embed", "shorts", "live", "v"].includes(trozos[0] ?? "")) id = trozos[1] ?? null;
        if (!id || !ID_DE_YOUTUBE.test(id)) return null;
        const inicio = losSegundosDelInicio(url.searchParams.get("t") ?? url.searchParams.get("start"));
        return { tipo: "iframe", url: `https://www.youtube.com/embed/${id}${inicio ? `?start=${inicio}` : ""}` };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
        const id = host === "vimeo.com" ? trozos.find((t) => /^\d+$/.test(t)) : trozos[0] === "video" ? trozos[1] : null;
        if (!id || !/^\d+$/.test(id)) return null;
        return { tipo: "iframe", url: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "loom.com" && (trozos[0] === "share" || trozos[0] === "embed") && trozos[1]) {
        return { tipo: "iframe", url: `https://www.loom.com/embed/${trozos[1]}` };
    }
    if (host === "drive.google.com" && trozos[0] === "file" && trozos[1] === "d" && trozos[2]) {
        return { tipo: "iframe", url: `https://drive.google.com/file/d/${trozos[2]}/preview` };
    }
    if (EXTENSION_DE_VIDEO.test(url.pathname)) return { tipo: "archivo", url: url.toString() };
    return { tipo: "iframe", url: url.toString() };
}

/** El mismo enlace con `autoplay=1`, sin romper los parámetros que ya tenga. */
export function conReproduccionAutomatica(url: string): string {
    try {
        const u = new URL(url);
        u.searchParams.set("autoplay", "1");
        return u.toString();
    } catch {
        return url;
    }
}

/* ─── Los botones ──────────────────────────────────────────────────────── */

export type BotonDelPlan = { texto: string; url: string; externo: boolean };

/** Un enlace que se puede poner en un botón: una ruta de la plataforma o una web. Nunca `javascript:`. */
export function comoEnlaceDelBoton(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const crudo = valor.trim();
    if (!crudo) return null;
    if (crudo.startsWith("/")) return crudo.startsWith("//") ? null : crudo;
    try {
        const url = new URL(crudo);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        if (!url.hostname.includes(".")) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function elBoton(texto: string, url: string): BotonDelPlan {
    return { texto, url, externo: /^https?:\/\//i.test(url) };
}

export type BotonesGuardados = {
    ctaButtonText?: string | null;
    ctaButtonUrl?: string | null;
    ctaSecondaryText?: string | null;
    ctaSecondaryUrl?: string | null;
    meetingUrl?: string | null;
    whatsappMessage?: string | null;
};

/**
 * Los dos botones del plan, con sus textos vivos. Un texto que nombra otro
 * plan, o este por un nombre viejo, deja el de siempre (`elTextoDelBoton`).
 *
 * Sin enlace propio, el principal es el de la landing: con precio, el
 * registro con este plan marcado (`/register?plan=nivel-N`, la modalidad va en
 * la cookie); sin precio
 * («A consultar»), escribir por WhatsApp a la marca, como la tarjeta del plan.
 */
export function losBotonesDelPlan(
    guardados: BotonesGuardados | null,
    datos: DatosDelPlan,
    sitio: { whatsappNumber?: string | null },
): { principal: BotonDelPlan; secundario: BotonDelPlan | null } {
    const g = guardados ?? {};
    const registro = elEnlaceDeRegistro(datos.plan);
    const propio = comoEnlaceDelBoton(g.ctaButtonUrl);
    let principal: BotonDelPlan;
    if (propio) {
        principal = elBoton(elTextoDelBoton(g.ctaButtonText, "Comenzar ahora", datos), propio);
    } else if (datos.precioUSD > 0) {
        principal = elBoton(elTextoDelBoton(g.ctaButtonText, "Comenzar ahora", datos), registro);
    } else {
        const numero = (sitio.whatsappNumber ?? "").replace(/\D/g, "");
        if (numero) {
            const crudo = conLosDatosDelPlan((g.whatsappMessage ?? "").trim(), datos);
            const mensaje =
                crudo && losAvisosDelTexto(crudo, datos).length === 0 && losAvisosDelBoton(crudo, datos).length === 0
                    ? crudo
                    : `Hola, me interesa el plan ${datos.nombre}`;
            principal = elBoton(
                elTextoDelBoton(g.ctaButtonText, "Contactar", datos),
                `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
            );
        } else {
            principal = elBoton(elTextoDelBoton(g.ctaButtonText, "Comenzar ahora", datos), registro);
        }
    }
    const otro = comoEnlaceDelBoton(g.ctaSecondaryUrl) ?? comoEnlaceDelBoton(g.meetingUrl);
    const secundario =
        otro && otro !== principal.url
            ? elBoton(elTextoDelBoton(g.ctaSecondaryText, "Agendar una demo", datos), otro)
            : null;
    return { principal, secundario };
}

/** «$49 USD» o «A consultar», como la tarjeta del plan en la landing. */
export function elPrecioQueSeEnsena(datos: DatosDelPlan): { texto: string; aConsultar: boolean } {
    return datos.precioUSD > 0 ? { texto: `$${elNumero(datos.precioUSD)}`, aConsultar: false } : { texto: "A consultar", aConsultar: true };
}

/* ─── El título y la descripción de la pestaña ─────────────────────────── */

/**
 * Lo que dice la pestaña del navegador y lo que sale al compartir el enlace.
 * Lo escrito a mano en el panel manda si no contradice al plan; si no, se arma
 * con el nombre de HOY.
 */
export function laCabeceraDeLaPagina(
    guardado: { metaTitle?: string | null; metaDescription?: string | null } | null,
    datos: DatosDelPlan,
    descripcion: string | null,
    marca: string,
): { titulo: string; descripcion: string } {
    const vale = (t: string) => t && losAvisosDelTexto(t, datos).length === 0 && losAvisosDelBoton(t, datos).length === 0;
    const titulo = conLosDatosDelPlan((guardado?.metaTitle ?? "").trim(), datos);
    const texto = conLosDatosDelPlan((guardado?.metaDescription ?? "").trim(), datos);
    return {
        titulo: vale(titulo) ? titulo : `Plan ${datos.nombre} | ${marca}`,
        descripcion: vale(texto) ? texto : descripcion?.trim() || `Todo lo que incluye el plan ${datos.nombre} de ${marca}.`,
    };
}

/* ─── Lo que acompaña al video ─────────────────────────────────────────── */

/** Una imagen que se puede pintar: `https` o un archivo de la plataforma. Lo demás, nada. */
export function comoImagenDelPlan(valor: unknown): string | null {
    const enlace = comoEnlaceDelBoton(valor);
    if (!enlace) return null;
    return enlace.startsWith("/") || enlace.startsWith("https://") ? enlace : null;
}

/** El título del video: el escrito en el panel si no contradice al plan; si no, uno con el nombre de HOY. */
export function elTituloDelVideo(valor: string | null | undefined, datos: DatosDelPlan): string {
    const texto = conLosDatosDelPlan((valor ?? "").trim(), datos);
    return texto && losAvisosDelTexto(texto, datos).length === 0 && losAvisosDelBoton(texto, datos).length === 0
        ? texto
        : `Así funciona el plan ${datos.nombre}`;
}

/** La descripción del plan, si no contradice al plan (un nombre viejo, otros créditos). */
export function laDescripcionQueSale(valor: string | null | undefined, datos: DatosDelPlan): string | null {
    const texto = conLosDatosDelPlan((valor ?? "").trim(), datos);
    return texto && losAvisosDelTexto(texto, datos).length === 0 ? texto : null;
}

/* ─── Para quién es este plan ──────────────────────────────────────────── */

export type ParaQuienDelPlan = {
    /** A quién le sirve, en una frase. */
    paraQuien: string;
    /** Un caso típico de negocio, en una o dos frases. */
    caso: string;
};

export const TOPE_DEL_PARA_QUIEN = 280;
export const TOPE_DEL_CASO = 600;

/**
 * Lo que sale si el panel no escribió nada (o lo escrito contradice al plan).
 * Sin números ni nombres de plan dentro, a propósito: así no se quedan viejos
 * cuando el plan cambia de créditos o de nombre.
 */
export const PARA_QUIEN_DE_FABRICA: Record<Plan, ParaQuienDelPlan> = {
    lite: {
        paraQuien: "Para quien empieza a vender por WhatsApp y quiere que la IA conteste las preguntas de siempre.",
        caso: "Una tienda pequeña que atiende sola: la IA responde precios, horarios y envíos a cualquier hora, y la dueña entra solo cuando un cliente ya quiere comprar.",
    },
    basico: {
        paraQuien: "Para negocios con una línea de WhatsApp que reciben consultas todos los días y no alcanzan a contestarlas a tiempo.",
        caso: "Un consultorio con una recepcionista: la IA atiende las preguntas frecuentes y separa a los interesados, y la recepcionista dedica su tiempo a confirmar y cerrar.",
    },
    intermedio: {
        paraQuien: "Para negocios con un equipo pequeño que necesitan ordenar sus contactos y hacer seguimiento sin perder ninguno.",
        caso: "Una academia con dos asesores: la IA responde y califica a quien pregunta, y cada asesor ve en orden con quién seguir hasta la inscripción.",
    },
    avanzado: {
        paraQuien: "Para empresas con varios asesores que quieren automatizar el proceso de venta y medir cada paso.",
        caso: "Una inmobiliaria con cinco asesores: la IA atiende y reparte las conversaciones, y el equipo sigue cada oportunidad hasta el cierre con sus números a la vista.",
    },
    enterprise: {
        paraQuien: "Para empresas con mucho volumen de conversaciones y equipos por área.",
        caso: "Una cadena de clínicas con ventas, soporte y cobros: cada equipo atiende lo suyo y la IA cubre el día y la noche para que ningún cliente espere.",
    },
    personalizado: {
        paraQuien: "Para negocios cuya operación necesita una configuración a la medida.",
        caso: "Una empresa con procesos e integraciones propias: el plan se arma según sus líneas, su equipo y sus herramientas.",
    },
};

/** Lo que llega del panel o de la base, saneado. Nunca lanza. */
export function comoParaQuien(raw: unknown): ParaQuienDelPlan {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const texto = (v: unknown, tope: number) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, tope) : "");
    return { paraQuien: texto(o.paraQuien, TOPE_DEL_PARA_QUIEN), caso: texto(o.caso, TOPE_DEL_CASO) };
}

/** Por qué lo escrito no sale en la página, campo por campo. Para el panel. */
export function losAvisosDelParaQuien(
    raw: unknown,
    datos: DatosDelPlan,
): { paraQuien: string[]; caso: string[] } {
    const g = comoParaQuien(raw);
    const avisos = (t: string) => (t ? [...new Set([...losAvisosDelTexto(t, datos), ...losAvisosDelBoton(t, datos)])] : []);
    return { paraQuien: avisos(g.paraQuien), caso: avisos(g.caso) };
}

/**
 * Lo que sale en «Para quién es este plan»: lo escrito en el panel si no
 * contradice al plan; si no (o si está vacío), lo de fábrica de su nivel. Cada
 * campo por su lado: un caso viejo no se lleva la frase de arriba.
 */
export function elParaQuienQueSale(raw: unknown, datos: DatosDelPlan): ParaQuienDelPlan {
    const g = comoParaQuien(raw);
    const avisos = losAvisosDelParaQuien(g, datos);
    const fabrica = (PARA_QUIEN_DE_FABRICA as Record<string, ParaQuienDelPlan>)[datos.plan] ?? PARA_QUIEN_DE_FABRICA.personalizado;
    return {
        paraQuien: g.paraQuien && avisos.paraQuien.length === 0 ? conLosDatosDelPlan(g.paraQuien, datos) : fabrica.paraQuien,
        caso: g.caso && avisos.caso.length === 0 ? conLosDatosDelPlan(g.caso, datos) : fabrica.caso,
    };
}

/* ─── El plan inmediato superior ───────────────────────────────────────── */

export type PlanSuperior = { plan: string; tipo: "IA" | "HUMANO"; nombre: string; url: string };

/**
 * El plan que sigue a este, para la línea discreta del final: el del nivel
 * INMEDIATO superior que esté activo (los niveles de `NIVELES`, de menor a
 * mayor). Se prefiere el mismo tipo de asistencia; si de ese nivel solo está
 * activo el otro tipo, ese. Si el siguiente nivel no está activo se salta al
 * siguiente que lo esté: «inmediato» es el siguiente que se puede contratar.
 * Del último, ninguno. Los planes de reseller no cuentan: no se venden aquí.
 */
export function elPlanSuperior<
    T extends { plan: string; assistanceType: string | null; isActive: boolean; isResellerPlan?: boolean | null; name?: string | null },
>(planes: readonly T[], actual: { plan: string; assistanceType: string | null }): PlanSuperior | null {
    const desde = laPosicionDelNivel(actual.plan);
    if (desde < 0) return null;
    const tipo = actual.assistanceType === "HUMANO" ? "HUMANO" : "IA";
    const tipoDe = (p: T) => (p.assistanceType === "HUMANO" ? "HUMANO" : "IA");
    const vendibles = planes.filter((p) => p.isActive && !p.isResellerPlan && laPosicionDelNivel(p.plan) > desde);
    if (vendibles.length === 0) return null;
    const siguiente = Math.min(...vendibles.map((p) => laPosicionDelNivel(p.plan)));
    const delNivel = vendibles.filter((p) => laPosicionDelNivel(p.plan) === siguiente);
    const elegido = delNivel.find((p) => tipoDe(p) === tipo) ?? delNivel[0];
    if (!elegido) return null;
    const suTipo = tipoDe(elegido);
    return {
        plan: elegido.plan,
        tipo: suTipo,
        nombre: elNombreDelPlan(elegido),
        // Por su nivel y sin la modalidad: la pone en la cookie quien pulsa (`tipo`).
        url: elEnlaceDeLaPaginaDelPlan(elegido.plan),
    };
}
