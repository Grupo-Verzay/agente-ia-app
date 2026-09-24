import 'server-only';

import { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import {
  entradaDeMensajeDeEvolution,
  persistChatMessage,
  type PersistChatMessageInput,
} from '@/lib/chat-persistence';
import { comoUrlDeEvolution, proveedorDeLaFila } from '@/lib/sesion-de-la-linea';
import { getWahaChatMessages, getWahaChats, type MensajeDeWaha } from '@/lib/waha';
import { canonicalToWahaJid, wahaJidToCanonical } from '@/lib/waha-jid';
import { mensajeDeWahaParaGuardar } from '@/lib/waha-historial';
import type { EvolutionMessage } from '@/actions/chat-actions';
import {
  chatsQueQuedan,
  laLineaCasa,
  lineasQueQuedan,
  llaveDelMensaje,
  planDelChat,
  RECORRIDO_DE_TODAS,
  type FilaExistente,
  type MensajeTraido,
  type PlanDelChat,
} from '@/lib/relleno-de-historial';

/**
 * Rellenar el historial de una LÍNEA con lo que su proveedor tiene y nosotros no.
 *
 * Nació para lo que el dueño escribía desde su teléfono antes de que el webhook
 * lo guardara (api-webhook#174 y #175): Evolution y Waha lo guardan en su propia
 * base, nosotros no. Sirve igual para cualquier otro hueco de una línea.
 *
 * Se lanza desde `/api/chats/rellenar-historial` (solo superadministrador), y se
 * puede lanzar sobre cualquier línea cuando haga falta. Tres cosas del diseño:
 *
 * 1. **Primero un chat, sin escribir** (`revisarUnChat`). Dice qué falta, bajo
 *    qué identidad se escribiría y si la conversación ya está partida entre su
 *    número y su `@lid`. Es lo que se mira ANTES de lanzar la línea entera.
 * 2. **En serie y con pausas.** Un chat detrás de otro, con `PAUSA_ENTRE_CHATS`
 *    y `PAUSA_ENTRE_PAGINAS` entre medias: la línea sigue atendiendo mientras
 *    tanto, y su proveedor no recibe una ráfaga.
 * 3. **Se retoma donde se quedó.** El estado vive en `relleno_de_historial`,
 *    con el último chat hecho. Un despliegue en mitad del recorrido se lleva el
 *    proceso, no el avance: volver a lanzarlo sigue por el chat siguiente.
 *
 * No duplica, y no parte conversaciones: ver `planDelChat`.
 */

export const PAUSA_ENTRE_CHATS_MS = 1500;
export const PAUSA_ENTRE_PAGINAS_MS = 300;
/** Mensajes por página que se piden al proveedor. */
export const MENSAJES_POR_PAGINA = 100;
/** Tope de páginas por chat: 5.000 mensajes. Un chat más largo se trae hasta ahí y se dice. */
export const TOPE_DE_PAGINAS = 50;
/** Un recorrido que no avanza en este tiempo se da por muerto y se puede retomar. */
export const SIN_LATIDO_MS = 10 * 60 * 1000;

export type Traido = MensajeTraido & {
  /** Lo que se guardaría, bajo la identidad elegida. */
  entrada: (bajo: string, userId: string) => PersistChatMessageInput;
};

export type ProveedorDeHistorial = {
  nombre: 'evolution' | 'waha';
  listarChats(): Promise<string[]>;
  /** Todo lo que el proveedor tenga de ese chat, hasta el tope. `null` = no se pudo preguntar. */
  traerMensajes(jid: string): Promise<{ mensajes: Traido[]; recortado: boolean } | null>;
};

export type LineaDelRelleno = {
  instanceName: string;
  instanceType: string | null;
  userId: string;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Lo que se guarda de cada proveedor ──────────────────────────────────── */

/** Un mensaje de Evolution, listo para decidir y para guardar. */
export function traidoDeEvolution(m: EvolutionMessage, instanceName: string): Traido {
  return {
    messageId: (m.key?.id || m.id) as string,
    fromMe: Boolean(m.key?.fromMe),
    jids: [m.key?.remoteJid, m.key?.remoteJidAlt, m.key?.senderPn, m.senderPn ?? undefined].filter(
      (x): x is string => typeof x === 'string' && x.includes('@'),
    ),
    entrada: (bajo, userId) =>
      conLaIdentidad(
        entradaDeMensajeDeEvolution(m, { userId, instanceName, instanceType: 'evolution', remoteJid: bajo }),
        bajo,
      ),
  };
}

/** Un mensaje de Waha, con la MISMA traducción que el historial al abrir un chat. */
export function traidoDeWaha(crudo: MensajeDeWaha, instanceName: string): Traido {
  return {
    messageId: String(crudo.id).trim(),
    fromMe: crudo.fromMe === true,
    jids: [crudo.from, crudo.to]
      .map((x) => (typeof x === 'string' ? wahaJidToCanonical(x) : ''))
      .filter((x) => x.includes('@')),
    entrada: (bajo, userId) => {
      const m = mensajeDeWahaParaGuardar(crudo, bajo);
      if (!m) throw new Error('mensaje de Waha sin id o sin hora');
      return {
        puedeReabrir: false,
        userId,
        instanceName,
        instanceType: 'waha',
        remoteJid: bajo,
        messageId: m.messageId,
        fromMe: m.fromMe,
        messageType: m.messageType,
        content: m.content,
        mediaUrl: m.mediaUrl,
        raw: m.raw as Prisma.InputJsonValue,
        messageTimestamp: m.messageTimestamp,
      };
    },
  };
}

/**
 * Cuántos chats seguidos sin respuesta del proveedor hacen falta para dar la
 * línea por perdida en este recorrido (ver `rellenarLaLinea`).
 */
export const TOPE_DE_FALLOS_SEGUIDOS = 25;

/* ── Los dos proveedores ─────────────────────────────────────────────────── */

async function proveedorDeEvolution(linea: LineaDelRelleno): Promise<ProveedorDeHistorial | null> {
  const user = await db.user.findUnique({ where: { id: linea.userId }, include: { apiKey: true } });
  const base = comoUrlDeEvolution(user?.apiKey?.url);
  const key = user?.apiKey?.key?.trim();
  if (!base || !key) return null;

  const pedir = async (ruta: string, cuerpo: unknown) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(`${base}${ruta}/${encodeURIComponent(linea.instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify(cuerpo ?? {}),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as any;
    } finally {
      clearTimeout(t);
    }
  };

  return {
    nombre: 'evolution',
    async listarChats() {
      const crudo = await pedir('/chat/findChats', {});
      const lista: any[] = Array.isArray(crudo) ? crudo : Array.isArray(crudo?.data) ? crudo.data : [];
      return lista
        .map((c) => String(c?.remoteJid ?? c?.id ?? ''))
        .filter(Boolean);
    },
    async traerMensajes(jid) {
      const mensajes: Traido[] = [];
      for (let pagina = 1; pagina <= TOPE_DE_PAGINAS; pagina++) {
        const crudo = await pedir('/chat/findMessages', {
          where: { key: { remoteJid: jid } },
          page: pagina,
          offset: MENSAJES_POR_PAGINA,
        });
        if (!crudo) return pagina === 1 ? null : { mensajes, recortado: true };
        const registros: EvolutionMessage[] = Array.isArray(crudo?.messages?.records)
          ? crudo.messages.records
          : Array.isArray(crudo)
            ? crudo
            : [];
        for (const m of registros) {
          if (!(m.key?.id || m.id)) continue;
          if (m.messageType === 'reactionMessage' || (m.message as any)?.reactionMessage) continue;
          mensajes.push(traidoDeEvolution(m, linea.instanceName));
        }
        const paginas = Number(crudo?.messages?.pages ?? 1);
        if (registros.length === 0 || pagina >= paginas) return { mensajes, recortado: false };
        await esperar(PAUSA_ENTRE_PAGINAS_MS);
      }
      return { mensajes, recortado: true };
    },
  };
}

function proveedorDeWaha(linea: LineaDelRelleno): ProveedorDeHistorial {
  return {
    nombre: 'waha',
    async listarChats() {
      const jids: string[] = [];
      for (let offset = 0; offset < 20000; offset += 1000) {
        const r = await getWahaChats({ session: linea.instanceName, limit: 1000, offset });
        if (!r.ok) break;
        for (const c of r.chats) {
          const crudo =
            typeof c.id === 'string' ? c.id : typeof (c.id as any)?._serialized === 'string' ? (c.id as any)._serialized : '';
          const jid = wahaJidToCanonical(crudo);
          if (jid) jids.push(jid);
        }
        if (r.chats.length < 1000) break;
        await esperar(PAUSA_ENTRE_PAGINAS_MS);
      }
      return jids;
    },
    async traerMensajes(jid) {
      const chatId = canonicalToWahaJid(jid);
      if (!chatId) return null;
      const mensajes: Traido[] = [];
      for (let pagina = 0; pagina < TOPE_DE_PAGINAS; pagina++) {
        const r = await getWahaChatMessages({
          session: linea.instanceName,
          chatId,
          limit: MENSAJES_POR_PAGINA,
          offset: pagina * MENSAJES_POR_PAGINA,
        });
        if (!r.ok) return pagina === 0 ? null : { mensajes, recortado: true };
        for (const crudo of r.mensajes as MensajeDeWaha[]) {
          if (!(typeof crudo.id === 'string' && crudo.id.trim())) continue;
          mensajes.push(traidoDeWaha(crudo, linea.instanceName));
        }
        if (r.mensajes.length < MENSAJES_POR_PAGINA) return { mensajes, recortado: false };
        await esperar(PAUSA_ENTRE_PAGINAS_MS);
      }
      return { mensajes, recortado: true };
    },
  };
}

/**
 * Se escribe bajo la identidad elegida y SIN alias de teléfono cuando esa
 * identidad no es un teléfono: `persistChatMessage` se queda con el primer
 * teléfono que vea entre los alias, y con uno dentro volvería a partir la
 * conversación que `planDelChat` acaba de mantener junta.
 */
function conLaIdentidad(entrada: PersistChatMessageInput, bajo: string): PersistChatMessageInput {
  const bajoEsTelefono = /@(s\.whatsapp\.net|c\.us)$/i.test(bajo);
  if (bajoEsTelefono) return { ...entrada, remoteJid: bajo };
  return { ...entrada, remoteJid: bajo, remoteJidAlt: undefined, senderPn: undefined };
}

export async function laLineaDelRelleno(instanceName: string): Promise<LineaDelRelleno | null> {
  const fila = await db.instancia.findFirst({
    where: { instanceName },
    select: { instanceName: true, instanceType: true, userId: true },
  });
  if (!fila?.userId) return null;
  return { instanceName: fila.instanceName, instanceType: fila.instanceType, userId: fila.userId };
}

export async function proveedorDeLaLinea(linea: LineaDelRelleno): Promise<ProveedorDeHistorial | null> {
  const p = proveedorDeLaFila(linea.instanceType);
  if (p === 'waha') return proveedorDeWaha(linea);
  if (p === 'evolution') return proveedorDeEvolution(linea);
  return null;
}

/* ── Lo que ya tenemos ───────────────────────────────────────────────────── */

/** Las cuentas bajo las que esta línea tiene conversaciones (cambios de dueño incluidos). */
async function cuentasDeLaLinea(linea: LineaDelRelleno): Promise<string[]> {
  const filas = await db.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT "userId" FROM "chat_conversations" WHERE "instanceName" = ${linea.instanceName}`;
  return Array.from(new Set([linea.userId, ...filas.map((f) => f.userId)]));
}

/**
 * Las filas de la línea bajo CUALQUIERA de las identidades. Tres ramas, una por
 * columna, para que cada una use su índice: un `OR` sobre las tres recorre la
 * tabla entera (CLAUDE.md, «la marca de borrado»).
 */
type FilaConIdentidades = FilaExistente & { remoteJidAlt: string | null; senderPn: string | null };

async function filasDelChat(cuentas: string[], linea: string, identidades: string[]): Promise<FilaConIdentidades[]> {
  if (identidades.length === 0) return [];
  return db.$queryRaw<FilaConIdentidades[]>`
    SELECT "messageId", "fromMe", "remoteJid", "remoteJidAlt", "senderPn" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "remoteJid" = ANY(${identidades})
    UNION
    SELECT "messageId", "fromMe", "remoteJid", "remoteJidAlt", "senderPn" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "remoteJidAlt" = ANY(${identidades})
    UNION
    SELECT "messageId", "fromMe", "remoteJid", "remoteJidAlt", "senderPn" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "senderPn" = ANY(${identidades})`;
}

/**
 * Las llaves (`llaveDelMensaje`) de todo lo que la línea ya tiene. Se lee UNA
 * vez por recorrido —entra por el índice de (userId, instanceName)— y se va
 * completando con lo que se escribe.
 */
async function llavesDeLaLinea(cuentas: string[], linea: string): Promise<Set<string>> {
  const filas = await db.$queryRaw<{ messageId: string; fromMe: boolean }[]>`
    SELECT "messageId", "fromMe" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea}`;
  return new Set(filas.map((f) => llaveDelMensaje(f.messageId, f.fromMe)));
}

/**
 * Lo que entró EN VIVO en la línea desde `desde`: se suma a las llaves antes de
 * cada chat. Una línea grande tarda horas, y lo que la IA o el cliente escriben
 * mientras tanto no estaba en la foto inicial: AMERICA_PENSIONADO_ALIADO dejó 8
 * repetidos así (respuestas de la IA guardadas en vivo a mitad del recorrido).
 * Va por `messageTimestamp` —lo vivo trae la hora de ahora— y entra por el
 * índice (userId, instanceName, messageTimestamp): no relee la línea entera.
 */
async function sumarLoQueEntroEnVivo(
  cuentas: string[],
  linea: string,
  desde: Date,
  llaves: Set<string>,
): Promise<void> {
  const filas = await db.$queryRaw<{ messageId: string; fromMe: boolean }[]>`
    SELECT "messageId", "fromMe" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "messageTimestamp" >= ${desde}`;
  for (const f of filas) llaves.add(llaveDelMensaje(f.messageId, f.fromMe));
}

/** Cuánto antes del arranque se mira lo vivo: relojes que no cuadran, colas del webhook. */
const MARGEN_DE_LO_VIVO_MS = 15 * 60 * 1000;

function esGrupo(jid: string): boolean {
  return /@g\.us$/i.test(jid);
}

/** Una identidad de un CONTACTO (no un grupo, ni una difusión). */
function esIdentidadDeContacto(jid: string | null | undefined): jid is string {
  return typeof jid === 'string' && /@(s\.whatsapp\.net|c\.us|lid)$/i.test(jid);
}

/**
 * Las filas del chat, siguiendo el puente entre sus identidades hasta cerrarlo.
 *
 * Una conversación abierta por su `@lid` puede tener su historial viejo bajo el
 * NÚMERO, y lo único que une las dos es el `remoteJidAlt` de unas pocas filas.
 * Preguntando solo por las identidades que da el proveedor se ven esas pocas y
 * no las demás, y el relleno escribía otra vez todo lo que ya estaba (lo cazó
 * RCA: 24 de 324). Así que cada vuelta añade las identidades que traen las
 * filas encontradas, hasta que no aparece ninguna nueva.
 *
 * En un GRUPO no se sigue: su `senderPn` es quien escribió, y seguirlo metería
 * en el grupo la conversación privada de ese participante.
 */
async function filasCerradas(
  cuentas: string[],
  linea: string,
  identidades: Set<string>,
  grupo: boolean,
): Promise<FilaExistente[]> {
  let filas = await filasDelChat(cuentas, linea, Array.from(identidades));
  if (grupo) return filas;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const antes = identidades.size;
    for (const f of filas) {
      for (const j of [f.remoteJid, f.remoteJidAlt, f.senderPn]) if (esIdentidadDeContacto(j)) identidades.add(j);
    }
    for (const j of await identidadesGuardadas(cuentas, linea, Array.from(identidades))) {
      if (esIdentidadDeContacto(j)) identidades.add(j);
    }
    if (identidades.size === antes) return filas;
    filas = await filasDelChat(cuentas, linea, Array.from(identidades));
  }
  return filas;
}

/** Las identidades que ya conocemos del contacto, sacadas de su conversación guardada. */
async function identidadesGuardadas(cuentas: string[], linea: string, jids: string[]): Promise<string[]> {
  if (jids.length === 0) return [];
  const filas = await db.$queryRaw<{ remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }[]>`
    SELECT "remoteJid", "remoteJidAlt", "senderPn" FROM "chat_conversations"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea}
       AND ("remoteJid" = ANY(${jids}) OR "remoteJidAlt" = ANY(${jids}) OR "senderPn" = ANY(${jids}))`;
  const todas = new Set<string>();
  for (const f of filas) for (const j of [f.remoteJid, f.remoteJidAlt, f.senderPn]) if (j) todas.add(j);
  return Array.from(todas);
}

/* ── Un chat ─────────────────────────────────────────────────────────────── */

export type InformeDelChat = {
  jid: string;
  traidos: number;
  aEscribir: number;
  aEscribirDelNegocio: number;
  yaEstaban: number;
  yaEstabanBajoOtraIdentidad: number;
  escribirBajo: string;
  identidadesConFilas: Record<string, number>;
  yaPartida: boolean;
  recortado: boolean;
  escritos: number;
  fallidos: number;
};

async function planearUnChat(
  linea: LineaDelRelleno,
  proveedor: ProveedorDeHistorial,
  jid: string,
  cuentas: string[],
  llavesDeLaLinea: Set<string>,
): Promise<{ plan: PlanDelChat<Traido>; traidos: number; recortado: boolean } | null> {
  const traida = await proveedor.traerMensajes(jid);
  if (!traida) return null;
  const vistas = new Set<string>([jid]);
  for (const m of traida.mensajes) for (const j of m.jids) vistas.add(j);
  const identidades = new Set<string>(vistas);
  for (const j of await identidadesGuardadas(cuentas, linea.instanceName, Array.from(vistas))) identidades.add(j);
  const existentes = await filasCerradas(cuentas, linea.instanceName, identidades, esGrupo(jid));
  const plan = planDelChat({ jidDelProveedor: jid, traidos: traida.mensajes, existentes, llavesDeLaLinea });
  return { plan, traidos: traida.mensajes.length, recortado: traida.recortado };
}

/** El chat, con lo que haría el relleno y SIN escribir nada. */
export async function revisarUnChat(
  linea: LineaDelRelleno,
  proveedor: ProveedorDeHistorial,
  jid: string,
): Promise<InformeDelChat | null> {
  const cuentas = await cuentasDeLaLinea(linea);
  const r = await planearUnChat(linea, proveedor, jid, cuentas, await llavesDeLaLinea(cuentas, linea.instanceName));
  if (!r) return null;
  return informe(jid, r, 0, 0);
}

function informe(
  jid: string,
  r: { plan: PlanDelChat<Traido>; traidos: number; recortado: boolean },
  escritos: number,
  fallidos: number,
): InformeDelChat {
  return {
    jid,
    traidos: r.traidos,
    aEscribir: r.plan.aEscribir.length,
    aEscribirDelNegocio: r.plan.aEscribir.filter((m) => m.fromMe).length,
    yaEstaban: r.plan.yaEstaban,
    yaEstabanBajoOtraIdentidad: r.plan.yaEstabanBajoOtraIdentidad,
    escribirBajo: r.plan.escribirBajo,
    identidadesConFilas: r.plan.identidadesConFilas,
    yaPartida: r.plan.yaPartida,
    recortado: r.recortado,
    escritos,
    fallidos,
  };
}

/** Rellena UN chat. En serie, mensaje a mensaje: nunca en paralelo contra la base. */
export async function rellenarUnChat(
  linea: LineaDelRelleno,
  proveedor: ProveedorDeHistorial,
  jid: string,
  cuentas?: string[],
  llaves?: Set<string>,
): Promise<InformeDelChat | null> {
  const lasCuentas = cuentas ?? (await cuentasDeLaLinea(linea));
  const lasLlaves = llaves ?? (await llavesDeLaLinea(lasCuentas, linea.instanceName));
  const r = await planearUnChat(linea, proveedor, jid, lasCuentas, lasLlaves);
  if (!r) return null;
  let escritos = 0;
  let fallidos = 0;
  for (const m of r.plan.aEscribir) {
    try {
      await persistChatMessage(m.entrada(r.plan.escribirBajo, linea.userId));
      // El chat siguiente de este mismo contacto lo tiene que ver.
      lasLlaves.add(llaveDelMensaje(m.messageId, m.fromMe));
      escritos++;
    } catch (error) {
      fallidos++;
      console.warn('[relleno] no se pudo guardar un mensaje', {
        instanceName: linea.instanceName,
        jid,
        messageId: m.messageId,
        error: String(error),
      });
    }
  }
  return informe(jid, r, escritos, fallidos);
}

/* ── La línea entera, con su estado guardado ─────────────────────────────── */

let tablaLista = false;
async function asegurarLaTabla(): Promise<void> {
  if (tablaLista) return;
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "relleno_de_historial" (
        "instanceName" TEXT PRIMARY KEY,
        "estado" TEXT NOT NULL,
        "chatsTotal" INTEGER NOT NULL DEFAULT 0,
        "chatsHechos" INTEGER NOT NULL DEFAULT 0,
        "escritos" INTEGER NOT NULL DEFAULT 0,
        "yaEstaban" INTEGER NOT NULL DEFAULT 0,
        "chatsPartidos" INTEGER NOT NULL DEFAULT 0,
        "chatsRecortados" INTEGER NOT NULL DEFAULT 0,
        "chatsFallidos" INTEGER NOT NULL DEFAULT 0,
        "ultimoChat" TEXT,
        "ultimoError" TEXT,
        "empezadoEn" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "latidoEn" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "terminadoEn" TIMESTAMPTZ
      )`);
  } catch (e: any) {
    // Dos réplicas pueden crearla a la vez: «ya existe» no es un fallo.
    const code = e?.meta?.code ?? e?.code;
    if (!['23505', '42P07', '42710'].includes(code) && !/already exists/i.test(String(e?.message))) throw e;
  }
  tablaLista = true;
}

export type EstadoDelRelleno = {
  instanceName: string;
  estado: 'corriendo' | 'terminado' | 'fallido' | 'interrumpido';
  chatsTotal: number;
  chatsHechos: number;
  escritos: number;
  yaEstaban: number;
  chatsPartidos: number;
  chatsRecortados: number;
  chatsFallidos: number;
  ultimoChat: string | null;
  ultimoError: string | null;
  empezadoEn: Date;
  latidoEn: Date;
  terminadoEn: Date | null;
};

export async function estadoDelRelleno(instanceName: string): Promise<EstadoDelRelleno | null> {
  await asegurarLaTabla();
  const filas = await db.$queryRaw<EstadoDelRelleno[]>`
    SELECT * FROM "relleno_de_historial" WHERE "instanceName" = ${instanceName}`;
  const f = filas[0];
  if (!f) return null;
  // Uno que dice «corriendo» y no late es un proceso que se llevó un despliegue.
  if (f.estado === 'corriendo' && Date.now() - new Date(f.latidoEn).getTime() > SIN_LATIDO_MS) {
    return { ...f, estado: 'interrumpido' };
  }
  return f;
}

/**
 * Se queda con el recorrido de la línea. Devuelve `null` si ya hay otro vivo.
 * Un recorrido terminado empieza de cero; uno cortado sigue donde se quedó.
 * Quien decide es la base, en una sentencia: dos lanzamientos a la vez no
 * pueden ganar los dos.
 */
async function tomarElRecorrido(instanceName: string, desdeCero: boolean): Promise<EstadoDelRelleno | null> {
  await asegurarLaTabla();
  const limite = new Date(Date.now() - SIN_LATIDO_MS);
  const filas = await db.$queryRaw<EstadoDelRelleno[]>`
    INSERT INTO "relleno_de_historial" ("instanceName", "estado")
    VALUES (${instanceName}, 'corriendo')
    ON CONFLICT ("instanceName") DO UPDATE SET
      "estado" = 'corriendo',
      "latidoEn" = NOW(),
      "terminadoEn" = NULL,
      "ultimoError" = NULL,
      "empezadoEn" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN NOW() ELSE "relleno_de_historial"."empezadoEn" END,
      "ultimoChat" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN NULL ELSE "relleno_de_historial"."ultimoChat" END,
      "chatsHechos" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."chatsHechos" END,
      "escritos" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."escritos" END,
      "yaEstaban" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."yaEstaban" END,
      "chatsPartidos" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."chatsPartidos" END,
      "chatsRecortados" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."chatsRecortados" END,
      "chatsFallidos" = CASE WHEN ${desdeCero} OR "relleno_de_historial"."estado" = 'terminado'
                          THEN 0 ELSE "relleno_de_historial"."chatsFallidos" END
    WHERE "relleno_de_historial"."estado" <> 'corriendo'
       OR "relleno_de_historial"."latidoEn" < ${limite}
    RETURNING *`;
  return filas[0] ?? null;
}

export type OpcionesDelRecorrido = {
  pausaEntreChatsMs?: number;
  desdeCero?: boolean;
  /** Para el banco: el proveedor fingido. */
  proveedor?: ProveedorDeHistorial;
  /**
   * Se llama después de cada chat. El recorrido de todas las líneas lo usa para
   * dejar SU latido: una línea larga tarda horas, y sin latir, el recorrido de
   * arriba se daría por muerto y un segundo lanzamiento correría en paralelo.
   */
  alLatir?: () => Promise<void>;
};

/**
 * Recorre la línea entera. Devuelve cuando termina; quien lo lanza desde una
 * petición lo deja correr de fondo (el avance está en la tabla, no en la
 * promesa).
 */
export async function rellenarLaLinea(
  linea: LineaDelRelleno,
  opciones: OpcionesDelRecorrido = {},
): Promise<{ ok: true; estado: EstadoDelRelleno } | { ok: false; motivo: string }> {
  const proveedor = opciones.proveedor ?? (await proveedorDeLaLinea(linea));
  if (!proveedor) return { ok: false, motivo: 'La línea no es de WhatsApp por QR o no tiene credenciales de su proveedor.' };

  const tomado = await tomarElRecorrido(linea.instanceName, !!opciones.desdeCero);
  if (!tomado) return { ok: false, motivo: 'Ya hay un relleno en marcha en esta línea.' };

  const pausa = opciones.pausaEntreChatsMs ?? PAUSA_ENTRE_CHATS_MS;
  try {
    const cuentas = await cuentasDeLaLinea(linea);
    const desdeLoVivo = new Date(Date.now() - MARGEN_DE_LO_VIVO_MS);
    const llaves = await llavesDeLaLinea(cuentas, linea.instanceName);
    const delProveedor = await proveedor.listarChats();
    // También los que ya tenemos: el proveedor puede no listar uno viejo.
    const nuestros = await db.$queryRaw<{ remoteJid: string }[]>`
      SELECT DISTINCT "remoteJid" FROM "chat_conversations"
       WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea.instanceName}`;
    const todos = [...delProveedor, ...nuestros.map((f) => f.remoteJid)];
    const quedan = chatsQueQuedan(todos, tomado.ultimoChat);
    const total = tomado.chatsHechos + quedan.length;
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "chatsTotal" = ${total}, "latidoEn" = NOW()
       WHERE "instanceName" = ${linea.instanceName}`;

    let seguidosSinRespuesta = 0;
    for (const jid of quedan) {
      let inf: InformeDelChat | null = null;
      try {
        await sumarLoQueEntroEnVivo(cuentas, linea.instanceName, desdeLoVivo, llaves);
        inf = await rellenarUnChat(linea, proveedor, jid, cuentas, llaves);
        if (!inf) {
          // El proveedor no devolvió el chat. Callado, esto se ve como una
          // línea que "va bien" y no escribe nada.
          console.warn('[relleno] el proveedor no devolvió el chat', {
            instanceName: linea.instanceName,
            proveedor: proveedor.nombre,
            jid,
          });
        }
      } catch (error) {
        console.warn('[relleno] fallo en un chat, se sigue con el siguiente', {
          instanceName: linea.instanceName,
          jid,
          error: String(error),
        });
      }
      seguidosSinRespuesta = inf ? 0 : seguidosSinRespuesta + 1;
      await db.$executeRaw`
        UPDATE "relleno_de_historial" SET
          "chatsHechos" = "chatsHechos" + 1,
          "escritos" = "escritos" + ${inf?.escritos ?? 0},
          "yaEstaban" = "yaEstaban" + ${inf?.yaEstaban ?? 0},
          "chatsPartidos" = "chatsPartidos" + ${inf?.yaPartida ? 1 : 0},
          "chatsRecortados" = "chatsRecortados" + ${inf?.recortado ? 1 : 0},
          "chatsFallidos" = "chatsFallidos" + ${!inf || inf.fallidos > 0 ? 1 : 0},
          "ultimoChat" = ${jid},
          "latidoEn" = NOW()
         WHERE "instanceName" = ${linea.instanceName}`;
      if (opciones.alLatir) await opciones.alLatir().catch(() => undefined);
      if (seguidosSinRespuesta >= TOPE_DE_FALLOS_SEGUIDOS) {
        // Muchos seguidos no es un chat raro: es que el proveedor dejó de
        // contestar por esta línea (la cambiaron de proveedor, la borraron o
        // está caído). Seguir quemaría el resto de chats como fallidos, y el
        // recorrido no vuelve a ellos. Se corta y se dice por qué.
        const ahora = await laLineaDelRelleno(linea.instanceName);
        const cambio =
          ahora && proveedorDeLaFila(ahora.instanceType) !== proveedorDeLaFila(linea.instanceType)
            ? ` La línea pasó de ${proveedorDeLaFila(linea.instanceType)} a ${proveedorDeLaFila(ahora.instanceType)} a mitad del recorrido: relánzala.`
            : '';
        throw new Error(
          `El proveedor (${proveedor.nombre}) no devolvió ${seguidosSinRespuesta} chats seguidos; se corta la línea.${cambio}`,
        );
      }
      if (pausa > 0) await esperar(pausa);
    }

    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'terminado', "terminadoEn" = NOW(), "latidoEn" = NOW()
       WHERE "instanceName" = ${linea.instanceName}`;
    const estado = (await estadoDelRelleno(linea.instanceName))!;
    console.info('[relleno] línea terminada', estado);
    return { ok: true, estado };
  } catch (error) {
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'fallido', "ultimoError" = ${String(error)}, "latidoEn" = NOW()
       WHERE "instanceName" = ${linea.instanceName}`;
    console.error('[relleno] la línea se cortó', { instanceName: linea.instanceName, error: String(error) });
    return { ok: false, motivo: String(error) };
  }
}

