'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getInstances } from '@/actions/api-action'; // Importa la server action

interface OpenAICredentialProps {
  instanceName: string;
  instanceId: string;
}

interface OpenAICredentialComponentProps {
  userId: string;
}

interface OpenAICredential {
  id: string;
  name: string;
  apiKey: string;
}

const OpenAICredentialManager: React.FC<OpenAICredentialComponentProps> = ({ userId }) => {
  const [apiKey, setApiKey] = useState<string>(''); // Estado para almacenar la API Key
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openAICredential, setOpenAICredential] = useState<OpenAICredential | null>(null);
  const [instanceData, setInstanceData] = useState<OpenAICredentialProps | null>(null); // Instancia
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false); // Estado para controlar el modal
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null); // Estado de conexión

  // URL base de la API
  const baseUrl = 'https://conexion.aizenbots.com';

  // Función para obtener las instancias y la API Key
  const fetchInstancesAndApiKey = async () => {
    try {
      const instances = await getInstances(userId); // Llama a la server action con el userId

      if (Array.isArray(instances) && instances.length > 0) {
        const { instanceName, instanceId } = instances[0]; // Toma la primera instancia
        setInstanceData({ instanceName, instanceId });

        // Obtener la API Key de la credencial almacenada
        await fetchOpenAICredential(instanceName, instanceId); // Consulta la credencial al cargar
      } else {
        setError('No se encontraron instancias para este usuario.');
      }
    } catch (err) {
      setError('Error al cargar las instancias: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Consulta las credenciales de OpenAI
  const fetchOpenAICredential = useCallback(async (instanceName: string, instanceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/openai/creds/${instanceName}`, {
        method: 'GET',
        headers: {
          apikey: instanceId,
        },
      });

      if (!response.ok) {
        throw new Error('Error al obtener la credencial.');
      }

      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        setOpenAICredential(data[0]);
      } else {
        setOpenAICredential(null);
      }
    } catch (err) {
      setError('Error al obtener la credencial: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  const createOpenAICredential = async (instanceName: string, instanceId: string, apiKey: string) => {
    if (!apiKey) {
      setError('La clave API no puede estar vacía.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/openai/creds/${instanceName}`, {
        method: 'POST',
        headers: {
          apikey: instanceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'apikey',
          apiKey: apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al crear la credencial.');
      }

      const data = await response.json();
      setOpenAICredential(data);
      setApiKey(''); // Limpiar el input después de crear
      setIsModalOpen(false); // Cierra el modal después de crear
    } catch (err) {
      setError('Error al crear la credencial: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const deleteOpenAICredential = async (credId: string, instanceName: string, instanceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/openai/creds/${credId}/${instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': instanceId,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al eliminar la credencial.');
      }

      setOpenAICredential(null); // Limpiar la credencial después de eliminarla
    } catch (err) {
      setError('Error al eliminar la credencial: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInstancesAndApiKey = async () => {
      try {
        const instances = await getInstances(userId);

        if (Array.isArray(instances) && instances.length > 0) {
          const { instanceName, instanceId } = instances[0];
          setInstanceData({ instanceName, instanceId });
          await fetchOpenAICredential(instanceName, instanceId);
        } else {
          setError('No se encontraron instancias para este usuario.');
        }
      } catch (err) {
        setError('Error al cargar las instancias: ' + (err instanceof Error ? err.message : String(err)));
      }
    };

    void loadInstancesAndApiKey();
  }, [fetchOpenAICredential, userId]);

  if (loading) return <p className="text-center text-lg text-gray-500">Cargando...</p>;
  if (error) return <p className="text-center text-lg text-red-500">{error}</p>;

  return (
    <div className="p-2 bg-white rounded-lg shadow-md">

        {openAICredential ? (
          <div className="space-y-4">
            <div className="bg-gray-100 p-1 rounded-md shadow-sm flex items-center justify-between">
              <p className="text-gray-600 uppercase">{openAICredential.name}</p>  
              <button
                onClick={() => deleteOpenAICredential(openAICredential.id, instanceData!.instanceName, instanceData!.instanceId)}
                className="bg-red-500 text-white p-2 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
              >
                X
              </button>
            </div>
          </div>
        ): (
        <>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Crear OpenIA
          </button>

          {isModalOpen && (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
              <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                <h4 className="text-xl font-semibold text-gray-800">Crear nueva credencial</h4>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none my-4"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => createOpenAICredential(instanceData!.instanceName, instanceData!.instanceId, apiKey)}
                    className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="ml-2 bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OpenAICredentialManager;
