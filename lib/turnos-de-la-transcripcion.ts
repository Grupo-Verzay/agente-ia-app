/**
 * Los turnos de una transcripción de llamada: quién habla en cada uno.
 *
 * # Lo que el motor entrega de verdad
 *
 * Depende del proveedor, y hay que tenerlo delante antes de pintar nada:
 *
 * | proveedor | qué devuelve |
 * | --- | --- |
 * | Google (`gemini`) | los turnos marcados, `Operador:` / `Cliente:` — se le pide así |
 * | OpenAI (`gpt-4o-transcribe`, `whisper-1`) | **un texto corrido, sin hablantes** |
 *
 * La grabación de AstraCalls SÍ lleva a cada uno en su canal (izquierda = el
 * asistente, derecha = el cliente), pero se transcribe entera y el modelo la
 * mezcla: lo que vuelve no dice quién dijo qué.
 *
 * # La regla
 *
 * > **Los iconos solo salen cuando el texto trae las marcas.** Sin marcas se
 * > devuelve `null` y la transcripción se pinta como texto corrido. Partir un
 * > texto sin hablantes por frases y repartirlas sería INVENTAR quién habló, y
 * > una transcripción es un registro de lo que pasó.
 *
 * Y la primera línea con texto tiene que llevar su marca: con un trozo suelto
 * delante no se sabe de quién es, así que tampoco se reparte.
 *
 * Puro, para que el banco lo ejerza sin navegador.
 */

export type QuienHabla = "asistente" | "persona";

export type Turno = { quien: QuienHabla; texto: string };

/** Las marcas que se reconocen, sin acentos y en minúsculas. */
const MARCAS: Record<string, QuienHabla> = {
  operador: "asistente",
  asistente: "asistente",
  agente: "asistente",
  verzy: "asistente",
  bot: "asistente",
  ia: "asistente",
  cliente: "persona",
  persona: "persona",
  usuario: "persona",
  contacto: "persona",
};

// `**Operador:**`, `- Cliente:`, `Operador (IA):`… La marca abre la línea.
const LINEA_CON_MARCA = /^\s*(?:[-*•]\s*)?\**\s*([\p{L}]+)(?:\s*\([^)]*\))?\s*\**\s*:\s*\**\s*(.*)$/u;

function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function laMarca(linea: string): { quien: QuienHabla; resto: string } | null {
  const m = LINEA_CON_MARCA.exec(linea);
  if (!m) return null;
  const quien = MARCAS[sinAcentos(m[1]).toLowerCase()];
  return quien ? { quien, resto: m[2].trim() } : null;
}

/** Los turnos, o `null` si el texto no trae quién habla. */
export function losTurnos(texto: string | null | undefined): Turno[] | null {
  const lineas = (texto ?? "").split(/\r?\n/);
  const turnos: Turno[] = [];
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const marca = laMarca(linea);
    if (marca) {
      turnos.push({ quien: marca.quien, texto: marca.resto });
      continue;
    }
    // Una línea sin marca delante de la primera marca: no se sabe de quién es.
    if (turnos.length === 0) return null;
    const ultimo = turnos[turnos.length - 1];
    ultimo.texto = ultimo.texto ? `${ultimo.texto}\n${linea.trim()}` : linea.trim();
  }
  return turnos.length > 0 ? turnos : null;
}
