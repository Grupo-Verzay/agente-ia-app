'use client';

import { useState } from 'react';
import { ArrowLeft, BookOpen, FileSpreadsheet, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MyDataImport } from './MyDataImport';
import { MyDataManagement } from './MyDataManagement';
import { KnowledgeBaseSection } from './KnowledgeBaseSection';

type Section = 'sheets' | 'knowledge';

interface Props {
  userId: string;
}

export function MyDataContent({ userId }: Props) {
  const [section, setSection] = useState<Section | null>(null);

  if (!section) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-lg space-y-4">
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground">
              ¿Qué deseas hacer?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
              onClick={() => setSection('sheets')}
            >
              <CardHeader className="items-center text-center gap-3 pb-5 pt-6">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Importar desde</CardTitle>
                  <CardTitle className="text-base">Google Sheets</CardTitle>
                  <CardDescription className="text-xs mt-1.5">
                    Sincroniza clientes o catálogos desde una hoja de cálculo
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
              onClick={() => setSection('knowledge')}
            >
              <CardHeader className="items-center text-center gap-3 pb-5 pt-6">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Base de</CardTitle>
                  <CardTitle className="text-base">Conocimiento</CardTitle>
                  <CardDescription className="text-xs mt-1.5">
                    El agente consulta bloques de contenido según lo que pregunta el cliente
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSection(null)}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Button>

      {section === 'sheets' && (
        <Tabs defaultValue="import">
          <TabsList className="mb-4">
            <TabsTrigger value="import" className="gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Importar
            </TabsTrigger>
            <TabsTrigger value="management" className="gap-2 text-xs">
              <Database className="h-3.5 w-3.5" />
              Gestión
            </TabsTrigger>
          </TabsList>
          <TabsContent value="import" className="mt-0">
            <MyDataImport userId={userId} />
          </TabsContent>
          <TabsContent value="management" className="mt-0">
            <MyDataManagement userId={userId} />
          </TabsContent>
        </Tabs>
      )}

      {section === 'knowledge' && (
        <KnowledgeBaseSection userId={userId} />
      )}
    </div>
  );
}
