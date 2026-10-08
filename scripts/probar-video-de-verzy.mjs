/**
 * La prueba REAL de una videollamada de Verzy: con la App servida, abre el flujo
 * en vivo (`?stream=1`) como lo abre la sala y recorre la llamada entera: ir a
 * la conversación, el diagnóstico con tres notas, los precios, varias pantallas
 * y una ruta que no existe. Cuenta los fotogramas DISTINTOS mientras navega y
 * escribe, mide cuánto tarda cada pantalla, comprueba que contesta con la
 * pantalla ya puesta, y busca las notas en la BASE: en la pestaña Notas de la
 * conversación (`user_notes`), nunca en la ficha de contacto.
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

// La URL la elige el modelo (entrenamiento de Videollamadas); aquí, la del chat de Mariana.
const ir = await orden({ tipo: "ir", lugar: "/chats?jid=573001112233@s.whatsapp.net" });
const m1 = distintos(ir.t0, ir.t1);
ok(ir.j?.ok === true, "Verzy abre Chats y la conversación", JSON.stringify(ir.j));
ok(m1.distintos >= 15 && m1.porSeg >= 3, "MIENTRAS navega a Chats la pantalla se MUEVE", JSON.stringify(m1));

// 3. El diagnóstico: tres notas seguidas, como las toma Verzy mientras escucha.
const marca = Date.now() % 100000;
const textos = [
    `Tiene una tienda de calzado con 2 asesores (${marca})`,
    `Le interesan los tenis blancos talla 38 (${marca})`,
    `Quiere responder por WhatsApp de noche (${marca})`,
];
const notas = [];
for (const t of textos) {
    const n = await orden({ tipo: "nota", texto: t });
    notas.push(n);
    ok(n.j?.ok === true, `Verzy escribe la nota «${t.slice(0, 32)}…»`, JSON.stringify(n.j));
}
const nota = notas[1];
const m2 = distintos(nota.t0, nota.t1);
ok(m2.distintos >= 30 && m2.porSeg >= 3, "MIENTRAS escribe la nota la pantalla se MUEVE (letra a letra)", JSON.stringify(m2));

const db = new PrismaClient();
const enNotas = await db.userNote.findMany({ where: { title: { startsWith: "NOTAS DE LA VIDEOLLAMADA" } }, select: { id: true, title: true, content: true } });
const plano = JSON.stringify(enNotas.map((n) => n.content));
ok(enNotas.length === 1, "UNA sola nota de la llamada en la pestaña Notas", JSON.stringify(enNotas.map((n) => n.title)));
for (const t of textos) ok(plano.includes(t), `la pestaña Notas guarda «${t.slice(0, 32)}…»`);
const fichas = await db.externalClientData.findMany({ select: { data: true } });
ok(!fichas.some((f) => textos.some((t) => JSON.stringify(f.data ?? {}).includes(t))), "NADA quedó en la ficha de contacto");

// 4. Precios, y otras pantallas: directo y rápido, y contesta con la pantalla ya puesta.
async function irYMedir(lugar, que, topeMs) {
    const r = await orden({ tipo: "ir", lugar });
    const ms = r.t1 - r.t0;
    ok(r.j?.ok === true, `Verzy abre ${que}`, JSON.stringify(r.j));
    ok(ms <= topeMs, `${que} tarda poco`, `${ms} ms (tope ${topeMs})`);
    const antes = [...fotos].reverse().find((f) => f.t <= r.t0);
    const ultimaAntesDeContestar = [...fotos].reverse().find((f) => f.t <= r.t1);
    ok(!!antes && !!ultimaAntesDeContestar && antes.hash !== ultimaAntesDeContestar.hash, `${que} ya se VE cuando contesta (la voz no va por delante)`);
    return r;
}
const precios = await irYMedir("/inicio#pricing", "los precios (/inicio#pricing)", 9000);
await irYMedir("/embudos", "Embudos", 9000);
await irYMedir("/schedule", "la Agenda", 9000);
await irYMedir("/chats?jid=573001112233@s.whatsapp.net", "otra vez la conversación", 9000);
// Volver a una página ya abierta solo baja a la sección: casi inmediato.
await irYMedir("/inicio#pricing", "los precios otra vez", 9000);

// 5. Una ruta que no existe: no se enseña nunca, y se vuelve a la de antes.
const antesDelFallo = (await db.$queryRaw`SELECT "url" FROM "verzy_pantallas" WHERE "citaId" = ${CITA}`)[0]?.url ?? "";
const malo = await orden({ tipo: "ir", lugar: "/esta-pagina-no-existe" });
ok(malo.j?.ok === false, "una ruta que no existe NO cuenta como hecha", JSON.stringify(malo.j));
await dormir(2500);
const despues = (await db.$queryRaw`SELECT "url" FROM "verzy_pantallas" WHERE "citaId" = ${CITA}`)[0]?.url ?? "";
ok(!despues.includes("esta-pagina-no-existe") && despues === antesDelFallo, "la pantalla se queda donde estaba", `${antesDelFallo} -> ${despues}`);
const enElFallo = fotos.filter((f) => f.t >= malo.t0 && f.t <= malo.t1 + 1500);
const ultimaAntes = [...fotos].reverse().find((f) => f.t < malo.t0);
const distintasEnElFallo = new Set(enElFallo.map((f) => f.hash).filter((h) => h !== ultimaAntes?.hash));
console.log(`     fotogramas distintos durante el fallo: ${distintasEnElFallo.size}`);
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
    const enElFalloFotos = enElFallo.filter((f) => f.hash !== ultimaAntes?.hash);
    const elegidas = [fotos[0], fotos.find((f) => f.t >= ir.t0 + 1500), fotos.find((f) => f.t >= nota.t0 + 2500), antesDelHueco, trasElHueco,
        [...fotos].reverse().find((f) => f.t <= notas[2].t1), [...fotos].reverse().find((f) => f.t <= precios.t1), ...enElFalloFotos, fotos[fotos.length - 1]].filter(Boolean);
    elegidas.forEach((f, i) => fs.writeFileSync(`${process.env.FOTOS_EN}/fotograma-${i}.jpg`, f.jpeg));
    if (process.env.LINEA_DE_TIEMPO) for (const f of tramo) console.log("t", f.t - nota.t0, f.hash.slice(0, 6));
}
ctl.abort();
console.log(`\n${fallos ? `${fallos} fallos` : "todo bien"} · ${fotos.length} fotogramas en total`);
process.exit(fallos ? 1 : 0);
