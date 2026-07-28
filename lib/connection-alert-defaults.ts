/**
 * Valores por defecto y validación del aviso de "WhatsApp desvinculado".
 *
 * Viven aquí y no junto a las acciones porque un archivo `"use server"` solo
 * puede exportar funciones async: constantes y validaciones síncronas romperían
 * la compilación. Además así los usa también el formulario, que corre en el
 * navegador y necesita validar antes de enviar.
 */

/** El backend guarda los horarios como CSV; aquí se muestran con espacios. */
export const DEFAULT_ALERT_SLOTS = "09:00, 13:00, 17:00";

export const DEFAULT_ALERT_MESSAGE =
  "📵 El WhatsApp esta *desvinculado* del Agente.\n\n" +
  "*Solución*: entre a su cuenta\n\n" +
  "👉 agente.ia-app.com/profile\n\n" +
  "*Conectar* → en WhatsApp Business: Dispositivos vinculados.\n\n" +
  "*Vincular un dispositivo* y escanee el *QR* 📳";

export interface ConnectionAlertConfigData {
  enabled: boolean;
  /** Horarios en HH:MM separados por coma. Vacío = los de siempre. */
  slots: string;
  /** Texto del aviso. Vacío = el de siempre. */
  message: string;
  /** Instancia emisora. Vacío = la del dueño de cada cliente. */
  instanceName: string;
}

/**
 * Valida los horarios y devuelve el error concreto, no un "formato inválido".
 *
 * Un horario mal escrito no dispara nunca, y el aviso desaparecería en silencio:
 * es justo el fallo que no se puede permitir en la pantalla que configura el
 * aviso de que algo está caído.
 */
export function validarHorarios(
  valor: string,
): { ok: true; limpio: string } | { ok: false; error: string } {
  const partes = valor
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (partes.length === 0) return { ok: true, limpio: "" };

  const normalizados: string[] = [];
  for (const parte of partes) {
    const coincide = /^(\d{1,2}):(\d{2})$/.exec(parte);
    if (!coincide) {
      return { ok: false, error: `"${parte}" no es una hora. Escríbelas como 09:00, separadas por comas.` };
    }
    const horas = Number(coincide[1]);
    const minutos = Number(coincide[2]);
    if (horas > 23 || minutos > 59) {
      return { ok: false, error: `"${parte}" no existe como hora del día.` };
    }
    normalizados.push(`${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`);
  }

  const unicos = Array.from(new Set(normalizados)).sort();
  return { ok: true, limpio: unicos.join(", ") };
}
