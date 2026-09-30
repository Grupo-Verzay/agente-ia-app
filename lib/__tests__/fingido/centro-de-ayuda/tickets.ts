/**
 * Las acciones de tickets para el banco del centro de ayuda: una cuenta
 * cliente que SÍ puede abrir tickets, así «Soporte» se pinta en la barra y se
 * puede medir «Ayuda» contra él. Con la acción muda de siempre el botón no
 * sale (`puede` llega vacío) y no habría con qué comparar.
 */
export async function puedoAbrirTicketsAction() {
    return { puede: true, soyElDestino: false, userId: "cliente-1", whatsapp: null };
}
export async function abrirTicketAction() {
    return { success: true };
}
