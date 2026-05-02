import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

const KanbanPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');
    redirect('/crm/dashboard?view=kanban');
};

export default KanbanPage;
