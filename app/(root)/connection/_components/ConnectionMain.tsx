'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createInstance } from '@/actions/api-action';
import { toast } from 'sonner';
import { ClientInstanceCard, ConnectionCard } from './';
import { ConnectionMainInterface, FormInstanceConnectionValues, sanitizeInstanceName } from '@/schema/connection';
import { PromptInstance } from '@prisma/client';
import { checkInstanceNameExists, createBaileysInstance } from '@/actions/instances-actions';

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
  const currentInstanceInfo = instanceInfo?.find((i) => i.name === instanceName);

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
