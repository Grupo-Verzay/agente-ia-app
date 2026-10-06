/**
 * Transcribir las notas de voz que entran en Chats, **bajo demanda**.
 *
 * Puro a propósito: de aquí tiran la pantalla —que es un componente de
 * cliente—, la acción que transcribe y el banco. Es el mismo reparto de
 * `canales-de-equipo` con `chat-de-equipo-db`.
 *
 * # Nada se transcribe al llegar
 *
 * Antes sí: el reloj de la conversación abierta transcribía de fondo toda nota
 * que entrara, **la leyera alguien o no**. Con decenas de clientes por cuenta
 * eso es una factura que nadie pidió, y encima la pagaba entera la cuenta dueña
 * de la línea aunque la nota fuera un «ok, gracias» de cuatro segundos.
 *
 * Ahora es el mismo trato que el chat del equipo: un botón debajo de cada nota,
 * con **su precio escrito**, y no se gasta un crédito hasta que alguien lo
 * pulsa. El texto se guarda, así que pedirla otra vez no vuelve a cobrar.
 *
 * # El problema de fondo: se paga por MINUTO y el contador mide TOKENS
 *
 * `ia_credits.used` está en **tokens** y `total` en **créditos**, a 3.085
 * tokens por crédito (ver la sección entera de CLAUDE.md sobre eso). Whisper,
 * en cambio, se cobra **por minuto de audio**: no hay ningún recuento de tokens
 * que escribir, así que hay que fabricarlo — y eso es una **decisión de
 * precio**, no un cálculo.
 *
 * Por eso la tarifa es **un solo número escrito**, con su aritmética al lado, y
 * no repartida por el código. CLAUDE.md ya avisa de que la conversión de 3.085
 * está escrita en tres sitios con dos redondeos y de que eso es un cabo suelto;
 * meter un cuarto con su propia cuenta lo empeora.
 */

/**
 * Cuántos créditos cuesta un minuto de audio.
 *
 * **De dónde sale este número, para poder rehacerlo cuando cambien los
 * precios:** Whisper cuesta unos 0,006 USD por minuto. Un crédito son 3.085
 * tokens del modelo de chat, que a sus tarifas sale del orden de 0,001 USD. De
 * ahí ≈ 6 créditos por minuto, que deja una nota normal de 30 segundos en 3.
 *
 * Es un número de **negocio**, no una constante física: se puede mover sin
 * tocar ningún camino de código, y por eso está aquí solo y con nombre.
 */
export const CREDITOS_POR_MINUTO_DE_AUDIO = 6;

/**
 * Lo que ya sabe el resto de la App: 1 crédito = 3.085 tokens.
 *
 * **Vive en `lib/saldo-de-la-cuenta.ts`** —que es quien lee `ia_credits.used`,
 * o sea de quien es esa unidad— y se re-exporta aquí para que sus consumidores
 * de siempre no cambien de sitio. Escrito dos veces, el día que la conversión
 * se afine una mitad de la plataforma cobraría otra cosa.
 */
export { TOKENS_POR_CREDITO } from "@/lib/saldo-de-la-cuenta";
import { alcanzaPara, TOKENS_POR_CREDITO, type SaldoDeLaCuenta } from "@/lib/saldo-de-la-cuenta";

/**
 * Lo más larga que puede ser una nota para transcribirla, en segundos.
 *
 * **No es un límite técnico.** Una nota en opus de diez minutos pesa poco más
 * de un mega, lejísimos de los 25 MB que admite la API. Es un límite de
 * **gasto**: una grabación de cuarenta minutos reenviada a un chat son
 * cientos de créditos en un solo mensaje, sin que nadie lo haya pedido, y eso
 * reaparece después como «¿por qué bajaron mis créditos?».
 */
export const TOPE_DE_SEGUNDOS = 10 * 60;

