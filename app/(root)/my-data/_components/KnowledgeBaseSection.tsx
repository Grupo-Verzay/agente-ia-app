'use client';

import { useState } from 'react';
import { BookOpen, BookMarked } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KnowledgeBaseImport } from './KnowledgeBaseImport';
import { KnowledgeBaseManagement } from './KnowledgeBaseManagement';
import { KnowledgeBaseActionsMenu } from './KnowledgeBaseActionsMenu';

interface Props {
  userId: string;
}

export function KnowledgeBaseSection({ userId }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleChange = () => setRefreshKey((k) => k + 1);

  return (
    <Tabs defaultValue="import" className="w-full">
      <div className="flex items-center justify-between mb-4">
        <TabsList>
          <TabsTrigger value="import" className="gap-2 text-xs">
            <BookOpen className="h-3.5 w-3.5" />
            Importar contenido
          </TabsTrigger>
          <TabsTrigger value="management" className="gap-2 text-xs">
            <BookMarked className="h-3.5 w-3.5" />
            Gestionar bloques
          </TabsTrigger>
        </TabsList>
        <KnowledgeBaseActionsMenu
          userId={userId}
          refreshKey={refreshKey}
          onDataChanged={handleChange}
        />
      </div>

      <TabsContent value="import" className="mt-0">
        <KnowledgeBaseImport userId={userId} onImported={handleChange} />
      </TabsContent>

      <TabsContent value="management" className="mt-0">
        <KnowledgeBaseManagement userId={userId} refreshKey={refreshKey} onDataChanged={handleChange} />
      </TabsContent>
    </Tabs>
  );
}
