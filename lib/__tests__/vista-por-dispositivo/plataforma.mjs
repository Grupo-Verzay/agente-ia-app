// La plataforma de mentira: `/inicio` (con los precios en `#pricing`, a
// donde lleva «/planes») y `/diagnostico`, responsive de verdad
// (la vista cambia con el ancho) y largas para poder bajar. Apunta cada
// petición con su agente en `globalThis.__peticiones`.
import http from "node:http";

globalThis.__peticiones = [];
const pagina = (titulo) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:sans-serif}.r{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:16px}
@media(max-width:1023px){.r{grid-template-columns:repeat(2,1fr)}}@media(max-width:639px){.r{grid-template-columns:1fr}}
.c{height:300px;background:#dbeafe;border-radius:12px;padding:12px}</style></head>
<body><h1>${titulo}</h1><div class="r">${Array.from({ length: 12 }, (_, i) => `<div class="c">Plan ${i + 1}</div>`).join("")}</div>
<h2 id="pricing">Precios</h2><div class="r">${Array.from({ length: 9 }, (_, i) => `<div class="c">Precio ${i + 1}</div>`).join("")}</div></body></html>`;

export function levantarLaPlataforma(puerto) {
    const servidor = http.createServer((req, res) => {
        const ruta = new URL(req.url, "http://x").pathname;
        globalThis.__peticiones.push({ ruta, agente: String(req.headers["user-agent"] ?? "") });
        if (ruta === "/inicio" || ruta === "/diagnostico") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(pagina(ruta === "/inicio" ? "Planes" : "Diagnóstico"));
            return;
        }
        res.writeHead(404, { "content-type": "text/html" });
        res.end("<h1>404</h1>");
    });
    return new Promise((ok) => servidor.listen(puerto, "127.0.0.1", () => ok(servidor)));
}
