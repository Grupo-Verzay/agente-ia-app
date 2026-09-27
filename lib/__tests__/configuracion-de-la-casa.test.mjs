/**
 * La mitad sin base del banco de la configuración de la plataforma:
 *
 *  - las reglas puras (quién es de la casa, qué se asigna a un reseller, qué
 *    alcanza el selector, qué número se guarda);
 *  - un BARRIDO del código: cada acción exportada de los ficheros de la casa
 *    llama a la puerta, o está en la lista de abiertas CON su motivo.
 *
 * El barrido es lo que caza la próxima: el fallo de esta familia no es una
 * puerta mal escrita, es una hermana a la que se le olvida.
 *
 * En `MODO=roto` el barrido lee los ficheros del commit de ANTES (`ANTES_REF`,
 * con `git show`) y AFIRMA que había acciones sin puerta.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "22bd5bf";
const puro = await import("./.compilado/casa-puro/puro.js");

// ── Reglas puras ────────────────────────────────────────────────────────────

test("mandaEnLaCasa: admin y super_admin de la cuenta, o el súper admin de verdad", { skip: ROTO }, () => {
    assert.equal(puro.mandaEnLaCasa(false, "admin"), true);
    assert.equal(puro.mandaEnLaCasa(false, "super_admin"), true);
    for (const r of ["user", "reseller", "affiliate", null, "inventado"]) {
        assert.equal(puro.mandaEnLaCasa(false, r), false, String(r));
    }
    assert.equal(puro.mandaEnLaCasa(true, "user"), true);
});

const cliente = (extra = {}) => ({
    id: "c", role: "user", ownerId: null, deletedAt: null, demoResellerId: null, resellersAsignados: [], ...extra,
});

test("un cliente libre se asigna; uno de otro reseller, por cualquier camino, NO", { skip: ROTO }, () => {
    assert.deepEqual(puro.puedeAsignarseAlReseller(cliente(), "A"), { ok: true });
    for (const c of [
        cliente({ resellersAsignados: ["B"] }),
        cliente({ demoResellerId: "B" }),
        cliente({ resellersAsignados: ["A"] }),
        cliente({ demoResellerId: "A" }),
    ]) {
        assert.equal(puro.puedeAsignarseAlReseller(c, "A").ok, false, JSON.stringify(c));
    }
});

test("no se asigna lo que no es un cliente", { skip: ROTO }, () => {
    for (const c of [
        null,
        cliente({ role: "reseller" }),
        cliente({ role: "admin" }),
        cliente({ ownerId: "otra" }),
        cliente({ deletedAt: new Date() }),
        cliente({ id: "A" }),
    ]) {
        assert.equal(puro.puedeAsignarseAlReseller(c, "A").ok, false, JSON.stringify(c));
    }
});

test("«sin asignar» y «se puede asignar» dicen lo mismo", { skip: ROTO }, () => {
    const casos = [
        cliente(), cliente({ demoResellerId: "B" }), cliente({ resellersAsignados: ["B"] }),
        cliente({ ownerId: "x" }), cliente({ deletedAt: "2026-01-01" }), cliente({ role: "reseller" }),
    ];
    for (const c of casos) {
        assert.equal(puro.estaSinAsignar(c), puro.puedeAsignarseAlReseller(c, "Z").ok, JSON.stringify(c));
    }
});

test("la ficha lleva cuatro campos y nada más", { skip: ROTO }, () => {
    const f = puro.comoFicha({ id: "u", name: "n", email: "e", company: "c", password: "$2a$x", apiKeyId: "k" });
    assert.deepEqual(Object.keys(f).sort(), ["company", "email", "id", "name"]);
    assert.deepEqual(Object.keys(puro.CAMPOS_DE_LA_FICHA).sort(), ["company", "email", "id", "name"]);
});

test("el selector: la casa la plataforma, un reseller su cartera, los demás nada", { skip: ROTO }, () => {
    assert.equal(puro.queAlcanzaElSelector({ esDeLaCasa: true, rolDeLaCuenta: "reseller" }), "plataforma");
    assert.equal(puro.queAlcanzaElSelector({ esDeLaCasa: false, rolDeLaCuenta: "reseller" }), "cartera");
    for (const r of ["user", "affiliate", null]) {
        assert.equal(puro.queAlcanzaElSelector({ esDeLaCasa: false, rolDeLaCuenta: r }), "nada");
    }
});

test("números de configuración: lo que no es un número no se sustituye por otro", { skip: ROTO }, () => {
    assert.equal(puro.comoNumeroNoNegativo(0), 0);
    assert.equal(puro.comoNumeroNoNegativo("12.5"), 12.5);
    for (const v of [NaN, -1, Infinity, "x", null, undefined, ""]) {
        assert.equal(puro.comoNumeroNoNegativo(v), null, String(v));
    }
    assert.equal(puro.comoEnteroNoNegativo(3), 3);
    assert.equal(puro.comoEnteroNoNegativo(3.5), null);
});

// ── El barrido ──────────────────────────────────────────────────────────────

/**
 * Las acciones de la casa y su puerta. Un fichero, sus acciones, y las que se
 * quedan abiertas con el motivo escrito al lado (un motivo vacío falla).
 */
