/**
 * **Cuántos créditos le quedan a una cuenta**, contestado en UN solo sitio.
 *
 * Puro a propósito: de aquí tiran el lector de la base, las cuatro pantallas
 * que transcriben audio y el Perfil, y así la regla se prueba sin levantar
 * nada.
 *
 * # Por qué existe este fichero
 *
 * Esta pregunta se contestaba en **dos** sitios con **dos** reglas distintas, y
 * los dos deciden sobre la misma llamada:
 *
 * | | el motor (autoriza la LLAMADA) | la App (autoriza la TRANSCRIPCIÓN) |
 * | --- | --- | --- |
 * | la cuenta paga su propia IA | ilimitado | ilimitado ✓ |
 * | **`total < 0`** (el «sin tope» que se pone a mano) | **ilimitado** | **0** ✗ |
 * | **sin fila de créditos** | «no se encontraron créditos» | **0** ✗ |
 *
 * Las dos filas en negrita son exactamente el fallo reportado: **la llamada
 * sale bien y la transcripción dice «hacen falta 14 y quedan 0»**, sobre la
 * MISMA cuenta y en el mismo minuto. No era que la transcripción mirara el
 * saldo de otra cuenta —la cadena entera va por la dueña de la línea: el `sid`
 * con el que se llama, la fila en la que se anota y la bolsa de la que se
 * cobra— era que las dos mitades no se ponían de acuerdo sobre lo que ese
 * saldo significa.
 *
 * # «Sin bolsa» NO es «quedan cero»
 *
 * Y son dos cosas distintas que llevan a acciones distintas: una se arregla
 * **recargando** y la otra **asignándole un cupo a esa cuenta**, que es una
 * pantalla distinta y otra persona. Devolver `0` para las dos es la misma
 * trampa que ya costó una vuelta en el recorte de módulos de una mudanza: *una
 * lista vacía casi nunca significa lo mismo que una lista con ceros*. Por eso
 * esto es una unión discriminada y no un número: **el compilador no deja**
 * leer los créditos sin haber mirado antes el estado.
 *
 * # Y no sube a la MADRE
 *
 * A propósito, y distinto de las notas del chat de equipo: los créditos se
 * descuentan siempre de la cuenta que hace la acción, y una llamada la hace,
 * la configura y la gasta la cuenta dueña de la línea (Ventas por Ventas). Si
 * alguna vez esto se «arregla» cayendo a la bolsa de la madre, vuelve el fallo
 * de «la llamada queda en la cuenta de quien mira» movido a los créditos.
 */

/** Lo que sabe la plataforma de la bolsa de una cuenta. */
export type SaldoDeLaCuenta =
    /** Sin tope: paga su propia IA, o su total es negativo a propósito. */
    | { estado: "ilimitado" }
    /** No tiene fila de créditos: nadie le ha asignado un cupo todavía. */
    | { estado: "sin_bolsa" }
    /** Tiene bolsa, y le quedan estos créditos (nunca negativo). */
    | { estado: "quedan"; creditos: number };

/** 1 crédito = 3.085 tokens. Lo que ya sabe el resto de la App. */
export const TOKENS_POR_CREDITO = 3085;

/**
 * La regla, sobre la fila tal cual está en `ia_credits`.
 *
 * Es **la misma** que `AiCreditsService.getCreditsByUser` del motor, paso por
 * paso y en el mismo orden:
 *
 * 1. **Quien paga su propia IA no tiene tope**, y se pregunta ANTES de leer la
 *    fila: una cuenta con su key puede no tener bolsa siquiera.
 * 2. **Sin fila no hay saldo que calcular.** No es cero — ver arriba.
 * 3. **Un `total` negativo es «sin tope»**, escrito a mano por quien administra.
 *    Esta era la línea que le faltaba a la App, y la que dejaba una cuenta
 *    ilimitada con «quedan 0».
 * 4. Y solo entonces la resta, que **nunca** toca `used` y `total` en la misma
 *    comparación: son tokens y créditos, y confundirlos es el fallo que ya
 *    costó el «sin créditos» del voicebot con 4 gastados de 12.000.
 */
export function elSaldoDeLaFila(input: {
    fila: { total: number; used: number } | null | undefined;
    /** `true` cuando la cuenta usa su propia llave de OpenAI. */
    pagaSuIa: boolean;
}): SaldoDeLaCuenta {
    if (input.pagaSuIa) return { estado: "ilimitado" };
    if (!input.fila) return { estado: "sin_bolsa" };
    if (input.fila.total < 0) return { estado: "ilimitado" };

    const usados = Math.floor(input.fila.used / TOKENS_POR_CREDITO);
    return { estado: "quedan", creditos: Math.max(0, input.fila.total - usados) };
}

/** Si con este saldo se puede pagar algo que cuesta `creditos`. */
export function alcanzaPara(saldo: SaldoDeLaCuenta, creditos: number): boolean {
    if (saldo.estado === "ilimitado") return true;
    if (saldo.estado === "sin_bolsa") return false;
    return saldo.creditos >= creditos;
}

/**
 * Si hay que descontar. **Solo cuando hay bolsa de verdad**: un `updateMany`
 * sobre una cuenta sin fila toca cero filas y no dice nada, así que llamarlo
 * sería una escritura que finge haber cobrado.
 */
export function seCobra(saldo: SaldoDeLaCuenta): boolean {
    return saldo.estado === "quedan";
}

/**
 * Lo que se le enseña a una persona junto al aviso: el número de créditos, o
 * `null` cuando no hay ninguno que enseñar.
 *
 * **`null` no se sustituye por `0`** al pintarlo: «quedan 0» sobre una cuenta
 * sin bolsa se lee como «se te acabaron» y manda a recargar algo que nunca se
 * asignó. Es la regla de siempre —*un número que no se puede calcular no se
 * sustituye por otro*—.
 */
export function loQueQueda(saldo: SaldoDeLaCuenta): number | null {
    return saldo.estado === "quedan" ? saldo.creditos : null;
}

/** Para los registros: una línea corta que dice en qué estado está la bolsa. */
export function comoSeLeeElSaldo(saldo: SaldoDeLaCuenta): string {
    if (saldo.estado === "ilimitado") return "ilimitados";
    if (saldo.estado === "sin_bolsa") return "sin bolsa de creditos";
    return `${saldo.creditos} creditos`;
}
