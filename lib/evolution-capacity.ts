import { db } from "@/lib/db";

/**
 * Cupo de instancias por servidor de Evolution.
 *
 * La lógica vive aquí y no junto a las acciones porque hace falta en dos sitios
 * con reglas de acceso distintas: el panel (solo admin/reseller) y el registro
 * público, donde todavía no hay sesión. Las acciones envuelven esto con su
 * comprobación de permisos; el registro lo usa directo, en el servidor.
 *
 * El límite se mide sobre el TOTAL de instancias del servidor, no sobre las
 * conectadas. Una instancia existe y ocupa su sitio aunque esté desconectada en
 * ese momento; contar solo las conectadas dejaría crear de más justo cuando hay
 * líneas caídas, y al reconectarse todas el servidor quedaría por encima del
 * límite sin que nadie hubiera hecho nada mal.
 */

const LIMITE_POR_DEFECTO = 20;

export function limitePorServidor(): number {
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

export async function contarInstancias(apiKey: {
  id: string;
  url: string;
  key: string;
}): Promise<EvolutionServerCapacity> {
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
 * Se consultan en paralelo: son varias llamadas independientes y en serie
 * añadirían una espera visible.
 */
export async function leerOcupacionServidores(): Promise<EvolutionServerCapacity[]> {
  const apiKeys = await db.apiKey.findMany({
    select: { id: true, url: true, key: true },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(apiKeys.map((apiKey) => contarInstancias(apiKey)));
}

/**
 * Primer servidor con cupo, en orden de creación.
 *
 * "En orden" y no "el más vacío" a propósito: llenar de uno en uno mantiene los
 * servidores viejos a plena carga y los nuevos libres, que es lo que permite
 * apagar o migrar uno entero sin tocar a todos los clientes. Repartir a partes
 * iguales dejaría todos a medias y ninguno prescindible.
 *
 * Los que no se pudieron consultar se saltan: elegir uno a ciegas es como
 * elegirlo a mano, que es justo lo que esto viene a evitar.
 */
export async function elegirServidorConCupo(): Promise<{
  apiKeyId: string | null;
  url?: string;
  motivo?: string;
}> {
  const servidores = await leerOcupacionServidores();

  const disponible = servidores.find((s) => s.total !== null && !s.lleno);
  if (disponible) return { apiKeyId: disponible.apiKeyId, url: disponible.url };

  const sinRespuesta = servidores.filter((s) => s.total === null).length;
  return {
    apiKeyId: null,
    motivo: sinRespuesta
      ? `Todos los servidores están al límite y ${sinRespuesta} no respondieron.`
      : "Todos los servidores están al límite.",
  };
}
