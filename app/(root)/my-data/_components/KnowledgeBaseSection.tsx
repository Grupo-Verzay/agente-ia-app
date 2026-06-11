'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, BookMarked } from 'lucide-react';
import { KnowledgeBaseImport } from './KnowledgeBaseImport';
import { KnowledgeBaseManagement } from './KnowledgeBaseManagement';

interface Props {
  userId: string;
}

export function KnowledgeBaseSection({ userId }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Tabs defaultValue="import" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="import" className="gap-2 text-xs">
          <BookOpen className="h-3.5 w-3.5" />
          Importar contenido
        </TabsTrigger>
        <TabsTrigger value="management" className="gap-2 text-xs">
          <BookMarked className="h-3.5 w-3.5" />
          Gestionar bloques
        </TabsTrigger>
      </TabsList>

      <TabsContent value="import" className="mt-0">
        <KnowledgeBaseImport
          userId={userId}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      </TabsContent>

      <TabsContent value="management" className="mt-0">
        <KnowledgeBaseManagement userId={userId} refreshKey={refreshKey} />
      </TabsContent>
    </Tabs>
  );
}