/* ── Todas las líneas de la plataforma ───────────────────────────────────── */

export const PAUSA_ENTRE_LINEAS_MS = 5000;

export type LineaListada = LineaDelRelleno & {
  displayName: string | null;
  proveedor: 'evolution' | 'waha';
  dueno: { nombre: string | null; empresa: string | null; correo: string | null };
};

/**
 * Las líneas de WhatsApp por QR de la plataforma (Evolution y Waha). Las de
 * Meta, Telegram, Facebook e Instagram no tienen un historial que pedir.
 */
export async function lineasDelRelleno(): Promise<LineaListada[]> {
  const filas = await db.instancia.findMany({
    select: {
      instanceName: true,
      displayName: true,
      instanceType: true,
      userId: true,
      user: { select: { name: true, company: true, email: true, notificationNumber: true, ownerModePhone: true } },
    },
    orderBy: { instanceName: 'asc' },
  });
  const vistas = new Set<string>();
  const lineas: (LineaListada & { telefonos: (string | null)[] })[] = [];
  for (const f of filas) {
    const p = proveedorDeLaFila(f.instanceType);
    if (p !== 'evolution' && p !== 'waha') continue;
    if (!f.userId || vistas.has(f.instanceName)) continue;
    vistas.add(f.instanceName);
    lineas.push({
      instanceName: f.instanceName,
      instanceType: f.instanceType,
      userId: f.userId,
      displayName: f.displayName,
      proveedor: p,
      dueno: { nombre: f.user?.name ?? null, empresa: f.user?.company ?? null, correo: f.user?.email ?? null },
      telefonos: [f.user?.notificationNumber ?? null, f.user?.ownerModePhone ?? null],
    });
  }
  return lineas;
}

