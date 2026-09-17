/**
 * Cobros: la cartera de cobro de una cuenta con SUS clientes.
 *
 * Esto **no es** el cobro de la plataforma. El de Verzay vive en
 * `actions/billing/**` sobre `UserBilling`, cobra licencias de la App y sus
 * ramas suspenden y borran cuentas. Aquí una cuenta cliente le cobra a los
 * suyos —internet, streaming, cualquier suscripción— y lo peor que pasa es que
 * sale un WhatsApp. Se copia el patrón y no se toca aquel: generalizarlo habría
 * metido las deudas de los clientes de un cliente por el mismo camino que las
 * licencias de la plataforma.
 *
 * Este fichero es **puro**: entra un dato y sale otro, sin Prisma y sin red.
 * De él tiran la pantalla (que es cliente), las acciones y el banco de pruebas.
 * Lo que decide algo —el salto del ciclo, qué recordatorio toca hoy— vive aquí
 * justamente para poder probarlo sin levantar nada.
 */

import { SERVER_TIME_ZONE } from "@/lib/utils";

/* ── Estados ──────────────────────────────────────────────────────────────── */

/**
 * Los tres estados, y son tres.
 *
 * `comprobante` es «el cliente dice que pagó y mandó el soporte»; `confirmada`
 * es «lo revisé y es cierto». La segunda la pone una PERSONA: aquí no se
 * verifica ningún pago ni se habla con ninguna pasarela.
 */
export const ESTADOS_DE_COBRO = ["pendiente", "comprobante", "confirmada"] as const;
export type EstadoDeCobro = (typeof ESTADOS_DE_COBRO)[number];

export const ETIQUETA_DEL_ESTADO: Record<EstadoDeCobro, string> = {
    pendiente: "Pendiente",
    comprobante: "Comprobante recibido",
    confirmada: "Confirmada",
};

/**
 * Lo que llega de fuera pasa por la lista, en el SERVIDOR y no solo al pintar
 * el desplegable. Un estado inventado se quedaría guardado y saldría en la
 * tabla como una cuarta columna que nadie sabe de dónde salió. Y se vuelve a
 * filtrar al leer, para que una fila rara —escrita a mano, o de antes de esta
 * comprobación— salga como `pendiente` y no rompa la pantalla.
 */
export function comoEstadoDeCobro(valor: unknown): EstadoDeCobro {
    const texto = String(valor ?? "").trim();
    return (ESTADOS_DE_COBRO as readonly string[]).includes(texto)
        ? (texto as EstadoDeCobro)
        : "pendiente";
}

/* ── El ciclo ─────────────────────────────────────────────────────────────── */

/** Un mes, que es lo que cobra casi todo el mundo. */
export const DIAS_DE_LICENCIA_POR_DEFECTO = 30;
/** Lo que se aguanta sin pagar antes de dar la deuda por vencida de verdad. */
export const DIAS_DE_GRACIA_POR_DEFECTO = 3;

/** Topes: un año de licencia y un año de gracia. Más que eso es un error de dedo. */
export const TOPE_DE_DIAS = 365;

/**
 * «No hay valor» y «vale cero» son cosas distintas, y aquí se separan a mano.
 *
 * `Number(null)` es **0**, no `NaN`, así que un `null` colado se leía como un
 * cero perfectamente válido: los días de gracia —donde el cero SÍ es una
 * respuesta legítima, «al día siguiente ya está vencida»— pasaban de valer 3 a
 * valer 0 sin que nadie lo hubiera pedido. Lo cazó el banco.
 */
function comoNumeroDeDias(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? n : null;
}

export function comoDiasDeLicencia(valor: unknown): number {
    const n = comoNumeroDeDias(valor);
    // Cero días de licencia no existe: sería un ciclo que vence el mismo día en
    // que empieza, y el vencimiento no avanzaría nunca.
    if (n === null || n < 1) return DIAS_DE_LICENCIA_POR_DEFECTO;
    return Math.min(n, TOPE_DE_DIAS);
}

export function comoDiasDeGracia(valor: unknown): number {
    const n = comoNumeroDeDias(valor);
    if (n === null || n < 0) return DIAS_DE_GRACIA_POR_DEFECTO;
    return Math.min(n, TOPE_DE_DIAS);
}

