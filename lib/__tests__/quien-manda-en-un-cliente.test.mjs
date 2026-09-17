/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Una cuenta vinculada no manda sobre la cuenta de la que cuelga.**
 *
 * De donde sale: Verzay | Atencion cuelga de Grupo Verzay y tiene rol de
 * plataforma `admin`. El listado de Clientes trae a todo el que no tenga
 * `ownerId`, asi que le devolvia **a su propia madre**; y con la fila delante,
 * `puedeGestionarAlCliente` decia que si —porque `isAdminLike(cuenta.role)`
 * pasaba— y se podia editar, degradar o eliminar.
 *
 * Aqui corren las funciones REALES de `lib/gestion-de-clientes.ts`, con una
 * base de mentira debajo: lo que se prueba es la decision, no Prisma.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc -p <tsconfig con lib/gestion-de-clientes.ts y sus dependencias>
 *
 * y despues, sobre lo emitido: quitar `import "server-only"`, apuntar `@/lib/x`
 * a `./x.js` y `react` a `./shim-react.js` (React 18 no exporta `cache` fuera
 * de Next). El fichero `.compilado/db.js` lo escribe ESTE banco, justo abajo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");

// La base de mentira. Solo contesta a las tres cosas que estas funciones
// preguntan: la fila de una cuenta, si un cliente es de un reseller, y de que
// cuentas cuelga una.
fs.writeFileSync(path.join(compilado, "db.js"), `
export const mundo = { cuentas: [], vinculos: [], delReseller: [] };
export function ponerElMundo(m) {
    mundo.cuentas = m.cuentas ?? [];
    mundo.vinculos = m.vinculos ?? [];
    mundo.delReseller = m.delReseller ?? [];
}
export const db = {
    user: {
        findUnique: async ({ where }) => mundo.cuentas.find((c) => c.id === where.id) ?? null,
        findFirst: async ({ where }) => {
            const dueno = mundo.vinculos.find((v) => false);
            const suyo = mundo.delReseller.find(
                (r) => r.cliente === where.id && where.OR.some((o) => o.demoResellerId === r.reseller
                    || o.reseller_reseller_userIdToUser?.some?.resellerid === r.reseller),
            );
            return suyo ? { id: where.id } : null;
        },
    },
    $queryRaw: (trozos, ...valores) => {
        const sql = trozos.join("?");
        if (sql.includes('master_user_id" AS id')) {
            const cuenta = valores[0];
            const madres = mundo.vinculos.filter((v) => v.hija === cuenta).map((v) => ({ id: v.madre }));
            const fila = mundo.cuentas.find((c) => c.id === cuenta);
            if (fila?.ownerId) madres.push({ id: fila.ownerId });
            return Object.assign(Promise.resolve(madres), { catch: () => Promise.resolve(madres) });
        }
        return Object.assign(Promise.resolve([]), { catch: () => Promise.resolve([]) });
    },
};
`);

const { ponerElMundo } = await import("./.compilado/db.js");
const {
    puedeGestionarAlCliente,
    cuentasDeLasQueCuelga,
    rolConElQueReparte,
    elRolQueSePuedeGuardar,
    elRolConElQueNace,
} = await import("./.compilado/gestion-de-clientes.js");

/** Las dos cuentas del caso real, tal como estan hoy en produccion. */
const GRUPO_VERZAY = { id: "grupo", role: "super_admin" };
const ATENCION = { id: "atencion", role: "admin" };
const UN_CLIENTE = { id: "cliente", role: "user" };

const elMundoDeVerzay = () =>
    ponerElMundo({
        cuentas: [GRUPO_VERZAY, ATENCION, UN_CLIENTE],
        // Atencion CUELGA de Grupo Verzay.
        vinculos: [{ madre: "grupo", hija: "atencion" }],
    });

/** Quien mira, tal como lo devuelve `currentUser()` desde esa cuenta. */
const comoAtencion = { id: "atencion", role: "admin", rolDeLaPersona: "user" };
const comoGrupoVerzay = { id: "grupo", role: "super_admin", rolDeLaPersona: "super_admin" };

