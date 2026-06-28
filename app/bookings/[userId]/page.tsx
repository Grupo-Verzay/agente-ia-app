import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTeamData } from "@/actions/bookings-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { getActiveServiceBookingQuestions } from "@/actions/booking-questions-actions";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { BookingPageClient } from "./_components/BookingPageClient";

// Favicon y título de la marca (reseller del asesor → plataforma → fallback),
// para que use el mismo favicon que la app y no el genérico.
export async function generateMetadata(
    { params }: { params: { userId: string } },
): Promise<Metadata> {
    const fallback: Metadata = { title: "Reservar cita", icons: { icon: "/favicon.ico" } };
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
            title: brand ? `Reservar cita | ${brand}` : "Reservar cita",
            description: "Programa una cita personalizada",
            icons: { icon: favicon },
        };
    } catch {
        return fallback;
    }
}

const BookingPublicPage = async ({
    params,
    searchParams,
}: {
    params: { userId: string };
    searchParams: { name?: string; phone?: string };
}) => {
    const [teamRes, countries, questions] = await Promise.all([
        getPublicTeamData(params.userId),
        getCountryCodes(),
        getActiveServiceBookingQuestions(params.userId),
    ]);

    if (!teamRes.success || !teamRes.data) return notFound();

    return (
        <BookingPageClient
            userId={params.userId}
            team={teamRes.data}
            countries={countries}
            prefillName={searchParams.name}
            prefillPhone={searchParams.phone}
            questions={questions}
        />
    );
};

export default BookingPublicPage;