/**
 * A dónde salta el vencimiento cuando se confirma un pago.
 *
 * Es **la misma regla que Instancias** (`billing-payment-internal.ts`): si la
 * fecha que había todavía no ha llegado, se suma sobre ella —quien paga el día
 * 25 para un vencimiento del 30 no pierde esos cinco días—; si ya pasó, se suma
 * sobre HOY, porque el servicio estuvo cortado y el ciclo nuevo empieza cuando
 * vuelve, no cuando debió haber empezado.
 *
 * Sin esa distinción, a un cliente que paga con un mes de retraso se le vendería
 * un mes que ya se gastó esperando.
 */
export function siguienteVencimiento(
    venceAhora: Date | null,
    diasDeLicencia: number,
    ahora: Date,
): Date {
    const dias = comoDiasDeLicencia(diasDeLicencia);
    const base = venceAhora && venceAhora.getTime() > ahora.getTime() ? venceAhora : ahora;
    const siguiente = new Date(base.getTime());
    siguiente.setDate(siguiente.getDate() + dias);
    return siguiente;
}

/**
 * Cuántos días faltan para el vencimiento, contados por DÍAS de calendario en
 * la zona del servidor y no por horas.
 *
 * Con horas, una deuda que vence hoy a las 9 de la mañana ya sale con «-1» a
 * las 10 y el recordatorio del día 0 no sale nunca. Y en UTC a secas, todo lo
 * que caiga después de las 7 de la tarde en Colombia cuenta como el día
 * siguiente. Es la misma cuenta que hace `getBillingDaysRemaining` en el cobro
 * de la plataforma; se escribe aquí para que este módulo no dependa de aquel.
 */
export function diasQueFaltan(vence: Date | null, ahora: Date): number | null {
    if (!vence) return null;
    const dia = (fecha: Date) => fecha.toLocaleDateString("sv-SE", { timeZone: SERVER_TIME_ZONE });
    const [av, mv, dv] = dia(vence).split("-").map(Number);
    const [aa, ma, da] = dia(ahora).split("-").map(Number);
    return Math.round((Date.UTC(av, mv - 1, dv) - Date.UTC(aa, ma - 1, da)) / 86_400_000);
}

/** ¿Se pasó de la gracia? Eso es lo que la tabla pinta en rojo. */
export function estaVencidaDeVerdad(
    vence: Date | null,
    diasDeGracia: number,
    ahora: Date,
): boolean {
    const faltan = diasQueFaltan(vence, ahora);
    if (faltan === null) return false;
    return faltan < -comoDiasDeGracia(diasDeGracia);
}

/* ── Lo que se ENSEÑA, que no es lo mismo que lo que se guarda ────────────── */

/**
 * La situación de una fila **se calcula**, no se guarda.
 *
 * Aquí está la consecuencia de que el cobro sea recurrente, y conviene
 * entenderla antes de tocar nada: al confirmar un pago la fila **vuelve a
 * `pendiente`** con el vencimiento del ciclo siguiente, así que `confirmada` no
 * es un sitio donde una fila se quede — es lo que le pasó a un CICLO, y por eso
 * vive en `cobro_ciclos` y no en la fila.
 *
 * Si la tabla pintara el estado guardado a secas, una cartera entera de
 * clientes al día saldría en «Pendiente», que es tanto como no decir nada. Lo
 * que la persona necesita ver es **si tiene que hacer algo hoy**, y eso sale de
 * la fecha:
 *
 * - `comprobante` — mandó el soporte y espera que alguien lo mire. **Es lo
 *   único que pide acción de tu parte**, y por eso va primero.
 * - `vencida` — se pasó la fecha.
 * - `porVencer` — está a punto.
 * - `alDia` — pagado y con su próximo vencimiento lejos.
 * - `sinFecha` — se creó sin vencimiento: no recibe recordatorios y hay que
 *   ponerle uno.
 */
export type SituacionDelCobro = "comprobante" | "vencida" | "porVencer" | "alDia" | "sinFecha";

export const ETIQUETA_DE_LA_SITUACION: Record<SituacionDelCobro, string> = {
    comprobante: "Comprobante recibido",
    vencida: "Vencida",
    porVencer: "Por vencer",
    alDia: "Al día",
    sinFecha: "Sin fecha",
};

