/**
 * Cuando suena el chat del equipo.
 *
 * Lo que este banco protege, y las cuatro son formas de sonar de mas — que es
 * peor que no sonar, porque enseña a ignorar el aviso:
 *
 *   1. **El general sin mencion NO suena.** Es el canal donde esta todo el
 *      mundo; sonar con cada cosa que se dice ahi es lo que hace que se
 *      silencie el aviso entero.
 *   2. **Lo que se tiene DELANTE no suena** — y delante son dos cosas: el canal
 *      abierto Y la pestaña a la vista. Con la pestaña de fondo el canal sigue
 *      abierto en la pantalla y no lo esta mirando nadie.
 *   3. **Lo ya sonado no vuelve a sonar.** Sin esto, una mencion sin leer
 *      sonaria en cada vuelta del reloj hasta que alguien la abriera.
 *   4. **La marca avanza aunque no suene.** Lo que se descarta por tenerlo
 *      delante ya esta visto; dejarlo detras de la marca lo haria sonar al
 *      cambiar de canal.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/aviso-del-equipo.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TONO_DEL_EQUIPO,
  laMarcaDespues,
  llaveDeLaMarca,
  loQueMereceSonar,
} from "./.compilado/aviso-del-equipo.js";

const SIN_PANEL = { canalAbierto: null, aLaVista: true, marca: 0 };
const directo = (cuando, canalId = "d1") => ({ canalId, cuando, motivo: "directo" });
const mencion = (cuando, canalId = "general") => ({ canalId, cuando, motivo: "mencion" });

// ── Que suena y que no ───────────────────────────────────────────────────────

test("un directo suena", () => {
  assert.equal(loQueMereceSonar([directo(10)], SIN_PANEL)?.canalId, "d1");
});

test("una mencion suena, tambien en el general", () => {
  assert.equal(loQueMereceSonar([mencion(10)], SIN_PANEL)?.motivo, "mencion");
});

test("sin nada que sonar, no suena", () => {
  assert.equal(loQueMereceSonar([], SIN_PANEL), null);
});

test("de varios, suena el MAS NUEVO", () => {
  const cual = loQueMereceSonar([directo(10, "a"), mencion(50, "b"), directo(30, "c")], SIN_PANEL);
  assert.equal(cual?.canalId, "b");
});

// ── Lo que se tiene delante ──────────────────────────────────────────────────

test("el canal abierto y a la vista no suena", () => {
  const r = loQueMereceSonar([directo(10, "d1")], { canalAbierto: "d1", aLaVista: true, marca: 0 });
  assert.equal(r, null);
});

test("pero OTRO canal si suena con el panel abierto", () => {
  const r = loQueMereceSonar([directo(10, "d2")], { canalAbierto: "d1", aLaVista: true, marca: 0 });
  assert.equal(r?.canalId, "d2");
});

test("y con la pestaña de fondo SI suena, aunque sea el canal abierto", () => {
  // El caso entero de esta funcion: el canal sigue «abierto» en la pantalla y
  // no lo esta viendo nadie. Sin esta mitad, quien deja el panel abierto en un
  // directo y se va a otra pestaña no se entera nunca de ese directo.
  const r = loQueMereceSonar([directo(10, "d1")], { canalAbierto: "d1", aLaVista: false, marca: 0 });
  assert.equal(r?.canalId, "d1");
});

// ── La marca ─────────────────────────────────────────────────────────────────

test("lo que ya sono no vuelve a sonar", () => {
  const r = loQueMereceSonar([mencion(100)], { canalAbierto: null, aLaVista: true, marca: 100 });
  assert.equal(r, null);
});

test("y lo posterior a la marca si", () => {
  const r = loQueMereceSonar([mencion(101)], { canalAbierto: null, aLaVista: true, marca: 100 });
  assert.equal(r?.cuando, 101);
});

test("la marca avanza con lo mas nuevo", () => {
  assert.equal(laMarcaDespues([directo(10), mencion(90), directo(40)], 0), 90);
});

test("la marca avanza AUNQUE no suene: lo de delante ya esta visto", () => {
  const avisos = [directo(90, "d1")];
  const entorno = { canalAbierto: "d1", aLaVista: true, marca: 0 };
  assert.equal(loQueMereceSonar(avisos, entorno), null, "no suena, se tiene delante");
  // Y aun asi la marca sube: si no, bastaria con cambiar de canal para que ese
  // mensaje ya visto sonara.
  const despues = laMarcaDespues(avisos, entorno.marca);
  assert.equal(despues, 90);
  assert.equal(loQueMereceSonar(avisos, { canalAbierto: "otro", aLaVista: true, marca: despues }), null);
});

test("la marca NUNCA retrocede", () => {
  // Una respuesta de una vuelta anterior que llega tarde no puede resucitar
  // avisos ya dados por vistos.
  assert.equal(laMarcaDespues([directo(10)], 500), 500);
});

// ── Basura que llega de fuera ────────────────────────────────────────────────

test("una fila sin canal o sin hora se ignora, no rompe la vuelta", () => {
  const avisos = [
    { canalId: "", cuando: 999, motivo: "directo" },
    { canalId: "d1", cuando: Number.NaN, motivo: "directo" },
    directo(5),
  ];
  assert.equal(loQueMereceSonar(avisos, SIN_PANEL)?.cuando, 5);
  assert.equal(laMarcaDespues(avisos, 0), 5);
});

// ── El tono ──────────────────────────────────────────────────────────────────

test("es mas agudo y mas corto que el de los chats de clientes, y NO mas fuerte", () => {
  // Los numeros del de clientes, de `hooks/chats/useAdvisorNotifications`.
  const CLIENTES = { desde: 880, hasta: 1100, duracion: 0.45, volumen: 0.25 };
  assert.ok(TONO_DEL_EQUIPO.desde > CLIENTES.hasta, "arranca por encima de donde acaba el otro");
  assert.ok(TONO_DEL_EQUIPO.duracion < CLIENTES.duracion / 2, "menos de la mitad de largo");
  assert.ok(TONO_DEL_EQUIPO.volumen < CLIENTES.volumen, "mas bajo, no mas alto");
});

// ── La llave ─────────────────────────────────────────────────────────────────

test("la llave es por PERSONA: dos cuentas en el mismo navegador no se pisan", () => {
  assert.notEqual(llaveDeLaMarca("ana"), llaveDeLaMarca("beto"));
});

test("y sin persona tiene una llave propia, no una vacia", () => {
  assert.ok(llaveDeLaMarca("").endsWith("sin-persona"));
});
