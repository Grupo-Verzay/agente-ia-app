/**
 * Las INTEGRACIONES —las pestañas de Chats, y entre ellas la del Copiloto que
 * pone «Fijar en Chats»— contra POSTGRES, con las acciones de verdad.
 *
 * Lo que se guarda aquí se pinta después como `<iframe>` en cada conversación
 * de Chats y como enlace en Integraciones. Así que una dirección con
 * `javascript:` guardada sería código corriendo en la plataforma, con la
 * sesión de quien abra ese chat. Y el cuerpo de «editar» llega del navegador:
 * pasado tal cual a Prisma, dejaba cambiar de quién es la fila o su orden.
 *
 * `MODO=roto` empaqueta las acciones de `ANTES_REF` —pinchado a un commit,
 * nunca `origin/main`— y AFIRMA los dos fallos: se guardaba `javascript:` y la
 * edición movía la fila a otra cuenta.
 *
 * Se levanta con `scripts/banco-copiloto.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

const ROTO = process.env.MODO === "roto";
const PAQUETE = path.resolve(import.meta.dirname, ".compilado", "integraciones", "entrada-de-las-integraciones.js");
const hayBase = Boolean(process.env.DATABASE_URL) && existsSync(PAQUETE);
const acciones = hayBase ? await import(PAQUETE) : null;

const sello = Date.now().toString(36);
async function sembrarPersona(quien) {
    const id = `integ-${sello}-${quien}`;
    await acciones.db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@banco.test`, name: quien } });
    return id;
}

const PELIGROSAS = [
    "javascript:alert(document.domain)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
];

if (ROTO) {
    test("ANTES se guardaba una integración con javascript:, y editar la movía de cuenta", { skip: !hayBase }, async () => {
        const ana = await sembrarPersona("ana-roto");
        const beto = await sembrarPersona("beto-roto");
        acciones.ponerAQuienMira({ id: ana });
        const r = await acciones.createUserIntegration({ name: "Copiloto", url: "javascript:alert(document.domain)" });
        assert.equal(r.success, true, "ANTES rechazaba javascript: (¿ANTES_REF correcto?)");
        const fila = await acciones.db.userIntegration.findUnique({ where: { id: r.item.id } });
        assert.equal(fila.url, "javascript:alert(document.domain)");
        // Y la edición, con el cuerpo tal cual: se la regala a otra cuenta.
        await acciones.updateUserIntegration(r.item.id, { name: "x", url: "https://a.test", userId: beto, order: 99 });
        const movida = await acciones.db.userIntegration.findUnique({ where: { id: r.item.id } });
        assert.equal(movida.userId, beto, "ANTES la edición no movía la fila");
        assert.equal(movida.order, 99);
    });
} else {
    test("crear rechaza toda dirección que no sea http(s), y dice por qué", { skip: !hayBase }, async () => {
        const ana = await sembrarPersona("ana");
        acciones.ponerAQuienMira({ id: ana });
        for (const url of [...PELIGROSAS, "/copiloto", "", "   "]) {
            const r = await acciones.createUserIntegration({ name: "Copiloto", url });
            assert.equal(r.success, false, `se guardó «${url}»`);
            assert.match(r.error, /http:\/\/ o https:\/\//);
        }
        assert.equal(await acciones.db.userIntegration.count({ where: { userId: ana } }), 0, "quedó alguna guardada");
    });

    test("crear guarda la de verdad, sin espacios y con el nombre recortado", { skip: !hayBase }, async () => {
        const ana = await sembrarPersona("ana2");
        acciones.ponerAQuienMira({ id: ana });
        const r = await acciones.createUserIntegration({ name: "  Copiloto  ", url: "  https://copiloto.ia-app.com  " });
        assert.equal(r.success, true);
        assert.equal(r.item.url, "https://copiloto.ia-app.com");
        assert.equal(r.item.name, "Copiloto");
        const sinNombre = await acciones.createUserIntegration({ name: "   ", url: "https://a.test" });
        assert.equal(sinNombre.success, false);
        assert.equal(sinNombre.error, "Falta el nombre.");
        const largo = await acciones.createUserIntegration({ name: "x".repeat(200), url: "https://a.test" });
        assert.equal(largo.item.name.length, 60, "un nombre de pestaña es un rótulo, no un texto");
    });

    test("editar solo toca el nombre y la dirección: ni la cuenta ni el orden", { skip: !hayBase }, async () => {
        const ana = await sembrarPersona("ana3");
        const beto = await sembrarPersona("beto3");
        acciones.ponerAQuienMira({ id: ana });
        const r = await acciones.createUserIntegration({ name: "Copiloto", url: "https://copiloto.ia-app.com" });
        const ok = await acciones.updateUserIntegration(r.item.id, { name: "Mi copiloto", userId: beto, order: 99 });
        assert.equal(ok.success, true);
        const fila = await acciones.db.userIntegration.findUnique({ where: { id: r.item.id } });
        assert.equal(fila.userId, ana, "la edición movió la fila a otra cuenta");
        assert.equal(fila.order, 0, "la edición cambió el orden");
        assert.equal(fila.name, "Mi copiloto");
        assert.equal(fila.url, "https://copiloto.ia-app.com", "sin dirección en el cuerpo, la dirección no se toca");
        for (const url of PELIGROSAS) {
            const mal = await acciones.updateUserIntegration(r.item.id, { url });
            assert.equal(mal.success, false, `la edición guardó «${url}»`);
        }
        assert.equal((await acciones.db.userIntegration.findUnique({ where: { id: r.item.id } })).url, "https://copiloto.ia-app.com");
    });

    test("sin sesión no se crea nada", { skip: !hayBase }, async () => {
        acciones.ponerAQuienMira(null);
        const r = await acciones.createUserIntegration({ name: "Copiloto", url: "https://a.test" });
        assert.equal(r.success, false);
        assert.equal(r.error, "No autenticado");
    });
}

test.after(async () => {
    if (acciones) await acciones.db.$disconnect();
});