/** Busca líneas por su nombre, el de su dueño, su empresa, su correo o su número. */
export async function buscarLineas(buscado: string) {
  const lineas = await lineasDelRelleno();
  const casan = lineas.filter((l) =>
    laLineaCasa(buscado, {
      instanceName: l.instanceName,
      displayName: l.displayName,
      nombre: l.dueno.nombre,
      empresa: l.dueno.empresa,
      correo: l.dueno.correo,
      telefonos: (l as LineaListada & { telefonos?: (string | null)[] }).telefonos,
    }),
  );
  const conEstado = [];
  for (const l of casan) {
    const { telefonos: _t, ...sinTelefonos } = l as LineaListada & { telefonos?: unknown };
    conEstado.push({ ...sinTelefonos, relleno: await estadoDelRelleno(l.instanceName) });
  }
  return conEstado;
}

export type OpcionesDeTodas = {
  desdeCero?: boolean;
  pausaEntreLineasMs?: number;
  pausaEntreChatsMs?: number;
  /** Para el banco: las líneas y su proveedor fingidos. */
  lineas?: LineaDelRelleno[];
  proveedorDe?: (linea: LineaDelRelleno) => Promise<ProveedorDeHistorial | null>;
};

/**
 * Recorre TODAS las líneas por QR, una detrás de otra, con `rellenarLaLinea` y
 * con pausa entre medias. Nunca dos líneas a la vez: cada una ya pide al
 * proveedor chat a chat, y dos en paralelo son dos ráfagas.
 *
 * Su avance vive en la fila `RECORRIDO_DE_TODAS` de la misma tabla (líneas
 * totales en `chatsTotal`, hechas en `chatsHechos`, la que va en `ultimoChat`).
 * Lanzarlo otra vez tras un despliegue sigue por las que faltan: se salta la
 * que ya terminó en este recorrido o hace menos de un día.
 */
