/**
 * El banco de «un contacto sin número se llama y se le escribe por su `@lid`».
 *
 * El encargo, con la captura del chat «AlexM»: hay contactos que entran a
 * WhatsApp por su usuario, sin número. La IA les contesta bien, pero al
 * llamarlos desde el CRM la plataforma marcaba los dígitos de su `@lid` como
 * un teléfono —«+96366802022553», el número de nadie—, la llamada quedaba
 * anotada bajo ese número, la ficha del contacto se reescribía con él, y a
 * partir de ahí responderle a mano salía con «El número +96366802022553 no
 * tiene WhatsApp».
 *
 *   A. la REGLA, pura: el destino es el teléfono real o el `@lid` ENTERO;
 *   B. el CÓDIGO de verdad: los sitios que llaman y el que decide a quién se
 *      responde pasan por esa regla;
 *   C. las ACCIONES contra Postgres: dónde queda la llamada y qué le pasa a la
 *      ficha del contacto.
 *
 * `MODO=roto` ejerce el código de `ANTES_REF` y **afirma el fallo**.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "c65028a";
const sello = Date.now().toString(36);

/** El contacto del reporte. */
const LID = "96366802022553@lid";
const DIGITOS_DEL_LID = "96366802022553";
/** Lo que se llamaba: sus dígitos leídos como un teléfono. */
const NUMERO_FALSO = `${DIGITOS_DEL_LID}@s.whatsapp.net`;

const regla = ROTO ? null : await import("./.compilado/destino/destino-de-la-llamada.js");
const {
    ponerAQuienMira,
    startAstraCall,
    logOutgoingCallAction,
    persistChatMessage,
    db,
} = await import(ROTO ? "./.compilado/destino-antes/entrada-del-destino.js" : "./.compilado/destino/entrada-del-destino.js");

/**
 * Lo que hacían las cuatro pantallas que llaman, literal: quedarse con los
 * dígitos de lo que hubiera (`replace(/\D/g, "")`) y ponerle un «+».
 */
function comoSeLlamabaAntes(valor) {
    return `+${String(valor ?? "").replace(/\D/g, "")}`;
}

/* ── A. La regla ────────────────────────────────────────────────────────── */

test("A1 · ANTES, un `@lid` se llamaba como el número de nadie", () => {
    // Pasa en los dos modos: es lo que la regla nueva tiene que dejar de hacer.
    assert.equal(comoSeLlamabaAntes(LID), `+${DIGITOS_DEL_LID}`);
});

test("A2 · el destino es el TELÉFONO real, y si no hay, el `@lid` entero", () => {
    if (ROTO) return;
    const { elDestinoDeLaLlamada } = regla;
    assert.equal(elDestinoDeLaLlamada([LID]), LID);
    assert.equal(elDestinoDeLaLlamada([LID, "573001112233@s.whatsapp.net"]), "573001112233");
    assert.equal(elDestinoDeLaLlamada(["573001112233@s.whatsapp.net", LID]), "573001112233");
    // El aparato pegado no es parte de nada.
    assert.equal(elDestinoDeLaLlamada(["96366802022553:12@lid"]), LID);
    assert.equal(elDestinoDeLaLlamada(["573233246305:39@s.whatsapp.net"]), "573233246305");
    // Un grupo o un estado no se llaman.
    assert.equal(elDestinoDeLaLlamada(["120363000000000000@g.us"]), "");
    assert.equal(elDestinoDeLaLlamada(["status@broadcast"]), "");
    assert.equal(elDestinoDeLaLlamada([]), "");
});

test("A3 · un «teléfono» con los dígitos de su `@lid` es FALSO, y se descarta", () => {
    if (ROTO) return;
    const { elDestinoDeLaLlamada, esTelefonoFalsoDeLid, sinTelefonosFalsosDeLid } = regla;
    // Es la ficha de producción: el `remoteJid` reescrito con el número falso
    // y el `@lid` de verdad al lado.
    assert.equal(elDestinoDeLaLlamada([NUMERO_FALSO, LID]), LID);
    assert.equal(esTelefonoFalsoDeLid(NUMERO_FALSO, [LID]), true);
    assert.equal(esTelefonoFalsoDeLid(`${DIGITOS_DEL_LID}@c.us`, [LID]), true);
    assert.deepEqual(sinTelefonosFalsosDeLid([NUMERO_FALSO, LID]), [LID]);
    // Un teléfono de verdad al lado de un `@lid` NO es falso.
    assert.equal(esTelefonoFalsoDeLid("573001112233@s.whatsapp.net", [LID]), false);
    assert.deepEqual(
        sinTelefonosFalsosDeLid(["573001112233@s.whatsapp.net", LID]),
        ["573001112233@s.whatsapp.net", LID],
    );
    // Sin `@lid` delante no se puede saber, y no se toca nada.
    assert.equal(esTelefonoFalsoDeLid(NUMERO_FALSO, []), false);
});

