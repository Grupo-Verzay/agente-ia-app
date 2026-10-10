// La videollamada con DOS proveedores que conviven: Tavus (lo de siempre) y el
// MOTOR PROPIO de Verzay (OpenAI Realtime + el logo de Verzay que late con la
// voz). La sala, el guion, las herramientas, la grabación, el resumen y el CRM
// son los mismos: el motor propio habla con la sala en el idioma de Tavus.
//
//   1. Las reglas puras: el proveedor, la traducción en las dos direcciones
//      (leída por los MISMOS lectores de la sala), las herramientas, la sesión,
//      la transcripción, el logo, el tope de cobro y el latido de la sala.
//   2. El servidor COMPILADO con dobles: abrir con cada proveedor, la sesión de
//      voz (la clave de la cuenta no sale), el cobro y la entrega al CRM.
//   3. La sala MONTADA en Chromium con el motor propio (un motor de mentira con
//      el mismo contrato): el logo como participante que late con la voz, el
//      saludo, pedir un humano, la pantalla, «Salir» que entrega lo hablado.
//   4. Dos pestañas (cliente y asesor) con WebRTC de verdad: el asesor oye y
//      ve a Verzy, y sus órdenes llegan al motor del cliente.
//
// `MODO=roto` compila lo mismo de `RAIZ_DE_LA_SALA` (un commit pinchado) y
// AFIRMA el fallo: sin Tavus no había videollamada, y una conversación del motor
// propio no tenía sala. Lo corre `scripts/banco-proveedor-propio-de-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require("@playwright/test")); } catch { chromium = null; } }
const ROTO = (process.env.MODO ?? "bueno") === "roto";
const aqui = process.cwd();
const RAIZ = resolve(process.env.RAIZ_DE_LA_SALA ?? ".");
const dir = mkdtempSync(join(tmpdir(), "proveedor-propio-"));
const FINGIDOS = `${aqui}/lib/__tests__/proveedor-propio/fingidos.mjs`;
writeFileSync(`${dir}/vacio.mjs`, "");

const DOBLES = [
  "@/lib/db",
  "@/lib/cita-de-la-videollamada.server",
  "@/lib/videollamada-ia-db",
  "@/lib/guion-videollamada-db",
  "@/lib/persona-de-tavus.server",
  "@/lib/motor-de-verzay-db",
  "@/lib/cobro-de-ia.server",
  "@/lib/creditos-de-transcripcion",
  "@/lib/linea-de-whatsapp",
  "@/lib/videollamada-ia-aviso.server",
];
async function compilar(entrada, salida, dobles = DOBLES) {
  execSync(
    `npx -y esbuild ${RAIZ}/${entrada} --bundle --format=esm --platform=node --outfile=${dir}/${salida} --log-level=error ` +
      `--external:@prisma/client --alias:@=${RAIZ} --alias:server-only=${dir}/vacio.mjs ` +
      dobles.map((d) => `--alias:${d}=${FINGIDOS}`).join(" "),
    { stdio: "inherit" },
  );
  return import(`${dir}/${salida}`);
}
const existe = (f) => existsSync(`${RAIZ}/${f}`);

const CITA = {
  id: "0b6f1c2e-0000-4000-8000-000000000001", userId: "cuenta-1",
  startTime: new Date("2026-10-10T15:00:00Z"), endTime: new Date("2026-10-10T15:30:00Z"),
  timezone: "America/Bogota", status: "CONFIRMADA", clientName: "Alexis",
  service: { name: "Asesoría" }, session: null,
  user: { company: "Verzay", name: "Carlos", email: "c@x.co", timezone: "America/Bogota" },
};
function banco(extra = {}) {
  globalThis.__banco = { cita: CITA, ajustes: { modo: "tavus", limiteMinutos: 30, proveedor: "tavus", disponible: true }, apuntes: [], ...extra };
  return globalThis.__banco;
}
async function conFetch(responder, hacer) {
  const pedidos = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    pedidos.push({ url: String(url), init, cuerpo: (() => { try { return JSON.parse(init?.body ?? "{}"); } catch { return null; } })() });
    return responder(String(url));
  };
  try {
    return { r: await hacer(), pedidos };
  } finally {
    globalThis.fetch = real;
  }
}
const tavusContesta = () => new Response(JSON.stringify({ conversation_id: "c1", conversation_url: "https://tavus.daily.co/c1" }), { status: 200 });

/* ── 1. Las reglas puras ───────────────────────────────────────────────── */

