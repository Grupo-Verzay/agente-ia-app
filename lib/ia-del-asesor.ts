/**
 * La IA de los chats de un asesor: los dos interruptores de su fila en Equipo.
 *
 * - **Sesión** (`sesionApagada`): pausa la sesión temporal de IA
 *   (`Session.status = false`) en las conversaciones que lleva ese asesor.
 *   Normalmente un `SessionTrigger` la vuelve a encender sola; mientras la
 *   marca exista, el motor no la reactiva.
 * - **Agente** (`agenteApagado`): apaga el agente de forma indefinida
 *   (`agentDisabled = true`, `aiOptIn = false`).
 *
 * La regla de la que cuelga todo: **solo se deshace lo que este mecanismo
 * hizo**. Por eso cada conversación que se apaga por aquí deja una MARCA con
 * qué partes apagó y cómo estaban antes. Una conversación que ya estaba
 * apagada a mano no se marca, y al volver a encender el interruptor no se
 * toca.
 *
 * COPIADO BYTE A BYTE en el motor
 * (`api-webhook/src/modules/webhook/services/auto-assign/ia-del-asesor.ts`):
 * los dos escriben las mismas filas al asignar y tienen que decidir lo mismo.
 * Si se toca uno, se copia al otro; los dos bancos los comparan.
 */

export type AjustesDelAsesor = {
  sesionApagada: boolean;
  agenteApagado: boolean;
};

export const AJUSTES_DE_FABRICA: AjustesDelAsesor = {
  sesionApagada: false,
  agenteApagado: false,
};

export type EstadoDeLaIa = {
  status: boolean;
  agentDisabled: boolean;
  aiOptIn: boolean;
};

export type MarcaDelAsesor = {
  apagoSesion: boolean;
  apagoAgente: boolean;
  /** Cómo estaba `aiOptIn` antes de apagar el agente: se devuelve igual. */
  aiOptInAntes: boolean;
};

export type CambioDeLaIa = {
  /** Lo que se escribe en `Session` (vacío si no cambia nada). */
  datos: Partial<EstadoDeLaIa>;
  /** La marca que queda: `null` = se borra (o no hay). */
  marca: MarcaDelAsesor | null;
};

function sinMarcaVacia(marca: MarcaDelAsesor): MarcaDelAsesor | null {
  return marca.apagoSesion || marca.apagoAgente ? marca : null;
}

/**
 * Qué hacer con una conversación que lleva (o pasa a llevar) este asesor.
 *
 * Por cada parte:
 * - interruptor APAGADO: si ya está marcada, se queda; si la IA está
 *   encendida, se apaga y se marca; si ya estaba apagada a mano, nada.
 * - interruptor ENCENDIDO: si está marcada, se devuelve como estaba y se
 *   quita la marca; si no, nada.
 */
export function queHacerAlAsignar(
  estado: EstadoDeLaIa,
  marca: MarcaDelAsesor | null,
  ajustes: AjustesDelAsesor,
): CambioDeLaIa {
  const datos: Partial<EstadoDeLaIa> = {};
  const nueva: MarcaDelAsesor = {
    apagoSesion: marca?.apagoSesion ?? false,
    apagoAgente: marca?.apagoAgente ?? false,
    aiOptInAntes: marca?.aiOptInAntes ?? false,
  };

  // Sesión
  if (ajustes.sesionApagada) {
    if (!nueva.apagoSesion && estado.status) {
      datos.status = false;
      nueva.apagoSesion = true;
    }
  } else if (nueva.apagoSesion) {
    datos.status = true;
    nueva.apagoSesion = false;
  }

  // Agente
  if (ajustes.agenteApagado) {
    if (!nueva.apagoAgente && !estado.agentDisabled) {
      datos.agentDisabled = true;
      datos.aiOptIn = false;
      nueva.apagoAgente = true;
      nueva.aiOptInAntes = estado.aiOptIn;
    }
  } else if (nueva.apagoAgente) {
    datos.agentDisabled = false;
    datos.aiOptIn = nueva.aiOptInAntes;
    nueva.apagoAgente = false;
    nueva.aiOptInAntes = false;
  }

  return { datos, marca: sinMarcaVacia(nueva) };
}

/** Lo que llega del navegador o de la base, saneado. */
export function comoAjustes(valor: unknown): AjustesDelAsesor {
  const v = (valor ?? {}) as Record<string, unknown>;
  return {
    sesionApagada: v.sesionApagada === true,
    agenteApagado: v.agenteApagado === true,
  };
}
