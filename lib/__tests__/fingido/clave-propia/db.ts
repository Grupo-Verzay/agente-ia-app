/** La base del banco de la clave propia: la siembra el test en `globalThis.__baseDeLaClave`. */
type Base = {
  user: Record<string, unknown> | null;
  credito: { total: number; used: number } | null;
};
const base = (): Base =>
  ((globalThis as unknown as { __baseDeLaClave?: Base }).__baseDeLaClave ??= { user: null, credito: null });

export const db = {
  user: { findUnique: async () => base().user },
  iaCredit: {
    findUnique: async () => base().credito,
    updateMany: async () => ({ count: 1 }),
  },
};
