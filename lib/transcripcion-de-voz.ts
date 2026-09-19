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

/** Lo que ya sabe el resto de la App: 1 crédito = 3.085 tokens. */
export const TOKENS_POR_CREDITO = 3085;

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
 * Si este mensaje es una **nota de voz de un cliente**.
 *
 * Tres condiciones, y las tres hacen falta:
 *
 * - **Entrante.** Lo que escribe el asesor —o la IA— no se transcribe: ya está
 *   en texto en algún sitio, y transcribir lo propio es pagar dos veces.
 * - **`audioMessage`**, claro.
 * - **`ptt`**, que es lo que WhatsApp marca en una nota de voz y no en un
 *   archivo de audio adjunto. Sin esa condición, alguien que manda una canción
 *   de cuatro minutos paga cuatro minutos de transcripción de una canción.
 *   Cuando el proveedor no manda `ptt` se acepta igual: es lo que hace la
 *   inmensa mayoría de los audios que llegan a un chat de atención.
 */
export function esNotaDeVozDeCliente(msg: {
    fromMe?: boolean;
    audio?: { ptt?: boolean; seconds?: number } | null;
}): boolean {
    if (msg.fromMe) return false;
    if (!msg.audio) return false;
    return msg.audio.ptt !== false;
}

export type QueHacerConLaNota =
    | { hacer: "transcribir"; costo: CostoDeLaNota }
    | { hacer: "saltar"; motivo: MotivoSinTranscribir }
    | { hacer: "esperar"; porque: "sin_creditos" };

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
 * `creditosDisponibles`, que es lo que devuelve el lector de siempre, y se
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
    /** Créditos que le quedan a la cuenta, o `null` si son ilimitados. */
    creditosDisponibles: number | null;
}): QueHacerConLaNota {
    if (input.segundos > TOPE_DE_SEGUNDOS) {
        return { hacer: "saltar", motivo: "muy_larga" };
    }

    const costo = costoDeLaNota(input.segundos);

    // Ilimitados: la cuenta paga su propia IA, así que los créditos no pintan
    // nada. Se transcribe y no se descuenta.
    if (input.creditosDisponibles === null) return { hacer: "transcribir", costo };

    if (input.creditosDisponibles < costo.creditos) {
        return { hacer: "esperar", porque: "sin_creditos" };
    }
    return { hacer: "transcribir", costo };
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
    /** La cuenta no tiene créditos suficientes hoy. */
    | "sin_creditos"
    /** La cuenta no tiene configurada su IA. */
    | "sin_ia"
    /** El audio no se pudo descargar. */
    | "no_bajo"
    /** OpenAI no devolvió texto. */
    | "no_transcribio";

/**
 * **Si se puede volver a pulsar.** Es la otra mitad de decir el motivo: un
 * fallo de hoy —la red, OpenAI, un pico de carga— se reintenta y **no se ha
 * cobrado nada**, porque el cobro va después de tener el texto. Los otros no
 * cambian por reintentar, así que el botón se retira y se explica.
 */
export function sePuedeReintentar(motivo: NoSeTranscribio): boolean {
    return motivo === "no_bajo" || motivo === "no_transcribio" || motivo === "sin_creditos";
}

/** Lo que se lee debajo del audio cuando no salió. */
export function porQueNoSeTranscribio(
    motivo: NoSeTranscribio,
    detalle?: { hacenFalta?: number; quedan?: number },
): string {
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
            // Con los números delante: «no hay créditos» sin decir cuántos
            // hacían falta no le sirve a quien tiene que recargar.
            return detalle?.hacenFalta !== undefined
                ? `No hay créditos suficientes: hacen falta ${detalle.hacenFalta} y quedan ${detalle.quedan ?? 0}.`
                : "No hay créditos suficientes.";
        case "sin_ia":
            return "Esta cuenta no tiene configurada su IA.";
        case "no_bajo":
            return "No se pudo descargar el audio. Inténtalo otra vez.";
        case "no_transcribio":
            return "El servicio de transcripción no respondió. Inténtalo otra vez.";
    }
}
