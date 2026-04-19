import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Reminders } from "@prisma/client";
import { getRemindersByUserId } from "@/actions/reminders-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { SchedulePageClient } from "../_components/SchedulePageClient";

function hasReminder(result: { data?: Reminders[] }): result is { data: Reminders[] } {
    return !!result.data
}

// Puedes precargar el asesor para mostrar info contextual
const SchedulePage = async ({ params }: { params: { userId: string } }) => {
    const user = await db.user.findUnique({
        where: { id: params.userId },
        include: {
            instancias: true,
            services: true,
            apiKey: true,
        },
    });

    // Manejo si no se encuentra el usuario
    if (!user) return notFound();

    const resReminder = await getRemindersByUserId(user.id)
    if (!resReminder.success) {
        console.error("[REMINDERS_PAGE] Error al obtener recordatorios:", resReminder.message)
        return <strong>404</strong>
    }

    const reminders = hasReminder(resReminder) ? resReminder.data : [];

    const countries = await getCountryCodes();

    if (countries.length === 0) return ('Error al obtener los paises.')

    return <SchedulePageClient
        user={user}
        reminders={reminders}
        countries={countries}
    />

};

export default SchedulePage;
