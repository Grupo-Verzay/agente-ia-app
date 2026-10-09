/**
 * La regla de dónde va el selector Chats ⇄ Correos ⇄ Llamadas, y un barrido del código de
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

test("los anchos del selector salen de sus pestañas (Chats, Correos y Llamadas)", () => {
    assert.equal(R.BANDEJAS.length, 3);
    assert.equal(R.ANCHO_MINIMO_DEL_SELECTOR, 3 * 36 + 6);
    assert.equal(R.ANCHO_CON_PALABRAS, 3 * 116 + 6, "icono, palabra y su número «99+»");
    assert.equal(R.ANCHO_MAXIMO_DEL_SELECTOR, 3 * 160 + 6);
    assert.equal(R.HUECO_DE_LA_BARRA_PX, 8, "el hueco es el `gap-2` de la barra");
});

// El menú acaba en 44; la casita (36) va después, con su hueco: el selector
// arranca a 44 + 8 + 36 + 8 = 96.
const INICIO = 96;
for (const [ventana, col] of [["1440", 384], ["1024", 352]]) {
    test(`${ventana}: a un hueco de la casita Y centrado en la columna, a la vez`, () => {
        const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: col }, minimo: INICIO, maximo: 900 });
        assert.equal(s.izquierda, INICIO, "arranca a un hueco de la casita");
        assert.equal(s.izquierda + s.ancho / 2, 5 + col / 2, "su centro es el de la columna");
        assert.equal(s.centrado, true);
    });
}

test("con una columna estrecha sigue simétrico, pero solo con iconos", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 288 }, minimo: INICIO, maximo: 900 });
    assert.equal(s.izquierda, INICIO);
    assert.equal(s.izquierda + s.ancho / 2, 5 + 144);
    assert.equal(s.compacto, true);
});

test("con dos pestañas (sin Llamadas) los anchos se recalculan", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 384 }, minimo: INICIO, maximo: 900, cuantas: 2 });
    assert.ok(s.ancho >= 2 * 36 + 6 && s.ancho <= 2 * 160 + 6);
});

test("si centrado se saldría por la derecha, conserva el hueco y se acorta", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 390 }, minimo: 84, maximo: 242 });
    assert.equal(s.izquierda, 84);
    assert.ok(s.izquierda + s.ancho <= 242);
    assert.equal(s.centrado, false);
});

test("nunca más estrecho que tres iconos, ni más ancho que su tope", () => {
    const n = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 100 }, minimo: 84, maximo: 900 });
    assert.equal(n.ancho, R.ANCHO_MINIMO_DEL_SELECTOR);
    assert.equal(n.izquierda, 84);
    const w = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 1200 }, minimo: 84, maximo: 2000 });
    assert.equal(w.ancho, R.ANCHO_MAXIMO_DEL_SELECTOR);
    assert.equal(w.izquierda + w.ancho / 2, 600, "con una columna enorme, centrado");
});

const quitar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (r) => quitar(fs.readFileSync(join(RAIZ, r), "utf8"));

test("el número de cada bandeja es el del menú lateral: sin cero, sin «no se sabe», con «99+»", async () => {
    const M = await import("./.compilado/barra-de-arriba/pendientes-del-menu.mjs");
    assert.equal(M.elTextoDelContador("/crm/llamadas", { llamadas: 3 }), null, "Llamadas no lleva número: es un registro");
    for (const b of R.BANDEJAS.filter((x) => x.clave !== "llamadas")) {
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 3 }), "3", b.clave);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 0 }), null);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: null }), null);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 250 }), "99+");
    }
});

test(ROTO ? "(se salta en modo roto: el barrido lee el árbol de hoy)" : "barrido: sin migas, menú primero, la casita del Panel tras el menú, sin píldoras", { skip: ROTO }, () => {
    const barra = leer("components/custom/Breadcrumbs.tsx");
    assert.ok(!/BreadcrumbList|BreadcrumbItem|BreadcrumbSeparator/.test(barra), "la barra ya no pinta migas");
    assert.ok(!/data-casita|HomeIcon|href="\/"/.test(barra), "la barra no pinta la casita de inicio");
    const alt = leer("components/shared/AlternarBandeja.tsx");
    assert.ok(/data-boton-del-panel/.test(alt) && /esVarianteDePanel/.test(alt), "la casita del Panel vive en el selector");
    const menu = barra.indexOf("<SidebarTrigger");
    const selector = barra.indexOf("<AlternarBandeja");
    assert.ok(menu > 0 && menu < selector, "menú y selector, en ese orden");
    assert.ok(/Llamadas|lasBandejasQueSeVen/.test(alt), "Llamadas sale junto a Chats y Correos");
    assert.ok(alt.indexOf("data-boton-del-panel") < alt.indexOf("data-alternar-bandeja"), "la casita va antes que las pestañas, tras las flechas del menú");
    assert.ok(!leer("components/shared/AlternarBandeja.tsx").includes("rounded-full"), "el selector no es una píldora");
    const campana = leer("components/shared/NotificationCenter.tsx").match(/aria-label="Centro de notificaciones"/);
    assert.ok(campana, "la campana sigue ahí");
    assert.match(barra, /data-botones-de-la-barra className="[^"]*\bgap-2\b/, "los botones de la derecha a `gap-2`, el HUECO_DE_LA_BARRA_PX");
    const sel = leer("components/shared/AlternarBandeja.tsx");
    assert.match(sel, /HUECO_PX = HUECO_DE_LA_BARRA_PX/, "el selector usa el mismo hueco");
    assert.match(sel, /elTextoDelContador\(/, "el número sale de la regla del menú");
    assert.match(sel, /CLASE_DEL_CONTADOR/, "y con la forma del menú");
    assert.match(sel, /useChatsQueEsperan\(\)/, "Chats: la pastilla «Sin leer»");
    assert.match(sel, /useCorreosSinLeerStore/, "Correos: el store que comparte con el menú");
    assert.match(leer("hooks/usePendientesDelMenu.ts"), /useCorreosSinLeerStore/, "el menú lee el mismo store");
    assert.match(sel, /\bh-9\b/, "el selector mide lo que los botones de la derecha");
    assert.ok(!/h-9 w-9 shrink-0 overflow-visible rounded-full/.test(leer("components/shared/NotificationCenter.tsx")), "la campana no es una píldora");
});
