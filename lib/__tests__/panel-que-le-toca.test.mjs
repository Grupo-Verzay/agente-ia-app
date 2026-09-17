/**
 * Banco de `elPanelQueLeToca`: la regla unica de «cual panel es el tuyo».
 *
 * Existia cuatro veces, con tres origenes de rol y dos listas de rutas, y
 * discrepaban justo cuando el modulo panel se caia por un filtro. Aqui se
 * comprueba que la regla es UNA y que da lo mismo sobre las cuatro entradas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { elPanelQueLeToca } from "./.compilado/lib/sidebar-modules.js";

const M = (route, id = route) => ({ id, route });
const TODOS = [M("/panel"), M("/panel-admin"), M("/client-panel"), M("/reseller-panel")];

test("cada rol se lleva el suyo", () => {
  assert.equal(elPanelQueLeToca("super_admin", TODOS).route, "/panel");
  assert.equal(elPanelQueLeToca("admin", TODOS).route, "/panel-admin");
  assert.equal(elPanelQueLeToca("reseller", TODOS).route, "/reseller-panel");
  assert.equal(elPanelQueLeToca("user", TODOS).route, "/client-panel");
});

test("un administrador cae a /panel mientras no exista /panel-admin", () => {
  // Es el respaldo que el codigo lleva desde el #468: la lista esta en orden de
  // preferencia y se toma la primera que EXISTA.
  const sinPanelAdmin = TODOS.filter((m) => m.route !== "/panel-admin");
  assert.equal(elPanelQueLeToca("admin", sinPanelAdmin).route, "/panel");
});

test("si no existe ninguno, no se inventa", () => {
  assert.equal(elPanelQueLeToca("admin", []), null);
  assert.equal(elPanelQueLeToca("user", [M("/panel")]), null);
});

test("la lista del MENU añade el panel del cliente como ultimo recurso", () => {
  // Es la unica diferencia entre las dos listas, y es a proposito: sobre
  // modulos YA filtrados, si a alguien no le sobrevivio el panel del equipo,
  // le toca el de cliente.
  const soloCliente = [M("/client-panel")];
  assert.equal(elPanelQueLeToca("admin", soloCliente), null);
  assert.equal(
    elPanelQueLeToca("admin", soloCliente, { paraElMenu: true }).route,
    "/client-panel",
  );
});

test("el reseller NO cae al panel del cliente ni en el menu", () => {
  // Sus clientes los administra el; darle el panel de cliente le enseñaria
  // pantallas que no son suyas.
  const sinElSuyo = [M("/panel"), M("/client-panel")];
  assert.equal(elPanelQueLeToca("reseller", sinElSuyo), null);
  assert.equal(elPanelQueLeToca("reseller", sinElSuyo, { paraElMenu: true }), null);
});

test("el orden manda, no el orden en que vengan los modulos", () => {
  const alReves = [...TODOS].reverse();
  assert.equal(elPanelQueLeToca("admin", alReves).route, "/panel-admin");
  assert.equal(elPanelQueLeToca("super_admin", alReves).route, "/panel");
});

test("devuelve el OBJETO, para que cada llamador saque lo que necesite", () => {
  // El layout necesita el `id`, Equipo la `route`. Con la regla devolviendo el
  // modulo entero, ninguno de los dos vuelve a escribirla por su cuenta.
  const elegido = elPanelQueLeToca("admin", [M("/panel-admin", "id-42")]);
  assert.equal(elegido.id, "id-42");
  assert.equal(elegido.route, "/panel-admin");
});