test("A4 · lo que viaja entre pantallas, al servidor de llamadas y a la conversación", () => {
    if (ROTO) return;
    const { comoDestino, paraElServidorDeLlamadas, elJidDelDestino, elDestinoParaMostrar, SIN_NUMERO_VISIBLE } = regla;
    assert.equal(comoDestino(LID), LID);
    assert.equal(comoDestino("+57 300 111 2233"), "573001112233");
    assert.equal(comoDestino("57"), "");
    assert.equal(paraElServidorDeLlamadas(LID), LID, "un `@lid` viaja ENTERO, sin «+»");
    assert.equal(paraElServidorDeLlamadas("573001112233"), "+573001112233");
    assert.equal(elJidDelDestino(LID), LID);
    assert.equal(elJidDelDestino("573001112233"), "573001112233@s.whatsapp.net");
    assert.equal(elDestinoParaMostrar(LID), SIN_NUMERO_VISIBLE, "sus dígitos con un «+» son un número que no existe");
    assert.equal(elDestinoParaMostrar("573001112233"), "+573001112233");
});

/* ── B. El código de verdad ─────────────────────────────────────────────── */

function comoEsta(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Los sitios que deciden a quién se llama, y lo que tienen que usar. */
const LOS_QUE_LLAMAN = [
    ["app/(root)/chats/_components/ChatHeader.tsx", "elDestinoDeLaConversacion("],
    ["app/(root)/chats/_components/chat-main.tsx", "elDestinoDeLaConversacion("],
    ["components/chats/MenuDeLlamada.tsx", "comoDestino("],
    ["components/chats/AnfitrionDeLlamada.tsx", "comoDestino("],
    ["app/(root)/crm/llamadas/_components/CallsCrmClient.tsx", "elJidDelDestino("],
    ["app/(root)/crm/dashboard/components/records-table/CrmRecordActionsCell.tsx", "elDestinoDeLaLlamada("],
    ["app/(root)/chats/_components/CallDialog.tsx", "paraElServidorDeLlamadas(phone)"],
    ["actions/astracalls-actions.ts", "elJidDelDestino(phone)"],
    ["actions/voicebot-actions.ts", "comoDestino(phone)"],
    ["actions/missed-call-reply-actions.ts", "elJidDelDestino(phone)"],
];

test("A5 · con los CANDIDATOS de pedir mensajes, el teléfono real sigue siendo el destino", () => {
    if (ROTO) return;
    // `buildWhatsAppJidCandidates` cruza a propósito `D@s.whatsapp.net` con
    // `D@lid`. Mezclado con las identidades reales, ese `@lid` fabricado hacía
    // que el teléfono pareciera falso: la llamada salía a `D@lid` (nadie) y la
    // burbuja quedaba en una conversación aparte.
    const tel = "573001112233@s.whatsapp.net";
    const candidatos = [tel, "573001112233", "573001112233@lid"];
    assert.equal(regla.elDestinoDeLaLlamada([tel, ...candidatos]), "573001112233@lid", "así fallaba mezclándolo todo");
    assert.equal(regla.elDestinoDeLaConversacion([tel, null, tel], candidatos), "573001112233");
    // Un contacto de verdad por `@lid` sigue llamándose por su `@lid`.
    assert.equal(regla.elDestinoDeLaConversacion([LID, null, LID], [LID, NUMERO_FALSO]), LID);
    // Y sin reales, se mira en los candidatos.
    assert.equal(regla.elDestinoDeLaConversacion([null], [tel]), "573001112233");
});

test("B1 · los sitios que llaman pasan por la regla del destino", () => {
    const faltan = LOS_QUE_LLAMAN.filter(([ruta, marca]) => !comoEsta(ruta).includes(marca)).map(([r]) => r);
    if (ROTO) {
        assert.equal(faltan.length, LOS_QUE_LLAMAN.length, "el modo roto tiene que ver los diez sin la regla");
    } else {
        assert.deepEqual(faltan, [], "un sitio que llama sin la regla vuelve a marcar el número de nadie");
    }
});

test("B2 · ningún sitio que llama se queda con los dígitos de lo que haya", () => {
    // La forma exacta del fallo: `(algo.phone ...).replace(/\D/g, '')` en el
    // camino que arma el número al que se llama.
    const marcas = [
        ["app/(root)/chats/_components/ChatHeader.tsx", /callDigits\s*=\s*\([^)]*\)\.replace\(\/\\D\/g/],
        ["components/chats/MenuDeLlamada.tsx", /digitos\s*=\s*\(datos\.phone[^)]*\)\.replace\(\/\\D\/g/],
        ["components/chats/AnfitrionDeLlamada.tsx", /phone\s*=\s*\(d\?\.phone[^)]*\)\.replace\(\/\\D\/g/],
        ["app/(root)/chats/_components/CallDialog.tsx", /startAstraCall\(`\+\$\{phone\}`/],
        ["actions/astracalls-actions.ts", /remoteJid\s*=\s*`\$\{digits\}@s\.whatsapp\.net`/],
    ];
    const conElFallo = marcas.filter(([ruta, re]) => re.test(comoEsta(ruta))).map(([r]) => r);
    if (ROTO) {
        assert.equal(conElFallo.length, marcas.length, "el modo roto tiene que ver el fallo en los cinco");
    } else {
        assert.deepEqual(conElFallo, []);
    }
});

test("B3 · responder a mano descarta el «teléfono» fabricado de su `@lid`", () => {
    const cliente = comoEsta("app/(root)/chats/_components/chats-client.tsx");
    const persistencia = comoEsta("lib/chat-persistence.ts");
    // La decisión se mudó a la regla (`elJidParaResponder`), que filtra igual.
    const filtraAlResponder =
        cliente.includes("sinTelefonosFalsosDeLid(identidades)") ||
        (cliente.includes("elJidParaResponder(") &&
            comoEsta("lib/destino-de-la-llamada.ts").includes("sinTelefonosFalsosDeLid(identidades)"));
    const guardaLaFicha = persistencia.includes("esTelefonoFalsoDeLid(remoteJid, [existing.remoteJid, existing.remoteJidAlt])");
    if (ROTO) {
        assert.ok(!filtraAlResponder && !guardaLaFicha, "el modo roto tiene que ver los dos sin la guarda");
    } else {
        assert.ok(filtraAlResponder, "al responder se prefiere el número fabricado y WhatsApp contesta que no existe");
        assert.ok(guardaLaFicha, "la ficha se vuelve a reescribir con el número fabricado");
    }
});

/* ── C. Las acciones, contra Postgres ───────────────────────────────────── */

const cuenta = `cuenta-${sello}`;
const LINEA = `LINEA_${sello}`;
const TELEFONO = "573001112233";

async function laFicha(remoteJidDeSiembra) {
    return db.session.findMany({
        where: { userId: cuenta, OR: [{ remoteJid: remoteJidDeSiembra }, { remoteJid: NUMERO_FALSO }, { remoteJidAlt: NUMERO_FALSO }] },
        select: { id: true, remoteJid: true, remoteJidAlt: true },
    });
}

test("C0 · siembra: una cuenta con su línea, un contacto por `@lid` y otro con número", async () => {
    await db.user.create({
        data: { id: cuenta, email: `${cuenta}@b.co`, name: "Multigama", role: "admin", astraCallsSid: `sid-${cuenta}` },
    });
    await db.instancia.create({ data: { userId: cuenta, instanceId: `i-${cuenta}`, instanceName: LINEA, instanceType: "waha" } });
    // `Session.instanceId` guarda el NOMBRE de la línea: es con lo que la busca
    // `upsertSessionFromChatMessage`. Con otro valor la ficha no se encuentra y
    // el caso no ejerce nada en ninguno de los dos modos.
    await db.session.create({
        data: { userId: cuenta, instanceId: LINEA, remoteJid: LID, pushName: "AlexM", status: true },
    });
    await db.session.create({
        data: { userId: cuenta, instanceId: LINEA, remoteJid: `${TELEFONO}@s.whatsapp.net`, pushName: "Marta", status: true },
    });
    ponerAQuienMira({ id: cuenta, email: `${cuenta}@b.co`, role: "admin", effectiveId: cuenta });
});

test("C1 · al servidor de llamadas le llega el `@lid` ENTERO", async () => {
    if (ROTO) return; // la acción solo reenvía; el fallo estaba en quien la llamaba (B1)
    const cuerpos = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        cuerpos.push(JSON.parse(String(init?.body ?? "{}")));
        return { ok: true, status: 200, json: async () => ({ call: { callId: "c1" } }), text: async () => "" };
    };
    try {
        const r = await startAstraCall(regla.paraElServidorDeLlamadas(LID), LINEA);
        assert.equal(r.success, true, r.message);
        assert.equal(cuerpos.at(-1)?.phone, LID);
        // Y un número de verdad sigue saliendo con su «+».
        await startAstraCall(regla.paraElServidorDeLlamadas(TELEFONO), LINEA);
        assert.equal(cuerpos.at(-1)?.phone, `+${TELEFONO}`);
        // Basura no se manda.
        const vacio = await startAstraCall(regla.paraElServidorDeLlamadas("57"), LINEA);
        assert.equal(vacio.success, false);
    } finally {
        globalThis.fetch = original;
    }
});

test("C2 · la llamada queda en la conversación del `@lid`, y la ficha NO se reescribe", async () => {
    const { id } = await logOutgoingCallAction(LID, 46, false, undefined, { provider: "astra" }, LINEA);
    assert.ok(id, "no se escribió ninguna fila");
    const fila = await db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { remoteJid: true } });
    const fichas = await laFicha(LID);
    if (ROTO) {
        // EL FALLO, tal cual en producción: la burbuja bajo el número de nadie,
        // y la ficha del contacto reescrita con él.
        assert.equal(fila.remoteJid, NUMERO_FALSO, "el modo roto tiene que anotarla bajo el número falso");
        assert.ok(fichas.some((f) => f.remoteJid === NUMERO_FALSO), "el modo roto tiene que reescribir la ficha");
        return;
    }
    assert.equal(fila.remoteJid, LID);
    assert.equal(fichas.length, 1, "un solo contacto, una sola ficha");
    assert.equal(fichas[0].remoteJid, LID, "la ficha sigue siendo la del `@lid`");
});

