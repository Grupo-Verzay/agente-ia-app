/**
 * La pantalla del avatar: en la videollamada con IA quien COMPARTE pantalla
 * es Verzy. Lo que se ve es la plataforma REAL —la landing pública y la cuenta
 * «Verzay Ventas» con su sesión—, navegada en vivo por el servidor
 * (`lib/pantalla-de-verzy.server.ts`) y enviada a la sala como video.
 *
 * Puro: lo usan la sala, el servidor (el contexto del avatar) y el banco.
 *
 * 1. **Navegación LIBRE**: el avatar pide una RUTA (`/inicio#pricing`,
 *    `/crm/dashboard`, `/planes/nivel-3`…) o un atajo del cliente (`chats`,
 *    `ficha`). Qué abrir lo decide según el tema; el servidor solo descarta lo
 *    que no es una pantalla (`comoLugarDeVerzy`).
 * 2. **La orden llega por Daily** (`app-message`) con la forma de Tavus
 *    (`conversation.tool_call`); lo demás se ignora.
 */

import { elBloqueDelGuionDe, type GuionDeVideollamada } from "@/lib/guion-videollamada";
import {
    ATAJOS_DEL_CLIENTE,
    LUGARES_DE_LA_LANDING,
    LUGARES_DE_LA_PLATAFORMA,
    TOPE_DE_LA_NOTA,
    comoLugarDeVerzy,
    lasRutasDeLaPlataforma,
    type LugarDeVerzy,
} from "@/lib/pantalla-de-verzy";

export const NOMBRE_DE_LA_HERRAMIENTA = "mostrar_pantalla";

/** Clave para dejar de compartir. */
export const OCULTAR = "ninguna";

export type OrdenDeLaPantalla = { accion: "mostrar"; lugar: LugarDeVerzy } | { accion: "ocultar" };

function losArgumentos(valor: unknown): Record<string, unknown> | null {
    if (valor && typeof valor === "object") return valor as Record<string, unknown>;
    if (typeof valor === "string") {
        try {
            const v = JSON.parse(valor);
            return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }
    return null;
}

function laLlamadaA(mensaje: unknown, nombre: string): Record<string, unknown> | null {
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as Record<string, unknown>;
    if (m.event_type !== "conversation.tool_call") return null;
    const p = (m.properties ?? {}) as Record<string, unknown>;
    if (p.name !== nombre) return null;
    return losArgumentos(p.arguments) ?? {};
}

/**
 * Lee un `app-message` de Daily. Tavus lo manda como
 * `{ message_type: "conversation", event_type: "conversation.tool_call",
 *    properties: { name, arguments } }`, con `arguments` en texto JSON.
 *
 * Entiende los tres formatos que puede tener la persona de Tavus —`ruta`
 * (el de ahora), `destino` y `pagina` (los de antes: Tavus no acepta el PATCH
 * de una persona con ediciones propias)—. Lo que no sea un lugar válido NO
 * cambia nada: nunca se cae a una pantalla por defecto.
 */
export function laOrdenDeLaPantalla(mensaje: unknown): OrdenDeLaPantalla | null {
    const args = laLlamadaA(mensaje, NOMBRE_DE_LA_HERRAMIENTA);
    if (!args) return null;
    for (const campo of ["ruta", "destino", "pagina"] as const) {
        const valor = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
        if (!valor) continue;
        if (valor.toLowerCase() === OCULTAR) return { accion: "ocultar" };
        const lugar = comoLugarDeVerzy(valor);
        return lugar ? { accion: "mostrar", lugar } : null;
    }
    return null;
}

/** La herramienta tal como se configura en la persona de Tavus (`layers.llm.tools`). */
export const HERRAMIENTA_DE_LA_PANTALLA = {
    type: "function",
    function: {
        name: NOMBRE_DE_LA_HERRAMIENTA,
        description:
            "Comparte en la pantalla del cliente la plataforma REAL de Agente IA, en vivo: la landing pública (/inicio y sus secciones y subpáginas) " +
            "o cualquier pantalla de la plataforma con la sesión de Verzay Ventas. Elige la página que tenga que ver con lo que se está hablando AHORA; " +
            `si nada tiene que ver, no la llames. "chats" y "ficha" abren la conversación y la ficha del cliente. Usa "${OCULTAR}" para dejar de compartir.`,
        parameters: {
            type: "object",
            properties: {
                ruta: {
                    type: "string",
                    description:
                        'Ruta de la plataforma que empieza por "/" (ej. "/inicio#pricing", "/planes/nivel-3", "/crm/dashboard", "/embudos"), ' +
                        `o "chats", "ficha" o "${OCULTAR}".`,
                },
            },
            required: ["ruta"],
        },
    },
} as const;

/* ── Tomar nota en la ficha real del cliente ──────────────────────────── */

export const NOMBRE_DE_TOMAR_NOTA = "tomar_nota";

/** Lee un `app-message` con la llamada a `tomar_nota`. */
export function laOrdenDeTomarNota(mensaje: unknown): { texto: string } | null {
    const args = laLlamadaA(mensaje, NOMBRE_DE_TOMAR_NOTA);
    if (!args) return null;
    const texto = typeof args.texto === "string" ? args.texto.replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA) : "";
    return texto ? { texto } : null;
}

