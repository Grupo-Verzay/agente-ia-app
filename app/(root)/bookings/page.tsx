import { currentUser } from '@/lib/auth';
import { getOrCreateTeam } from '@/actions/bookings-actions';
import { MainBookings } from './_components/MainBookings';

const BookingsPage = async () => {
    const user = await currentUser();
    if (!user) return null;

    const effectiveId: string = (user as any).effectiveId ?? user.id;
    const res = await getOrCreateTeam(effectiveId);

    if (!res.success || !res.data) {
        return <strong className="text-red-500">No se pudo cargar el equipo. Intenta de nuevo.</strong>;
    }

    return <MainBookings user={user} team={res.data} />;
};

export default BookingsPage;
