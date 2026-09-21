/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Mover a alguien no puede abrirle nada que su cuenta nueva no tenga, ni
 *   dejar que lo pida quien no manda en las dos.**
 *
 * Lo de arriba tiene dos mitades y las dos son mudas si fallan:
 *
 * - Las cinco puertas de `porQueNoSePuedeMudar`. La que mas duele es la de
 *   «el destino no es una cuenta»: colgar a alguien de otra PERSONA deja una
 *   cadena de dos niveles que ninguna regla de esta casa contempla, y lo que
 *   se ve desde fuera es a alguien con la pantalla vacia.
 * - El recorte de `_UserModules`, que es donde esta la trampa: el armazon trata
 *   «cero filas» como «sin restriccion», asi que recortar a vacio NO le quita
 *   los modulos — le quita el TOPE. Eso es el modo roto de abajo.
 *
 * Aqui corren las funciones REALES de `lib/mudanza-de-persona.ts`, que no
 * importa nada.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx esbuild lib/mudanza-de-persona.ts --format=esm \
 *       --outdir=lib/__tests__/.compilado
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    PORQUE,
    comoRolDeDestino,
    laSuerteDeCadaArea,
    losModulosQueLeQuedan,
    losModulosQueSeLeDan,
    losModulosQueSeLeQuitan,
    porQueNoSePuedeMudar,
    queSeEscribe,
} = await import("./.compilado/mudanza-de-persona.js");

const ROTO = process.env.MODO === "roto";

/** La forma ingenua, escrita aqui a proposito: el cruce, y punto. */
const recorteIngenuo = (suyos, delDestino) => {
    const nueva = new Set(delDestino);
    return [...new Set(suyos)].filter((id) => nueva.has(id));
};

const PERSONA = { id: "maria", ownerId: "madre", advisorRole: "agente" };
const DESTINO = { id: "atencion", ownerId: null };

/* ─────────────────────────── Las cinco puertas ──────────────────────────── */

test("se puede mudar a alguien del equipo a una cuenta de verdad", { skip: ROTO }, () => {
    assert.equal(porQueNoSePuedeMudar(PERSONA, DESTINO), null);
});

test("una CUENTA no se muda: no es del equipo de nadie", { skip: ROTO }, () => {
    const cuenta = { id: "ventas", ownerId: null, advisorRole: null };
    assert.equal(porQueNoSePuedeMudar(cuenta, DESTINO), "no_es_del_equipo");
});

test("el destino tiene que ser una CUENTA, no una persona", { skip: ROTO }, () => {
    // Colgar a alguien de otra persona es una cadena de dos niveles, y
    // `cuentaQueManda` da por hecho que `persona.ownerId` YA es la cuenta.
    const otraPersona = { id: "yair", ownerId: "madre" };
    assert.equal(porQueNoSePuedeMudar(PERSONA, otraPersona), "el_destino_no_es_una_cuenta");
});

test("ni a si misma ni a donde ya esta", { skip: ROTO }, () => {
    assert.equal(
        porQueNoSePuedeMudar(PERSONA, { id: "maria", ownerId: null }),
        "el_destino_es_ella_misma",
    );
    assert.equal(
        porQueNoSePuedeMudar(PERSONA, { id: "madre", ownerId: null }),
        "ya_esta_en_esa_cuenta",
    );
});

test("sin persona o sin destino se dice cual falta", { skip: ROTO }, () => {
    assert.equal(porQueNoSePuedeMudar(null, DESTINO), "sin_persona");
    assert.equal(porQueNoSePuedeMudar(PERSONA, null), "sin_destino");
    // Y cada motivo tiene su frase: un codigo suelto en pantalla no explica nada.
    for (const codigo of Object.keys(PORQUE)) {
        assert.equal(typeof PORQUE[codigo], "string");
        assert.ok(PORQUE[codigo].length > 10, `${codigo} sin explicacion`);
    }
});

/* ────────────────────────────── El rol ──────────────────────────────────── */

test("lo que no sea `administrador` cae en `agente`, NUNCA al reves", { skip: ROTO }, () => {
    assert.equal(comoRolDeDestino("administrador"), "administrador");
    for (const basura of ["agente", "admin", "ADMINISTRADOR", "", null, 7, {}, undefined]) {
        assert.equal(comoRolDeDestino(basura), "agente", `con ${String(basura)}`);
    }
});

test("lo que se escribe es la fila de la persona y nada mas", { skip: ROTO }, () => {
    const plan = queSeEscribe(PERSONA, DESTINO, "administrador");
    assert.deepEqual(plan, {
        personaId: "maria",
        deLaCuenta: "madre",
        aLaCuenta: "atencion",
        rol: "administrador",
    });
});

/* ─────────────────────── La suerte de cada area ─────────────────────────── */

test("los chats se conservan solo siendo ADMINISTRADORA y en la misma familia", { skip: ROTO }, () => {
    const manda = laSuerteDeCadaArea({ rol: "administrador", mismaFamilia: true });
    assert.equal(manda.chats.suerte, "sigue");

    // Un agente solo ve las lineas de SU cuenta, aunque esten vinculadas.
    const agente = laSuerteDeCadaArea({ rol: "agente", mismaFamilia: true });
    assert.equal(agente.chats.suerte, "se_pierde");

    // Y fuera de la familia no hay vinculadas que sumar.
    const fuera = laSuerteDeCadaArea({ rol: "administrador", mismaFamilia: false });
    assert.equal(fuera.chats.suerte, "se_pierde");
});

