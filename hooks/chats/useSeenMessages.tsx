import { useState, useEffect } from 'react';

export interface MessageRecord {
  userId: string;
  messageId: string;
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