/**
 * Las marcas que el paso automático dejó escritas en `raw` mientras existió.
 *
 * **Ya no se escribe ninguna.** Se conservan porque en producción hay filas con
 * ellas dentro, y lo que hay que decidir es qué hacer al leerlas — ver
 * `laMarcaVieja`.
 */
export type MotivoSinTranscribir = "muy_larga" | "fallo";

/**
 * Qué hacer con una marca vieja de `raw.transcripcionMotivo`.
 *
 * La distinción es la que estaba mal y es la que se ve en la captura:
 *
 * - **`muy_larga` es firme.** Una nota de cuarenta minutos lo seguirá siendo
 *   mañana, así que se explica y no se ofrece el botón.
 * - **`fallo` NO lo es, y nunca debió serlo.** Se escribía ante *cualquier*
 *   tropiezo —y con una línea de WhatsApp Mensajería se escribía **siempre**,
 *   porque el audio solo se sabía pedir a Evolution— y esa marca dejaba la nota
 *   sin transcribir **para siempre**, con un «No se pudo transcribir.» que no
 *   dice nada y sin forma de reintentarlo. Al leerla se ignora: la nota vuelve
 *   a ofrecer su botón. Sin backfill y sin tocar una sola fila.
 */
export function laMarcaVieja(
    motivo: MotivoSinTranscribir | undefined | null,
): { explicar: string } | { ofrecerElBoton: true } {
    if (motivo === "muy_larga") return { explicar: "Nota muy larga: no se transcribió." };
    return { ofrecerElBoton: true };
}

/**
 * **La duración de una nota de voz, leída en UN solo sitio.**
 *
 * Es la mitad que faltaba de la tarifa. `costoDeLaNota` ya la compartían la
 * pantalla y el servidor, así que el precio se calculaba igual en los dos
 * lados… **sobre entradas distintas**: el servidor leía la duración con un
 * `COALESCE` de SQL sobre dos formas de `raw`, y el navegador miraba una sola,
 * `message.audioMessage.seconds`. Dos lectores para el mismo dato es dos
 * respuestas, y la del navegador salía **0** — que en `costoDeLaNota` no da
 * cero, da el mínimo: **«1 crédito» para una nota de 40 segundos que cuesta 4**.
 *
 * Y el fallo no se ve como un fallo: el botón dice un número perfectamente
 * plausible. La regla de *un número que no se puede calcular no se sustituye
 * por otro* aquí se rompía de la peor manera, porque el sustituto era un precio
 * creíble.
 *
 * Las formas que se miran, y por qué son varias:
 *
 * - `raw.message.audioMessage` — la foto de Evolution, con su sobre.
 * - `raw.audioMessage` — lo que guardan los caminos que persisten el contenido
 *   sin sobre alrededor.
 * - el propio objeto, cuando ya se le entrega el contenido del mensaje.
 *
 * Y dentro, `seconds` **y** `duration`: la primera es la de WhatsApp y la
 * segunda es como la nombran otros motores. Preguntar por una sola forma
 * «devuelve correcto y vacío», que es la regla de siempre de Chats.
 *
 * Devuelve **0** cuando no hay de dónde sacarla, que es lo mismo que decide el
 * cobro: así lo que se enseña no puede separarse de lo que se descuenta.
 */
export function segundosDeLaNota(fuente: unknown): number {
    const audio = elAudioDe(fuente);
    if (!audio) return 0;
    return comoSegundos(audio.seconds) || comoSegundos(audio.duration);
}

function elAudioDe(fuente: unknown): { seconds?: unknown; duration?: unknown } | null {
    if (!fuente || typeof fuente !== "object" || Array.isArray(fuente)) return null;
    const obj = fuente as Record<string, unknown>;

    const dentroDelSobre = comoObjeto(comoObjeto(obj.message)?.audioMessage);
    if (dentroDelSobre) return dentroDelSobre;

    const sinSobre = comoObjeto(obj.audioMessage);
    if (sinSobre) return sinSobre;

    // Ya es el propio `audioMessage`: solo se acepta si trae uno de los dos
    // campos, para no confundir cualquier objeto con una nota.
    if ("seconds" in obj || "duration" in obj) return obj;
    return null;
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    return valor as Record<string, unknown>;
}

