/**
 * Encima de `sembrar-barra.mjs` y `sembrar-no-leido.mjs`: dos notas internas
 * ya escritas, para que la bandeja ENTRE con los dos casos delante.
 *
 *  - Beatriz: una nota escrita AHORA, después de su último mensaje (hace 5
 *    min). Su vista previa tiene que ser «🔒 Llamar mañana a las 10».
 *  - Diana: una nota de hace 10 min, ANTES de su último mensaje (hace 7 min).
 *    Su vista previa sigue siendo el mensaje («Hola»), y la nota se ve solo en
 *    el candado de la fila de iconitos.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });
const LINEA = "BANCO_VENTAS";

// La ficha de una conversación se empareja con su fila por la llave de SU
// línea (`instanceId === instanceName`, ver `lib/chat-session-match.ts`), que
// es como las guarda el motor. Los dos sembradores de abajo las dejan con otro
// valor, y entonces la bandeja crea al abrirse una segunda ficha por contacto
// (la que sí es de la línea): una nota colgada de la primera no la vería
// nadie. Se ponen en su línea antes de colgarles nada.
await db.session.updateMany({ where: { userId: dueno.id }, data: { instanceId: LINEA } });

const NOTAS = [
  { jid: "573001112244@s.whatsapp.net", texto: "Llamar mañana a las 10", haceMs: 0 },
  { jid: "573001112266@s.whatsapp.net", texto: "Le interesa el plan anual", haceMs: 10 * 60_000 },
];

for (const n of NOTAS) {
  const sesion = await db.session.findFirstOrThrow({
    where: { userId: dueno.id, instanceId: LINEA, remoteJid: n.jid },
    select: { id: true },
  });
  await db.internalNote.create({
    data: {
      sessionId: sesion.id,
      authorId: dueno.id,
      content: n.texto,
      createdAt: new Date(Date.now() - n.haceMs),
    },
  });
}

console.log(JSON.stringify({ notas: NOTAS.length }));
await db.$disconnect();
