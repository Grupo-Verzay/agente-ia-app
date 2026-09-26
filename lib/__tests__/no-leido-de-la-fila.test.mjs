/**
 * La regla del «sin leer» de la lista de Chats.
 *
 * Corre en DOS modos, y el roto lleva **la condición de antes escrita dentro,
 * literal** —no un worktree: la función de ahora no existía, así que no hay un
 * «antes» suyo que sacar de git—. Con esa condición se afirma el fallo tal como
 * se reportó: un contacto escribe y el chat nace leído.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  elChatEstaSinLeer,
  elCorteDeLaLinea,
  llaveDelCorte,
  sembrarLosCortes,
} from "./.compilado/no-leido-de-la-fila.js";

const MODO = process.env.MODO ?? "bueno";

/**
 * La condición que decidía antes, copiada de `chat-sidebar.tsx` tal cual:
 *
 * ```ts
 * const isRead = !isForcedUnread && (wasSeenPreviously || base._lastFromMe
 *              || isSelected || (!base._hasUnreadFromServer && !hasLocalPending));
 * const isUnreadLocal = (Boolean(base.lastMessageId) || hasLocalPending) && !isRead;
 * ```
 */
function comoSeDecidiaAntes(lo) {
  const isRead =
    !lo.marcadoAMano &&
    (lo.yaSeVio ||
      lo.loMandoLaLinea ||
      lo.estaAbierto ||
      (!lo.elProveedorDiceQueHayNoLeidos && !lo.pendienteDelHookDeAvisos));
  return (lo.hayUltimoMensaje || lo.pendienteDelHookDeAvisos) && !isRead;
}

/**
 * El reloj con el que se siembra. Fijo, no `Date.now()`: un banco que depende
 * de la hora a la que corre es un banco que falla una vez cada tanto.
 */
const AHORA = 1_000_000;

/** Un contacto acaba de escribir en una línea Waha, que es el caso de siempre. */
const ENTRANTE = {
  hayUltimoMensaje: true,
  loMandoLaLinea: false,
  estaAbierto: false,
  yaSeVio: false,
  marcadoAMano: false,
  ts: 2_000,
  corteDeLaLinea: 1_000,
};

// ── El fallo, afirmado con la condición de antes ─────────────────────────────

test("ANTES: con el contador del proveedor en 0 el chat nacía LEÍDO", () => {
  // Es el caso de producción: la lista sale de nuestra base —toda línea Waha, y
  // cualquiera cuando Evolution no contesta— y ahí `unreadCount` vale 0 siempre
  // para WhatsApp. El hook de avisos tampoco lo cazaba: descartaba a propósito
  // los chats que aparecen por primera vez.
  const sinLeerAntes = comoSeDecidiaAntes({
    ...ENTRANTE,
    elProveedorDiceQueHayNoLeidos: false,
    pendienteDelHookDeAvisos: false,
  });
  assert.equal(sinLeerAntes, false, "el «antes» tiene que reproducir el fallo");

  // Y la regla de ahora, sobre los MISMOS datos, dice lo correcto.
  assert.equal(elChatEstaSinLeer(ENTRANTE), true);
});

test("ANTES: la IA contestando no era lo que lo tapaba", () => {
  // Con la IA apagada el resultado era el mismo, que es lo que descartaba a la
  // IA como causa: lo que tapaba era el contador del proveedor, no el `fromMe`.
  for (const pendiente of [false]) {
    assert.equal(
      comoSeDecidiaAntes({
        ...ENTRANTE,
        elProveedorDiceQueHayNoLeidos: false,
        pendienteDelHookDeAvisos: pendiente,
      }),
      false,
    );
  }
});

// ── La regla ────────────────────────────────────────────────────────────────

test("un mensaje entrante deja el chat SIN LEER", () => {
  assert.equal(elChatEstaSinLeer(ENTRANTE), true);
});

test("y lo limpia que alguien lo ABRA, no otra cosa", () => {
  // Abierto ahora.
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, estaAbierto: true }), false);
  // Abierto antes: la marca de este navegador lo cubre.
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, yaSeVio: true }), false);
});

