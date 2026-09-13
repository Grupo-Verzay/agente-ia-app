import { randomUUID } from 'crypto';
import {
  createWahaSession,
  getWahaSession,
  isWahaConfigured,
  setWahaSessionWebhook,
  wahaSessionAction,
} from '@/lib/waha';

/**
 * Crear una linea nueva en WhatsApp Mensajeria (Waha) en vez de en Evolution.
 *
 * La linea es la MISMA cosa que antes -una fila en `Instancias` y una tarjeta
 * de «Mensajeria WhatsApp (QR)»-; lo unico que cambia es por donde se conecta,
 * que es un ajuste suyo (`instanceType`) y no un canal aparte. Por eso esto no
 * se ve en ninguna pantalla: quien crea una linea sigue pulsando el mismo
 * boton y escaneando el mismo QR.
 *
 * Vive aqui y no dentro de una accion porque lo usan los TRES caminos que
 * crean lineas —el boton de Conexion, la reactivacion por pago y el registro
 * de un cliente nuevo—. Tenerlo escrito tres veces es como acaban
 * comportandose distinto.
 *
 * La sesion de Waha se llama IGUAL que la instancia: `_V2` no existe (ver la
 * regla «Una linea es UNA instancia» del CLAUDE.md).
 */

/** ¿Hay servidor de Waha al que pedirle la linea? */
export async function sePuedeCrearEnWaha(): Promise<boolean> {
  if (!process.env.BACKEND_URL) return false;
  return isWahaConfigured();
}

export type LineaDeWaha = {
  instanceType: 'waha';
  instanceId: string;
  /** El backend lo compara con la cabecera del webhook antes de aceptarlo. */
  metaVerifyToken: string;
  metaChannel: 'waha';
};

/**
 * Deja la sesion creada y con su webhook, y devuelve los campos con los que se
 * graba la fila. Si algo falla, el motivo del servidor: una linea que no se
 * puede crear y no dice por que es una llamada de soporte.
 */
export async function crearSesionDeWaha(
  instanceName: string,
): Promise<{ ok: true; datos: LineaDeWaha } | { ok: false; message: string }> {
  const nombre = instanceName?.trim();
  if (!nombre) return { ok: false, message: 'La línea necesita un nombre.' };

  if (!(await isWahaConfigured())) {
    return {
      ok: false,
      message: 'La conexión por QR no está configurada. Se pone en Panel > Conexión.',
    };
  }

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  if (!backendUrl) return { ok: false, message: 'BACKEND_URL no configurado en el servidor.' };

  // El mismo secreto en los dos sitios: aqui y en `metaVerifyToken` de la fila.
  const secreto = randomUUID().replace(/-/g, '');
  const webhookUrl = `${backendUrl}/webhook/waha`;

  // Puede existir ya en el servidor de una linea anterior con ese nombre. Se
  // reutiliza reescribiendo su webhook, que es lo que hace el cambio de
  // proveedor; crear encima devolveria "nombre en uso" y no habria forma de
  // seguir sin entrar al servidor a mano.
  const existente = await getWahaSession(nombre);
  const preparada = existente
    ? await setWahaSessionWebhook({ session: nombre, webhookUrl, secret: secreto })
    : await createWahaSession({ session: nombre, webhookUrl, secret: secreto });

  if (!preparada.ok) {
    return { ok: false, message: preparada.message ?? 'No se pudo crear la sesión de WhatsApp.' };
  }
  if (existente && existente.status === 'STOPPED') {
    await wahaSessionAction(nombre, 'start');
  }

  return {
    ok: true,
    datos: {
      instanceType: 'waha',
      // Waha no devuelve un identificador propio como el `hash` de Evolution, y
      // de este cuelgan las sesiones del CRM: se genera aqui y no cambia nunca.
      instanceId: `waha-${randomUUID()}`,
      metaVerifyToken: secreto,
      metaChannel: 'waha',
    },
  };
}
