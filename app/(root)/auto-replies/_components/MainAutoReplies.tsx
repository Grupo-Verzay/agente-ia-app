import { QuickReply, User, Workflow } from "@prisma/client";
import type { CurrentUser } from '@/lib/auth';
'use client';

import { useMemo, useState } from "react";
import { CreateAutoReplies, SortableAutoRepliesList } from "./";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, GitBranch, Hash, InboxIcon, MessageSquareText, MessagesSquare, Search } from "lucide-react";
import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";
import { Input } from "@/components/ui/input";
import { getQuickReplyCategoryLabel, normalizeQuickReplyCategory } from "@/lib/quick-reply-categories";
import { BarraDeAcciones } from '@/components/shared/BarraDeAcciones';

interface Props {
  user: CurrentUser;
  Workflows: Workflow[];
  autoReplies: QuickReply[];
}

export const MainAutoReplies = ({ user, Workflows, autoReplies = [] }: Props) => {
  const [search, setSearch] = useState("");
  const textReplies = autoReplies.filter(reply => !reply.workflowId).length;
  const workflowReplies = autoReplies.filter(reply => Boolean(reply.workflowId)).length;
  const categoryCount = new Set(autoReplies.map(reply => normalizeQuickReplyCategory(reply.category))).size;
  const filteredAutoReplies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return autoReplies;

    return autoReplies.filter(reply => {
      const workflowName = Workflows.find(workflow => workflow.id === reply.workflowId)?.name ?? "";
      const categoryName = getQuickReplyCategoryLabel(reply.category);
      return `${reply.name ?? ""} ${reply.mensaje ?? ""} ${workflowName} ${categoryName}`.toLowerCase().includes(query);
    });
  }, [Workflows, autoReplies, search]);

  if (!autoReplies) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Algo salio mal. Por favor intenta mas tarde.</AlertDescription>
      </Alert>
    );
  }

  const crear = <CreateAutoReplies triggerText="Nueva respuesta" user={user} Workflows={Workflows} />;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Antes era `flex-col sm:flex-row` con `sm:order-*`: en el teléfono
          partía la barra en dos filas y el orden lo decidía el CSS, no el
          marcado. Ahora los tres huecos de siempre. */}
      <BarraDeAcciones
        className="p-1"
        buscador={
          /* Estaba DETRÁS de las pastillas, dentro del carril: salía en medio
             de la fila y se iba de la pantalla al desplazarla. Su sitio es el
             primero, fijo. */
          <div className="relative w-56 shrink-0 sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar respuesta..."
              className="pl-8 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
        crear={<div className="shrink-0">{crear}</div>}
        filtros={
          <>
          {/* Las cifras que abrían la pantalla en tarjetas. Esta lista no tiene
              filtro por tipo de respuesta: no son pulsables. */}
          <PastillasDeMetricas
            metricas={[
              { clave: 'total', icono: <MessagesSquare />, etiqueta: 'Total', valor: autoReplies.length, color: '#3B82F6', ayuda: 'Respuestas rapidas disponibles' },
              { clave: 'texto', icono: <MessageSquareText />, etiqueta: 'Texto simple', valor: textReplies, color: '#10B981', ayuda: 'Respuestas que envian un mensaje de texto' },
              { clave: 'flujo', icono: <GitBranch />, etiqueta: 'Ejecutan flujo', valor: workflowReplies, color: '#8B5CF6', ayuda: 'Respuestas que activan un flujo automatizado' },
              { clave: 'categorias', icono: <Hash />, etiqueta: 'Categorias', valor: categoryCount, color: '#F59E0B', ayuda: 'Grupos usados en respuestas rapidas' },
            ]}
          />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-2">
          {filteredAutoReplies.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
                <InboxIcon size={40} className="stroke-primary" />
              </div>
              <div className="flex flex-col gap-1 text-center">
                <p className="font-bold">
                  {autoReplies.length === 0 ? "No existe ninguna respuesta rapida" : "No se encontraron respuestas"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {autoReplies.length === 0 ? "Click para crear una nueva respuesta rapida." : "Prueba con otro termino de busqueda."}
                </p>
              </div>
              {autoReplies.length === 0 && (
                <CreateAutoReplies triggerText="Crea tu primera respuesta rapida" user={user} Workflows={Workflows} />
              )}
            </div>
          ) : (
            <SortableAutoRepliesList autoReplies={filteredAutoReplies} workflows={Workflows} />
          )}
        </div>
      </div>
    </div>
  );
};
