// Las menciones de la campana, fingidas: el sondeo de 20 s no trae ninguna, así
// que las de la carga del servidor se quedan como llegaron.
export async function getCollabNotificationsAction() {
    return { success: true, data: [] };
}
export async function markCollabNotificationReadAction() {
    return { success: true };
}
