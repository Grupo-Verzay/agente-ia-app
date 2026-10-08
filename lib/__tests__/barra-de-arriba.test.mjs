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
    assert.equal(R.ANCHO_CON_PALABRAS, 2 * 116 + 6, "icono, palabra y su número «99+»");
    assert.equal(R.ANCHO_MAXIMO_DEL_SELECTOR, 2 * 160 + 6);
    assert.equal(R.HUECO_DE_LA_BARRA_PX, 8, "el hueco es el `gap-2` de la barra");
});

// La columna de verdad a 1440/1280 (24rem) y a 1024 (22rem), desde el borde
// del contenido (relleno + borde = 5 px); sin casita, el menú acaba en 44 y el
// hueco es 8.
for (const [ventana, col] of [["1440", 384], ["1024", 352]]) {
    test(`${ventana}: a un hueco del menú Y centrado en la columna, a la vez`, () => {
        const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: col }, minimo: 52, maximo: 900 });
        assert.equal(s.izquierda, 52, "arranca a un hueco del menú, el mismo de los botones de la derecha");
        assert.equal(s.izquierda + s.ancho / 2, 5 + col / 2, "su centro es el de la columna");
        assert.equal(s.centrado, true);
        assert.equal(s.compacto, false, "con sus palabras");
    });
}

test("con una columna estrecha sigue simétrico, pero solo con iconos", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 288 }, minimo: 52, maximo: 900 });
    assert.equal(s.izquierda, 52);
    assert.equal(s.izquierda + s.ancho / 2, 5 + 144);
    assert.equal(s.compacto, true);
});

test("reservar la casita del Panel NO corre el selector: su centro sigue en el de la columna", () => {
    for (const col of [288, 352, 384]) {
        const sin = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: col }, minimo: 52, maximo: 900 });
        const con = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: col }, minimo: 52, maximo: 900 - 44 });
        assert.equal(con.izquierda, sin.izquierda, `columna ${col}`);
        assert.equal(con.ancho, sin.ancho, `columna ${col}`);
    }
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

test("el número de cada bandeja es el del menú lateral: sin cero, sin «no se sabe», con «99+»", async () => {
    const M = await import("./.compilado/barra-de-arriba/pendientes-del-menu.mjs");
    for (const b of R.BANDEJAS) {
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 3 }), "3", b.clave);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 0 }), null);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: null }), null);
        assert.equal(M.elTextoDelContador(b.ruta, { [b.clave]: 250 }), "99+");
    }
});

test(ROTO ? "(se salta en modo roto: el barrido lee el árbol de hoy)" : "barrido: sin migas, menú primero, la casita del Panel dentro del selector, sin píldoras", { skip: ROTO }, () => {
    const barra = leer("components/custom/Breadcrumbs.tsx");
    assert.ok(!/BreadcrumbList|BreadcrumbItem|BreadcrumbSeparator/.test(barra), "la barra ya no pinta migas");
    assert.ok(!/data-casita|HomeIcon|href="\/"/.test(barra), "la barra no pinta la casita de inicio");
    const alt = leer("components/shared/AlternarBandeja.tsx");
    assert.ok(/data-boton-del-panel/.test(alt) && /esVarianteDePanel/.test(alt), "la casita del Panel vive en el selector");
    const menu = barra.indexOf("<SidebarTrigger");
    const selector = barra.indexOf("<AlternarBandeja");
    assert.ok(menu > 0 && menu < selector, "menú y selector, en ese orden");
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
