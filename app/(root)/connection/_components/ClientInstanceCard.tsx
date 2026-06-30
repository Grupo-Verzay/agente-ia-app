'use client';

import { useState, useCallback } from 'react';
import { FaWhatsapp, FaInstagram, FaFacebook } from 'react-icons/fa';
import { MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import EnableToggleButton from '@/components/button-bot';
import QRCodeGenerator from '@/components/form-qr';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { ConnectionActions } from './';
import { deleteInstance } from '@/actions/api-action';
import { ClientInstanceCardProps } from '@/schema/connection';
import { PromptInstanceDialog } from './PromptInstanceDialog';
import { RenameInstanceDialog } from './RenameInstanceDialog';
import { RecreateInstanceDialog } from './RecreateInstanceDialog';

interface SocialIconSelectorProps {
  instanceType?: string;
  callback: () => void;
}

const SocialIconSelector = ({ instanceType, callback }: SocialIconSelectorProps) => {
  const common = (
    <>
      <hr className="w-4 rotate-90" />
      <span className="text-sm text-gray-400">Business</span>
      <span className="text-sm">avanzado</span>
    </>
  );

  switch (instanceType) {
    case 'Instagram':
      return (
        <>
          <FaInstagram onClick={callback} className="text-pink-500 rounded-sm" />
          <span className="text-sm font-bold">Instagram</span>
          {common}
        </>
      );
    case 'Facebook':
      return (
        <>
          <FaFacebook onClick={callback} className="text-blue-500 rounded-sm" />
          <span className="text-sm font-bold">Facebook</span>
          {common}
        </>
      );
    case 'Whatsapp':
    default:
      return (
        <>
          <FaWhatsapp onClick={callback} className="text-green-500 rounded-sm" />
          <span className="text-sm font-bold">Whatsapp</span>
          {common}
        </>
      );
  }
};

export const ClientInstanceCard = ({
  intanceName,
  instanceType,
  user,
  currentInstanceInfo,
  prompts,
}: ClientInstanceCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRecreateDialog, setShowRecreateDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [_clickCount, setClickCount] = useState(0);

  const handleSecretClick = useCallback(() => {
    setClickCount((prev) => {
      const newCount = prev + 1;
      if (newCount === 3) {
        setShowDeleteDialog(true);
        return 0;
      }
      return newCount;
    });
  }, []);

  const handlePromptDialogOpen = useCallback((open: boolean) => {
    setShowPromptDialog(open);
  }, []);

  const instanceId = currentInstanceInfo?.id;
  const ownerJid = currentInstanceInfo?.ownerJid;
  const profileName = currentInstanceInfo?.profileName;
  const profilePicUrl = currentInstanceInfo?.profilePicUrl;
  const userInitial = intanceName.charAt(0).toUpperCase() ?? '?';
  const isActive = instanceType == 'Facebook' ? user.onFacebook : user.onInstagram

  return (
    <>
      <Card className="border-border flex h-full flex-col">
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-center gap-2">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-green-600" />
              <span className="truncate">{instanceType === 'Whatsapp' ? 'Mensajería WhatsApp' : `Mensajería ${instanceType}`}</span>
            </CardTitle>
            <div className="shrink-0">
              <ConnectionActions
                handleDelete={() => setShowDeleteDialog(true)}
                handleRename={() => setShowRenameDialog(true)}
                handleRecreate={instanceType === 'Whatsapp' ? () => setShowRecreateDialog(true) : undefined}
                handlePrompt={instanceType !== 'Whatsapp' ? () => setShowPromptDialog(true) : undefined}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col p-4 pt-0">
          <div className="flex flex-1 items-center">
            <div className="flex items-center gap-3">
              {instanceType === 'Whatsapp' && (<>
                <Avatar className="rounded-lg">
                  <AvatarFallback className="rounded-lg bg-green-100 text-green-600 dark:bg-green-950/40">
                    <MessageCircle className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{intanceName}</div>
                  {ownerJid ? (
                    <div className="truncate text-xs text-muted-foreground">+{ownerJid.split('@')[0]}</div>
                  ) : (
                    <Skeleton className="h-3 w-[100px]" />
                  )}
                </div>
              </>
              )}
              {(instanceType != 'Whatsapp') && (isActive ? 'Activo 🟢' : 'Desactivado 🔴')}
            </div>
          </div>

          <div className="grid grid-cols-2 items-stretch gap-2 pt-4">
            {instanceType === 'Whatsapp' && (
              <>
                <div className="[&_button]:w-full"><QRCodeGenerator userId={user.id} /></div>
                <div className="[&_button]:w-full">
                  <EnableToggleButton
                    userId={user.id}
                    userName={user.name}
                    apiurl={user.apiUrl}
                    apikey={user.apiKeyId as string}
                    webhookUrl={user?.webhookUrl ?? 'https://backend.ia-app.com/webhook'}
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>

      </Card>

      <PromptInstanceDialog
        platform={instanceType ?? ''}
        open={showPromptDialog}
        setOpen={handlePromptDialogOpen}
        userId={user.id}
        prompts={prompts}
      />

      <RenameInstanceDialog
        open={showRenameDialog}
        setOpen={setShowRenameDialog}
        userId={user.id}
        instanceType={instanceType}
        currentName={intanceName}
      />

      <RecreateInstanceDialog
        open={showRecreateDialog}
        setOpen={setShowRecreateDialog}
        userId={user.id}
        instanceType={instanceType ?? 'Whatsapp'}
      />

      <GenericDeleteDialog
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        itemName="Agente IA"
        itemId={instanceId ?? "instance-123"}
        mutationFn={async (_id) => deleteInstance(user.id, instanceType)}
        entityLabel="Agente IA"
      />

    </>
  );
};
