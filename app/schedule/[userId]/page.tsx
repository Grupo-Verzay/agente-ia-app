import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import type { UserConServicios } from "@/schema/schema";
import { getCountryCodes } from "@/actions/get-country-action";
import { fetchInstanceAction } from "@/actions/fetch-intance-action";
import { getActiveBookingQuestions } from "@/actions/booking-questions-actions";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import type { Metadata } from "next";
import { SchedulePageClient } from "../_components/SchedulePageClient";

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

// Lo que viaja al navegador es `UserConServicios`: una lista CERRADA. Antes se
// pasaba la fila entera de `User` con `apiKey` e `instancias` incluidas, o sea
// la clave GLOBAL del servidor de Evolution y el token de cada línea, a
// cualquiera que abriera este enlace. Lo que necesita claves —programar los
// recordatorios, avisar al dueño, confirmar al cliente— lo hace el servidor a
// partir del id de la cita (`confirmarLaCitaPublicaAction`).
const SchedulePage = async ({ params, searchParams }: { params: { userId: string }; searchParams: { name?: string; phone?: string } }) => {
    const user = await db.user.findUnique({
        where: { id: params.userId },
        select: {
            id: true,
            image: true,
            company: true,
            timezone: true,
            meetingDuration: true,
            minNoticeMinutes: true,
            apiKey: { select: { url: true } },
            instancias: { select: { instanceName: true, instanceId: true } },
            services: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        },
    });

    // Manejo si no se encuentra el usuario
    if (!user) return notFound();

    const [countries, questions, availability] = await Promise.all([
        getCountryCodes(),
        getActiveBookingQuestions(user.id),
        db.userAvailability.findMany({
            where: { userId: user.id },
            select: { dayOfWeek: true },
            distinct: ['dayOfWeek'],
        }),
    ]);
    const availableWeekdays = availability.map((a) => a.dayOfWeek);

    // El teléfono de la línea se pregunta AQUÍ, en el servidor, con el token de
    // la línea; al navegador solo le llega el número resultante.
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

    const cuenta: UserConServicios = {
        id: user.id,
        image: user.image,
        company: user.company,
        timezone: user.timezone,
        meetingDuration: user.meetingDuration,
        minNoticeMinutes: user.minNoticeMinutes,
        services: user.services,
        lineaDeLaAgenda: primaryInstance?.instanceName ?? null,
    };

    return <SchedulePageClient
        user={cuenta}
        countries={countries}
        instancePhone={instancePhone}
        prefillName={searchParams.name}
        prefillPhone={searchParams.phone}
        questions={questions}
        availableWeekdays={availableWeekdays}
    />

};

export default SchedulePage;
