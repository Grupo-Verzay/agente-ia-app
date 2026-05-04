import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Reminders } from "@prisma/client";
import { getRemindersByUserId } from "@/actions/reminders-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { fetchInstanceAction } from "@/actions/fetch-intance-action";
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
            services: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
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

    const reminders = hasReminder(resReminder) ? resReminder.data.filter((r: Reminders) => r.isSchedule === true) : [];

    const countries = await getCountryCodes();

    let instancePhone: string | null = null;
    const primaryInstance = user.instancias?.[0];
    if (user.apiKey && primaryInstance) {
        const instanceRes = await fetchInstanceAction({
            evoUrl: user.apiKey.url,
            evoApiKey: primaryInstance.instanceId,
            instanceName: primaryInstance.instanceName,
        });
        const ownerJid = instanceRes.data?.[0]?.ownerJid;
        if (ownerJid) instancePhone = ownerJid.split("@")[0];
    }

    return <SchedulePageClient
        user={user}
        reminders={reminders}
        countries={countries}
        instancePhone={instancePhone}
    />

};

export default SchedulePage;