const FICHEROS = {
    "actions/subscription-plan-actions.ts": {
        puertas: [/quienMandaEnLaCasa\(/, /mandaEnLaCasaDeVerdad\(/],
        abiertas: {
            getActiveSubscriptionPlans: "precio de venta: lo abren la landing pública y /planes",
            getActiveResellerAccessPlans: "precio de venta: lo abre la página pública de resellers",
            getPlanLabelsForMyBrand: "solo resuelve la marca de quien llama, por su sesión",
        },
    },
    "actions/payment-method-config-actions.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        abiertas: { getActivePaymentMethodConfigs: "dónde paga un cliente: solo lo activo" },
    },
    "actions/plan-detail-actions.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        abiertas: {
            getPlanDetailBySubscriptionPlanId: "la ficha de venta es pública (landing)",
            getPlanDetailBySlug: "la ficha de venta es pública (landing)",
        },
    },
    "actions/reseller-action.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        abiertas: { getResellerProfileForUser: "marca pública de /schedule y /bookings, sin sesión" },
    },
};

// Ficheros donde solo se barren ALGUNAS acciones: el resto son del reseller o
// del cliente y tienen su propia puerta.
const PARCIALES = {
    "actions/reseller-license-actions.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        acciones: ["getResellersWithPools", "assignLicenses", "migrateLegacyClientsToPool",
            "deleteLicensePool", "updateDemoLimit", "reconcileResellerLicenses"],
    },
    "actions/actions-ia-credits.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        acciones: ["getAllPlanConfigs", "updatePlanConfigAction"],
    },
    "actions/reseller-plan-actions.ts": {
        puertas: [/quienMandaEnLaCasa\(/],
        acciones: ["adminUpdateResellerProfile"],
    },
};

function leer(fichero) {
    if (!ROTO) return readFileSync(fichero, "utf8");
    return execFileSync("git", ["show", `${ANTES}:${fichero}`], { encoding: "utf8" });
}

/** Trozo de cada acción: de su `export` al `export` siguiente. */
function lasAcciones(codigo) {
    const re = /export (?:async function|const) (\w+)/g;
    const marcas = [...codigo.matchAll(re)].map((m) => ({ nombre: m[1], desde: m.index }));
    return marcas.map((m, i) => ({
        nombre: m.nombre,
        cuerpo: codigo.slice(m.desde, marcas[i + 1]?.desde ?? codigo.length),
    }));
}

function sinPuerta() {
    const faltan = [];
    for (const [fichero, conf] of Object.entries(FICHEROS)) {
        for (const a of lasAcciones(leer(fichero))) {
            if (a.nombre in conf.abiertas) continue;
            if (!conf.puertas.some((p) => p.test(a.cuerpo))) faltan.push(`${fichero}: ${a.nombre}`);
        }
    }
    for (const [fichero, conf] of Object.entries(PARCIALES)) {
        const acciones = lasAcciones(leer(fichero));
        for (const n of conf.acciones) {
            const a = acciones.find((x) => x.nombre === n);
            if (!a || !conf.puertas.some((p) => p.test(a.cuerpo))) faltan.push(`${fichero}: ${n}`);
        }
    }
    return faltan;
}

test("cada lista de abiertas lleva su motivo escrito", () => {
    for (const conf of Object.values(FICHEROS)) {
        for (const [n, motivo] of Object.entries(conf.abiertas)) {
            assert.ok(String(motivo).trim().length > 10, `${n}: sin motivo`);
        }
    }
});

test("EL BARRIDO: toda acción de la casa pasa por su puerta", () => {
    const faltan = sinPuerta();
    if (ROTO) {
        assert.ok(faltan.length >= 10, `antes: ${faltan.length} acciones sin puerta`);
        assert.ok(faltan.some((f) => f.endsWith("upsertSubscriptionPlan")));
        assert.ok(faltan.some((f) => f.endsWith("savePaymentMethodConfig")));
        assert.ok(faltan.some((f) => f.endsWith("getResellersWithPools")));
        return;
    }
    assert.deepEqual(faltan, []);
});

test("las páginas de la casa preguntan con la MISMA puerta que sus acciones", { skip: ROTO }, () => {
    const paginas = [
        "app/(root)/(protected)/admin/planes/page.tsx", "app/(root)/(protected)/panel/planes/page.tsx",
        "app/(root)/(protected)/admin/pagos/page.tsx", "app/(root)/(protected)/panel/pagos/page.tsx",
        "app/(root)/(protected)/admin/reseller/page.tsx", "app/(root)/(protected)/panel/reseller/page.tsx",
        "app/(root)/(protected)/admin/credits/page.tsx",
    ];
    for (const p of paginas) {
        assert.match(readFileSync(p, "utf8"), /mandaEnLaCasaDeVerdad\(/, p);
    }
});

test("a la pantalla de Resellers no le llega la fila entera de `User`", () => {
    const paginas = ["app/(root)/(protected)/admin/reseller/page.tsx", "app/(root)/(protected)/panel/reseller/page.tsx"];
    const conSelect = paginas.map((p) => /select:\s*CAMPOS_DE_LA_FICHA/.test(leer(p)));
    if (ROTO) {
        assert.ok(conSelect.every((x) => !x), "antes: la lista de resellers iba entera");
        return;
    }
    assert.ok(conSelect.every(Boolean));
});
