import AccessDenied from '@/app/AccessDenied';
import { getClientsForSelector } from '@/actions/userClientDataActions';
import { currentUser } from '@/lib/auth';
import { isAdminLike, isAdminOrReseller } from '@/lib/rbac';
import { Bot, Database, FileSpreadsheet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalDataImportClient } from './_components/ExternalDataImportClient';
import { ExternalClientDataManagement } from './_components/ExternalClientDataManagement';
import { ExternalDataToolConfigManagement } from './_components/ExternalDataToolConfigManagement';

export const dynamic = 'force-dynamic';

export default async function ExternalDataPage() {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  }

  const resClients = isAdminOrReseller(user.role)
    ? await getClientsForSelector(user.role === 'reseller' ? { resellerId: user.id } : undefined)
    : { data: [] };

  const clients = resClients?.data ?? [];

  return (
    <div className="flex flex-col h-full gap-2">
      <Tabs defaultValue="tools" className="flex flex-col h-full gap-2">
        <div className="sticky top-0 z-1">
          <TabsList>
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
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="tools" className="mt-0">
            <ExternalDataToolConfigManagement clients={clients} />
          </TabsContent>

          <TabsContent value="import" className="mt-0">
            <ExternalDataImportClient clients={clients} />
          </TabsContent>

          <TabsContent value="management" className="mt-0">
            <ExternalClientDataManagement clients={clients} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