test("lo que escribió la propia línea no es un mensaje que leer", () => {
  // Vale para el asesor, para la IA, para un flujo y para una campaña: los
  // cuatro salen con `fromMe`.
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, loMandoLaLinea: true }), false);
});

test("sin último mensaje no hay nada que juzgar", () => {
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, hayUltimoMensaje: false }), false);
});

test("marcar a mano gana sobre TODO, incluso con el chat abierto", () => {
  assert.equal(
    elChatEstaSinLeer({
      ...ENTRANTE,
      marcadoAMano: true,
      estaAbierto: true,
      yaSeVio: true,
      loMandoLaLinea: true,
    }),
    true,
  );
});

test("una respuesta de la IA NO limpia el mensaje del contacto que quedó sin leer", () => {
  // La IA contesta: la fila pasa a `fromMe` y el chat se da por leído. Es lo
  // correcto —la conversación siguió— y es la razón por la que el fallo no se
  // notaba con la IA encendida. Con la IA apagada la fila se queda en el
  // mensaje del contacto, y ahí es donde tenía que salir en rojo y no salía.
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, loMandoLaLinea: true }), false);
  assert.equal(elChatEstaSinLeer(ENTRANTE), true);
});

// ── El corte ────────────────────────────────────────────────────────────────

test("el corte da por leído lo que YA ESTABA, y nada más", () => {
  const cortes = new Map([["VENTAS", 1_000]]);
  const viejo = { ...ENTRANTE, ts: 900, corteDeLaLinea: elCorteDeLaLinea(cortes, "VENTAS") };
  const nuevo = { ...ENTRANTE, ts: 1_001, corteDeLaLinea: elCorteDeLaLinea(cortes, "VENTAS") };
  assert.equal(elChatEstaSinLeer(viejo), false, "lo de antes del corte, leído");
  assert.equal(elChatEstaSinLeer(nuevo), true, "lo de después, sin leer");
  // El chat que marca el corte es el propio más reciente: queda leído.
  assert.equal(elChatEstaSinLeer({ ...viejo, ts: 1_000 }), false);
});

test("sin corte sembrado NO se tapa nada", () => {
  // Una línea que esta pestaña no ha visto todavía: lo que traiga cuenta.
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, corteDeLaLinea: 0 }), true);
});

test("un chat SIN fecha no lo tapa el corte: se ve de más, nunca de menos", () => {
  assert.equal(elChatEstaSinLeer({ ...ENTRANTE, ts: 0, corteDeLaLinea: 9_999 }), true);
});

test("el corte es POR LÍNEA: el mismo contacto en dos no comparte marca", () => {
  const cortes = new Map([
    ["VENTAS", 1_000],
    ["ATENCION", 5_000],
  ]);
  assert.equal(elCorteDeLaLinea(cortes, "VENTAS"), 1_000);
  assert.equal(elCorteDeLaLinea(cortes, "ATENCION"), 5_000);
  // Una línea que nadie sembró no hereda la de al lado.
  assert.equal(elCorteDeLaLinea(cortes, "NOTIFICACIONES"), 0);
});

test("una fila sin línea cae en la llave vacía, que es una línea más", () => {
  assert.equal(llaveDelCorte(undefined), "");
  assert.equal(llaveDelCorte(null), "");
  assert.equal(llaveDelCorte("  VENTAS  "), "VENTAS");
  const cortes = new Map([["", 1_000]]);
  assert.equal(elCorteDeLaLinea(cortes, undefined), 1_000);
});

// ── La siembra ──────────────────────────────────────────────────────────────

test("se siembra con el MÁS RECIENTE de cada línea, no con `now()`", () => {
  const nuevos = sembrarLosCortes(
    new Map(),
    [
      { instanceName: "VENTAS", ts: 500 },
      { instanceName: "VENTAS", ts: 900 },
      { instanceName: "VENTAS", ts: 300 },
      { instanceName: "ATENCION", ts: 7_000 },
    ],
    AHORA,
  );
  assert.deepEqual([...nuevos.entries()].sort(), [
    ["ATENCION", 7_000],
    ["VENTAS", 900],
  ]);
});

test("una línea ya sembrada NO se vuelve a tocar", () => {
  // Es lo que impide el fallo original por la otra puerta: un corte que se
  // mueve en cada vuelta taparía todo lo que entre a partir de ahora.
  const cortes = new Map([["VENTAS", 1_000]]);
  assert.equal(sembrarLosCortes(cortes, [{ instanceName: "VENTAS", ts: 9_999 }], AHORA), null);
});

