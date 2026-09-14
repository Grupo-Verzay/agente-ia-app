/**
 * Que cuenta como "registro del lead", en un solo sitio.
 *
 * Estos numeros salen en DOS pantallas: el globo del badge en la cabecera del
 * chat y el panel «Ver y gestionar». Si cada una filtra por su cuenta, el globo
 * dice 5 y el panel ensena 3, y no hay forma de saber cual miente.
 *
 * Las condiciones no son obvias -los seguimientos excluyen los `idNodo` de
 * recordatorios, citas y campanas; los recordatorios excluyen las campanas-, y
 * son justo las que se copian mal. Por eso viven aqui y las importan los dos
 * caminos: las consultas del servidor y el snapshot que arma el navegador.
 *
 * Modulo puro: solo constantes y objetos `where`. Sin `use server`, sin `db`.
 */

/** Un seguimiento heredado cuenta cuando esta pendiente. */
export const SEGUIMIENTO_PENDIENTE = "pending";

/** Un follow-up del CRM cuenta mientras no ha terminado. */
export const ESTADOS_DE_FOLLOWUP_VIVO = ["PENDING", "PROCESSING"] as const;

/** Una cita deja de contar cuando ya no va a pasar. */
export const ESTADOS_DE_CITA_CERRADA = ["FINALIZADO", "DESCARTADO", "CANCELADA"] as const;

/**
 * Los seguimientos heredados de un contacto.
 *
 * Se dejan fuera los que no son seguimientos de verdad: los que nacieron de un
 * recordatorio, de una cita o de una campana se reconocen por su `idNodo`.
 */
export function whereSeguimientosDelLead(remoteJid: string) {
  return {
    remoteJid,
    NOT: {
      OR: [
        { idNodo: null },
        { idNodo: "" },
        { idNodo: { startsWith: "reminder-" } },
        { idNodo: { startsWith: "appt-confirm-" } },
        { idNodo: { startsWith: "appt-reminder-" } },
        { idNodo: { startsWith: "camping-" } },
      ],
    },
  };
}

/** Los recordatorios de un contacto. Una campana no es un recordatorio suyo. */
export function whereRecordatoriosDelLead(userId: string, remoteJid: string) {
  return { userId, remoteJid, isCampaign: false };
}

/**
 * Lo que el globo del badge necesita para pintarse, sin pedir nada.
 *
 * Viaja con la sesion del chat abierto, que es una consulta que ya se hace al
 * abrir la conversacion. Antes estos numeros costaban SEIS acciones de servidor
 * mas, y Next las encola de una en una: eran seis turnos de cola detras de todo
 * lo demas del arranque.
 */
export type ResumenDeRegistros = {
  /** Cuantos registros hay de cada tipo (SOLICITUD, REPORTE, PEDIDO…). */
  porTipo: Record<string, number>;
  seguimientos: number;
  recordatorios: number;
  citas: number;
  followUpsIa: number;
};

export const RESUMEN_VACIO: ResumenDeRegistros = {
  porTipo: {},
  seguimientos: 0,
  recordatorios: 0,
  citas: 0,
  followUpsIa: 0,
};
