type ReminderTemplate = {
    id: number;
    title: string;
    description?: string;
    time: string;
};


export const DEFAULT_REMINDERS_TEMPLATES: ReminderTemplate[] = [
    {
        id: 0,
        title: "Recordatorio 24 horas",
        time: "days-1",
        description:
            "🔔 Recordatorio\n\n@client_name, recuerda que mañana es tu consulta.\nTe recordamos que el tiempo disponible es el que se acordó previamente.",
    },
    {
        id: 1,
        title: "Recordatorio 3 horas",
        time: "hours-3",
        description:
            "🔔 Recordatorio\n\n@client_name, en 3 horas inicia tu consulta.\nTe recordamos que el tiempo disponible es el que se acordó previamente.",
    },
    {
        id: 2,
        title: "Recordatorio 1 hora",
        time: "hours-1",
        description:
            "🔔 Recordatorio\n\n@client_name, en 1 hora inicia tu consulta.\nTe estaremos atendiendo de forma oportuna en el horario acordado.",
    },
    {
        id: 3,
        title: "Recordatorio 5 minutos (consulta)",
        time: "minutes-5",
        description:
            "👨🏻‍💻 *Inicio Reunión*⏱️\n\nComenzamos *5 minutos*.",
    },
    {
        id: 4,
        title: "Recordatorio 1 minuto (inicio)",
        time: "minutes-1",
        description: "Listo, @client_name. Comenzamos YA. ",
    },
];
