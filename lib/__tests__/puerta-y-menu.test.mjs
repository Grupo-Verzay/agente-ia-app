/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Si la puerta deja entrar a una ruta de panel, el menu la enseña.**
 *
 * Existia una segunda formula —el menu volvia a elegir, con OTRO rol y con OTRA
 * lista de rutas— y por eso Yair, administrador del equipo en Verzay | Atencion,
 * entraba a /panel escribiendo la URL y no veia la opcion en el menu lateral.
 *
 * Aqui se ejecutan las funciones REALES sobre los mismos modulos, en el mismo
 * orden que el layout, y se comprueba que las dos coinciden.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  rolQueAbrePuertas,
  soloElPanelQueLeToca,
  esVarianteDePanel,
} from "./.compilado/lib/sidebar-modules.js";

const M = (route, id = route) => ({ id, route, showInSidebar: true });

/** Los cuatro paneles que existen en la base de produccion. */
const TODOS = [
  M("/panel"), M("/panel-admin"), M("/reseller-panel"), M("/client-panel"), M("/chats"),
];

/**
 * La cadena real: el layout decide y filtra; el menu se queda con lo que
 * sobreviva. Devuelve las dos respuestas para poder compararlas.
 */
function puertaYMenu(persona, modules = TODOS) {
  const rol = rolQueAbrePuertas(persona);
  const { elegido, visibles } = soloElPanelQueLeToca(persona.rolDeLaCuenta ?? persona.role, modules);
  const enElMenu = visibles.find((m) => m.showInSidebar && esVarianteDePanel(m.route));
  return { rol, puerta: elegido?.route ?? null, menu: enElMenu?.route ?? null };
}

// ── Las personas, con la forma exacta que devuelve `currentUser()` ───────────

/** Yair: administrador del equipo de Verzay | Atencion (cuenta `admin`). */
const yair = {
  id: "yair", role: "user", rolDeLaPersona: "user",
  rolDeLaCuenta: "admin", ownerId: "atencion", advisorRole: "administrador",
};
/** Un agente de esa misma cuenta: participa, no manda. */
const agenteDeAtencion = {
  id: "agente", role: "user", rolDeLaPersona: "user",
  rolDeLaCuenta: "admin", ownerId: "atencion", advisorRole: "agente",
};
/** La cuenta Verzay | Atencion entrando por si misma. */
const atencion = { id: "atencion", role: "admin", rolDeLaPersona: "admin", rolDeLaCuenta: "admin" };
/** Grupo Verzay, superadministrador, en su cuenta. */
const grupoVerzay = { id: "gv", role: "super_admin", rolDeLaPersona: "super_admin", rolDeLaCuenta: "super_admin" };
/** Un cliente cualquiera. */
const cliente = { id: "c", role: "user", rolDeLaPersona: "user", rolDeLaCuenta: "user" };

// ── El caso que motivo el cambio ─────────────────────────────────────────────

test("Yair: la puerta le abre /panel-admin y el menu se lo ENSEÑA", () => {
  const { rol, puerta, menu } = puertaYMenu(yair);
  // Abre puertas con el rol de su CUENTA, no con el suyo (`user`).
  assert.equal(rol, "admin");
  assert.equal(puerta, "/panel-admin");
  // Esto era lo roto: la puerta decia /panel-admin y el menu, preguntando con
  // `user.role` = "user", buscaba /panel —que ya no estaba— y no enseñaba nada.
  assert.equal(menu, "/panel-admin");
  assert.equal(puerta, menu);
});

test("Yair, en una cuenta donde todavia no existe /panel-admin", () => {
  const sinPanelAdmin = TODOS.filter((m) => m.route !== "/panel-admin");
  const { puerta, menu } = puertaYMenu(yair, sinPanelAdmin);
  assert.equal(puerta, "/panel");
  assert.equal(menu, "/panel");
});

// ── El invariante, sobre todas las personas y todas las listas ───────────────

test("puerta abierta = opcion visible, para todos y en todas las combinaciones", () => {
  const personas = [
    ["Yair (administrador de equipo)", yair],
    ["un agente de esa cuenta", agenteDeAtencion],
    ["Verzay | Atencion por si misma", atencion],
    ["Grupo Verzay (super admin)", grupoVerzay],
    ["un cliente cualquiera", cliente],
  ];
  // Todas las combinaciones de paneles que pueden existir en la base.
  const paneles = ["/panel", "/panel-admin", "/reseller-panel", "/client-panel"];
  for (const [etiqueta, persona] of personas) {
    for (let mascara = 0; mascara < 16; mascara++) {
      const lista = paneles.filter((_, i) => mascara & (1 << i)).map((r) => M(r));
      lista.push(M("/chats"));
      const { puerta, menu } = puertaYMenu(persona, lista);
      assert.equal(
        menu, puerta,
        `${etiqueta} con [${lista.map((m) => m.route).join(", ")}]: puerta=${puerta} menu=${menu}`,
      );
    }
  }
});

// ── Y el reparto sigue siendo el de siempre ──────────────────────────────────

test("un agente NO hereda el rol de su cuenta", () => {
  // Es la mitad que no se puede ablandar: si un agente abriera puertas con el
  // rol de la cuenta, «Solo Admin» dejaria de significar nada dentro del equipo.
  assert.equal(rolQueAbrePuertas(agenteDeAtencion), "user");
  assert.equal(rolQueAbrePuertas(yair), "admin");
});

test("el superadministrador manda esté en la cuenta que esté", () => {
  assert.equal(rolQueAbrePuertas(grupoVerzay), "super_admin");
  // Metido en la cuenta de un cliente, incluso como agente.
  assert.equal(
    rolQueAbrePuertas({ role: "user", rolDeLaPersona: "super_admin", rolDeLaCuenta: "user", ownerId: "c", advisorRole: "agente" }),
    "super_admin",
  );
});

test("sin rol de cuenta se cae al suyo, no a vacio", () => {
  assert.equal(rolQueAbrePuertas({ role: "admin" }), "admin");
  assert.equal(rolQueAbrePuertas({ role: "user", rolDeLaCuenta: null }), "user");
});

test("los paneles ajenos salen de la lista, y lo demas se queda", () => {
  const { elegido, visibles } = soloElPanelQueLeToca("admin", TODOS);
  assert.equal(elegido.route, "/panel-admin");
  assert.deepEqual(visibles.map((m) => m.route), ["/panel-admin", "/chats"]);
});

test("sin ningun panel, no se inventa y el menu tampoco", () => {
  const { puerta, menu } = puertaYMenu(yair, [M("/chats")]);
  assert.equal(puerta, null);
  assert.equal(menu, null);
});

// ── Y dentro de una cuenta ajena por «Ingresar» ────────────────────────────

test("con «Ingresar» puesto, la puerta se abre con el rol de la CUENTA", () => {
  // Un superadministrador dentro de la cuenta de un cliente abre lo que abre
  // el cliente: se entro para ver su pantalla. Sin esto, el menu y los
  // apartados del panel le salian abiertos de mas.
  const metido = {
    role: "user", rolDeLaPersona: "super_admin", rolDeLaCuenta: "user",
    porImpersonacion: true,
  };
  assert.equal(rolQueAbrePuertas(metido), "user");
});

test("...y con el conmutador sigue abriendo como superadministrador", () => {
  const conmutado = {
    role: "admin", rolDeLaPersona: "super_admin", rolDeLaCuenta: "admin",
    porImpersonacion: false,
  };
  assert.equal(rolQueAbrePuertas(conmutado), "super_admin");
});
