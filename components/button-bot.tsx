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
import { getInstances } from "@/actions/api-action";
import { toast } from "sonner";
import { getBillingServiceAccessSnapshot } from "@/actions/billing/billing-access-actions";

interface EnableToggleButtonProps {
  userId: string;
  userName?: string | null;
  apiurl: string;
  apikey: string;
  webhookUrl: string;
}

const EnableToggleButton: React.FC<EnableToggleButtonProps> = ({
  userId,
  webhookUrl,
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

  const fetchWebhookStatus = useCallback(async (
    instanceName: string,
    instanceId: string,
    serverUrl: string
  ) => {
    try {
      const response = await fetch(`https://${serverUrl}/webhook/find/${instanceName}`, {
        method: "GET",
        headers: { apikey: instanceId },
      });

      if (!response.ok) throw new Error("Error al obtener el estado del webhook.");

      const data = await response.json();
      setIsEnabled(data?.enabled === true);
    } catch (err) {
      setError(
        `Error al obtener el estado del webhook: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const loadInstanceData = useCallback(async () => {
    try {
      const instances = await getInstances(userId);
      if (!instances || instances.length === 0) {
        setError("No se encontraron instancias para este usuario.");
        return;
      }

      const whatsappIndex = instances.findIndex((i) => i.instanceType === "Whatsapp");
      const selected = whatsappIndex >= 0 ? instances[whatsappIndex] : instances[0];

      if (!selected?.instanceName || !selected?.instanceId || !selected?.serverUrl) {
        setError("Instancia incompleta: faltan datos requeridos.");
        return;
      }

      const { instanceName, instanceId, serverUrl } = selected;
      setInstanceData({ instanceName, instanceId, serverUrl });
      await fetchWebhookStatus(instanceName, instanceId, serverUrl);
    } catch (err) {
      setError(`Error al cargar las instancias: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [fetchWebhookStatus, userId]);

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
      const response = await fetch(
        `https://${instanceData.serverUrl}/webhook/set/${instanceData.instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: instanceData.instanceId,
          },
          body: JSON.stringify({
            webhook: {
              enabled: nextEnabled,
              url: webhookUrl,
              base64: true,
              events: ["MESSAGES_UPSERT"],
            },
          }),
        }
      );

      if (!response.ok) throw new Error("Error al cambiar el estado.");

      setIsEnabled(nextEnabled);
      if (nextEnabled) {
        toast.success("Robot encendido correctamente.");
      } else {
        toast.warning("Robot apagado correctamente.");
      }
    } catch (err) {
      const errorMessage = `Error al cambiar el estado: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [instanceData, serviceLocked, webhookUrl]);

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
          className="bg-green-600 hover:bg-green-700 w-full"
          variant="default"
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
                Esto apagara el Robot de la instancia. Las respuestas automaticas se detendran
                hasta que vuelvas a encenderlo.
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
