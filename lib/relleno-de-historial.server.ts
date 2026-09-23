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
  planDelChat,
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
async function filasDelChat(cuentas: string[], linea: string, identidades: string[]): Promise<FilaExistente[]> {
  if (identidades.length === 0) return [];
  return db.$queryRaw<FilaExistente[]>`
    SELECT "messageId", "fromMe", "remoteJid" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "remoteJid" = ANY(${identidades})
    UNION
    SELECT "messageId", "fromMe", "remoteJid" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "remoteJidAlt" = ANY(${identidades})
    UNION
    SELECT "messageId", "fromMe", "remoteJid" FROM "chat_messages"
     WHERE "userId" = ANY(${cuentas}) AND "instanceName" = ${linea} AND "senderPn" = ANY(${identidades})`;
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
): Promise<{ plan: PlanDelChat<Traido>; traidos: number; recortado: boolean } | null> {
  const traida = await proveedor.traerMensajes(jid);
  if (!traida) return null;
  const vistas = new Set<string>([jid]);
  for (const m of traida.mensajes) for (const j of m.jids) vistas.add(j);
  const identidades = new Set<string>(vistas);
  for (const j of await identidadesGuardadas(cuentas, linea.instanceName, Array.from(vistas))) identidades.add(j);
  const existentes = await filasDelChat(cuentas, linea.instanceName, Array.from(identidades));
  const plan = planDelChat({ jidDelProveedor: jid, traidos: traida.mensajes, existentes });
  return { plan, traidos: traida.mensajes.length, recortado: traida.recortado };
}

/** El chat, con lo que haría el relleno y SIN escribir nada. */
export async function revisarUnChat(
  linea: LineaDelRelleno,
  proveedor: ProveedorDeHistorial,
  jid: string,
): Promise<InformeDelChat | null> {
  const cuentas = await cuentasDeLaLinea(linea);
  const r = await planearUnChat(linea, proveedor, jid, cuentas);
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
): Promise<InformeDelChat | null> {
  const lasCuentas = cuentas ?? (await cuentasDeLaLinea(linea));
  const r = await planearUnChat(linea, proveedor, jid, lasCuentas);
  if (!r) return null;
  let escritos = 0;
  let fallidos = 0;
  for (const m of r.plan.aEscribir) {
    try {
      await persistChatMessage(m.entrada(r.plan.escribirBajo, linea.userId));
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

    for (const jid of quedan) {
      let inf: InformeDelChat | null = null;
      try {
        inf = await rellenarUnChat(linea, proveedor, jid, cuentas);
      } catch (error) {
        console.warn('[relleno] fallo en un chat, se sigue con el siguiente', {
          instanceName: linea.instanceName,
          jid,
          error: String(error),
        });
      }
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
