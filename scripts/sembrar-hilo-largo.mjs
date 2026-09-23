/**
 * Un hilo LARGO en la conversación del banco de la barra (`sembrar-barra.mjs`).
 *
 * Con tres mensajes el hilo no se desplaza, así que no hay «mensaje pegado al
 * borde de arriba» que medir: la barra de reacciones siempre cabría y el banco
 * saldría verde sin ejercer el caso reportado. Ochenta mensajes alternos (a zoom 80 % el hilo mide más de 900 px y con cuarenta el del medio no llega a subir al borde), de
 * los dos lados, con alguno largo para que las burbujas no midan todas igual.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const LINEA = "BANCO_VENTAS";
const JID = "573001112233@s.whatsapp.net";

const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id, messageId: { startsWith: "H" } } });

const ahora = Date.now();
const N = 80;
for (let i = 0; i < N; i++) {
    const cuando = ahora - (N - i) * 60000 - 10 * 60000;
    const fromMe = i % 2 === 1;
    const content =
        i % 7 === 0
            ? `Mensaje ${i + 1}: este es más largo para que la burbuja ocupe varias líneas y el hilo no sea una rejilla de burbujas iguales.`
            : `Mensaje ${i + 1}`;
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: JID,
            messageId: `H${i}`,
            fromMe,
            pushName: "Alexis Cliente",
            messageType: "conversation",
            content,
            raw: {
                key: { id: `H${i}`, remoteJid: JID, fromMe },
                message: { conversation: content },
                messageTimestamp: Math.floor(cuando / 1000),
            },
            messageTimestamp: new Date(cuando),
        },
    });
}
await db.$disconnect();
console.log(JSON.stringify({ mensajes: N }));
