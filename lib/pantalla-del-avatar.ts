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
];

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
    return pagina ? { accion: "mostrar", pagina } : null;
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
            "Úsala cuando el guion lo pida o el cliente quiera ver algo. " +
            `Usa "${OCULTAR}" para dejar de compartir.`,
        parameters: {
            type: "object",
            properties: {
                pagina: {
                    type: "string",
                    enum: [...PAGINAS_DEL_AVATAR.map((p) => p.clave), OCULTAR],
                    description: PAGINAS_DEL_AVATAR.map((p) => `${p.clave}: ${p.cuando}`).join("; "),
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
        "- Cambia de página en cuanto cambie el momento de la conversación, sin esperar a que el cliente lo pida.",
        "- Si el cliente pide ver algo (precios, planes, cómo funciona), llama a la herramienta ANTES de explicarlo.",
        "Qué página enseñar en cada momento del guion:",
        ...lineas,
        `Para dejar de compartir: ${OCULTAR}. Nunca inventes otra página.`,
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
    const deseada = JSON.stringify(HERRAMIENTA_DE_LA_PANTALLA);
    const la = actuales.find((h) => h?.function?.name === NOMBRE_DE_LA_HERRAMIENTA);
    if (la && JSON.stringify(la) === deseada) return null;
    const tools = [
        ...actuales.filter((h) => h?.function?.name !== NOMBRE_DE_LA_HERRAMIENTA),
        HERRAMIENTA_DE_LA_PANTALLA,
    ];
    if (!capas) return [{ op: "add", path: "/layers", value: { llm: { tools } } }];
    if (!llm) return [{ op: "add", path: "/layers/llm", value: { tools } }];
    return [{ op: Array.isArray(llm.tools) ? "replace" : "add", path: "/layers/llm/tools", value: tools }];
}
