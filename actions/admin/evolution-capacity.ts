"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";

/**
 * Cupo de instancias por servidor de Evolution.
 *
 * Hay varios servidores y cada cliente se cuelga de uno (su ApiKey). Hasta ahora
 * el servidor se elegía a mano en un desplegable que solo mostraba la URL, sin
 * decir cuántas instancias tenía ya: se seguía llenando el mismo hasta que
 * empezaba a ir mal, y el aviso llegaba en forma de clientes con la línea caída.
 *
 * El límite se mide sobre el TOTAL de instancias del servidor, no sobre las
 * conectadas. Una instancia existe y ocupa su sitio aunque esté desconectada en
 * ese momento; contar solo las conectadas dejaría crear de más justo cuando hay
 * líneas caídas, y al reconectarse todas el servidor quedaría por encima del
 * límite sin que nadie hubiera hecho nada mal.
 */

const LIMITE_POR_DEFECTO = 20;

/** Se puede subir o bajar sin desplegar; si el valor no es válido, 20. */
function limitePorServidor(): number {
  const crudo = Number(process.env.EVOLUTION_MAX_INSTANCES);
  return Number.isFinite(crudo) && crudo > 0 ? Math.floor(crudo) : LIMITE_POR_DEFECTO;
}

export interface EvolutionServerCapacity {
  apiKeyId: string;
  url: string;
  /** Instancias que existen en el servidor. null = no se pudo consultar. */
  total: number | null;
  /** De esas, cuántas están conectadas. Informativo. */
  conectadas: number | null;
  limite: number;
  lleno: boolean;
  /** Por qué no se pudo consultar, si es el caso. */
  error?: string;
}

function normalizeBaseUrl(url: string | null | undefined): string {
  const valor = (url ?? "").trim().replace(/\/+$/, "");
  if (!valor) return "";
  return /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
}

async function contarInstancias(apiKey: { id: string; url: string; key: string }): Promise<EvolutionServerCapacity> {
  const limite = limitePorServidor();
  const base = normalizeBaseUrl(apiKey.url);

  const sinDatos = (error: string): EvolutionServerCapacity => ({
    apiKeyId: apiKey.id,
    url: apiKey.url,
    total: null,
    conectadas: null,
    limite,
    // Un servidor que no responde NO se da por lleno: bloquear por no poder
    // contar dejaría sin poder crear nada durante una caída pasajera. Se marca
    // como desconocido y quien decida lo hace con esa información delante.
    lleno: false,
    error,
  });

  if (!base) return sinDatos("Sin URL configurada.");

  try {
    const respuesta = await fetch(`${base}/instance/fetchInstances`, {
      method: "GET",
      headers: { apikey: apiKey.key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!respuesta.ok) return sinDatos(`Evolution respondió ${respuesta.status}.`);

    const datos = await respuesta.json().catch(() => null);
    if (!Array.isArray(datos)) return sinDatos("Respuesta inesperada de Evolution.");

    const conectadas = datos.filter(
      (i: any) => String(i?.connectionStatus ?? i?.instance?.status ?? "").toLowerCase() === "open",
    ).length;

    return {
      apiKeyId: apiKey.id,
      url: apiKey.url,
      total: datos.length,
      conectadas,
      limite,
      lleno: datos.length >= limite,
    };
  } catch (error) {
    return sinDatos(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Ocupación de todos los servidores, en el orden en que se crearon.
 *
 * Se consultan en paralelo: son seis llamadas independientes y en serie
 * añadirían una espera visible al abrir el formulario de un cliente.
 */
export async function getEvolutionCapacity(): Promise<{
  success: boolean;
  message: string;
  data: EvolutionServerCapacity[];
}> {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) {
    return { success: false, message: "No autorizado", data: [] };
  }

  const apiKeys = await db.apiKey.findMany({
    select: { id: true, url: true, key: true },
    orderBy: { createdAt: "asc" },
  });

  const data = await Promise.all(apiKeys.map((apiKey) => contarInstancias(apiKey)));
  return { success: true, message: "Ocupación obtenida", data };
}

/**
 * Primer servidor con cupo, en orden de creación.
 *
 * "En orden" y no "el más vacío" a propósito: llenar de uno en uno mantiene los
 * servidores viejos a plena carga y los nuevos libres, que es lo que permite
 * apagar o migrar uno entero sin tocar a todos los clientes. Repartir a partes
 * iguales dejaría los seis a medias y ninguno prescindible.
 *
 * Los que no se pudieron consultar se saltan: elegir uno a ciegas es como
 * elegirlo a mano, que es justo lo que esto viene a evitar.
 */
export async function pickApiKeyWithCapacity(): Promise<{
  success: boolean;
  message: string;
  apiKeyId?: string;
}> {
  const { success, data } = await getEvolutionCapacity();
  if (!success) return { success: false, message: "No autorizado" };

  const disponible = data.find((s) => s.total !== null && !s.lleno);
  if (disponible) {
    return { success: true, message: `Asignado a ${disponible.url}`, apiKeyId: disponible.apiKeyId };
  }

  const sinRespuesta = data.filter((s) => s.total === null).length;
  return {
    success: false,
    message: sinRespuesta
      ? `Todos los servidores están al límite y ${sinRespuesta} no respondieron. Revisa antes de crear.`
      : "Todos los servidores están al límite. Añade uno nuevo antes de crear más instancias.",
  };
}

/**
 * ¿Cabe una instancia más en este servidor?
 *
 * Se comprueba en el servidor y no solo en el formulario: el desplegable puede
 * estar viejo, y entre abrirlo y guardar puede haberse llenado.
 */
export async function assertApiKeyHasCapacity(
  apiKeyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = await db.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { id: true, url: true, key: true },
  });
  if (!apiKey) return { ok: false, message: "El servidor de Evolution elegido no existe." };

  const estado = await contarInstancias(apiKey);

  // Si no se pudo contar no se bloquea: dejar la plataforma sin poder crear
  // instancias porque un servidor no contesta es peor que pasarse de uno.
  if (estado.total === null) return { ok: true };

  if (estado.lleno) {
    return {
      ok: false,
      message: `El servidor ${apiKey.url} ya tiene ${estado.total} instancias (límite ${estado.limite}). Elige otro.`,
    };
  }

  return { ok: true };
}
