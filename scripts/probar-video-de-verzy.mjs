/**
 * La prueba REAL del video de Verzy: con la App servida, abre el flujo en vivo
 * (`?stream=1`) como lo abre la sala, le da a Verzy dos órdenes —ir a Chats y
 * tomar una nota— y cuenta los fotogramas DISTINTOS que llegan mientras navega.
 * Una pantalla que se mueve trae muchos por segundo; una foto que se renueva,
 * uno cada tanto. Y la nota se busca en la BASE.
 *
 * Entra: BASE, CITA, FIRMA, DATABASE_URL. Sale con 1 si algo falla.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const { BASE, CITA, FIRMA } = process.env;
const consulta = `c=${encodeURIComponent(CITA)}&f=${encodeURIComponent(FIRMA)}`;
const url = (extra) => `${BASE}/api/videollamada/pantalla?${extra}&${consulta}`;
let fallos = 0;
const ok = (cond, que, dato = "") => { console.log(`${cond ? "ok  " : "MAL "} ${que} ${dato}`); if (!cond) fallos++; };

// 1. Preparar la sesión y la pantalla, como la sala al montar.
const prep = await (await fetch(url("preparar=1"))).json().catch(() => ({}));
ok(prep.ok === true, "la sesión de Verzay Ventas se prepara", JSON.stringify(prep));

// 2. Abrir el flujo y leer fotogramas en segundo plano.
const ctl = new AbortController();
const res = await fetch(url("stream=1"), { signal: ctl.signal });
ok(res.ok, "el flujo abre", String(res.status));
const tipo = res.headers.get("content-type") || "";
ok(tipo.startsWith("multipart/x-mixed-replace"), "es un flujo de video (MJPEG)", tipo);
const fotos = []; // { t, hash, jpeg }
const SOI = Buffer.from([0xff, 0xd8]); const EOI = Buffer.from([0xff, 0xd9]);
(async () => {
    let buf = Buffer.alloc(0);
    try {
        for await (const trozo of res.body) {
            buf = Buffer.concat([buf, Buffer.from(trozo)]);
            for (;;) {
                const a = buf.indexOf(SOI); if (a < 0) break;
                const b = buf.indexOf(EOI, a + 2); if (b < 0) break;
                const jpeg = buf.subarray(a, b + 2);
                fotos.push({ t: Date.now(), hash: createHash("md5").update(jpeg).digest("hex"), jpeg: Buffer.from(jpeg) });
                buf = buf.subarray(b + 2);
            }
        }
    } catch { /* cortado al final */ }
})();

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
await dormir(3000);
ok(fotos.length > 0, "llegan fotogramas con la pantalla quieta", String(fotos.length));

async function orden(cuerpo) {
    const t0 = Date.now();
    const r = await fetch(url("x=1"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => ({}));
    return { t0, t1: Date.now(), j };
}
function distintos(t0, t1) {
    const tramo = fotos.filter((f) => f.t >= t0 && f.t <= t1);
    let n = 0, prev = "";
    for (const f of tramo) { if (f.hash !== prev) n++; prev = f.hash; }
    return { total: tramo.length, distintos: n, porSeg: n / Math.max(0.001, (t1 - t0) / 1000) };
}

const ir = await orden({ tipo: "ir", destino: "chats" });
const m1 = distintos(ir.t0, ir.t1);
ok(ir.j?.ok === true, "Verzy abre Chats y la conversación", JSON.stringify(ir.j));
ok(m1.distintos >= 15 && m1.porSeg >= 3, "MIENTRAS navega a Chats la pantalla se MUEVE", JSON.stringify(m1));

const texto = `Le interesan los tenis blancos talla 38 (${Date.now() % 100000})`;
const nota = await orden({ tipo: "nota", texto });
const m2 = distintos(nota.t0, nota.t1);
ok(nota.j?.ok === true, "Verzy escribe y guarda la nota", JSON.stringify(nota.j));
ok(m2.distintos >= 30 && m2.porSeg >= 3, "MIENTRAS escribe la nota la pantalla se MUEVE (letra a letra)", JSON.stringify(m2));

const db = new PrismaClient();
const filas = await db.externalClientData.findMany({ select: { data: true } });
ok(filas.some((f) => String(f.data?.notas ?? "").includes(texto)), "la nota está guardada en la BASE");
await db.$disconnect();

// Hueco más largo entre dos fotogramas distintos mientras se escribe.
const tramo = fotos.filter((f) => f.t >= nota.t0 && f.t <= nota.t1);
let hueco = 0, desde = 0, ultimo = tramo[0]?.t ?? 0, prev = "";
for (const f of tramo) { if (f.hash !== prev) { if (f.t - ultimo > hueco) { hueco = f.t - ultimo; desde = ultimo - nota.t0; } ultimo = f.t; } prev = f.hash; }
ok(hueco < 1500, "ningún congelón de más de 1,5 s mientras escribe", `${hueco} ms, desde +${desde} ms de ${nota.t1 - nota.t0} ms`);

if (process.env.FOTOS_EN) {
    const fs = await import("node:fs");
    fs.mkdirSync(process.env.FOTOS_EN, { recursive: true });
    const antesDelHueco = [...tramo].reverse().find((f) => f.t <= nota.t0 + desde);
    const trasElHueco = tramo.find((f) => f.t >= nota.t0 + desde + hueco);
    const elegidas = [fotos[0], fotos.find((f) => f.t >= ir.t0 + 1500), fotos.find((f) => f.t >= nota.t0 + 2500), antesDelHueco, trasElHueco, fotos[fotos.length - 1]].filter(Boolean);
    elegidas.forEach((f, i) => fs.writeFileSync(`${process.env.FOTOS_EN}/fotograma-${i}.jpg`, f.jpeg));
    if (process.env.LINEA_DE_TIEMPO) for (const f of tramo) console.log("t", f.t - nota.t0, f.hash.slice(0, 6));
}
ctl.abort();
console.log(`\n${fallos ? `${fallos} fallos` : "todo bien"} · ${fotos.length} fotogramas en total`);
process.exit(fallos ? 1 : 0);
