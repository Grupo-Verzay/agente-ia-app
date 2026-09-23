/**
 * El nombre de la marca en lo que se GUARDA de una llamada.
 *
 * # Qué pasaba
 *
 * El asistente se presenta bien —«Verzy, de Verzay»— y en la transcripción
 * guardada salía **«Bersi de Versailles»**. No es la voz: es Whisper, que
 * escribe lo que oye con palabras que existen. «Verzay» y «Verzy» no están en
 * su vocabulario y «Versailles» y «Bersi» sí, así que el nombre propio de la
 * casa aparece mal en el único sitio donde la llamada queda por escrito: el
 * detalle de la llamada, el resumen y todo lo que se lea después.
 *
 * # La regla
 *
 * > **Se corrige al GUARDAR, con una lista CERRADA.** No se toca la voz, que
 * > suena bien; y no se «mejora» el texto con el modelo, que sería reescribir
 * > lo que dijo el cliente. Lo único que se cambia son las formas conocidas de
 * > los dos nombres propios de la casa; cualquier otra cosa se deja tal cual.
 *
 * Es puro y la lista está escrita a la vista a propósito: lo que no esté aquí
 * no se sustituye. Cambiar una transcripción es cambiar un registro de lo que
 * pasó, así que la lista se alarga solo con formas que se hayan visto de
 * verdad.
 *
 * Y tiene una segunda mitad, en la petición: a la transcripción se le pasa el
 * vocabulario de la marca ({@link PISTA_DE_VOCABULARIO}) para que escriba bien
 * lo que pueda desde el principio. Esto de aquí es la red de abajo.
 */

/** Cómo se escriben de verdad. */
export const VERZAY = "Verzay";
export const VERZY = "Verzy";

/**
 * Las formas que se han visto, cada una con su nombre bueno.
 *
 * Sin acentos y en minúsculas: la comparación normaliza las dos partes. Van
 * ordenadas de más larga a más corta al construir la expresión, para que
 * «versailles» no la coja antes «versai».
 */
const LO_QUE_SE_HA_OIDO: Record<string, string> = {
  // Verzay → suena «ver-SÁI»
  versailles: VERZAY,
  versalles: VERZAY,
  bersalles: VERZAY,
  verzalles: VERZAY,
  versay: VERZAY,
  versai: VERZAY,
  versaye: VERZAY,
  bersay: VERZAY,
  bersai: VERZAY,
  berzay: VERZAY,
  berzai: VERZAY,
  verzai: VERZAY,
  verzei: VERZAY, // «Verzi de Verzei», visto el 2026-09-22
  // Verzy → suena «VER-si»
  bersi: VERZY,
  bersy: VERZY,
  bercy: VERZY,
  berci: VERZY,
  berzi: VERZY,
  berzy: VERZY, // visto el 2026-09-22
  verzi: VERZY, // «Verzi de Verzei», visto el 2026-09-22
  versi: VERZY,
  verci: VERZY,
  versy: VERZY,
};

/**
 * El vocabulario que se le pasa a la transcripción para que acierte de entrada.
 *
 * Con la lista pelada de nombres —«Verzay, Verzy, WhatsApp…»— el motor seguía
 * escribiendo «Verzi de Verzei»: la pista de Whisper funciona como el TEXTO
 * ANTERIOR a lo que transcribe, no como un glosario. Así que va escrita como la
 * frase con la que se presenta el asistente: es exactamente lo que va a oír.
 */
export const PISTA_DE_VOCABULARIO =
  "Hola, soy Verzy, de Verzay. El asistente se llama Verzy y la empresa es Verzay. WhatsApp, CRM, IA.";

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * La misma forma, aceptando la vocal con tilde.
 *
 * Whisper escribe «Bersí» y «Versáilles» tanto como sin tilde, y una lista sin
 * esto las dejaría pasar: la clave se guarda sin acentos, pero la EXPRESIÓN
 * tiene que poder encontrarlas.
 */
const ACENTOS: Record<string, string> = { a: "aá", e: "eé", i: "ií", o: "oó", u: "uúü" };
function conVocalesAcentuadas(forma: string): string {
  return forma.replace(/[aeiou]/g, (v) => `[${ACENTOS[v]}]`);
}

const FORMAS = Object.keys(LO_QUE_SE_HA_OIDO).sort((a, b) => b.length - a.length);
// `\p{L}` y no `\b`: con `\b`, la «s» final de «Versalles» ya es límite de
// palabra y «Versallesco» se cambiaría igual. Lo que interesa es la palabra
// entera. La `u` es obligatoria para que `\p{L}` signifique algo.
const EXPRESION = new RegExp(
  `(?<![\\p{L}\\d])(${FORMAS.map(conVocalesAcentuadas).join("|")})(?![\\p{L}\\d])`,
  "giu",
);

/**
 * El mismo texto con el nombre de la marca bien escrito.
 *
 * Respeta cómo venía escrito lo que se sustituye: en MAYÚSCULAS se devuelve en
 * mayúsculas, y en cualquier otro caso con la inicial en mayúscula, que es como
 * se escriben los dos nombres. Nada más se toca — ni el resto de la frase, ni
 * los espacios, ni la puntuación.
 */
export function conElNombreDeLaMarca(texto: string | null | undefined): string {
  const original = texto ?? "";
  if (!original) return "";
  return original.replace(EXPRESION, (encontrado) => {
    const bueno = LO_QUE_SE_HA_OIDO[sinAcentos(encontrado).toLowerCase()];
    if (!bueno) return encontrado;
    return encontrado === encontrado.toUpperCase() && encontrado.length > 1
      ? bueno.toUpperCase()
      : bueno;
  });
}