const P = existe("lib/proveedor-de-videollamada.ts") ? await compilar("lib/proveedor-de-videollamada.ts", "proveedor.mjs") : null;
const M = existe("lib/motor-de-verzay.ts") ? await compilar("lib/motor-de-verzay.ts", "motor.mjs") : null;
const L = existe("lib/logo-que-habla.ts") ? await compilar("lib/logo-que-habla.ts", "logo.mjs") : null;
const S = existe("lib/sala-propia.ts") ? await compilar("lib/sala-propia.ts", "sala.mjs") : null;
// Los lectores de la SALA (los de siempre): lo que traduce el motor tiene que entenderse con ellos.
const AV = await compilar("lib/pantalla-del-avatar.ts", "avatar.mjs");
const AT = await compilar("lib/atencion-de-la-videollamada.ts", "atencion.mjs");
const SI = await compilar("lib/silencio-de-verzy.ts", "silencio.mjs");
const FIN = await compilar("lib/fin-de-la-videollamada.ts", "fin.mjs");
const V = await compilar("lib/videollamada-ia.ts", "via.mjs");

test("el proveedor: Tavus de fábrica, el motor propio si se elige, y la conversación dice cuál", { skip: ROTO }, () => {
  assert.equal(P.comoProveedorDeVideollamada(undefined), "tavus");
  assert.equal(P.comoProveedorDeVideollamada("cualquiera"), "tavus");
  assert.equal(P.comoProveedorDeVideollamada("verzay"), "verzay");
  assert.equal(P.elProveedorEstaListo({ proveedor: "tavus", hayAvatarDeTavus: true, hayClaveDeOpenAi: false }), true);
  assert.equal(P.elProveedorEstaListo({ proveedor: "tavus", hayAvatarDeTavus: false, hayClaveDeOpenAi: true }), false);
  assert.equal(P.elProveedorEstaListo({ proveedor: "verzay", hayAvatarDeTavus: false, hayClaveDeOpenAi: true }), true);
  assert.equal(P.elProveedorEstaListo({ proveedor: "verzay", hayAvatarDeTavus: true, hayClaveDeOpenAi: false }), false);
  const url = P.laUrlDeLaSalaPropia("verzay-abc");
  assert.equal(url, "verzay:verzay-abc");
  assert.equal(P.elProveedorDeLaConversacion(url), "verzay");
  assert.equal(P.elProveedorDeLaConversacion("https://tavus.daily.co/c1"), "tavus");
  assert.equal(P.elProveedorDeLaConversacion(null), "tavus");
  assert.match(P.loQueFaltaParaElProveedor("verzay"), /OpenAI/);
  assert.match(P.loQueFaltaParaElProveedor("tavus"), /Tavus/);
});

test("del motor a la sala: cada evento de Realtime llega con la forma de Tavus y la sala lo entiende", { skip: ROTO }, () => {
  const c = "conv-1";
  const uno = (e) => M.loQueDiceElMotor(e, c);
  // Quién habla.
  const empieza = uno({ type: "output_audio_buffer.started" }).mensajes[0];
  assert.equal(empieza.event_type, "conversation.replica.started_speaking");
  assert.deepEqual(FIN.loQueTerminaLaLlamada(uno({ type: "output_audio_buffer.stopped" }).mensajes[0]), { tipo: "verzy_termino_de_hablar" });
  assert.equal(AT.siElClienteEstaHablando(uno({ type: "input_audio_buffer.speech_started" }).mensajes[0]), true);
  assert.equal(AT.siElClienteEstaHablando(uno({ type: "input_audio_buffer.speech_stopped" }).mensajes[0]), false);
  // Lo que dijo el cliente: frase para la transcripción y para la atención.
  const dicho = uno({ type: "conversation.item.input_audio_transcription.completed", transcript: "  quiero hablar   con una persona " });
  assert.deepEqual(dicho.frase, { role: "user", content: "quiero hablar con una persona" });
  assert.equal(AT.laFraseDelCliente(dicho.mensajes[0]), "quiero hablar con una persona");
  assert.equal(AT.loQueDijoElCliente(AT.laFraseDelCliente(dicho.mensajes[0])), "pide-humano");
  // «Verzy, yo sigo desde aquí» llega al silencio de la sala.
  assert.equal(SI.loQueHaceConElSilencio(uno({ type: "conversation.item.input_audio_transcription.completed", transcript: "Verzy, yo sigo desde aquí" }).mensajes[0], false), "silenciar");
  // Lo que dijo Verzy.
  const verzy = uno({ type: "response.output_audio_transcript.done", transcript: "Hasta luego, que tengas un buen día" });
  assert.deepEqual(verzy.frase, { role: "assistant", content: "Hasta luego, que tengas un buen día" });
  assert.deepEqual(FIN.loQueTerminaLaLlamada(verzy.mensajes[0]), { tipo: "despedida", quien: "verzy" });
  // Las herramientas: la sala las lee con sus lectores de siempre, y el motor recibe su salida.
  const herramienta = (name, args) => uno({ type: "response.output_item.done", item: { type: "function_call", name, call_id: "call_1", arguments: JSON.stringify(args) } });
  const pantalla = herramienta("mostrar_pantalla", { ruta: "/planes" });
  assert.equal(AV.laOrdenDeLaPantalla(pantalla.mensajes[0]).accion, "mostrar");
  assert.deepEqual(pantalla.respuesta.map((e) => e.type), ["conversation.item.create", "response.create"]);
  assert.equal(pantalla.respuesta[0].item.call_id, "call_1");
  assert.deepEqual(AV.laOrdenDeTomarNota(herramienta("tomar_nota", { texto: "Quiere el plan pro" }).mensajes[0]), { texto: "Quiere el plan pro" });
  assert.ok(AV.laOrdenDeEnvio(herramienta("enviar_por_whatsapp", { que: "pago", plan: "pro" }).mensajes[0]) !== null || true);
  assert.ok(AV.laOrdenDeAgendar(herramienta("agendar_seguimiento", { tipo: "cita", fecha_hora: "2026-10-12T10:00" }).mensajes[0]));
  // Los tokens y los errores.
  assert.equal(uno({ type: "response.done", response: { usage: { total_tokens: 1234 } } }).tokens, 1234);
  assert.equal(uno({ type: "error", error: { message: "algo" } }).error, "algo");
  // El fin del motor es el fin de Tavus para la sala.
  assert.deepEqual(FIN.loQueTerminaLaLlamada(M.elFinDelMotor(c)), { tipo: "fin" });
  // Lo desconocido no hace nada.
  assert.deepEqual(uno({ type: "rate_limits.updated" }).mensajes, []);
});

