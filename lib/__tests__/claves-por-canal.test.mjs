/**
 * El botón «Claves» de cada canal del Agente IA (`scripts/banco-claves-por-canal.sh`).
 *
 * Dos mitades:
 *  - la decisión pura (`lib/claves-por-canal.ts`), solo en modo bueno;
 *  - un barrido del código, que en `MODO=roto` lee el commit de antes
 *    (`ANTES_REF`) y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "1d733ad";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function leer(fichero) {
    if (ROTO) {
        try {
            return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], {
                cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
            });
        } catch {
            return "";
        }
    }
    return fs.readFileSync(path.join(RAIZ, fichero), "utf8");
}

const MAIN = "app/(root)/ai/_components/MainAi.tsx";
const VOZ_ACCIONES = "actions/userClientDataActions.ts";
const ACCIONES = "actions/claves-por-canal-actions.ts";

if (!ROTO) {
    const claves = await import(path.join(RAIZ, "lib/__tests__/.compilado/claves-por-canal/claves-por-canal.mjs"));
    const { TRAINING_CHANNELS } = await import(path.join(RAIZ, "lib/__tests__/.compilado/claves-por-canal/channel-training.mjs"));
    const SIN = { tieneClave: false, finalDeLaClave: null };
    const CON = { tieneClave: true, finalDeLaClave: "wxyz" };

    test("cada canal del editor tiene su botón «Claves», y WhatsApp lleva Mensajería arriba y Voz abajo", () => {
        for (const c of TRAINING_CHANNELS) {
            assert.ok(claves.lasSeccionesDelCanal(c.slug).length > 0, `el canal ${c.slug} no tiene claves`);
        }
        assert.deepEqual(claves.lasSeccionesDelCanal("whatsapp"), ["mensajeria", "voz"]);
        assert.deepEqual(claves.lasSeccionesDelCanal("llamadas"), ["llamadas"]);
        assert.deepEqual(claves.lasSeccionesDelCanal("videollamadas"), ["videollamadas"]);
        assert.deepEqual(claves.lasSeccionesDelCanal("no-existe"), []);
    });

    test("Llamadas deja ElevenLabs preparado, sin dejarlo elegir todavía", () => {
        const p = claves.SECCIONES_DE_CLAVES.llamadas.proveedores;
        assert.deepEqual(p.map((x) => [x.id, x.disponible]), [["openai", true], ["elevenlabs", false]]);
        assert.deepEqual(claves.SECCIONES_DE_CLAVES.mensajeria.proveedores.map((x) => x.id), ["google", "openai"]);
        assert.deepEqual(claves.SECCIONES_DE_CLAVES.voz.proveedores.map((x) => x.id), ["openai", "elevenlabs"]);
    });

    test("el botón avisa si falta ALGUNA; una sección apagada no avisa", () => {
        assert.equal(claves.elEstadoDelBoton([{ estado: "lista" }, { estado: "pendiente" }]), "pendiente");
        assert.equal(claves.elEstadoDelBoton([{ estado: "lista" }, { estado: "apagada" }]), "lista");
        assert.equal(claves.elEstadoDelBoton([]), "lista");
    });

    test("una clave nunca se enseña entera", () => {
        assert.equal(claves.comoSeEnsenaLaClave(CON), "•••• wxyz");
        assert.equal(claves.comoSeEnsenaLaClave({ tieneClave: true, finalDeLaClave: null }), "••••••••");
        assert.equal(claves.comoSeEnsenaLaClave(SIN), "Sin clave");
    });

    test("Mensajería mira la clave del proveedor POR DEFECTO, que es la que usa el motor", () => {
        const configs = [
            { providerId: "g", proveedor: "google", isActive: true, clave: SIN },
            { providerId: "o", proveedor: "openai", isActive: true, clave: CON },
        ];
        const conGoogle = claves.elEstadoDeLaMensajeria(configs, "g");
        assert.equal(conGoogle.estado, "pendiente");
        assert.match(conGoogle.detalle, /Google/);
        const conOpenAi = claves.elEstadoDeLaMensajeria(configs, "o");
        assert.equal(conOpenAi.estado, "lista");
        assert.equal(conOpenAi.detalle, "OpenAI · •••• wxyz");
        assert.equal(claves.elEstadoDeLaMensajeria([], null).estado, "pendiente");
    });

    test("Voz: apagada no avisa; ElevenLabs sin clave o sin voz, sí; OpenAI TTS pide la clave de OpenAI", () => {
        const base = { activada: true, proveedor: "openai", claveElevenLabs: SIN, vozElevenLabs: "", vozOpenAi: "nova", openAi: null };
        assert.equal(claves.elEstadoDeLaVoz({ ...base, activada: false }).estado, "apagada");
        assert.equal(claves.elEstadoDeLaVoz(base).estado, "pendiente");
        assert.equal(claves.elEstadoDeLaVoz({ ...base, openAi: { providerId: "o", proveedor: "openai", isActive: true, clave: CON } }).estado, "lista");
        assert.equal(claves.elEstadoDeLaVoz({ ...base, proveedor: "elevenlabs" }).estado, "pendiente");
        assert.equal(claves.elEstadoDeLaVoz({ ...base, proveedor: "elevenlabs", claveElevenLabs: CON }).estado, "pendiente");
        assert.equal(claves.elEstadoDeLaVoz({ ...base, proveedor: "elevenlabs", claveElevenLabs: CON, vozElevenLabs: "v1" }).estado, "lista");
    });

    test("Videollamadas: sin avatar propio avisa, aunque haya el de la plataforma", () => {
        assert.equal(claves.elEstadoDelAvatar({ propio: null, hayDeLaCasa: true }).estado, "pendiente");
        const propio = claves.elEstadoDelAvatar({ propio: { personaId: "p123", clave: CON }, hayDeLaCasa: true });
        assert.equal(propio.estado, "lista");
        assert.equal(propio.personaId, "p123");
    });

    test("cada línea va a su canal, y sin línea o sin token se avisa", () => {
        const fila = (instanceType, metaChannel) => ({ instanceType, metaChannel });
        assert.ok(claves.esLineaDeLaSeccion("linea-telegram", fila("telegram", "telegram")));
        assert.ok(claves.esLineaDeLaSeccion("linea-whatsapp-api", fila("meta", null)));
        assert.ok(claves.esLineaDeLaSeccion("linea-facebook", fila("meta", "facebook")));
        assert.ok(claves.esLineaDeLaSeccion("linea-instagram", fila("meta", "instagram")));
        assert.ok(!claves.esLineaDeLaSeccion("linea-whatsapp-api", fila("meta", "facebook")));
        assert.ok(!claves.esLineaDeLaSeccion("linea-telegram", fila("Whatsapp", null)));

        assert.equal(claves.elEstadoDeLaLinea("linea-telegram", []).estado, "pendiente");
        const linea = { instanceName: "a", nombre: "A", identificador: "@bot", clave: CON };
        assert.equal(claves.elEstadoDeLaLinea("linea-telegram", [linea]).estado, "lista");
        assert.equal(claves.elEstadoDeLaLinea("linea-telegram", [{ ...linea, clave: SIN }]).estado, "pendiente");
    });
}

test("«Claves» está a la vista y ANTES de Guardar", () => {
    const main = leer(MAIN);
    const boton = main.indexOf("<BotonDeClaves");
    const guardar = main.indexOf("<PromptToolbar");
    if (ROTO) {
        assert.equal(boton, -1, "el código de antes ya tenía el botón: el banco no prueba nada");
        return;
    }
    assert.ok(boton > 0, "el editor no pinta el botón «Claves»");
    assert.ok(boton < guardar, "«Claves» tiene que ir antes de «Guardar»");
});

test("la voz ya no se esconde en el «⋯»", () => {
    const main = leer(MAIN);
    const escondida = /setShowVoice\(true\)/.test(main) || main.includes("<VoiceSettings");
    if (ROTO) assert.ok(escondida, "el código de antes no tenía la voz en el «⋯»");
    else assert.ok(!escondida, "la voz sigue en el «⋯» del editor");
});

test("la clave de ElevenLabs no viaja al navegador", () => {
    const acciones = leer(VOZ_ACCIONES);
    const enClaro = /elevenLabsApiKey:\s*row\.elevenLabsApiKey/.test(acciones);
    if (ROTO) assert.ok(enClaro, "el código de antes no devolvía la clave");
    else {
        assert.ok(!enClaro, "getUserVoiceSettings devuelve la clave de ElevenLabs");
        assert.match(acciones, /elevenLabsClave:\s*comoLaVeElNavegador\(/);
    }
});

test("toda acción del botón comprueba de quién es la cuenta", () => {
    const fuente = leer(ACCIONES);
    if (ROTO) {
        assert.equal(fuente, "", "las acciones ya existían antes");
        return;
    }
    const exportadas = [...fuente.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    assert.ok(exportadas.length >= 5);
    const trozos = fuente.split(/export async function /).slice(1);
    for (const t of trozos) {
        const nombre = t.slice(0, t.indexOf("("));
        assert.match(t, /await laCuentaDeLaAccion\(userId\)/, `${nombre} no comprueba la cuenta`);
    }
    assert.ok(!/apiKey:\s*\w+\.apiKey/.test(fuente), "una acción devuelve una clave");
});
