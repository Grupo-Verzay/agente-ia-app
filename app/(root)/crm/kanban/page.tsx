import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Kanban, Users, Activity, TrendingUp, CheckCheck } from 'lucide-react';
import { KanbanBoard } from './_components/KanbanBoard';
import { MetricCard } from '@/components/custom/MetricCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getAnalyticsDataByUserId } from '@/actions/analytics-action';

const KanbanPage = async () => {
    const user = await currentUser();
    if (!user) redirect('/login');

    const analyticsRes = await getAnalyticsDataByUserId(user.id, 'all');
    const a = analyticsRes?.success ? analyticsRes.data : null;

    return (
        <div className="p-4 md:p-6 flex flex-col gap-4 min-w-0">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Kanban className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold">Pipeline CRM</h1>
                    <p className="text-sm text-muted-foreground">Arrastra los contactos entre columnas para actualizar su estado</p>
                </div>
            </div>

            <TooltipProvider delayDuration={120}>
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                        <MetricCard
                            icon={<Users className="h-4 w-4" />}
                            label="Frío"
                            value={a?.leadStatusCounts.FRIO ?? 0}
                            helper="Leads en etapa fría"
                            color="#3B82F6"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<Activity className="h-4 w-4" />}
                            label="Tibio"
                            value={a?.leadStatusCounts.TIBIO ?? 0}
                            helper="Leads en etapa tibia"
                            color="#F59E0B"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<TrendingUp className="h-4 w-4" />}
                            label="Caliente"
                            value={a?.leadStatusCounts.CALIENTE ?? 0}
                            helper="Leads en etapa caliente"
                            color="#EF4444"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<CheckCheck className="h-4 w-4" />}
                            label="Finalizado"
                            value={a?.leadStatusCounts.FINALIZADO ?? 0}
                            helper={`${a?.leadStatusCounts.DESCARTADO ?? 0} descartados`}
                            color="#22C55E"
                        />
                    </div>
                </div>
            </TooltipProvider>

            <KanbanBoard />
        </div>
    );
};

export default KanbanPage;
