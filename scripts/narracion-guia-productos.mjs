/**
 * Lo que se DICE en el vídeo de la guía de Productos, frase a frase, en el
 * orden en que ocurre en pantalla. Misma forma que la de Leads
 * (`narracion-guia-leads.mjs`): `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena y `texto` lo que se oye, escrito como se lee.
 *
 * Una frase por idea, con lo que se hace en pantalla DENTRO de ella: el guion
 * (`capturar-guia-productos.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`).
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y con el mismo texto la voz sale
 * de la misma caché.
 */
export const NARRACION = {
    intro: {
        rotulo: "Productos: lo que vendes, en una tabla",
        texto: "Esta es la pantalla de Productos: aquí cargas lo que vendes, con su foto, su precio y sus unidades.",
    },
    menu: {
        rotulo: "El menú: Productos está en Entrenamiento",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Productos lo encuentras dentro de Entrenamiento.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    buscar: {
        rotulo: "Buscar por nombre, código o categoría",
        texto: "Con el buscador encuentras un producto por su nombre, su código o su categoría, y al borrarlo vuelven todos.",
    },
    cifras: {
        rotulo: "Las cifras y tu cupo del plan",
        texto: "Estas cifras te dicen cuántos productos tienes, cuántos están activos, cuántos se agotaron y cuántos te quedan en tu plan.",
    },
    verCatalogo: {
        rotulo: "Ver catálogo: así lo ve tu cliente",
        texto: "Con este botón abres tu catálogo público, tal como lo ve tu cliente, con cada producto activo en su tarjeta.",
    },
    nuevo: {
        rotulo: "Nuevo: crear un producto",
        texto: "Para crear uno, pulsa Nuevo y escribe el nombre, el precio y la categoría, que son lo único obligatorio.",
    },
    detalles: {
        rotulo: "Fotos, código e inventario",
        texto: "Arriba agregas hasta cuatro fotos, y abajo pones el código, controlas las unidades con este interruptor y sumas una descripción.",
    },
    guardar: {
        rotulo: "Guardar",
        texto: "Pulsas Guardar y el producto aparece en la tabla, y en tu catálogo si está activo.",
    },
    editar: {
        rotulo: "Editar, ordenar y eliminar",
        texto: "Con el lápiz lo editas, con el asa de la izquierda lo arrastras a otro lugar, y la papelera lo elimina después de confirmar.",
    },
    cierre: {
        rotulo: "Así se trabaja con Productos",
        texto: "El orden de esta tabla es el orden de tu catálogo. Así se trabaja con Productos.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
