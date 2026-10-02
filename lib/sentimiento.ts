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
/** Cuántos de los ÚLTIMOS mensajes del cliente se juzgan como mucho. */
export const MENSAJES_QUE_SE_JUZGAN = 5;
/**
 * Cuántas líneas ANTERIORES se le enseñan a la IA como contexto: solo la
 * última respuesta del negocio, que es lo que dice a qué contesta el cliente.
 * Medido en producción: con ocho líneas de contexto, una queja de hace días
 * teñía el «no gracias» de hoy aunque la instrucción dijera «no lo juzgues»;
 * aislados, los mismos mensajes salían neutro.
 */
export const LINEAS_DE_CONTEXTO = 1;

/**
 * La versión de la calibración. Sube cada vez que cambia CÓMO se clasifica
 * (la instrucción, lo que se juzga): las conversaciones que quedaron en
 * `negativo` con una versión anterior se vuelven a analizar una vez, y
 * mientras tanto no pintan la franja (`elSentimientoQueSeEnsena`).
 *
 * - 1 (sin columna): la primera, que marcaba «molesto» a quien solo daba un
 *   dato, decía «no gracias» o cambiaba de opinión. Medido en producción el
 *   2026-10-02: de 711 negativos, la mayoría eran así.
 * - 2: la instrucción define «negativo» como molestia DIRIGIDA al negocio y
 *   solo se juzgan los últimos mensajes del cliente; lo anterior es contexto.
 */
export const VERSION_DE_LA_CALIBRACION = 2;

/**
 * Lo que se le pide a la IA. La calibración vive aquí y en ningún otro sitio.
 *
 * El fallo que corrige: «negativo» se describía con «se queja, reclama, expresa
 * decepción», y la IA lo leía en cualquier mensaje con un «no» —«no gracias»,
 * «ya no», «no hay disponibilidad», «tomé otra alternativa»— o en una mala
 * noticia del cliente que no va contra nadie («tuve un accidente»). Y juzgaba
 * la conversación ENTERA: una queja de hace diez mensajes teñía el «buenos
 * días» de hoy, y hasta una disculpa del negocio («lamento que…») contaba como
 * señal de que el cliente estaba molesto.
 *
 * Ahora: la mayoría de los mensajes son NEUTROS por definición (dar datos,
 * preguntar, contestar, rechazar con educación), «negativo» exige una emoción
 * de molestia dirigida al negocio, y la IA solo juzga los últimos mensajes del
 * cliente —lo demás le llega marcado como contexto—.
 */
export const INSTRUCCION_DEL_SENTIMIENTO = `Eres un analista de atención al cliente. Lees un trozo de una conversación de WhatsApp entre un negocio y su cliente y clasificas la EMOCIÓN del cliente en sus ÚLTIMOS mensajes (los que vienen marcados para juzgar). Lo anterior es solo contexto: no lo juzgues. Los mensajes del negocio nunca deciden la emoción del cliente.

Responde con UNA sola palabra, sin nada más: positivo, neutro o negativo.

- neutro (la gran mayoría de los mensajes): el cliente da información o datos (nombre, número, ciudad, dirección, fechas, su situación), pregunta (precios, horarios, disponibilidad, cómo funciona), contesta lo que se le preguntó, saluda, confirma, envía un archivo, pide algo —aunque sea con prisa, en mayúsculas o repitiendo la pregunta («SU PRECIO POR FAVOR», «¿cuándo llega?»)—, opina sobre el precio («muy caro», «está caro, gracias»), dice que no le interesa, que ya no quiere, que lo pensará o que no puede ahora —aunque diga «no»—, se disculpa, o cuenta un problema, una falla técnica o una mala noticia SIN enojarse con el negocio («no tengo señal», «no me llegó el código», «no lo pudieron atender», «me hace falta para mi trabajo»).
- positivo: agradece de forma expresa, se muestra contento, entusiasmado o satisfecho, elogia el servicio o confirma una compra con gusto.
- negativo: SOLO si el cliente expresa de forma clara y explícita molestia, enojo o frustración CONTRA el negocio o su servicio: reclama con enojo por un mal servicio, una demora o un incumplimiento («llevo un año esperando y nunca llegó», «nadie me responde», «prometen y no cumplen»), acusa o dice que lo engañaron («es una estafa», «me enviaron otra cosa»), insulta, se burla o es sarcástico, amenaza con irse o denunciar, o reclama con exasperación que no lo atienden o no lo leen.

Rechazar una oferta, decir «no», objetar el precio o no estar interesado NO es negativo. Contar un problema o una falla sin molestia contra el negocio NO es negativo. Pedir algo con urgencia NO es negativo. Ante la duda, responde neutro.

Ejemplos:
«no gracias» → neutro
«ya no quiero nada» → neutro
«me parece muy caro» → neutro
«no tengo señal» → neutro
«SU PRECIO POR FAVOR, URGENTE» → neutro
«mi nombre es Ana, vivo en Lima» → neutro
«¿ya me tienen alguna respuesta?» → neutro
«muchas gracias, quedó perfecto» → positivo
«llevo un año esperando y nunca me lo entregaron» → negativo
«¿ustedes no leen? por tercera vez le digo» → negativo
«prometen y no cumplen, son unos estafadores» → negativo`;

