'use client';

import { useState, useCallback } from 'react';
import { FaWhatsapp, FaInstagram, FaFacebook } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{intanceName}</CardTitle>
            <ConnectionActions
              handleDelete={() => setShowDeleteDialog(true)}
              handleRename={() => setShowRenameDialog(true)}
              handlePrompt={instanceType !== 'Whatsapp' ? () => setShowPromptDialog(true) : undefined}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3">
            {instanceType === 'Whatsapp' && (<>
              <Avatar className="rounded-lg">
                {profilePicUrl && <AvatarImage src={profilePicUrl} alt={intanceName ?? ''} />}
                <AvatarFallback className="rounded-lg">{userInitial}</AvatarFallback>
              </Avatar>
              <div>
                {profileName ? (
                  <>
                    <div className="text-sm font-medium">{profileName}</div>
                    <div className="text-xs text-muted-foreground">
                      +{ownerJid?.split('@')[0]}
                    </div>
                  </>
                ) : (
                  <>
                    <Skeleton className="h-4 w-[120px] mb-1" />
                    <Skeleton className="h-3 w-[100px]" />
                  </>
                )}
              </div>
            </>
            )}
            {(instanceType != 'Whatsapp') && (isActive ? 'Activo 🟢' : 'Desactivado 🔴')}
          </div>

          <div className="flex items-center justify-between mt-4 text-xs flex-col gap-2">
            <div className="flex flex-1 justify-end gap-1 items-center flex-row w-full">
              {instanceType === 'Whatsapp' && (
                <>
                  <QRCodeGenerator userId={user.id} />
                  <EnableToggleButton
                    userId={user.id}
                    userName={user.name}
                    apiurl={user.apiUrl}
                    apikey={user.apiKeyId as string}
                    webhookUrl={user?.webhookUrl ?? 'https://backend.ia-app.com/webhook'}
                  />
                </>
              )}
            </div>
          </div>
        </CardContent>

        {/* <CardFooter className="flex flex-row justify-start items-center">
          <div className="flex flex-1 flex-row items-center gap-1">
            <SocialIconSelector instanceType={instanceType} callback={handleSecretClick} />
          </div>
        </CardFooter> */}
      </Card>

      <PromptInstanceDialog
        platform={instanceType as any}
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
