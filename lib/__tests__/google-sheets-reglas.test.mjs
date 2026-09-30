/**
 * La pantalla de Google Sheets: la REGLA del enlace y un BARRIDO del código.
 *
 * 1. `laHojaQueSeGuarda` (`lib/url-de-google-sheets.ts`) decide qué es «tu
 *    hoja» y cómo se guarda, y la preguntan la pantalla y la acción. Aquí se
 *    ejerce con los enlaces que de verdad se pegan: el de la barra de
 *    direcciones con su pestaña, el de «Compartir» (`?usp=sharing`), un
 *    documento, una carpeta de Drive, el de «Publicar en la web» y un id suelto.
 * 2. `elIdDeLaHoja` es la regla que estaba COPIADA en dos acciones. Se
 *    compara, entrada por entrada, con la copia de antes (sacada de git): si
 *    cambiara, cambiaría a qué hoja escriben las integraciones que ya funcionan.
 * 3. El barrido: ni una copia más de la regla, el fallo de escribir en la hoja
 *    no es mudo, la acción valida lo que guarda, copiar va en su `try`, se
 *    enseña el correo con el que compartir y existe «Quitar hoja».
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos de antes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "ab6b110";

const deGit = (rel) => {
    try {
        return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};
const leer = (rel) => (ROTO ? deGit(rel) : readFileSync(path.join(RAIZ, rel), "utf8"));

const PANTALLA = "app/(root)/google-sheets/_components/GoogleSheetsClient.tsx";
const PAGINA = "app/(root)/google-sheets/page.tsx";
const ACCION = "actions/google-sheets-actions.ts";
const CITAS = "actions/booking-form-actions.ts";

/** El cuerpo de una función, del `function nombre` a la siguiente `export`. */
function elCuerpo(fuente, nombre) {
    const ini = fuente.indexOf(`function ${nombre}`);
    if (ini < 0) return "";
    const sig = fuente.indexOf("\nexport ", ini + 10);
    return fuente.slice(ini, sig > 0 ? sig : undefined);
}

