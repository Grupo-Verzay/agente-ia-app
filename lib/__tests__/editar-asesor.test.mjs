/**
 * Editar a un asesor del equipo — la decisión, pura y sin base de datos.
 *
 * Prueba la MISMA función (`validarEdicionDeAsesor`) que usa la acción
 * `updateAdvisor` del servidor: la acción solo averigua dos hechos contra la
 * base —el correo de hoy y si otro usuario ya usa el correo pedido— y se los
 * pasa a esta regla. Aquí se cubren los siete casos del encargo:
 *   - cambiar solo el nombre,
 *   - cambiar el correo,
 *   - dejar la contraseña vacía (no se toca),
 *   - cambiar la contraseña,
 *   - correo repetido (choca),
 *   - correo mal formado (choca),
 *   - cambio de rol.
 *
 * Compilar lo puro (sale en `.compilado/`, en .gitignore):
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 * Correr:
 *   node --test lib/__tests__/editar-asesor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  esCorreoValido,
  esRolDeAsesor,
  validarEdicionDeAsesor,
} from "./.compilado/lib/editar-asesor.js";

// Un asesor de mentira: hoy se llama Ana, correo ana@empresa.com, agente.
const HOY = { correoActual: "ana@empresa.com", correoYaUsado: false };
const base = { nombre: "Ana", correo: "ana@empresa.com", contrasena: "", rol: "agente" };

test("esCorreoValido: acepta lo razonable y rechaza lo que a ojo no es correo", () => {
  assert.ok(esCorreoValido("ana@empresa.com"));
  assert.ok(esCorreoValido("a.b+c@sub.dominio.co"));
  assert.ok(!esCorreoValido("ana"));
  assert.ok(!esCorreoValido("ana@empresa"));
  assert.ok(!esCorreoValido("ana @empresa.com"));
  assert.ok(!esCorreoValido("@empresa.com"));
  assert.ok(!esCorreoValido(""));
});

test("esRolDeAsesor: solo los dos que ofrece el selector de la tabla", () => {
  assert.ok(esRolDeAsesor("agente"));
  assert.ok(esRolDeAsesor("administrador"));
  assert.ok(!esRolDeAsesor("super_admin"));
  assert.ok(!esRolDeAsesor(""));
});

test("cambiar solo el nombre: pasa, no cambia el correo y no toca la contraseña", () => {
  const r = validarEdicionDeAsesor({ ...base, nombre: "Ana María" }, HOY);
  assert.ok(r.ok);
  assert.equal(r.nombre, "Ana María");
  assert.equal(r.correo, "ana@empresa.com");
  assert.equal(r.cambiaCorreo, false);
  assert.equal(r.nuevaContrasena, null, "sin contraseña escrita, no se cambia");
  assert.equal(r.rol, "agente");
});

test("cambiar el correo: se normaliza a minúsculas y marca cambiaCorreo", () => {
  const r = validarEdicionDeAsesor({ ...base, correo: "  Ana.Nueva@Empresa.COM " }, HOY);
  assert.ok(r.ok);
  assert.equal(r.correo, "ana.nueva@empresa.com");
  assert.equal(r.cambiaCorreo, true);
});

test("dejar la contraseña vacía: nuevaContrasena queda en null (no se toca)", () => {
  const vacia = validarEdicionDeAsesor({ ...base, contrasena: "" }, HOY);
  assert.ok(vacia.ok);
  assert.equal(vacia.nuevaContrasena, null);
  // Solo espacios cuenta igual que vacía: se recorta, no la toca.
  const espacios = validarEdicionDeAsesor({ ...base, contrasena: "     " }, HOY);
  assert.ok(espacios.ok);
  assert.equal(espacios.nuevaContrasena, null);
});

test("cambiar la contraseña: con 6+ pasa; con menos, se rechaza", () => {
  const buena = validarEdicionDeAsesor({ ...base, contrasena: "secreta1" }, HOY);
  assert.ok(buena.ok);
  assert.equal(buena.nuevaContrasena, "secreta1");

  const corta = validarEdicionDeAsesor({ ...base, contrasena: "123" }, HOY);
  assert.ok(!corta.ok);
  assert.match(corta.motivo, /6 caracteres/);
});

test("correo repetido: si otro usuario ya lo tiene, choca con aviso claro", () => {
  const r = validarEdicionDeAsesor(
    { ...base, correo: "usada@empresa.com" },
    { correoActual: "ana@empresa.com", correoYaUsado: true },
  );
  assert.ok(!r.ok);
  assert.match(r.motivo, /ya está en uso/);
});

test("re-guardar sin tocar el correo NO choca consigo mismo", () => {
  // `correoYaUsado` significa "otro usuario distinto"; con el mismo correo de
  // hoy, la acción lo consulta con `id: { not }` y da false, así que pasa.
  const r = validarEdicionDeAsesor({ ...base, nombre: "Ana B." }, HOY);
  assert.ok(r.ok);
  assert.equal(r.cambiaCorreo, false);
});

test("correo mal formado: se rechaza antes de mirar nada más", () => {
  const r = validarEdicionDeAsesor({ ...base, correo: "no-es-correo" }, HOY);
  assert.ok(!r.ok);
  assert.match(r.motivo, /formato/);
});

test("cambio de rol: a administrador pasa; un rol de fuera de la lista se rechaza", () => {
  const admin = validarEdicionDeAsesor({ ...base, rol: "administrador" }, HOY);
  assert.ok(admin.ok);
  assert.equal(admin.rol, "administrador");

  const raro = validarEdicionDeAsesor({ ...base, rol: "super_admin" }, HOY);
  assert.ok(!raro.ok);
  assert.match(raro.motivo, /rol/i);
});

test("el nombre es obligatorio", () => {
  const r = validarEdicionDeAsesor({ ...base, nombre: "   " }, HOY);
  assert.ok(!r.ok);
  assert.match(r.motivo, /nombre/i);
});
