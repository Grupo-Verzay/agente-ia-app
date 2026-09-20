// La entrada del banco del sufijo de dispositivo: lo puro y lo de la base, en
// un solo paquete, para que el banco pruebe LAS FUNCIONES DE PRODUCCION.
export {
  sinSufijoDeDispositivo,
  buildWhatsAppJidCandidates,
  extractWhatsAppDigits,
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickPreferredWhatsAppRemoteJid,
  pickObservedAlternateRemoteJid,
  fmtPhone,
  isGroupJid,
  isLidJid,
} from "@/lib/whatsapp-jid";

export {
  unificarLasConversaciones,
  unificarLasFichas,
  unificarPorSufijoDeDispositivo,
  TABLAS_QUE_CUELGAN_DE_LA_FICHA,
} from "@/lib/sufijo-de-dispositivo-db";

export { db } from "@/lib/db";
