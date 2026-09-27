/**
 * La CALIDAD de una conversación: la rúbrica, los tiempos y el puntaje.
 *
 * Puro a propósito. Lo que decide cuánto vale una conversación —qué se mide,
 * cómo se pondera y qué se marca como ejemplo a mejorar— tiene que poder
 * probarse sin base y sin IA, y es lo que el banco ejerce con casos concretos.
 * La IA solo contesta TRES preguntas de la rúbrica (saludo, tono y si se
 * resolvió); los TIEMPOS no se le preguntan: se miden, porque un modelo que
 * «calcula» minutos se los inventa.
 *
 * # La rúbrica básica
 *
 * | criterio | quién lo decide | peso |
 * | --- | --- | --- |
 * | saludo | la IA (0–100) | 15 |
 * | tiempo de primera respuesta | medido | 15 |
 * | tiempo de resolución | medido | 10 |
 * | tono del asesor | la IA (0–100) | 25 |
 * | resolvió la consulta | la IA (sí / parcial / no) | 35 |
 *
 * **Un criterio que no se puede medir no cuenta cero: se saca de la cuenta**
 * y los pesos se reparten entre los demás. Una conversación que no se resolvió
 * todavía no tiene tiempo de resolución, y darle cero por eso la castigaría por
 * algo que no ha pasado. Es la regla de siempre: un número que no se puede
 * calcular no se sustituye por otro.
 */

export type Resolvio = "si" | "parcial" | "no";

/** Quién respondió la conversación, que es a quién se le atribuye la nota. */
export type Responsable = "asesor" | "ia" | "sin_asignar";

export interface MensajeParaMedir {
    /** Segundos desde 1970. */
    ts: number;
    /** `true` si lo escribió la cuenta (asesor o IA). */
    deLaCuenta: boolean;
    /** `true` si lo escribió el Agente IA. */
    porIa: boolean;
    texto: string;
}

export const PESOS = {
    saludo: 15,
    primeraRespuesta: 15,
    resolucion: 10,
    tono: 25,
    resolvio: 35,
} as const;

/** Por debajo de esto la conversación sale como ejemplo de qué mejorar. */
export const UMBRAL_A_MEJORAR = 60;

/** Cuántos mensajes (los más recientes) se le enseñan a la IA. */
export const MENSAJES_A_EVALUAR = 60;
/** Y como mucho cuántos caracteres: se recorta por el PRINCIPIO. */
export const CARACTERES_A_EVALUAR = 8000;

/**
 * Cuántos días hacia atrás mira una evaluación. Es la ventana del reporte
 * semanal, que es el corte automático: lo que entró en la semana.
 *
 * **No hay reposo.** La evaluación ya no corre sola en cuanto una conversación
 * lleva un rato callada: corre cuando alguien pulsa «Evaluar ahora» y en el
 * corte semanal del reporte. Lo que se evaluó a medias se vuelve a evaluar en
 * el siguiente corte si entraron mensajes nuevos (una fila por conversación, que
 * se reescribe), así que no cuenta dos veces.
 */
export const DIAS_QUE_SE_EVALUAN = 7;

/** Tope de conversaciones evaluadas por cuenta y vuelta: son créditos. */
export const TOPE_POR_CUENTA_Y_VUELTA = 25;

export interface TiemposMedidos {
    /** Cuándo escribió el contacto por primera vez en lo evaluado. */
    primerEntranteTs: number | null;
    /** Segundos hasta la primera respuesta de quien la atendió; `null` si no la hubo. */
    primeraRespuestaSeg: number | null;
    /** Segundos hasta resolverse; `null` si no se sabe que se resolvió. */
    resolucionSeg: number | null;
    responsable: Responsable;
    mensajesDelContacto: number;
    mensajesDeLaCuenta: number;
}

/**
 * Los tiempos, medidos sobre los mensajes.
 *
 * - **Primera respuesta** es desde el primer mensaje del contacto hasta la
 *   primera respuesta de quien la atendió: la de una PERSONA si la
 *   conversación tiene asesor, la de la IA si solo contestó ella. Contar la
 *   respuesta instantánea de la IA a nombre de un asesor que tardó una hora
 *   sería regalarle el número.
 * - **Resolución** es desde ese primer mensaje hasta que se marcó resuelta
 *   (`resueltaEnTs`). Si no está marcada pero la IA dice que se resolvió, hasta
 *   el último mensaje de la cuenta. Si no, `null`.
 */
