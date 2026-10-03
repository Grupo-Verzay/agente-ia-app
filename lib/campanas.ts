/**
 * Las reglas de una CAMPAÑA, puras. Las usan la acción que la crea, la que la
 * edita, las que pausan, reanudan y reintentan, y la guía pública.
 *
 * Una campaña es una fila de `Reminders` con `isCampaign` y, por cada
 * contacto, una fila de `seguimientos` con `idNodo = camping-<id>-<n>` que el
 * motor manda a su hora. Lo que aquí se decide es qué dice cada mensaje y a
 * qué hora sale cada uno.
 */

/** Las tres variables que se pueden escribir en el mensaje, en su orden. */
export const VARIABLES_DE_LA_CAMPANA = [
  { clave: "{{nombre}}", que: "el nombre del contacto (o su número si no tiene)" },
  { clave: "{{telefono}}", que: "su número" },
  { clave: "{{fecha}}", que: "la fecha del día en que se programa" },
] as const;

/** La pausa entre envíos, en segundos. Los mismos topes que el formulario. */
export const PAUSA_MINIMA = 30;
export const PAUSA_MAXIMA = 600;
export const PAUSA_POR_DEFECTO = { min: 30, max: 60 } as const;

/** Lo que dice el mensaje para UN contacto, con sus variables puestas. */
export function elMensajeDeLaCampana(
  base: string,
  nombre: string,
  telefono: string,
  hoy: Date = new Date(),
): string {
  const fecha = hoy.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  const quien = (nombre ?? "").trim();
  return (base ?? "")
    .replace(/\{\{nombre\}\}/gi, quien && quien.toLowerCase() !== "desconocido" ? quien : telefono)
    .replace(/\{\{telefono\}\}/gi, telefono)
    .replace(/\{\{fecha\}\}/gi, fecha);
}

/** El teléfono de un jid: lo de antes de la arroba (y sin sufijo de dispositivo). */
export function elTelefonoDelJid(jid: string): string {
  return (jid ?? "").replace(/@.*/, "").replace(/:\d+$/, "");
}

/**
 * La pausa que se va a usar, saneada: entre los topes y el máximo nunca por
 * debajo del mínimo. Lo que no se entienda cae en la de por defecto.
 */
export function laPausa(min?: number | null, max?: number | null): { min: number; max: number } {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const lo = Math.min(PAUSA_MAXIMA, Math.max(PAUSA_MINIMA, Math.round(n(min, PAUSA_POR_DEFECTO.min))));
  const hi = Math.min(PAUSA_MAXIMA, Math.max(lo, Math.round(n(max, Math.max(lo, PAUSA_POR_DEFECTO.max)))));
  return { min: lo, max: hi };
}

/**
 * Cuántos segundos después de la hora de la campaña sale cada mensaje. Son
 * ACUMULADOS: cada uno espera una pausa al azar después del anterior, así que
 * el primero ya sale una pausa después de la hora.
 */
export function losRetrasos(
  cuantos: number,
  pausa: { min: number; max: number },
  azar: () => number = Math.random,
): number[] {
  const { min, max } = laPausa(pausa.min, pausa.max);
  const fuera: number[] = [];
  let acumulado = 0;
  for (let i = 0; i < Math.max(0, cuantos); i++) {
    acumulado += Math.floor(azar() * (max - min + 1)) + min;
    fuera.push(acumulado);
  }
  return fuera;
}

/**
 * ¿Es una campaña? Lo dice la PANTALLA desde la que se crea, no cuántos
 * contactos lleva: una campaña de un solo contacto se guardaba como un
 * recordatorio y desaparecía de Campañas.
 */
export function esUnaCampana(desdeCampanas: boolean | undefined, contactos: number): boolean {
  return desdeCampanas === true || contactos > 1;
}

