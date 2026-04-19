import type {
    Session as PrismaSession,
} from "@prisma/client";
import { pickExplicitWhatsAppPhoneJid } from "@/lib/whatsapp-jid";

export function getDisplayWhatsappFromSession(session: PrismaSession) {
    const base =
        pickExplicitWhatsAppPhoneJid([session.remoteJid, session.remoteJidAlt]) ||
        session.remoteJidAlt ||
        session.remoteJid;
    return base.includes("@") ? base.split("@")[0] : base;
}