export function medirTiempos(
    mensajes: MensajeParaMedir[],
    opciones: { tieneAsesor: boolean; resueltaEnTs?: number | null; resolvioSegunLaIa?: Resolvio | null },
): TiemposMedidos {
    const orden = mensajes.filter((m) => Number.isFinite(m.ts) && m.ts > 0).slice().sort((a, b) => a.ts - b.ts);
    const delContacto = orden.filter((m) => !m.deLaCuenta);
    const deLaCuenta = orden.filter((m) => m.deLaCuenta);
    const hayPersona = deLaCuenta.some((m) => !m.porIa);
    // Con asesor asignado, la nota es suya. Sin asignar pero con una persona
    // contestando, cae en «sin asignar». Y si solo contestó la IA, es de la IA.
    const responsable: Responsable = opciones.tieneAsesor
        ? "asesor"
        : hayPersona
          ? "sin_asignar"
          : deLaCuenta.length > 0
            ? "ia"
            : "sin_asignar";

    const primerEntrante = delContacto[0]?.ts ?? null;
    let primeraRespuestaSeg: number | null = null;
    if (primerEntrante !== null) {
        const cuenta = responsable === "ia" ? (m: MensajeParaMedir) => m.porIa : (m: MensajeParaMedir) => !m.porIa;
        const respuesta = deLaCuenta.find((m) => m.ts >= primerEntrante && cuenta(m));
        if (respuesta) primeraRespuestaSeg = Math.max(0, Math.round(respuesta.ts - primerEntrante));
    }

    let resolucionSeg: number | null = null;
    if (primerEntrante !== null) {
        const resuelta = opciones.resueltaEnTs ?? null;
        if (resuelta !== null && resuelta >= primerEntrante) {
            resolucionSeg = Math.round(resuelta - primerEntrante);
        } else if (opciones.resolvioSegunLaIa === "si") {
            const ultima = deLaCuenta.at(-1)?.ts ?? null;
            if (ultima !== null && ultima >= primerEntrante) resolucionSeg = Math.round(ultima - primerEntrante);
        }
    }

    return {
        primerEntranteTs: primerEntrante,
        primeraRespuestaSeg,
        resolucionSeg,
        responsable,
        mensajesDelContacto: delContacto.length,
        mensajesDeLaCuenta: deLaCuenta.length,
    };
}

/** Si una conversación tiene con qué evaluarse: alguien preguntó y alguien contestó. */
export function sePuedeEvaluar(t: Pick<TiemposMedidos, "mensajesDelContacto" | "mensajesDeLaCuenta">): boolean {
    return t.mensajesDelContacto > 0 && t.mensajesDeLaCuenta > 0;
}

/** Nota de 0 a 100 de la primera respuesta. */
export function notaDePrimeraRespuesta(seg: number): number {
    if (seg <= 5 * 60) return 100;
    if (seg <= 30 * 60) return 70;
    if (seg <= 2 * 60 * 60) return 40;
    return 10;
}

/** Nota de 0 a 100 de la resolución. */
export function notaDeResolucion(seg: number): number {
    if (seg <= 60 * 60) return 100;
    if (seg <= 24 * 60 * 60) return 60;
    return 20;
}

export function notaDeResolvio(r: Resolvio): number {
    return r === "si" ? 100 : r === "parcial" ? 50 : 0;
}

export interface EvaluacionDeLaIa {
    saludo: number | null;
    tono: number | null;
    resolvio: Resolvio | null;
    /** Una o dos frases: qué habría que hacer distinto. */
    mejora: string;
}

/**
 * El puntaje final, de 0 a 100, repartiendo los pesos entre lo que SÍ se pudo
 * medir. Sin ningún criterio medible devuelve `null`, nunca cero.
 */