test("sin nada que sembrar devuelve `null`, no un mapa nuevo", () => {
  // Para que quien llama no escriba en el navegador ni repinte por gusto: es el
  // caso de TODAS las vueltas menos la primera de cada línea.
  assert.equal(sembrarLosCortes(new Map(), [], AHORA), null);
  assert.equal(sembrarLosCortes(new Map(), [{ instanceName: "VENTAS", ts: 0 }], AHORA), null);
  assert.equal(sembrarLosCortes(new Map(), [{ instanceName: "VENTAS" }], AHORA), null);
});

test("una línea nueva siembra la suya sin tocar las que ya estaban", () => {
  const cortes = new Map([["VENTAS", 1_000]]);
  const nuevos = sembrarLosCortes(cortes, [
    { instanceName: "VENTAS", ts: 9_999 },
    { instanceName: "SOPORTE", ts: 4_000 },
  ], AHORA);
  assert.equal(nuevos.get("VENTAS"), 1_000, "la de antes no se mueve");
  assert.equal(nuevos.get("SOPORTE"), 4_000);
});

test("sembrar no muta el mapa que recibe", () => {
  const cortes = new Map();
  sembrarLosCortes(cortes, [{ instanceName: "VENTAS", ts: 900 }], AHORA);
  assert.equal(cortes.size, 0);
});

// ── Las dos mitades, encadenadas ────────────────────────────────────────────

test("ENCADENADO: se siembra, entra un mensaje y ese —solo ese— sale sin leer", () => {
  const filas = [
    { instanceName: "VENTAS", ts: 900, jid: "a" },
    { instanceName: "VENTAS", ts: 800, jid: "b" },
  ];
  const cortes = sembrarLosCortes(new Map(), filas, AHORA);

  // Con la bandeja tal como estaba: ninguno sin leer.
  for (const fila of filas) {
    assert.equal(
      elChatEstaSinLeer({
        ...ENTRANTE,
        ts: fila.ts,
        corteDeLaLinea: elCorteDeLaLinea(cortes, fila.instanceName),
      }),
      false,
      `${fila.jid} no puede salir sin leer: ya estaba`,
    );
  }

  // Llega uno nuevo a «b».
  const conMensaje = [
    { instanceName: "VENTAS", ts: 1_500, jid: "b" },
    { instanceName: "VENTAS", ts: 900, jid: "a" },
  ];
  // La vuelta siguiente NO vuelve a sembrar.
  assert.equal(sembrarLosCortes(cortes, conMensaje, AHORA), null);

  const sinLeer = conMensaje.filter((fila) =>
    elChatEstaSinLeer({
      ...ENTRANTE,
      ts: fila.ts,
      corteDeLaLinea: elCorteDeLaLinea(cortes, fila.instanceName),
    }),
  );
  assert.deepEqual(sinLeer.map((f) => f.jid), ["b"]);

  // Y al abrirlo se limpia, sin tocar el corte.
  assert.equal(
    elChatEstaSinLeer({
      ...ENTRANTE,
      ts: 1_500,
      yaSeVio: true,
      corteDeLaLinea: elCorteDeLaLinea(cortes, "VENTAS"),
    }),
    false,
  );
});

test(`el modo es ${MODO}`, () => {
  assert.ok(["bueno", "roto"].includes(MODO));
});

// ── Y que la bandeja PASE por la regla ──────────────────────────────────────
//
// Lo de arriba prueba la decisión; esto prueba que es la que corre. El fallo no
// estaba en ninguna función: estaba en que la pantalla preguntaba otra cosa.

import { readFileSync } from "node:fs";

/**
 * Sin los comentarios.
 *
 * El arreglo lleva escrito al lado POR QUÉ el contador del proveedor ya no
 * decide, así que un barrido sobre el texto crudo lo encontraría ahí y tumbaría
 * al banco que lo protege. Es la misma trampa que ya costó una vuelta en el
 * barrido de `BarraDeAcciones`.
 */
