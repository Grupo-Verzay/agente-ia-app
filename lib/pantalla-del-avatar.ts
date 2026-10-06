/**
 * La pantalla del avatar: en la videollamada con IA quien COMPARTE pantalla
 * es Verzy. Lo que se ve es la plataforma REAL —la landing pública y la cuenta
 * «Verzay Ventas» con su sesión—, navegada en vivo por el servidor
 * (`lib/pantalla-de-verzy.server.ts`) y enviada a la sala como video.
 *
 * Puro: lo usan la sala, el servidor (el contexto del avatar) y el banco.
 *
 * 1. **La navegación la decide el PROMPT, no el código.** El avatar pide la URL
 *    que su entrenamiento de Videollamadas le indique para el tema del momento;
 *    aquí no hay lista de páginas, ni atajos, ni momentos del guion atados a
 *    una ruta. El código solo SANEA la URL (`comoRutaDeVerzy`) y la carga.
 * 2. **La orden llega por Daily** (`app-message`) con la forma de Tavus
 *    (`conversation.tool_call`); lo demás se ignora.
 */

import { elBloqueDelGuionDe, type GuionDeVideollamada } from "@/lib/guion-videollamada";
import { TOPE_DE_LA_NOTA, comoRutaDeVerzy, type LugarDeVerzy } from "@/lib/pantalla-de-verzy";
import { laRutaDeLaPaginaDeTavus } from "@/lib/herramienta-vieja-de-tavus";

export const NOMBRE_DE_LA_HERRAMIENTA = "mostrar_pantalla";

/** Clave para dejar de compartir. */
export const OCULTAR = "ninguna";

export type OrdenDeLaPantalla =
    | { accion: "mostrar"; lugar: LugarDeVerzy }
    | { accion: "ocultar" }
    /** Llamó a la herramienta sin una ruta que sea una pantalla: se le dice, no se carga nada. */
    | { accion: "invalida"; pedido: string };

/** Lo que se le cuenta a Verzy cuando llama a la herramienta sin una ruta válida. */
export function elAvisoDeRutaInvalida(pedido: string): string {
    const lo = pedido ? `«${pedido.slice(0, 80)}»` : "una ruta vacía";
    return `La pantalla NO cambió: pediste ${lo}, que no es una pantalla de la plataforma. ` +
        "No digas que lo estás mostrando. Si tu entrenamiento indica mostrar algo en este paso, vuelve a llamar a la herramienta con la ruta completa que dice tu entrenamiento.";
}

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
 * El campo puede llamarse `ruta`, `url`, `destino` o `pagina` (personas de
 * Tavus de antes): su VALOR es la URL que eligió el modelo y se carga tal
 * cual, saneada. Lo que no sea una URL de la plataforma NO cambia nada.
 */
export function laOrdenDeLaPantalla(mensaje: unknown): OrdenDeLaPantalla | null {
    const args = laLlamadaA(mensaje, NOMBRE_DE_LA_HERRAMIENTA);
    if (!args) return null;
    let pedido = "";
    for (const campo of ["ruta", "url", "destino", "pagina"] as const) {
        const valor = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
        if (!valor) continue;
        pedido = valor;
        if (valor.toLowerCase() === OCULTAR) return { accion: "ocultar" };
        const lugar = comoRutaDeVerzy(valor);
        if (lugar) return { accion: "mostrar", lugar };
        // La herramienta VIEJA de la persona de Tavus manda una palabra de su
        // lista fija (`pagina`, y `modulo` para una guía). Sin traducirla, la
        // sala ignoraba todas sus llamadas. Ver lib/herramienta-vieja-de-tavus.
        if (campo === "pagina") {
            const deTavus = laRutaDeLaPaginaDeTavus(valor, args.modulo);
            const ruta = deTavus ? comoRutaDeVerzy(deTavus) : null;
            if (ruta) return { accion: "mostrar", lugar: ruta };
        }
        return { accion: "invalida", pedido };
    }
    // La llamó sin nada: es la «ruta vacía» que cargaba un 404.
    return { accion: "invalida", pedido };
}