test("EL CASO: la cuenta vinculada NO puede editar a su duena", async () => {
    elMundoDeVerzay();
    assert.deepEqual(await cuentasDeLasQueCuelga("atencion"), ["grupo"]);
    assert.equal(await puedeGestionarAlCliente(comoAtencion, "grupo"), false);
});

test("...y eso NO le cierra el resto de la pantalla", async () => {
    elMundoDeVerzay();
    assert.equal(await puedeGestionarAlCliente(comoAtencion, "cliente"), true);
});

test("la direccion importa: la duena SI manda sobre la vinculada", async () => {
    elMundoDeVerzay();
    assert.equal(await puedeGestionarAlCliente(comoGrupoVerzay, "atencion"), true);
});

test("el super administrador de verdad no se filtra, este donde este", async () => {
    // Metido en la cuenta de un cliente con «Ingresar»: su fila efectiva es la
    // del cliente y su rol real viaja en `rolDeLaPersona`.
    ponerElMundo({ cuentas: [UN_CLIENTE, GRUPO_VERZAY], vinculos: [{ madre: "grupo", hija: "cliente" }] });
    const metido = { id: "cliente", role: "user", rolDeLaPersona: "super_admin" };
    assert.equal(await puedeGestionarAlCliente(metido, "grupo"), true);
});

test("tambien cuelga por `owner_id`, no solo por linked_accounts", async () => {
    ponerElMundo({ cuentas: [{ id: "equipo", role: "admin", ownerId: "grupo" }, GRUPO_VERZAY] });
    assert.deepEqual(await cuentasDeLasQueCuelga("equipo"), ["grupo"]);
});

test("con que rol reparte cada uno", async () => {
    elMundoDeVerzay();
    assert.equal(await rolConElQueReparte(comoAtencion), "admin");
    assert.equal(await rolConElQueReparte(comoGrupoVerzay), "super_admin");
});

test("EL CASO: un administrador asignando «Administrador» -> rechazado", async () => {
    elMundoDeVerzay();
    const v = await elRolQueSePuedeGuardar(comoAtencion, "admin", "user");
    assert.equal(v.ok, false);
    assert.match(v.motivo, /súper administrador/);
});

test("EL CASO: un administrador asignando «Super administrador» -> rechazado", async () => {
    elMundoDeVerzay();
    const v = await elRolQueSePuedeGuardar(comoAtencion, "super_admin", "user");
    assert.equal(v.ok, false);
});

test("y creando de cero tampoco", async () => {
    elMundoDeVerzay();
    assert.equal((await elRolConElQueNace(comoAtencion, "super_admin")).ok, false);
    assert.deepEqual(await elRolConElQueNace(comoAtencion, "reseller"), { ok: true, rol: "reseller" });
    // Lo que no venga, o venga inventado, nace `user`.
    assert.deepEqual(await elRolConElQueNace(comoAtencion, ""), { ok: true, rol: "user" });
    assert.deepEqual(await elRolConElQueNace(comoAtencion, "dueño"), { ok: true, rol: "user" });
});

test("el rol que NO cambia no se toca, y no bloquea el resto del guardado", async () => {
    elMundoDeVerzay();
    // El formulario de edicion manda el rol SIEMPRE. Sin esta salida, un admin
    // no podria guardarle el telefono a una cuenta con rol superior.
    assert.deepEqual(
        await elRolQueSePuedeGuardar(comoAtencion, "super_admin", "super_admin"),
        { ok: true, rol: undefined },
    );
    assert.deepEqual(
        await elRolQueSePuedeGuardar(comoAtencion, undefined, "user"),
        { ok: true, rol: undefined },
    );
});

test("lo que si deja pasar: mover a un cliente por debajo suyo", async () => {
    elMundoDeVerzay();
    assert.deepEqual(
        await elRolQueSePuedeGuardar(comoAtencion, "reseller", "user"),
        { ok: true, rol: "reseller" },
    );
});

test("el super administrador si reparte «Super administrador»", async () => {
    elMundoDeVerzay();
    assert.deepEqual(
        await elRolQueSePuedeGuardar(comoGrupoVerzay, "super_admin", "user"),
        { ok: true, rol: "super_admin" },
    );
});