/** El número de envío de un `camping-<id>-<n>`, o `null` si no es de esa campaña. */
export function elNumeroDelEnvio(idNodo: string | null | undefined, campanaId: string): number | null {
  const prefijo = `camping-${campanaId}-`;
  const id = (idNodo ?? "").trim();
  if (!id.startsWith(prefijo)) return null;
  const n = Number(id.slice(prefijo.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Los estados de un envío que todavía no ha salido y se pueden reprogramar. */
export const ESTADOS_QUE_SE_REPROGRAMAN = ["pending", "canceled", "cancelled"] as const;

export type EnvioExistente = { id: number; idNodo: string | null; remoteJid: string | null; followUpStatus: string | null };

/**
 * Qué pasa con los envíos de una campaña al EDITARLA.
 *
 * Lo que ya salió, falló o se está enviando se queda como está: es historia.
 * Lo que todavía no salió (pendiente o pausado) se borra y se vuelve a crear
 * con la hora, el mensaje y los contactos nuevos — y lo pausado sigue pausado.
 * Un contacto que ya recibió el mensaje no lo vuelve a recibir.
 */
export function elPlanDeLaEdicion(
  campanaId: string,
  existentes: EnvioExistente[],
  contactos: { jid: string; nombre: string }[],
): { borrar: number[]; crear: { jid: string; nombre: string; numero: number; pausado: boolean }[] } {
  const reprogramables = new Set<string>(ESTADOS_QUE_SE_REPROGRAMAN);
  const estado = (s: string | null) => (s ?? "pending").toLowerCase();
  const borrar = existentes.filter((e) => reprogramables.has(estado(e.followUpStatus))).map((e) => e.id);
  const yaSalio = new Set(
    existentes.filter((e) => !reprogramables.has(estado(e.followUpStatus))).map((e) => (e.remoteJid ?? "").trim()),
  );
  const pausados = new Set(
    existentes.filter((e) => ["canceled", "cancelled"].includes(estado(e.followUpStatus))).map((e) => (e.remoteJid ?? "").trim()),
  );
  let numero = existentes.reduce((m, e) => Math.max(m, elNumeroDelEnvio(e.idNodo, campanaId) ?? 0), 0);
  const vistos = new Set<string>();
  const crear: { jid: string; nombre: string; numero: number; pausado: boolean }[] = [];
  for (const c of contactos) {
    const jid = (c.jid ?? "").trim();
    if (!jid || vistos.has(jid) || yaSalio.has(jid)) continue;
    vistos.add(jid);
    numero += 1;
    crear.push({ jid, nombre: c.nombre ?? "", numero, pausado: pausados.has(jid) });
  }
  return { borrar, crear };
}

/**
 * Las horas de los envíos que se reanudan o se reintentan: escalonados desde
 * AHORA con la pausa, nunca todos a la vez. Antes salían todos en el mismo
 * minuto, que es justo lo que la pausa existe para evitar.
 */
export function lasHorasEscalonadas(
  cuantos: number,
  ahora: Date,
  pausa: { min: number; max: number } = PAUSA_POR_DEFECTO,
  azar: () => number = Math.random,
): string[] {
  return losRetrasos(cuantos, pausa, azar).map((s) => new Date(ahora.getTime() + s * 1000).toISOString());
}

/** Una campaña sale UNA vez: la repetición no se ofrece. */
export const LA_CAMPANA_NO_SE_REPITE = "NONE" as const;

/**
 * Desde cuándo se cuentan los envíos que se reprograman al editar: la hora de
 * la campaña, o AHORA si esa hora ya pasó. Contando desde una hora pasada,
 * todo lo pendiente quedaría vencido y saldría de golpe.
 */
export function desdeCuandoSeReprograma(horaDeLaCampana: string, ahora: Date): Date {
  const t = new Date(horaDeLaCampana);
  return Number.isNaN(t.getTime()) || t.getTime() < ahora.getTime() ? ahora : t;
}

export type ContactoDeLaCampana = { jid: string; nombre: string };

/**
 * Los contactos de una campaña, de las dos listas separadas por comas que
 * guarda la fila (`remoteJid` y `pushName`, en el mismo orden). Sin nombre, el
 * número. Lo usa la tarjeta: pintar la lista cruda dejaba «Mariana Toro,
 * Andrés…» y un teléfono armado con todos los números pegados.
 */
export function losContactosDeLaCampana(remoteJid: string | null | undefined, pushName: string | null | undefined): ContactoDeLaCampana[] {
  const jids = (remoteJid ?? "").split(",").map((j) => j.trim());
  const nombres = (pushName ?? "").split(",").map((n) => n.trim());
  const fuera: ContactoDeLaCampana[] = [];
  jids.forEach((jid, i) => {
    if (!jid) return;
    const nombre = nombres[i] && nombres[i].toLowerCase() !== "desconocido" ? nombres[i] : elTelefonoDelJid(jid);
    fuera.push({ jid, nombre });
  });
  return fuera;
}

/** Cómo se nombra a quién le llega: su nombre si es uno, «N contactos» si son varios. */
export function aQuienLeLlega(contactos: ContactoDeLaCampana[]): string {
  if (contactos.length === 0) return "";
  if (contactos.length === 1) return contactos[0].nombre;
  return `${contactos.length} contactos`;
}
