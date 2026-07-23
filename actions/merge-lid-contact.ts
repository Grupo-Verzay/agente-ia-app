'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/** Normaliza un @lid a `<digitos>@lid` (quita sufijo de dispositivo :NN). */
function normLid(value: string): string {
  const digits = (value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits ? `${digits}@lid` : '';
}

/** Convierte un número (dígitos o JID) a `<digitos>@s.whatsapp.net`. */
function toPhoneJid(value: string): string {
  const digits = (value || '').replace(/@.*/, '').replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

/**
 * Une manualmente una conversación "fantasma" @lid con el contacto real:
 * - Guarda el mapeo permanente en `chat_lid_map` (userId, lid) -> número, para
 *   que el sistema lo reconozca PARA SIEMPRE (no se vuelve a partir).
 * - Rellena `remoteJidAlt`/`senderPn` de la conversación @lid con el número real,
 *   para que la lista de chats la fusione con el contacto real (deduplica por
 *   ese alias, con el dedup ya desplegado).
 *
 * Es NO destructivo: no borra ni mueve mensajes. Todo va envuelto en try/catch;
 * si algo falla, no afecta nada más.
 */
export async function mergeLidContact(input: {
  lidJid: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: 'No autenticado.' };
  const userId = (user as any).effectiveId ?? user.id;

  const lid = normLid(input.lidJid);
  const phoneJid = toPhoneJid(input.phone);
  const rawLid = (input.lidJid || '').trim();

  if (!lid) return { ok: false, error: 'Este chat no tiene un ID @lid válido.' };
  if (!phoneJid || phoneJid.replace(/\D/g, '').length < 8) {
    return { ok: false, error: 'Número real inválido. Escríbelo completo con código de país.' };
  }

  try {
    // 1) Mapeo permanente lid -> número (mismo formato que aprende el backend).
    await db.$executeRaw`
      INSERT INTO "chat_lid_map" ("userId", "lid", "remoteJid", "updatedAt")
      VALUES (${userId}, ${lid}, ${phoneJid}, NOW())
      ON CONFLICT ("userId", "lid")
      DO UPDATE SET "remoteJid" = EXCLUDED."remoteJid", "updatedAt" = NOW()
    `;

    // 2) Backfill NO destructivo: la conversación @lid toma el número como alias
    //    para que la lista la fusione con el contacto real.
    await db.$executeRaw`
      UPDATE "chat_conversations"
      SET "remoteJidAlt" = ${phoneJid},
          "senderPn" = COALESCE("senderPn", ${phoneJid}),
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND ("remoteJid" = ${rawLid} OR "remoteJid" = ${lid})
    `;

    revalidatePath('/chats');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo unir el contacto.' };
  }
}
