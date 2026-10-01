// «Soporte» en el arnés de la barra: con la respuesta genérica de las acciones
// mudas no se pinta (`puede` y `soyElDestino` faltan), y en un teléfono es uno
// de los iconos que se reparten el ancho. Para medir la barra como la ve un
// cliente, contesta lo que contesta a una cuenta cliente: puede abrir tickets.
export const puedoAbrirTicketsAction = async () => ({
    puede: true,
    soyElDestino: false,
    userId: "u1",
    whatsapp: null,
});
export const abrirTicketAction = async () => ({ success: true, data: null });
