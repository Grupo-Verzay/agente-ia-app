import { EMPRESA_POR_DEFECTO } from "@/lib/nombre-de-la-cuenta";

/**
 * La ENCUESTA DE SATISFACCIÓN (NPS): lo que se decide sin tocar la base.
 *
 * Al resolver una conversación —si la cuenta lo tiene encendido— se le manda al
 * cliente UNA pregunta: del 1 al 10, qué tan probable es que recomiende el
 * negocio. Lo que conteste queda guardado en su ficha y sale en Analíticas del
 * CRM como NPS: promotores (9-10), pasivos (7-8) y detractores (1-6).
 *
 * Todo lo que es una REGLA vive aquí, puro y probado: qué respuesta cuenta como
 * puntuación, en qué grupo cae y cómo se calcula el número. Escrito en la
 * pantalla y en el servidor por separado, el día que se afine uno el otro diría
 * otra cosa, y un NPS que no cuadra con las respuestas no se lee como un fallo:
 * se lee como un dato.
 */

/** Apagada hasta que la cuenta la encienda: nadie recibe una encuesta que no pidió. */
export const ENCUESTA_POR_DEFECTO = { activa: false } as const;

export type AjustesDeLaEncuesta = { activa: boolean };

/**
 * Cuánto se espera una respuesta. Pasado esto la encuesta se cierra como «sin
 * respuesta»: un «8» que llega un mes después ya no contesta a esta pregunta,
 * contesta a otra cosa.
 */
export const DIAS_PARA_RESPONDER = 7;

/**
 * Una conversación no recibe otra encuesta mientras la anterior tenga menos de
 * esto. Resolver, reabrir y volver a resolver el mismo día —que pasa— le
 * mandaría la misma pregunta tres veces al mismo cliente, y eso es justo lo que
 * enseña a no contestarla.
 */
export const DIAS_ENTRE_ENCUESTAS = 7;

/**
 * Cuántos mensajes del cliente se miran detrás de la pregunta. El primero que
 * traiga una puntuación válida manda; si en estos no hay ninguna, lo que siga es
 * conversación y no respuesta.
 */
export const MENSAJES_QUE_SE_MIRAN = 3;

export const ESTADOS_DE_LA_ENCUESTA = [
    "pendiente",
    "enviada",
    "respondida",
    "sin_respuesta",
    "fallida",
] as const;
export type EstadoDeLaEncuesta = (typeof ESTADOS_DE_LA_ENCUESTA)[number];

/**
 * El mensaje. Corto a propósito: una pregunta, la escala y cómo contestar. Con
 * el nombre del negocio solo si la cuenta lo tiene puesto de verdad —«Empresa
 * Demo» es lo que nace por defecto, y preguntar si recomiendan a «Empresa Demo»
 * es peor que no nombrar a nadie—.
 */
export function elMensajeDeLaEncuesta(negocio?: string | null): string {
    const nombre = String(negocio ?? "").trim();
    const recomendar = nombre ? `recomiendes a ${nombre}` : "nos recomiendes";
    return [
        "¡Gracias por escribirnos! 🙌",
        `Del 1 al 10, ¿qué tan probable es que ${recomendar} a un amigo o familiar?`,
        "Responde solo con el número.",
    ].join("\n\n");
}

/**
 * El nombre del negocio para el mensaje: la empresa si de verdad se rellenó, y
 * si no, ninguno. NO cae en el nombre de la persona ni en el correo, como hace
 * `nombreDeLaCuenta`: preguntarle a un cliente si recomendaría a «carlos@…» es
 * peor que no nombrar a nadie. Lo usan el envío y la vista previa del ajuste,
 * que así enseñan exactamente el mismo texto.
 */
export function elNegocioDeLaCuenta(company: string | null | undefined): string | null {
    const empresa = String(company ?? "").trim();
    return empresa && empresa !== EMPRESA_POR_DEFECTO ? empresa : null;
}