/** A cuántos días de distancia una deuda deja de estar «al día». */
export const UMBRAL_DE_POR_VENCER = 3;

export function situacionDelCobro(
    cobro: Pick<CobroParaDecidir, "estado" | "vence">,
    ahora: Date,
): SituacionDelCobro {
    if (cobro.estado === "comprobante") return "comprobante";
    const faltan = diasQueFaltan(cobro.vence, ahora);
    if (faltan === null) return "sinFecha";
    if (faltan < 0) return "vencida";
    if (faltan <= UMBRAL_DE_POR_VENCER) return "porVencer";
    return "alDia";
}

/* ── Los recordatorios ────────────────────────────────────────────────────── */

/** Los tres hitos, y solo tres. */
export const HITOS = ["antes", "elDia", "despues"] as const;
export type Hito = (typeof HITOS)[number];

export type ConfigDeRecordatorios = {
    /** Días ANTES del vencimiento. `null` = ese aviso no sale. */
    diasAntes: number | null;
    /** El propio día del vencimiento. */
    elDia: boolean;
    /** Días DESPUÉS. `null` = ese aviso no sale. */
    diasDespues: number | null;
};

export const RECORDATORIOS_POR_DEFECTO: ConfigDeRecordatorios = {
    diasAntes: 3,
    elDia: true,
    diasDespues: 3,
};

/**
 * Qué hito cae HOY, si es que cae alguno.
 *
 * Son tres días exactos y **no un rango**: «cualquier día en negativo» es lo
 * que hacía que un cliente recibiera un mensaje el día 1, otro el 2, otro el 3
 * y así hasta la suspensión. Cuatro o cinco mensajes de cobro seguidos no
 * cobran más rápido: se leen como spam y acaban silenciando la línea, que es
 * justo lo contrario de lo que se busca. Ese fallo ya se pagó una vez en el
 * cobro de la plataforma; aquí nace corregido.
 */
export function hitoDeHoy(faltan: number | null, config: ConfigDeRecordatorios): Hito | null {
    if (faltan === null) return null;
    if (config.diasAntes !== null && faltan === config.diasAntes) return "antes";
    if (config.elDia && faltan === 0) return "elDia";
    if (config.diasDespues !== null && faltan === -config.diasDespues) return "despues";
    return null;
}

/** Lo que la vuelta diaria necesita saber de una fila para decidir. */
export type CobroParaDecidir = {
    estado: EstadoDeCobro;
    vence: Date | null;
    ultimoRecordatorioEn: Date | null;
    ultimoRecordatorioVence: Date | null;
};

/**
 * La decisión entera de «¿le escribo hoy a este?», en una función pura.
 *
 * Tres cosas, y las tres importan:
 *
 * 1. **Solo se le insiste a quien está en `pendiente`.** En `comprobante` la
 *    pelota está en NUESTRA cancha —mandó el soporte y espera que alguien lo
 *    mire—, así que seguir cobrándole es el peor mensaje posible. Y en
 *    `confirmada` no hay nada que cobrar hasta el ciclo siguiente, que ya nace
 *    en `pendiente` con su fecha nueva.
 * 2. **Un solo mensaje por día y por ciclo.** Si el cron se repite —un
 *    reintento, dos vueltas el mismo día— el segundo no manda nada. La marca
 *    lleva la fecha de vencimiento con la que se mandó, así que un pago que
 *    mueve el vencimiento abre la puerta otra vez sin esperar a mañana; es lo
 *    que hace `shouldSkipBillingReminderToday` y sin ello un cliente recibe el
 *    mismo cobro dos veces en una mañana.
 * 3. **Sin fecha de vencimiento no se escribe.** Una deuda sin fecha no tiene
 *    hito ninguno; inventarle uno sería escribirle a alguien por una cuenta que
 *    nadie ha fechado.
 */
export function tocaRecordatorio(
    cobro: CobroParaDecidir,
    config: ConfigDeRecordatorios,
    ahora: Date,
): Hito | null {
    if (cobro.estado !== "pendiente") return null;
    if (!cobro.vence) return null;

    const hito = hitoDeHoy(diasQueFaltan(cobro.vence, ahora), config);
    if (!hito) return null;

    if (yaSeEscribioHoy(cobro, ahora)) return null;
    return hito;
}

