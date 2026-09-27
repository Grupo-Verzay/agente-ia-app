/**
 * El SENTIMIENTO del cliente en una conversación de Chats: positivo, neutro o
 * negativo. Lo puro vive aquí —qué se le pide a la IA, cómo se lee lo que
 * contesta, cuándo una conversación «cae» a negativo, de qué color se tiñe el
 * aro del avatar y cuándo sale la franja de alerta— para que el servidor, la
 * lista, la conversación abierta y el reporte del CRM digan lo mismo.
 *
 * Lo que toca la base está en `lib/sentimiento-db.ts` y quien llama a la IA en
 * `lib/sentimiento-runner.server.ts`.
 */

export const SENTIMIENTOS = ["positivo", "neutro", "negativo"] as const;
export type Sentimiento = (typeof SENTIMIENTOS)[number];

/**
 * Lo que la pantalla necesita de una conversación: su sentimiento y, si es
 * negativo, DESDE CUÁNDO. Esa fecha es la llave de la franja: cerrarla la cierra
 * para ESA caída, y si la conversación mejora y vuelve a caer, sale otra vez.
 */
export type SentimientoDeLaConversacion = {
    sentimiento: Sentimiento;
    /** ISO. Solo con `negativo`. */
    negativoDesde: string | null;
};

/** Cuántos mensajes de la conversación se le pasan a la IA como contexto. */
export const MENSAJES_DE_CONTEXTO = 8;
/** Tope de caracteres del contexto: una conversación larga no puede ser una factura. */
export const TOPE_DE_CARACTERES = 2400;

export const INSTRUCCION_DEL_SENTIMIENTO = `Eres un analista de atención al cliente. Lees un trozo de una conversación de WhatsApp entre un negocio y su cliente y clasificas CÓMO SE SIENTE EL CLIENTE en sus últimos mensajes.
Responde con UNA sola palabra, sin nada más:
- positivo: el cliente está contento, agradece, se muestra interesado o satisfecho.
- neutro: pregunta, informa, saluda o no expresa ninguna emoción clara.
- negativo: el cliente está molesto, frustrado, enojado, se queja, reclama, amenaza con irse o expresa decepción.
Juzga SOLO al cliente, no al negocio. Ante la duda, responde neutro.`;

/**
 * Lee lo que contestó la IA. Se queda con la PRIMERA de las tres palabras que
 * aparezca, sin acentos ni mayúsculas. Lo que no se entiende es `null` —«no se
 * pudo clasificar»—, NUNCA `neutro`: inventar un neutro borraría un negativo que
 * sí estaba, y la franja de alerta se iría sola sin que el cliente haya mejorado.
 */
export function leerElSentimiento(respuesta: unknown): Sentimiento | null {
    if (typeof respuesta !== "string") return null;
    const limpio = respuesta
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    let mejor: { s: Sentimiento; i: number } | null = null;
    for (const s of SENTIMIENTOS) {
        const i = limpio.search(new RegExp(`\\b${s}\\b`));
        if (i >= 0 && (!mejor || i < mejor.i)) mejor = { s, i };
    }
    return mejor?.s ?? null;
}

/** Lo que se sabe de un mensaje para pasárselo a la IA. */
export type MensajeParaAnalizar = {
    fromMe: boolean;
    texto: string | null;
};

/**
 * El texto que se le manda a la IA, o `null` si no hay nada del CLIENTE que
 * leer (solo audios sin transcribir, stickers, imágenes sin pie): sin texto del
 * cliente no hay sentimiento que juzgar, y preguntar sería pagar por nada.
 *
 * Llegan en orden cronológico. Se recorta por DELANTE —lo más viejo—, porque lo
 * que se juzga es cómo está el cliente AHORA.
 */
export function elTextoParaAnalizar(mensajes: readonly MensajeParaAnalizar[]): string | null {
    const lineas = mensajes
        .filter((m) => typeof m.texto === "string" && m.texto.trim())
        .slice(-MENSAJES_DE_CONTEXTO)
        .map((m) => `${m.fromMe ? "Negocio" : "Cliente"}: ${m.texto!.trim().replace(/\s+/g, " ")}`);
    if (!lineas.some((l) => l.startsWith("Cliente:"))) return null;
    while (lineas.length > 1 && lineas.join("\n").length > TOPE_DE_CARACTERES) lineas.shift();
    let texto = lineas.join("\n");
    if (texto.length > TOPE_DE_CARACTERES) texto = texto.slice(texto.length - TOPE_DE_CARACTERES);
    return `Conversación (lo más reciente al final):\n${texto}\n\n¿Cómo se siente el cliente? Responde positivo, neutro o negativo.`;
}

