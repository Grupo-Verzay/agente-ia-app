/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de AI Imágenes, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su clave de entrada).
 *
 * El marco —la cuenta de un cliente, su menú y la barra de arriba— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`). Lo propio de esta pantalla:
 *
 * - El proveedor `google`, que es donde la pantalla busca la API key de
 *   Gemini. La cuenta nace SIN clave, a propósito: la guía empieza por el aviso
 *   ámbar y la pone con la ventana de «Configurar», como lo haría un cliente
 *   (la clave es de mentira: contesta el Gemini fingido,
 *   `fingido-guia-ai-imagenes.mjs`).
 * - Créditos de IA para la cuenta: cada imagen y cada texto se cobran a la
 *   cuenta dueña (`usarLaIaCobrando`), y sin bolsa la pantalla diría «sin
 *   créditos» en vez de generar.
 * - Un estilo propio en la biblioteca visual, para que se vea la papelera de
 *   los estilos de la cuenta al lado de los cuatro de fábrica.
 */
import { PrismaClient } from "@prisma/client";

import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/ai-image",
    title: "Guía de AI Imágenes",
    description: "Aprende a crear anuncios de tu producto con IA en la plataforma",
    url: "/guia/ai-imagenes",
});

// El proveedor de Google, sin ninguna clave de la cuenta todavía.
const google = await db.aiProvider.upsert({
    where: { name: "google" },
    update: {},
    create: { name: "google", description: "Google Gemini", aiModel: "gemini-2.5-flash" },
});
await db.userAiConfig.deleteMany({ where: { userId: dueno.id, providerId: google.id } });

// La bolsa de créditos de la cuenta: de sobra para la tanda, el kit y el vídeo.
await db.iaCredit.upsert({
    where: { userId: dueno.id },
    update: { total: 5000, used: 0 },
    create: { userId: dueno.id, total: 5000, used: 0, renewalDate: new Date(Date.now() + 30 * 86_400_000) },
});

// Un estilo propio: el que lleva la papelera.
await db.userVisualStyle.deleteMany({ where: { userId: dueno.id } });
await db.userVisualStyle.create({
    data: {
        userId: dueno.id,
        name: "Mármol y luz cálida",
        description: "Mesa de mármol blanco, luz cálida de ventana y sombras suaves.",
    },
});

console.log(JSON.stringify({ proveedor: google.name, creditos: 5000, estilosPropios: 1, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
