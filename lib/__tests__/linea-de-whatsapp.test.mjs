/**
 * El banco de **la línea de WhatsApp por QR**, contra Postgres de verdad y
 * ejerciendo **las acciones**, no la consulta.
 *
 * Es lo que hay que demostrar, porque el fallo reportado no era de la consulta:
 * era que el diálogo «Asistente de voz IA» de Perfil → Conexión contestaba
 * «No tienes una cuenta de WhatsApp vinculada» con la línea de esa misma cuenta
 * en pantalla diciendo Conectado. Probar `laLineaDeWhatsappDeLaCuenta` a secas
 * sería probar el lado que ya se acaba de escribir; lo que importa es que las
 * acciones pasen por ella.
 *
 * Corre en **dos modos**, y el roto lleva dentro la consulta VIEJA tal cual
 * estaba en el repo:
 *
 * ```ts
 * db.instancia.findFirst({ where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp'] } } })
 * ```
 *
 * Sin ese modo no se sabría si se arregló la causa o algo que se le parece: se
 * afirma que con ella la línea de `waha` **no aparece** y la de tipo nulo
 * tampoco, que es exactamente lo que le pasa hoy a 10 de las 31 cuentas con
 * línea por QR en producción.
 *
 * Los tres puntos de vista que pedía el encargo:
 *
 * | quién | qué tiene que pasar |
 * | --- | --- |
 * | cuenta **con** sesión conectada (Evolution, Waha o sin tipo) | guarda, y sobre SU fila |
 * | cuenta **sin** línea | el aviso dice qué falta, no un genérico |
 * | cuenta **hija** de una familia | escribe sobre su propia línea, no sobre la de la madre |
 *
 * Cómo se corre: `scripts/banco-llamadas.sh` (Postgres de usar y tirar).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    db,
    esLineaDeWhatsappQr,
    getVoicebotConfig,
    laLineaDeWhatsappDeLaCuenta,
    ponerAQuienMira,
    porQueNoHayLineaQr,
    setCallContactNameAction,
    setCallLeadStatusAction,
    setVoicebotConfig,
} from "./.compilado/llamadas/entrada-de-llamadas.js";

/* ─────────────────────────────── La semilla ─────────────────────────────── */

// Los ids llevan el sello de la vuelta: la base se reutiliza entre ejecuciones
// y un id fijo haría que la segunda encontrara también lo de la primera.
const V = `v${Date.now().toString(36)}`;
const ID = (nombre) => `${V}-${nombre}`;

const EVOLUTION = ID("evolution"); // línea guardada como 'Whatsapp'
const WAHA = ID("waha"); //           línea guardada como 'waha'  ← el caso reportado
const ANTIGUA = ID("antigua"); //     línea guardada SIN tipo
const SIN_LINEA = ID("sin-linea"); // ninguna instancia
const SOLO_META = ID("solo-meta"); // un canal de Meta y nada más
const MADRE = ID("madre");
const HIJA = ID("hija"); //           cuenta hija, con su propia línea de waha
const YAIR = ID("yair"); //           administrador del equipo de la HIJA

/** Las filas de `currentUser()` tal y como llegan en producción. */
const COMO = {
    evolution: { id: EVOLUTION, effectiveId: EVOLUTION, ownerId: null, role: "user" },
    waha: { id: WAHA, effectiveId: WAHA, ownerId: null, role: "user" },
    antigua: { id: ANTIGUA, effectiveId: ANTIGUA, ownerId: null, role: "user" },
    sinLinea: { id: SIN_LINEA, effectiveId: SIN_LINEA, ownerId: null, role: "user" },
    soloMeta: { id: SOLO_META, effectiveId: SOLO_META, ownerId: null, role: "user" },
    madre: { id: MADRE, effectiveId: MADRE, ownerId: null, role: "user" },
    hija: { id: HIJA, effectiveId: HIJA, ownerId: null, role: "user" },
    // Yair entra con SU id y cuelga de la cuenta hija: `effectiveId` es la
    // cuenta, que es lo que la tarjeta de llamadas de esa misma pantalla usa.
    yair: {
        id: YAIR,
        effectiveId: HIJA,
        ownerId: HIJA,
        sessionUserId: YAIR,
        advisorRole: "administrador",
        role: "user",
    },
};

const CUENTAS = [
    [EVOLUTION, null],
    [WAHA, null],
    [ANTIGUA, null],
    [SIN_LINEA, null],
    [SOLO_META, null],
    [MADRE, null],
    [HIJA, null],
    [YAIR, HIJA],
];

/** `instanceId` es NOT NULL: cada línea necesita el suyo. */
const LINEAS = [
    [EVOLUTION, `${V}_EVO`, "Whatsapp"],
    [WAHA, `${V}_WAHA`, "waha"],
    [ANTIGUA, `${V}_VIEJA`, null],
    [SOLO_META, `${V}_META`, "meta"],
    [MADRE, `${V}_MADRE`, "Whatsapp"],
    [HIJA, `${V}_HIJA`, "waha"],
];

