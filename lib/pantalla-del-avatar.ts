/**
 * La pantalla del avatar: en la videollamada con IA quien COMPARTE pantalla
 * es Verzy, no el cliente. La sala (`SalaDeLaVideollamada`) pinta al lado del
 * video un panel con una página pública de Verzay, y la elige el avatar
 * llamando a su herramienta `mostrar_pantalla` cuando el guion lo pide.
 *
 * Puro: lo usan la sala (qué pintar), el servidor (qué se le cuenta al
 * avatar en su contexto) y el banco. Tres reglas:
 *
 * 1. **Lista CERRADA de páginas.** El avatar nombra una CLAVE, nunca una
 *    dirección: lo que diga el modelo no puede llevar al cliente a cualquier
 *    sitio. Una clave que no está en la lista no cambia nada.
 * 2. **Solo páginas PÚBLICAS de la plataforma**, del mismo origen (se pintan
 *    en un iframe y `X-Frame-Options` es SAMEORIGIN).
 * 3. **La orden llega por el canal de Daily** (`app-message`) con la forma de
 *    los eventos de Tavus (`conversation.tool_call`). Lo que no tenga esa forma
 *    se ignora: por ese canal también viajan los mensajes de los humanos.
 */

export type PaginaDelAvatar = {
    clave: string;
    titulo: string;
    ruta: string;
    /** Cuándo enseñarla: va en el contexto del avatar y en la herramienta. */
    cuando: string;
    /** El MOMENTO del guion de ventas en el que se enseña (va en el contexto). */
    momento: string;
};

/**
 * Las páginas, en el ORDEN del guion de ventas. La base es la landing pública
 * (`/inicio`, la de agente.ia-app.com) y cada momento de la conversación
 * enseña su sección: presentar → inicio, qué hace → funciones, cómo se
 * empieza → cómo funciona, la oferta → planes y precios, verla funcionando →
 * demostración, objeciones → preguntas frecuentes.
 */
export const PAGINAS_DEL_AVATAR: readonly PaginaDelAvatar[] = [
    { clave: "inicio", titulo: "Agente IA", ruta: "/inicio", cuando: "al presentar la plataforma", momento: "1. Saludo y presentación de Verzay" },
    { clave: "funciones", titulo: "Funciones", ruta: "/inicio#features", cuando: "al explicar qué hace la plataforma", momento: "2. Qué hace la plataforma por su negocio" },
    { clave: "demo", titulo: "Demostración", ruta: "/demo", cuando: "para enseñar el video de la plataforma funcionando", momento: "3. Verla funcionando" },
    { clave: "como_funciona", titulo: "Cómo funciona", ruta: "/inicio#how", cuando: "al explicar los pasos para empezar", momento: "4. Cómo se empieza" },
    { clave: "precios", titulo: "Planes y precios", ruta: "/inicio#pricing", cuando: "cuando pregunten por precios o planes", momento: "5. La oferta: planes y precios" },
    { clave: "preguntas", titulo: "Preguntas frecuentes", ruta: "/inicio#faq", cuando: "ante dudas generales u objeciones", momento: "6. Dudas y objeciones" },
    { clave: "tutoriales", titulo: "Tutoriales", ruta: "/inicio#tutoriales", cuando: "cuando pregunten cómo se usa un módulo", momento: "Cuando pregunten cómo se usa algo" },
    { clave: "ficha", titulo: "Tu ficha", ruta: "/videollamada/vista/ficha", cuando: "al resumir lo que te contó el cliente (su negocio y lo que necesita)", momento: "Resumen antes del diagnóstico" },
    { clave: "resultados", titulo: "Resultados de Verzay", ruta: "/videollamada/vista/resultados", cuando: "al enseñar resultados reales de clientes de Verzay", momento: "Diagnóstico y plan: pruebas" },
    { clave: "guia", titulo: "Guía", ruta: "/guia", cuando: "para enseñar la guía de UN módulo (con su parámetro modulo)", momento: "Cuando pregunten cómo funciona un módulo concreto" },
];

/**
 * Los módulos con guía pública (`app/guia/<modulo>`) que el avatar puede
 * enseñar con `mostrar_pantalla` (pagina: guia, modulo: …). Lista CERRADA: el
 * banco la compara con las carpetas de `app/guia/`.
 */