const PALABRAS: Record<string, number> = {
    uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** Hasta dónde un mensaje es «una respuesta» y no una conversación con un número dentro. */
const LARGO_MAXIMO = 40;
/** Cuántas palabras pueden acompañar al número: «le doy un 9», «10 excelente servicio». */
const PALABRAS_QUE_ACOMPANAN = 3;

function sinAcentos(texto: string): string {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * La puntuación que trae un mensaje, o `null`.
 *
 * Tiene que ser **inequívoca**, porque lo que se guarde sale en un NPS:
 *
 * - un solo número y del 1 al 10 —«8», «le doy un 9», «10/10», «9 de 10»—;
 * - dos números distintos no son una respuesta («entre 7 y 8», «7 u 8»);
 * - fuera de la escala tampoco («0», «15», un teléfono), ni con decimales;
 * - en letra («ocho») solo si es LO ÚNICO que dice el mensaje: «uno de ustedes
 *   me dijo» o «una pregunta» no son un 1;
 * - y un mensaje largo, o con más de tres palabras alrededor del número, es
 *   conversación: «necesito que me envíen 3 cajas» no es un 3.
 *
 * Equivocarse hacia «no es una puntuación» cuesta una respuesta sin contar;
 * equivocarse hacia el otro lado mete un número falso en el NPS de un asesor.
 */
export function laPuntuacionDelTexto(texto: string | null | undefined): number | null {
    const crudo = String(texto ?? "").trim();
    if (!crudo || crudo.length > LARGO_MAXIMO) return null;

    const limpio = sinAcentos(crudo.toLowerCase())
        // «10/10», «9 de 10», «8 sobre 10»: la escala no es otro número.
        .replace(/(\d{1,3})\s*(?:\/|de|sobre)\s*10\b/g, "$1");

    const cifras = limpio.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const palabras = limpio.split(/[^a-zñ]+/).filter(Boolean);

    if (cifras.length > 0) {
        if (cifras.some((c) => /[.,]/.test(c))) return null;
        if (palabras.length > PALABRAS_QUE_ACOMPANAN) return null;
        const distintas = new Set(cifras.map(Number));
        if (distintas.size !== 1) return null;
        const [n] = Array.from(distintas);
        return n >= 1 && n <= 10 ? n : null;
    }

    if (palabras.length === 1 && palabras[0] in PALABRAS) return PALABRAS[palabras[0]];
    return null;
}

export type CategoriaNps = "promotor" | "pasivo" | "detractor";

/** 9-10 promotor, 7-8 pasivo, 1-6 detractor. Lo mismo en la ficha y en el CRM. */
export function laCategoria(puntuacion: number): CategoriaNps {
    if (puntuacion >= 9) return "promotor";
    if (puntuacion >= 7) return "pasivo";
    return "detractor";
}

export const NOMBRE_DE_LA_CATEGORIA: Record<CategoriaNps, string> = {
    promotor: "Promotor",
    pasivo: "Pasivo",
    detractor: "Detractor",
};

/** Colores literales: Tailwind solo genera lo que ve escrito. */
export const COLOR_DE_LA_CATEGORIA: Record<CategoriaNps, string> = {
    promotor: "#22C55E",
    pasivo: "#F59E0B",
    detractor: "#EF4444",
};

export type ResumenNps = {
    respuestas: number;
    promotores: number;
    pasivos: number;
    detractores: number;
    /** De -100 a 100. `null` sin respuestas: un NPS de 0 sobre nada diría «neutro». */
    nps: number | null;
};

export function elResumenNps(puntuaciones: readonly number[]): ResumenNps {
    let promotores = 0;
    let pasivos = 0;
    let detractores = 0;
    for (const p of puntuaciones) {
        const c = laCategoria(p);
        if (c === "promotor") promotores++;
        else if (c === "pasivo") pasivos++;
        else detractores++;
    }
    const respuestas = promotores + pasivos + detractores;
    const nps = respuestas === 0
        ? null
        : Math.round(((promotores - detractores) / respuestas) * 100);
    return { respuestas, promotores, pasivos, detractores, nps };
}

export type ResumenNpsDelAsesor = ResumenNps & { asesorId: string | null };

/**
 * El mismo cálculo, partido por el asesor que tenía la conversación al
 * resolverla. `null` son las que no tenía nadie —la atendió la IA—, que es un
 * grupo más y no se esconde: sin él, el total no cuadra con la suma de filas.
 * Ordenado por respuestas, las que más pesan arriba.
 */
export function elNpsPorAsesor(
    filas: readonly { asesorId: string | null; puntuacion: number }[],
): ResumenNpsDelAsesor[] {
    const grupos = new Map<string | null, number[]>();
    for (const f of filas) {
        const clave = f.asesorId || null;
        const lista = grupos.get(clave) ?? [];
        lista.push(f.puntuacion);
        grupos.set(clave, lista);
    }
    return Array.from(grupos.entries())
        .map(([asesorId, lista]) => ({ asesorId, ...elResumenNps(lista) }))
        .sort((a, b) => b.respuestas - a.respuestas);
}

/**
 * La primera puntuación válida entre los mensajes del cliente detrás de la
 * pregunta, en orden. Solo se miran los `MENSAJES_QUE_SE_MIRAN` primeros.
 */
export function laRespuestaEntreLosMensajes<T extends { texto: string | null; cuando: Date }>(
    mensajes: readonly T[],
): { puntuacion: number; cuando: Date } | null {
    const ordenados = [...mensajes]
        .sort((a, b) => a.cuando.getTime() - b.cuando.getTime())
        .slice(0, MENSAJES_QUE_SE_MIRAN);
    for (const m of ordenados) {
        const p = laPuntuacionDelTexto(m.texto);
        if (p !== null) return { puntuacion: p, cuando: m.cuando };
    }
    return null;
}