/** Tipos de mensaje que no llevan texto propio (se usa su pie si lo traen). */
const SIN_TEXTO = new Set(["audioMessage", "stickerMessage", "reactionMessage", "call", "protocolMessage"]);

/**
 * El texto de una fila de `chat_messages`: su contenido, o la transcripción de
 * una nota de voz si ya se transcribió. Los marcadores de adjunto («[Imagen]»)
 * no son texto del cliente.
 */
export function elTextoDelMensaje(fila: {
    content?: string | null;
    messageType?: string | null;
    transcripcion?: string | null;
}): string | null {
    const trans = typeof fila.transcripcion === "string" ? fila.transcripcion.trim() : "";
    if (trans) return trans;
    if (fila.messageType && SIN_TEXTO.has(fila.messageType)) return null;
    const c = typeof fila.content === "string" ? fila.content.trim() : "";
    if (!c || /^\[[^\]]{1,30}\]$/.test(c)) return null;
    return c;
}

/**
 * Cuándo está en negativo desde, después de un análisis nuevo.
 *
 * - Sigue negativo: se conserva la fecha de la CAÍDA (la franja cerrada sigue
 *   cerrada, y el reporte no cuenta la misma caída dos veces).
 * - Acaba de caer: la fecha del mensaje que la hizo caer.
 * - No es negativo: `null`.
 */
export function elNegativoDesde(
    antes: { sentimiento: Sentimiento | null; negativoDesde: Date | null },
    ahora: Sentimiento,
    mensajeEn: Date,
): Date | null {
    if (ahora !== "negativo") return null;
    if (antes.sentimiento === "negativo" && antes.negativoDesde) return antes.negativoDesde;
    return mensajeEn;
}

/** Una conversación CAYÓ a negativo si ahora lo es y antes no lo era. */
export function cayoANegativo(antes: Sentimiento | null, ahora: Sentimiento): boolean {
    return ahora === "negativo" && antes !== "negativo";
}

// ── La pantalla ────────────────────────────────────────────────────────────

/**
 * El aro del avatar según el sentimiento. Se tiñe el aro que YA existe
 * (`ring-2`), no se añade nada. Neutro no cambia nada: el aro de siempre.
 *
 * Tonos pastel (`-300`), y las clases van LITERALES: Tailwind solo genera lo
 * que ve escrito, así que un color compuesto en tiempo de ejecución no
 * existiría en el CSS. Con color puesto no se cambia al pasar el ratón: un aro
 * que pierde su color al apuntarlo no marca nada.
 */
export const ANILLO_DEL_SENTIMIENTO: Record<Sentimiento, string> = {
    positivo: "ring-emerald-300 dark:ring-emerald-700",
    neutro: "ring-background group-hover:ring-accent",
    negativo: "ring-red-300 dark:ring-red-700",
};

export function elAnilloDelAvatar(sentimiento: Sentimiento | null | undefined): string {
    return ANILLO_DEL_SENTIMIENTO[sentimiento ?? "neutro"] ?? ANILLO_DEL_SENTIMIENTO.neutro;
}

/** El texto de la franja. Corto: se lee de reojo mientras se escribe. */
export const TEXTO_DE_LA_FRANJA = "El cliente parece molesto";

/** La llave de la conversación en el mapa que viaja con la lista. */
export function llaveDelSentimiento(instanceName: string | null | undefined, jid: string): string {
    return `${instanceName ?? ""}::${jid}`;
}

/** La llave con la que se recuerda que la franja de UNA caída se cerró. */
export function llaveDeLaFranja(
    instanceName: string | null | undefined,
    jid: string,
    negativoDesde: string | null,
): string {
    return `${llaveDelSentimiento(instanceName, jid)}::${negativoDesde ?? ""}`;
}