async function sembrar() {
    for (const [id, owner] of CUENTAS) {
        await db.$executeRawUnsafe(
            // `updatedAt` es `@updatedAt`: Prisma lo rellena y la columna NO
            // tiene default en la base, así que un INSERT en crudo tiene que
            // ponerlo a mano o Postgres lo rechaza con 23502.
            `INSERT INTO "User" ("id","email","name","role","owner_id","updatedAt")
             VALUES ($1,$2,$3,'user',$4,NOW())
             ON CONFLICT ("id") DO NOTHING`,
            id,
            `${id}@banco.test`,
            id,
            owner,
        );
    }
    for (const [userId, nombre, tipo] of LINEAS) {
        await db.$executeRawUnsafe(
            `INSERT INTO "Instancias" ("instanceName","userId","instanceId","instanceType")
             VALUES ($1,$2,$3,$4)`,
            nombre,
            userId,
            `${nombre}-id`,
            tipo,
        );
    }
}

/** La consulta VIEJA, tal cual estaba en `actions/voicebot-actions.ts`. */
function laConsultaVieja(userId) {
    return db.instancia.findFirst({
        where: { userId, instanceType: { in: ["Whatsapp", "whatsapp"] } },
        orderBy: { id: "asc" },
        select: { id: true },
    });
}

const laFilaDe = (userId) =>
    db.instancia.findFirst({ where: { userId }, orderBy: { id: "asc" } });

await sembrar();

/* ───────────────────────── 1. La regla pura ──────────────────────────────── */

test("las TRES formas de la línea por QR son la misma cosa", () => {
    for (const tipo of ["Whatsapp", "whatsapp", "WHATSAPP", "waha", "Waha", "evolution", null, "", "  "]) {
        assert.equal(esLineaDeWhatsappQr(tipo), true, `${tipo} debería contar como línea por QR`);
    }
});

test("un canal que no es un número por QR no cuenta", () => {
    for (const tipo of ["meta", "Meta", "telegram", "Facebook", "Instagram"]) {
        assert.equal(esLineaDeWhatsappQr(tipo), false, `${tipo} no es una línea por QR`);
    }
});

test("el aviso NOMBRA lo que falta, y no es el genérico de antes", () => {
    const sinNada = porQueNoHayLineaQr([]);
    assert.match(sinNada, /Mensajería WhatsApp \(QR\)/);
    assert.doesNotMatch(sinNada, /No tienes una cuenta de WhatsApp vinculada/);

    const conMeta = porQueNoHayLineaQr(["meta"]);
    assert.match(conMeta, /Meta/, "tiene que decir qué canal SÍ tiene");
    assert.match(conMeta, /Mensajería WhatsApp \(QR\)/);
    assert.notEqual(conMeta, sinNada, "«no tienes nada» y «tienes otra cosa» son dos avisos");
});

/* ──────────── 2. El MODO ROTO: la consulta vieja no ve la línea ──────────── */

test("MODO ROTO: la consulta vieja no encuentra la línea de waha ni la antigua", async () => {
    assert.notEqual(await laConsultaVieja(EVOLUTION), null, "la de Evolution sí la veía");
    assert.equal(await laConsultaVieja(WAHA), null, "← el fallo reportado");
    assert.equal(await laConsultaVieja(ANTIGUA), null, "y las líneas sin tipo tampoco");
    assert.equal(await laConsultaVieja(HIJA), null);
});

test("AHORA: las tres formas se encuentran, y un canal de Meta no se confunde", async () => {
    for (const cuenta of [EVOLUTION, WAHA, ANTIGUA, HIJA]) {
        const { linea } = await laLineaDeWhatsappDeLaCuenta(cuenta);
        assert.notEqual(linea, null, `${cuenta} tiene línea por QR`);
    }
    const meta = await laLineaDeWhatsappDeLaCuenta(SOLO_META);
    assert.equal(meta.linea, null, "un canal de Meta no es una línea por QR");
    assert.equal(meta.todas.length, 1, "pero sí se devuelve, para poder nombrarlo");

    const ninguna = await laLineaDeWhatsappDeLaCuenta(SIN_LINEA);
    assert.equal(ninguna.linea, null);
    assert.equal(ninguna.todas.length, 0);
});

/* ─────────── 3. Cuenta CON sesión: el voicebot guarda y relee ────────────── */

for (const [nombre, cuenta] of [
    ["Evolution", EVOLUTION],
    ["WhatsApp Mensajería (waha)", WAHA],
    ["una línea antigua sin tipo", ANTIGUA],
]) {
    test(`con ${nombre}, el voicebot guarda y lo vuelve a leer`, async () => {
        ponerAQuienMira(COMO[cuenta === EVOLUTION ? "evolution" : cuenta === WAHA ? "waha" : "antigua"]);

        const guardado = await setVoicebotConfig({
            enabled: true,
            voice: "shimmer",
            transferTo: "+57 300 123 4567",
        });
        assert.equal(guardado.success, true, guardado.message);

        const leido = await getVoicebotConfig();
        assert.equal(leido.success, true);
        assert.deepEqual(
            { enabled: leido.data.enabled, voice: leido.data.voice, transferTo: leido.data.transferTo },
            { enabled: true, voice: "shimmer", transferTo: "573001234567" },
            "el número se guarda en dígitos",
        );

        // Y se escribió en SU fila, no en la de nadie más.
        const fila = await laFilaDe(cuenta);
        assert.equal(fila.voicebotVoice, "shimmer");
        assert.equal(fila.voicebotTransferTo, "573001234567");
    });
}

