import { useState, useEffect } from 'react';

// 1. Definición del tipo de objeto que se guardará
export interface MessageRecord {
  userId: string;
  messageId: string;
}

/**
 * Custom Hook para guardar y obtener un array de objetos MessageRecord 
 * ([{ userId: string, messageId: string }[]]) de localStorage, manteniendo la persistencia.
 *
 * @param {string} key La clave con la que se guardará el array en localStorage.
 * @param {MessageRecord[]} initialValue El valor inicial si no hay nada guardado.
 * @returns {[MessageRecord[], React.Dispatch<React.SetStateAction<MessageRecord[]>>]} 
 * El estado del array y su función de actualización.
 */
export function useLocalStorageObjectArray(key: string, initialValue: MessageRecord[]): [MessageRecord[], React.Dispatch<React.SetStateAction<MessageRecord[]>>] {
  
  // 1. Inicialización del estado: intenta obtener el valor de localStorage
  const [value, setValue] = useState<MessageRecord[]>(() => {
    // Verificar entorno de renderizado (evita errores en SSR como Next.js)
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue) {
        // Parsear la cadena JSON y se asegura que es un array de MessageRecord
        // Usamos una aserción de tipo para TypeScript.
        return JSON.parse(storedValue) as MessageRecord[];
      }
      return initialValue;
    } catch (error) {
      console.error(`Error al obtener de localStorage para la clave "${key}":`, error);
      return initialValue; 
    }
  });

  // 2. Efecto para guardar el estado en localStorage CADA VEZ que 'value' cambia
  useEffect(() => {
    if (typeof window === 'undefined') {
        return;
    }
    
    try {
      // Guarda el array de objetos como una cadena JSON
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error al guardar en localStorage para la clave "${key}":`, error);
    }
  }, [key, value]);

  // Retorna el array y su función para actualizar
  return [value, setValue];
}