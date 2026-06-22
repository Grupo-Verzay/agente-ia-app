import { notFound } from "next/navigation";
import { getPublicTeamData } from "@/actions/bookings-actions";
import { getCountryCodes } from "@/actions/get-country-action";
import { getActiveServiceBookingQuestions } from "@/actions/booking-questions-actions";
import { BookingPageClient } from "./_components/BookingPageClient";

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
