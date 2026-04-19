import { QuickReply, User, Workflow } from "@prisma/client";
import Header from '@/components/shared/header';
import { CreateAutoReplies, SortableAutoRepliesList } from "./";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, InboxIcon } from "lucide-react";

interface Props {
  user: User;
  Workflows: Workflow[];
  autoReplies: QuickReply[];
}

export const MainAutoReplies = ({ user, Workflows, autoReplies = [] }: Props) => {

  if (!autoReplies) {
    return (
      <Alert variant={'destructive'}>
        <AlertCircle className='w-4 h-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Algo salió mal. Por favor intenta más tarde</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header fijo */}
      <div className="sticky top-0 z-1 mb-6">
        <div className="flex justify-between items-center">
          <Header
            title={'Respuestas rápidas'}
          />
          <CreateAutoReplies
            triggerText={'CREAR'}
            user={user}
            Workflows={Workflows}
          />
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4">
          {autoReplies.length === 0 ? (
            <div className="flex flex-col gap-4 h-full items-center justify-center">
              <div className='rounded-full bg-accent w-20 h-20 flex items-center justify-center'>
                <InboxIcon size={40} className='stroke-primary' />
              </div>
              <div className='flex flex-col gap-1 text-center'>
                <p className="font-bold">No existe ninguna respuesta rápida</p>
                <p className="text-sm text-muted-foreground">Click para crear una nueva respuesta rápida</p>
              </div>
              <CreateAutoReplies
                triggerText="Crea tu primera respuesta rápida"
                user={user}
                Workflows={Workflows}
              />
            </div>
          ) : (
            <SortableAutoRepliesList autoReplies={autoReplies} workflows={Workflows} />
          )}
        </div>
      </div>
    </div>
  );
};