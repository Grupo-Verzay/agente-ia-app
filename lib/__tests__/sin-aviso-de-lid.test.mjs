/**
 * La cabecera de Chats ya no enseña el aviso de «ID interno de WhatsApp».
 *
 * Era una barra ámbar sobre el hilo, en todo chat abierto por su `@lid`, con
 * «Unir contacto», «Eliminar» —destructivo, en un sitio donde no corresponde— y
 * una X que recordaba el cierre en `localStorage` (`lid_aviso_oculto_v1`). La
 * plataforma no gestiona contactos duplicados: los contactos se gestionan en
 * Contactos, y solo ahí.
 *
 * Se barre el código, en DOS modos:
 *  - bueno: el árbol de trabajo. Ni la barra, ni sus dos acciones, ni su estado
 *    de cierre; y como `MergeLidDialog` y `actions/merge-lid-contact.ts` solo los
 *    usaba esa barra, se fueron con ella (una acción de servidor ES un endpoint).
 *    El resto de la cabecera sigue: nombre, editar contacto, pestañas y botones.
 *  - roto: la cabecera de ANTES_REF, sacada con `git show`, y se AFIRMA que la
 *    barra estaba ahí. Sin ese modo, lo verde del otro no diría que el barrido mira.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "87b08fd";
const CABECERA = "app/(root)/chats/_components/ChatHeader.tsx";

const leer = (ruta) =>
  MODO === "roto"
    ? execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { encoding: "utf8" })
    : readFileSync(ruta, "utf8");

const cabecera = leer(CABECERA);
const SENALES = [
  "ID interno de WhatsApp",
  "Unir contacto",
  "MergeLidDialog",
  "deleteLidChat",
  "merge-lid-contact",
  "lid_aviso_oculto",
  "avisoLidOculto",
  "confirmDeleteLid",
];

if (MODO === "roto") {
  test("ANTES: la cabecera pintaba la barra con sus dos acciones", () => {
    for (const s of ["ID interno de WhatsApp", "Unir contacto", "deleteLidChat", "lid_aviso_oculto"]) {
      assert.ok(cabecera.includes(s), `en ${ANTES_REF} faltaba «${s}»: el modo roto no reproduce nada`);
    }
  });
} else {
  test("la cabecera no pinta la barra ni guarda su cierre", () => {
    for (const s of SENALES) assert.ok(!cabecera.includes(s), `la cabecera todavía nombra «${s}»`);
  });

  test("el diálogo de unir y las acciones se fueron con su único llamador", () => {
    assert.ok(!existsSync("app/(root)/chats/_components/MergeLidDialog.tsx"));
    assert.ok(!existsSync("actions/merge-lid-contact.ts"));
  });

  test("nadie más importa lo que se quitó", () => {
    const hallados = [];
    const barrer = (dir) => {
      for (const n of readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "__tests__"].includes(n)) continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) barrer(p);
        else if (/\.(tsx?|mjs|jsx?)$/.test(n)) {
          const t = readFileSync(p, "utf8");
          if (/merge-lid-contact|MergeLidDialog|deleteLidChat|mergeLidContact|listMergeCandidates/.test(t)) hallados.push(p);
        }
      }
    };
    for (const d of ["app", "components", "actions", "lib", "hooks"]) barrer(d);
    assert.deepEqual(hallados, []);
  });

  test("el resto de la cabecera sigue igual", () => {
    for (const s of ['title="Editar contacto"', "<PestanasDelChat", "<MenuDeLlamada", "{macrosMenu}", "{lifecycleButton}", "Sin sesión CRM sincronizada"]) {
      assert.ok(cabecera.includes(s), `la cabecera perdió «${s}»`);
    }
  });
}