export const HERRAMIENTA_DE_TOMAR_NOTA = {
    type: "function",
    function: {
        name: NOMBRE_DE_TOMAR_NOTA,
        description:
            "Escribe una nota en el campo Notas de la ficha REAL del cliente en el CRM de Verzay Ventas. " +
            "Úsala para apuntar lo que el cliente quiere resolver, su negocio, su presupuesto o lo que acordaron.",
        parameters: {
            type: "object",
            properties: {
                texto: { type: "string", description: `La nota, en una o dos frases (máximo ${TOPE_DE_LA_NOTA} caracteres)` },
            },
            required: ["texto"],
        },
    },
} as const;

/** Lo que se le cuenta al avatar en su contexto de cada conversación. */
export function elBloqueDeLaPantalla(): string {
    const conocidas = new Set(LUGARES_DE_LA_PLATAFORMA.map((l) => l.ruta as string));
    const otras = lasRutasDeLaPlataforma().filter((r) => !conocidas.has(r));
    return [
        "PANTALLA COMPARTIDA",
        `Compartes pantalla llamando a ${NOMBRE_DE_LA_HERRAMIENTA} con una ruta. Lo que se ve es la plataforma REAL, en vivo, ` +
            "y tienes acceso LIBRE a dos entornos: la landing pública y la plataforma completa con la sesión de Verzay Ventas.",
        "Reglas:",
        "- Tú decides qué abrir según lo que se está hablando en ESE momento. Muestra solo lo que tenga relación directa con el tema; si nada encaja, no cambies la pantalla.",
        "- Nunca digas una URL ni una dirección web. Llama a la herramienta y NÓMBRALA en palabras: di qué se está viendo.",
        "- La llamada EMPIEZA SIN COMPARTIR NADA. No compartas hasta que el cliente responda la segunda pregunta.",
        `- Después de esa respuesta, abre la ficha del cliente (ficha) y apunta con ${NOMBRE_DE_TOMAR_NOTA} lo que quiere resolver.`,
        "- Atajos del cliente de esta llamada:",
        ...Object.entries(ATAJOS_DEL_CLIENTE).map(([k, v]) => `  - ${k}: ${v}`),
        "- Landing pública (para precios, planes, funciones, cómo funciona):",
        ...LUGARES_DE_LA_LANDING.map((l) => `  - ${l.ruta}: ${l.cuando}`),
        "- Plataforma con la sesión de Verzay Ventas (para enseñar cómo se trabaja):",
        ...LUGARES_DE_LA_PLATAFORMA.map((l) => `  - ${l.ruta}: ${l.cuando}`),
        `- Más pantallas de la plataforma a las que también puedes ir: ${otras.join(", ")}.`,
        `- Para dejar de compartir: ${OCULTAR}.`,
        "- Después de cada orden recibirás qué pasó; si algo falló, no digas que se ve o que quedó guardado.",
        "- Mientras hablas, la pantalla que está puesta se recorre sola. Cambiar de pantalla solo lo haces tú, con la herramienta.",
    ].join("\n");
}

