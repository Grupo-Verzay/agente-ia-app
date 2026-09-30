'use client';

import { useState } from 'react';
import { ArrowLeft, BookOpen, FileSpreadsheet } from 'lucide-react';
import { MyDataActionsMenu } from './MyDataActionsMenu';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { MyDataImport } from './MyDataImport';
import { MyDataManagement } from './MyDataManagement';
import { KnowledgeBaseSection } from './KnowledgeBaseSection';
import { PestanasDeLaSeccion } from './PestanasDeLaSeccion';
import {
  SECCIONES_DE_MIS_DATOS,
  TITULO_DE_LA_PANTALLA,
  elNombreDeLaSeccion,
  type SeccionDeMisDatos,
} from '@/lib/pantalla-de-mis-datos';

type Section = SeccionDeMisDatos;

const ICONO_DE_LA_SECCION = { sheets: FileSpreadsheet, knowledge: BookOpen } as const;

interface Props {
  userId: string;
}

export function MyDataContent({ userId }: Props) {
  const [section, setSection] = useState<Section | null>(null);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header fijo con accesos directos */}
      <div
        data-cabecera-de-mis-datos
        className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          {section && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSection(null)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title="Volver"
              aria-label="Volver"
              data-volver
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {/* El mismo nombre que su entrada del menú: la cabecera decía
              «Mis Datos Externos» y el menú «Mis datos». */}
          <h2 className="h3-bold text-gray-900 dark:text-white">{TITULO_DE_LA_PANTALLA}</h2>
        </div>

        {/* Accesos directos siempre visibles, con el MISMO nombre que su
            tarjeta de la portada y que el rótulo de su «⋯». */}
        <div className="toolbar-collapse flex items-center gap-2 shrink-0">
          {SECCIONES_DE_MIS_DATOS.map(({ id, nombre }) => {
            const Icono = ICONO_DE_LA_SECCION[id];
            return (
              <Button
                key={id}
                data-atajo={id}
                variant={section === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSection(id)}
                className="gap-2 text-xs h-8"
                title={nombre}
                aria-label={nombre}
              >
                <Icono className="h-3.5 w-3.5" />
                {nombre}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!section ? (
          <div data-portada-de-mis-datos className="flex flex-col justify-center min-h-[60vh] px-4 py-6">
            <div className="w-full space-y-5">
              <div className="text-center space-y-1 mb-2">
                <h3 className="text-lg font-semibold">¿Qué deseas configurar?</h3>
                <p className="text-sm text-muted-foreground">
                  Elige una opción para enriquecer las respuestas del agente IA
                </p>
              </div>

              {/* Una columna en el teléfono: con dos, cada tarjeta se quedaba
                  en 160 px y su pie se cortaba. */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Google Sheets */}
                <Card
                  data-tarjeta-de-seccion="sheets"
                  className="cursor-pointer group hover:border-green-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500/40"
                  onClick={() => setSection('sheets')}
                >
                  <CardContent className="p-8 flex flex-col gap-5 h-full">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0 group-hover:bg-green-500/20 transition-colors">
                        <FileSpreadsheet className="h-7 w-7 text-green-600 dark:text-green-400" />
                      </div>
                      <h4 className="font-semibold text-lg leading-snug">{elNombreDeLaSeccion('sheets')}</h4>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Sincroniza clientes o catálogos desde una hoja de cálculo pública.
                      </p>
                      <ul className="space-y-2 pt-2">
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                          Asocia datos a clientes por número WhatsApp
                        </li>
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                          Importa catálogos, listas de precios o referencias
                        </li>
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
                          El agente usa estos datos automáticamente en cada conversación
                        </li>
                      </ul>
                    </div>
                <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                  <p className="text-xs text-muted-foreground truncate">Sincroniza tu hoja y el agente la usa automáticamente</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                    Configurar
                  </span>
                </div>
                  </CardContent>
                </Card>

                {/* Base de Conocimiento */}
                <Card
                  data-tarjeta-de-seccion="knowledge"
                  className="cursor-pointer group hover:border-blue-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500/40"
                  onClick={() => setSection('knowledge')}
                >
                  <CardContent className="p-8 flex flex-col gap-5 h-full">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                        <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h4 className="font-semibold text-lg leading-snug">{elNombreDeLaSeccion('knowledge')}</h4>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Divide tu catálogo en bloques y el agente inyecta solo lo relevante según la pregunta.
                      </p>
                      <ul className="space-y-2 pt-2">
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-blue-500 font-bold mt-0.5 shrink-0">✓</span>
                          Reduce tokens de 10,000 a ~300 por consulta
                        </li>
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-blue-500 font-bold mt-0.5 shrink-0">✓</span>
                          Pega tu catálogo y el sistema lo divide automáticamente
                        </li>
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-blue-500 font-bold mt-0.5 shrink-0">✓</span>
                          El agente consulta solo los bloques que coinciden con la pregunta
                        </li>
                      </ul>
                    </div>
                <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                  <p className="text-xs text-muted-foreground truncate">Inyecta solo los bloques relevantes según la pregunta</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                    Configurar
                  </span>
                </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {section === 'sheets' && (
              <SheetsSection userId={userId} />
            )}

            {section === 'knowledge' && (
              <KnowledgeBaseSection userId={userId} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SheetsSection({ userId }: { userId: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const cambio = () => setReloadKey((k) => k + 1);

  return (
    <Tabs defaultValue="import">
      <PestanasDeLaSeccion
        seccion="sheets"
        menu={<MyDataActionsMenu userId={userId} refreshKey={reloadKey} onDataChanged={cambio} />}
      />
      <TabsContent value="import" className="mt-0">
        <MyDataImport userId={userId} onImported={cambio} />
      </TabsContent>
      <TabsContent value="management" className="mt-0">
        <MyDataManagement userId={userId} key={reloadKey} onDataChanged={cambio} />
      </TabsContent>
    </Tabs>
  );
}
