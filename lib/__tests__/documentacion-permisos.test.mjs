/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Lo que no se puede ABRIR no se puede LISTAR.**
 *
 * De donde sale: listar y abrir preguntan a la misma funcion a proposito. Con
 * dos condiciones —una para la lista, otra para la apertura— llega el dia en
 * que discrepan, y entonces el documento sale en el arbol del espacio y al
 * pulsarlo contesta «No autorizado». Eso no se lee como un permiso: se lee como
 * que la App esta rota, y es el mismo «menu abierto, puerta cerrada» que este
 * repositorio ya ha pagado en Clientes, en Equipo, en Analiticas y en el panel.
 *
 * Aqui corren las funciones REALES de `lib/documentacion-permisos.ts`, con los
 * roles de verdad (`canManageWorkspace`, `esSuperAdminDeVerdad`) dentro.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    accesoAlEspacio,
    accesoAlDocumento,
    laCuentaDeQuienMira,
    comoPermiso,
    comoSujeto,
    comoVisibilidad,
} = await import("./.compilado/documentacion-permisos.js");

/* ── Las cinco personas del caso real ─────────────────────────────────────── */

/** Dueño de la cuenta «atencion». Su fila no cuelga de nadie. */
const duena = { id: "atencion", role: "user", ownerId: null, advisorRole: null };
/** Administrador del equipo de «atencion». Se crea con rol `user`, siempre. */
const yair = { id: "yair", role: "user", ownerId: "atencion", advisorRole: "administrador" };
/** Agente del equipo de «atencion». Participa, no manda. */
const agente = { id: "ana", role: "user", ownerId: "atencion", advisorRole: "agente" };
/** Alguien de otra cuenta, «ventas». */
const deVentas = { id: "sofia", role: "user", ownerId: "ventas", advisorRole: "administrador" };
/**
 * Superadministrador de plataforma metido DENTRO de otra cuenta: su rol propio
 * viaja en `rolDeLaPersona`, no en `role`. Es el caso que dejaba fuera a las 48
 * puertas que preguntaban solo por `role`.
 */
const jefe = {
    id: "carlos",
    role: "user",
    rolDeLaPersona: "super_admin",
    ownerId: "ventas",
    advisorRole: null,
};

const espacio = (extra = {}) => ({
    id: "e1",
    cuentaId: "atencion",
    visibilidad: "cuenta",
    ...extra,
});

const documento = (extra = {}) => ({
    id: "d1",
    cuentaId: "atencion",
    espacioId: "e1",
    restringido: false,
    creadoPorId: "yair",
    ...extra,
});

const permiso = (extra) => ({
    objetoTipo: "espacio",
    objetoId: "e1",
    sujetoTipo: "cuenta",
    sujetoId: "ventas",
    permiso: "lectura",
    ...extra,
});

/* ── Alcanzar va con la CUENTA ───────────────────────────────────────────── */

test("el alcance sale de la fila EFECTIVA, no de la persona", () => {
    // Es la regla que costo una regresion al aplicarla del reves en la cartera
    // de clientes: firmar va con la persona, alcanzar con la cuenta.
    assert.equal(laCuentaDeQuienMira(yair), "atencion");
    assert.equal(laCuentaDeQuienMira(duena), "atencion");
    assert.equal(laCuentaDeQuienMira(deVentas), "ventas");
});

/* ── El espacio propio ────────────────────────────────────────────────────── */

test("un espacio de la cuenta lo ve TODO su equipo, agente incluido", () => {
    // Divergencia a proposito de la regla de las notas: compartir documentacion
    // con una cuenta ES para que la lea su gente. Dejar fuera a los agentes
    // vaciaria la funcion de sentido.
    for (const quien of [duena, yair, agente]) {
        const acceso = accesoAlEspacio(quien, espacio(), []);
        assert.ok(acceso, `${quien.id} tendria que verlo`);
        assert.equal(acceso.recibido, false);
    }
});

test("pero un agente NO manda: participa", () => {
    assert.equal(accesoAlEspacio(agente, espacio(), []).puedeGestionar, false);
    assert.equal(accesoAlEspacio(agente, espacio(), []).puedeEditar, false);
    assert.equal(accesoAlEspacio(yair, espacio(), []).puedeGestionar, true);
    assert.equal(accesoAlEspacio(duena, espacio(), []).puedeGestionar, true);
});

