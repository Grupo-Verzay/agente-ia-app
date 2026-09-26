/**
 * El invariante que este banco protege, en una linea:
 *
 *   **La pantalla de CRM › Reglas no puede prometer una SOLICITUD que el
 *   servidor no va a archivar.**
 *
 * De donde sale: el clasificador del CRM archivaba «quiero mas informacion»
 * como SOLICITUD, y con SOLICITUD en la lista de tipos que ponen el chat «En
 * espera» eso sellaba la bandeja entera desde el primer mensaje. La correccion
 * no es sacar SOLICITUD de la lista —una solicitud de verdad SI hay que
 * atenderla— sino arreglar la clasificacion: solo es SOLICITUD cuando ya se
 * tomaron el nombre, el producto o servicio y los detalles.
 *
 * El prompt del clasificador vive en DOS sitios y esta es la mitad de la App:
 * `buildLeadFunnelPromptFromConfig` arma el texto que se GUARDA en
 * `agentPrompt` en cuanto alguien abre esa pantalla, y desde entonces el
 * backend prefiere ese texto sobre el suyo. Por eso aqui se comprueban las dos
 * cosas: que el texto por defecto ya no llama SOLICITUD a pedir informacion, y
 * que la pantalla lo DICE —porque una cuenta puede llevar anos con la
 * definicion vieja guardada y su campo editable no decide solo—.
 *
 * La regla de verdad, la que no depende de este texto, la anade y la comprueba
 * el backend (`lead-funnel/utils/solicitud-con-datos.ts`).
 *
 * Se levanta con `scripts/banco-solicitud-en-las-reglas.sh`. `MODO=roto` lee
 * los mismos ficheros de un commit PINCHADO y afirma el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "4e3bddf";
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (f) =>
  ROTO
    ? execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: raiz })
    : readFileSync(path.join(raiz, f), "utf8");

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const { CRM_LEAD_FUNNEL_PROMPT_DEFAULTS, buildLeadFunnelPromptFromConfig } = await import(
  path.join(compilado, "crm-ai-prompt-rules.js")
);

const REGLAS = "lib/crm-ai-prompt-rules.ts";
const PANTALLA = "app/(root)/crm/rules/components/CrmLeadFunnelPromptWizard.tsx";

test("la definicion por defecto de SOLICITUD pide los TRES datos", () => {
  const solicitud = CRM_LEAD_FUNNEL_PROMPT_DEFAULTS.typeInstructions.SOLICITUD;
  if (ROTO) {
    // El texto de antes: la entrada de cualquier conversacion.
    assert.match(leer(REGLAS), /SOLICITUD:\s*\n\s*"Pide información, precio, cotización/);
    return;
  }
  assert.match(solicitud, /DATOS YA TOMADOS/);
  for (const dato of [/NOMBRE/, /PRODUCTO/, /DETALLES/]) assert.match(solicitud, dato);
  assert.match(solicitud, /NO es SOLICITUD/);
  // Y lo que era la definicion entera, ahora es lo que la descarta.
  assert.match(solicitud, /pedir información[^"]*es conversación/);
});

test("ninguna regla suelta manda lo contrario", () => {
  const texto = buildLeadFunnelPromptFromConfig(CRM_LEAD_FUNNEL_PROMPT_DEFAULTS);
  if (ROTO) {
    const antes = leer(REGLAS);
    // Las dos que se contradecian con la herramienta de escalar.
    assert.match(antes, /intencion de compra, cotizacion, informacion, soporte[^"]*=> REGISTRO/);
    assert.match(antes, /"me interesa", "cómo compro", es REGISTRO tipo SOLICITUD/);
    assert.match(antes, /No clasifiques como REPORTE si hay una intención comercial implícita/);
    return;
  }
  // La regla obligatoria ya no manda «informacion => REGISTRO».
  assert.doesNotMatch(texto, /informacion, soporte, agendar, pagar, reclamo => REGISTRO/);
  assert.match(texto, /Pedir informacion o una cotizacion, por si solo, NO es un registro => REPORTE/);
  // Ni la instruccion extra.
  assert.doesNotMatch(texto, /"cómo compro", es REGISTRO tipo SOLICITUD/);
  assert.match(texto, /todavía no ha dado su nombre y lo que pide, NO es SOLICITUD/);
  // Y la última, que empujaba cualquier «intención comercial implícita» a REGISTRO.
  assert.doesNotMatch(texto, /intención comercial implícita/);
  assert.match(texto, /un pedido con sus datos ya tomados, aunque el mensaje sea corto/);
});

test("lo que NO cambia: los otros cuatro tipos", () => {
  const t = CRM_LEAD_FUNNEL_PROMPT_DEFAULTS.typeInstructions;
  assert.match(t.PAGO, /comprobante/);
  assert.match(t.RECLAMO, /Queja/);
  assert.match(t.RESERVA, /Agenda/);
  assert.match(t.PEDIDO, /Confirma compra/);
  // Y el prompt sigue armandose entero.
  const texto = buildLeadFunnelPromptFromConfig(CRM_LEAD_FUNNEL_PROMPT_DEFAULTS);
  for (const tipo of ["PAGO", "RECLAMO", "RESERVA", "PEDIDO", "SOLICITUD"]) {
    assert.match(texto, new RegExp(`- ${tipo}: `));
  }
});

test("la pantalla lo dice: el campo editable no decide solo", () => {
  const pantalla = leer(PANTALLA);
  if (ROTO) {
    assert.doesNotMatch(pantalla, /tres datos/);
    return;
  }
  // Se pinta SOLO en la tarjeta de SOLICITUD, y con lo que de verdad decide.
  assert.match(pantalla, /type === "SOLICITUD" \? \(/);
  assert.match(pantalla, /tres datos\s*\n?\s*concretos/);
  assert.match(pantalla, /escribas lo que escribas aquí/);
});
