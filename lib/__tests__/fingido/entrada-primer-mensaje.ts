// Lo que el banco del primer mensaje a un lead necesita, en un solo paquete.
export { sendWahaText, sendWahaMedia } from '@/lib/waha';
export { canonicalToWahaJid } from '@/lib/waha-jid';
export { resolvePreferredRemoteJid } from '@/lib/chat-session-match';
export { buildWhatsAppJidCandidates } from '@/lib/whatsapp-jid';
