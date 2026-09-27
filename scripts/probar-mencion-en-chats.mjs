/**
 * Mencionar a un compañero en Chats, en Chromium y sobre la página SERVIDA.
 *
 * Con sesión de verdad y dos personas: el jefe, que lleva la cuenta, y Ana,
 * una AGENTE que no tiene la conversación. Lo que solo se ve en la pantalla:
 *
 * 1. Ana no ve la conversación en su lista (no es suya).
 * 2. El jefe escribe «@» mientras le habla al cliente: sale la lista, elegir a
 *    Ana pasa el compositor a NOTA INTERNA, y al enviar queda la nota.
 * 3. La ficha del jefe enseña a Ana en «Por mención», con su equis.
 * 4. Ana abre el aviso: ve la conversación con la franja de invitada, y SIGUE
 *    sin salir en su lista.
 * 5. Se le quita el acceso y el mismo aviso ya no la deja entrar.
 *
 * Hace falta: `BASE`, `DATABASE_URL`, y la semilla de `sembrar-barra.mjs` más
 * Ana (la pone `banco-mencion-navegador.sh`).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE ?? "http://localhost:3932";
const CLAVE = "banco1234";
const JID = "573001112233@s.whatsapp.net";
const LINEA = "BANCO_VENTAS";
const db = new PrismaClient();

const fallos = [];
const exigir = (bien, que) => {
    console.log(`${bien ? "ok  " : "MAL "} ${que}`);
    if (!bien) fallos.push(que);
};

async function entrar(navegador, usuario) {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', usuario);
    await pagina.fill('input[name="password"]', CLAVE);
    await pagina.click('button[type="submit"]');
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
    if (pagina.url().includes("/login")) throw new Error(`no se pudo entrar como ${usuario}`);
    return pagina;
}

/** La «Guía rápida» del copiloto se abre sola y su velo se come los clics. */
async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 8; i += 1) {
        if (!(await pagina.$('div[data-state="open"].fixed.inset-0'))) return;
        const cerrar = pagina.locator('[role="dialog"] button:has-text("Close")').first();
        if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
        else await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(400);
    }
}

/** Cuántas filas de la LISTA tienen este contacto. */
const filasDeLaLista = (pagina) =>
    pagina.evaluate((jid) => document.querySelectorAll(`[data-chat-id*="${jid.split("@")[0]}"]`).length, JID);

const sesion = await db.session.findFirst({ where: { remoteJid: JID }, select: { id: true, assignedAdvisorId: true } });
const ana = await db.user.findUnique({ where: { email: "ana@banco.test" }, select: { id: true } });
await db.$executeRawUnsafe(`DELETE FROM "acceso_por_mencion" WHERE "sessionId" = $1`, sesion.id).catch(() => {});
await db.internalNote.deleteMany({ where: { sessionId: sesion.id } });