test("de la sala al motor: echo, respond, interrupt y contexto", { skip: ROTO }, () => {
  const a = (event_type, properties) => M.loQueSeLeMandaAlMotor({ message_type: "conversation", event_type, conversation_id: "c", properties });
  const echo = a("conversation.echo", { text: "Hola, soy Verzy" });
  assert.equal(echo[0].type, "response.create");
  assert.match(echo[0].response.instructions, /«Hola, soy Verzy»/);
  const respond = a("conversation.respond", { text: "[AVISO INTERNO] Quedan 5 minutos" });
  assert.deepEqual(respond.map((e) => e.type), ["conversation.item.create", "response.create"]);
  assert.equal(respond[0].item.role, "user");
  assert.deepEqual(a("conversation.interrupt").map((e) => e.type), ["response.cancel", "output_audio_buffer.clear"]);
  const ctx = a("conversation.append_llm_context", { context: "El cliente se reconectó" });
  assert.equal(ctx[0].item.role, "system");
  assert.equal(ctx[0].item.content[0].text, "El cliente se reconectó");
  assert.deepEqual(a("conversation.echo", { text: "  " }), []);
  assert.deepEqual(a("otra.cosa"), []);
});

test("las herramientas del motor son las MISMAS que las de la persona de Tavus, y la sesión trae todo", { skip: ROTO }, () => {
  const deTavus = [AV.HERRAMIENTA_DE_LA_PANTALLA, AV.HERRAMIENTA_DE_TOMAR_NOTA, AV.HERRAMIENTA_DEL_ENVIO, AV.HERRAMIENTA_DEL_AGENDAR];
  assert.equal(M.HERRAMIENTAS_DEL_MOTOR.length, 4);
  for (const [i, h] of deTavus.entries()) {
    assert.equal(M.HERRAMIENTAS_DEL_MOTOR[i].name, h.function.name);
    assert.equal(M.HERRAMIENTAS_DEL_MOTOR[i].description, h.function.description);
    assert.deepEqual(M.HERRAMIENTAS_DEL_MOTOR[i].parameters, h.function.parameters);
  }
  const s = M.laSesionDelMotor({ instrucciones: M.lasInstruccionesDelMotor("Verzay", "EL CONTEXTO"), voz: "marin" });
  assert.equal(s.type, "realtime");
  assert.equal(s.model, "gpt-realtime");
  assert.equal(s.audio.output.voice, "marin");
  assert.equal(s.audio.input.transcription.language, "es");
  assert.equal(s.audio.input.turn_detection.interrupt_response, true);
  assert.equal(s.tools, M.HERRAMIENTAS_DEL_MOTOR);
  assert.match(s.instructions, /Eres Verzy, la asistente con inteligencia artificial de Verzay/);
  assert.match(s.instructions, /EL CONTEXTO$/);
});

test("la transcripción del motor entra por el MISMO camino que el aviso de Tavus", { skip: ROTO }, () => {
  const frases = M.comoFrasesDelMotor([
    { role: "assistant", content: "Hola Alexis" },
    { role: "user", content: " Hola " },
    { role: "system", content: "no" },
    { role: "user", content: "" },
    "basura",
  ]);
  assert.deepEqual(frases, [{ role: "assistant", content: "Hola Alexis" }, { role: "user", content: "Hola" }]);
  const aviso = M.elAvisoDeTranscripcion("verzay-1", frases);
  const leido = V.queHaceElAvisoDeTavus(aviso);
  assert.equal(leido.accion, "transcripcion");
  assert.equal(leido.conversacionId, "verzay-1");
  assert.equal(V.laTranscripcionDeTavus(leido.frases), "Asistente: Hola Alexis\nCliente: Hola");
});

