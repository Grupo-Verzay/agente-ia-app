/**
 * La base, fingida, para `lib/waha.ts`: lo único que lee es la configuración del
 * servidor (Panel › Conexión), y aquí apunta al Waha de mentira del banco.
 */
export const db = {
  siteConfig: {
    findFirst: async () => ({ wahaUrl: process.env.WAHA_FALSO ?? '', wahaApiKey: 'banco' }),
  },
};