export const GUIAS_DEL_AVATAR = [
    "agenda", "agente-ia", "ai-imagenes", "calificacion", "campanas", "catalogo", "chats", "cobros",
    "conexion", "copiloto", "correo", "diagramas", "embudos", "etiquetas", "finanzas", "flujos",
    "follow-ups", "formularios", "google-sheets", "informes", "integraciones", "leads", "llamadas",
    "macros", "mis-datos", "multiagenda", "notas", "productos", "proyectos", "recordatorios",
    "reportes", "respuestas-rapidas", "reuniones", "tareas", "usuarios",
] as const;

/** Las páginas que sirve la propia sala y llevan la firma de la cita en la consulta. */
export const VISTAS_DE_LA_SALA = "/videollamada/vista/";

/** El módulo pedido, si está en la lista. */
export function elModuloDeLaGuia(modulo: unknown): string | null {
    const m = typeof modulo === "string" ? modulo.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
    return (GUIAS_DEL_AVATAR as readonly string[]).includes(m) ? m : null;
}

/** La ruta de la página sin el ancla, y el ancla aparte (o `null`). */
export function laRutaYElAncla(ruta: string): { ruta: string; ancla: string | null } {
    const [base, ancla] = ruta.split("#");
    return { ruta: base || "/", ancla: ancla ? ancla : null };
}

export const NOMBRE_DE_LA_HERRAMIENTA = "mostrar_pantalla";

/** Clave para dejar de compartir. */
export const OCULTAR = "ninguna";

export function laPaginaDelAvatar(clave: unknown): PaginaDelAvatar | null {
    const c = typeof clave === "string" ? clave.trim().toLowerCase() : "";
    return PAGINAS_DEL_AVATAR.find((p) => p.clave === c) ?? null;
}

export type OrdenDeLaPantalla = { accion: "mostrar"; pagina: PaginaDelAvatar } | { accion: "ocultar" };

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

/**
 * Lee un `app-message` de Daily. Tavus lo manda como
 * `{ message_type: "conversation", event_type: "conversation.tool_call",
 *    properties: { name, arguments } }`, con `arguments` en texto JSON.
 */
export function laOrdenDeLaPantalla(mensaje: unknown): OrdenDeLaPantalla | null {
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as Record<string, unknown>;
    if (m.event_type !== "conversation.tool_call") return null;
    const p = (m.properties ?? {}) as Record<string, unknown>;
    if (p.name !== NOMBRE_DE_LA_HERRAMIENTA) return null;
    const args = losArgumentos(p.arguments);
    const clave = typeof args?.pagina === "string" ? args.pagina.trim().toLowerCase() : "";
    if (clave === OCULTAR) return { accion: "ocultar" };
    const pagina = laPaginaDelAvatar(clave);
    if (!pagina) return null;
    if (pagina.clave !== "guia") return { accion: "mostrar", pagina };
    // La guía necesita su módulo, y solo de la lista: sin él no se enseña nada.
    const modulo = elModuloDeLaGuia(args?.modulo);
    if (!modulo) return null;
    return { accion: "mostrar", pagina: { ...pagina, clave: `guia:${modulo}`, titulo: `Guía de ${modulo.replace(/-/g, " ")}`, ruta: `/guia/${modulo}` } };
}

/**
 * La herramienta tal como se configura UNA vez en la persona de Tavus
 * (Verzy, `layers.llm.tools`). La persona es fija para toda la plataforma, así
 * que no viaja con cada conversación.
 */
export const HERRAMIENTA_DE_LA_PANTALLA = {
    type: "function",
    function: {
        name: NOMBRE_DE_LA_HERRAMIENTA,
        description:
            "Comparte en la pantalla del cliente una página pública de Verzay. " +
            "Úsala SOLO cuando el guion de ventas lo pida o el cliente quiera ver algo y el guion lo permita; " +
            "la llamada empieza sin compartir nada. " +
            `Usa "${OCULTAR}" para dejar de compartir.`,
        parameters: {
            type: "object",
            properties: {
                pagina: {
                    type: "string",
                    enum: [...PAGINAS_DEL_AVATAR.map((p) => p.clave), OCULTAR],
                    description: PAGINAS_DEL_AVATAR.map((p) => `${p.clave}: ${p.cuando}`).join("; "),
                },
                modulo: {
                    type: "string",
                    enum: [...GUIAS_DEL_AVATAR],
                    description: "Solo con pagina: guia. El módulo cuya guía se enseña.",
                },
            },
            required: ["pagina"],
        },
    },
} as const;