/**
 * Lee lo que contestó la IA. Se queda con la PRIMERA de las tres palabras que
 * aparezca, sin acentos ni mayúsculas. Lo que no se entiende es `null` —«no se
 * pudo clasificar»—, NUNCA `neutro`: inventar un neutro borraría un negativo que
 * sí estaba, y la franja de alerta se iría sola sin que el cliente haya mejorado.
 *
 * Una palabra NEGADA no cuenta: «No es negativo, es neutro» es neutro. Antes
 * ganaba la primera que apareciera y esa respuesta salía como negativo.
 */
export function leerElSentimiento(respuesta: unknown): Sentimiento | null {
    if (typeof respuesta !== "string") return null;
    const limpio = respuesta
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\bno\s+(?:es\s+|son\s+|esta\s+|parece\s+|)(?:muy\s+)?(?:positivo|neutro|negativo)\b/g, " ");
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

function comoLinea(m: MensajeParaAnalizar): string {
    return `${m.fromMe ? "Negocio" : "Cliente"}: ${m.texto!.trim().replace(/\s+/g, " ")}`;
}

function conTexto(m: MensajeParaAnalizar): boolean {
    return typeof m.texto === "string" && m.texto.trim().length > 0;
}

/**
 * Lo que se JUZGA: los últimos mensajes del cliente, los que vienen después
 * de la última respuesta del negocio (con texto, como mucho
 * `MENSAJES_QUE_SE_JUZGAN`). Llegan en orden cronológico.
 *
 * Si ese último tramo del cliente no trae ni un texto —un audio sin
 * transcribir, una imagen sin pie— no hay nada NUEVO que juzgar: `[]`, y quien
 * llama conserva lo que había. Juzgar otra vez lo de antes es justo lo que
 * hacía que una queja vieja tiñera el mensaje de hoy.
 */
export function losMensajesQueSeJuzgan(mensajes: readonly MensajeParaAnalizar[]): MensajeParaAnalizar[] {
    let i = mensajes.length;
    while (i > 0 && !mensajes[i - 1].fromMe) i--;
    return mensajes.slice(i).filter(conTexto).slice(-MENSAJES_QUE_SE_JUZGAN);
}

/**
 * El texto que se le manda a la IA, o `null` si no hay nada NUEVO del cliente
 * que juzgar (ver `losMensajesQueSeJuzgan`): sin eso no hay sentimiento que
 * leer, y preguntar sería pagar por nada.
 *
 * Son dos bloques: el CONTEXTO —lo anterior, para entender de qué se habla— y
 * lo que se JUZGA. El contexto se recorta por DELANTE —lo más viejo— para no
 * pasar de `TOPE_DE_CARACTERES`; lo que se juzga no se recorta salvo que solo
 * eso ya pase del tope.
 */
