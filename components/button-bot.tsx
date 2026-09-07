"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Power } from "lucide-react";
import { cambiarRobot, leerEstadoDelRobot } from "@/actions/robot-actions";
import { toast } from "sonner";
import { getBillingServiceAccessSnapshot } from "@/actions/billing/billing-access-actions";

interface EnableToggleButtonProps {
  userId: string;
  /**
   * Linea a la que pertenece este boton. Sin ella se usa la de la cuenta.
   *
   * Las credenciales de Evolution que recibia antes ya no hacen falta: todo va
   * por el servidor, y con Waha ni siquiera existen.
   */
  instanceName?: string;
}

const EnableToggleButton: React.FC<EnableToggleButtonProps> = ({
  userId,
  instanceName,
}) => {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instanceData, setInstanceData] = useState<{
    instanceName: string;
    instanceId: string;
    serverUrl: string;
  } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [serviceLocked, setServiceLocked] = useState(false);
  const [serviceLockReason, setServiceLockReason] = useState<string | null>(null);
  const autoDisableAttemptedRef = useRef(false);

  /**
   * El robot ya no es el webhook de Evolution: es una marca de la linea que el
   * backend respeta antes de usar la IA (ver actions/robot-actions.ts). El
   * webhook queda siempre encendido, que es lo que hace falta para el tiempo
   * real y el historial. Todo va por el servidor: ni credenciales ni llamadas a
   * Evolution desde el navegador.
   */
  const loadInstanceData = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const res = await leerEstadoDelRobot(userId, instanceName);
      if (!res.success) {
        setError(res.message);
        return;
      }
      setInstanceData({ instanceName: res.data.instanceName, instanceId: "", serverUrl: "" });
      setIsEnabled(res.data.botEnabled);
    } catch (err) {
      setError(`Error al cargar las instancias: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [userId, instanceName]);

  const loadBillingAccessStatus = useCallback(async () => {
    const res = await getBillingServiceAccessSnapshot(userId);
    if (!res.success || !res.data) return;

    const locked = res.data.shouldDisableAgent;
    setServiceLocked(locked);

    if (!locked) {
      setServiceLockReason(null);
      return;
    }

    const reason =
      res.data.reason === "SUSPENDED_STATUS"
        ? "Servicio suspendido"
        : res.data.reason === "OVERDUE_BEYOND_GRACE"
          ? "Servicio vencido fuera de gracia"
          : "Servicio inactivo";

    setServiceLockReason(reason);
  }, [userId]);

  const setWebhookEnabled = useCallback(async (nextEnabled: boolean) => {
    if (!instanceData) {
      toast.error("No se encontro informacion de la instancia.");
      return;
    }

    if (nextEnabled && serviceLocked) {
      toast.error("Servicio suspendido por billing. No puedes activar el agente.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await cambiarRobot(userId, nextEnabled, instanceName);
      if (!res.success) throw new Error(res.message);

      setIsEnabled(res.data.botEnabled);
      if (nextEnabled) {
        toast.success("Robot encendido: el agente vuelve a responder en esta linea.");
      } else {
        toast.warning("Robot apagado: los mensajes se siguen recibiendo y guardando; el agente no responde.");
      }
      if (!res.data.webhookEnabled) {
        toast.error("Evolution no aceptó encender el webhook de la línea. Los avisos en vivo pueden no llegar.");
      }
    } catch (err) {
      const errorMessage = `Error al cambiar el estado: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [instanceData, serviceLocked, userId, instanceName]);

  const toggleEnable = async () => {
    await setWebhookEnabled(!(isEnabled ?? false));
  };

  useEffect(() => {
    void loadInstanceData();
    void loadBillingAccessStatus();
  }, [loadBillingAccessStatus, loadInstanceData]);

  useEffect(() => {
    if (!serviceLocked) {
      autoDisableAttemptedRef.current = false;
      return;
    }
    if (!instanceData) return;
    if (isEnabled !== true) return;
    if (autoDisableAttemptedRef.current) return;

    autoDisableAttemptedRef.current = true;
    void setWebhookEnabled(false);
  }, [serviceLocked, instanceData, isEnabled, setWebhookEnabled]);

  return (
    <>
      {!isEnabled ? (
        <Button
          onClick={toggleEnable}
          disabled={loading || !instanceData || serviceLocked}
          className="w-full text-white" style={{ backgroundColor: '#2563EB' }}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin w-5 h-5" />
              Encendiendo...
            </>
          ) : (
            <>
              <Power className="w-6 h-6" />
              Activar
            </>
          )}
        </Button>
      ) : (
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button className="w-full" disabled={loading || !instanceData} variant="destructive">
              {loading ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" />
                  Apagando...
                </>
              ) : (
                <>
                  <Power className="w-6 h-6" />
                  Apagar
                </>
              )}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Estas seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                El agente dejara de responder en esta linea hasta que vuelvas a encenderlo.
                Los mensajes se siguen recibiendo, guardando y avisando en Chats.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDialogOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setIsDialogOpen(false);
                  await toggleEnable();
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {serviceLocked && (
        <Alert className="mt-2 border-destructive/40 bg-destructive/10">
          <AlertDescription className="text-xs">
            {(serviceLockReason ?? "Servicio suspendido") +
              ". Debes regularizar billing para volver a encender el agente."}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mt-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
};

export default EnableToggleButton;
