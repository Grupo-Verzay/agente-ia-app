/**
 * Buscar dentro de lo ESCRITO en las conversaciones de Chats.
 *
 * El buscador de la columna filtraba solo lo cargado (nombre, numero y ultimo
 * mensaje). Esto contesta lo demas: palabras dentro de cualquier mensaje, una
 * fecha escrita, un codigo, un correo. Se busca en el SERVIDOR, contra
 * `chat_messages`, con un indice GIN de texto completo.
 *
 * Este modulo es PURO: decide como se normaliza el texto, que consulta de
 * Postgres sale de lo tecleado y que dia nombra una fecha. Lo usan la consulta
 * (`busqueda-en-mensajes.server.ts`), la pantalla y el banco.
 *
 * ## La normalizacion es UNA, y tiene que decir lo mismo que el indice
 *
 * El indice se construye sobre `EXPRESION_INDEXADA_SQL` (minusculas, sin
 * tildes, todo lo que no sea letra o numero pasa a espacio). Lo tecleado se
 * normaliza igual con `normalizarParaBuscar`. Si las dos discreparan —una quita
 * la tilde y la otra no— «envio» no encontraria «envío» y no habria ningun
 * error que mirar. El banco las encadena contra Postgres.
 */

/** Las vocales con tilde y la eñe, y su forma sin marca, en el MISMO orden. */
export const LETRAS_CON_MARCA = "áàäâãéèëêíìïîóòöôõúùüûñç";
export const LETRAS_SIN_MARCA = "aaaaaeeeeiiiiooooouuuunc";

/**
 * La expresion que indexa el GIN y que la consulta repite LETRA POR LETRA (si
 * no es identica, Postgres no usa el indice). `translate`, `lower` y
 * `regexp_replace` son inmutables, que es lo que un indice de expresion exige.
 * Con `'simple'` no hay raices ni palabras vacias: «de» y «la» se indexan, y
 * eso es lo que deja buscar «15 de octubre» como frase.
 */
export const EXPRESION_INDEXADA_SQL =
  `to_tsvector('simple'::regconfig, regexp_replace(translate(lower(coalesce("content", '')), '${LETRAS_CON_MARCA}', '${LETRAS_SIN_MARCA}'), '[^a-z0-9]+', ' ', 'g'))`;

/** Por debajo de esto no se pregunta al servidor: 1-2 letras casan con todo. */
export const MINIMO_PARA_BUSCAR = 3;
/** Grupos de palabras como mucho. Lo de despues no cambia el resultado. */
export const TOPE_DE_GRUPOS = 6;
/** Conversaciones que devuelve una busqueda. */
export const TOPE_DE_RESULTADOS = 30;

export function normalizarParaBuscar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escaparLexema(t: string): string {
  // Despues de normalizar solo quedan [a-z0-9]: no hay comillas que escapar,
  // pero se envuelve igual para que un lexema nunca se lea como operador.
  return `'${t}'`;
}

/**
 * Lo tecleado como `tsquery`. Cada palabra separada por espacios es un GRUPO;
 * un grupo que el normalizado parte en varios trozos («15/10», «ana@x.com»)
 * se busca como FRASE (`<->`), y el ultimo trozo de cada grupo por PREFIJO
 * (`:*`): «factu» encuentra «factura» y «15/10» encuentra «15/10/2026». Los
 * grupos se juntan con `&`. Una letra suelta no es un grupo.
 *
 * Devuelve `null` si no queda nada que buscar.
 */
export function comoConsultaDeBusqueda(texto: string): string | null {
  const grupos = (texto ?? "")
    .split(/\s+/)
    .map((g) => normalizarParaBuscar(g).split(" ").filter(Boolean))
    .filter((trozos) => trozos.length > 0)
    .filter((trozos) => !(trozos.length === 1 && trozos[0].length < 2))
    .slice(0, TOPE_DE_GRUPOS);
  if (!grupos.length) return null;
  return grupos
    .map((trozos) => {
      const partes = trozos.map((t, i) =>
        i === trozos.length - 1 ? `${escaparLexema(t)}:*` : escaparLexema(t),
      );
      return partes.length > 1 ? `(${partes.join(" <-> ")})` : partes[0];
    })
    .join(" & ");
}

