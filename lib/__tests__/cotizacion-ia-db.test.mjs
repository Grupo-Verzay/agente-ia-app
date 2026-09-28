/**
 * Cotizaciones de la IA contra POSTGRES, por la ruta y las acciones de verdad.
 *
 * Lo que solo se ve aquí:
 *
 * - que la ruta que llama el backend pide la clave interna y, con la función
 *   APAGADA (como nace toda cuenta), no genera nada;
 * - que encendida arma el PDF con los precios del catálogo de ESA cuenta —no de
 *   otra, no del modelo—, lo sube y lo deja apuntado en el módulo de
 *   Cotizaciones con estado `enviada`;
 * - que lo que no está en el catálogo, o un descuento, NO genera cotización
 *   (ni fila, ni PDF): contesta `escalar`;
 * - que los ajustes los guarda quien alcanza la cuenta y nadie más.
 *
 * Se finge `currentUser()` y el bucket; lo demás es el código de producción.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    POST,
    guardarAjustesDeCotizacionAction,
    leerAjustesDeCotizacionAction,
    leerAjustesDeCotizacion,
    ponerAQuienMira,
    subidos,
    db,
} from "./.compilado/cotizacion-ia-db/entrada-de-cotizacion-ia.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const require = createRequire(import.meta.url);
const pdfjs = require(join(RAIZ, "node_modules/pdfjs-dist/legacy/build/pdf.js"));

const SELLO = Date.now().toString(36);
const CUENTA = `cot-cuenta-${SELLO}`;
const AJENA = `cot-ajena-${SELLO}`;
const JID = "573001112233@s.whatsapp.net";

async function crearCuenta(id, nombre) {
    await db.user.create({ data: { id, email: `${id}@banco.co`, name: nombre, brandName: nombre, role: "user", preferredCurrencyCode: "COP" } });
}

async function pedir(cuerpo, clave = "banco") {
    const headers = { "content-type": "application/json" };
    if (clave) headers["x-internal-secret"] = clave;
    const res = await POST(new Request("http://localhost/api/cotizacion-ia", { method: "POST", headers, body: JSON.stringify(cuerpo) }));
    return { status: res.status, body: await res.json() };
}

async function leerPdf(bytes) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, standardFontDataUrl: join(RAIZ, "node_modules/pdfjs-dist/standard_fonts") + "/" }).promise;
    let t = "";
    for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join("\n");
    return t;
}

test.before(async () => {
    await crearCuenta(CUENTA, "Tienda Banco");
    await crearCuenta(AJENA, "Otra Tienda");
    await db.product.createMany({
        data: [
            { userId: CUENTA, title: "Camisa azul", sku: `CAM-${SELLO}`, price: 45000, category: "Ropa", images: [], tags: [] },
            { userId: CUENTA, title: "Instalación a domicilio", price: 30000, category: "Servicios", images: [], tags: [] },
            { userId: CUENTA, title: "Producto apagado", price: 1, category: "Ropa", images: [], tags: [], isActive: false },
            // El mismo nombre en OTRA cuenta, con otro precio: no puede colarse.
            { userId: AJENA, title: "Zapatos de cuero", price: 999, category: "Ropa", images: [], tags: [] },
        ],
    });
    await db.agentPrompt.create({
        data: {
            userId: CUENTA,
            agentId: "system-prompt-ai",
            sections: { business: { nombre: "Tienda Banco SAS", telefono: "6015551234", ubicacion: "Calle 1 # 2-3" } },
            promptText: "",
        },
    });
    await db.session.create({ data: { userId: CUENTA, remoteJid: JID, pushName: "Marta", instanceId: `inst-${SELLO}`, status: true } });
});

test("sin la clave interna no se genera nada (401)", async () => {
    const r = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "Camisa azul", cantidad: 1 }] }, null);
    assert.equal(r.status, 401);
    const r2 = await pedir({ userId: CUENTA, remoteJid: JID, items: [] }, "otra-clave");
    assert.equal(r2.status, 401);
});

test("una cuenta nueva la tiene APAGADA, y apagada no genera nada", async () => {
    assert.deepEqual(await leerAjustesDeCotizacion(CUENTA), { activa: false, instrucciones: "" });
    const antes = await db.cotizacion.count({ where: { userId: CUENTA } });
    const r = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "Camisa azul", cantidad: 1 }] });
    assert.equal(r.body.estado, "apagada");
    assert.equal(await db.cotizacion.count({ where: { userId: CUENTA } }), antes);
});

test("los ajustes los guarda quien alcanza la cuenta, y nadie más", async () => {
    ponerAQuienMira({ id: AJENA, role: "user", ownerId: null });
    const fuera = await guardarAjustesDeCotizacionAction(CUENTA, { activa: true, instrucciones: "hackeado" });
    assert.equal(fuera.success, false);
    assert.equal((await leerAjustesDeCotizacion(CUENTA)).activa, false);
    assert.equal((await leerAjustesDeCotizacionAction(CUENTA)).success, false);

    ponerAQuienMira({ id: CUENTA, role: "user", ownerId: null });
    const ok = await guardarAjustesDeCotizacionAction(CUENTA, {
        activa: true,
        instrucciones: "  Validez de 15 días.\nPago 50% anticipo.  ",
    });
    assert.equal(ok.success, true);
    assert.deepEqual((await leerAjustesDeCotizacionAction(CUENTA)).data, {
        activa: true,
        instrucciones: "Validez de 15 días.\nPago 50% anticipo.",
    });
});

test("encendida: el PDF sale con los precios del catálogo, se sube y queda en Cotizaciones", async () => {
    subidos.length = 0;
    const r = await pedir({
        userId: CUENTA,
        remoteJid: JID,
        items: [{ producto: "camisas azules", cantidad: 3 }, { producto: "Instalacion a domicilio", cantidad: 1 }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, "lista", JSON.stringify(r.body));
    assert.equal(r.body.total, 165000);
    assert.equal(r.body.totalLegible, "$ 165.000 COP");
    assert.match(r.body.url, new RegExp(`^http://localhost/verzay-media/cotizaciones/${CUENTA}/.+/Cotizacion-COT-\\d{8}-[A-Z0-9]+\\.pdf$`));

    assert.equal(subidos.length, 1);
    assert.equal(subidos[0].tipo, "application/pdf");
    const texto = await leerPdf(subidos[0].bytes);
    for (const esperado of ["Tienda Banco SAS", "Calle 1 # 2-3", "Tel: 6015551234", "Marta", "Camisa azul", "$ 135.000", "Instalación a domicilio", "$ 165.000 COP", "Validez de 15 días.", "Pago 50% anticipo."]) {
        assert.ok(texto.includes(esperado), `falta «${esperado}» en el PDF`);
    }

    const fila = await db.cotizacion.findUnique({ where: { id: r.body.cotizacionId }, include: { items: true } });
    assert.equal(fila.userId, CUENTA);
    assert.equal(fila.status, "enviada");
    assert.equal(fila.clientName, "Marta");
    assert.equal(fila.clientPhone, "573001112233");
    assert.equal(Number(fila.total), 165000);
    assert.deepEqual(fila.items.map((i) => [i.title, i.quantity, Number(i.unitPrice)]).sort(), [
        ["Camisa azul", 3, 45000],
        ["Instalación a domicilio", 1, 30000],
    ]);
    assert.ok(fila.items.every((i) => i.productId), "cada línea tiene que apuntar a su producto del catálogo");
});

test("lo que NO está en SU catálogo escala: sin fila y sin PDF (el de otra cuenta no cuenta)", async () => {
    subidos.length = 0;
    const antes = await db.cotizacion.count({ where: { userId: CUENTA } });
    const r = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "Camisa azul", cantidad: 1 }, { producto: "Zapatos de cuero", cantidad: 1 }] });
    assert.equal(r.body.estado, "escalar");
    assert.deepEqual(r.body.faltan, ["Zapatos de cuero"]);
    const inactivo = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "Producto apagado", cantidad: 1 }] });
    assert.equal(inactivo.body.estado, "escalar", "un producto inactivo no se cotiza");
    assert.equal(await db.cotizacion.count({ where: { userId: CUENTA } }), antes);
    assert.equal(subidos.length, 0);
});

test("un descuento pedido escala aunque el producto exista", async () => {
    subidos.length = 0;
    const r = await pedir({
        userId: CUENTA,
        remoteJid: JID,
        items: [{ producto: "Camisa azul", cantidad: 50 }],
        pideCondicionesEspeciales: true,
        detalleCondiciones: "quiere 15% de descuento por volumen",
    });
    assert.equal(r.body.estado, "escalar");
    assert.match(r.body.motivo, /condiciones especiales/);
    assert.equal(subidos.length, 0);
});

test("lo ambiguo se pregunta y no genera nada", async () => {
    await db.product.create({ data: { userId: CUENTA, title: "Camisa roja", price: 47000, category: "Ropa", images: [], tags: [] } });
    const r = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "camisa", cantidad: 1 }] });
    assert.equal(r.body.estado, "aclarar");
    assert.deepEqual(r.body.opciones[0].candidatos.sort(), ["Camisa azul", "Camisa roja"]);
});

test("apagarla vuelve a no generar nada", async () => {
    ponerAQuienMira({ id: CUENTA, role: "user", ownerId: null });
    await guardarAjustesDeCotizacionAction(CUENTA, { activa: false, instrucciones: "Validez de 15 días." });
    const r = await pedir({ userId: CUENTA, remoteJid: JID, items: [{ producto: "Camisa azul", cantidad: 1 }] });
    assert.equal(r.body.estado, "apagada");
    // El texto se conserva al apagar: volver a encender no obliga a reescribirlo.
    assert.equal((await leerAjustesDeCotizacion(CUENTA)).instrucciones, "Validez de 15 días.");
});
