/**
 * La ACCIÓN de verdad contra Postgres: `generarCopyDelAnuncio`.
 *
 * Probar las funciones puras a solas sería probar el lado que no tiene puerta.
 * Lo que aquí se demuestra es lo que solo se ve con la base delante:
 *
 *  - la acción usa **la misma clave de Gemini que esa pantalla ya guarda**
 *    (`userAiConfig` del proveedor `google`), no una variable de entorno ni una
 *    segunda credencial;
 *  - la imagen ya creada viaja DENTRO de la petición, así que el texto habla de
 *    lo que se ve y no de lo que se pidió;
 *  - el texto vuelve pasado por las reglas de su red;
 *  - y un fallo vuelve con su MOTIVO en vez de lanzar, que es lo que impide que
 *    el texto tumbe la tanda de imágenes que lo disparó.
 *
 * Lo único que se finge son `currentUser()` y el paquete `@google/genai`: la
 * acción, la lectura de la clave y las consultas son las de producción.
 *
 * `MODO=roto` se salta este fichero y lo dice: en el «antes» no existía ninguna
 * acción de copy que afirmar. Lo que el modo roto sí ejerce es el barrido del
 * otro fichero.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";

const m = await import("./.compilado/copy/entrada-del-copy.js");
const {
    ponerAQuienMira,
    ponerLoQueDiceGemini,
    loQueSeLePidioAGemini,
    generarCopyDelAnuncio,
    saveUserGoogleApiKey,
    db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `copy-cuenta-${V}`;
const SIN_CLAVE = `copy-sin-clave-${V}`;
const CLAVE = `AIza-copy-${V}`;

/** Un PNG de un píxel: lo que el generador de imágenes devuelve, en pequeño. */
const IMAGEN =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function quien(id) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
    };
}

test.before(async () => {
    if (ROTO) return;
    await db.aiProvider.upsert({
        where: { name: "google" },
        update: {},
        create: { name: "google", aiModel: "gemini-2.0-flash" },
    });
    for (const id of [CUENTA, SIN_CLAVE]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: "user" } });
    }
    // Se guarda con la MISMA acción con la que la guarda el diálogo de la
    // pantalla: si el copy leyera de otro sitio, esto no la encontraría.
    ponerAQuienMira(quien(CUENTA));
    const guardado = await saveUserGoogleApiKey(CLAVE);
    assert.equal(guardado.success, true, guardado.message);
});

test.after(async () => {
    if (ROTO) return;
    await db.userAiConfig.deleteMany({ where: { userId: { in: [CUENTA, SIN_CLAVE] } } });
    await db.user.deleteMany({ where: { id: { in: [CUENTA, SIN_CLAVE] } } });
    await db.$disconnect();
});

test("el «antes» no tenía esta acción: no hay nada que afirmar aquí", { skip: !ROTO }, () => {
    assert.ok(true);
});

test("usa la clave que esa pantalla guardó, y le manda la imagen", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    ponerLoQueDiceGemini("Llévate el tuyo hoy 🔥\nEscríbenos por WhatsApp.\n#Ofertas #Envios");

    const r = await generarCopyDelAnuncio(IMAGEN, "1:1", "1. Hero Section — Impacto.", "Premium", "Envío gratis", "Mármol");
    assert.equal(r.ok, true, r.motivo);
    assert.equal(r.red, "instagram");

    const [llamada] = loQueSeLePidioAGemini();
    assert.equal(llamada.clave, CLAVE, "no usó la clave guardada en la pantalla");
    assert.equal(llamada.conImagen, true, "el copy se pidió sin la imagen ya creada");
    assert.equal(llamada.modelo.includes("image"), false, "pidió el texto a un generador de imagen");
    assert.ok(llamada.prompt.includes("Post Instagram"));
    assert.ok(llamada.prompt.includes("Envío gratis"), "no viajó lo que escribió el anunciante");
});

test("el texto vuelve adaptado a la red que se ve en la previa", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const conHashtags = "Llévatelo hoy.\nEscríbenos.\n#Ofertas #Envios #Colombia";

    ponerLoQueDiceGemini(conHashtags);
    const insta = await generarCopyDelAnuncio(IMAGEN, "1:1");
    assert.ok(insta.copy.includes("#Ofertas"), "Instagram perdió sus hashtags");

    // La MISMA respuesta del modelo, en una historia de WhatsApp, vuelve sin
    // etiquetas: ahí son texto muerto, y pedirlo en el prompt no basta.
    ponerLoQueDiceGemini(conHashtags);
    const wa = await generarCopyDelAnuncio(IMAGEN, "9:16");
    assert.equal(wa.red, "whatsapp");
    assert.equal(wa.copy.includes("#"), false, wa.copy);
    assert.ok(wa.copy.includes("Escríbenos."));

    ponerLoQueDiceGemini(conHashtags);
    const fb = await generarCopyDelAnuncio(IMAGEN, "16:9");
    assert.equal(fb.red, "facebook");
});

test("un texto larguísimo vuelve recortado y sin partir palabras", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    ponerLoQueDiceGemini("palabra ".repeat(300).trim());
    const r = await generarCopyDelAnuncio(IMAGEN, "9:16");
    assert.equal(r.ok, true);
    assert.ok(r.copy.length <= 320, r.copy.length);
    assert.ok(r.copy.endsWith("palabra"));
});

test("sin clave configurada: motivo legible, y NO lanza", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(SIN_CLAVE));
    ponerLoQueDiceGemini("no debería llegar aquí");
    const r = await generarCopyDelAnuncio(IMAGEN, "1:1");
    assert.equal(r.ok, false);
    assert.match(r.motivo, /API key de Google/i);
    assert.equal(loQueSeLePidioAGemini().length, 0, "llamó a Google sin clave");
});

test("sin sesión no se genera nada", { skip: ROTO }, async () => {
    ponerAQuienMira(null);
    ponerLoQueDiceGemini("no debería llegar aquí");
    const r = await generarCopyDelAnuncio(IMAGEN, "1:1");
    assert.equal(r.ok, false);
    assert.equal(loQueSeLePidioAGemini().length, 0);
});

test("Google rechaza la clave: se dice cuál es, y la tanda no se cae", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    ponerLoQueDiceGemini(new Error("PERMISSION_DENIED: API key not valid"));
    const r = await generarCopyDelAnuncio(IMAGEN, "1:1");
    assert.equal(r.ok, false);
    assert.match(r.motivo, /rechazó la API key/i);
});

test("una respuesta vacía no se da por buena", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    ponerLoQueDiceGemini("   ");
    const r = await generarCopyDelAnuncio(IMAGEN, "1:1");
    assert.equal(r.ok, false);
    assert.match(r.motivo, /no devolvió/i);
});

test("sin imagen se pide igual, pero solo con el texto", { skip: ROTO }, async () => {
    // El botón de volver a generar solo sale con una vista delante, así que
    // esto no debería darse; lo que no puede pasar es que reviente.
    ponerAQuienMira(quien(CUENTA));
    ponerLoQueDiceGemini("Texto sin imagen.");
    const r = await generarCopyDelAnuncio("", "1:1");
    assert.equal(r.ok, true);
    assert.equal(loQueSeLePidioAGemini()[0].conImagen, false);
});
