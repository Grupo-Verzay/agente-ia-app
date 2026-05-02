import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { KanbanBoard } from './_components/KanbanBoard';
import { Kanban } from 'lucide-react';

const KanbanPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Kanban className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold">Pipeline CRM</h1>
                    <p className="text-sm text-muted-foreground">Arrastra los contactos entre columnas para actualizar su estado</p>
                </div>
            </div>

            <KanbanBoard />
        </div>
    );
};

export default KanbanPage;
