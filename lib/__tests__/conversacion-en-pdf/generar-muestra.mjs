/** Genera el PDF de muestra que el banco de Chromium renderiza y mide. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CONVERSACION, IMAGEN_NUESTRA, imagenDePrueba, logoDePrueba } from "./muestra.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { conversacionEnPdf } = await import(join(AQUI, "..", ".compilado", "pdf", "conversacion-en-pdf.js"));
const bytes = await conversacionEnPdf(CONVERSACION, {
    exportadaEn: new Date(Date.UTC(2026, 8, 27, 19, 5)),
    zonaHoraria: "America/Bogota",
    marca: { nombre: "Tienda El Sol", logo: await logoDePrueba() },
    imagenes: new Map([[IMAGEN_NUESTRA, await imagenDePrueba()]]),
});
fs.writeFileSync(process.argv[2], bytes);