export function calcularPuntaje(ia: EvaluacionDeLaIa, t: Pick<TiemposMedidos, "primeraRespuestaSeg" | "resolucionSeg">): number | null {
    const partes: { peso: number; nota: number }[] = [];
    if (ia.saludo !== null) partes.push({ peso: PESOS.saludo, nota: ia.saludo });
    if (ia.tono !== null) partes.push({ peso: PESOS.tono, nota: ia.tono });
    if (ia.resolvio !== null) partes.push({ peso: PESOS.resolvio, nota: notaDeResolvio(ia.resolvio) });
    if (t.primeraRespuestaSeg !== null) partes.push({ peso: PESOS.primeraRespuesta, nota: notaDePrimeraRespuesta(t.primeraRespuestaSeg) });
    if (t.resolucionSeg !== null) partes.push({ peso: PESOS.resolucion, nota: notaDeResolucion(t.resolucionSeg) });
    const pesoTotal = partes.reduce((s, p) => s + p.peso, 0);
    if (pesoTotal === 0) return null;
    return Math.round(partes.reduce((s, p) => s + p.peso * p.nota, 0) / pesoTotal);
}

export function esEjemploAMejorar(puntaje: number | null): boolean {
    return puntaje !== null && puntaje < UMBRAL_A_MEJORAR;
}

function comoNota(v: unknown): number | null {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function comoResolvio(v: unknown): Resolvio | null {
    const t = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (["si", "yes", "true", "resuelto", "resolvio"].includes(t)) return "si";
    if (["parcial", "parcialmente", "partial"].includes(t)) return "parcial";
    if (["no", "false", "no resuelto"].includes(t)) return "no";
    return null;
}

/**
 * Leer lo que contestó la IA. Se le pide JSON, pero **no se da por bueno**:
 * puede venir entre ```json, con texto alrededor, con números como cadena o
 * fuera de rango. Lo que no se entiende queda en `null` —el criterio se saca
 * de la cuenta— y nunca en un cero inventado.
 */
export function leerLaEvaluacionDeLaIa(texto: string): EvaluacionDeLaIa {
    const vacia: EvaluacionDeLaIa = { saludo: null, tono: null, resolvio: null, mejora: "" };
    if (!texto) return vacia;
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio < 0 || fin <= inicio) return vacia;
    let obj: Record<string, unknown>;
    try {
        obj = JSON.parse(texto.slice(inicio, fin + 1));
    } catch {
        return vacia;
    }
    const mejora = typeof obj.mejora === "string" ? obj.mejora.trim().slice(0, 500) : "";
    return {
        saludo: comoNota(obj.saludo),
        tono: comoNota(obj.tono),
        resolvio: comoResolvio(obj.resolvio),
        mejora,
    };
}

export const INSTRUCCION_DE_LA_RUBRICA = `Eres un auditor de calidad de atención al cliente por chat.
Vas a leer una conversación entre un CLIENTE y la empresa (el ASESOR, que es una persona, o el AGENTE IA).
Evalúa SOLO la atención que dio la empresa, con esta rúbrica:
- saludo (0-100): ¿la empresa saludó de forma cordial y se presentó al empezar? 100 = saludo claro y amable; 0 = no saludó.
- tono (0-100): ¿el tono fue respetuoso, empático y profesional durante toda la conversación? 100 = impecable; 0 = grosero o descortés.
- resolvio: "si" si la consulta del cliente quedó resuelta, "parcial" si se avanzó pero quedó algo pendiente, "no" si no se resolvió.
- mejora: una o dos frases concretas en español sobre qué debió hacer distinto la empresa. Si todo estuvo bien, di qué mantener.
No evalúes los tiempos de respuesta: se miden aparte.
Responde SOLO con un objeto JSON, sin texto alrededor: {"saludo": 0, "tono": 0, "resolvio": "si", "mejora": "..."}`;

/**
 * Lo que se le enseña a la IA: los mensajes más recientes, una línea por
 * mensaje con quién habla. Se recorta por el PRINCIPIO: lo que se pierde es el
 * saludo de hace una semana y no cómo terminó la consulta.
 */