export async function rellenarTodasLasLineas(
  opciones: OpcionesDeTodas = {},
): Promise<{ ok: true; estado: EstadoDelRelleno } | { ok: false; motivo: string }> {
  const tomado = await tomarElRecorrido(RECORRIDO_DE_TODAS, !!opciones.desdeCero);
  if (!tomado) return { ok: false, motivo: 'Ya hay un recorrido de todas las líneas en marcha.' };

  const latir = async () => {
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "latidoEn" = NOW() WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;
  };
  const pausa = opciones.pausaEntreLineasMs ?? PAUSA_ENTRE_LINEAS_MS;

  try {
    const lineas: LineaDelRelleno[] = opciones.lineas ?? (await lineasDelRelleno());
    const porNombre = new Map(lineas.map((l) => [l.instanceName, l]));
    const estados = await db.$queryRaw<{ instanceName: string; terminadoEn: Date | null; estado: string }[]>`
      SELECT "instanceName", "terminadoEn", "estado" FROM "relleno_de_historial"
       WHERE "instanceName" = ANY(${Array.from(porNombre.keys())})`;
    const terminadas = new Map(
      estados.filter((e) => e.estado === 'terminado').map((e) => [e.instanceName, e.terminadoEn]),
    );
    const quedan = lineasQueQuedan(
      lineas.map((l) => ({ instanceName: l.instanceName, terminadoEn: terminadas.get(l.instanceName) ?? null })),
      new Date(tomado.empezadoEn),
    );
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "chatsTotal" = ${tomado.chatsHechos + quedan.length}, "latidoEn" = NOW()
       WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;

    for (const nombre of quedan) {
      const linea = porNombre.get(nombre)!;
      const proveedor = opciones.proveedorDe ? await opciones.proveedorDe(linea) : undefined;
      const r = await rellenarLaLinea(linea, {
        proveedor: proveedor ?? undefined,
        pausaEntreChatsMs: opciones.pausaEntreChatsMs,
        alLatir: latir,
      });
      if (!r.ok) {
        // Una línea sin credenciales o ya en marcha no corta el recorrido: se dice y se sigue.
        console.warn('[relleno] línea saltada en el recorrido de todas', { instanceName: nombre, motivo: r.motivo });
      }
      await db.$executeRaw`
        UPDATE "relleno_de_historial" SET
          "chatsHechos" = "chatsHechos" + 1,
          "escritos" = "escritos" + ${r.ok ? r.estado.escritos : 0},
          "yaEstaban" = "yaEstaban" + ${r.ok ? r.estado.yaEstaban : 0},
          "chatsPartidos" = "chatsPartidos" + ${r.ok ? r.estado.chatsPartidos : 0},
          "chatsRecortados" = "chatsRecortados" + ${r.ok ? r.estado.chatsRecortados : 0},
          "chatsFallidos" = "chatsFallidos" + ${r.ok ? 0 : 1},
          "ultimoChat" = ${nombre},
          "ultimoError" = ${r.ok ? null : `${nombre}: ${r.motivo}`},
          "latidoEn" = NOW()
         WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;
      if (pausa > 0) await esperar(pausa);
    }

    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'terminado', "terminadoEn" = NOW(), "latidoEn" = NOW()
       WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;
    const estado = (await estadoDelRelleno(RECORRIDO_DE_TODAS))!;
    console.info('[relleno] todas las líneas terminadas', estado);
    return { ok: true, estado };
  } catch (error) {
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'fallido', "ultimoError" = ${String(error)}, "latidoEn" = NOW()
       WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;
    console.error('[relleno] el recorrido de todas se cortó', { error: String(error) });
    return { ok: false, motivo: String(error) };
  }
}