/** ¿Ya salió un recordatorio hoy para ESTE ciclo? */
export function yaSeEscribioHoy(cobro: CobroParaDecidir, ahora: Date): boolean {
    const { ultimoRecordatorioEn, ultimoRecordatorioVence, vence } = cobro;
    if (!ultimoRecordatorioEn || !ultimoRecordatorioVence || !vence) return false;

    const dia = (f: Date) => f.toLocaleDateString("sv-SE", { timeZone: SERVER_TIME_ZONE });
    return dia(ultimoRecordatorioEn) === dia(ahora) && dia(ultimoRecordatorioVence) === dia(vence);
}

/* ── El mensaje ───────────────────────────────────────────────────────────── */

/**
 * Las variables que entiende la plantilla. Son las que pediste y ninguna más:
 * una variable que no se pueda rellenar sale vacía y deja una frase coja.
 */
export const VARIABLES_DEL_MENSAJE = [
    { clave: "cliente", ayuda: "El nombre del cliente" },
    { clave: "monto", ayuda: "Lo que debe, con su moneda" },
    { clave: "vence", ayuda: "La fecha de vencimiento" },
    { clave: "dias", ayuda: "Días que faltan, o que lleva vencido" },
    { clave: "concepto", ayuda: "Lo que se le cobra (plan, servicio…)" },
    { clave: "pago", ayuda: "Tus datos de pago" },
] as const;

export type VariablesDelMensaje = {
    cliente: string;
    monto: string;
    vence: string;
    dias: string;
    concepto: string;
    pago: string;
};

const SEP = "--------•--------•--------";

/**
 * Los tres mensajes por defecto, uno por hito.
 *
 * Se prellenan tal cual en la pantalla de configuración para que nadie tenga
 * que escribir el primero desde cero, y cada cuenta los edita a su gusto. No
 * dicen «internet» ni «streaming» ni nada de un rubro concreto: lo que se cobra
 * lo pone `{concepto}`, que lo escribe la cuenta en cada fila.
 */
export const MENSAJES_POR_DEFECTO: Record<Hito, string> = {
    antes: [
        `Hola {cliente} 👋`,
        `Te recordamos que tu *{concepto}* vence en *{dias} días*.`,
        SEP,
        `📅 *Vence:* {vence}`,
        `💵 *Valor:* {monto}`,
        SEP,
        `💳 *Puedes pagar así:*`,
        `{pago}`,
        SEP,
        `Cuando pagues, envíanos el comprobante por aquí.`,
    ].join("\n"),
    elDia: [
        `Hola {cliente} 👋`,
        `Hoy vence tu *{concepto}*.`,
        SEP,
        `📅 *Vence:* {vence}`,
        `💵 *Valor:* {monto}`,
        SEP,
        `💳 *Puedes pagar así:*`,
        `{pago}`,
        SEP,
        `Cuando pagues, envíanos el comprobante por aquí.`,
    ].join("\n"),
    despues: [
        `Hola {cliente} 👋`,
        `Tu *{concepto}* lleva *{dias} días* vencido.`,
        SEP,
        `📅 *Venció:* {vence}`,
        `💵 *Valor:* {monto}`,
        SEP,
        `💳 *Puedes pagar así:*`,
        `{pago}`,
        SEP,
        `Si ya pagaste, envíanos el comprobante por aquí.`,
    ].join("\n"),
};

/**
 * Cambia `{variable}` por su valor.
 *
 * Una variable sin valor se queda **vacía**, no con su nombre a la vista:
 * `{pago}` sin datos de pago configurados tiene que dejar un hueco, no mandarle
 * al cliente la palabra «{pago}». Y se recorren las variables conocidas y no
 * las llaves que traiga el texto, para que un `{loquesea}` inventado se quede
 * como está y se note que no existe.
 */
export function aplicarVariables(plantilla: string, valores: VariablesDelMensaje): string {
    let texto = plantilla;
    for (const { clave } of VARIABLES_DEL_MENSAJE) {
        const valor = valores[clave as keyof VariablesDelMensaje] ?? "";
        texto = texto.split(`{${clave}}`).join(valor);
    }
    return texto;
}

