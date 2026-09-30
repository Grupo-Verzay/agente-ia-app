/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Google Sheets, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Aquí casi no hay datos: la pantalla es UNA hoja vinculada. Lo que se siembra
 * es el punto de partida —la cuenta SIN hoja—, porque la guía empieza por
 * vincularla; las capturas la vinculan con el enlace de ejemplo y a partir de
 * ahí enseñan la hoja. Lo que se ve DENTRO de la hoja lo pone el script de
 * capturas: la hoja de verdad vive en Google, y aquí se sirve una hoja de
 * ejemplo en su lugar (ver `HOJA_DE_EJEMPLO` en `capturar-guia-google-sheets.mjs`).
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta. El script de capturas lo vuelve a
 * correr antes del vídeo: las capturas dejan la hoja vinculada, y el vídeo
 * empieza por vincularla.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/google-sheets",
    title: "Guía de Google Sheets",
    description: "Aprende a vincular y consultar tu hoja de Google Sheets en la plataforma",
    url: "/guia/google-sheets",
});

await db.user.update({ where: { id: dueno.id }, data: { sheetsUrl: null } });

console.log("[guia] google-sheets: la cuenta, sin hoja vinculada");
await db.$disconnect();
