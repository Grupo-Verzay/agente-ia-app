'use client';

import { useState, useMemo, useCallback } from 'react';
import { createInstance } from '@/actions/api-action';
import { toast } from 'sonner';
import { ClientInstanceCard, ConnectionCard } from './';
import { ConnectionMainInterface, FormInstanceConnectionValues } from '@/schema/connection';
import { PromptInstance } from '@prisma/client';
import { checkInstanceNameExists, createBaileysInstance } from '@/actions/instances-actions';

export const ConnectionMain = ({
  user,
  instance,
  instanceInfo,
  instanceType,
  prompts,
}: ConnectionMainInterface) => {
  const [loading, setLoading] = useState<boolean>(false);
  const instanceName = !instance ? '' : instance.instanceName;
  const currentInstanceInfo = instanceInfo?.find((i) => i.name === instanceName);

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
      defaultValues={{ instanceName, instanceType: instanceType }}
      instanceType={instanceType}
      checkNameAvailable={checkNameAvailable}
    />
  );
};