/* ── Enviar un enlace por WhatsApp durante la llamada ────────────────── */

export const NOMBRE_DEL_ENVIO = "enviar_por_whatsapp";

/** Qué se puede enviar: lista CERRADA. El modelo nunca escribe la dirección. */
export const QUE_SE_ENVIA = ["web", "plan", "pago"] as const;
export type QueSeEnvia = (typeof QUE_SE_ENVIA)[number];

export type OrdenDeEnvio = { que: QueSeEnvia; plan: string | null };

/** Lee un `app-message` con la llamada a `enviar_por_whatsapp`. */
export function laOrdenDeEnvio(mensaje: unknown): OrdenDeEnvio | null {
    const args = laLlamadaA(mensaje, NOMBRE_DEL_ENVIO);
    if (!args) return null;
    const que = typeof args?.que === "string" ? args.que.trim().toLowerCase() : "";
    if (!(QUE_SE_ENVIA as readonly string[]).includes(que)) return null;
    const plan = typeof args?.plan === "string" && args.plan.trim() ? args.plan.trim().slice(0, 60) : null;
    return { que: que as QueSeEnvia, plan };
}

export const HERRAMIENTA_DEL_ENVIO = {
    type: "function",
    function: {
        name: NOMBRE_DEL_ENVIO,
        description:
            "Envía al cliente por WhatsApp, al número de su cita, un enlace: la página web de Verzay, " +
            "la página de un plan o el enlace de pago de un plan. Úsala cuando el cliente pida que le mandes un enlace.",
        parameters: {
            type: "object",
            properties: {
                que: {
                    type: "string",
                    enum: [...QUE_SE_ENVIA],
                    description: "web: la página web de Verzay; plan: la página de un plan; pago: el enlace para pagar/registrarse en un plan",
                },
                plan: {
                    type: "string",
                    description: "El plan del que habla el cliente (su nombre o 'nivel 1'..'nivel 6'). Obligatorio para plan y pago.",
                },
            },
            required: ["que"],
        },
    },
} as const;

/** Lo que se le cuenta al avatar sobre el envío por WhatsApp. */
export function elBloqueDelEnvio(): string {
    return [
        "ENVIAR ENLACES POR WHATSAPP",
        `Si el cliente pide el enlace de la página web, de un plan o el enlace de pago, llama a ${NOMBRE_DEL_ENVIO} ` +
            "(que: web, plan o pago; y el plan cuando aplique) y dile que ya se lo enviaste a su WhatsApp. " +
            "Nunca dictes la dirección en voz alta.",
    ].join("\n");
}

/**
 * El nivel del plan que nombró el cliente: «nivel 3», «3», el nombre interno o
 * el NOMBRE COMERCIAL vigente (`nombres`, de `losNombresDeLosNiveles`), sin
 * mirar mayúsculas ni tildes. `null` si no casa con ninguno: no se adivina.
 */
export function elNivelNombrado(plan: string | null, nombres: Readonly<Record<string, string>>): string | null {
    const limpio = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const pedido = plan ? limpio(plan).replace(/^plan\s+/, "") : "";
    if (!pedido) return null;
    const porNivel = pedido.match(/^(?:nivel[\s_-]*)?(\d+)$/);
    if (porNivel) {
        const n = Number(porNivel[1]);
        return n >= 1 && n <= NIVELES_DEL_ENVIO.length ? NIVELES_DEL_ENVIO[n - 1] : null;
    }
    if ((NIVELES_DEL_ENVIO as readonly string[]).includes(pedido)) return pedido;
    for (const [nivel, nombre] of Object.entries(nombres)) {
        if (limpio(nombre) === pedido || limpio(nombre).replace(/^plan\s+/, "") === pedido) return nivel;
    }
    return null;
}