// ---------------------------------------------------------------- fechas --

const MESES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

export type FechaDelTexto = {
  /** El dia nombrado, en la zona de quien busca. */
  anio: number;
  mes: number;
  dia: number;
  /** Lo que quedo de lo tecleado sin la fecha (para buscarlo ADEMAS). */
  resto: string;
  /** Inicio y fin (exclusivo) del dia, en segundos UTC. */
  desdeSeg: number;
  hastaSeg: number;
};

function esFechaValida(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return false;
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

/**
 * El dia del calendario de quien busca, desde un instante en ms y su desfase
 * (`Date#getTimezoneOffset`: minutos que hay que SUMAR a la hora local para
 * llegar a UTC; Colombia es 300).
 */
function elDiaLocal(ahoraMs: number, desfaseMin: number) {
  const local = new Date(ahoraMs - desfaseMin * 60_000);
  return { anio: local.getUTCFullYear(), mes: local.getUTCMonth() + 1, dia: local.getUTCDate() };
}

function elRangoDelDia(anio: number, mes: number, dia: number, desfaseMin: number) {
  const inicioMs = Date.UTC(anio, mes - 1, dia) + desfaseMin * 60_000;
  return { desdeSeg: Math.floor(inicioMs / 1000), hastaSeg: Math.floor(inicioMs / 1000) + 86_400 };
}

/**
 * Si lo tecleado nombra un DIA, cual. Entiende «15/10», «15/10/2026»,
 * «15-10-26», «2026-10-15», «15 de octubre (de 2026)», «15 oct», «hoy» y
 * «ayer». Sin año, el mas reciente que no este en el futuro: quien escribe
 * «15/12» en octubre busca el diciembre PASADO. Una fecha imposible (31/02) no
 * es una fecha.
 */
export function laFechaDelTexto(
  texto: string,
  ahoraMs: number,
  desfaseMin = 0,
): FechaDelTexto | null {
  const crudo = (texto ?? "").trim();
  if (!crudo) return null;
  const minus = crudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hoy = elDiaLocal(ahoraMs, desfaseMin);
  const desfase = Number.isFinite(desfaseMin) ? Math.max(-840, Math.min(840, desfaseMin)) : 0;

  const armar = (anio: number | null, mes: number, dia: number, inicio: number, fin: number) => {
    let a = anio;
    if (a !== null && a < 100) a += 2000;
    if (a === null) {
      a = hoy.anio;
      const futuro = mes > hoy.mes || (mes === hoy.mes && dia > hoy.dia);
      if (futuro) a -= 1;
    }
    if (!esFechaValida(a, mes, dia)) return null;
    const resto = (crudo.slice(0, inicio) + " " + crudo.slice(fin)).replace(/\s+/g, " ").trim();
    return { anio: a, mes, dia, resto, ...elRangoDelDia(a, mes, dia, desfase) };
  };

  // hoy / ayer
  let m = /(^|\s)(hoy|ayer)(?=\s|$)/.exec(minus);
  if (m) {
    const base = m[2] === "hoy" ? ahoraMs : ahoraMs - 86_400_000;
    const d = elDiaLocal(base, desfase);
    const inicio = m.index + m[1].length;
    return armar(d.anio, d.mes, d.dia, inicio, inicio + m[2].length);
  }

  // 2026-10-15
  m = /(^|[^0-9])(\d{4})-(\d{1,2})-(\d{1,2})(?![0-9])/.exec(minus);
  if (m) {
    const inicio = m.index + m[1].length;
    return armar(Number(m[2]), Number(m[3]), Number(m[4]), inicio, inicio + m[0].length - m[1].length);
  }

  // 15/10, 15/10/2026, 15-10-26, 15.10.2026
  m = /(^|[^0-9])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?(?![0-9])/.exec(minus);
  if (m) {
    const inicio = m.index + m[1].length;
    return armar(
      m[4] ? Number(m[4]) : null,
      Number(m[3]),
      Number(m[2]),
      inicio,
      inicio + m[0].length - m[1].length,
    );
  }

  // 15 de octubre (de 2026) / 15 oct 2026
  m = /(^|[^0-9a-z])(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?(?![0-9a-z])/.exec(minus);
  if (m && MESES[m[3]] !== undefined) {
    const inicio = m.index + m[1].length;
    return armar(
      m[4] ? Number(m[4]) : null,
      MESES[m[3]],
      Number(m[2]),
      inicio,
      inicio + m[0].length - m[1].length,
    );
  }

  return null;
}

// --------------------------------------------------------------- extracto --

/** Largo del trozo de mensaje que se enseña con el resultado. */
export const LARGO_DEL_EXTRACTO = 110;

/**
 * El trozo del mensaje alrededor de lo encontrado, para leerlo en la fila sin
 * abrir la conversacion. Se busca la primera palabra de lo tecleado SIN tildes
 * pero se corta el texto original (con sus tildes). Si no aparece —encontrado
 * por la fecha—, el principio del mensaje.
 */
export function elExtracto(contenido: string, busqueda: string): string {
  const texto = (contenido ?? "").replace(/\s+/g, " ").trim();
  if (texto.length <= LARGO_DEL_EXTRACTO) return texto;
  const plano = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // NFD sin marcas conserva un caracter por caracter de las letras latinas
  // comunes, asi que las posiciones del plano valen en el original.
  const mismoLargo = plano.length === texto.length;
  const palabras = normalizarParaBuscar(busqueda).split(" ").filter((p) => p.length >= 2);
  let pos = -1;
  if (mismoLargo) {
    for (const p of palabras) {
      pos = plano.indexOf(p);
      if (pos >= 0) break;
    }
  }
  if (pos < 0) return texto.slice(0, LARGO_DEL_EXTRACTO - 1).trimEnd() + "…";
  const inicio = Math.max(0, pos - 30);
  const fin = Math.min(texto.length, inicio + LARGO_DEL_EXTRACTO);
  return (inicio > 0 ? "…" : "") + texto.slice(inicio, fin).trim() + (fin < texto.length ? "…" : "");
}

// --------------------------------------------------------------- resultado --

export type ResultadoDeBusqueda = {
  instanceName: string;
  remoteJid: string;
  remoteJidAlt: string | null;
  senderPn: string | null;
  pushName: string | null;
  fromMe: boolean;
  extracto: string;
  /** Segundos. */
  messageTimestamp: number;
};

/** Las identidades de un resultado, para casarlo con una fila de la lista. */
export function lasIdentidadesDelResultado(r: Pick<ResultadoDeBusqueda, "remoteJid" | "remoteJidAlt" | "senderPn">): string[] {
  return [r.remoteJid, r.remoteJidAlt, r.senderPn]
    .map((x) => (x ?? "").trim())
    .filter((x) => x && x !== "status@broadcast");
}

/** Lo que se le pide al servidor solo si de verdad hay algo que buscar. */
export function seBuscaEnLosMensajes(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (t.length < MINIMO_PARA_BUSCAR) return false;
  return comoConsultaDeBusqueda(t) !== null || laFechaDelTexto(t, Date.now()) !== null;
}

// ------------------------------------------------------------- un agente --

/**
 * Lo que ve un `agente` de los resultados: es la MISMA regla con la que la
 * bandeja le filtra la lista (`contacts` en chats-client) —lo asignado a el y,
 * si puede tomar sin asignar, lo que no tiene dueño—, aplicada en el SERVIDOR.
 * Filtrarlo solo en el navegador seria mandarle igual el texto de las
 * conversaciones de sus compañeros.
 *
 * `asesorDe` dice, por `linea::identidad`, quien lleva esa conversacion
 * (`null` = nadie). Sin ficha cuenta como sin dueño.
 */
export function loQueVeUnAgente(
  resultados: ResultadoDeBusqueda[],
  asesorDe: Map<string, string | null>,
  persona: string,
  puedeTomarSinAsignar: boolean,
): ResultadoDeBusqueda[] {
  return resultados.filter((r) => {
    const llaves = lasIdentidadesDelResultado(r).map((id) => `${r.instanceName}::${id}`);
    const asesores = llaves.filter((k) => asesorDe.has(k)).map((k) => asesorDe.get(k) ?? null);
    if (asesores.some((a) => a === persona)) return true;
    if (asesores.some((a) => a)) return false;
    return puedeTomarSinAsignar;
  });
}