if (ROTO) {
    test("ANTES: la regla del id estaba COPIADA en las dos acciones", () => {
        assert.match(leer(ACCION), /function extractSheetId\(/);
        assert.match(leer(CITAS), /function extractSheetId\(/);
    });

    test("ANTES: la acción guardaba CUALQUIER texto como hoja", () => {
        const cuerpo = elCuerpo(leer(ACCION), "saveUserSheetsUrl");
        assert.match(cuerpo, /sheetsUrl: url\.trim\(\) \|\| null/);
        assert.doesNotMatch(cuerpo, /laHojaQueSeGuarda/);
    });

    test("ANTES: escribir la respuesta de una cita en la hoja fallaba EN SILENCIO", () => {
        assert.match(elCuerpo(leer(CITAS), "syncResponseToSheets"), /catch \{\s*\/\/ Silencioso/);
    });

    test("ANTES: la pantalla no decía con qué correo compartir la hoja, copiar no iba en su try y no se podía quitar", () => {
        const p = leer(PANTALLA);
        assert.doesNotMatch(p, /serviceAccountEmail/);
        assert.doesNotMatch(leer(PAGINA), /getServiceAccountEmail/);
        assert.match(p, /async function copiarLink\(\) \{\s*if \(!openUrl\) return;\s*await navigator\.clipboard\.writeText/);
        assert.doesNotMatch(p, /Quitar hoja/);
    });
} else {
    const regla = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-google-sheets/url-de-google-sheets.mjs"));
    const ID = "1mNegocioVentasYCitas2026HojaDeEjemplo0Guia";

    test("lo que se pega de verdad: se guarda LIMPIO, con su pestaña si venía", () => {
        const casos = [
            [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, "0"],
            [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, `https://docs.google.com/spreadsheets/d/${ID}/edit`, null],
            [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=77`, `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=77`, "77"],
            [`  docs.google.com/spreadsheets/d/${ID}/edit?gid=5#gid=5 `, `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=5`, "5"],
            [ID, `https://docs.google.com/spreadsheets/d/${ID}/edit`, null],
        ];
        for (const [pegado, url, pestana] of casos) {
            const r = regla.laHojaQueSeGuarda(pegado);
            assert.equal(r.ok, true, `«${pegado}» no se acepta: ${r.motivo}`);
            assert.equal(r.url, url, `«${pegado}»`);
            assert.equal(r.id, ID);
            assert.equal(r.pestana, pestana);
            // Guardar lo ya guardado da lo mismo: la pantalla lo relee al abrir.
            assert.deepEqual(regla.laHojaQueSeGuarda(r.url), r);
        }
        assert.equal(regla.elEnlaceIncrustado(ID, "77"), `https://docs.google.com/spreadsheets/d/${ID}/edit?rm=minimal#gid=77`);
        assert.equal(regla.elEnlaceIncrustado(ID), `https://docs.google.com/spreadsheets/d/${ID}/edit?rm=minimal`);
    });

    test("lo que NO sirve se dice con su motivo, y el motivo dice qué copiar", () => {
        const casos = [
            ["", /^Pega el enlace/],
            ["hola", /no es de una hoja/],
            ["https://docs.google.com/document/d/1Hq4tR8kLmN2pX9vB7cD3eF5gH6jK0lZ/edit", /no es de una hoja de Google Sheets/],
            ["https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz", /no es de una hoja de Google Sheets/],
            ["https://docs.google.com/spreadsheets/d/e/2PACX-1vQk8sR3mT7vW2xY5zA9bC4dE6fG1hJ/pubhtml", /Publicar en la web/],
            ["https://docs.google.com/spreadsheets/d/corto/edit", /no es de una hoja/],
            ["https://ejemplo.com/spreadsheets/d/" + ID, /no es de una hoja/],
            ["https://exa mple", /no es un enlace/],
        ];
        for (const [pegado, motivo] of casos) {
            const r = regla.laHojaQueSeGuarda(pegado);
            assert.equal(r.ok, false, `«${pegado}» se acepta y no sirve`);
            assert.match(r.motivo, motivo, `«${pegado}»: ${r.motivo}`);
            assert.match(r.motivo, /\.$/, "el motivo es una frase entera");
        }
    });

    test("el id de la hoja sale IGUAL que con la copia de antes: no cambia a qué hoja se escribe", () => {
        const antes = deGit(CITAS);
        const trozo = /function extractSheetId\(input: string\): string \| null \{[\s\S]*?\n\}/.exec(antes)?.[0];
        assert.ok(trozo, `no se encontró la copia de antes en ${ANTES}`);
        const deAntes = new Function(`${trozo.replace("(input: string): string | null", "(input)")}; return extractSheetId;`)();
        const entradas = [
            `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
            `https://docs.google.com/spreadsheets/d/${ID}`,
            `${ID}`,
            `  ${ID}  `,
            "https://docs.google.com/spreadsheets/d/e/2PACX-1vQk8sR3mT7vW2xY5zA9bC4dE6fG1hJ/pubhtml",
            "algo corto",
            "https://docs.google.com/document/d/1Hq4tR8kLmN2pX9vB7cD3eF5gH6jK0lZ/edit",
            "",
        ];
        for (const e of entradas) assert.equal(regla.elIdDeLaHoja(e), deAntes(e) ?? null, `«${e}»`);
    });

    test("barrido: la regla del id vive en UN sitio", () => {
        const copias = readdirSync(path.join(RAIZ, "actions"))
            .filter((f) => f.endsWith(".ts"))
            .filter((f) => /function extractSheetId\(/.test(readFileSync(path.join(RAIZ, "actions", f), "utf8")));
        assert.deepEqual(copias, [], "hay copias de la regla del id");
        assert.match(leer(CITAS), /elIdDeLaHoja\(user\.sheetsUrl\)/);
    });

    test("barrido: la acción guarda solo lo que la regla da por hoja, y devuelve lo que quedó escrito", () => {
        const cuerpo = elCuerpo(leer(ACCION), "saveUserSheetsUrl");
        assert.match(cuerpo, /laCuentaDeLaAccion\(userId\)/, "la acción perdió su puerta");
        assert.match(cuerpo, /laHojaQueSeGuarda\(texto\)/);
        assert.match(cuerpo, /return \{ success: true, url: guardada \}/);
        assert.doesNotMatch(cuerpo, /catch \{/, "un fallo al guardar no puede ser mudo");
    });

    test("barrido: que falle escribir en la hoja no tumba la cita, pero se DICE", () => {
        const cuerpo = elCuerpo(leer(CITAS), "syncResponseToSheets");
        assert.doesNotMatch(cuerpo, /catch \{/);
        assert.match(cuerpo, /console\.warn\('\[google-sheets\] no se pudo escribir/);
    });

    test("barrido: la pantalla valida con la MISMA regla, enseña el correo, copia en su try y deja quitar", () => {
        const p = leer(PANTALLA);
        assert.match(p, /import \{ elEnlaceIncrustado, laHojaQueSeGuarda \} from '@\/lib\/url-de-google-sheets'/);
        assert.doesNotMatch(p, /function getSheetId|\.match\(\/\\\/spreadsheets/, "la pantalla vuelve a tener su propia regla");
        assert.match(leer(PAGINA), /getServiceAccountEmail\(\)/);
        assert.match(p, /serviceAccountEmail/);
        assert.match(p, /try \{\s*await navigator\.clipboard\.writeText/);
        assert.match(p, /saveUserSheetsUrl\(userId, ''\)/, "quitar no manda «sin hoja»");
        assert.match(p, /data-confirmar-quitar/, "quitar no pregunta antes");
    });
}