function sinComentarios(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SIDEBAR = sinComentarios(
  readFileSync(
    new URL("../../app/(root)/chats/_components/chat-sidebar.tsx", import.meta.url),
    "utf8",
  ),
);

test("la barra lateral decide con `elChatEstaSinLeer` y con nada más", () => {
  assert.match(SIDEBAR, /elChatEstaSinLeer\(\{/, "la regla tiene que usarse");
  // `isUnreadLocal` se escribe en DOS sitios: el valor de partida de la pasada
  // cara (`isUnreadLocal: false`) y el que decide. Solo puede calcularse una vez.
  const asignaciones = SIDEBAR.match(/const isUnreadLocal = /g) ?? [];
  assert.equal(asignaciones.length, 1, "una sola decisión, no dos");
});

test("el `unreadCount` del proveedor ya no decide quién está sin leer", () => {
  // Para WhatsApp vale 0 siempre cuando la lista sale de nuestra base, así que
  // volver a mirarlo aquí es volver a dar por leído todo.
  //
  // `filterCounts.unread` —el número de la pastilla «Sin leer»— sí se sigue
  // pasando a la barra de pestañas: ese sale de contar las filas, no del
  // proveedor. Lo que no puede volver es leer el `unreadCount` de un chat.
  assert.equal(/chat\.unreadCount|\.unreadCount \?\?/.test(SIDEBAR), false);
  assert.equal(SIDEBAR.includes("hasUnreadFromServer"), false);
});

test("no queda un segundo mecanismo enchufado a la fila", () => {
  // `pendingUnreadJids` del hook de avisos: ventana de cinco minutos, sin los
  // chats que aparecen por primera vez, y en estado de React. Avisa, no decide.
  assert.equal(SIDEBAR.includes("inactiveAgentUnreadJids"), false);
  const CLIENTE = sinComentarios(
    readFileSync(
      new URL("../../app/(root)/chats/_components/chats-client.tsx", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(CLIENTE.includes("pendingUnreadJids"), false);
  const AVISOS = sinComentarios(
    readFileSync(
      new URL("../../hooks/chats/useAdvisorNotifications.ts", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(AVISOS.includes("return { pendingUnreadJids }"), false);
});

test("el corte se siembra detrás de haber leído lo guardado", () => {
  // Sembrar sobre el mapa vacío del primer pintado re-sembraría la línea en
  // cada entrada a Chats, y un corte que se mueve tapa todo lo que haya entrado.
  assert.match(SIDEBAR, /if \(!cortesLeidos \|\| contactosBase\.length === 0\) return;/);
  assert.match(SIDEBAR, /sembrarLosCortes\(cortesDeLoYaLeido, contactosBase, Date\.now\(\)\)/);
});

test("con el chat abierto la marca AVANZA, salvo si se marcó a mano", () => {
  assert.match(SIDEBAR, /if \(forcedUnreadJids\.has\(fila\._remoteJid\)\) return;/);
  assert.match(
    SIDEBAR,
    /markMessageAsSeen\(fila\._remoteJid, fila\.lastMessageId, fila\.instanceName, fila\.ts\);/,
  );
});

test("y solo escribe cuando el último mensaje del chat abierto cambia", () => {
  // `contactosBase` llega nuevo en cada vuelta de la lista: sin este guardián
  // se rehace la pasada de miles de filas y se serializa el navegador cada 20 s
  // para no cambiar nada.
  assert.match(SIDEBAR, /if \(ultimoMarcado\.current === llave\) return;/);
});

test("el corte NO puede quedar en el FUTURO", () => {
  // Una marca mal sellada —segundos donde se esperaban milisegundos, el fallo
  // que este repositorio ya pagó dos veces— sembraría el corte meses adelante y
  // dejaría la línea ENTERA leída hasta entonces, sin un solo error.
  const nuevos = sembrarLosCortes(
    new Map(),
    [{ instanceName: "VENTAS", ts: AHORA * 1000 }],
    AHORA,
  );
  assert.equal(nuevos.get("VENTAS"), AHORA);
  // Y el mensaje que llegue después sigue saliendo sin leer.
  assert.equal(
    elChatEstaSinLeer({ ...ENTRANTE, ts: AHORA + 1, corteDeLaLinea: AHORA }),
    true,
  );
});
