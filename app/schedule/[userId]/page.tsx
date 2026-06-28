import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Reminders } from "@prisma/client";
import { getRemindersByUserId } from "@/actions/reminders-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { fetchInstanceAction } from "@/actions/fetch-intance-action";
import { getActiveBookingQuestions } from "@/actions/booking-questions-actions";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import type { Metadata } from "next";
import { SchedulePageClient } from "../_components/SchedulePageClient";

function hasReminder(result: { data?: Reminders[] }): result is { data: Reminders[] } {
    return !!result.data
}

// Favicon y título de la marca (reseller del asesor → plataforma → fallback),
// para que estas páginas usen el mismo favicon que la app y no el genérico.
export async function generateMetadata(
    { params }: { params: { userId: string } },
): Promise<Metadata> {
    const fallback: Metadata = { title: "Agendar cita", icons: { icon: "/favicon.ico" } };
    try {
        const [reseller, siteConfig] = await Promise.all([
            getResellerProfileForUser(params.userId),
            getSiteConfig(),
        ]);
        const favicon =
            reseller?.data?.faviconUrl?.trim() ||
            siteConfig.faviconUrl?.trim() ||
            "/favicon.ico";
        const brandName = reseller?.data?.brandName?.trim() || siteConfig.brandName?.trim();
        const company = reseller?.data?.company?.trim();
        const brand = brandName || (company && company !== "Empresa Demo" ? company : null);
        return {
            title: brand ? `Agendar cita | ${brand}` : "Agendar cita",
            description: "Programa una cita personalizada con nuestro asesor",
            icons: { icon: favicon },
        };
    } catch {
        return fallback;
    }
}

// Puedes precargar el asesor para mostrar info contextual
const SchedulePage = async ({ params, searchParams }: { params: { userId: string }; searchParams: { name?: string; phone?: string } }) => {
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

    const reminders = Array.isArray(resReminder.data)
        ? (resReminder.data as Reminders[]).filter((r) => r.isSchedule === true)
        : [];

    const [countries, questions] = await Promise.all([
        getCountryCodes(),
        getActiveBookingQuestions(user.id),
    ]);

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
        prefillName={searchParams.name}
        prefillPhone={searchParams.phone}
        questions={questions}
    />

};

export default SchedulePage;
