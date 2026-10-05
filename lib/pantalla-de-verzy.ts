/**
 * Lo que Verzy puede ENSEÑAR en la videollamada, y nada más: pantallas reales
 * de la cuenta «Verzay Ventas», navegadas en vivo por el servidor (ver
 * `lib/pantalla-de-verzy.server.ts`). Ninguna página de ejemplo, ningún video
 * promocional, ninguna vista hecha a propósito para la llamada.
 *
 * Puro: lo usan el servidor, la sala, el guion del avatar y el banco.
 */

import { navigationRoutes } from "@/lib/navigation-routes";

/**
 * NAVEGACIÓN LIBRE. Verzy no elige de una lista cerrada de pantallas: elige
 * una RUTA de los dos entornos que tiene abiertos —la landing pública
 * (`/inicio`, sus secciones y sus subpáginas) y la plataforma entera con la
 * sesión de Verzay Ventas— según lo que se esté hablando. Lo único que no
 * puede es salir de la plataforma ni abrir lo que no es una pantalla (`/api`,
 * el login, la propia videollamada).
 *
 * Dos atajos siguen existiendo porque dependen del PROSPECTO de la cita, no de
 * una ruta fija: `chats` (su conversación de WhatsApp) y `ficha` (su ficha).
 */

/** Atajos que se resuelven con la conversación del prospecto de la cita. */
export const ATAJOS_DEL_CLIENTE = {
    chats: "la conversación de WhatsApp del cliente en Chats",
    ficha: "la ficha de contacto del cliente, con sus datos y sus notas",
} as const;
export type AtajoDelCliente = keyof typeof ATAJOS_DEL_CLIENTE;

/** Un lugar al que va la pantalla: un atajo del cliente o una ruta que empieza por «/». */
export type LugarDeVerzy = AtajoDelCliente | `/${string}`;

/** Prefijos que NO son una pantalla, o que sacarían a Verzy de su sesión. */
export const RUTAS_PROHIBIDAS = ["/api", "/_next", "/login", "/register", "/logout", "/auth", "/videollamada", "/reunion", "/abrir"] as const;

/** Tope del largo de una ruta, para que no se cuele cualquier cosa. */
export const TOPE_DE_LA_RUTA = 300;

/** Las claves de antes (lista cerrada) y su ruta, para leer órdenes viejas. */
export const RUTA_DE_LA_CLAVE_VIEJA: Record<string, LugarDeVerzy> = {
    dashboard: "/crm/dashboard",
    panel: "/crm/dashboard",
    recordatorios: "/reminders",
    citas: "/schedule",
    agenda: "/schedule",
    embudo: "/embudos",
    crm_embudo: "/embudos",
    crm_recordatorios: "/reminders",
    precios: "/inicio#pricing",
    planes: "/inicio#pricing",
    inicio: "/inicio",
    landing: "/inicio",
};

const ATAJO_DE_LA_CLAVE: Record<string, AtajoDelCliente> = {
    chats: "chats",
    chat: "chats",
    "chat-del-cliente": "chats",
    conversacion: "chats",
    crm_conversacion: "chats",
    ficha: "ficha",
    "ficha-del-cliente": "ficha",
    crm: "ficha",
};

/**
 * Una ruta de la plataforma, saneada, o `null` si no es una pantalla a la que
 * Verzy pueda ir. Acepta «/inicio#pricing», «https://agente.ia-app.com/planes/nivel-3»,
 * «agente-ia-app.com/inicio» o «crm/dashboard»; de una dirección completa se
 * queda con la ruta, la consulta y el ancla (el dominio lo pone el servidor).
 */