/* ────────────── 4. Cuenta SIN línea: el aviso dice qué falta ─────────────── */

test("sin ninguna línea, el aviso dice que hay que conectarla", async () => {
    ponerAQuienMira(COMO.sinLinea);
    const r = await setVoicebotConfig({ voice: "alloy", transferTo: "573001112233" });
    assert.equal(r.success, false);
    assert.match(r.message, /no tiene ninguna línea de WhatsApp conectada/);
    assert.match(r.message, /Mensajería WhatsApp \(QR\)/);
    assert.doesNotMatch(r.message, /No tienes una cuenta de WhatsApp vinculada/);
});

test("con solo un canal de Meta, el aviso lo NOMBRA", async () => {
    ponerAQuienMira(COMO.soloMeta);
    const r = await setVoicebotConfig({ voice: "alloy" });
    assert.equal(r.success, false);
    assert.match(r.message, /Meta/);
    assert.match(r.message, /por QR/);

    // Y leer no revienta: devuelve los valores por defecto, como siempre.
    const leido = await getVoicebotConfig();
    assert.equal(leido.success, true);
    assert.equal(leido.data.enabled, false);
});

/* ─────────────── 5. Cuenta HIJA dentro de una familia ───────────────────── */

test("la cuenta hija escribe sobre SU línea, no sobre la de la madre", async () => {
    ponerAQuienMira(COMO.madre);
    const madre = await setVoicebotConfig({ voice: "coral" });
    assert.equal(madre.success, true, madre.message);

    ponerAQuienMira(COMO.hija);
    const hija = await setVoicebotConfig({ voice: "sage" });
    assert.equal(hija.success, true, hija.message);

    assert.equal((await laFilaDe(MADRE)).voicebotVoice, "coral");
    assert.equal((await laFilaDe(HIJA)).voicebotVoice, "sage", "la hija no pisó a la madre");
});

test("Yair, administrador de la hija, escribe sobre la línea de SU cuenta", async () => {
    ponerAQuienMira(COMO.yair);

    const r = await setVoicebotConfig({ voice: "verse", transferTo: "573009998877" });
    assert.equal(r.success, true, r.message);

    // Su propia fila de `User` no tiene línea: si el alcance se resolviera por
    // la PERSONA en vez de por la cuenta, esto habría contestado que no hay
    // ninguna línea vinculada — el mismo fallo por la otra puerta.
    assert.equal((await laFilaDe(YAIR)), null, "Yair no tiene línea propia");
    assert.equal((await laFilaDe(HIJA)).voicebotVoice, "verse");

    const leido = await getVoicebotConfig();
    assert.equal(leido.data.voice, "verse");
});

/* ────── 6. Las hermanas de CRM → Llamadas, con el mismo aviso ───────────── */

test("poner el nombre del contacto funciona con una línea de waha", async () => {
    ponerAQuienMira(COMO.waha);
    const r = await setCallContactNameAction({ phone: "573001234567", name: "Cliente de prueba" });
    assert.equal(r.success, true, r.message);

    const lead = await db.session.findFirst({
        where: { userId: WAHA, remoteJid: "573001234567@s.whatsapp.net" },
        select: { customName: true, instanceId: true },
    });
    assert.equal(lead.customName, "Cliente de prueba");
    assert.equal(lead.instanceId, `${V}_WAHA-id`, "el lead cuelga de la línea de la cuenta");
});

test("marcarle un estado al lead funciona con una línea de waha", async () => {
    ponerAQuienMira(COMO.waha);
    const r = await setCallLeadStatusAction({ phone: "573004445566", leadStatus: "FRIO" });
    assert.equal(r.success, true, r.message);
    assert.equal(r.created, true);
});

test("y sin línea las dos dicen QUÉ falta, no «No hay instancia de WhatsApp»", async () => {
    ponerAQuienMira(COMO.soloMeta);

    const nombre = await setCallContactNameAction({ phone: "573007778899", name: "Alguien" });
    assert.equal(nombre.success, false);
    assert.match(nombre.message, /Mensajería WhatsApp \(QR\)/);
    assert.doesNotMatch(nombre.message, /No hay instancia de WhatsApp/);

    const estado = await setCallLeadStatusAction({ phone: "573007778899", leadStatus: "FRIO" });
    assert.equal(estado.success, false);
    assert.match(estado.message, /Mensajería WhatsApp \(QR\)/);
    assert.doesNotMatch(estado.message, /No hay instancia de WhatsApp/);
});

test.after(async () => {
    await db.$disconnect();
});
