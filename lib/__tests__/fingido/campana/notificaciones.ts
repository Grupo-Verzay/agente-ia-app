// La acción de la campana, fingida para el banco del navegador: devuelve un
// aviso de cada clase, con los textos más largos que salen de verdad, para que
// la rejilla se mida con contenido real.
const ahora = new Date("2026-09-28T15:00:00Z").toISOString();

const item = (id: string, kind: string, title: string, description: string, href: string) => ({
    id, kind, title, description, href, date: ahora,
});

export async function getNotificationCenterData() {
    const items = [
        item("tarea:1", "tarea", "Te asignaron una tarea", "Llamar a Marta", "/tareas"),
        item("collab:1", "mention", "Yair te mencionó en una conversación", "@Carlos mira esto", "/chats"),
        item("asignacion:1", "asignacion", "Te asignaron el chat con Marta López", "Carlos Arcos te lo asignó.", "/chats?jid=573001112233%40s.whatsapp.net"),
        item("asignacion:2", "asignacion", "Te quitaron el chat con Pedro Pérez", "Carlos Arcos lo movió.", "/chats"),
        item("creditos:5:2026-09-28T10:00:00.000Z", "creditos", "Urgente: te queda el 5 % de los créditos", "Quedan 520 de 12000 créditos. Recarga ya para no interrumpir tu servicio.", "/profile"),
        item("connection-no-apikey", "connection", "API Key sin configurar", "Configura una API Key", "/profile"),
        item("appointment-1", "appointment", "Marta López", "Cita pendiente", "/schedule"),
        item("followup-1", "followup", "Seguimiento", "Seguimiento pendiente", "/tareas"),
        item("task-1", "task", "Tarea vencida", "Tarea vencida", "/tareas"),
    ];
    // El «antes» no conocía las clases nuevas: pintarlas lo tumbaría por algo
    // que no es lo que el banco viene a afirmar.
    if ((window as any).__soloViejas) {
        for (let i = items.length - 1; i >= 0; i--) {
            if (["correo", "asignacion", "creditos"].includes(items[i].kind)) items.splice(i, 1);
        }
    }
    // El peor caso del banco: más de 99 de cada clase, o sea «99+» en todas.
    if ((window as any).__muchos) {
        for (const base of items.slice()) {
            for (let n = 0; n < 120; n++) items.push({ ...base, id: `${base.id}-${n}` });
        }
    }
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
    return { success: true, data: { total: items.length, counts, items } };
}