export function comoRutaDeVerzy(valor: unknown): `/${string}` | null {
    let v = String(valor ?? "").trim();
    if (!v || v.length > TOPE_DE_LA_RUTA) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return null; // javascript:, mailto:…
    if (v.startsWith("//")) return null;
    if (/^https?:\/\//i.test(v)) {
        try {
            const u = new URL(v);
            v = `${u.pathname}${u.search}${u.hash}`;
        } catch {
            return null;
        }
    } else if (!v.startsWith("/")) {
        const primero = v.split(/[/?#]/)[0];
        if (primero.includes(".")) {
            try {
                const u = new URL(`https://${v}`);
                v = `${u.pathname}${u.search}${u.hash}`;
            } catch {
                return null;
            }
        } else if (v.startsWith("#")) {
            v = `/inicio${v}`;
        } else {
            v = `/${v}`;
        }
    }
    if (/\s/.test(v) || v.includes("\\") || v.includes("..")) return null;
    const camino = v.split(/[?#]/)[0].toLowerCase();
    if (RUTAS_PROHIBIDAS.some((p) => camino === p || camino.startsWith(`${p}/`))) return null;
    return v as `/${string}`;
}

/** Lo que pide el avatar (ruta, atajo o clave vieja) como un lugar, o `null`. */
export function comoLugarDeVerzy(valor: unknown): LugarDeVerzy | null {
    const clave = String(valor ?? "").trim().toLowerCase();
    if (!clave) return null;
    if (ATAJO_DE_LA_CLAVE[clave]) return ATAJO_DE_LA_CLAVE[clave];
    if (RUTA_DE_LA_CLAVE_VIEJA[clave]) return RUTA_DE_LA_CLAVE_VIEJA[clave];
    return comoRutaDeVerzy(valor);
}

export function esAtajoDelCliente(lugar: string): lugar is AtajoDelCliente {
    return lugar === "chats" || lugar === "ficha";
}

/** La ruta REAL de un lugar. Los atajos abren la conversación del prospecto. */
export function laRutaDelLugar(lugar: LugarDeVerzy, conversacion: { jid: string; linea: string | null } | null): string {
    if (!esAtajoDelCliente(lugar)) return lugar;
    if (!conversacion?.jid) return "/chats";
    const q = new URLSearchParams({ jid: conversacion.jid });
    if (conversacion.linea) q.set("instance", conversacion.linea);
    return `/chats?${q.toString()}`;
}

/** Separa una ruta en su camino (lo que se carga) y su ancla (a dónde se baja). */
export function laRutaYElAnclaDeVerzy(ruta: string): { camino: string; ancla: string | null } {
    const i = ruta.indexOf("#");
    if (i < 0) return { camino: ruta, ancla: null };
    const ancla = ruta.slice(i + 1).trim();
    return { camino: ruta.slice(0, i) || "/inicio", ancla: ancla || null };
}

/** Las secciones y subpáginas de la landing pública, con lo que enseña cada una. */
export const LUGARES_DE_LA_LANDING: ReadonlyArray<{ ruta: `/${string}`; nombre: string; cuando: string }> = [
    { ruta: "/inicio", nombre: "la página de inicio", cuando: "qué es Agente IA, de un vistazo" },
    { ruta: "/inicio#how", nombre: "cómo funciona", cuando: "los pasos para empezar" },
    { ruta: "/inicio#features", nombre: "las funciones", cuando: "todo lo que hace la plataforma" },
    { ruta: "/inicio#tutoriales", nombre: "los tutoriales", cuando: "las guías de cada módulo" },
    { ruta: "/inicio#pricing", nombre: "los planes y precios", cuando: "precios, planes y qué incluye cada uno" },
    { ruta: "/inicio#faq", nombre: "las preguntas frecuentes", cuando: "dudas típicas antes de comprar" },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
        ruta: `/planes/nivel-${n}` as const,
        nombre: `el detalle del plan de nivel ${n}`,
        cuando: `todo lo que incluye el plan de nivel ${n}, su video y su precio`,
    })),
    { ruta: "/documentacion", nombre: "la documentación", cuando: "cómo conectar el API oficial de Meta" },
];

/** Las pantallas de la plataforma que más se enseñan, con lo que muestran. No es un límite. */
export const LUGARES_DE_LA_PLATAFORMA: ReadonlyArray<{ ruta: `/${string}`; nombre: string; cuando: string }> = [
    { ruta: "/chats", nombre: "la bandeja de Chats", cuando: "todas las conversaciones de WhatsApp atendidas por la IA y el equipo" },
    { ruta: "/crm/dashboard", nombre: "el panel de estadísticas", cuando: "las métricas del negocio: chats, leads, citas y ventas" },
    { ruta: "/crm/kanban", nombre: "la calificación de leads", cuando: "los contactos por temperatura (frío, tibio, caliente)" },
    { ruta: "/crm/llamadas", nombre: "las llamadas", cuando: "llamadas con IA y su resumen" },
    { ruta: "/crm/reportes", nombre: "los reportes", cuando: "el resumen semanal y lo que la IA no supo" },
    { ruta: "/crm/rules", nombre: "los follow-ups con IA", cuando: "los seguimientos automáticos por estado" },
    { ruta: "/embudos", nombre: "el embudo de ventas", cuando: "cada conversación en su etapa de venta" },
    { ruta: "/sessions", nombre: "los leads", cuando: "la base de contactos y su exportación" },
    { ruta: "/tags", nombre: "las etiquetas", cuando: "contactos organizados por etiqueta" },
    { ruta: "/schedule", nombre: "la agenda de citas", cuando: "las citas agendadas y la página pública de reserva" },
    { ruta: "/reminders", nombre: "los recordatorios", cuando: "mensajes programados por WhatsApp" },
    { ruta: "/campaigns", nombre: "las campañas", cuando: "envíos masivos por WhatsApp" },
    { ruta: "/workflow", nombre: "los flujos", cuando: "automatizaciones y chatbots" },
    { ruta: "/ia", nombre: "el entrenamiento del agente IA", cuando: "cómo se entrena la IA con los datos del negocio" },
    { ruta: "/products", nombre: "los productos", cuando: "el catálogo que la IA usa para vender" },
    { ruta: "/equipo", nombre: "los usuarios del equipo", cuando: "asesores y cómo se reparten los chats" },
    { ruta: "/tareas", nombre: "las tareas", cuando: "las tareas del equipo" },
    { ruta: "/correo", nombre: "el correo", cuando: "la bandeja de correo unificada" },
    { ruta: "/profile", nombre: "conexión y ajustes", cuando: "conectar WhatsApp y los canales" },
];

/** Todas las rutas de la plataforma que existen hoy (las del menú). Se le ofrecen sin límite. */
export function lasRutasDeLaPlataforma(): string[] {
    return Array.from(new Set(navigationRoutes.map((r) => r.route))).filter(
        (r) => r.startsWith("/") && !r.includes("?") && !esDeAdministracion(r) && comoRutaDeVerzy(r),
    );
}

/** Pantallas de administración de la plataforma (no de una cuenta cliente): no se ofrecen. */
const PREFIJOS_DE_ADMINISTRACION = ["/panel", "/panel-admin", "/reseller-panel", "/client-panel", "/evo", "/tools/tool-"];
function esDeAdministracion(r: string): boolean {
    return PREFIJOS_DE_ADMINISTRACION.some((p) => r === p || r.startsWith(p.endsWith("-") ? p : `${p}/`));
}

/** Cómo se nombra un lugar en lo que se le cuenta a Verzy y en la sala. */
export function elNombreDelLugar(lugar: string): string {
    if (lugar === "chats") return "la conversación del cliente en Chats";
    if (lugar === "ficha") return "la ficha del cliente";
    const conocido = [...LUGARES_DE_LA_LANDING, ...LUGARES_DE_LA_PLATAFORMA].find((l) => l.ruta === lugar);
    if (conocido) return conocido.nombre;
    const { camino, ancla } = laRutaYElAnclaDeVerzy(lugar);
    const base = [...LUGARES_DE_LA_LANDING, ...LUGARES_DE_LA_PLATAFORMA].find((l) => l.ruta === camino.split("?")[0]);
    if (base && ancla) return `${base.nombre} (sección ${ancla})`;
    if (base) return base.nombre;
    return `la página ${lugar}`;
}

/** Tope de una nota que se dicta en la llamada, para que no se cuele un párrafo entero. */
export const TOPE_DE_LA_NOTA = 500;

/** Añade la nota al final de las que ya hay, en su propia línea, sin repetirla. */
export function conLaNotaAgregada(antes: string, texto: string): string {
    const nueva = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
    const previo = String(antes ?? "").replace(/\s+$/, "");
    if (!nueva) return previo;
    if (previo.split("\n").some((l) => l.trim() === nueva)) return previo;
    return previo ? `${previo}\n${nueva}` : nueva;
}

export type OrdenDeLaPantalla =
    | { tipo: "ir"; datos: { lugar: LugarDeVerzy } }
    | { tipo: "nota"; datos: { texto: string } }
    | { tipo: "recorrer"; datos: Record<string, never> };

export type ResultadoDeLaOrden = { ok: true; aviso?: string } | { ok: false; motivo: string };

/** Lo que llega del navegador a la ruta de la pantalla, saneado. */
export function laOrdenPedida(cuerpo: unknown): OrdenDeLaPantalla | null {
    const c = (cuerpo ?? {}) as { tipo?: unknown; lugar?: unknown; ruta?: unknown; destino?: unknown; texto?: unknown };
    if (c.tipo === "ir") {
        const lugar = comoLugarDeVerzy(c.lugar ?? c.ruta ?? c.destino);
        return lugar ? { tipo: "ir", datos: { lugar } } : null;
    }
    if (c.tipo === "recorrer") return { tipo: "recorrer", datos: {} };
    if (c.tipo === "nota") {
        const texto = String(c.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
        return texto ? { tipo: "nota", datos: { texto } } : null;
    }
    return null;
}

/** Lo que se le cuenta a Verzy después de cada orden, para que no diga algo que no pasó. */
export function loQueSeLeCuentaAVerzy(orden: OrdenDeLaPantalla, r: ResultadoDeLaOrden): string {
    if (orden.tipo === "nota") {
        return r.ok
            ? `La nota quedó guardada en la ficha del cliente en Verzay Ventas: «${orden.datos.texto}».`
            : `La nota NO se pudo guardar (${r.motivo}). No digas que quedó guardada.`;
    }
    if (orden.tipo === "recorrer") return "";
    const nombre = elNombreDelLugar(orden.datos.lugar);
    if (!r.ok) return `No se pudo abrir ${nombre} (${r.motivo}). No digas que lo estás mostrando.`;
    return r.aviso ? `En pantalla: ${nombre}. Aviso: ${r.aviso}.` : `En pantalla: ${nombre}, en vivo.`;
}

// ---------------------------------------------------------------- en vivo y en movimiento
//
// La pantalla NO son fotos: es un flujo de video (MJPEG) que sale del
// screencast del Chromium del servidor, y Verzy navega como una persona —el
// cursor se desliza, el buscador se escribe letra a letra, la nota también—.
// Estas son las reglas puras de ese movimiento y de ese flujo.

/** Fotogramas por segundo como mucho hacia cada sala. */
export const FPS_DEL_FLUJO = 20;
/** Con la pantalla quieta, el último fotograma se vuelve a mandar cada este rato. */
export const REPETIR_QUIETA_MS = 1_000;
/** Lo que tarda el cursor en ir de un sitio a otro. */
export const RECORRIDO_DEL_RATON_MS = 650;
/** Pausa entre letra y letra al escribir, como una persona que teclea rápido. */
export const PAUSA_ENTRE_LETRAS_MS = 55;
/** La frontera de cada parte del flujo MJPEG. */
export const FRONTERA_DEL_FLUJO = "verzyframe";

/** El tipo de la respuesta del flujo, con su frontera. */
export const TIPO_DEL_FLUJO = `multipart/x-mixed-replace; boundary=${FRONTERA_DEL_FLUJO}`;

/** La cabecera de una parte del flujo (lo que va antes de los bytes del JPEG). */
export function laCabeceraDeLaParte(bytes: number): string {
    return `--${FRONTERA_DEL_FLUJO}\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes}\r\n\r\n`;
}

/** Suavizado: arranca y frena despacio, como una mano. */
export function suavizado(t: number): number {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Los puntos por los que pasa el cursor de un sitio a otro, uno cada `pasoMs`.
 * El último es SIEMPRE el destino exacto, y nunca hay menos de dos.
 */
export function elRecorridoDelRaton(
    desde: { x: number; y: number },
    hasta: { x: number; y: number },
    ms = RECORRIDO_DEL_RATON_MS,
    pasoMs = 16,
): { x: number; y: number }[] {
    const pasos = Math.max(2, Math.round(ms / pasoMs));
    const puntos: { x: number; y: number }[] = [];
    for (let i = 1; i <= pasos; i++) {
        const t = suavizado(i / pasos);
        puntos.push({ x: Math.round(desde.x + (hasta.x - desde.x) * t), y: Math.round(desde.y + (hasta.y - desde.y) * t) });
    }
    puntos[puntos.length - 1] = { x: Math.round(hasta.x), y: Math.round(hasta.y) };
    return puntos;
}

/**
 * Qué hay que TECLEAR para pasar de `antes` a `despues`: si `despues` sigue a
 * `antes`, solo la cola; si no (el texto cambió por otro lado), nada que
 * teclear y se escribe entero (`null`).
 */
export function loQueFaltaEscribir(antes: string, despues: string): string | null {
    if (despues === antes) return "";
    return despues.startsWith(antes) ? despues.slice(antes.length) : null;
}

/** Qué se escribe en el buscador de Chats para encontrar al prospecto. */
export function loQueSeBusca(nombre: string, telefono: string | null): string {
    const n = String(nombre ?? "").replace(/\s+/g, " ").trim();
    if (n.length >= 2) return n.split(" ").slice(0, 2).join(" ");
    return String(telefono ?? "").replace(/\D/g, "").slice(-7);
}

// ---------------------------------------------------------------- la pantalla acompaña la voz
//
// Mientras Verzy habla, la pantalla que ya está puesta se RECORRE sola cada
// `RITMO_AL_HABLAR_MS`. A dónde ir lo decide SOLO Verzy con su herramienta,
// según el tema: no hay palabras sueltas de su voz que cambien de pantalla
// (eso abría el panel de estadísticas con decir «resumen»). Callada, nada.

/** Cada cuánto se mueve la pantalla mientras Verzy habla. */
export const RITMO_AL_HABLAR_MS = 2_200;

/** Qué hace la pantalla en este tick mientras Verzy habla. Puro: solo recorrer, nunca cambiar. */
export function queHaceLaPantallaAlHablar(e: {
    hablando: boolean;
    enPantalla: string | null;
    desdeElUltimoMovimientoMs: number;
}): { tipo: "recorrer" } | null {
    if (!e.hablando || !e.enPantalla) return null;
    if (e.desdeElUltimoMovimientoMs >= RITMO_AL_HABLAR_MS) return { tipo: "recorrer" };
    return null;
}