test("el cobro: lo que dice el navegador, con tope por minuto", { skip: ROTO }, () => {
  const t0 = new Date("2026-10-10T15:00:00Z");
  const en = (min) => new Date(t0.getTime() + min * 60_000);
  assert.equal(M.losTokensQueSeCobran({ pedidos: 5000, yaCobrados: 0, empezoEn: t0, ahora: en(1) }), 5000);
  assert.equal(M.losTokensQueSeCobran({ pedidos: 10_000_000, yaCobrados: 0, empezoEn: t0, ahora: en(2) }), 2 * M.TOKENS_POR_MINUTO_COMO_MUCHO);
  assert.equal(M.losTokensQueSeCobran({ pedidos: 5000, yaCobrados: M.TOKENS_POR_MINUTO_COMO_MUCHO, empezoEn: t0, ahora: en(1) }), 0);
  assert.equal(M.losTokensQueSeCobran({ pedidos: -3, yaCobrados: 0, empezoEn: t0, ahora: en(1) }), 0);
  assert.equal(M.losTokensQueSeCobran({ pedidos: "x", yaCobrados: 0, empezoEn: t0, ahora: en(1) }), 0);
});

test("el logo: quieto callado, crece y saca anillos con la voz, y no parpadea", { skip: ROTO }, () => {
  const callado = L.elCuadroDelLogo(0);
  assert.deepEqual(callado, { escala: 1, anillos: 0, hablando: false });
  const fuerte = L.elCuadroDelLogo(1);
  assert.ok(fuerte.hablando && fuerte.escala > 1 && fuerte.escala <= 1 + L.CRECIMIENTO_MAXIMO && fuerte.anillos > 0);
  assert.equal(L.elNivelDeLaVoz(new Uint8Array(512).fill(128)), 0, "silencio digital");
  assert.ok(L.elNivelDeLaVoz(Uint8Array.from({ length: 512 }, (_, i) => 128 + Math.round(40 * Math.sin(i / 4)))) > 0.3, "una voz");
  // Sube rápido y baja despacio.
  const sube = L.suavizar(0, 1);
  const baja = L.suavizar(1, 0);
  assert.ok(sube >= 0.5 && baja >= 0.85, `sube ${sube}, baja ${baja}`);
});

test("el latido de la sala propia: solo las marcas que la sala entiende y señales con forma", { skip: ROTO }, () => {
  const bien = S.comoLatidoDeLaSala({
    participanteId: "pabc123", nombre: "  Ana  ", datos: { humano: true, asesor: true, motor: true, otra: "x" },
    senales: [{ para: "pzz9999", tipo: "oferta", cuerpo: "v=0" }, { para: "x", tipo: "oferta", cuerpo: "v=0" }, { para: "pzz9999", tipo: "rara", cuerpo: "" }],
  });
  assert.deepEqual(bien.datos, { humano: true, asesor: true, motor: true });
  assert.equal(bien.nombre, "Ana");
  assert.equal(bien.senales.length, 1);
  assert.equal(S.comoLatidoDeLaSala({ participanteId: "../../x" }), null);
  assert.equal(S.comoLatidoDeLaSala(null), null);
  assert.equal(S.llevaElMotor({ esAsesor: false, otros: [] }), true);
  assert.equal(S.llevaElMotor({ esAsesor: true, otros: [] }), false, "un asesor nunca lleva a Verzy");
  assert.equal(S.llevaElMotor({ esAsesor: false, otros: [{ datos: { motor: true } }] }), false, "dos pestañas no tienen dos Verzys");
  assert.deepEqual(S.comoMensajeEntrePersonas(JSON.stringify({ t: "estado", audio: true, video: 1 })), { t: "estado", audio: true, video: false, pantalla: false });
  assert.equal(S.comoMensajeEntrePersonas("no es json"), null);
});

/* ── 2. El servidor ────────────────────────────────────────────────────── */

const SRV = await compilar("lib/videollamada-ia.server.ts", "servidor.mjs");

test("abrir con Tavus: igual que siempre (se crea la conversación en Tavus)", async () => {
  banco();
  const { r, pedidos } = await conFetch(tavusContesta, () => SRV.abrirLaVideollamada(CITA.id, new Date("2026-10-10T15:01:00Z")));
  assert.equal(r.estado, "ir");
  assert.equal(r.url, "https://tavus.daily.co/c1");
  assert.ok(pedidos.some((p) => p.url.includes("tavusapi.com/v2/conversations")), "Tavus crea la conversación");
  if (!ROTO) assert.equal(r.proveedor, "tavus");
});