const navegador = await chromium.launch();
try {
    // ── 1. Ana, antes de nada ─────────────────────────────────────────
    const deAna = await entrar(navegador, "ana@banco.test");
    await deAna.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
    await deAna.waitForTimeout(6000);
    await apartarLoQueTapa(deAna);
    exigir((await filasDeLaLista(deAna)) === 0, "Ana no ve la conversación en su lista");

    // ── 2. El jefe la menciona desde el compositor ────────────────────
    const delJefe = await entrar(navegador, "jefe@banco.test");
    await delJefe.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${LINEA}`, { waitUntil: "domcontentloaded" });
    const caja = delJefe.locator("[data-barra=\"escribir\"] textarea").first();
    await caja.waitFor({ timeout: 30000 });
    await delJefe.waitForTimeout(2000);
    await apartarLoQueTapa(delJefe);
    // Que el conteo de la lista mide de verdad: al jefe SÍ le sale. Sin esto,
    // «Ana no la ve» pasaría aunque el selector no encontrara ninguna fila.
    exigir((await filasDeLaLista(delJefe)) > 0, "al jefe sí le sale en la lista (el conteo mide)");
    await caja.click();
    await caja.pressSequentially("Ana mira esto @An", { delay: 30 });
    const opcion = delJefe.getByRole("button", { name: /Ana Agente/ }).first();
    await opcion.waitFor({ timeout: 8000 });
    exigir(true, "escribiendo al cliente, la @ ofrece a Ana");
    await opcion.dispatchEvent("mousedown");
    await delJefe.waitForTimeout(400);
    exigir((await caja.inputValue()).includes("@Ana Agente "), "elegirla escribe su nombre");
    exigir(
        (await delJefe.locator('button[title="Desactivar nota interna"]').count()) > 0,
        "elegir a alguien pasa el compositor a nota interna",
    );
    await caja.press("Enter");
    let filas = [];
    for (let i = 0; i < 40 && !filas.length; i += 1) {
        await delJefe.waitForTimeout(250);
        filas = await db.$queryRawUnsafe(`SELECT "personaId" FROM "acceso_por_mencion" WHERE "sessionId" = $1`, sesion.id).catch(() => []);
    }
    exigir(filas.length === 1 && filas[0].personaId === ana.id, "la nota le dio acceso a Ana");
    const nota = await db.internalNote.findFirst({ where: { sessionId: sesion.id } });
    exigir(Boolean(nota) && nota.mentionedUserIds.includes(ana.id), "quedó una NOTA interna, no un mensaje al cliente");
    const aviso = await db.collabNotification.findFirst({ where: { recipientId: ana.id, sessionId: sesion.id, type: "mention" } });
    exigir(Boolean(aviso), "a Ana le llegó el aviso");
    const despues = await db.session.findUnique({ where: { id: sesion.id }, select: { assignedAdvisorId: true } });
    exigir(despues.assignedAdvisorId === sesion.assignedAdvisorId, "la conversación no cambió de dueño");

    // ── 3. La ficha del jefe ──────────────────────────────────────────
    await apartarLoQueTapa(delJefe);
    await delJefe.locator('button[title="Ver ficha del contacto"]:visible').first().click();
    const enLaFicha = delJefe.locator(`[data-accesos-por-mencion] [data-acceso="${ana.id}"]`);
    await enLaFicha.waitFor({ timeout: 15000 }).catch(() => {});
    exigir((await enLaFicha.count()) === 1, "la ficha enseña a Ana en «Por mención»");
    exigir((await enLaFicha.locator('button[aria-label^="Quitar el acceso"]').count()) === 1, "y el jefe tiene con qué quitárselo");

    // ── 4. Ana abre el aviso ──────────────────────────────────────────
    const enlace = `/chats?jid=${encodeURIComponent(JID)}&mencion=${sesion.id}`;
    await deAna.goto(`${BASE}${enlace}`, { waitUntil: "domcontentloaded" });
    const franja = deAna.locator("[data-aviso-de-invitado]");
    await franja.waitFor({ timeout: 30000 }).catch(() => {});
    await apartarLoQueTapa(deAna);
    exigir((await franja.count()) === 1, "Ana entra como invitada, con la franja que lo dice");
    exigir(/Carlos Jefe te mencionó/.test((await franja.textContent()) ?? ""), "la franja nombra a quien la mencionó");
    await deAna.waitForTimeout(3000);
    exigir((await deAna.getByText("Perfecto, gracias").count()) > 0, "y ve los mensajes de la conversación");
    exigir((await filasDeLaLista(deAna)) === 0, "sigue SIN salir en su lista");

    // ── 5. Se le quita, y el aviso ya no la deja entrar ───────────────
    await enLaFicha.hover();
    await enLaFicha.locator('button[aria-label^="Quitar el acceso"]').click();
    await delJefe.waitForTimeout(1500);
    filas = await db.$queryRawUnsafe(`SELECT 1 FROM "acceso_por_mencion" WHERE "sessionId" = $1`, sesion.id);
    exigir(filas.length === 0, "el jefe se lo quitó desde la ficha");
    await deAna.goto(`${BASE}${enlace}`, { waitUntil: "domcontentloaded" });
    const cerrada = deAna.locator("[data-sin-acceso-por-mencion]");
    await cerrada.waitFor({ timeout: 30000 }).catch(() => {});
    exigir((await cerrada.count()) === 1, "el mismo aviso ya no la deja entrar");
    exigir((await deAna.getByText("Perfecto, gracias").count()) === 0, "y no se ven los mensajes");
} finally {
    await navegador.close();
    await db.$disconnect();
}

if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s)`);
    process.exit(1);
}
console.log("\ntodo bien");
