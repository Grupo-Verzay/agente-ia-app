'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { getInstanceLiveStatusAction } from '@/actions/instance-live-status-action';
import type { EvolutionInstance } from '@/actions/fetch-intance-action';
import { createInstance } from '@/actions/api-action';
import { toast } from 'sonner';
import { ClientInstanceCard, ConnectionCard } from './';
import { ConnectionMainInterface, FormInstanceConnectionValues, sanitizeInstanceName } from '@/schema/connection';
import { PromptInstance } from '@prisma/client';
import { checkInstanceNameExists, createBaileysInstance } from '@/actions/instances-actions';
import { getInstanceDisplayName } from '@/lib/instance-display-name';

export const ConnectionMain = ({
  user,
  instance,
  instanceInfo,
  instanceType,
  prompts,
  autoCreate,
}: ConnectionMainInterface & { autoCreate?: boolean }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const instanceName = !instance ? '' : instance.instanceName;
  const displayName = getInstanceDisplayName(instance?.instanceName, (instance as any)?.displayName);

  // El estado en vivo (numero, foto, conexion) ya no llega precargado desde el
  // servidor: se pide aparte, aqui, para que Perfil/Conexion se pinten al
  // instante aunque Evolution este caido o lento. Mientras no responda, la
  // tarjeta simplemente no muestra esos datos (no bloquea nada).
  const [liveInfo, setLiveInfo] = useState<EvolutionInstance[] | undefined>(instanceInfo);

  useEffect(() => {
    if (!instanceName || instanceType !== 'Whatsapp') return;
    let vigente = true;
    void getInstanceLiveStatusAction(instanceName).then((res) => {
      if (vigente && res.success) setLiveInfo(res.data);
    });
    return () => {
      vigente = false;
    };
  }, [instanceName, instanceType]);

  const currentInstanceInfo = liveInfo?.find((i) => i.name === instanceName);

  // Nombre de instancia derivado del campo company del usuario (no editable por el cliente)
  const derivedInstanceName = useMemo(() =>
    sanitizeInstanceName(user.company ?? user.id ?? 'instancia'),
    [user.company, user.id]
  );

  // Memoiza prompts para evitar recrear arrays en cada render
  const filteredPrompts: PromptInstance[] = useMemo(() => {
    const filtered = prompts ? prompts.filter((p) => p.instanceType === instanceType) : [];
    return filtered;
  }, [prompts, instanceType]);

  const onSubmit = async (data: FormInstanceConnectionValues) => {
    setLoading(true);

    if (instance) {
      toast.error('El usuario ya tiene una instancia activa.');
      setLoading(false);
      return;
    }

    try {
      if (data.instanceType === 'baileys') {
        const result = await createBaileysInstance(data.instanceName, user.id);
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
      } else {
        const formData = new FormData();
        formData.append('instanceName', data.instanceName);
        formData.append('instanceType', data.instanceType);
        formData.append('userId', user.id);
        const result = await createInstance(formData);
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
      }
    } catch (error) {
      console.error('[ConnectionMain]', error);
      toast.error('Hubo un error al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const checkNameAvailable = useCallback(
    (name: string) => checkInstanceNameExists(name),
    []
  )

  useEffect(() => {
    if (!autoCreate || instance || loading) return;

    (async () => {
      setLoading(true);
      try {
        if (instanceType === 'baileys') {
          await createBaileysInstance(derivedInstanceName, user.id);
        } else {
          const formData = new FormData();
          formData.append('instanceName', derivedInstanceName);
          formData.append('instanceType', instanceType);
          formData.append('userId', user.id);
          await createInstance(formData);
        }
      } catch {
        // autoCreate failures are silent — user can click the button manually
      } finally {
        setLoading(false);
      }
    })();
  }, [autoCreate]);

  return instance ? (
    <ClientInstanceCard
      intanceName={instanceName}
      displayName={displayName}
      instanceType={instanceType}
      user={user}
      currentInstanceInfo={currentInstanceInfo}
      prompts={filteredPrompts}
    />
  ) : (
    <ConnectionCard
      user={user}
      handleSubmit={onSubmit}
      loading={loading}
      defaultValues={{ instanceName: derivedInstanceName, instanceType: instanceType }}
      instanceType={instanceType}
      checkNameAvailable={checkNameAvailable}
    />
  );
};