/**
 * Se acepta el **número dentro de una cadena** porque así es como llega de
 * Postgres cuando se lee un JSONB con `->>`, y así lo mandan algunos motores.
 * Y se trunca: medio segundo no es medio crédito, y un decimal colado subiría
 * el precio un escalón entero por el `ceil` de `costoDeLaNota`.
 */
function comoSegundos(valor: unknown): number {
    if (typeof valor !== "number" && typeof valor !== "string") return 0;
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
}

export type CostoDeLaNota = { creditos: number; tokens: number };

/**
 * Lo que cuesta transcribir una nota, **en créditos y en tokens**.
 *
 * La cadena es `segundos → créditos → tokens`, en ese orden, y el redondeo se
 * hace **una sola vez, al final**. Tres cosas de eso:
 *
 * 1. **Se cobra prorrateado, no por minuto empezado.** Redondear al minuto
 *    cobraría una nota de 4 segundos como 60 —quince veces de más— y en una
 *    línea de notas cortas se come los créditos en una tarde.
 * 2. **`ceil`, nunca `floor`.** Con `floor`, una nota de 5 segundos costaría
 *    **cero**: se transcribiría gratis para siempre y el contador no se movería
 *    mientras el consumo sí ocurre. Es la familia de *un número que no se puede
 *    calcular no se sustituye por otro*.
 * 3. **Nunca cero, ni para una nota de un segundo.** Una nota siempre cuesta al
 *    menos la llamada, así que el mínimo es un crédito.
 */
export function costoDeLaNota(segundos: number): CostoDeLaNota {
    const seguros = Number.isFinite(segundos) && segundos > 0 ? segundos : 0;
    const creditos = Math.max(1, Math.ceil((seguros / 60) * CREDITOS_POR_MINUTO_DE_AUDIO));
    return { creditos, tokens: creditos * TOKENS_POR_CREDITO };
}

/**
 * Si este mensaje es una **nota de voz** que se puede transcribir.
 *
 * **Vale para los DOS lados de la conversación**: la del cliente y la del
 * asesor. Antes solo la del cliente, con el argumento de que lo propio «ya está
 * en texto en algún sitio» — y una nota de voz del asesor no lo está: es justo
 * lo que hay que poder revisar para saber qué le dice el equipo a los clientes.
 * Sigue siendo bajo demanda, así que no se paga nada que nadie pida.
 *
 * Lo que sí se mantiene es **`ptt`**, que es lo que WhatsApp marca en una nota
 * de voz y no en un archivo de audio adjunto. Sin esa condición, alguien que
 * manda una canción de cuatro minutos paga cuatro minutos de transcripción de
 * una canción. Cuando el proveedor no manda `ptt` se acepta igual: es lo que
 * hace la inmensa mayoría de los audios que llegan a un chat de atención.
 */
export function esNotaDeVozTranscribible(msg: {
    fromMe?: boolean;
    audio?: { ptt?: boolean; seconds?: number } | null;
}): boolean {
    if (!msg.audio) return false;
    return msg.audio.ptt !== false;
}

export type QueHacerConLaNota =
    | { hacer: "transcribir"; costo: CostoDeLaNota }
    | { hacer: "saltar"; motivo: MotivoSinTranscribir }
    /**
     * No se puede pagar hoy. **`porque` distingue las dos formas de no poder**:
     * la bolsa está vacía —se recarga— o no existe —hay que asignarle un cupo
     * a esa cuenta—. Con un solo valor, la segunda se lee como la primera y
     * manda a recargar algo que nadie asignó.
     */
    | { hacer: "esperar"; porque: "sin_creditos" | "sin_bolsa"; costo: CostoDeLaNota };

