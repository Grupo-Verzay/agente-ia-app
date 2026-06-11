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
      <div className="flex items-center justify-between py-2 px-4 border-b border-border/40 bg-muted/40">
        <TabsList className="h-10">
          <TabsTrigger value="import" className="gap-2 px-5 h-9 text-sm font-medium">
            <BookOpen className="h-4 w-4" />
            Importar contenido
          </TabsTrigger>
          <TabsTrigger value="management" className="gap-2 px-5 h-9 text-sm font-medium">
            <BookMarked className="h-4 w-4" />
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
