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

test("los anchos del selector salen de sus clases", () => {
    assert.equal(R.elAnchoDelSelector(false), 2 * 88 + 6);
    assert.equal(R.elAnchoDelSelector(true), 2 * 32 + 6);
});

test("centrado en la columna cuando cabe con sus palabras", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 384 }, minimo: 76, maximo: 900 });
    assert.equal(s.compacto, false);
    assert.equal(s.izquierda + R.elAnchoDelSelector(false) / 2, 5 + 384 / 2);
});

test("si con palabras pisaría la casita, prueba solo con iconos, también centrado", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 5, ancho: 240 }, minimo: 76, maximo: 900 });
    assert.equal(s.compacto, true);
    assert.equal(s.izquierda + R.elAnchoDelSelector(true) / 2, 5 + 120);
});

test("si ni así cabe, se queda lo más cerca sin pisar nada", () => {
    const s = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 100 }, minimo: 76, maximo: 400 });
    assert.deepEqual(s, { izquierda: 76, compacto: true });
    const d = R.dondeVaElSelector({ columna: { izquierda: 0, ancho: 390 }, minimo: 76, maximo: 200 });
    assert.equal(d.izquierda + R.elAnchoDelSelector(true), 200);
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
    assert.ok(!/h-9 w-9 shrink-0 overflow-visible rounded-full/.test(leer("components/shared/NotificationCenter.tsx")), "la campana no es una píldora");
});
