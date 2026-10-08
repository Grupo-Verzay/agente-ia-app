/**
 * PROPUESTA DESDE EL CHAT: el icono del panel lateral de una conversación abre
 * «Nueva propuesta» y «Enviar por WhatsApp» la crea en la cuenta DUEÑA de la
 * línea y la manda a ESE contacto por ESA línea.
 *
 * 1. Un barrido: el icono va en las dos filas de la cabecera, el formulario
 *    se pinta en modo panel y el pie lleva el botón ancho.
 * 2. Las acciones contra Postgres con el despachador fingido: el dueño crea y
 *    envía; otra cuenta y un agente no; una línea que no existe no; un `@lid`
 *    se manda a su jid.
 *
 * `MODO=roto` lee `ANTES_REF` (70273b0) y afirma que nada de esto existía.
 * Se levanta con `scripts/banco-propuesta-desde-el-chat.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "propuestas");
const ANTES_REF = process.env.ANTES_REF ?? "70273b0";

const HEADER = "app/(root)/chats/_components/ChatHeader.tsx";
const PANEL = "app/(root)/chats/_components/ChatPropuestaPanel.tsx";
const ACCIONES = "actions/propuestas-actions.ts";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ });
    } catch {
        return null;
    }
};

if (ROTO) {
    test("ANTES: el panel de la propuesta no existía", () => {
        assert.equal(deAntes(PANEL), null);
        const h = deAntes(HEADER);
        assert.ok(h, "no se pudo leer la cabecera de ANTES_REF");
        assert.doesNotMatch(h, /ChatPropuestaPanel/);
    });
    test("ANTES: no había acciones para crear y enviar desde el chat", () => {
        const a = deAntes(ACCIONES);
        assert.ok(a);
        assert.doesNotMatch(a, /crearYEnviarPropuestaDesdeElChatAction/);
        assert.doesNotMatch(a, /propuestaDesdeElChatAction/);
    });
} else {
    test("barrido: el icono va en las dos filas de la cabecera", () => {
        const h = crudo(HEADER);
        assert.equal((h.match(/<ChatPropuestaPanel\b/g) ?? []).length, 2);
        assert.match(h, /destino=\{destinoDeLaLlamada/);
    });
    test("barrido: el panel usa el formulario en modo panel y el botón ancho", () => {
        const p = crudo(PANEL);
        assert.match(p, /PANEL_DE_LA_PROPUESTA/);
        assert.match(p, /marco="panel"/);
        assert.match(p, /Enviar por WhatsApp/);
        assert.match(p, /w-full/);
        assert.match(p, /crearYEnviarPropuestaDesdeElChatAction/);
        assert.match(crudo("lib/panel-lateral.ts"), /PANEL_DE_LA_PROPUESTA/);
    });

    const hayBase = Boolean(process.env.DATABASE_URL);
    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-propuestas.js"));
    const conBase = hayBase ? test : test.skip;

    const sello = Date.now().toString(36);
    const A = `chat-a-${sello}`;
    const B = `chat-b-${sello}`;
    const AGENTE = `chat-ag-${sello}`;
    const LINEA_A = `LA_${sello}`;
    const DUENO_A = { id: A, sessionUserId: A, role: "user", ownerId: null, name: "Cuenta A" };
    const DUENO_B = { id: B, sessionUserId: B, role: "user", ownerId: null, name: "Cuenta B" };
    const AGENTE_A = { id: AGENTE, sessionUserId: AGENTE, role: "user", ownerId: A, advisorRole: "agente", name: "Ag" };
    const BASE = {
        cliente: "Clínica Dental Sonrisa",
        fecha: "2026-09-28",
        moneda: "cop",
        servicios: [{ nombre: "Agente IA", alcance: "Configuración", inversion: "1.500.000" }],
        condiciones: "50% anticipo",
    };

    conBase("siembra", async () => {
        for (const [id, extra] of [[A, {}], [B, {}], [AGENTE, { ownerId: A, advisorRole: "agente" }]]) {
            await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ...extra } });
        }
        await m.db.instancia.create({
            data: { instanceName: LINEA_A, instanceId: `iid-${LINEA_A}`, userId: A, instanceType: "Whatsapp", metaChannel: null },
        });
        m.ponerLineasConectadas({ [A]: [LINEA_A] });
    });

    conBase("el dueño abre el formulario con la línea y la cuenta de la conversación", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.propuestaDesdeElChatAction(LINEA_A);
        assert.equal(r.success, true, r.message);
        assert.equal(r.data.linea, LINEA_A);
        assert.equal(r.data.cuenta, A);
    });

    conBase("«Enviar por WhatsApp» la crea en la cuenta y la manda a ese contacto por esa línea", async () => {
        m.ponerAQuienMira(DUENO_A);
        m.enviados.length = 0;
        const r = await m.crearYEnviarPropuestaDesdeElChatAction(LINEA_A, "573001234567@s.whatsapp.net", {
            ...BASE,
            whatsapp: "999",
            linea: "OTRA",
        });
        assert.equal(r.success, true, r.message);
        const fila = await m.db.$queryRawUnsafe(
            `SELECT "cuentaId", "whatsapp", "linea" FROM "propuestas_comerciales" WHERE "id" = $1`,
            r.data.propuesta.id,
        );
        assert.equal(fila[0].cuentaId, A);
        assert.equal(fila[0].whatsapp, "573001234567");
        assert.equal(fila[0].linea, LINEA_A);
        assert.equal(m.enviados.length, 1);
        const e = m.enviados[0];
        assert.equal(e.linea, LINEA_A);
        assert.equal(e.cuenta, A);
        assert.match(e.remoteJid, /^573001234567/);
        assert.ok(e.text.includes(`/propuesta/${r.data.propuesta.token}`), e.text);
    });

    conBase("un contacto sin número (@lid) se envía a su jid", async () => {
        m.ponerAQuienMira(DUENO_A);
        m.enviados.length = 0;
        const r = await m.crearYEnviarPropuestaDesdeElChatAction(LINEA_A, "96366802022553@lid", BASE);
        assert.equal(r.success, true, r.message);
        assert.equal(m.enviados[0].remoteJid, "96366802022553@lid");
    });

    conBase("otra cuenta, un agente o una línea inexistente no envían nada", async () => {
        for (const quien of [DUENO_B, AGENTE_A]) {
            m.ponerAQuienMira(quien);
            m.enviados.length = 0;
            const r = await m.crearYEnviarPropuestaDesdeElChatAction(LINEA_A, "573001234567@s.whatsapp.net", BASE);
            assert.equal(r.success, false);
            assert.equal(m.enviados.length, 0);
            assert.equal((await m.propuestaDesdeElChatAction(LINEA_A)).success, false);
        }
        m.ponerAQuienMira(DUENO_A);
        const r = await m.crearYEnviarPropuestaDesdeElChatAction(`NO_${sello}`, "573001234567@s.whatsapp.net", BASE);
        assert.equal(r.success, false);
        const sin = await m.crearYEnviarPropuestaDesdeElChatAction(LINEA_A, "", BASE);
        assert.equal(sin.success, false);
        assert.equal(m.enviados.length, 0);
    });
}