export function laTranscripcionParaEvaluar(mensajes: MensajeParaMedir[]): string {
    const orden = mensajes
        .filter((m) => m.texto && m.texto.trim())
        .slice()
        .sort((a, b) => a.ts - b.ts)
        .slice(-MENSAJES_A_EVALUAR);
    const lineas = orden.map((m) => {
        const quien = !m.deLaCuenta ? "CLIENTE" : m.porIa ? "AGENTE IA" : "ASESOR";
        return `${quien}: ${m.texto.trim().replace(/\s+/g, " ")}`;
    });
    let texto = lineas.join("\n");
    if (texto.length > CARACTERES_A_EVALUAR) texto = texto.slice(texto.length - CARACTERES_A_EVALUAR);
    return texto;
}

/** Una fila evaluada, tal como la lee el tablero. */
export interface ConversacionEvaluada {
    id: string;
    cuentaId: string;
    instanceName: string;
    remoteJid: string;
    contacto: string | null;
    asesorId: string | null;
    responsable: Responsable;
    puntaje: number | null;
    saludo: number | null;
    tono: number | null;
    resolvio: Resolvio | null;
    primeraRespuestaSeg: number | null;
    resolucionSeg: number | null;
    mejora: string;
    ejemplo: boolean;
    evaluadoEn: string;
    ultimoMensajeEn: string;
}

export interface CalidadDeUnAsesor {
    /** El id del asesor, o `ia` / `sin_asignar`. */
    clave: string;
    asesorId: string | null;
    responsable: Responsable;
    conversaciones: number;
    puntajePromedio: number | null;
    primeraRespuestaPromedioSeg: number | null;
    resolucionPromedioSeg: number | null;
    aMejorar: number;
}

function promedio(valores: (number | null)[]): number | null {
    const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
    if (v.length === 0) return null;
    return Math.round(v.reduce((s, x) => s + x, 0) / v.length);
}

/** La llave del asesor en el reparto: su id, o el nombre del cajón. */
export function laClaveDelAsesor(f: Pick<ConversacionEvaluada, "asesorId" | "responsable">): string {
    return f.asesorId ?? f.responsable;
}

/**
 * El reparto por asesor. **Los promedios salen solo de lo que se pudo medir**:
 * una conversación sin primera respuesta no baja el promedio a cero, se queda
 * fuera de ese promedio. Y las filas que no se pudieron evaluar (`puntaje`
 * nulo) cuentan como conversación pero no entran en el puntaje.
 *
 * El orden es por puntaje, de peor a mejor: lo que se viene a buscar aquí es
 * a quién hay que acompañar, y eso va arriba.
 */
export function agruparPorAsesor(filas: ConversacionEvaluada[]): CalidadDeUnAsesor[] {
    const grupos = new Map<string, ConversacionEvaluada[]>();
    for (const f of filas) {
        const clave = laClaveDelAsesor(f);
        grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
    }
    const salida: CalidadDeUnAsesor[] = [];
    for (const [clave, fs] of grupos) {
        salida.push({
            clave,
            asesorId: fs[0].asesorId,
            responsable: fs[0].asesorId ? "asesor" : fs[0].responsable,
            conversaciones: fs.length,
            puntajePromedio: promedio(fs.map((f) => f.puntaje)),
            primeraRespuestaPromedioSeg: promedio(fs.map((f) => f.primeraRespuestaSeg)),
            resolucionPromedioSeg: promedio(fs.map((f) => f.resolucionSeg)),
            aMejorar: fs.filter((f) => f.ejemplo).length,
        });
    }
    return salida.sort((a, b) => (a.puntajePromedio ?? 101) - (b.puntajePromedio ?? 101) || b.conversaciones - a.conversaciones);
}