export function elTextoParaAnalizar(mensajes: readonly MensajeParaAnalizar[]): string | null {
    const juzgar = losMensajesQueSeJuzgan(mensajes);
    if (!juzgar.length) return null;
    let i = mensajes.length;
    while (i > 0 && !mensajes[i - 1].fromMe) i--;
    const antes = mensajes.slice(0, i).filter(conTexto).slice(-LINEAS_DE_CONTEXTO).map(comoLinea);

    let juzgado = juzgar.map(comoLinea).join("\n");
    if (juzgado.length > TOPE_DE_CARACTERES) juzgado = juzgado.slice(juzgado.length - TOPE_DE_CARACTERES);
    const sitio = TOPE_DE_CARACTERES - juzgado.length;
    while (antes.length && antes.join("\n").length > sitio) antes.shift();

    const contexto = antes.length
        ? `Contexto (mensajes anteriores, NO los juzgues):\n${antes.join("\n")}\n\n`
        : "";
    return `${contexto}Últimos mensajes del cliente (JUZGA SOLO ESTOS):\n${juzgado}\n\n¿Qué emoción expresa el cliente en estos últimos mensajes? Responde positivo, neutro o negativo.`;
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
 * (`ring-2`), no se añade nada. **Los tres se ven**: verde, gris y rojo.
 *
 * El neutro era `ring-background`, o sea **el color del FONDO**: en claro un aro
 * blanco sobre blanco y en oscuro uno negro sobre negro. Una conversación neutra
 * se veía exactamente igual que una sin ningún color, y el reporte «hay
 * avatares sin color aunque abrí Chats varias veces» salía de ahí. El gris es un
 * tono con contraste propio contra el fondo en los DOS temas, al menos el de sus
 * vecinos verde y rojo (lo mide el banco, `scripts/banco-sentimiento.sh`).
 *
 * Tonos pastel en claro y de peso medio en oscuro, y las clases van LITERALES:
 * Tailwind solo genera lo que ve escrito, así que un color compuesto en tiempo
 * de ejecución no existiría en el CSS. Ninguno cambia al pasar el ratón: un aro
 * que pierde su color al apuntarlo no marca nada.
 */
export const ANILLO_DEL_SENTIMIENTO: Record<Sentimiento, string> = {
    positivo: "ring-emerald-300 dark:ring-emerald-700",
    neutro: "ring-slate-400 dark:ring-slate-500",
    negativo: "ring-red-300 dark:ring-red-700",
};

/**
 * Sin sentimiento conocido —aún no analizada, sin un solo mensaje del cliente
 * que juzgar, o su cuenta sin créditos— se pinta el NEUTRO: nada dice que el
 * cliente esté contento ni molesto. Así ningún avatar de la lista se queda sin
 * color; quien quiera saber si ya se analizó lo lee en `data-sentimiento`.
 */
export function elAnilloDelAvatar(sentimiento: Sentimiento | "apagado" | null | undefined): string {
    if (sentimiento === "apagado") return ANILLO_SIN_SENTIMIENTO;
    return ANILLO_DEL_SENTIMIENTO[sentimiento ?? "neutro"] ?? ANILLO_DEL_SENTIMIENTO.neutro;
}

/**
 * El aro de una conversación cuya cuenta tiene la función APAGADA: el de antes
 * de que existiera el sentimiento, del color del fondo. No dice nada, que es lo
 * correcto: la cuenta no pidió que se juzgara a nadie.
 */
export const ANILLO_SIN_SENTIMIENTO = "ring-background";

/**
 * La función de sentimiento es de la CUENTA y nace APAGADA. Sin fila en
 * `sentimiento_ajustes` —todas las cuentas que existían antes de esto, y toda
 * cuenta nueva— está apagada: ni se analiza, ni se cobra, ni se pinta, ni sale
 * en el reporte.
 */
export const SENTIMIENTO_POR_DEFECTO = { activa: false } as const;

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
    /** Ninguna de las cuentas consultadas tiene la función encendida. */
    apagado?: boolean;
};

/** Lo que dice el reporte cuando la función está apagada en todas las cuentas. */
export const REPORTE_APAGADO =
    "El análisis de sentimiento está apagado. Lo enciende el dueño de la cuenta en Perfil › Comportamiento.";

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
