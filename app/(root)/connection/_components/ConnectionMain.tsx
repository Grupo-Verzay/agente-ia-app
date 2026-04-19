'use client';

import { useState, useMemo, useCallback } from 'react';
import { createInstance } from '@/actions/api-action';
import { toast } from 'sonner';
import { ClientInstanceCard, ConnectionCard } from './';
import { ConnectionMainInterface, FormInstanceConnectionValues } from '@/schema/connection';
import { PromptInstance } from '@prisma/client';
import { checkInstanceNameExists } from '@/actions/instances-actions';

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
      console.warn('[ConnectionMain] Instancia ya existente, cancelando creación.');
      toast.error('El usuario ya tiene una instancia activa.');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('instanceName', data.instanceName);
    formData.append('instanceType', data.instanceType);
    formData.append('userId', user.id);


    try {
      const result = await createInstance(formData);

      if (result.success) {
        toast.success(result.message);
      } else {
        console.warn('[ConnectionMain] ❌ Error al crear instancia →', result.message);
        toast.error(result.message);
      }
    } catch (error) {
      console.error('[ConnectionMain] ⚠️ Excepción atrapada →', error);
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