/**
 * Qué hacer con una nota, **antes de descargar nada y antes de tocar créditos**.
 *
 * La duración viene dentro del propio mensaje (`audioMessage.seconds`), así que
 * esta decisión no cuesta un byte.
 *
 * # Y la comprobación va en CRÉDITOS, nunca en tokens
 *
 * Es la regla explícita de CLAUDE.md: *ninguna comparación toca `used` y
 * `total` en la misma expresión*. Ese fallo ya pasó en el voicebot
 * —`credit.used >= credit.total` daba «sin créditos» con 4 créditos gastados de
 * 12.000, porque comparaba tokens contra créditos—. Aquí entra
 * el SALDO, que es lo que devuelve el lector de siempre, y se
 * compara contra un costo también en créditos. La conversión a tokens ocurre
 * **después**, solo para escribir.
 *
 * # «Sin créditos» es ESPERAR, no saltar
 *
 * Y la diferencia importa: `saltar` se guarda en el mensaje y no se reintenta
 * nunca —una nota de cuarenta minutos lo seguirá siendo mañana—, mientras que
 * quedarse sin créditos es de hoy. Marcándolo, esa nota no se transcribiría
 * jamás aunque la cuenta recargue esta tarde.
 */
export function queHacerConLaNota(input: {
    segundos: number;
    /** Lo que la plataforma sabe de la bolsa de la cuenta que paga. */
    saldo: SaldoDeLaCuenta;
}): QueHacerConLaNota {
    if (input.segundos > TOPE_DE_SEGUNDOS) {
        return { hacer: "saltar", motivo: "muy_larga" };
    }

    const costo = costoDeLaNota(input.segundos);

    // Sin tope: la cuenta paga su propia IA —o su total es negativo a
    // propósito—, así que los créditos no pintan nada. Se transcribe y no se
    // descuenta.
    if (alcanzaPara(input.saldo, costo.creditos)) return { hacer: "transcribir", costo };

    return {
        hacer: "esperar",
        porque: input.saldo.estado === "sin_bolsa" ? "sin_bolsa" : "sin_creditos",
        costo,
    };
}

/**
 * Por qué no salió, con el detalle suficiente para saber qué arreglar.
 *
 * «No se pudo transcribir.» a secas es lo que había, y es lo peor posible: el
 * asesor no sabe si recargar créditos, avisar a soporte o simplemente volver a
 * pulsar. Cada uno de estos lleva a una acción distinta, y por eso son valores
 * y no un texto suelto — el que se enseña sale de `porQueNoSeTranscribio`.
 */
export type NoSeTranscribio =
    /** No se sabe de qué línea es, así que no se puede ni buscar la nota. */
    | "sin_linea"
    /** Ese mensaje no existe, o no es una nota de voz. */
    | "no_es_nota"
    /** La nota está guardada sin nada de donde bajar el audio. */
    | "sin_audio"
    /** Por encima del tope de gasto. */
    | "muy_larga"
    /** La cuenta no tiene créditos suficientes hoy. Se recarga. */
    | "sin_creditos"
    /**
     * La cuenta **no tiene bolsa de créditos**: nadie le ha asignado un cupo.
     *
     * Es un motivo aparte y no `sin_creditos` porque lleva a otra acción —y a
     * otra persona—: «recarga» no sirve cuando no hay nada que recargar. Es lo
     * que hacía que un «quedan 0» se leyera como un saldo agotado mientras la
     * cuenta que se estaba mirando tenía créditos de sobra.
     */
    | "sin_bolsa"
    /** La cuenta no tiene configurada su IA. */
    | "sin_ia"
    /** El audio no se pudo descargar. */
    | "no_bajo"
    /** OpenAI no devolvió texto. */
    | "no_transcribio"
    /** La clave de OpenAI PROPIA de la cuenta (Ajustes) no es válida. */
    | "clave_invalida"
    /** La cuenta de OpenAI de esa clave propia no tiene saldo. */
    | "clave_sin_saldo";

