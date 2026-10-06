/**
 * Una cuenta con su PROPIA clave de OpenAI no podía transcribir: salía «el
 * servicio de transcripción no respondió, inténtalo otra vez».
 *
 * Tres causas, vistas en producción: (1) la clave se elegía por el proveedor
 * POR DEFECTO, y con Google por defecto Whisper recibía la de Gemini; (2) se
 * aceptaban al guardar claves que no son claves (enmascaradas «sk-…••••», una
 * dirección, un teléfono); (3) el rechazo real de OpenAI —clave inválida, sin
 * saldo— se escondía detrás del «no respondió».
 *
 * MODO=roto corre el código de 7c1db1f y AFIRMA las dos primeras.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/clave-propia/entrada.js");
const audio = Buffer.from("audio de prueba");

function sembrar({ configs, llaves = [], credito = { total: 100, used: 0 } }) {
  globalThis.__baseDeLaClave = {
    user: {
      defaultProviderId: "p-google",
      aiConfigs: configs,
    },
    credito,
  };
  globalThis.__llavesDeLaCasa = llaves;
  globalThis.__clavesUsadas = [];
}
const google = { providerId: "p-google", apiKey: "AIzaBasuraDeGemini12345678", isActive: true, provider: { name: "google" } };
const openai = (apiKey, isActive = true) => ({ providerId: "p-openai", apiKey, isActive, provider: { name: "OpenAI" } });

if (ROTO) {
  test("ANTES: con Google por defecto, a Whisper le llegaba la clave de Gemini", async () => {
    sembrar({ configs: [google, openai("sk-buena-propia-0123456789")] });
    assert.equal(await m.laClaveDeOpenAi("u1"), google.apiKey);
  });
  test("ANTES: una clave propia rechazada salía como un vacío (el «no respondió»)", async () => {
    const r = await m.pedirleElTextoAOpenAi({ audio, clave: "sk-mala-propia-0123456789", nombre: "a.ogg" });
    assert.equal(r, "");
    assert.equal(typeof m.transcribirConOpenAi, "undefined", "no había forma de saber el motivo");
  });
} else {
  test("la clave sale SIEMPRE de la configuración de OpenAI, aunque Google sea el defecto", async () => {
    sembrar({ configs: [google, openai("sk-buena-propia-0123456789")] });
    assert.equal(await m.laClaveDeOpenAi("u1"), "sk-buena-propia-0123456789");
  });
  test("entre varias de OpenAI gana la activa", () => {
    assert.equal(
      m.laClaveDeOpenAiEntre([openai("sk-vieja-inactiva-000000000", false), openai("sk-buena-activa-0000000000")]),
      "sk-buena-activa-0000000000",
    );
    assert.equal(m.laClaveDeOpenAiEntre([google]), null);
  });
  test("una clave propia que funciona transcribe y NO cobra créditos", async () => {
    sembrar({ configs: [google, openai("sk-buena-propia-0123456789")], llaves: ["sk-buena-casa-000000000000"], credito: { total: 10, used: 999999 } });
    const { clave, saldo, propia } = await m.laClaveYElSaldo("u1");
    assert.equal(propia, true);
    assert.equal(saldo.estado, "ilimitado");
    const r = await m.transcribirConOpenAi({ audio, clave, nombre: "a.ogg", propia });
    assert.deepEqual(r, { texto: "hola, quiero una cita" });
  });
  test("la clave de la casa se cobra como siempre", async () => {
    sembrar({ configs: [openai("sk-buena-casa-000000000000")], llaves: ["sk-buena-casa-000000000000"] });
    const { propia, saldo } = await m.laClaveYElSaldo("u1");
    assert.equal(propia, false);
    assert.notEqual(saldo.estado, "ilimitado");
  });
  test("clave propia inválida: se dice, y sin probar el segundo modelo", async () => {
    sembrar({ configs: [openai("sk-mala-propia-0123456789")], llaves: ["sk-buena-casa-000000000000"] });
    const r = await m.transcribirConOpenAi({ audio, clave: "sk-mala-propia-0123456789", nombre: "a.ogg", propia: true });
    assert.deepEqual(r, { motivo: "clave_invalida" });
    assert.equal(globalThis.__clavesUsadas.length, 1);
    assert.match(m.porQueNoSeTranscribio("clave_invalida", { cuenta: "Clínica" }), /no es válida.*Ajustes › Conexión › API key/);
  });
  test("clave propia sin saldo en OpenAI: se dice", async () => {
    const r = await m.transcribirConOpenAi({ audio, clave: "sk-sinsaldo-propia-01234567", nombre: "a.ogg", propia: true });
    assert.deepEqual(r, { motivo: "clave_sin_saldo" });
    assert.match(m.porQueNoSeTranscribio("clave_sin_saldo", {}), /no tiene saldo/);
  });
  test("con la clave de la casa el cliente no ve fallos de una clave que no es suya", async () => {
    const r = await m.transcribirConOpenAi({ audio, clave: "sk-mala-casa-0123456789012", nombre: "a.ogg", propia: false });
    assert.deepEqual(r, { motivo: "no_transcribio" });
  });
  test("una clave enmascarada, una dirección o un teléfono no llegan a OpenAI", async () => {
    globalThis.__clavesUsadas = [];
    for (const c of ["sk-proj-abc••••••••wxyz", "sk-proj-abc…wxyz", "https://api.openai.com/v1", "573001234567", "sk buena con espacios 1234"]) {
      assert.equal(m.noTieneFormaDeClave(c), true, c);
      const r = await m.transcribirConOpenAi({ audio, clave: c, nombre: "a.ogg", propia: true });
      assert.deepEqual(r, { motivo: "clave_invalida" }, c);
    }
    assert.equal(globalThis.__clavesUsadas.length, 0);
    assert.equal(m.noTieneFormaDeClave("sk-proj-AbCdEf0123456789_xyz-QR"), false);
  });
  test("el rechazo de OpenAI se clasifica por su código", () => {
    assert.equal(m.elFalloDeOpenAi({ status: 401 }), "clave_invalida");
    assert.equal(m.elFalloDeOpenAi({ status: 429, code: "insufficient_quota" }), "clave_sin_saldo");
    assert.equal(m.elFalloDeOpenAi({ status: 429, code: "rate_limit_exceeded" }), null);
    assert.equal(m.elFalloDeOpenAi(new Error("socket hang up")), null);
  });
  test("al GUARDAR no se acepta una clave sin forma de clave", async () => {
    const { validateProviderApiKey } = await import("./.compilado/clave-propia/validacion.js");
    for (const c of ["sk-proj-abc••••••••wxyz", "https://api.openai.com", "573001234567"]) {
      assert.match(String(validateProviderApiKey("openai", c)), /no es válida/, c);
    }
    assert.equal(validateProviderApiKey("openai", "sk-proj-AbCdEf0123456789_xyz-QRst"), null);
  });
}
