/**
 * El invariante que este banco protege, en una linea:
 *
 *   **La pagina y sus tarjetas contestan a la MISMA pregunta.**
 *
 * De donde sale: `/panel/analytics` dejaba entrar a una cuenta administradora
 * (`isAdminLike` de la cuenta que manda) y las tres tarjetas internas
 * —Renovacion mensual, Actividad de instancias y Rendimiento de Chats— tenian
 * su propia condicion, `isSuperAdmin`, escrita tres veces. La pantalla se
 * pintaba entera y salia a trozos: ni «Acceso Denegado» ni error, solo huecos.
 *
 * Aqui corre la funcion REAL, con una base de mentira debajo: lo que se prueba
 * es la decision, no Prisma.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 * ver la cabecera de `quien-manda-en-un-cliente.test.mjs` — el mismo
 * procedimiento, con `lib/analitica-de-la-casa.ts` en la lista de ficheros.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");

// La base de mentira: `cuentaQueManda` solo pregunta por la fila de una cuenta.
fs.writeFileSync(path.join(compilado, "db.js"), `
export const mundo = { cuentas: [] };
export function ponerElMundo(m) { mundo.cuentas = m.cuentas ?? []; }
export const db = {
    user: { findUnique: async ({ where }) => mundo.cuentas.find((c) => c.id === where.id) ?? null },
    $queryRaw: () => Object.assign(Promise.resolve([]), { catch: () => Promise.resolve([]) }),
};
`);

const { ponerElMundo } = await import("./.compilado/db.js");
const { puedeVerLaAnaliticaDeLaCasa, mandaEnLaCasa } = await import(
    "./.compilado/analitica-de-la-casa.js"
);

/** Quien mira, tal como lo devuelve `currentUser()` desde cada cuenta. */
const cuentaPropia = (id, role) => ({ id, role, rolDeLaPersona: role });
/** Alguien del equipo de una cuenta: su fila es `user`, su cuenta manda. */
const delEquipo = (id, cuenta, advisorRole = "administrador") => ({
    id, role: "user", rolDeLaPersona: "user", ownerId: cuenta, advisorRole,
});

// ── Lo que se abre ──────────────────────────────────────────────────────────

test("EL CASO: una cuenta ADMINISTRADORA ve la Analitica completa", async () => {
    ponerElMundo({ cuentas: [] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(cuentaPropia("atencion", "admin")), true);
});

test("y el superadministrador sigue viendola, claro", async () => {
    ponerElMundo({ cuentas: [] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(cuentaPropia("grupo", "super_admin")), true);
});

test("el administrador del EQUIPO de una cuenta de la casa, tambien", async () => {
    // Su fila se crea con rol `user`: preguntando por la persona se quedaba
    // fuera. Actua por la cuenta, y la cuenta es de la casa.
    ponerElMundo({ cuentas: [{ id: "grupo", role: "super_admin" }] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(delEquipo("yair", "grupo")), true);
});

test("...y el del equipo de una cuenta ADMINISTRADORA, que es el caso real", async () => {
    // Yair en Verzay | Atencion: cuenta `admin`, persona `user`. Con la
    // condicion vieja de las tarjetas no veia ninguna de las tres.
    ponerElMundo({ cuentas: [{ id: "atencion", role: "admin" }] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(delEquipo("yair", "atencion")), true);
});

// ── Lo que sigue cerrado ────────────────────────────────────────────────────

test("CONDICION 1: usuario, afiliado y reseller siguen fuera", async () => {
    ponerElMundo({ cuentas: [] });
    for (const rol of ["user", "affiliate", "reseller"]) {
        assert.equal(
            await puedeVerLaAnaliticaDeLaCasa(cuentaPropia("cliente", rol)),
            false,
            `${rol} no puede ver la Analitica de la casa`,
        );
    }
});

test("un `agente` del equipo de la casa NO hereda el alcance", async () => {
    // Es el reparto de siempre: participa, pero no manda.
    ponerElMundo({ cuentas: [{ id: "grupo", role: "super_admin" }] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(delEquipo("ana", "grupo", "agente")), false);
});

test("el administrador del equipo de un CLIENTE tampoco", async () => {
    ponerElMundo({ cuentas: [{ id: "cliente", role: "user" }] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(delEquipo("pepe", "cliente")), false);
});

test("sin sesion, no", async () => {
    ponerElMundo({ cuentas: [] });
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(null), false);
    assert.equal(await puedeVerLaAnaliticaDeLaCasa({ role: "admin" }), false);
});

// ── La mitad pura ───────────────────────────────────────────────────────────

test("mandaEnLaCasa: los dos roles de la casa, y solo esos", () => {
    assert.equal(mandaEnLaCasa(false, "admin"), true);
    assert.equal(mandaEnLaCasa(false, "super_admin"), true);
    assert.equal(mandaEnLaCasa(false, "reseller"), false);
    assert.equal(mandaEnLaCasa(false, "affiliate"), false);
    assert.equal(mandaEnLaCasa(false, "user"), false);
    assert.equal(mandaEnLaCasa(false, null), false);
    assert.equal(mandaEnLaCasa(false, "inventado"), false);
});

test("mandaEnLaCasa: el super admin de verdad pasa por encima de la cuenta", () => {
    // Metido en la cuenta de un cliente con «Ingresar», su fila efectiva es
    // `user`; su rol real viaja en `rolDeLaPersona`.
    assert.equal(mandaEnLaCasa(true, "user"), true);
});

// ── «Ingresar» en la cuenta de un cliente ───────────────────────────────────

test("EL CASO: con «Ingresar» en una cuenta de cliente se ve lo que ve EL", async () => {
    // La fila efectiva es la del cliente (`role: user`) y el rol propio viaja
    // en `rolDeLaPersona`. Dentro de una cuenta ajena ese rol NO cuenta: se
    // entra para ver su pantalla, no para verla con poderes.
    ponerElMundo({ cuentas: [{ id: "cliente", role: "user" }] });
    const metido = {
        id: "cliente", role: "user", rolDeLaPersona: "super_admin",
        porImpersonacion: true,
    };
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(metido), false);
});

test("...y con el CONMUTADOR de cuentas vinculadas sigue contando", async () => {
    // Es la otra mitad, y es la que no se puede romper: cambiar a una cuenta
    // propia del equipo no es entrar en la de un cliente.
    ponerElMundo({ cuentas: [{ id: "cliente", role: "user" }] });
    const conmutado = {
        id: "cliente", role: "user", rolDeLaPersona: "super_admin",
        porImpersonacion: false,
    };
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(conmutado), true);
});

test("«Ingresar» en una cuenta de la CASA sí enseña la Analítica de la casa", async () => {
    // Porque es lo que ve esa cuenta: el criterio es el rol de la cuenta en la
    // que se está, no quién entró.
    ponerElMundo({ cuentas: [{ id: "atencion", role: "admin" }] });
    const metido = {
        id: "atencion", role: "admin", rolDeLaPersona: "super_admin",
        porImpersonacion: true,
    };
    assert.equal(await puedeVerLaAnaliticaDeLaCasa(metido), true);
});