/**
 * Si la franja se ve: solo en negativo y solo si ESA caída no se cerró. En
 * cuanto el sentimiento mejora se va sola (no es negativo); si vuelve a caer es
 * otra caída —otra fecha, otra llave— y sale otra vez.
 */
export function laFranjaSeVe(
    s: SentimientoDeLaConversacion | null | undefined,
    cerrada: boolean,
): boolean {
    return s?.sentimiento === "negativo" && !cerrada;
}

// ── El reporte ─────────────────────────────────────────────────────────────

export type CaidaDelReporte = {
    dia: string; // YYYY-MM-DD
    asesorId: string | null;
    asesorNombre: string | null;
    cantidad: number;
};

export type ReporteDeSentimiento = {
    /** Un día por fila, con los días sin caídas en cero. */
    porDia: { dia: string; cantidad: number }[];
    /** Un asesor por fila, de más a menos. «Sin asignar» es un asesor más. */
    porAsesor: { asesorId: string | null; nombre: string; cantidad: number }[];
    /** Día × asesor, para ver las tendencias de cada uno. */
    porDiaYAsesor: CaidaDelReporte[];
    total: number;
};

export const SIN_ASIGNAR = "Sin asignar";

/** Los días del período, del más viejo al de hoy, en `YYYY-MM-DD`. */
export function losDiasDelPeriodo(hoy: string, dias: number): string[] {
    const n = Math.max(1, Math.min(366, Math.floor(dias) || 1));
    const [y, m, d] = hoy.split("-").map(Number);
    const base = Date.UTC(y, (m || 1) - 1, d || 1);
    const salida: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        salida.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
    }
    return salida;
}

/** Arma el reporte con las filas de la base (una por día × asesor). */
export function armarElReporte(
    filas: readonly CaidaDelReporte[],
    hoy: string,
    dias: number,
): ReporteDeSentimiento {
    const periodo = losDiasDelPeriodo(hoy, dias);
    const dentro = new Set(periodo);
    const validas = filas.filter((f) => dentro.has(f.dia) && f.cantidad > 0);

    const porDiaMap = new Map(periodo.map((d) => [d, 0]));
    const porAsesorMap = new Map<string, { asesorId: string | null; nombre: string; cantidad: number }>();
    for (const f of validas) {
        porDiaMap.set(f.dia, (porDiaMap.get(f.dia) ?? 0) + f.cantidad);
        const llave = f.asesorId ?? "";
        const prev = porAsesorMap.get(llave);
        if (prev) prev.cantidad += f.cantidad;
        else
            porAsesorMap.set(llave, {
                asesorId: f.asesorId,
                nombre: f.asesorId ? f.asesorNombre?.trim() || "Asesor" : SIN_ASIGNAR,
                cantidad: f.cantidad,
            });
    }
    const porAsesor = [...porAsesorMap.values()].sort(
        (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre),
    );
    const porDia = periodo.map((dia) => ({ dia, cantidad: porDiaMap.get(dia) ?? 0 }));
    return {
        porDia,
        porAsesor,
        porDiaYAsesor: [...validas].sort((a, b) => a.dia.localeCompare(b.dia)),
        total: porDia.reduce((s, d) => s + d.cantidad, 0),
    };
}

/**
 * Si dos mapas de sentimientos dicen lo mismo. La lista vuelve cada 20 s y casi
 * nunca cambia nada: sin esto, cada vuelta pasaría un objeto nuevo a miles de
 * filas memoizadas y las repintaría todas.
 */
export function mismosSentimientos(
    a: Record<string, SentimientoDeLaConversacion>,
    b: Record<string, SentimientoDeLaConversacion>,
): boolean {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) {
        const x = a[k];
        const y = b[k];
        if (!y || x.sentimiento !== y.sentimiento || x.negativoDesde !== y.negativoDesde) return false;
    }
    return true;
}

/** El sentimiento de una conversación, probando cada una de sus identidades. */
export function elSentimientoDe(
    mapa: Record<string, SentimientoDeLaConversacion> | null | undefined,
    instanceName: string | null | undefined,
    jids: readonly (string | null | undefined)[],
): SentimientoDeLaConversacion | null {
    if (!mapa) return null;
    for (const jid of jids) {
        if (!jid) continue;
        const s = mapa[llaveDelSentimiento(instanceName, jid)];
        if (s) return s;
    }
    return null;
}
