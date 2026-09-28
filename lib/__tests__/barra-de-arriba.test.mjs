/**
 * La regla de dónde va el selector Chats ⇄ Correos, y un barrido del código de
 * la barra. Sin navegador.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const R = await import("./.compilado/barra-de-arriba/alternar-bandejas.mjs");

test("los anchos del selector salen de sus pestañas", () => {
    assert.equal(R.ANCHO_MINIMO_DEL_SELECTOR, 2 * 36 + 6);
    assert.equal(R.ANCHO_CON_PALABRAS, 2 * 88 + 6);
    assert.equal(R.ANCHO_MAXIMO_DEL_SELECTOR, 2 * 124 + 6);
    assert.equal(R.HUECO_DE_LA_BARRA_PX, 8, "el hueco es el `gap-2` de la barra");
});

// La columna de verdad a 1440/1280 (24rem) y a 1024 (22rem), desde el borde
// del contenido (relleno + borde = 5 px); el menú acaba en 76 y el hueco es 8.
for (const [ventana, col] of [["1440", 384], ["1024", 352]]) {
    test(`${ventana}: a un hueco del menú Y centrado en la columna, a la vez`, () => {
        const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: col }, minimo: 84, maximo: 900 });
        assert.equal(s.izquierda, 84, "arranca a un hueco del menú, el mismo que casita→menú");
        assert.equal(s.izquierda + s.ancho / 2, 5 + col / 2, "su centro es el de la columna");
        assert.equal(s.centrado, true);
        assert.equal(s.compacto, false, "con sus palabras");
    });
}

test("con una columna estrecha sigue simétrico, pero solo con iconos", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 288 }, minimo: 84, maximo: 900 });
    assert.equal(s.izquierda, 84);
    assert.equal(s.izquierda + s.ancho / 2, 5 + 144);
    assert.equal(s.compacto, true);
});

test("si centrado se saldría por la derecha, conserva el hueco del menú y se acorta", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 390 }, minimo: 84, maximo: 242 });
    assert.equal(s.izquierda, 84);
    assert.ok(s.izquierda + s.ancho <= 242);
    assert.equal(s.centrado, false);
});

test("nunca más estrecho que dos iconos, ni más ancho que su tope", () => {
    const n = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 100 }, minimo: 84, maximo: 900 });
    assert.equal(n.ancho, R.ANCHO_MINIMO_DEL_SELECTOR);
    assert.equal(n.izquierda, 84);
    const w = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 1200 }, minimo: 84, maximo: 2000 });
    assert.equal(w.ancho, R.ANCHO_MAXIMO_DEL_SELECTOR);
    assert.equal(w.izquierda + w.ancho / 2, 600, "con una columna enorme, centrado");
});

const quitar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (r) => quitar(fs.readFileSync(join(RAIZ, r), "utf8"));

test(ROTO ? "(se salta en modo roto: el barrido lee el árbol de hoy)" : "barrido: sin migas, casita primero, sin píldoras", { skip: ROTO }, () => {
    const barra = leer("components/custom/Breadcrumbs.tsx");
    assert.ok(!/BreadcrumbList|BreadcrumbItem|BreadcrumbSeparator/.test(barra), "la barra ya no pinta migas");
    const casa = barra.indexOf("data-casita");
    const menu = barra.indexOf("<SidebarTrigger");
    const selector = barra.indexOf("<AlternarBandeja");
    assert.ok(casa > 0 && casa < menu && menu < selector, "casita, menú y selector, en ese orden");
    assert.ok(!leer("components/shared/AlternarBandeja.tsx").includes("rounded-full"), "el selector no es una píldora");
    const campana = leer("components/shared/NotificationCenter.tsx").match(/aria-label="Centro de notificaciones"/);
    assert.ok(campana, "la campana sigue ahí");
    assert.match(barra, /data-inicio-de-la-barra className="[^"]*\bgap-2\b/, "casita y menú a `gap-2`, el HUECO_DE_LA_BARRA_PX");
    const sel = leer("components/shared/AlternarBandeja.tsx");
    assert.match(sel, /HUECO_PX = HUECO_DE_LA_BARRA_PX/, "el selector usa el mismo hueco");
    assert.match(sel, /\bh-9\b/, "el selector mide lo que los botones de la derecha");
    assert.ok(!/h-9 w-9 shrink-0 overflow-visible rounded-full/.test(leer("components/shared/NotificationCenter.tsx")), "la campana no es una píldora");
});