test("a un agente se le puede dar edicion sobre un espacio concreto", () => {
    const acceso = accesoAlEspacio(agente, espacio(), [
        permiso({ sujetoTipo: "persona", sujetoId: "ana", permiso: "edicion" }),
    ]);
    assert.equal(acceso.puedeEditar, true);
    // Editar no es mandar: sigue sin poder borrar el espacio ni repartirlo.
    assert.equal(acceso.puedeGestionar, false);
});

test("restringido: sin fila no entra, y quien gestiona la cuenta si", () => {
    const cerrado = espacio({ visibilidad: "restringido" });
    assert.equal(accesoAlEspacio(agente, cerrado, []), null);
    // Misma decision, tomada a proposito, que deja al administrador leer los
    // directos de su cuenta: es una herramienta de trabajo, no un cajon
    // privado. Y sin ella un espacio se vuelve inalcanzable el dia que su
    // creador se va.
    assert.ok(accesoAlEspacio(yair, cerrado, []));
    assert.ok(accesoAlEspacio(duena, cerrado, []));
});

test("restringido con fila: el agente entra, y solo el que la tiene", () => {
    const cerrado = espacio({ visibilidad: "restringido" });
    const conFila = [permiso({ sujetoTipo: "persona", sujetoId: "ana" })];
    assert.ok(accesoAlEspacio(agente, cerrado, conFila));
    assert.equal(accesoAlEspacio(deVentas, cerrado, conFila), null);
});

/* ── El espacio de OTRA cuenta ────────────────────────────────────────────── */

test("sin fila, un espacio ajeno se contesta como si NO EXISTIERA", () => {
    // Decir «no puedes» ya revela que existe y de quien es. Misma regla que
    // `getFlowAction` y que `accesoAlProyecto`.
    assert.equal(accesoAlEspacio(deVentas, espacio(), []), null);
});

test("compartido con una CUENTA, lo alcanza su equipo entero", () => {
    // Es el caso que hace posible ofrecerselo a un cliente: se comparte con la
    // cuenta, no persona por persona — la duena no administra ese equipo y no
    // puede acordarse de añadir a cada uno que entre despues.
    const compartido = [permiso({ sujetoTipo: "cuenta", sujetoId: "ventas" })];
    const acceso = accesoAlEspacio(deVentas, espacio(), compartido);
    assert.ok(acceso);
    assert.equal(acceso.recibido, true);
    assert.equal(acceso.cuentaId, "atencion");
});

test("en uno RECIBIDO no manda nadie de esta cuenta", () => {
    // Ni con edicion: repartirlo sigue siendo de quien lo hizo. Es lo mismo que
    // ya rige en Proyectos compartidos y en Diagramas.
    const compartido = [permiso({ permiso: "edicion" })];
    const acceso = accesoAlEspacio(deVentas, espacio(), compartido);
    assert.equal(acceso.puedeEditar, true);
    assert.equal(acceso.puedeGestionar, false);
});

test("y un agente de la cuenta invitada lo VE y no lo TOCA", () => {
    const agenteDeVentas = { id: "leo", role: "user", ownerId: "ventas", advisorRole: "agente" };
    const compartido = [permiso({ permiso: "edicion" })];
    const acceso = accesoAlEspacio(agenteDeVentas, espacio(), compartido);
    assert.ok(acceso);
    assert.equal(acceso.puedeEditar, false);
});

test("entre dos filas gana la que MAS deja hacer", () => {
    // Puede haber una para la persona y otra para su cuenta. Quitarle la
    // edicion por tener ademas una de lectura seria un permiso que cambia
    // segun por donde se mire.
    const dos = [
        permiso({ sujetoTipo: "persona", sujetoId: "sofia", permiso: "lectura" }),
        permiso({ sujetoTipo: "cuenta", sujetoId: "ventas", permiso: "edicion" }),
    ];
    assert.equal(accesoAlEspacio(deVentas, espacio(), dos).puedeEditar, true);
    // Y en el orden contrario, igual: no puede depender de como vengan.
    assert.equal(accesoAlEspacio(deVentas, espacio(), [...dos].reverse()).puedeEditar, true);
});

test("una fila de OTRO objeto no cuenta", () => {
    // El filtro por `objetoId` es lo que impide que un permiso sobre un espacio
    // abra otro distinto.
    const deOtro = [permiso({ objetoId: "e2", permiso: "edicion" })];
    assert.equal(accesoAlEspacio(deVentas, espacio(), deOtro), null);
});

/* ── El superadministrador ───────────────────────────────────────────────── */