/**
 * **Si se puede volver a pulsar.** Es la otra mitad de decir el motivo: un
 * fallo de hoy —la red, OpenAI, un pico de carga— se reintenta y **no se ha
 * cobrado nada**, porque el cobro va después de tener el texto. Los otros no
 * cambian por reintentar, así que el botón se retira y se explica.
 */
export function sePuedeReintentar(motivo: NoSeTranscribio): boolean {
    return (
        motivo === "no_bajo" ||
        motivo === "no_transcribio" ||
        motivo === "sin_creditos" ||
        // Corregir la clave en Ajustes lo arregla.
        motivo === "clave_invalida" ||
        motivo === "clave_sin_saldo" ||
        // Asignarle un cupo a la cuenta lo arregla, así que el botón sigue.
        motivo === "sin_bolsa"
    );
}

/**
 * Lo que se lee debajo del audio cuando no salió.
 *
 * **Y con el nombre de la CUENTA cuando se sabe cuál es.** Esto es lo que
 * convirtió el fallo reportado en una tarde de búsqueda: el aviso decía «no
 * hay créditos» sin decir de quién, así que quien lo leía miraba el saldo de
 * la cuenta con la que había entrado —que tenía créditos de sobra— y concluía
 * que la App mentía. La bolsa que se mira es la de la cuenta dueña de la
 * línea, que puede ser otra de la familia.
 */
export function porQueNoSeTranscribio(
    motivo: NoSeTranscribio,
    detalle?: {
        hacenFalta?: number;
        quedan?: number;
        /** El nombre de la cuenta que paga, cuando se conoce. */
        cuenta?: string;
    },
): string {
    const cuenta = detalle?.cuenta?.trim();
    const suya = cuenta ? `${cuenta} ` : "";
    switch (motivo) {
        case "sin_linea":
            return "No se sabe de qué línea es esta conversación.";
        case "no_es_nota":
            return "Ese mensaje ya no está.";
        case "sin_audio":
            return "El audio de esta nota no está guardado.";
        case "muy_larga":
            return "Demasiado larga para transcribirla.";
        case "sin_creditos":
            // Con los números delante Y con la cuenta: «no hay créditos» sin
            // decir cuántos hacían falta no le sirve a quien tiene que
            // recargar, y sin decir de QUIÉN manda a mirar la bolsa
            // equivocada.
            return detalle?.hacenFalta !== undefined
                ? `${suya || "Esta cuenta "}se quedó sin créditos: hacen falta ${detalle.hacenFalta} y quedan ${detalle.quedan ?? 0}.`
                : `${suya || "Esta cuenta "}no tiene créditos suficientes.`;
        case "sin_bolsa":
            // **Y esto NO es «quedan 0».** Se arregla asignándole un cupo a
            // esa cuenta, no recargando: son dos pantallas y dos personas.
            return `${suya || "Esta cuenta "}no tiene créditos asignados. Asígnale un cupo en Panel › Clientes.`;
        case "sin_ia":
            return `${suya || "Esta cuenta "}no tiene configurada su IA.`;
        case "no_bajo":
            return "No se pudo descargar el audio. Inténtalo otra vez.";
        case "no_transcribio":
            return "El servicio de transcripción no respondió. Inténtalo otra vez.";
        case "clave_invalida":
            return `La clave de OpenAI de ${cuenta || "esta cuenta"} no es válida. Revísala en Ajustes › Conexión › API key.`;
        case "clave_sin_saldo":
            return `La cuenta de OpenAI de la clave de ${cuenta || "esta cuenta"} no tiene saldo. Recárgala en OpenAI o cambia la clave en Ajustes › Conexión › API key.`;
    }
}
