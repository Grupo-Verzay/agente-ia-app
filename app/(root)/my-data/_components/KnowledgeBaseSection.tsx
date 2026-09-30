'use client';

import { useState } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { KnowledgeBaseImport } from './KnowledgeBaseImport';
import { KnowledgeBaseManagement } from './KnowledgeBaseManagement';
import { KnowledgeBaseActionsMenu } from './KnowledgeBaseActionsMenu';
import { PestanasDeLaSeccion } from './PestanasDeLaSeccion';

interface Props {
  userId: string;
}

export function KnowledgeBaseSection({ userId }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleChange = () => setRefreshKey((k) => k + 1);

  return (
    <Tabs defaultValue="import" className="w-full">
      <PestanasDeLaSeccion
        seccion="knowledge"
        menu={
          <KnowledgeBaseActionsMenu
            userId={userId}
            refreshKey={refreshKey}
            onDataChanged={handleChange}
          />
        }
      />

      <TabsContent value="import" className="mt-0">
        <KnowledgeBaseImport userId={userId} onImported={handleChange} />
      </TabsContent>

      <TabsContent value="management" className="mt-0">
        <KnowledgeBaseManagement userId={userId} refreshKey={refreshKey} onDataChanged={handleChange} />
      </TabsContent>
    </Tabs>
  );
}