/** Lo que se le cuenta al avatar en su contexto de cada conversación. */
export function elBloqueDeLaPantalla(): string {
    const lineas = PAGINAS_DEL_AVATAR.map((p) => `- ${p.momento} → ${p.clave} (${p.titulo})`);
    return [
        "PANTALLA COMPARTIDA",
        `Tú compartes pantalla con el cliente llamando a la herramienta ${NOMBRE_DE_LA_HERRAMIENTA}. ` +
            "Lo que el cliente ve en su pantalla lo decide SOLO esa herramienta: decir una dirección web en voz alta no le enseña nada.",
        "Reglas:",
        "- Nunca digas una URL ni una dirección web en voz alta. En su lugar llama a la herramienta y dile qué está viendo (por ejemplo: «te estoy mostrando los planes»).",
        "- La llamada EMPIEZA SIN COMPARTIR NADA: al saludar el cliente solo te ve a ti. No compartas pantalla por defecto.",
        "- Comparte SOLO cuando el guion de ventas lo indique en ese momento, o cuando el cliente pida ver algo y el guion lo permita.",
        "- Si el cliente pide ver algo (precios, planes, cómo funciona) y corresponde, llama a la herramienta ANTES de explicarlo.",
        `- Cuando ya no haga falta mostrar nada, deja de compartir con ${OCULTAR}.`,
        "Qué página enseñar en cada momento del guion:",
        ...lineas,
        "- ficha: el resumen de lo que el cliente te contó; resultados: resultados reales de clientes de Verzay; " +
            "guia: la guía de un módulo, diciendo cuál en «modulo».",
        `Para dejar de compartir: ${OCULTAR}. Nunca inventes otra página.`,
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
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as Record<string, unknown>;
    if (m.event_type !== "conversation.tool_call") return null;
    const p = (m.properties ?? {}) as Record<string, unknown>;
    if (p.name !== NOMBRE_DEL_ENVIO) return null;
    const args = losArgumentos(p.arguments);
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
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as Record<string, unknown>;
    if (m.event_type !== "conversation.tool_call") return null;
    const p = (m.properties ?? {}) as Record<string, unknown>;
    if (p.name !== NOMBRE_DEL_AGENDAR) return null;
    const args = losArgumentos(p.arguments);
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
export function elBloqueDelGuion(ahora: string): string {
    return [
        "GUION DE LA LLAMADA",
        `Ahora mismo son: ${ahora} (hora del negocio).`,
        "1. Primera pregunta: después de saludar, pregunta a qué se dedica su negocio y qué quiere resolver. Escucha antes de vender.",
        "2. Resumen antes del diagnóstico: repite en una o dos frases lo que te contó (puedes enseñar la ficha) y confirma que lo entendiste bien.",
        "3. Diagnóstico y plan: dile qué le está costando hoy y qué plan de Verzay lo resuelve, y por qué ese y no otro.",
        "4. Cierre suave, UNA sola vez: pregunta si quiere empezar con ese plan. No insistas más de una vez.",
        "5. Si no está listo, ofrece una alternativa de bajo riesgo: empezar con el plan más pequeño, o ver la demostración y hablar otro día.",
        "6. Objeciones:",
        "   - «Es caro»: compáralo con lo que pierde hoy en mensajes sin responder y ventas que se enfrían; ofrece el plan más pequeño.",
        "   - «Tengo que consultarlo con mi socio»: ofrece enviarle la información por WhatsApp y agendar una llamada con los dos.",
        `7. Siguiente paso: antes de despedirte, confirma una fecha y una hora concretas y déjalo agendado con ${NOMBRE_DEL_AGENDAR} ` +
            "(cita, recordatorio o llamada). Calcula la fecha a partir de la de hoy y repítesela al cliente.",
    ].join("\n");
}

/* ── La persona de Tavus ───────────────────────────────────────────────── */

type HerramientaDeTavus = { type?: unknown; function?: { name?: unknown } };

/**
 * Lo que hay que cambiarle a la persona de Tavus para que TENGA la herramienta
 * de la pantalla (y la versión de hoy: con las páginas de esta lista). Recibe
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
    const nuestras = [HERRAMIENTA_DE_LA_PANTALLA, HERRAMIENTA_DEL_ENVIO, HERRAMIENTA_DEL_AGENDAR] as const;
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
