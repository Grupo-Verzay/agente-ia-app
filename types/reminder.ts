type ReminderTemplate = {
    id: number;
    title: string;
    description?: string;
    time: string;
};


export const DEFAULT_REMINDERS_TEMPLATES: ReminderTemplate[] = [
    {
        id: 0,
        title: "📌 RECORDATORIO — 24 HORAS",
        time: "days-1",
        description:
            "👋 Hola @client_name, te recordamos que *MAÑANA* es tu sesión.\n\n⏱️ Ten en cuenta que el *tiempo disponible* es el que se indicó en tu reserva",
    },
    {
        id: 1,
        title: "📌 RECORDATORIO — 3 HORAS",
        time: "hours-3",
        description:
            "👋 Hola @client_name, en *3 HORAS* comienza tu sesión.\n\n⏱️ Recuerda que el tiempo disponible es el que se indicó en tu reserva",
    },
    {
        id: 2,
        title: "📌 RECORDATORIO — 1 HORA",
        time: "hours-1",
        description:
            "🔔 *Recordatorio*\n\n@client_name, en *UNA HORA* comienza tu sesión.\n\n⏱️ Por favor estar a tiempo para poder comenzar sin retrasos.",
    },
    {
        id: 3,
        title: "📌 RECORDATORIO — 30 MINUTOS",
        time: "minutes-30",
        description:
            "🔔 *Recordatorio*\n\n@client_name, en *30 MINUTOS* comenzamos tu sesión.\n\n📲 Si es necesario, te enviaremos los *detalles de ingreso* por este medio 1 minuto antes.",
    },
    {
        id: 4,
        title: "📌 RECORDATORIO — 1 MINUTO",
        time: "minutes-1",
        description:
            "😊 *¡Comenzamos!*\n\n@client_name, tu sesión empieza en *1 MINUTO*. Por favor ingresa para comenzar a tiempo.",
    },
];

// ── Bookings: recordatorios por defecto por servicio ──────────────────────────
// El módulo de Bookings guarda los recordatorios en TeamService.remindersConfig
// como { title, timeMinutes, message }, donde timeMinutes son los minutos ANTES
// de la cita. Convertimos las plantillas globales ("days-1", "hours-3", ...) a
// ese formato para sembrarlos al crear un servicio.

export type ServiceReminderDefault = {
    title: string;
    timeMinutes: number;
    message: string;
};

function timeStringToMinutes(time: string): number {
    const [unit, numStr] = time.split("-");
    const n = parseInt(numStr, 10) || 0;
    if (unit === "hours") return n * 60;
    if (unit === "days") return n * 1440;
    return n;
}

export const DEFAULT_SERVICE_REMINDERS: ServiceReminderDefault[] =
    DEFAULT_REMINDERS_TEMPLATES.map((tpl) => ({
        title: tpl.title,
        timeMinutes: timeStringToMinutes(tpl.time),
        message: tpl.description ?? "",
    }));
