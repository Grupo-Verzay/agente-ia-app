import "server-only";

import { db } from "@/lib/db";
import {
  anotarQueNoHabiaLinea,
  resolveSystemNotificationDispatcherLine,
  sendViaWhatsAppDispatcher,
} from "@/actions/whatsapp-dispatcher";
import { anotarElEnvio } from "@/lib/salud-del-envio-db";
// Sin puerta: esto corre desde el cron, sin sesión. Ver `lib/envio-por-canal.server.ts`.
import { listarPlantillasMeta as listMetaTemplates, enviarPlantillaMeta as sendMetaTemplate } from "@/lib/envio-por-canal.server";

/**
 * El aviso de «tu WhatsApp se desvinculo»: el unico mensaje que la plataforma
 * le manda a un cliente por su cuenta cuando se le cae la linea.
 *
 * ## Por que vive aqui y no en `actions/api-action.ts`
 *
 * Porque **una accion es un endpoint**. Aquel fichero es el de Conexiones
 * —crear la linea, el QR, cerrar sesion, el Robot— y tiene que seguir siendo
 * `"use server"`; pero mientras esta funcion estuviera exportada desde alli,
 * era un boton publico para **mandar un WhatsApp al numero que uno escribiera,
 * por la linea de notificaciones de la casa**. Ese numero es el que le escribe
 * a todos los clientes: usarlo para mandar mensajes a desconocidos es la forma
 * mas rapida de que WhatsApp lo mire con lupa.
 *
 * Ponerle la guarda de siempre no valia, porque uno de sus dos llamadores es
 * el cron de `/api/cron/evolution-disconnect`, y **desde un cron no hay
 * sesion** — `currentUser()` devuelve vacio. Eso es lo que dejo los avisos de
 * Waha callados durante dias sin un solo error en los registros.
 *
 * Sus dos llamadores siguen igual y ninguno es un navegador: ese cron, y
 * `generateQRCode` dentro de `api-action.ts`, que ya pasa por
 * `assertUserCanUseApp` antes de llegar aqui.
 */

const QR_DISCONNECTION_MESSAGE =
  "📵 El WhatsApp esta *desvinculado* del Agente.\n\n" +
  "*Solución*: entre a su cuenta\n\n" +
  "👉 agente.ia-app.com/profile\n\n" +
  "*Conectar* → en WhatsApp Business: Dispositivos vinculados.\n\n" +
  "*Vincular un dispositivo* y escanee el *QR* 📳";

/* =========================
   Server-Action: Generar QR
   - Solo usa Evolution si instanceType es WhatsApp o nulo.
   - Mantiene TUS mensajes originales.
========================= */
export async function sendQrDisconnectedNotification(
  remoteJid: string,
  userId: string,
  source = 'generateQRCode',
) {
  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      ownerId: true,
      demoResellerId: true,
    },
  });
  const ownerUserId =
    targetUser?.ownerId?.trim() ||
    targetUser?.demoResellerId?.trim() ||
    (targetUser?.role === 'super_admin' ? targetUser.id : null);

  const dispatcher = await resolveSystemNotificationDispatcherLine(ownerUserId);
  if (!dispatcher) {
    // Este aviso lo dispara un cron cada pocas horas y nadie lee su excepcion:
    // sin linea de notificaciones, la plataforma deja de avisar de las
    // desconexiones y el sintoma es que a nadie le llega nada. Queda anotado
    // ANTES de lanzar, que es lo unico que lo hace visible.
    await anotarQueNoHabiaLinea({
      tipo: "desconexion",
      cuentaId: ownerUserId ?? userId,
      destinatario: remoteJid,
      motivo: "No hay linea de notificaciones conectada.",
    });
    throw new Error("No hay linea de notificaciones conectada.");
  }

  if (dispatcher.provider === "meta") {
    const templateName = "whatsapp_desvinculado_qr";
    const templateList = await listMetaTemplates(dispatcher.instanceName);
    const template = templateList.templates.find((item) => item.name === templateName);
    if (templateList.success && template) {
      // Una plantilla de Meta NO pasa por el despachador, asi que su resultado
      // se anota aqui o no se anota en ninguna parte. Es el mismo caso que la
      // falta de linea: un camino que se sale antes de la funcion que registra.
      const envio = await sendMetaTemplate(dispatcher.instanceName, remoteJid, template, [
        "agente.ia-app.com/profile",
      ]);
      await anotarElEnvio({
        tipo: "desconexion",
        proveedor: "meta",
        cuentaId: ownerUserId ?? userId,
        linea: dispatcher.instanceName,
        destinatario: remoteJid,
        salio: Boolean(envio?.success),
        motivo: envio?.message,
      });
      return envio;
    }
  }

  return sendViaWhatsAppDispatcher({
    dispatcher,
    remoteJid,
    text: QR_DISCONNECTION_MESSAGE,
    history: {
      instanceName: dispatcher.instanceName,
      type: 'notification',
      additionalKwargs: {
        source,
        userId,
        reason: 'evolution_disconnect',
      },
    },
    registro: { tipo: 'desconexion', cuentaId: userId },
  });
}
