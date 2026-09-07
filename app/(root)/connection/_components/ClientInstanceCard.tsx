'use client';

import { useState } from 'react';
import { FaInstagram, FaFacebook } from 'react-icons/fa';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import EnableToggleButton from '@/components/button-bot';
import QRCodeGenerator from '@/components/form-qr';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { deleteInstance } from '@/actions/api-action';
import { ClientInstanceCardProps } from '@/schema/connection';
import { PromptInstanceDialog } from './PromptInstanceDialog';
import { CambiarProveedorButton } from './CambiarProveedorButton';
import { TarjetaDeLinea } from './TarjetaDeLinea';
import { TAMANO_DEL_ICONO, TituloDeTarjeta } from './TituloDeTarjeta';

/**
 * La linea de WhatsApp servida por Evolution, y los canales de Meta que
 * tambien pasan por Evolution (Facebook e Instagram).
 *
 * La de WhatsApp se pinta con `TarjetaDeLinea`, la MISMA que usa Waha: el
 * cliente ve un solo canal, se conecte por donde se conecte.
 */
export const ClientInstanceCard = ({
  intanceName,
  displayName,
  instanceType,
  user,
  currentInstanceInfo,
  prompts,
  hayServidorWaha,
}: ClientInstanceCardProps & { hayServidorWaha?: boolean }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);

  const instanceId = currentInstanceInfo?.id;
  const ownerJid = currentInstanceInfo?.ownerJid;
  const visibleName = displayName?.trim() || intanceName;

  const dialogos = (
    <>
      <PromptInstanceDialog
        platform={instanceType ?? ''}
        open={showPromptDialog}
        setOpen={setShowPromptDialog}
        userId={user.id}
        prompts={prompts}
      />
      <GenericDeleteDialog
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        itemName="Agente IA"
        itemId={instanceId ?? 'instance-123'}
        mutationFn={async (_id) => deleteInstance(user.id, instanceType)}
        entityLabel="Agente IA"
      />
    </>
  );

  // Facebook e Instagram no tienen sesion de WhatsApp ni Robot: solo dicen si
  // el canal esta activo. Comparten el titulo con el resto para que la rejilla
  // no se vea despareja.
  if (instanceType !== 'Whatsapp') {
    const activo = instanceType === 'Facebook' ? user.onFacebook : user.onInstagram;
    const icono =
      instanceType === 'Facebook' ? (
        <FaFacebook className={`${TAMANO_DEL_ICONO} text-[#1877F2]`} />
      ) : (
        <FaInstagram className={`${TAMANO_DEL_ICONO} text-pink-500`} />
      );

    return (
      <>
        <Card className="border-border flex flex-col">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <TituloDeTarjeta icono={icono}>{`Mensajería ${instanceType}`}</TituloDeTarjeta>
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowDeleteDialog(true)}
                title="Eliminar instancia"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-2">
            <p className="text-[13px] text-muted-foreground">
              {activo ? 'Canal activo 🟢' : 'Canal desactivado 🔴'}
            </p>
            <Button variant="outline" className="w-full" onClick={() => setShowPromptDialog(true)}>
              Configurar agente
            </Button>
          </CardContent>
        </Card>
        {dialogos}
      </>
    );
  }

  return (
    <>
      <TarjetaDeLinea
        proveedor="evolution"
        nombre={visibleName}
        numero={ownerJid ? ownerJid.split('@')[0] : null}
        cargando={!currentInstanceInfo}
        estado="Sin conectar"
        alEliminar={() => setShowDeleteDialog(true)}
        cambiarProveedor={
          hayServidorWaha ? (
            // Nunca hay dos proveedores encendidos a la vez, pero cerrar el
            // primero NO es trabajo de la persona: si la sesion de Evolution
            // esta abierta, el propio cambio la cierra. La confirmacion lo
            // dice antes de tocar nada.
            <CambiarProveedorButton instanceName={intanceName} destino="waha" soloIcono />
          ) : null
        }
        botonDeConexion={<QRCodeGenerator userId={user.id} />}
        botonDelRobot={
          <EnableToggleButton userId={user.id} instanceName={intanceName} />
        }
      />
      {dialogos}
    </>
  );
};
