/**
 * El invariante que este banco protege, en una linea:
 *
 *   **«Empresa Demo» no es el nombre de nadie.**
 *
 * De donde sale: `User.company` nace con ese valor por defecto y casi nadie lo
 * cambia. El dialogo de permisos de Documentacion lo pintaba a secas, asi que
 * en produccion ofrecia **tres filas «Empresa Demo»** y no habia forma de
 * saber a cual de las tres cuentas se le estaba dando acceso.
 *
 * Se transpila y se corre igual que los demas:
 *
 *   npx tsc lib/nombre-de-la-cuenta.ts --outDir lib/__tests__/.compilado \
 *     --module esnext --target es2022 --moduleResolution bundler
 *   node --test lib/__tests__/nombre-de-la-cuenta.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const { nombreDeLaCuenta, EMPRESA_POR_DEFECTO } = await import(
    path.join(compilado, "nombre-de-la-cuenta.js")
);

test("el caso de produccion: tres cuentas ya NO se llaman igual", () => {
    const familia = [
        { company: EMPRESA_POR_DEFECTO, name: "Verzay | Atencion", email: "a@x.com" },
        { company: EMPRESA_POR_DEFECTO, name: "Verzay Ventas", email: "v@x.com" },
        { company: EMPRESA_POR_DEFECTO, name: "Verzay | Notificaciones", email: "n@x.com" },
    ];
    const etiquetas = familia.map(nombreDeLaCuenta);
    assert.deepEqual(etiquetas, ["Verzay | Atencion", "Verzay Ventas", "Verzay | Notificaciones"]);
    assert.equal(new Set(etiquetas).size, 3);
});

test("y con la regla vieja se llamaban las tres igual", () => {
    // El modo roto, para que se vea que el banco caza la causa y no otra cosa.
    const vieja = (c) => c.company || c.name || c.email;
    const familia = [
        { company: EMPRESA_POR_DEFECTO, name: "Verzay | Atencion", email: "a@x.com" },
        { company: EMPRESA_POR_DEFECTO, name: "Verzay Ventas", email: "v@x.com" },
    ];
    assert.equal(new Set(familia.map(vieja)).size, 1);
});

test("una empresa de verdad manda sobre el nombre de la persona", () => {
    assert.equal(
        nombreDeLaCuenta({ company: "Acme SAS", name: "Juan Perez", email: "j@acme.com" }),
        "Acme SAS",
    );
});

test("sin empresa y sin nombre queda el correo, que siempre esta", () => {
    assert.equal(nombreDeLaCuenta({ company: "", name: null, email: "solo@x.com" }), "solo@x.com");
    assert.equal(
        nombreDeLaCuenta({ company: EMPRESA_POR_DEFECTO, name: "  ", email: "solo@x.com" }),
        "solo@x.com",
    );
});

test("los espacios no cuentan como valor", () => {
    assert.equal(nombreDeLaCuenta({ company: "   ", name: "Nombre", email: "e@x.com" }), "Nombre");
});

test("faltando campos no revienta", () => {
    assert.equal(nombreDeLaCuenta({}), "");
    assert.equal(nombreDeLaCuenta({ email: "e@x.com" }), "e@x.com");
});
