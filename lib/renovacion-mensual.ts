/**
 * Renovación mensual: de las cuentas que vencían en un mes, cuántas siguieron.
 *
 * ## Por qué esto necesita una tabla propia y no se puede calcular hoy
 *
 * `UserBilling.dueDate` es **una sola columna que se pisa**: al cobrar,
 * `setUserBillingDueDateInternal` la mueve al mes siguiente y la fecha vieja
 * desaparece. Así que de una cuenta que renovó **no queda ni rastro de cuándo
 * vencía antes**, y esa es justo la mitad de arriba de la fracción.
 *
 * Lo que sí sobrevive es lo contrario: quien NO renovó tiene su `dueDate`
 * clavado en el mes en que venció. O sea que del estado de hoy se puede sacar
 * la lista de los que se fueron y **no** el porcentaje, porque falta el
 * denominador.
 *
 * Y todavía peor: al mes, la cuenta morosa **se elimina** (`billing-job`), así
 * que con el tiempo hasta esa mitad se borra sola.
 *
 * Por eso hay una tabla que anota la cohorte **mientras se puede**, con el
 * nombre y el correo copiados dentro: la fila tiene que seguir contando
 * después de que la cuenta deje de existir.
 *
 * ## Y por eso un mes puede no tener porcentaje
 *
 * Un mes anterior a que empezara a anotarse no tiene cohorte completa: están
 * los que no renovaron (se dedujeron de su `dueDate` clavado) y faltan los que
 * sí. Dividir con eso daría **0 %** siempre, que es el peor número posible:
 * parece una fuga total y es un dato que no existe.
 *
 * Así que ese mes se marca como parcial y **no se calcula el porcentaje**. La
 * lista sí se enseña, que esa es cierta. Es la regla de siempre: *un número
 * que no se puede calcular no se sustituye por otro*.
 */

/** La llave de un mes, `YYYY-MM`. Es texto para que ordene igual que la fecha. */
export type ClaveDeMes = string;

/** Una cuenta de la cohorte de un mes. Es una fila de la tabla. */
export type CuentaDeLaCohorte = {
    userId: string;
    /** Copiados al anotar: la cuenta puede no existir cuando se lea. */
    nombre: string | null;
    correo: string | null;
    fechaDeVencimiento: string;
    /** `null` = no renovó. */
    renovoEn: string | null;
};

export type MesDeRenovacion = {
    mes: ClaveDeMes;
    cuentas: CuentaDeLaCohorte[];
    /**
     * La cohorte está incompleta porque el mes empezó antes de que se anotara.
     * Con esto puesto **no hay porcentaje**, solo lista.
     */
    parcial: boolean;
};

export type VistaDeLaRenovacion = {
    /** El último mes CERRADO. `null` si todavía no hay ninguno anotado. */
    mes: MesDeRenovacion | null;
};

export type ResumenDeRenovacion = {
    mes: ClaveDeMes;
    total: number;
    renovaron: number;
    seFueron: number;
    /** `null` cuando no se puede calcular. Nunca un cero de relleno. */
    porcentaje: number | null;
    parcial: boolean;
    /** Solo las que NO renovaron, de la que venció antes a la que venció después. */
    seFueronEstas: CuentaDeLaCohorte[];
};

/** `YYYY-MM` de una fecha, en UTC. */
export function claveDeMes(fecha: Date): ClaveDeMes {
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * El último mes CERRADO visto desde `ahora`.
 *
 * El mes en curso va a medias —quien vence el 28 todavía no ha tenido ocasión
 * de renovar— y medio mes siempre parece otra cosa de lo que fue. Es el mismo
 * criterio con el que la vigilancia de Chats juzga ayer y no hoy.
 */
export function ultimoMesCerrado(ahora: Date): ClaveDeMes {
    const primeroDeEsteMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
    const unDiaAntes = new Date(primeroDeEsteMes.getTime() - 24 * 60 * 60 * 1000);
    return claveDeMes(unDiaAntes);
}

/**
 * Los dos extremos de un mes, del día 1 a las 00:00 al día 1 del siguiente.
 *
 * El final es **exclusivo** a propósito: así da igual que el mes tenga 28, 30 o
 * 31 días y no hay que contarlos. Con un final inclusivo hecho a mano, febrero
 * y los meses de 31 se equivocan por un día, y ese día es el que más vence.
 */
export function extremosDelMes(mes: ClaveDeMes): { desde: Date; hasta: Date } {
    const [anio, m] = mes.split("-").map(Number);
    return {
        desde: new Date(Date.UTC(anio, m - 1, 1)),
        hasta: new Date(Date.UTC(anio, m, 1)),
    };
}

/** Si el mes ya estaba empezado cuando se anotó por primera vez, va incompleto. */
export function esCohorteParcial(mes: ClaveDeMes, empezoAAnotarse: Date | null): boolean {
    if (!empezoAAnotarse) return true;
    return empezoAAnotarse.getTime() > extremosDelMes(mes).desde.getTime();
}

/**
 * Los números de la tarjeta.
 *
 * `porcentaje` es `null` en dos casos, y los dos son «no se puede saber», no
 * «cero»: cuando la cohorte es parcial y cuando no hay ni una cuenta. Dividir
 * entre cero o dividir con la mitad de arriba ausente da un número que parece
 * una fuga y no lo es.
 */
export function resumirLaRenovacion(mes: MesDeRenovacion): ResumenDeRenovacion {
    const total = mes.cuentas.length;
    const renovaron = mes.cuentas.filter((c) => c.renovoEn !== null).length;
    const seFueronEstas = mes.cuentas
        .filter((c) => c.renovoEn === null)
        .sort((a, b) => a.fechaDeVencimiento.localeCompare(b.fechaDeVencimiento));

    const sePuedeCalcular = !mes.parcial && total > 0;

    return {
        mes: mes.mes,
        total,
        renovaron,
        seFueron: seFueronEstas.length,
        porcentaje: sePuedeCalcular ? Math.round((renovaron / total) * 100) : null,
        parcial: mes.parcial,
        seFueronEstas,
    };
}

/** «agosto de 2026», para el rótulo. */
export function nombreDelMes(mes: ClaveDeMes): string {
    const { desde } = extremosDelMes(mes);
    return desde.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}
