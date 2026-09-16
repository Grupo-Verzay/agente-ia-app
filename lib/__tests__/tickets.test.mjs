/**
 * Banco de pruebas de `lib/tickets.ts`.
 *
 * Corre sobre el modulo REAL, compilado antes a JS:
 *
 *   npx tsc lib/tickets.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler
 *   node --test lib/__tests__/tickets.test.mjs
 *
 * Lo que se comprueba aqui es lo unico que sale de la App hacia fuera: cuando
 * se le manda un WhatsApp al cliente. Un aviso de mas no se puede recoger.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS_DE_TICKET,
  ETIQUETAS_DE_ESTADO,
  COLORES_DE_ESTADO,
  comoEstadoDeTicket,
  exigeMotivo,
  avisaAlCliente,
  avisoDeResuelto,
  queLeFaltaAlTicket,
  soloDigitos,
  TOPE_DEL_TITULO,
} from "./.compilado/tickets.js";

// ── El aviso por WhatsApp ────────────────────────────────────────────────────

test("solo al PASAR a resuelto sale el aviso", () => {
  assert.equal(avisaAlCliente("recibido", "resuelto"), true);
  assert.equal(avisaAlCliente("en_proceso", "resuelto"), true);
  assert.equal(avisaAlCliente("en_revision", "resuelto"), true);
  assert.equal(avisaAlCliente("descartado", "resuelto"), true);
});

test("guardar dos veces resuelto NO manda otro aviso", () => {
  // Es el caso que se da solo: el administrador vuelve a pulsar guardar, o la
  // pantalla reenvia el mismo estado. Sin comparar con el anterior, cada
  // pulsacion seria un WhatsApp.
  assert.equal(avisaAlCliente("resuelto", "resuelto"), false);
});

test("ningun otro cambio avisa", () => {
  const otros = ESTADOS_DE_TICKET.filter((e) => e !== "resuelto");
  for (const antes of ESTADOS_DE_TICKET) {
    for (const despues of otros) {
      assert.equal(
        avisaAlCliente(antes, despues),
        false,
        `${antes} -> ${despues} no deberia avisar`,
      );
    }
  }
});

test("reabrir y volver a resolver SI vuelve a avisar", () => {
  // Es un cierre nuevo: el cliente tiene que enterarse igual que la primera vez.
  assert.equal(avisaAlCliente("resuelto", "en_proceso"), false);
  assert.equal(avisaAlCliente("en_proceso", "resuelto"), true);
});

test("el aviso lleva el titulo y no revienta sin el", () => {
  const con = avisoDeResuelto("  No me carga el QR  ");
  assert.ok(con.includes("No me carga el QR"));
  assert.ok(!con.includes("  No me carga"), "el titulo va recortado de espacios");
  const sin = avisoDeResuelto("   ");
  assert.ok(sin.length > 0);
  assert.ok(!sin.includes("__"), "sin titulo no queda una cursiva vacia");
});

test("un titulo enorme no se manda entero por WhatsApp", () => {
  const largo = avisoDeResuelto("x".repeat(5000));
  assert.ok(largo.length < 400);
});

// ── Descartar exige motivo ───────────────────────────────────────────────────

test("solo descartado exige motivo", () => {
  assert.equal(exigeMotivo("descartado"), true);
  for (const e of ESTADOS_DE_TICKET) {
    if (e === "descartado") continue;
    assert.equal(exigeMotivo(e), false, `${e} no deberia exigir motivo`);
  }
});

// ── Lo que llega de fuera ────────────────────────────────────────────────────

test("un estado inventado no pasa", () => {
  assert.equal(comoEstadoDeTicket("cerrado"), null);
  assert.equal(comoEstadoDeTicket(""), null);
  assert.equal(comoEstadoDeTicket(null), null);
  assert.equal(comoEstadoDeTicket(undefined), null);
  assert.equal(comoEstadoDeTicket(42), null);
  assert.equal(comoEstadoDeTicket({}), null);
  // Ni disfrazado de mayusculas: la lista es literal, la escribe la base.
  assert.equal(comoEstadoDeTicket("RESUELTO"), null);
});

test("los cinco de la lista si pasan, con espacios alrededor", () => {
  for (const e of ESTADOS_DE_TICKET) {
    assert.equal(comoEstadoDeTicket(e), e);
    assert.equal(comoEstadoDeTicket(`  ${e} `), e);
  }
});

test("los cinco tienen etiqueta y color: ninguno se pinta en blanco", () => {
  for (const e of ESTADOS_DE_TICKET) {
    assert.ok(ETIQUETAS_DE_ESTADO[e], `${e} sin etiqueta`);
    assert.ok(COLORES_DE_ESTADO[e], `${e} sin color`);
  }
  assert.equal(Object.keys(ETIQUETAS_DE_ESTADO).length, ESTADOS_DE_TICKET.length);
  assert.equal(Object.keys(COLORES_DE_ESTADO).length, ESTADOS_DE_TICKET.length);
});

// ── Lo que hace falta para guardar ───────────────────────────────────────────

test("sin titulo, sin descripcion o sin WhatsApp no se guarda", () => {
  assert.ok(queLeFaltaAlTicket({ descripcion: "algo", whatsapp: "3001234567" }));
  assert.ok(queLeFaltaAlTicket({ titulo: "  ", descripcion: "algo", whatsapp: "3001234567" }));
  assert.ok(queLeFaltaAlTicket({ titulo: "algo", whatsapp: "3001234567" }));
  assert.ok(queLeFaltaAlTicket({ titulo: "algo", descripcion: "algo" }));
});

test("un WhatsApp demasiado corto no vale: no habria a quien avisar", () => {
  assert.ok(queLeFaltaAlTicket({ titulo: "t", descripcion: "d", whatsapp: "300123" }));
  // Nueve digitos disfrazados de largos con guiones tampoco.
  assert.ok(queLeFaltaAlTicket({ titulo: "t", descripcion: "d", whatsapp: "300-123-45" }));
});

test("con las tres cosas, no falta nada", () => {
  assert.equal(
    queLeFaltaAlTicket({ titulo: "No carga el QR", descripcion: "Desde ayer", whatsapp: "+57 300 123 4567" }),
    null,
  );
});

test("el numero se guarda en digitos pelados", () => {
  assert.equal(soloDigitos("+57 (300) 123-4567"), "573001234567");
  assert.equal(soloDigitos(null), "");
  assert.equal(soloDigitos(undefined), "");
  assert.equal(soloDigitos("sin numero"), "");
});

test("los topes existen y son un numero", () => {
  assert.ok(TOPE_DEL_TITULO > 0);
});
