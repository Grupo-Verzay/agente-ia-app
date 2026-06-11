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
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-full max-w-3xl space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold">¿Qué deseas configurar?</h3>
            <p className="text-sm text-muted-foreground">
              Elige una opción para enriquecer las respuestas del agente IA
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Google Sheets */}
            <Card
              className="cursor-pointer group hover:border-primary/50 hover:shadow-md transition-all duration-200"
              onClick={() => setSection('sheets')}
            >
              <CardHeader className="pb-3 pt-6 px-6">
                <div className="h-14 w-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4 group-hover:bg-green-500/15 transition-colors">
                  <FileSpreadsheet className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-lg">Importar desde Google Sheets</CardTitle>
                <CardDescription className="text-sm mt-1">
                  Sincroniza clientes o catálogos desde una hoja de cálculo pública.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-2">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    Asocia datos a clientes por número WhatsApp
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    Importa catálogos, listas de precios o referencias
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    El agente usa estos datos automáticamente en cada conversación
                  </li>
                </ul>
                <div className="pt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:gap-2.5 transition-all">
                    Configurar
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Base de Conocimiento */}
            <Card
              className="cursor-pointer group hover:border-primary/50 hover:shadow-md transition-all duration-200"
              onClick={() => setSection('knowledge')}
            >
              <CardHeader className="pb-3 pt-6 px-6">
                <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:bg-blue-500/15 transition-colors">
                  <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg">Base de Conocimiento</CardTitle>
                <CardDescription className="text-sm mt-1">
                  Divide tu catálogo en bloques y el agente inyecta solo lo relevante.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-2">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                    Reduce tokens de 10,000 a ~300 por consulta
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                    Pega tu catálogo y el sistema lo divide automáticamente
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                    El agente consulta solo los bloques que coinciden con la pregunta
                  </li>
                </ul>
                <div className="pt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:gap-2.5 transition-all">
                    Configurar
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </span>
                </div>
              </CardContent>
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
