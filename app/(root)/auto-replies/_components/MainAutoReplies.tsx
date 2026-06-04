import { QuickReply, User, Workflow } from "@prisma/client";
'use client';

import { useMemo, useState } from "react";
import { CreateAutoReplies, SortableAutoRepliesList } from "./";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, GitBranch, Hash, InboxIcon, MessageSquareText, MessagesSquare, Search } from "lucide-react";
import { MetricCard } from "@/components/custom/MetricCard";
import { Input } from "@/components/ui/input";

interface Props {
  user: User;
  Workflows: Workflow[];
  autoReplies: QuickReply[];
}

export const MainAutoReplies = ({ user, Workflows, autoReplies = [] }: Props) => {
  const [search, setSearch] = useState("");
  const textReplies = autoReplies.filter(reply => !reply.workflowId).length;
  const workflowReplies = autoReplies.filter(reply => Boolean(reply.workflowId)).length;
  const namedReplies = autoReplies.filter(reply => Boolean(reply.name?.trim())).length;
  const filteredAutoReplies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return autoReplies;

    return autoReplies.filter(reply => {
      const workflowName = Workflows.find(workflow => workflow.id === reply.workflowId)?.name ?? "";
      return `${reply.name ?? ""} ${reply.mensaje ?? ""} ${workflowName}`.toLowerCase().includes(query);
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

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<MessagesSquare className="h-4 w-4" />} label="Total" value={autoReplies.length} helper="Respuestas rapidas disponibles" color="#3B82F6" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<MessageSquareText className="h-4 w-4" />} label="Texto simple" value={textReplies} helper="Respuestas que envian un mensaje de texto" color="#10B981" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<GitBranch className="h-4 w-4" />} label="Ejecutan flujo" value={workflowReplies} helper="Respuestas que activan un flujo automatizado" color="#8B5CF6" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<Hash className="h-4 w-4" />} label="Con atajo" value={namedReplies} helper="Respuestas con nombre o atajo configurado" color="#F59E0B" />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 p-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-64 shrink-0">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar respuesta..."
              className="pl-8 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <CreateAutoReplies triggerText="+ Crear" user={user} Workflows={Workflows} />
      </div>

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
