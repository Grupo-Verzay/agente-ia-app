import { useState, useEffect } from 'react';

export interface MessageRecord {
  /**
   * Qué chat, y en qué línea: `<instancia>::<remoteJid>`.
   *
   * Antes era solo el remoteJid. Un mismo contacto que escribe a dos líneas
   * —y sobre todo un `@lid`, que se repite entre líneas— compartía una única
   * marca: abrir el chat en una borraba la marca de la otra, y las dos se
   * pisaban sin parar. El nombre del campo se queda por los registros ya
   * guardados en los navegadores.
   */
  userId: string;
  messageId: string;
  /**
   * Fecha del último mensaje visto, en milisegundos.
   *
   * El id exacto no bastaba: Evolution cambia el último mensaje de un chat por
   * cosas que no son un mensaje nuevo (un acuse, una edición), y al no coincidir
   * el id la conversación volvía a marcarse sin leer. Con la fecha, se considera
   * leído todo lo que no sea posterior a lo que ya se abrió.
   */
  ts?: number;
}

/**
 * Stores and retrieves a MessageRecord array from localStorage.
 *
 * Initializes with `initialValue` on both server and client so the first render
 * is identical (prevents React hydration mismatches). After hydration, a
 * useEffect loads the persisted data from localStorage.
 */
export function useLocalStorageObjectArray(
  key: string,
  initialValue: MessageRecord[],
): [MessageRecord[], React.Dispatch<React.SetStateAction<MessageRecord[]>>] {
  // Always start with initialValue — keeps server and client renders in sync
  const [value, setValue] = useState<MessageRecord[]>(initialValue);

  // After hydration: load persisted data
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored) as MessageRecord[]);
      }
    } catch (error) {
      console.error(`[useLocalStorageObjectArray] read error for "${key}":`, error);
    }
  }, [key]);

  // Persist changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[useLocalStorageObjectArray] write error for "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