test("las tareas se pierden con los DOS roles, y eso es lo que hay que decir", { skip: ROTO }, () => {
    for (const rol of ["administrador", "agente"]) {
        const areas = laSuerteDeCadaArea({ rol, mismaFamilia: true });
        // Tareas y Proyectos acotan con `ownerId` a secas: no miran vinculadas.
        assert.equal(areas.tareas.suerte, "se_pierde", rol);
        assert.equal(areas.proyectos.suerte, "se_pierde", rol);
    }
});

test("lo que cuelga de ELLA no se pierde nunca", { skip: ROTO }, () => {
    for (const rol of ["administrador", "agente"]) {
        for (const mismaFamilia of [true, false]) {
            const areas = laSuerteDeCadaArea({ rol, mismaFamilia });
            // Un directo se encuentra por pertenencia; sus permisos de
            // documentos llevan su id; y su cartera va por `advisorUserId`.
            assert.equal(areas.directos.suerte, "sigue");
            assert.equal(areas.permisos_propios.suerte, "sigue");
            assert.equal(areas.cartera.suerte, "sigue");
        }
    }
});

test("el General sigue dentro de la familia y se pierde fuera", { skip: ROTO }, () => {
    assert.equal(
        laSuerteDeCadaArea({ rol: "agente", mismaFamilia: true }).general.suerte,
        "sigue",
    );
    assert.equal(
        laSuerteDeCadaArea({ rol: "administrador", mismaFamilia: false }).general.suerte,
        "se_pierde",
    );
});

test("cada area dice POR QUE: una lista de palabras no sirve de informe", { skip: ROTO }, () => {
    const areas = laSuerteDeCadaArea({ rol: "agente", mismaFamilia: true });
    for (const [nombre, dato] of Object.entries(areas)) {
        assert.ok(dato.porque.length > 20, `${nombre} sin motivo`);
    }
});

/* ────────────────────── El recorte de modulos ───────────────────────────── */

test("se queda con el cruce: nunca un modulo que su cuenta nueva no tiene", { skip: ROTO }, () => {
    const quedan = losModulosQueLeQuedan(["chats", "crm", "finanzas"], ["chats", "crm", "tareas"]);
    assert.deepEqual(quedan.sort(), ["chats", "crm"]);
    assert.deepEqual(losModulosQueSeLeQuitan(["chats", "crm", "finanzas"], ["chats", "crm"]), [
        "finanzas",
    ]);
    assert.deepEqual(losModulosQueSeLeDan(["chats", "crm", "finanzas"], ["chats", "crm"]), []);
});

test("quien no tenia ninguna no gana ninguna: ya estaba sin tope", { skip: ROTO }, () => {
    assert.deepEqual(losModulosQueLeQuedan([], ["chats", "crm"]), []);
    assert.deepEqual(losModulosQueSeLeDan([], ["chats", "crm"]), []);
    assert.deepEqual(losModulosQueSeLeQuitan([], ["chats", "crm"]), []);
});

test("MODO=roto: el cruce vacio le quita el TOPE, no los modulos", () => {
    // Su cuenta nueva no tiene NINGUNO de los suyos. Es el caso de verdad:
    // dos cuentas con modulos distintos.
    const suyos = ["finanzas", "cobros"];
    const delDestino = ["chats", "crm"];

    if (ROTO) {
        // La forma ingenua deja la lista en cero. Y cero filas en
        // `_UserModules` NO es «sin modulos»: el armazon lo lee como «sin
        // restriccion» (`if (userModuleRecords.length > 0)`), asi que pasaria a
        // ver todo lo que su plan permita — mas que antes de mudarse.
        assert.deepEqual(recorteIngenuo(suyos, delDestino), [], "el recorte ingenuo la deja sin tope");
        return;
    }

    // La buena le da los de su cuenta nueva: nunca mas que ella, y nunca el
    // «sin tope» de la lista vacia.
    assert.deepEqual(losModulosQueLeQuedan(suyos, delDestino).sort(), ["chats", "crm"]);
    assert.deepEqual(losModulosQueSeLeQuitan(suyos, delDestino).sort(), ["cobros", "finanzas"]);
    assert.deepEqual(losModulosQueSeLeDan(suyos, delDestino).sort(), ["chats", "crm"]);
});

test("MODO=roto: y con la cuenta nueva sin modulos tampoco se inventa nada", () => {
    // Si la cuenta nueva no tiene filas, ella tampoco: las dos «sin tope», que
    // es lo coherente. Lo que no puede pasar es que ella quede sin tope y su
    // cuenta con el.
    if (ROTO) {
        assert.deepEqual(recorteIngenuo(["finanzas"], []), []);
        return;
    }
    assert.deepEqual(losModulosQueLeQuedan(["finanzas"], []), []);
});

test("los repetidos no cuentan dos veces", { skip: ROTO }, () => {
    assert.deepEqual(
        losModulosQueLeQuedan(["chats", "chats", "", "crm"], ["chats", "crm", "crm"]).sort(),
        ["chats", "crm"],
    );
});