/**
 * El «{dias}» de cada hito, en positivo siempre.
 *
 * La plantilla ya dice si son los que faltan o los que lleva vencido —«vence en
 * {dias} días» frente a «lleva {dias} días vencido»—, así que meter aquí el
 * signo dejaría «lleva -3 días vencido».
 */
export function diasParaElMensaje(faltan: number | null): string {
    if (faltan === null) return "";
    return String(Math.abs(faltan));
}

/** El monto tal y como se lee en el mensaje y en la tabla. */
export function montoConMoneda(monto: number | null, moneda: string): string {
    if (monto === null || !Number.isFinite(monto)) return "";
    return `$${monto.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${moneda}`.trim();
}

/** La fecha tal y como se lee en el mensaje: corta y sin hora. */
export function fechaCorta(fecha: Date | null): string {
    if (!fecha) return "";
    return fecha.toLocaleDateString("es-CO", {
        timeZone: SERVER_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

/* ── A quién se le escribe ────────────────────────────────────────────────── */

/** Solo dígitos: lo que teclea una persona trae puntos, espacios y paréntesis. */
export function soloDigitos(valor: string): string {
    return (valor ?? "").replace(/[^\d]/g, "");
}

/**
 * El jid al que sale el mensaje.
 *
 * Si la deuda guarda el jid de un contacto que ya había escrito, se usa **tal
 * cual**: puede ser un `@lid`, y fabricar el número a partir de sus dígitos
 * daría un JID falso que podría casar con otro contacto — es la misma razón por
 * la que `buildWhatsAppJidCandidates` no cruza ese puente. Solo cuando no hay
 * jid se arma uno con el teléfono.
 */
export function jidDelCobro(cobro: {
    contactoJid: string | null;
    contactoTelefono: string;
}): string {
    const guardado = cobro.contactoJid?.trim();
    if (guardado) return guardado;
    const digitos = soloDigitos(cobro.contactoTelefono);
    return digitos ? `${digitos}@s.whatsapp.net` : "";
}

export type CobroParaEnviar = {
    contactoNombre: string;
    contactoTelefono: string;
    contactoJid: string | null;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: Date | null;
    /** La línea escrita a mano en ESTA deuda. Ver `conLaNota`. */
    notaDePago: string | null;
};

/** Lo que cabe en la nota de una deuda. Una cuenta bancaria con su titular, o un enlace. */
export const TOPE_DE_LA_NOTA = 1000;

/**
 * «Sin nota» se guarda como `null`, nunca como espacios ni cadena vacía.
 *
 * Y se aplica **al escribir**, en `cobros-db`, no solo en la acción: con el
 * saneado únicamente en la acción, la columna admitía `"   "` en cuanto alguien
 * llamara a la función de la base por otro camino, y entonces `null` y «espacios»
 * serían dos formas de decir lo mismo — que es como se acaba teniendo lectores
 * que no se ponen de acuerdo. Lo cazó el banco.
 */
export function comoNotaDePago(valor: unknown): string | null {
    const texto = String(valor ?? "").trim();
    if (!texto) return null;
    return texto.slice(0, TOPE_DE_LA_NOTA);
}

/**
 * La nota de la deuda va **al final del mensaje, siempre, y pegada por fuera de
 * la plantilla**. Es la decisión de esta función y conviene entender por qué,
 * porque las otras dos formas que parecen mejores fallan en silencio:
 *
 * - **Como `{variable}` nueva.** Cada cuenta ya tiene sus tres mensajes
 *   guardados y editados; una variable que no está escrita en ellos no se
 *   sustituye en ninguna parte. La cuenta escribiría el número de cuenta, lo
 *   guardaría, y al cliente no le llegaría — sin un solo error. Es la misma
 *   familia que «una prohibición que no viaja en el prompt no existe».
 * - **Metida dentro de `{pago}`.** Sale bien con las plantillas por defecto y
 *   desaparece en cuanto alguien quitó ese `{pago}` de la suya. Una rama que
 *   solo se equivoca con los datos que ya tienen los clientes es la que nadie
 *   prueba.
 *
 * Al final y sin condiciones no hay plantilla que la pueda perder. Y **no
 * reemplaza a `{pago}`**: los datos de pago de la cuenta son fijos y de toda la
 * cartera; esto es lo de ESTE cobro, y los dos pueden salir a la vez.
 *
 * No se le pone ninguna cabecera: la línea la escribe entera la persona, y
 * añadirle un «Puedes pagar así» delante sería ponerle palabras que no puso.
 */
export function conLaNota(mensaje: string, nota: string | null | undefined): string {
    const limpia = (nota ?? "").trim();
    if (!limpia) return mensaje;
    const base = mensaje.trimEnd();
    return base ? `${base}\n\n${limpia}` : limpia;
}

/**
 * El texto que se le manda, ya con sus variables puestas y con la nota al final.
 *
 * Vive aquí, con el resto de lo puro, porque lo usan **dos** caminos —el botón
 * «Cobrar ahora» y la vuelta diaria— y tienen que armar exactamente lo mismo.
 * Con la plantilla resuelta en cada sitio, el día que se afine una variable se
 * afina en uno y el otro se queda atrás; eso no se ve como un error sino como
 * «a veces el mensaje sale distinto».
 */
export function textoDelCobro(
    cobro: CobroParaEnviar,
    config: ConfigDeCobros,
    hito: Hito,
    ahora: Date,
): string {
    const plantilla = aplicarVariables(config.mensajes[hito], {
        cliente: cobro.contactoNombre.trim(),
        monto: montoConMoneda(cobro.monto, cobro.moneda),
        vence: fechaCorta(cobro.vence),
        dias: diasParaElMensaje(diasQueFaltan(cobro.vence, ahora)),
        concepto: cobro.concepto.trim(),
        pago: config.datosDePago.trim(),
    });
    return conLaNota(plantilla, cobro.notaDePago);
}

/* ── Las formas que viajan a la pantalla ──────────────────────────────────── */

export type Cobro = {
    id: string;
    /** La CUENTA dueña de la cartera. */
    ownerId: string;
    /** A quién se le cobra. */
    contactoNombre: string;
    /** Solo dígitos; el jid se arma al enviar. */
    contactoTelefono: string;
    /** El jid con el que se le escribe, si viene de un lead ya conocido. */
    contactoJid: string | null;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: string | null;
    /**
     * La línea de texto libre de ESTA deuda, la que sale al final del mensaje.
     *
     * Vive en la fila y no en `cobros_config.datosDePago` porque es justo lo
     * contrario de aquello: los datos de pago de la cuenta son uno solo para
     * toda la cartera, y esto cambia por contacto, por producto y por servicio.
     */
    notaDePago: string | null;
    estado: EstadoDeCobro;
    diasDeLicencia: number;
    diasDeGracia: number;
    /** Cuántos ciclos lleva pagados. Sale de `cobro_ciclos`. */
    ciclosPagados: number;
    ultimoRecordatorioEn: string | null;
    ultimoHito: Hito | null;
    confirmadaEn: string | null;
    creadoEn: string;
};

export type AdjuntoDeCobro = {
    id: string;
    cobroId: string;
    url: string;
    nombre: string;
    tipo: string;
    mimeType: string | null;
    tamanoBytes: number | null;
};

export type CobroConAdjuntos = Cobro & { adjuntos: AdjuntoDeCobro[] };

/** Un ciclo ya cobrado. Es el historial que no se pisa. */
export type CicloDeCobro = {
    id: string;
    cobroId: string;
    /** Qué vencimiento cerró este ciclo. */
    vencia: string | null;
    /** A qué fecha saltó al confirmarlo. */
    siguienteVence: string;
    monto: number | null;
    moneda: string;
    confirmadaEn: string;
    confirmadaPorId: string;
};

export type ConfigDeCobros = {
    ownerId: string;
    /** Texto libre: número de cuenta, enlace, lo que use cada uno. */
    datosDePago: string;
    mensajes: Record<Hito, string>;
    recordatorios: ConfigDeRecordatorios;
};

export function configPorDefecto(ownerId: string): ConfigDeCobros {
    return {
        ownerId,
        datosDePago: "",
        mensajes: { ...MENSAJES_POR_DEFECTO },
        recordatorios: { ...RECORDATORIOS_POR_DEFECTO },
    };
}
