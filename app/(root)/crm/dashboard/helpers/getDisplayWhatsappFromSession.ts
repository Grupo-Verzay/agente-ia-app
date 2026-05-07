import type {
    Session as PrismaSession,
} from "@prisma/client";
import { pickExplicitWhatsAppPhoneJid, fmtPhone } from "@/lib/whatsapp-jid";

export function getDisplayWhatsappFromSession(session: PrismaSession) {
    const base =
        pickExplicitWhatsAppPhoneJid([session.remoteJid, session.remoteJidAlt]) ||
        session.remoteJidAlt ||
        session.remoteJid;
    return fmtPhone(base);
}