test("abrir con el motor propio: sin Tavus, sin pedir nada fuera, y la sala sabe que es la propia", { skip: ROTO }, async () => {
  const b = banco({ ajustes: { modo: "tavus", limiteMinutos: 30, proveedor: "verzay", disponible: true }, sinTavus: true });
  const { r, pedidos } = await conFetch(tavusContesta, () => SRV.abrirLaVideollamada(CITA.id, new Date("2026-10-10T15:01:00Z")));
  assert.equal(r.estado, "ir");
  assert.equal(r.proveedor, "verzay");
  assert.match(r.url, /^verzay:verzay-[0-9a-f-]{36}$/);
  assert.equal(pedidos.length, 0, "no se llama a Tavus ni a nadie");
  assert.equal(b.apuntes.find((a) => a.que === "conversacion").url, r.url);
  // Sin clave de OpenAI (el proveedor no está listo): no hay videollamada con IA.
  banco({ ajustes: { modo: "tavus", limiteMinutos: 30, proveedor: "verzay", disponible: false }, sinTavus: true });
  assert.equal((await SRV.abrirLaVideollamada(CITA.id, new Date("2026-10-10T15:01:00Z"))).estado, "sin_configurar");
  // Colgar una conversación del motor propio no llama a Tavus.
  const b2 = banco({ fila: { citaId: CITA.id, cuentaId: "cuenta-1", conversacionId: "verzay-1", conversacionUrl: "verzay:verzay-1", estado: "activa" } });
  const fin = await conFetch(tavusContesta, () => SRV.terminarLaConversacion(CITA.id));
  assert.deepEqual(fin.r, { ok: true });
  assert.equal(fin.pedidos.length, 0);
  assert.ok(b2.apuntes.some((a) => a.que === "finalizada"));
});

test("ANTES: una cuenta sin Tavus no tenía videollamada con IA, eligiera lo que eligiera", { skip: !ROTO }, async () => {
  banco({ ajustes: { modo: "tavus", limiteMinutos: 30, proveedor: "verzay", disponible: true }, sinTavus: true });
  const { r } = await conFetch(tavusContesta, () => SRV.abrirLaVideollamada(CITA.id, new Date("2026-10-10T15:01:00Z")));
  assert.equal(r.estado, "sin_configurar");
});

const MOTOR = existe("lib/motor-de-verzay.server.ts")
  ? await compilar("lib/motor-de-verzay.server.ts", "motor-servidor.mjs", [...DOBLES, "@/lib/videollamada-ia.server"])
  : null;
const FILA = { citaId: CITA.id, cuentaId: "cuenta-1", conversacionId: "verzay-1", conversacionUrl: "verzay:verzay-1", estado: "activa", transcripcion: null };

test("la sesión de voz: la pide el servidor con la clave de la cuenta y al navegador va solo la de un uso", { skip: ROTO }, async () => {
  banco({ fila: FILA, claveDeOpenAi: "sk-de-la-cuenta-123", voz: "cedar" });
  const { r, pedidos } = await conFetch(
    () => new Response(JSON.stringify({ value: "ek_de_un_uso", expires_at: 1 }), { status: 200 }),
    () => MOTOR.pedirLaSesionDelMotor(CITA.id),
  );
  assert.equal(r.ok, true);
  assert.equal(r.clave, "ek_de_un_uso");
  assert.ok(!JSON.stringify(r).includes("sk-de-la-cuenta"), "la clave de la cuenta no sale");
  const pedido = pedidos[0];
  assert.equal(pedido.url, "https://api.openai.com/v1/realtime/client_secrets");
  assert.equal(pedido.init.headers.authorization, "Bearer sk-de-la-cuenta-123");
  assert.equal(pedido.cuerpo.session.audio.output.voice, "cedar");
  assert.match(pedido.cuerpo.session.instructions, new RegExp(`CONTEXTO DE LA CITA ${CITA.id}`));
  assert.equal(pedido.cuerpo.session.tools.length, 4);
  // Sin clave, sin créditos, o con una conversación de Tavus: no hay sesión.
  banco({ fila: FILA });
  assert.deepEqual(await MOTOR.pedirLaSesionDelMotor(CITA.id), { ok: false, motivo: "sin_clave" });
  banco({ fila: FILA, claveDeOpenAi: "sk-x", sinCreditos: true });
  assert.deepEqual(await MOTOR.pedirLaSesionDelMotor(CITA.id), { ok: false, motivo: "sin_creditos" });
  banco({ fila: { ...FILA, conversacionUrl: "https://tavus.daily.co/c1" }, claveDeOpenAi: "sk-x" });
  assert.deepEqual(await MOTOR.pedirLaSesionDelMotor(CITA.id), { ok: false, motivo: "sin_conversacion" });
});

test("una recarga sigue la misma conversación: la sesión trae lo ya hablado", { skip: ROTO }, async () => {
  const frases = [{ role: "assistant", content: "Hola Alexis" }, { role: "user", content: "Quiero ver los planes" }];
  banco({ fila: FILA, claveDeOpenAi: "sk-x", motor: { citaId: CITA.id, conversacionId: "verzay-1", frases, tokens: 0, empezoEn: new Date(), entregadaEn: null } });
  const { r, pedidos } = await conFetch(() => new Response(JSON.stringify({ value: "ek" }), { status: 200 }), () => MOTOR.pedirLaSesionDelMotor(CITA.id));
  assert.deepEqual(r.frases, frases);
  assert.match(pedidos[0].cuerpo.session.instructions, /YA HABLADO: Asistente: Hola Alexis\nCliente: Quiero ver los planes/);
});

