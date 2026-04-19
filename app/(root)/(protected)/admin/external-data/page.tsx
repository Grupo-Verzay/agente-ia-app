import AccessDenied from '@/app/AccessDenied';
import Header from '@/components/shared/header';
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
    <>
      <Header title="Datos Externos de Clientes" />
        <Tabs defaultValue="management">
          <TabsList className="mb-4">
            <TabsTrigger value="management" className="gap-2">
              <Database className="h-4 w-4" />
              Gestión
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              <Bot className="h-4 w-4" />
              Herramientas IA
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Importar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="management">
            <ExternalClientDataManagement clients={clients} />
          </TabsContent>

          <TabsContent value="tools">
            <ExternalDataToolConfigManagement clients={clients} />
          </TabsContent>

          <TabsContent value="import">
            <ExternalDataImportClient clients={clients} />
          </TabsContent>
        </Tabs>
    </>
  );
}