/** Los niveles, en orden (los mismos de `NIVELES_DE_PLAN`; el banco los compara). */
export const NIVELES_DEL_ENVIO = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"] as const;

export type EnvioArmado = { llave: string; enlace: string; mensaje: string } | { motivo: string };

/**
 * El enlace y el mensaje que salen por WhatsApp. La dirección la arma ESTE
 * servidor (`origen` + la ruta de la casa): el modelo solo dice qué y de qué
 * plan. Sin plan reconocible, plan y pago no se mandan: se dice por qué.
 */
export function elEnvioArmado(
    orden: OrdenDeEnvio,
    { origen, nivel, nombreDelPlan }: { origen: string; nivel: string | null; nombreDelPlan: string | null },
): EnvioArmado {
    if (orden.que === "web") {
        const enlace = `${origen}/inicio`;
        return { llave: "web", enlace, mensaje: `🌐 *Página web de Verzay*\nAquí tienes toda la información de la plataforma.\n\n👉 ${enlace}` };
    }
    if (!nivel) return { motivo: "no se reconoció el plan" };
    const n = NIVELES_DEL_ENVIO.indexOf(nivel as (typeof NIVELES_DEL_ENVIO)[number]) + 1;
    if (n < 1) return { motivo: "no se reconoció el plan" };
    const nombre = nombreDelPlan || `Nivel ${n}`;
    if (orden.que === "plan") {
        const enlace = `${origen}/planes/nivel-${n}`;
        return { llave: `plan:${nivel}`, enlace, mensaje: `📋 *Plan ${nombre}*\nAquí tienes todo lo que incluye.\n\n👉 ${enlace}` };
    }
    const enlace = `${origen}/register?plan=nivel-${n}`;
    return { llave: `pago:${nivel}`, enlace, mensaje: `💳 *Empieza con el plan ${nombre}*\nAquí tienes el enlace para registrarte y pagar.\n\n👉 ${enlace}` };
}

/* ── Agendar el siguiente paso durante la llamada ─────────────────────── */

export const NOMBRE_DEL_AGENDAR = "agendar_seguimiento";
export const TIPOS_DE_SEGUIMIENTO = ["cita", "recordatorio", "llamada"] as const;
export type TipoDeSeguimiento = (typeof TIPOS_DE_SEGUIMIENTO)[number];
export type OrdenDeAgendar = { tipo: TipoDeSeguimiento; fechaHora: string; nota: string };

/** «YYYY-MM-DDTHH:mm», en la hora de la cuenta. Nada más vale. */
export const FORMA_DE_LA_FECHA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function esUnaFechaDeAgenda(texto: string): boolean {
    const m = texto.match(FORMA_DE_LA_FECHA);
    if (!m) return false;
    const [, a, mes, d, h, min] = m.map(Number);
    const f = new Date(Date.UTC(a, mes - 1, d, h, min));
    return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d && h < 24 && min < 60;
}

/** Lee un `app-message` con la llamada a `agendar_seguimiento`. */
export function laOrdenDeAgendar(mensaje: unknown): OrdenDeAgendar | null {
    const args = laLlamadaA(mensaje, NOMBRE_DEL_AGENDAR);
    if (!args) return null;
    const tipo = typeof args?.tipo === "string" ? args.tipo.trim().toLowerCase() : "";
    if (!(TIPOS_DE_SEGUIMIENTO as readonly string[]).includes(tipo)) return null;
    const fechaHora = typeof args?.fecha_hora === "string" ? args.fecha_hora.trim() : "";
    if (!esUnaFechaDeAgenda(fechaHora)) return null;
    const nota = typeof args?.nota === "string" ? args.nota.trim().slice(0, 300) : "";
    return { tipo: tipo as TipoDeSeguimiento, fechaHora, nota };
}

