/**
 * Las HOJAS DE GOOGLE de la guía de Mis datos, servidas dentro de `next start`.
 *
 * La pantalla importa una hoja pública: el servidor de la App descarga su CSV
 * de `docs.google.com` (`previewGoogleSheet`, `importFromGoogleSheetUrl`). Este
 * equipo no sale a internet, y aunque saliera, una guía no puede depender de
 * una hoja de verdad que alguien puede cambiar o borrar. Así que este fichero
 * se carga ANTES que Next (`NODE_OPTIONS=--require`, lo pone `generar-guia.sh`
 * cuando existe `servidor-guia-<modulo>.cjs`) y contesta en lugar de Google.
 *
 * Solo toca las dos hojas de la guía; cualquier otra dirección sigue su camino
 * tal cual, y otra hoja de Google contesta 404, como una hoja privada.
 *
 * Las filas se cruzan A PROPÓSITO con las sembradas (`sembrar-guia-mis-datos.mjs`):
 * ocho ya existen y cuatro son nuevas, así el resumen de la importación enseña
 * «Creados» y «Actualizados» con un número cada uno.
 */
const HOJA_DE_CLIENTES = "1GuiaMisDatosClientesDeEjemplo";
const HOJA_DE_CATALOGO = "1GuiaMisDatosCatalogoDeEjemplo";

// Los mismos números que la semilla: 57300 + (4521876 + i·137).
const numero = (i) => `57300${String(4521876 + i * 137).padStart(7, "0")}`;

const CLIENTES = [
    ["NOMBRE", "WHATSAPP", "PLAN", "SALDO", "VENCE", "CIUDAD"],
    ["María Fernanda López", numero(0), "Premium", "$0", "2026-10-15", "Bogotá"],
    ["Juan Pablo Restrepo", numero(1), "Plus", "$50.000", "2026-10-08", "Medellín"],
    ["Camila Andrade", numero(2), "Premium", "$0", "2026-10-21", "Cali"],
    ["Andrés Gómez", numero(3), "Básico", "$25.000", "2026-10-05", "Barranquilla"],
    ["Valentina Castro", numero(4), "Plus", "$0", "2026-10-30", "Bucaramanga"],
    ["Santiago Herrera", numero(5), "Premium", "$75.000", "2026-10-12", "Pereira"],
    ["Daniela Ríos", numero(6), "Básico", "$0", "2026-10-18", "Bogotá"],
    ["Felipe Moreno", numero(7), "Plus", "$0", "2026-10-25", "Medellín"],
    ["Paula Mejía", "573115550142", "Básico", "$0", "2026-11-02", "Cali"],
    ["Ricardo Salazar", "573145550187", "Premium", "$0", "2026-11-04", "Bogotá"],
    ["Juliana Osorio", "573205550163", "Plus", "$0", "2026-11-06", "Manizales"],
    ["Esteban Quintero", "573165550129", "Básico", "$0", "2026-11-09", "Medellín"],
];

const CATALOGO = [
    ["SKU", "PRODUCTO", "PRECIO", "STOCK"],
    ["SKU-001", "Kit de limpieza facial", "$89.000", "22"],
    ["SKU-002", "Crema hidratante 50 ml", "$54.000", "58"],
    ["SKU-003", "Protector solar FPS 50", "$72.000", "35"],
    ["SKU-004", "Sérum vitamina C", "$96.000", "15"],
    ["SKU-005", "Tónico equilibrante", "$48.000", "40"],
    ["SKU-006", "Mascarilla de arcilla", "$39.000", "51"],
    ["SKU-007", "Contorno de ojos", "$68.000", "18"],
    ["SKU-008", "Exfoliante suave", "$45.000", "30"],
    ["SKU-009", "Agua micelar 200 ml", "$36.000", "64"],
    ["SKU-010", "Bálsamo labial", "$18.000", "90"],
];

const comoCsv = (filas) =>
    filas.map((f) => f.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";

const HOJAS = { [HOJA_DE_CLIENTES]: comoCsv(CLIENTES), [HOJA_DE_CATALOGO]: comoCsv(CATALOGO) };

const original = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuia(entrada, init) {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    const hoja = url && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\/export/.exec(url);
    if (!hoja) return original(entrada, init);
    const csv = HOJAS[hoja[1]];
    // Un poco de espera, como una descarga de verdad: sin ella el «Leyendo…» y
    // el «Importando…» no llegarían a verse en el vídeo.
    await new Promise((r) => setTimeout(r, 700));
    if (!csv) return new Response("Not Found", { status: 404 });
    return new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
};

module.exports = { HOJA_DE_CLIENTES, HOJA_DE_CATALOGO };
