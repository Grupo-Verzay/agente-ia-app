'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getInstances } from '@/actions/api-action';
import { createBotAction } from '@/actions/api-action'; // Importa la server action

interface UserIdProps {
  userId: string;
}

interface OpenAICredentialProps {
  instanceName: string;
  instanceId: string;
}

const CreateBotComponent = ({ userId }: UserIdProps) => {
  const [instanceData, setInstanceData] = useState<OpenAICredentialProps | null>(null);
  const [systemMessage, setSystemMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [botCreated, setBotCreated] = useState(false);

  // Obtener instancias
  const fetchInstances = useCallback(async () => {
    try {
      const instances = await getInstances(userId);
      if (Array.isArray(instances) && instances.length > 0) {
        const { instanceName, instanceId } = instances[0];
        setInstanceData({ instanceName, instanceId });
      } else {
        setError('No se encontraron instancias para este usuario.');
      }
    } catch (err) {
      setError('Error al cargar las instancias: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [userId]);

  // Crear bot usando la server action
  const handleCreateBot = async () => {
    if (!instanceData || !systemMessage.trim()) {
      setError('Falta información necesaria.');
      return;
    }

    const formData = new FormData();
    formData.append('instanceName', instanceData.instanceName);
    formData.append('instanceId', instanceData.instanceId);
    formData.append('systemMessage', systemMessage);

    try {
      setLoading(true);
      setError('');
      const result = await createBotAction(formData);
      setBotCreated(true);
    } catch (err) {
      setError('Error al crear el bot: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInstances();
  }, [fetchInstances]);

  return (
    <div className="p-2">
      {/* {error && <p className="text-red-500 mb-4">{error}</p>} */}

      <div className="mb-4">
        <label htmlFor="systemMessage" className="block text-gray-700 font-bold mb-2">
          Promt Inicial:
        </label>
        <input
          id="systemMessage"
          type="text"
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          placeholder="Ingresa la bienvenida y los pasos que quiere que haga el robot"
        />
      </div>

      <button
        onClick={handleCreateBot}
        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ${loading && 'opacity-50 cursor-not-allowed'}`}
        disabled={loading}
      >
        {loading ? 'Creando...' : 'Crear'}
      </button>

      {botCreated && (
        <p className="mt-4 text-green-500 font-bold">
          Bot creado correctamente
        </p>
      )}
    </div>
  );
};

export default CreateBotComponent;
