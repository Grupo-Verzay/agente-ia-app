import { redirect } from 'next/navigation';
import { BookOpen, Database, FileSpreadsheet, Lock, Sparkles } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import Header from '@/components/shared/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MyDataManagement } from './_components/MyDataManagement';
import { MyDataImport } from './_components/MyDataImport';
import { KnowledgeBaseSection } from './_components/KnowledgeBaseSection';
import type { Plan } from '@prisma/client';
import { PLAN_LABELS } from '@/types/plans';

export const dynamic = 'force-dynamic';

const ALLOWED_PLANS: Plan[] = ['intermedio', 'avanzado', 'enterprise', 'personalizado'];

function UpgradeRequired({ currentPlan }: { currentPlan: Plan }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md border-dashed">
        <CardHeader className="items-center text-center pb-3">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Funcionalidad no disponible</CardTitle>
          <CardDescription className="text-sm">
            Tu plan actual no incluye la gestión de datos externos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Plan actual:</span>
            <Badge variant="outline">{PLAN_LABELS[currentPlan]}</Badge>
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Disponible desde el plan <strong>Intermedio</strong>.</p>
            <p>Contacta a tu administrador para actualizar tu plan.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {ALLOWED_PLANS.map((plan) => (
              <Badge key={plan} className="text-xs bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-2.5 w-2.5 mr-1" />
                {PLAN_LABELS[plan]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function MyDataPage() {
  const user = await currentUser();

  if (!user) redirect('/login');

  const userPlan = user.plan;
  const hasAccess = ALLOWED_PLANS.includes(userPlan);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {!hasAccess ? (
        <>
          <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-2 shrink-0">
            <Header title="Mis Datos Externos" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            <UpgradeRequired currentPlan={userPlan} />
          </div>
        </>
      ) : (
        <Tabs defaultValue="import" className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-2 shrink-0 flex items-center justify-between">
            <h2 className="h3-bold text-gray-900 dark:text-white">Mis Datos Externos</h2>
            <TabsList>
              <TabsTrigger value="import" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Importar
              </TabsTrigger>
              <TabsTrigger value="management" className="gap-2">
                <Database className="h-4 w-4" />
                Gestión
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Base de Conocimiento
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="import" className="flex-1 min-h-0 overflow-y-auto mt-0">
            <MyDataImport userId={user.id} />
          </TabsContent>

          <TabsContent value="management" className="flex-1 min-h-0 overflow-y-auto mt-0">
            <MyDataManagement userId={user.id} />
          </TabsContent>

          <TabsContent value="knowledge" className="flex-1 min-h-0 overflow-y-auto mt-0 p-4">
            <KnowledgeBaseSection userId={user.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
