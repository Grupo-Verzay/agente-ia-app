/**
 * El guion que sigue Verzy en la videollamada con IA, editable por CUENTA en
 * Entrenamiento › Agente IA › Videollamadas. Puro: lo usan la pantalla, la
 * acción y el armado del contexto de Tavus (`elContexto`).
 *
 * En Tavus solo queda lo técnico (voz, cara, réplica); lo que DICE Verzy sale
 * de aquí. Una sección vacía cae en la de fábrica: el guion nunca sale cojo.
 *
 * Variables que se sustituyen al armar el contexto: {saludo},
 * {segunda_pregunta}, {tomar_nota} y {agendar} (nombres de las herramientas).
 */

import { SALUDO_INICIAL, SEGUNDA_PREGUNTA } from "@/lib/videollamada-crm";

export const SALUDO_DE_FABRICA = SALUDO_INICIAL;
export const SEGUNDA_PREGUNTA_DE_FABRICA = SEGUNDA_PREGUNTA;

export const SECCIONES_DEL_GUION = [
    { clave: "apertura", titulo: "Apertura", ayuda: "Cómo saluda Verzy y abre la conversación." },
    { clave: "diagnostico", titulo: "Diagnóstico", ayuda: "Las preguntas para entender qué necesita el cliente." },
    { clave: "ubicar", titulo: "Ubicar situación", ayuda: "Cómo resume y confirma lo que entendió, y qué apunta." },
    { clave: "oferta", titulo: "Oferta", ayuda: "Cómo presenta el plan o servicio que lo resuelve." },
    { clave: "cierre", titulo: "Cierre", ayuda: "Cómo pide el sí y deja agendado el siguiente paso." },
    { clave: "objeciones", titulo: "Objeciones", ayuda: "Qué responde ante cada objeción." },
    { clave: "reglas", titulo: "Reglas generales", ayuda: "Lo que Verzy siempre hace o nunca hace." },
] as const;

export type ClaveDelGuion = (typeof SECCIONES_DEL_GUION)[number]["clave"];

export type GuionDeVideollamada = {
    /** Lo primero que dice Verzy al entrar (también lo que dice la sala si calla). */
    saludo: string;
    secciones: Record<ClaveDelGuion, string>;
};

export const TOPE_DEL_SALUDO = 200;
export const TOPE_DE_UNA_SECCION = 4000;

export const GUION_DE_FABRICA: GuionDeVideollamada = {
    saludo: SALUDO_DE_FABRICA,
    secciones: {
        apertura:
            "El saludo «{saludo}» lo dice la sala por ti al entrar: no lo repitas. Si el cliente habla antes que tú, respóndele con ese mismo saludo.",
        diagnostico:
            "Cuando confirme que te escucha, haz la segunda pregunta: «{segunda_pregunta}». No compartas pantalla todavía. Escucha antes de vender.",
        ubicar:
            "Solo después de que responda: abre su ficha (ficha) y apunta con {tomar_nota} lo que quiere resolver. Repite en una o dos frases lo que te contó y confirma que lo entendiste bien.",
        oferta:
            "Dile qué le está costando hoy y qué plan de Verzay lo resuelve, y por qué ese y no otro.",
        cierre:
            "Cierre suave, UNA sola vez: pregunta si quiere empezar con ese plan. No insistas más de una vez.\n" +
            "Si no está listo, ofrece una alternativa de bajo riesgo: empezar con el plan más pequeño, o hablar otro día.\n" +
            "Antes de despedirte, confirma una fecha y una hora concretas y déjalo agendado con {agendar} (cita, recordatorio o llamada). Calcula la fecha a partir de la de hoy y repítesela al cliente.",
        objeciones:
            "«Es caro»: compáralo con lo que pierde hoy en mensajes sin responder y ventas que se enfrían; ofrece el plan más pequeño.\n" +
            "«Tengo que consultarlo con mi socio»: ofrece enviarle la información por WhatsApp y agendar una llamada con los dos.",
        reglas: "Una idea por frase y una pregunta a la vez. Nunca digas direcciones web en voz alta.",
    },
};

function comoTexto(valor: unknown, tope: number): string {
    return typeof valor === "string" ? valor.replace(/\r\n/g, "\n").trim().slice(0, tope) : "";
}

/** Lo que llega del navegador o de la base, saneado. Lo vacío se guarda vacío (= de fábrica al usarse). */
export function comoGuion(valor: unknown): GuionDeVideollamada {
    const v = (valor && typeof valor === "object" ? valor : {}) as { saludo?: unknown; secciones?: unknown };
    const s = (v.secciones && typeof v.secciones === "object" ? v.secciones : {}) as Record<string, unknown>;
    const secciones = {} as Record<ClaveDelGuion, string>;
    for (const { clave } of SECCIONES_DEL_GUION) secciones[clave] = comoTexto(s[clave], TOPE_DE_UNA_SECCION);
    return { saludo: comoTexto(v.saludo, TOPE_DEL_SALUDO).replace(/\s+/g, " "), secciones };
}

/** El guion que se usa: lo guardado, y lo vacío de fábrica, sección por sección. */
export function elGuionQueSeUsa(guardado: GuionDeVideollamada | null | undefined): GuionDeVideollamada {
    const g = comoGuion(guardado ?? {});
    const secciones = {} as Record<ClaveDelGuion, string>;
    for (const { clave } of SECCIONES_DEL_GUION) secciones[clave] = g.secciones[clave] || GUION_DE_FABRICA.secciones[clave];
    return { saludo: g.saludo || GUION_DE_FABRICA.saludo, secciones };
}

/** ¿Está todo de fábrica? (guardar así borra la fila). */
export function esElDeFabrica(guion: GuionDeVideollamada): boolean {
    const g = elGuionQueSeUsa(guion);
    return (
        g.saludo === GUION_DE_FABRICA.saludo &&
        SECCIONES_DEL_GUION.every(({ clave }) => g.secciones[clave] === GUION_DE_FABRICA.secciones[clave])
    );
}

export type Herramientas = { tomarNota: string; agendar: string };

function conVariables(texto: string, saludo: string, h: Herramientas): string {
    return texto
        .replace(/\{saludo\}/g, saludo)
        .replace(/\{segunda_pregunta\}/g, SEGUNDA_PREGUNTA_DE_FABRICA)
        .replace(/\{tomar_nota\}/g, h.tomarNota)
        .replace(/\{agendar\}/g, h.agendar);
}

/** El bloque «GUION DE LA LLAMADA» que va en el contexto de Tavus. */
export function elBloqueDelGuionDe(
    guardado: GuionDeVideollamada | null | undefined,
    ahora: string,
    herramientas: Herramientas,
): string {
    const g = elGuionQueSeUsa(guardado);
    const lineas = ["GUION DE LA LLAMADA", `Ahora mismo son: ${ahora} (hora del negocio).`];
    SECCIONES_DEL_GUION.forEach(({ clave, titulo }, i) => {
        const texto = conVariables(g.secciones[clave], g.saludo, herramientas)
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => `   - ${l}`)
            .join("\n");
        lineas.push(`${i + 1}. ${titulo}:\n${texto}`);
    });
    return lineas.join("\n");
}
