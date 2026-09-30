/**
 * Integrar URLs (`/integraciones`): las REGLAS y un BARRIDO del código.
 *
 * La pantalla guardaba lo que se escribiera, tal cual, y de ahí salían tres
 * fallos que no daban ningún error:
 *
 * - una dirección `javascript:` se ejecutaba al abrir la pestaña de la app en
 *   Chats (el React de Next 14 no la bloquea: solo la avisa);
 * - una sin `https://` abría la propia plataforma dentro de la pestaña (el
 *   navegador la lee como ruta relativa);
 * - el «máx. 10» que se prometía no existía.
 *
 * Además: borrar era de un clic, sin confirmar; al borrar la ÚLTIMA la
 * pantalla la volvía a pintar (leía `store.length > 0 ? store : initial`); y
 * las cuatro pastillas de arriba no filtraban nada —dos repetían el total—.
 *
 * Las reglas viven en `lib/integraciones.ts` (pura) y las usan la acción que
 * guarda, la pantalla, la pestaña de Chats, el `<iframe>` común y el menú. El
 * barrido comprueba que cada uno de esos sitios pasa por ellas: con la regla en
 * uno solo, el quinto la olvida.
 *
 * `MODO=roto` lee esos ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos. Lo prueba contra Postgres
 * `integraciones-db.test.mjs`. Se levanta con `scripts/banco-integraciones.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "ab6b110";

const PANTALLA = "app/(root)/integraciones/_components/MainIntegraciones.tsx";
const ACCIONES = "actions/user-integration-actions.ts";
const CHAT = "app/(root)/chats/_components/chat-main.tsx";
const IFRAME = "components/custom/IframeRenderer.tsx";
const MENU = "components/nav-main.tsx";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

if (ROTO) {
    test("ANTES no había reglas: lo escrito se guardaba y se abría tal cual", () => {
        assert.equal(leer("lib/integraciones.ts"), "", "lib/integraciones.ts ya existía");
        const acciones = leer(ACCIONES);
        assert.ok(acciones.length > 0, `ANTES_REF (${ANTES}) no tiene las acciones`);
        // Se creaba con lo que llegara del navegador, sin mirarlo.
        assert.match(acciones, /data: \{ userId: user\.id, name: data\.name, url: data\.url, order: count \}/);
        // Ni tope, ni nombre repetido, ni dirección válida.
        assert.doesNotMatch(acciones, /TOPE|yaExiste|javascript|https/);
        // La pestaña de Chats y el enlace abrían `item.url` a pelo.
        assert.match(leer(CHAT), /<IframeRenderer url=\{intg\.url\} \/>/);
        assert.match(leer(PANTALLA), /href=\{item\.url\}/);
        assert.doesNotMatch(leer(IFRAME), /javascript|protocol|sePuedeIncrustar/);
    });

    test("ANTES borrar era de un clic, y la última borrada volvía a salir", () => {
        const pantalla = leer(PANTALLA);
        assert.doesNotMatch(pantalla, /AlertDialog/, "ya pedía confirmación");
        assert.match(pantalla, /onClick=\{handleDelete\}/);
        assert.match(pantalla, /userIntegrations\.length > 0 \? userIntegrations : initial/);
    });

    test("ANTES arriba iban cuatro pastillas que no filtraban nada, con un máximo que no existía", () => {
        const pantalla = leer(PANTALLA);
        assert.match(pantalla, /PastillasDeMetricas/);
        assert.match(pantalla, /Disponibles/);
    });
} else {
    const r = await import(path.join(RAIZ, "lib/__tests__/.compilado/integraciones/integraciones.js"));

    test("la dirección: solo webs, con https:// delante si no traía, y tal cual se escribió", () => {
        const ok = (t) => {
            const v = r.comoUrlDeIntegracion(t);
            assert.ok(v.ok, `«${t}»: ${v.motivo}`);
            return v.valor;
        };
        const no = (t, motivo) => {
            const v = r.comoUrlDeIntegracion(t);
            assert.ok(!v.ok, `«${t}» se aceptó`);
            if (motivo) assert.match(v.motivo, motivo);
        };
        assert.equal(ok("typebot.co/mi-bot"), "https://typebot.co/mi-bot");
        assert.equal(ok("  https://ejemplo.com  "), "https://ejemplo.com", "no se le pone barra al final: la fila diría otra cosa");
        assert.equal(ok("http://ejemplo.com/x?a=1"), "http://ejemplo.com/x?a=1");
        assert.equal(ok("typebot.co:8080/x"), "https://typebot.co:8080/x", "un puerto no es un esquema");
        no("javascript:alert(1)", /direcciones web/);
        no("JAVASCRIPT:alert(1)", /direcciones web/);
        no("data:text/html,<b>x</b>", /direcciones web/);
        no("mailto:hola@ejemplo.com", /direcciones web/);
        no("java\tscript:alert(1)", /espacios/);
        no("Mi Typebot", /espacios/);
        no("mitypebot", /dominio/);
        no("", /Escribe/);
        no(null, /Escribe/);
        no(`https://ejemplo.com/${"x".repeat(r.LARGO_MAXIMO_DE_LA_URL)}`, /caracteres/);
    });

    test("el nombre: sin espacios de más, con tope, y no se repite (ni con otra mayúscula ni con tilde)", () => {
        assert.deepEqual(r.comoNombreDeIntegracion("  Mi    Typebot "), { ok: true, valor: "Mi Typebot" });
        assert.equal(r.comoNombreDeIntegracion("").ok, false);
        assert.equal(r.comoNombreDeIntegracion("x".repeat(r.LARGO_MAXIMO_DEL_NOMBRE)).ok, true);
        assert.equal(r.comoNombreDeIntegracion("x".repeat(r.LARGO_MAXIMO_DEL_NOMBRE + 1)).ok, false);
        const items = [{ id: "a", name: "Cotizador" }, { id: "b", name: "Catálogo de productos" }];
        assert.equal(r.yaExisteElNombre(items, "cotizador"), true);
        assert.equal(r.yaExisteElNombre(items, "CATALOGO  de productos"), true);
        assert.equal(r.yaExisteElNombre(items, "Cotizador", "a"), false, "al editar, la propia no cuenta");
        assert.equal(r.yaExisteElNombre(items, "Inventario"), false);
    });

    test("el tope es el que la pantalla promete", () => {
        assert.equal(r.TOPE_DE_INTEGRACIONES, 10);
        assert.equal(r.cabeOtra(r.TOPE_DE_INTEGRACIONES - 1), true);
        assert.equal(r.cabeOtra(r.TOPE_DE_INTEGRACIONES), false);
        assert.equal(r.cabeOtra(r.TOPE_DE_INTEGRACIONES + 3), false, "las que ya pasaban del tope se quedan, pero no caben más");
    });

    test("lo que se ABRE pasa por la misma regla: una vieja sin https:// se abre bien, una javascript: nunca", () => {
        assert.equal(r.laUrlQueSeAbre("typebot.co/bot"), "https://typebot.co/bot");
        assert.equal(r.laUrlQueSeAbre("javascript:alert(1)"), null);
        assert.equal(r.laUrlQueSeAbre("hoja de precios"), null);
        assert.equal(r.laUrlQueSeAbre(null), null);
    });

    test("el <iframe> común: webs y rutas de la casa sí; cualquier otro esquema no, se escriba como se escriba", () => {
        for (const u of ["https://ejemplo.com", "http://ejemplo.com", "/copiloto", "/canva?u=x"]) assert.equal(r.sePuedeIncrustar(u), true, u);
        for (const u of ["javascript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "", null]) {
            assert.equal(r.sePuedeIncrustar(u), false, JSON.stringify(u));
        }
    });

    test("la lista para reordenar: cadenas, sin repetir y con tope", () => {
        assert.deepEqual(r.comoListaDeIds(["a", "b", "a", 3, null, "", "c"]), ["a", "b", "c"]);
        assert.deepEqual(r.comoListaDeIds("a"), []);
        assert.equal(r.comoListaDeIds(Array.from({ length: 500 }, (_, i) => `id${i}`)).length, 200);
    });

    test("barrido: guardar, pintar, abrir en Chats, el <iframe> y el menú pasan por las reglas", () => {
        const acciones = leer(ACCIONES);
        for (const f of ["comoNombreDeIntegracion(data?.name)", "comoUrlDeIntegracion(data?.url)", "cabeOtra(actuales.length)", "yaExisteElNombre(actuales, nombre.valor)"]) {
            assert.ok(acciones.includes(f), `crear no pasa por ${f}`);
        }
        assert.match(acciones, /yaExisteElNombre\(actuales, cambios\.name, id\)/, "editar no mira el nombre repetido");
        assert.match(acciones, /db\.\$transaction\(/, "reordenar no va en una transacción");
        assert.match(acciones, /comoListaDeIds\(ids\)/);
        assert.doesNotMatch(acciones, /db\.userIntegration\.(update|delete)\(/, "update/delete a secas lanzan con una fila que ya no está");
        assert.match(leer(CHAT), /const url = laUrlQueSeAbre\(intg\.url\);/);
        assert.match(leer(IFRAME), /if \(!sePuedeIncrustar\(url\)\)/);
        assert.match(leer(MENU), /laUrlQueSeAbre\(intg\.url\)/);
        assert.match(leer(MENU), /canvaUrl === sub\.url/, "en /canva se encendían todas las apps del menú a la vez");
    });

    test("barrido: la pantalla abre lo que la regla deja, confirma antes de borrar y no vuelve a pintar la borrada", () => {
        const pantalla = leer(PANTALLA);
        assert.match(pantalla, /const abre = laUrlQueSeAbre\(item\.url\)/);
        assert.match(pantalla, /href=\{abre\}/);
        assert.doesNotMatch(pantalla, /href=\{item\.url\}/);
        assert.match(pantalla, /rel="noopener noreferrer"/);
        assert.match(pantalla, /<AlertDialogTitle>Eliminar «/, "borrar no pide confirmación");
        assert.doesNotMatch(pantalla, /userIntegrations\.length > 0 \? userIntegrations : initial/, "la última borrada vuelve a salir");
        assert.match(pantalla, /const items = sembrado \? userIntegrations : initial/);
        assert.doesNotMatch(pantalla, /PastillasDeMetricas/, "vuelven las pastillas que no filtran");
        // Lo que falla vuelve a su sitio: borrar, reordenar.
        assert.match(pantalla, /setUserIntegrations\(antes\)/);
        assert.match(pantalla, /if \(buscando \|\| !over/, "con la búsqueda puesta se reordena una lista a la que le faltan filas");
    });
}