test("C3 · un mensaje bajo el número fabricado NO reescribe la ficha del `@lid`", async () => {
    // Es lo que hizo la llamada en producción, por el camino que sea que llegue
    // todavía: la burbuja con los dígitos del `@lid` como teléfono.
    await persistChatMessage({
        userId: cuenta,
        instanceName: LINEA,
        instanceType: "waha",
        remoteJid: NUMERO_FALSO,
        messageId: `falso-${sello}`,
        fromMe: true,
        messageType: "conversation",
        content: "hola",
        messageTimestamp: new Date(),
    });
    const fichas = await laFicha(LID);
    if (ROTO) {
        assert.ok(fichas.some((f) => f.remoteJid === NUMERO_FALSO), "el modo roto tiene que reescribir la ficha");
        return;
    }
    assert.ok(fichas.every((f) => f.remoteJid === LID), `la ficha se reescribió: ${JSON.stringify(fichas)}`);
});

test("C4 · un contacto con número sigue igual: su llamada, bajo su número", async () => {
    const { id } = await logOutgoingCallAction(TELEFONO, 30, false, undefined, { provider: "astra" }, LINEA);
    assert.ok(id);
    const fila = await db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { remoteJid: true } });
    assert.equal(fila.remoteJid, `${TELEFONO}@s.whatsapp.net`);
    const ficha = await db.session.findFirst({
        where: { userId: cuenta, pushName: "Marta" },
        select: { remoteJid: true },
    });
    assert.equal(ficha.remoteJid, `${TELEFONO}@s.whatsapp.net`);
});

test("C9 · se recoge la siembra", async () => {
    await db.$disconnect();
});