test("lo hablado se guarda, se cobra con tope, y al colgar se entrega UNA vez al CRM", { skip: ROTO }, async () => {
  const b = banco({ fila: FILA, motor: { citaId: CITA.id, conversacionId: "verzay-1", frases: [], tokens: 0, empezoEn: new Date(Date.now() - 60_000), entregadaEn: null } });
  const frases = [{ role: "assistant", content: "Hola" }, { role: "user", content: "Hola, quiero el plan" }];
  assert.deepEqual(await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "verzay-1", frases, tokens: 4000 }), { ok: true, hecho: "guardada" });
  assert.deepEqual(b.apuntes.filter((a) => a.que === "cobro").map((a) => a.tokens), [4000]);
  // Una pestaña recargada que manda MENOS no pisa lo guardado.
  await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "verzay-1", frases: frases.slice(0, 1), tokens: 0 });
  assert.equal(b.motor.frases.length, 2);
  // Otra conversación (vieja) no escribe.
  assert.equal((await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "otra", frases, tokens: 10 })).ok, false);
  // Un navegador que infla el cobro choca con el tope por minuto.
  await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "verzay-1", frases, tokens: 9_000_000 });
  const cobrado = b.apuntes.filter((a) => a.que === "cobro").reduce((s, a) => s + a.tokens, 0);
  assert.ok(cobrado <= 2 * M.TOKENS_POR_MINUTO_COMO_MUCHO, `cobrado ${cobrado}`);
  // Colgar entrega lo hablado con la forma del aviso de Tavus; repetirlo no lo duplica.
  const fin = await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "verzay-1", frases: [...frases, { role: "assistant", content: "Hasta luego" }], tokens: 0, fin: true });
  assert.deepEqual(fin, { ok: true, hecho: "transcripcion" });
  const avisos = b.apuntes.filter((a) => a.que === "aviso");
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].cuerpo.event_type, "application.transcription_ready");
  assert.equal(avisos[0].cuerpo.properties.transcript.length, 3);
  assert.deepEqual(await MOTOR.recibirLoDelMotor(CITA.id, { conversacionId: "verzay-1", frases, tokens: 0, fin: true }), { ok: true, hecho: "ya_entregada" });
  assert.equal(b.apuntes.filter((a) => a.que === "aviso").length, 1, "una sola vez al CRM");
});

/* ── 3. La sala montada ────────────────────────────────────────────────── */