test("el superadministrador entra este en la cuenta que este", () => {
    // Su rol propio viaja en `rolDeLaPersona`: preguntando solo por `role` se
    // quedaba fuera, que es el fallo de las 48 puertas.
    const acceso = accesoAlEspacio(jefe, espacio({ visibilidad: "restringido" }), []);
    assert.ok(acceso);
    assert.equal(acceso.puedeEditar, true);
});

test("pero tampoco EL manda en uno recibido", () => {
    // Gestionar uno ajeno sigue siendo que no, y eso no depende de quien mire.
    assert.equal(accesoAlEspacio(jefe, espacio(), []).puedeGestionar, false);
});

/* ── El documento ────────────────────────────────────────────────────────── */

test("un documento normal hereda su espacio", () => {
    const acceso = accesoAlDocumento(agente, documento(), espacio(), []);
    assert.ok(acceso);
    assert.equal(acceso.puedeEditar, false);
});

test("y el documento solo puede AÑADIR", () => {
    // Edicion sobre ESTE documento a quien solo tenia lectura en el espacio.
    const acceso = accesoAlDocumento(agente, documento(), espacio(), [
        {
            objetoTipo: "documento",
            objetoId: "d1",
            sujetoTipo: "persona",
            sujetoId: "ana",
            permiso: "edicion",
        },
    ]);
    assert.equal(acceso.puedeEditar, true);
});

test("RESTRINGIDO: no lo ve el equipo aunque el espacio sea de la cuenta", () => {
    // Y esta es la mitad que sostiene el invariante de la cabecera: la misma
    // funcion contesta al listar, asi que el documento no sale en el arbol.
    const cerrado = documento({ restringido: true });
    assert.equal(accesoAlDocumento(agente, cerrado, espacio(), []), null);
    // Quien lo escribio, si.
    assert.ok(accesoAlDocumento(yair, cerrado, espacio(), []));
});

test("un documento restringido no se pierde con su autor", () => {
    // Quien gestiona la cuenta duena entra. Sin esto, el dia que esa persona se
    // va queda un documento que no puede abrir nadie y que no se puede ni
    // borrar.
    const deOtro = documento({ restringido: true, creadoPorId: "alguien-que-se-fue" });
    assert.ok(accesoAlDocumento(duena, deOtro, espacio(), []));
    assert.ok(accesoAlDocumento(jefe, deOtro, espacio(), []));
    assert.equal(accesoAlDocumento(agente, deOtro, espacio(), []), null);
});

test("restringido y de otra cuenta: hace falta una fila de ESE documento", () => {
    const cerrado = documento({ restringido: true });
    const soloElEspacio = [permiso({ permiso: "edicion" })];
    assert.equal(accesoAlDocumento(deVentas, cerrado, espacio(), soloElEspacio), null);

    const conElSuyo = [
        ...soloElEspacio,
        {
            objetoTipo: "documento",
            objetoId: "d1",
            sujetoTipo: "cuenta",
            sujetoId: "ventas",
            permiso: "lectura",
        },
    ];
    const acceso = accesoAlDocumento(deVentas, cerrado, espacio(), conElSuyo);
    assert.ok(acceso);
    assert.equal(acceso.recibido, true);
    assert.equal(acceso.puedeGestionar, false);
});

test("el autor de un documento RECIBIDO no manda en el", () => {
    // Caso raro y real: alguien de Ventas escribio un documento dentro de un
    // espacio de Atencion que le compartieron con edicion. El documento es de
    // Atencion —igual que las tareas de un proyecto compartido cuelgan de su
    // dueña—, asi que gestionar sigue siendo de alli.
    const suyoPeroAjeno = documento({ creadoPorId: "sofia" });
    const compartido = [permiso({ permiso: "edicion" })];
    const acceso = accesoAlDocumento(deVentas, suyoPeroAjeno, espacio(), compartido);
    assert.ok(acceso);
    assert.equal(acceso.puedeGestionar, false);
});

test("sin espacio y sin filas, un documento no se alcanza", () => {
    assert.equal(accesoAlDocumento(deVentas, documento(), null, []), null);
});

/* ── Lo que llega de fuera ───────────────────────────────────────────────── */

test("un permiso, un sujeto o una visibilidad inventados no pasan", () => {
    assert.equal(comoPermiso("edicion"), "edicion");
    assert.equal(comoPermiso("admin"), null);
    assert.equal(comoPermiso(7), null);
    assert.equal(comoSujeto("cuenta"), "cuenta");
    assert.equal(comoSujeto("grupo"), null);
    assert.equal(comoVisibilidad("restringido"), "restringido");
    assert.equal(comoVisibilidad("publico"), null);
});
