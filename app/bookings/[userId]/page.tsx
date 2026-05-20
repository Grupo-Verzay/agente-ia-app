import { notFound } from "next/navigation";
import { getPublicTeamData } from "@/actions/bookings-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { BookingPageClient } from "./_components/BookingPageClient";

const BookingPublicPage = async ({
    params,
    searchParams,
}: {
    params: { userId: string };
    searchParams: { name?: string; phone?: string };
}) => {
    const [teamRes, countries] = await Promise.all([
        getPublicTeamData(params.userId),
        getCountryCodes(),
    ]);

    if (!teamRes.success || !teamRes.data) return notFound();

    return (
        <BookingPageClient
            userId={params.userId}
            team={teamRes.data}
            countries={countries}
            prefillName={searchParams.name}
            prefillPhone={searchParams.phone}
        />
    );
};

export default BookingPublicPage;