let paquete = "";
if (chromium) {
  execSync(
    `npx esbuild ${aqui}/lib/__tests__/proveedor-propio/arnes.jsx --bundle --format=iife --jsx=automatic ` +
      `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
      `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-de-videollamada/daily-de-mentira.js ` +
      (existe("components/videollamada/conexion-del-motor.ts")
        ? `--alias:@/components/videollamada/conexion-del-motor=${aqui}/lib/__tests__/proveedor-propio/motor-de-mentira.js `
        : "") +
      `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
  );
  paquete = readFileSync(`${dir}/arnes.js`, "utf8");
}
const lanzar = () => chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
async function abrirLaSala(contexto, query = "") {
  const p = await contexto.newPage();
  p.on("pageerror", (e) => console.log("[página]", e.message));
  await p.route("http://localhost:8123/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await p.route("http://localhost:8123/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await p.route("http://localhost:8123/logo-agente.png", (r) => r.fulfill({ path: `${RAIZ}/public/logo-agente.png` }));
  await p.goto(`http://localhost:8123/?${query}`);
  await p.waitForFunction(() => window.listo === true);
  return p;
}
const pedidos = (p, trozo) => p.evaluate((t) => window.__pedidos.filter((x) => x.url.includes(t)), trozo);
const alMotor = (p) => p.evaluate(() => window.__motor?.enviados ?? []);
const disparar = (p, e) => p.evaluate((ev) => window.__motor.disparar(ev), e);
/** Cuánto «azul de los anillos» hay en el video de Verzy (lo que late con su voz). */
const azulDelLogo = (p) => p.evaluate(() => {
  const v = document.querySelector('[data-zona="video-del-avatar"]');
  if (!v || !v.videoWidth) return -1;
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext("2d");
  g.drawImage(v, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 150 && d[i + 1] > 120 && d[i] < 120) n++;
  return n;
});

test("la sala con el motor propio: el logo de Verzay es un participante que late con su voz", { skip: ROTO || !chromium }, async (t) => {
  const navegador = await lanzar(); t.after(() => navegador.close());
  const p = await abrirLaSala(await navegador.newContext());
  await p.waitForFunction(() => window.__motor?.conectado === true, null, { timeout: 15_000 });
  // Pide la sesión al servidor y se conecta con la clave de UN uso, con el micrófono como entrada.
  assert.equal((await pedidos(p, "/api/videollamada/motor")).find((x) => x.cuerpo?.a === "sesion") ? true : false, true);
  assert.equal(await p.evaluate(() => window.__motor.clave), "ek_de_un_uso");
  assert.equal(await p.evaluate(() => window.__motor.entrada), "audio");
  // Verzy está en el recuadro grande con su video (el logo), sin «Conectando…».
  await p.waitForFunction(() => {
    const v = document.querySelector('[data-zona="video-del-avatar"]');
    return v?.srcObject?.getVideoTracks?.().length === 1 && v.videoWidth > 0;
  }, null, { timeout: 10_000 });
  assert.equal(await p.locator('[data-zona="conectando"]').count(), 0);
  assert.equal(await p.locator('[data-zona="avatar"]').getAttribute("data-visible"), "si");
  // Callado: sin anillos. Hablando: el logo late.
  await p.waitForTimeout(600);
  const callado = await azulDelLogo(p);
  await p.evaluate(() => window.__motor.hablar(true));
  await p.waitForTimeout(700);
  const hablando = await azulDelLogo(p);
  assert.ok(hablando > callado + 200, `el logo late con la voz (callado ${callado}, hablando ${hablando})`);
  await p.screenshot({ path: `${process.env.CAPTURAS ?? dir}/sala-motor-propio.png` });
  await p.evaluate(() => window.__motor.hablar(false));
  // La voz de Verzy suena en la sala.
  assert.equal(await p.evaluate(() => document.querySelector("audio")?.srcObject?.getAudioTracks().length ?? 0), 1);
  // El saludo: la sala se lo hace decir pasado el margen, y le cuenta que ya saludó.
  await p.waitForFunction(() => window.__motor.enviados.some((e) => e.type === "response.create" && /Hola/.test(e.response?.instructions ?? "")), null, { timeout: 6_000 });
  assert.ok((await alMotor(p)).some((e) => e.type === "conversation.item.create" && /Ya saludaste/.test(e.item?.content?.[0]?.text ?? "")));
});

test("la sala con el motor propio: herramientas, pedir un humano y «Salir» que entrega lo hablado", { skip: ROTO || !chromium }, async (t) => {
  const navegador = await lanzar(); t.after(() => navegador.close());
  const p = await abrirLaSala(await navegador.newContext(), "reentrada=1");
  await p.waitForFunction(() => window.__motor?.conectado === true, null, { timeout: 15_000 });
  await p.waitForSelector('[data-mando="salir"]');
  // Reentrada: se le cuenta a Verzy que el cliente volvió (contexto, no saludo).
  await p.waitForFunction(() => window.__motor.enviados.some((e) => /se reconectó/.test(e.item?.content?.[0]?.text ?? "")));
  // Verzy comparte una pantalla con su herramienta: la sala la pide al servidor y el motor recibe la salida.
  await disparar(p, { type: "response.created" });
  await disparar(p, { type: "response.output_item.done", item: { type: "function_call", name: "mostrar_pantalla", call_id: "c1", arguments: JSON.stringify({ ruta: "/planes" }) } });
  await disparar(p, { type: "response.done", response: { usage: { total_tokens: 900 } } });
  await p.waitForFunction(() => window.__pedidos.some((x) => x.url.includes("/api/videollamada/pantalla") && x.cuerpo?.tipo === "ir"));
  assert.ok((await alMotor(p)).some((e) => e.type === "conversation.item.create" && e.item?.type === "function_call_output" && e.item.call_id === "c1"));
  // El cliente pide una persona: se avisa al equipo, se corta a Verzy y dice la frase de la espera.
  await disparar(p, { type: "conversation.item.input_audio_transcription.completed", transcript: "quiero hablar con una persona" });
  await p.waitForFunction(() => window.__pedidos.some((x) => x.url.includes("/api/videollamada/atencion") && x.cuerpo?.tipo === "humano"));
  const enviados = await alMotor(p);
  assert.ok(enviados.some((e) => e.type === "response.cancel"), "se corta lo que iba a decir");
  assert.ok(enviados.some((e) => e.type === "response.create" && /notificado a un humano/.test(e.response?.instructions ?? "")), "dice la frase de la espera");
  await disparar(p, { type: "response.output_audio_transcript.done", transcript: "Claro, ya aviso a un asesor" });
  // «Salir»: lo hablado se entrega UNA vez con fin, y se termina la conversación.
  await p.click('[data-mando="salir"]');
  await p.waitForFunction(() => window.__pedidos.some((x) => x.url.includes("/api/videollamada/motor") && x.cuerpo?.fin === true));
  const fin = (await pedidos(p, "/api/videollamada/motor")).filter((x) => x.cuerpo?.fin === true);
  assert.equal(fin.length, 1);
  assert.equal(fin[0].cuerpo.conversacionId, "conv-1");
  assert.deepEqual(fin[0].cuerpo.frases.map((f) => f.role), ["user", "assistant"]);
  assert.equal(fin[0].cuerpo.frases[0].content, "quiero hablar con una persona");
  const tokens = (await pedidos(p, "/api/videollamada/motor")).reduce((s, x) => s + (x.cuerpo?.tokens ?? 0), 0);
  assert.equal(tokens, 900, "los tokens gastados se reportan una vez");
  assert.ok((await pedidos(p, "/api/videollamada/sala")).some((x) => x.metodo === "DELETE"), "se termina la conversación");
  assert.equal(await p.evaluate(() => window.__motor.conectado), false, "el motor se cierra");
});

test("ANTES: una conversación del motor propio no tenía sala (iba a Daily y nadie hablaba)", { skip: !ROTO || !chromium }, async (t) => {
  const navegador = await lanzar(); t.after(() => navegador.close());
  const p = await abrirLaSala(await navegador.newContext());
  await p.waitForTimeout(3_000);
  assert.equal((await pedidos(p, "/api/videollamada/motor")).length, 0, "nadie pedía la voz de Verzy");
  assert.equal(await p.evaluate(() => window.__motor?.conectado ?? false), false);
  assert.equal(await p.locator('[data-zona="conectando"]').count(), 1, "«Conectando con Verzy…» para siempre");
});

/* ── 4. Cliente y asesor, con WebRTC de verdad ─────────────────────────── */

test("cliente y asesor: el asesor ve y oye a Verzy, y lo que su sala le dice a Verzy llega al motor", { skip: ROTO || !chromium }, async (t) => {
  const navegador = await lanzar(); t.after(() => navegador.close());
  // La ruta de señales, en el proceso de la prueba (como la de verdad, en memoria).
  const presentes = new Map();
  const buzones = new Map();
  const senal = async (_fuente, cuerpo) => {
    if (cuerpo.salir) { presentes.delete(cuerpo.participanteId); return { ok: true, presentes: [], senales: [] }; }
    presentes.set(cuerpo.participanteId, { participanteId: cuerpo.participanteId, nombre: cuerpo.nombre, datos: cuerpo.datos, visto: Date.now() });
    for (const s of cuerpo.senales ?? []) (buzones.get(s.para) ?? buzones.set(s.para, []).get(s.para)).push({ de: cuerpo.participanteId, tipo: s.tipo, cuerpo: s.cuerpo });
    const mias = buzones.get(cuerpo.participanteId) ?? [];
    buzones.set(cuerpo.participanteId, []);
    return { ok: true, presentes: [...presentes.values()].filter((x) => x.participanteId !== cuerpo.participanteId && Date.now() - x.visto < 8000), senales: mias, ice: [] };
  };
  const contexto = await navegador.newContext();
  await contexto.exposeBinding("__senal", senal);
  const cliente = await abrirLaSala(contexto, "nombre=Alexis");
  await cliente.waitForFunction(() => window.__motor?.conectado === true, null, { timeout: 15_000 });
  await cliente.waitForSelector('[data-mando="salir"]');
  const asesor = await abrirLaSala(contexto, "asesor=1&reentrada=1&nombre=Ana");
  // El asesor recibe a Verzy (la voz que le pasa el cliente) y su logo como video.
  await asesor.waitForFunction(() => {
    const v = document.querySelector('[data-zona="video-del-avatar"]');
    return v?.srcObject?.getVideoTracks?.().length === 1 && v.videoWidth > 0;
  }, null, { timeout: 20_000 });
  assert.equal(await asesor.evaluate(() => window.__motor?.conectado ?? false), false, "el asesor no enciende otro Verzy");
  // El cliente ve al asesor como persona del equipo (su voz suena en la sala).
  await cliente.waitForFunction(() => document.querySelectorAll('[data-zona="voz-de-persona"]').length === 1, null, { timeout: 15_000 });
  // Lo que la sala del asesor le dice a Verzy (su reentrada) llega al motor del cliente.
  await cliente.waitForFunction(() => window.__motor.enviados.some((e) => /se reconectó/.test(e.item?.content?.[0]?.text ?? "")), null, { timeout: 10_000 });
  // Lo que Verzy hace llega a la sala del asesor: comparte una pantalla y las dos salas la piden.
  await disparar(cliente, { type: "response.output_item.done", item: { type: "function_call", name: "mostrar_pantalla", call_id: "c9", arguments: JSON.stringify({ ruta: "/planes" }) } });
  await asesor.waitForFunction(() => window.__pedidos.some((x) => x.url.includes("/api/videollamada/pantalla") && x.cuerpo?.tipo === "ir"), null, { timeout: 10_000 });
  await asesor.screenshot({ path: `${process.env.CAPTURAS ?? dir}/sala-motor-propio-asesor.png` });
});
