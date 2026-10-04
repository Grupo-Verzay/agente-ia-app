// La página SERVIDA (next start sobre el build): el middleware limpia los
// enlaces viejos y deja la modalidad en una cookie, la página de un plan se abre
// por su nivel con el nombre vigente, y la landing enlaza por nivel y sin
// modalidad. La siembra va directo a la base con el cliente de Prisma.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3957";
const db = new PrismaClient();
const NIVELES = [["lite", 19, "Lite"], ["basico", 29, "Básico"], ["intermedio", 49, "Estárter"], ["avanzado", 79, "Esencial"], ["enterprise", 149, "Business"], ["personalizado", 299, "A la medida"]];

let fallos = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`ok   ${msg}`);
    else { fallos++; console.log(`MAL  ${msg}`); }
};

await db.planDetail.deleteMany({});
await db.subscriptionPlan.deleteMany({});
for (const [plan, priceUSD, name] of NIVELES) {
    for (const assistanceType of ["IA", "HUMANO"]) {
        await db.subscriptionPlan.create({ data: { plan, assistanceType, priceUSD, credits: 1000, name, features: ["Chats"], isActive: true } });
    }
}
// Un nombre viejo que se quedó en la fila de Humano: manda el más reciente.
await db.$executeRawUnsafe(`UPDATE "subscription_plans" SET "name" = 'Nombre viejo', "updatedAt" = now() - interval '2 days' WHERE "plan" = 'intermedio' AND "assistanceType" = 'HUMANO'`);

const pedir = (ruta, cabeceras = {}) => fetch(BASE + ruta, { redirect: "manual", headers: cabeceras });

const casos = [
    ["/planes/basico?tipo=HUMANO", "/planes/nivel-2", "HUMANO"],
    ["/planes/intermedio", "/planes/nivel-3", null],
    ["/register?plan=avanzado&a=IA", "/register?plan=nivel-4", "IA"],
    ["/register?r=agencia&plan=lite&a=HUMANO", "/register?r=agencia&plan=nivel-1", "HUMANO"],
    ["/completar-registro?plan=basico&a=HUMANO", "/completar-registro?plan=nivel-2", "HUMANO"],
];
for (const [desde, hacia, asistencia] of casos) {
    const r = await pedir(desde);
    const destino = r.headers.get("location") ? new URL(r.headers.get("location"), BASE) : null;
    ok(r.status === 307 && destino && destino.pathname + destino.search === hacia, `${desde} → ${hacia} (llegó ${r.status} ${destino ? destino.pathname + destino.search : "-"})`);
    const cookie = r.headers.get("set-cookie") ?? "";
    if (asistencia) ok(cookie.includes(`plan_asistencia=${asistencia}`) && /SameSite=Lax/i.test(cookie), `${desde} deja la modalidad en la cookie`);
    else ok(!cookie.includes("plan_asistencia"), `${desde} no inventa modalidad`);
}
const enMarco = await pedir("/planes/basico?tipo=HUMANO", { "sec-fetch-dest": "iframe" });
ok(/SameSite=None/i.test(enMarco.headers.get("set-cookie") ?? "") && /Partitioned/i.test(enMarco.headers.get("set-cookie") ?? ""), "dentro de un marco la cookie va con SameSite=None y Partitioned");

const reseller = await pedir("/completar-registro?tipo=reseller&plan=nivel-2");
ok(reseller.status !== 307, `/completar-registro?tipo=reseller no se toca (${reseller.status})`);

const pagina = await pedir("/planes/nivel-3", { cookie: "plan_asistencia=HUMANO" });
const html = await pagina.text();
ok(pagina.status === 200 && html.includes("Estárter") && !html.includes("Nombre viejo"), "/planes/nivel-3 se abre con el nombre vigente");
ok(!/[?&](tipo|a)=(IA|HUMANO)/.test(html), "/planes/nivel-3 no enlaza con la modalidad en la dirección");

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const pag = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
await pag.goto(BASE + "/inicio", { waitUntil: "networkidle" });
await pag.waitForSelector("[data-ver-el-plan]", { timeout: 30000 });
const enlaces = await pag.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
const deLosPlanes = enlaces.filter((h) => /\/planes\/|\/register\?/.test(h));
ok(deLosPlanes.some((h) => h === "/planes/nivel-1") && deLosPlanes.some((h) => h.startsWith("/register?plan=nivel-")), "la landing enlaza por nivel");
ok(!deLosPlanes.some((h) => /[?&](tipo|a)=(IA|HUMANO)/.test(h)), `la landing no pone la modalidad en ningún enlace (${deLosPlanes.length} enlaces)`);
const texto = await pag.textContent("body");
ok(texto.includes("Estárter") && !texto.includes("Nombre viejo"), "la landing vende el nombre vigente");
await navegador.close();
await db.$disconnect();

console.log(fallos ? `\n${fallos} fallo(s)` : "\nla página servida está bien");
process.exit(fallos ? 1 : 0);