/** «4 min», «1 h 20 min», «2 d 3 h». Sin dato: «—». */
export function laDuracionLegible(seg: number | null): string {
    if (seg === null || !Number.isFinite(seg)) return "—";
    if (seg < 60) return `${Math.max(0, Math.round(seg))} s`;
    const min = Math.round(seg / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
    const d = Math.floor(h / 24);
    return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** La llave de una conversación evaluada: cuenta, línea y contacto. */
export function laLlaveDeLaEvaluacion(cuentaId: string, instanceName: string, remoteJid: string): string {
    return `${cuentaId}::${instanceName}::${remoteJid}`;
}

/**
 * Lo que el reporte semanal cuenta de la calidad: el puntaje promedio de la
 * semana y el mejor asesor. Una o dos líneas, sin desglose por conversación:
 * el detalle vive en CRM › Calidad.
 */
export interface ResumenSemanalDeCalidad {
    conversaciones: number;
    puntajePromedio: number;
    /** La cuenta no tiene equipo: el dueño atiende solo, y el puntaje es el suyo. */
    soloElDueno: boolean;
    mejor: { asesorId: string; nombre: string; puntaje: number; conversaciones: number } | null;
}

/**
 * El resumen, puro. Sin conversaciones con puntaje no hay resumen (`null`),
 * nunca un «0/100»: un número que no se puede calcular no se sustituye por otro.
 *
 * El promedio es de TODAS las conversaciones evaluadas de la cuenta —las que
 * contestó una persona y las que contestó la IA—, que es lo que se atendió esa
 * semana. El mejor asesor sale solo de las que tienen asesor (una persona), y a
 * igualdad gana quien atendió más. Sin equipo no se nombra a nadie.
 */
export function elResumenSemanalDeCalidad(
    filas: Pick<ConversacionEvaluada, "asesorId" | "puntaje">[],
    opciones: { tieneEquipo: boolean; nombres: ReadonlyMap<string, string> },
): ResumenSemanalDeCalidad | null {
    const conPuntaje = filas.filter((f): f is typeof f & { puntaje: number } => f.puntaje !== null && Number.isFinite(f.puntaje));
    if (conPuntaje.length === 0) return null;
    const puntajePromedio = Math.round(conPuntaje.reduce((s, f) => s + f.puntaje, 0) / conPuntaje.length);
    let mejor: ResumenSemanalDeCalidad["mejor"] = null;
    if (opciones.tieneEquipo) {
        const porAsesor = new Map<string, number[]>();
        for (const f of conPuntaje) {
            if (!f.asesorId) continue;
            porAsesor.set(f.asesorId, [...(porAsesor.get(f.asesorId) ?? []), f.puntaje]);
        }
        for (const [asesorId, ps] of porAsesor) {
            const puntaje = Math.round(ps.reduce((s, x) => s + x, 0) / ps.length);
            const nombre = opciones.nombres.get(asesorId)?.trim() || "Asesor";
            const gana =
                !mejor ||
                puntaje > mejor.puntaje ||
                (puntaje === mejor.puntaje && ps.length > mejor.conversaciones) ||
                (puntaje === mejor.puntaje && ps.length === mejor.conversaciones && nombre.localeCompare(mejor.nombre) < 0);
            if (gana) mejor = { asesorId, nombre, puntaje, conversaciones: ps.length };
        }
    }
    return { conversaciones: conPuntaje.length, puntajePromedio, soloElDueno: !opciones.tieneEquipo, mejor };
}

/**
 * Las líneas que se escriben: las MISMAS en el WhatsApp del reporte y en la
 * pantalla de Reportes (`negrilla` pone los asteriscos de WhatsApp). Con dos
 * redacciones, el día que se afine una la otra diría otra cosa.
 */
export function lasLineasDeLaCalidad(r: ResumenSemanalDeCalidad, opciones: { negrilla: boolean }): string[] {
    const b = (t: string) => (opciones.negrilla ? `*${t}*` : t);
    const cuantas = `${r.conversaciones} conversaci${r.conversaciones === 1 ? "ón evaluada" : "ones evaluadas"}`;
    if (r.soloElDueno) return [`⭐ Tu calidad de atención: ${b(`${r.puntajePromedio}/100`)} (${cuantas})`];
    const lineas = [`⭐ Calidad del equipo: ${b(`${r.puntajePromedio}/100`)} (${cuantas})`];
    if (r.mejor) lineas.push(`🏆 Mejor asesor: ${b(r.mejor.nombre)} (${r.mejor.puntaje}/100)`);
    return lineas;
}
