/**
 * El banco de «el recordatorio de la cita le llegó a un número que no existe».
 *
 * El encargo, con la captura de Reinaldo Hernández (línea VERZAY_VENTAS): al
 * agendar desde la conversación, el «tu sesión empieza…» salió a un contacto
 * «Usuario desconocido / ya no está en WhatsApp». No era el recordatorio: lo
 * mandó la persona desde Chats, y Chats eligió `584242917888@lid`.
 *
 * Los `aliases` de un chat vienen EXPANDIDOS por `buildWhatsAppJidCandidates`,
 * que le añade a todo teléfono un `D@lid` de puente para BUSCAR. Con ese puente
 * dentro, `sinTelefonosFalsosDeLid` veía al teléfono real como «los dígitos de
 * un `@lid`» y lo tiraba: el mensaje —y la llamada— salían a `D@lid`, que no
 * es nadie. En producción, 17 conversaciones nacidas así desde el 01-10.
 *
 *   A. la regla: `sinElPuenteDeLosCandidatos` y `elJidParaResponder`, con los
 *      `aliases` armados por la función DE VERDAD que los expande;
 *   B. el código: los tres sitios (responder, llamar desde la cabecera y desde
 *      la ficha) deciden sin el puente.
 *
 * `MODO=roto` corre la decisión de `ANTES_PUENTE` —el `resolveSendRemoteJid`
 * de entonces, literal, sobre su regla compilada— y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_PUENTE || "a390032";
const dir = new URL("./.compilado/puente/", import.meta.url).pathname;

const ahora = await import(`${dir}ahora/destino-de-la-llamada.js`);
const antes = await import(`${dir}antes/destino-de-la-llamada.js`);
const { buildWhatsAppJidCandidates, pickPreferredWhatsAppRemoteJid } = await import(`${dir}ahora/whatsapp-jid.js`);

/** El contacto del reporte. */
const TELEFONO = "584242917888@s.whatsapp.net";
const PUENTE = "584242917888@lid";
/** El de AlexM: un contacto de verdad sin número. */
const LID = "96366802022553@lid";

/** Lo que hacía `resolveSendRemoteJid` de `chats-client.tsx` en ANTES, literal. */
function comoSeRespondiaAntes(selectedJid, contact) {
    const { sinTelefonosFalsosDeLid, esTelefonoFalsoDeLid, elDestinoDeLaLlamada } = antes;
    const selected = selectedJid.trim();
    if (!selected) return selected;
    const identidades = [contact?.senderPn, contact?.remoteJidAlt, ...(contact?.aliases ?? []), contact?.remoteJid, selected];
    const hasLid = identidades.some((v) => v?.toLowerCase().endsWith("@lid"));
    if (!hasLid && !contact?.senderPn) return selected;
    const reales = sinTelefonosFalsosDeLid(identidades);
    return (
        pickPreferredWhatsAppRemoteJid(reales) ||
        (esTelefonoFalsoDeLid(selected, identidades) ? elDestinoDeLaLlamada(identidades) : selected)
    );
}

const responder = ROTO ? comoSeRespondiaAntes : (jid, c) => ahora.elJidParaResponder(jid, c);
const destinoDeLlamada = ROTO
    ? (observadas, candidatos) => antes.elDestinoDeLaLlamada([...observadas, ...candidatos])
    : (observadas, candidatos) => ahora.elDestinoDeLaLlamada(ahora.sinElPuenteDeLosCandidatos(observadas, candidatos));

/* ── A. La regla ────────────────────────────────────────────────────────── */

test("A0 · la expansión de verdad le pega un `@lid` de puente al teléfono", () => {
    // Pasa en los dos modos: es la premisa del fallo.
    assert.ok(buildWhatsAppJidCandidates(TELEFONO).includes(PUENTE));
});

test("A1 · responder a un contacto con teléfono va a SU TELÉFONO, no al puente", () => {
    const contacto = { remoteJid: TELEFONO, aliases: buildWhatsAppJidCandidates(TELEFONO) };
    const sale = responder(TELEFONO, contacto);
    if (ROTO) assert.equal(sale, PUENTE, "el modo roto tiene que reproducir el envío a D@lid");
    else assert.equal(sale, TELEFONO);
});

test("A2 · llamar a un contacto con teléfono marca SU número", () => {
    const sale = destinoDeLlamada([TELEFONO], buildWhatsAppJidCandidates(TELEFONO));
    if (ROTO) assert.equal(sale, PUENTE, "el modo roto tiene que reproducir la llamada a D@lid");
    else {
        assert.equal(sale, "584242917888");
        // Y la de la cabecera y la ficha (#1098) dice lo mismo.
        assert.equal(ahora.elDestinoDeLaConversacion([TELEFONO], buildWhatsAppJidCandidates(TELEFONO)), "584242917888");
    }
});

test("A3 · un contacto SIN número sigue yendo por su `@lid` entero", () => {
    // Lo que arregló #1093 no se puede haber aflojado: pasa en los dos modos.
    const candidatos = buildWhatsAppJidCandidates(LID);
    assert.equal(responder(LID, { remoteJid: LID, aliases: candidatos }), LID);
    const fichaReescrita = { remoteJid: "96366802022553@s.whatsapp.net", remoteJidAlt: LID, aliases: candidatos };
    assert.equal(responder("96366802022553@s.whatsapp.net", fichaReescrita), LID);
    assert.equal(destinoDeLlamada([LID], candidatos), LID);
});

test("A4 · un `@lid` OBSERVADO con su teléfono va al teléfono", () => {
    // El mismo fallo por la otra punta: el puente del `senderPn` lo tiraba.
    const lid = "12345678901@lid";
    const contacto = {
        remoteJid: lid,
        senderPn: "573001112233@s.whatsapp.net",
        aliases: [...buildWhatsAppJidCandidates(lid), ...buildWhatsAppJidCandidates("573001112233@s.whatsapp.net")],
    };
    const sale = responder(lid, contacto);
    if (ROTO) assert.equal(sale, lid, "el modo roto tiene que reproducir que se perdía el teléfono");
    else assert.equal(sale, "573001112233@s.whatsapp.net");
});

test("A5 · el puente solo se quita si es el de un teléfono conocido", () => {
    if (ROTO) return;
    const { sinElPuenteDeLosCandidatos } = ahora;
    // Un @lid observado nunca se quita, aunque coincida con un candidato.
    assert.ok(sinElPuenteDeLosCandidatos([LID], [LID]).includes(LID));
    // Un @lid candidato de OTRO número se queda: no es un puente.
    assert.ok(sinElPuenteDeLosCandidatos([TELEFONO], ["111@lid"]).includes("111@lid"));
    assert.ok(!sinElPuenteDeLosCandidatos([TELEFONO], [PUENTE]).includes(PUENTE));
});

/* ── B. El código ───────────────────────────────────────────────────────── */

function comoEsta(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    return execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

test("B1 · los tres sitios deciden sin el puente", () => {
    const sitios = {
        responder: comoEsta("app/(root)/chats/_components/chats-client.tsx").includes("elJidParaResponder("),
        cabecera: /sinElPuenteDeLosCandidatos\(|elDestinoDeLaConversacion\(/.test(comoEsta("app/(root)/chats/_components/ChatHeader.tsx")),
        ficha: /sinElPuenteDeLosCandidatos\(|elDestinoDeLaConversacion\(/.test(comoEsta("app/(root)/chats/_components/chat-main.tsx")),
    };
    if (ROTO) assert.deepEqual(sitios, { responder: false, cabecera: false, ficha: false });
    else assert.deepEqual(sitios, { responder: true, cabecera: true, ficha: true });
});
