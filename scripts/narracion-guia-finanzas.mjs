/**
 * Lo que se DICE en el vídeo de la guía de Finanzas, frase a frase, en el
 * orden en que ocurre en pantalla. Misma forma que la de Leads
 * (`narracion-guia-leads.mjs`): `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena y `texto` lo que se oye, escrito como se lee.
 *
 * Una frase por idea, con lo que se hace en pantalla DENTRO de ella: el guion
 * (`capturar-guia-finanzas.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`). Frases sueltas de cuatro palabras son las que dejan la
 * narración cortada.
 *
 * Recorre el módulo en el orden de las secciones de la guía —el menú, la barra
 * de arriba, los accesos, el resumen y su gráfica, Ventas, Gastos, el filtro de
 * fecha, Clientes y Proveedores, Cuentas y Configuración—, y el banco
 * (`lib/__tests__/video-guia-finanzas.test.mjs`) lo comprueba.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y con el mismo texto la voz sale
 * de la misma caché.
 */
export const NARRACION = {
    intro: {
        rotulo: "Finanzas: tus ventas, tus gastos y tu balance",
        texto: "Esta es la pantalla de Finanzas: aquí llevas las ventas, los gastos y el balance de tu negocio, mes a mes.",
    },
    menu: {
        rotulo: "El menú: Finanzas está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Finanzas lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    accesos: {
        rotulo: "Los accesos a cada pantalla de Finanzas",
        texto: "Debajo tienes los accesos a cada pantalla de Finanzas, como Ventas, Gastos y Cuentas, y la que estás viendo sale marcada.",
    },
    resumen: {
        rotulo: "El balance de cada mes",
        texto: "El resumen te dice cuánto te quedó cada mes: un mes en rojo gastó más de lo que vendió, y con estas flechas cambias de año.",
    },
    grafica: {
        rotulo: "Las ventas y los gastos del mes, día a día",
        texto: "Pulsa un mes y abajo ves sus ventas y sus gastos, día a día.",
    },
    ventas: {
        rotulo: "Ventas: cada venta en su fila",
        texto: "En Ventas está cada venta con su concepto, su total, su fecha y la cuenta donde entró el dinero.",
    },
    nuevaVenta: {
        rotulo: "Nuevo: anotar una venta",
        texto: "Con Nuevo anotas una venta: el producto, el contacto, el monto y la cuenta, y a la derecha ves cómo queda.",
    },
    gastos: {
        rotulo: "Gastos: fijos o variables",
        texto: "En Gastos está lo que pagaste, y cada gasto dice si es fijo o variable.",
    },
    periodo: {
        rotulo: "Todo, un mes o un rango de fechas",
        texto: "Con el botón de fecha ves todo, un solo mes o un rango de días.",
    },
    contactos: {
        rotulo: "Clientes y proveedores, con su ficha",
        texto: "En Clientes y en Proveedores llevas la ficha de cada uno, con los campos que tú quieras.",
    },
    cuentas: {
        rotulo: "Cuentas: el saldo de cada una",
        texto: "En Cuentas ves cuánto entró y cuánto salió de cada cuenta de dinero, y su saldo.",
    },
    cierre: {
        rotulo: "Configuración: tu moneda",
        texto: "Y en Configuración eliges la moneda en la que salen tus importes. Así se trabaja con Finanzas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes). */
const PRONUNCIACION = [];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
