import { redirect } from 'next/navigation';
import { Bot, Database, FileSpreadsheet, Lock, Sparkles } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import Header from '@/components/shared/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MyDataManagement } from './_components/MyDataManagement';
import { MyDataImport } from './_components/MyDataImport';
import { MyToolsManagement } from './_components/MyToolsManagement';
import type { Plan } from '@prisma/client';
import { PLAN_LABELS } from '@/types/plans';

export const dynamic = 'force-dynamic';

// Planes que tienen acceso a esta funcionalidad
const ALLOWED_PLANS: Plan[] = ['intermedio', 'avanzado', 'enterprise', 'personalizado', 'unico'];

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

  const userPlan = (user as any).plan as Plan;
  const hasAccess = ALLOWED_PLANS.includes(userPlan);

  return (
    <>
      <Header title="Mis Datos Externos" />
      {!hasAccess ? (
        <UpgradeRequired currentPlan={userPlan} />
      ) : (
        <Tabs defaultValue="tools">
          <TabsList className="mb-4">
            <TabsTrigger value="tools" className="gap-2">
              <Bot className="h-4 w-4" />
              Herramientas IA
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Importar
            </TabsTrigger>
            <TabsTrigger value="management" className="gap-2">
              <Database className="h-4 w-4" />
              Gestión
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tools">
            <MyToolsManagement userId={user.id} />
          </TabsContent>

          <TabsContent value="import">
            <MyDataImport userId={user.id} />
          </TabsContent>

          <TabsContent value="management">
            <MyDataManagement userId={user.id} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
