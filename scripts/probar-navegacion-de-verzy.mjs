/**
 * La prueba REAL de la navegación libre de Verzy: con la App servida y el
 * Chromium del servidor dentro de «Verzay Ventas», le pide ir a TODA la landing
 * (inicio, sus secciones, los seis planes, la documentación) y a pantallas de
 * la plataforma —también las que no están en ninguna lista sugerida—, y para
 * cada una comprueba que contesta ok, que la pantalla se MUEVE mientras va y
 * que acaba en otra imagen que la anterior. Una ruta que no existe contesta
 * «no existe», nunca un ok. FOTOS_EN=<dir> guarda el último fotograma de cada.
 *
 * Entra: BASE, CITA, FIRMA. Sale con 1 si algo falla.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";

const { BASE, CITA, FIRMA } = process.env;
const consulta = `c=${encodeURIComponent(CITA)}&f=${encodeURIComponent(FIRMA)}`;
const url = (extra) => `${BASE}/api/videollamada/pantalla?${extra}&${consulta}`;
let fallos = 0;
const ok = (cond, que, dato = "") => { console.log(`${cond ? "ok  " : "MAL "} ${que} ${dato}`); if (!cond) fallos++; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const prep = await (await fetch(url("preparar=1"))).json().catch(() => ({}));
ok(prep.ok === true, "la sesión de Verzay Ventas se prepara", JSON.stringify(prep));

const ctl = new AbortController();
const res = await fetch(url("stream=1"), { signal: ctl.signal });
ok(res.ok, "el flujo en vivo abre", String(res.status));
const fotos = [];
const SOI = Buffer.from([0xff, 0xd8]); const EOI = Buffer.from([0xff, 0xd9]);
(async () => {
    let buf = Buffer.alloc(0);
    try {
        for await (const trozo of res.body) {
            buf = Buffer.concat([buf, Buffer.from(trozo)]);
            for (;;) {
                const a = buf.indexOf(SOI); if (a < 0) break;
                const b = buf.indexOf(EOI, a + 2); if (b < 0) break;
                const jpeg = Buffer.from(buf.subarray(a, b + 2));
                fotos.push({ t: Date.now(), hash: createHash("md5").update(jpeg).digest("hex"), jpeg });
                buf = buf.subarray(b + 2);
            }
        }
    } catch { /* cortado al final */ }
})();
await dormir(2500);

async function ir(lugar) {
    const t0 = Date.now();
    const r = await fetch(url("x=1"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "ir", lugar }) });
    const j = await r.json().catch(() => ({}));
    await dormir(700);
    const t1 = Date.now();
    const tramo = fotos.filter((f) => f.t >= t0 && f.t <= t1);
    const distintos = new Set(tramo.map((f) => f.hash)).size;
    return { j, distintos, ultima: fotos[fotos.length - 1] };
}

if (process.env.FOTOS_EN) fs.mkdirSync(process.env.FOTOS_EN, { recursive: true });
const nombre = (l) => l.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "raiz";
let anterior = null;
async function probar(lugar, entorno) {
    const r = await ir(lugar);
    ok(r.j?.ok === true, `[${entorno}] Verzy va a ${lugar}`, JSON.stringify(r.j));
    ok(r.distintos >= 3, `[${entorno}]   la pantalla se mueve mientras va`, `${r.distintos} fotogramas distintos`);
    ok(r.ultima && r.ultima.hash !== anterior, `[${entorno}]   acaba en otra imagen que la anterior`);
    anterior = r.ultima?.hash;
    if (process.env.FOTOS_EN && r.ultima) fs.writeFileSync(`${process.env.FOTOS_EN}/${entorno}-${nombre(lugar)}.jpg`, r.ultima.jpeg);
}

// 1. Toda la landing: la portada, sus secciones (se baja a cada una), los seis planes y la documentación.
for (const l of ["/inicio", "/inicio#how", "/inicio#features", "/inicio#pricing", "/inicio#faq",
    "/planes/nivel-1", "/planes/nivel-2", "/planes/nivel-3", "/planes/nivel-4", "/planes/nivel-5", "/planes/nivel-6",
    "/documentacion"]) await probar(l, "landing");

// 2. La plataforma como Verzay Ventas: cualquier URL que pida el modelo, sin lista ninguna.
for (const l of ["/chats", "/crm/dashboard", "/crm/reportes", "/correo", "/documentation", "/crm/kanban", "/crm/llamadas", "/embudos", "/sessions",
    "/schedule", "/reminders", "/workflow", "/ia", "/products", "/equipo", "/tareas", "/profile",
    "/notas", "/mis-formularios", "/auto-replies", "/macros", "/bookings"]) await probar(l, "plataforma");

// 3. Una palabra suelta NO es una URL: el código no la traduce a ninguna pantalla.
for (const palabra of ["chats", "ficha", "precios", "embudo"]) {
    const r = await fetch(url("x=1"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "ir", lugar: palabra }) });
    const j = await r.json().catch(() => ({}));
    ok(j.ok !== true, `«${palabra}» no se traduce a ninguna pantalla`, `${r.status} ${JSON.stringify(j)}`);
}

// 4. Lo que no existe NO es un ok, y lo prohibido no se abre.
const nada = await ir("/esta-pantalla-no-existe");
ok(nada.j?.ok === false, "una ruta que no existe contesta que no existe", JSON.stringify(nada.j));
const prohibida = await fetch(url("x=1"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "ir", lugar: "/api/logout" }) });
ok(!prohibida.ok || (await prohibida.json().catch(() => ({}))).ok !== true, "una ruta prohibida (/api/logout) no se abre");

ctl.abort();
console.log(`\n${fallos ? `${fallos} fallos` : "todo bien"} · ${fotos.length} fotogramas en total`);
process.exit(fallos ? 1 : 0);
