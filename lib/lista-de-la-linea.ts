import { resolveInstanceOwner } from "@/lib/chat-persistence";

/**
 * De donde sale la lista de chats de una linea.
 *
 * Es la distincion que decide si un chat borrado se puede borrar DE VERDAD o
 * solo se puede esconder:
 *
 * - **Evolution** (`Whatsapp`, o sin tipo): la lista la trae Evolution desde el
 *   telefono en cada vuelta. Borrar nuestro historial no borra la conversacion
 *   en WhatsApp, asi que lo unico que la mantiene fuera de la bandeja es la
 *   marca. Quitarla la resucita en la vuelta siguiente.
 * - **Waha, Meta y Telegram**: la lista sale ENTERA de nuestra base. Cuando
 *   `hardDeleteLocalChat` se lleva las sesiones, las conversaciones y los
 *   mensajes de esa linea, ya no queda nada que listar: el chat se fue. La
 *   marca ahi no esconde nada, solo pesa.
 *
 * Y pesaba: 1.044 de las 1.200 filas de una cuenta estaban en «borrada y
 * purgada», 399 de los 407 KB que bajaba la carga inicial, y 871 ms de la
 * consulta que las lee.
 *
 * Se recuerda un rato porque se pregunta una vez por borrado y el tipo de una
 * linea practicamente no cambia; cuando cambia (`proveedor-de-linea-actions`)
 * lo peor que pasa es que durante cinco minutos un borrado se comporte como el
 * proveedor anterior.
 */
const cacheDelTipo = new Map<string, { deNuestraBase: boolean; at: number }>();
const TTL_MS = 5 * 60 * 1000;

/** Los tipos cuya bandeja sale de nuestra base y no de un servidor de fuera. */
const DE_NUESTRA_BASE = new Set(["waha", "meta", "telegram"]);

export function tipoDeLineaEsDeNuestraBase(instanceType?: string | null): boolean {
  return DE_NUESTRA_BASE.has((instanceType ?? "").trim().toLowerCase());
}

export async function laListaSaleDeNuestraBase(
  instanceName?: string | null,
): Promise<boolean> {
  const nombre = instanceName?.trim();
  if (!nombre) return false;

  const enCache = cacheDelTipo.get(nombre);
  if (enCache && Date.now() - enCache.at < TTL_MS) return enCache.deNuestraBase;

  try {
    const dueno = await resolveInstanceOwner(nombre);
    // Sin ficha no se decide: se trata como Evolution, que es el lado que
    // conserva la marca. Equivocarse hacia aqui deja una fila de mas; hacia el
    // otro resucita un chat que alguien borro.
    const deNuestraBase = dueno ? tipoDeLineaEsDeNuestraBase(dueno.instanceType) : false;
    cacheDelTipo.set(nombre, { deNuestraBase, at: Date.now() });
    return deNuestraBase;
  } catch (error) {
    console.warn("[chats] no se pudo saber de que tipo es la linea", {
      instanceName: nombre,
      error: String(error),
    });
    return false;
  }
}
