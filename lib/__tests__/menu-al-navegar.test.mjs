/**
 * El menú lateral se COMPRIME al entrar a cualquier sección — la regla pura.
 *
 * Antes lo hacía solo Chats. La decisión vive en `lib/menu-al-navegar.ts` y la
 * aplica una sola pieza en el layout (`ComprimirMenuAlNavegar`). El barrido de
 * abajo comprueba que esa pieza está montada DENTRO del `SidebarProvider`: sin
 * él, `useSidebar` revienta y el layout entero se cae.
 *
 * `MODO=roto` corre la regla de ANTES —comprimir solo en Chats— y AFIRMA el
 * fallo: entrar a Correo, Panel o CRM dejaba el menú abierto.
 *
 * Se levanta con `scripts/banco-menu-al-navegar.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as nuevo from "./.compilado/menu-al-navegar/menu-al-navegar.js";

const ROTO = process.env.MODO === "roto";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// La regla de antes: el menú solo se cerraba en Chats (al abrir un chat).
const antes = {
  debeComprimirse: ({ actual, esMovil, abierto }) =>
    !esMovil && abierto && typeof actual === "string" && actual.startsWith("/chats"),
};
const regla = ROTO ? antes : nuevo;

const SECCIONES = ["/chats", "/correo", "/panel", "/panel/clientes", "/sessions", "/herramientas", "/crm/llamadas", "/embudos", "/documentos"];

for (const ruta of SECCIONES) {
  test(`entrar a ${ruta} con el menú abierto lo comprime`, () => {
    const r = regla.debeComprimirse({ anterior: "/", actual: ruta, esMovil: false, abierto: true });
    if (ROTO && ruta !== "/chats") assert.equal(r, false, "el fallo: antes el menú se quedaba abierto");
    else assert.equal(r, true);
  });
}

test("el primer pintado de una sección también la comprime (recargar con F5)", () => {
  const r = regla.debeComprimirse({ anterior: null, actual: "/correo", esMovil: false, abierto: true });
  assert.equal(r, !ROTO);
});

if (!ROTO) {
  test("la portada no es una sección: no se toca", () => {
    assert.equal(nuevo.esUnaSeccion("/"), false);
    assert.equal(nuevo.esUnaSeccion(""), false);
    assert.equal(nuevo.esUnaSeccion(null), false);
    assert.equal(nuevo.debeComprimirse({ anterior: "/correo", actual: "/", esMovil: false, abierto: true }), false);
  });

  test("sin cambiar de ruta no se vuelve a comprimir: el menú abierto a mano se queda", () => {
    assert.equal(nuevo.debeComprimirse({ anterior: "/correo", actual: "/correo", esMovil: false, abierto: true }), false);
  });

  test("en un teléfono no se toca: allí el menú es una hoja que ya se cierra sola", () => {
    assert.equal(nuevo.debeComprimirse({ anterior: "/", actual: "/correo", esMovil: true, abierto: true }), false);
  });

  test("ya comprimido no hay nada que hacer (no se reescribe la cookie)", () => {
    assert.equal(nuevo.debeComprimirse({ anterior: "/", actual: "/correo", esMovil: false, abierto: false }), false);
  });

  test("barrido: la pieza va montada una vez, DENTRO del SidebarProvider del layout", () => {
    const s = fs.readFileSync(join(RAIZ, "app/(root)/layout.tsx"), "utf8");
    const abre = s.indexOf("<SidebarProvider");
    const cierra = s.indexOf("</SidebarProvider>");
    const pieza = s.indexOf("<ComprimirMenuAlNavegar");
    assert.ok(abre >= 0 && cierra > abre, "no se encontró el SidebarProvider");
    assert.ok(pieza > abre && pieza < cierra, "ComprimirMenuAlNavegar tiene que ir dentro del SidebarProvider");
    assert.equal(s.split("<ComprimirMenuAlNavegar").length - 1, 1, "una sola vez");
  });

  test("barrido: no queda un segundo colapsador por pantalla", () => {
    assert.equal(fs.existsSync(join(RAIZ, "app/(root)/chats/_components/ChatSidebarCollapser.tsx")), false);
  });
}
