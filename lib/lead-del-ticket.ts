import "server-only";

import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { normalizeChatHistoryRemoteJid } from "@/lib/chat-history/build-session-id";

/**
 * El lead al que se engancha un ticket de la ficha pública.
 *
 * El número que deja el contacto es **el canal por el que se le avisa después**,
 * así que el ticket no puede quedarse con un número suelto: tiene que caer en
 * la misma ficha de contacto que ya tenga la cuenta, o crearle una si es la
 * primera vez. Si no, el mismo cliente sale como dos personas —una en Chats y
 * otra en Tickets— y nadie sabe cuál mirar.
 *
 * # Se busca por TODAS sus identidades
 *
 * Es la regla de siempre de Chats: un contacto está guardado bajo `remoteJid` o
 * bajo `remoteJidAlt` según con qué forma llegó su primer mensaje, y preguntar
 * por una sola **devuelve correcto y vacío**. Aquí eso no se vería como un
 * error: se vería como un lead duplicado que aparece solo.
 *
 * Y las dos columnas se preguntan en **consultas separadas**, no con un `OR`:
 * `remoteJid` entra por el índice `(userId, remoteJid)` y `remoteJidAlt` no
 * tiene ninguno, así que un `OR` sobre las dos recorrería las sesiones de la
 * cuenta entera. Es el mismo motivo por el que
 * `levantarMarcasSiElContactoEscribio` lleva tres `EXISTS` y no uno.
 *
 * # Y no se cruza un `@lid` con su número
 *
 * `buildWhatsAppJidCandidates` no lo hace a propósito —los dígitos de un `@lid`
 * son un id de privacidad, no un teléfono— y aquí tampoco hace falta: lo que
 * llega es un número tecleado por su dueño.
 */

/** Nunca lanza: el ticket entra igual. `null` = no se pudo enganchar. */
export async function elLeadDelContacto(input: {
  cuentaId: string;
  /** Solo dígitos, con indicativo. Ya armado. */
  numero: string;
  /** Para estrenar la ficha con un nombre y no con el número pelado. */
  nombre: string;
}): Promise<number | null> {
  const numero = String(input.numero ?? "").replace(/\D+/g, "");
  if (!input.cuentaId || !numero) return null;

  try {
    const remoteJid = normalizeChatHistoryRemoteJid(numero);
    const candidatos = Array.from(
      new Set([remoteJid, ...buildWhatsAppJidCandidates(remoteJid)]),
    ).filter(Boolean);
    if (!candidatos.length) return null;

    // 1. Por `remoteJid`, que es por donde entra el índice.
    const porPrincipal = await db.session.findFirst({
      where: { userId: input.cuentaId, remoteJid: { in: candidatos } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (porPrincipal) return porPrincipal.id;

    // 2. Y si no, por la alterna, en su propia consulta.
    const porAlterna = await db.session.findFirst({
      where: { userId: input.cuentaId, remoteJidAlt: { in: candidatos } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (porAlterna) return porAlterna.id;

    // 3. No existe: se le crea la ficha. Hace falta una línea de la cuenta,
    //    porque el lead es único por `(cuenta, línea, número)` — sin línea no
    //    hay dónde colgarlo, y eso **no es un fallo del ticket**: es una cuenta
    //    que todavía no ha conectado ningún WhatsApp.
    const linea = await laLineaDeLaCuenta(input.cuentaId);
    if (!linea) {
      console.info("[tickets] ficha pública sin línea con la que crear el lead", {
        cuenta: input.cuentaId,
      });
      return null;
    }

    const nombre = input.nombre.trim().slice(0, 120) || numero;
    const creada = await db.session.create({
      data: {
        userId: input.cuentaId,
        remoteJid,
        pushName: nombre,
        customName: nombre,
        instanceId: linea,
        // Abierta: el contacto acaba de escribir por su propia iniciativa, que
        // es exactamente lo que `status` significa en una conversación nueva.
        status: true,
      },
      select: { id: true },
    });
    return creada.id;
  } catch (error) {
    // Nunca tumba el ticket: ya está guardado y el aviso sale por el número
    // igual. Pero **no es mudo** — un ticket sin lead se lee como que la
    // bandeja de Chats no se entera de nada, y eso no se parece a un error.
    console.warn("[tickets] no se pudo enganchar el lead de una ficha pública", {
      cuenta: input.cuentaId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * La línea con la que se crea el lead.
 *
 * Se prefiere una de WhatsApp —`Whatsapp` de Evolution o `waha`, que son las
 * dos formas de la misma cosa— y si no hay ninguna vale cualquiera: lo que se
 * está creando es una ficha de contacto, no un envío. **El tipo sale de la
 * fila**, que es la regla de `lib/sesion-de-la-linea.ts`: preguntar solo por
 * `Whatsapp` dejaba fuera a toda cuenta que hubiera cambiado a Waha.
 */
async function laLineaDeLaCuenta(cuentaId: string): Promise<string | null> {
  const filas = await db.instancia.findMany({
    where: { userId: cuentaId },
    select: { instanceId: true, instanceType: true },
    orderBy: { id: "asc" },
  });
  if (!filas.length) return null;
  const deWhatsapp = filas.find(
    (f) => f.instanceType === "Whatsapp" || f.instanceType === "waha" || !f.instanceType,
  );
  return (deWhatsapp ?? filas[0]).instanceId || null;
}
