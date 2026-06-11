'use client';

import { useState } from 'react';
import { ArrowLeft, BookOpen, FileSpreadsheet, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      <div className="flex flex-col justify-center min-h-[70vh]">
        <div className="w-full space-y-5">
          <div className="text-center space-y-1 mb-2">
            <h3 className="text-lg font-semibold">¿Qué deseas configurar?</h3>
            <p className="text-sm text-muted-foreground">
              Elige una opción para enriquecer las respuestas del agente IA
            </p>
          </div>

          {/* Google Sheets */}
          <Card
            className="cursor-pointer group hover:border-green-500/40 hover:shadow-md transition-all duration-200"
            onClick={() => setSection('sheets')}
          >
            <CardContent className="p-6 flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0 group-hover:bg-green-500/15 transition-colors">
                <FileSpreadsheet className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-base mb-0.5">Importar desde Google Sheets</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Sincroniza clientes o catálogos desde una hoja de cálculo pública.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-green-500 font-bold">✓</span> Datos de clientes por WhatsApp
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-green-500 font-bold">✓</span> Catálogos y listas de precios
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-green-500 font-bold">✓</span> El agente lo usa automáticamente
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary shrink-0 group-hover:gap-2.5 transition-all pr-2">
                Configurar
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </span>
            </CardContent>
          </Card>

          {/* Base de Conocimiento */}
          <Card
            className="cursor-pointer group hover:border-blue-500/40 hover:shadow-md transition-all duration-200"
            onClick={() => setSection('knowledge')}
          >
            <CardContent className="p-6 flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-500/15 transition-colors">
                <BookOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-base mb-0.5">Base de Conocimiento (RAG)</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Divide tu catálogo en bloques y el agente inyecta solo lo relevante según la pregunta del cliente.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-blue-500 font-bold">✓</span> Reduce tokens de 10,000 a ~300
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-blue-500 font-bold">✓</span> División automática del catálogo
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-blue-500 font-bold">✓</span> Solo inyecta bloques relevantes
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary shrink-0 group-hover:gap-2.5 transition-all pr-2">
                Configurar
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </span>
            </CardContent>
          </Card>
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