export const HERRAMIENTA_DEL_AGENDAR = {
    type: "function",
    function: {
        name: NOMBRE_DEL_AGENDAR,
        description:
            "Deja agendado el siguiente paso que el cliente aceptó: una cita, un recordatorio por WhatsApp o una llamada. " +
            "Úsala SOLO después de confirmar con el cliente la fecha y la hora.",
        parameters: {
            type: "object",
            properties: {
                tipo: { type: "string", enum: [...TIPOS_DE_SEGUIMIENTO], description: "cita: otra reunión; recordatorio: un WhatsApp a esa hora; llamada: llamarle a esa hora" },
                fecha_hora: { type: "string", description: "Fecha y hora acordadas, en la hora local del negocio, con la forma YYYY-MM-DDTHH:mm" },
                nota: { type: "string", description: "Qué se acordó, en una frase" },
            },
            required: ["tipo", "fecha_hora"],
        },
    },
} as const;

/**
 * El guion de la llamada. `ahora` es la fecha y hora de hoy en la zona del
 * negocio (la necesita para agendar «el jueves a las 3»).
 */
export function elBloqueDelGuion(ahora: string, guion?: GuionDeVideollamada | null): string {
    // Cómo habla Verzy es fijo; QUÉ dice lo edita la cuenta en Entrenamiento ›
    // Agente IA › Videollamadas. Aquí solo se arma, con los nombres de las herramientas.
    return [
        "CÓMO HABLAS (manda sobre todo lo demás):",
        "- Turnos cortos: una o dos frases cortas por turno, como mucho unas 30 palabras.",
        "- Cada turno acaba en UNA pregunta concreta y corta. Después te callas y esperas a que el cliente responda.",
        "- Nada de monólogos, listas largas ni repetir lo que ya dijiste.",
        "- Sigue el guion en orden; no inventes pasos, ofertas ni datos que no estén aquí.",
        "- El saludo ya se dijo por ti al entrar: NO saludes otra vez ni empieces a hablar sola; espera a que el cliente conteste.",
        elBloqueDelGuionDe(guion, ahora, { tomarNota: NOMBRE_DE_TOMAR_NOTA, agendar: NOMBRE_DEL_AGENDAR }),
    ].join("\n");
}

/* ── La persona de Tavus ───────────────────────────────────────────────── */

type HerramientaDeTavus = { type?: unknown; function?: { name?: unknown } };

/**
 * Lo que hay que cambiarle a la persona de Tavus para que TENGA la herramienta
 * de la pantalla y la de tomar nota (y la versión de hoy). Recibe
 * la persona tal como la devuelve `GET /v2/personas/<id>` y devuelve el parche
 * JSON (RFC 6902) para `PATCH`, o `null` si ya está al día.
 *
 * Sin esto el avatar no tiene la herramienta: dice la dirección en voz alta y
 * no se ve nada. Las DEMÁS herramientas de la persona se conservan.
 */
export function elParcheDeLaPersona(persona: unknown): unknown[] | null {
    const p = (persona && typeof persona === "object" ? persona : {}) as Record<string, unknown>;
    const capas = p.layers && typeof p.layers === "object" ? (p.layers as Record<string, unknown>) : null;
    const llm = capas?.llm && typeof capas.llm === "object" ? (capas.llm as Record<string, unknown>) : null;
    const actuales = Array.isArray(llm?.tools) ? (llm!.tools as HerramientaDeTavus[]) : [];
    const nuestras = [HERRAMIENTA_DE_LA_PANTALLA, HERRAMIENTA_DE_TOMAR_NOTA, HERRAMIENTA_DEL_ENVIO, HERRAMIENTA_DEL_AGENDAR] as const;
    const nombres = nuestras.map((h) => h.function.name as string);
    const alDia = nuestras.every((d) => {
        const la = actuales.find((h) => h?.function?.name === d.function.name);
        return la && JSON.stringify(la) === JSON.stringify(d);
    });
    if (alDia) return null;
    const tools = [
        ...actuales.filter((h) => !nombres.includes(h?.function?.name as string)),
        ...nuestras,
    ];
    if (!capas) return [{ op: "add", path: "/layers", value: { llm: { tools } } }];
    if (!llm) return [{ op: "add", path: "/layers/llm", value: { tools } }];
    return [{ op: Array.isArray(llm.tools) ? "replace" : "add", path: "/layers/llm/tools", value: tools }];
}