/** La herramienta tal como se configura en la persona de Tavus (`layers.llm.tools`). */
export const HERRAMIENTA_DE_LA_PANTALLA = {
    type: "function",
    function: {
        name: NOMBRE_DE_LA_HERRAMIENTA,
        description:
            "Comparte en la pantalla del cliente, en vivo, la página de Agente IA que le pases (la landing o la plataforma con la sesión de Verzay Ventas). " +
            "La URL la decides tú siguiendo tu entrenamiento de Videollamadas y el tema de la conversación en ese momento. " +
            `Usa "${OCULTAR}" para dejar de compartir.`,
        parameters: {
            type: "object",
            properties: {
                ruta: {
                    type: "string",
                    description: `La URL a abrir: una ruta que empieza por "/" o una dirección completa de la plataforma; o "${OCULTAR}".`,
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

/**
 * Si el cliente pide VER algo, se le enseña YA. El guion de ventas guardado en
 * Tavus (y la descripción vieja de la herramienta) dicen «solo cuando el guion
 * lo pida» y piden diagnóstico antes: con eso el modelo se negaba a enseñar
 * los precios o el CRM aunque el cliente lo pidiera, y la pantalla no salía
 * nunca. Esta regla manda sobre ese orden.
 */
export const REGLA_DE_LO_QUE_PIDE_VER =
    `Si el cliente pide VER algo (los precios, los planes, el CRM, el embudo, una función), llama a ${NOMBRE_DE_LA_HERRAMIENTA} en ESE MISMO turno, antes de seguir con el guion y sin pedirle antes el diagnóstico. ` +
    "Esta regla manda sobre el orden del guion y sobre cualquier instrucción que diga usar la pantalla solo cuando el guion lo pida. Después de mostrarlo, puedes retomar el guion.";

/**
 * Lo que se le cuenta al avatar sobre CÓMO se comparte pantalla. No dice QUÉ
 * abrir ni cuándo: eso lo dice solo el entrenamiento de Videollamadas.
 */
export function elBloqueDeLaPantalla(): string {
    return [
        "PANTALLA COMPARTIDA",
        `Puedes compartir pantalla llamando a ${NOMBRE_DE_LA_HERRAMIENTA}: pásale la ruta de Agente IA, o la página de su lista si la herramienta te da una lista. ` +
            "Se carga tal cual, en vivo, y la ve el cliente.",
        "- Comparte SOLO en el paso de tu entrenamiento que lo indica, o cuando el cliente pide ver algo. Nunca por tu cuenta: no adelantes pantallas de pasos que todavía no llegaron ni abras otra página porque se mencionó un tema.",
        "- Cuando compartas, LLAMA a la herramienta: decir que muestras algo sin llamarla deja la pantalla vacía.",
        "- Pasa siempre la ruta completa que dice tu entrenamiento. Nunca la llames con la ruta vacía ni solo con la barra.",
        `- ${REGLA_DE_LO_QUE_PIDE_VER}`,
        "- Qué URL abrir y en qué momento lo decides SOLO siguiendo tu entrenamiento de Videollamadas, en su orden.",
        "- Nunca digas una URL en voz alta: llama a la herramienta y NÓMBRALA en palabras, di qué se está viendo.",
        `- Para dejar de compartir: ${OCULTAR}.`,
        `- ${NOMBRE_DE_TOMAR_NOTA} escribe en la ficha del cliente en Verzay Ventas; ella misma la abre.`,
        "- Después de cada orden recibirás qué pasó; si algo falló, no digas que se ve o que quedó guardado.",
        "- La pantalla solo cambia cuando tú llamas a la herramienta: mientras hablas se queda en la página que pusiste.",
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

/** Tope del entrenamiento que viaja en el contexto de Tavus. */
export const TOPE_DEL_ENTRENAMIENTO = 16000;

/**
 * El guion de la llamada. `ahora` es la fecha y hora de hoy en la zona del
 * negocio (la necesita para agendar «el jueves a las 3»). Si la cuenta escribió
 * su entrenamiento en Agente IA › Videollamadas, va ese; si no, el guion.
 */

/**
 * La ÚNICA regla del saludo, y la dice solo este bloque (el guion no la
 * repite: con dos redacciones se contradecían y Verzy saludaba dos veces).
 * La sala dice el saludo al entrar; si el cliente habla antes, saluda Verzy.
 */
export const REGLA_DEL_SALUDO =
    "El saludo de entrada lo dice la sala por ti. Si el cliente habla antes de oírlo, salúdalo tú UNA vez; después no vuelvas a saludar ni hables sin que te contesten.";

export function elBloqueDelGuion(
    ahora: string,
    guion?: GuionDeVideollamada | null,
    entrenamiento?: string | null,
): string {
    const texto = (entrenamiento ?? "").trim();
    // Cómo habla Verzy es fijo; QUÉ dice lo edita la cuenta en Entrenamiento ›
    // Agente IA › Videollamadas. Aquí solo se arma, con los nombres de las herramientas.
    return [
        "CÓMO HABLAS (manda sobre todo lo demás):",
        "- Turnos cortos: una o dos frases cortas por turno, como mucho unas 30 palabras.",
        "- Cada turno acaba en UNA pregunta concreta y corta. Después te callas y esperas a que el cliente responda.",
        "- Nada de monólogos, listas largas ni repetir lo que ya dijiste.",
        "- Sigue el guion en orden; no inventes pasos, ofertas ni datos que no estén aquí.",
        `- La única excepción al orden: ${REGLA_DE_LO_QUE_PIDE_VER}`,
        `- ${REGLA_DEL_SALUDO}`,
        texto
            ? [
                  "ENTRENAMIENTO DEL AGENTE (Agente IA › Videollamadas)",
                  `Ahora mismo son: ${ahora} (hora del negocio).`,
                  `Para apuntar algo usa ${NOMBRE_DE_TOMAR_NOTA}; para agendar usa ${NOMBRE_DEL_AGENDAR}.`,
                  texto.slice(0, TOPE_DEL_ENTRENAMIENTO),
              ].join("\n")
            : elBloqueDelGuionDe(guion, ahora, { tomarNota: NOMBRE_DE_TOMAR_NOTA, agendar: NOMBRE_DEL_AGENDAR }),
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
