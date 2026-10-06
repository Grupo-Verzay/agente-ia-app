/**
 * Qué PASTILLAS ve cada persona en la fila de una conversación de Chats.
 *
 * Son los diez indicadores del renglón de pastillas, repartidos en dos
 * tarjetas de Perfil › Apariencia: prioritarios a la izquierda y secundarios a
 * la derecha. Todos ENCENDIDOS por defecto: no haber tocado nada es ver la fila
 * como siempre. Apagar uno solo deja de pintarlo: el dato sigue existiendo.
 *
 * Lo que NO es una pastilla —el aro, el ancla, lo no leído, las palomitas, la
 * vista previa…— no tiene interruptor y no entra aquí.
 *
 * Puro: lo usan la tarjeta de Apariencia, la acción que guarda y la fila.
 */

export type GrupoDeIconos = "prioritarios" | "secundarios";

export const ICONOS_DE_LA_FILA = [
  { clave: "calificacion", grupo: "prioritarios", titulo: "Calificación", detalle: "Frío, tibio, caliente, finalizado o descartado." },
  { clave: "asesor", grupo: "prioritarios", titulo: "Asesor asignado", detalle: "Las iniciales de quien lleva la conversación." },
  { clave: "etapa", grupo: "prioritarios", titulo: "Etapa del embudo", detalle: "En qué etapa del embudo está." },
  { clave: "cita", grupo: "prioritarios", titulo: "Cita agendada", detalle: "El calendario con el estado de la cita." },
  // Se llama `notaInterna` porque así se guardaba antes: quien la apagó la sigue teniendo apagada.
  { clave: "notaInterna", grupo: "prioritarios", titulo: "Notas internas", detalle: "El candado de las conversaciones con notas." },
  { clave: "espera", grupo: "secundarios", titulo: "En espera de asesor", detalle: "El reloj de quien espera a una persona." },
  { clave: "recordatorios", grupo: "secundarios", titulo: "Recordatorios", detalle: "La campana con los recordatorios programados." },
  { clave: "flujos", grupo: "secundarios", titulo: "Flujos ejecutados", detalle: "Los flujos que ya corrieron en la conversación." },
  { clave: "seguimientos", grupo: "secundarios", titulo: "Seguimientos", detalle: "Los seguimientos pendientes." },
  { clave: "etiquetas", grupo: "secundarios", titulo: "Etiquetas", detalle: "Cuántas etiquetas tiene la conversación." },
] as const;

export type ClaveDeIcono = (typeof ICONOS_DE_LA_FILA)[number]["clave"];
export type IconosDeLaFila = Record<ClaveDeIcono, boolean>;

export const CLAVES_DE_ICONOS: readonly ClaveDeIcono[] = ICONOS_DE_LA_FILA.map((i) => i.clave);

export const TARJETAS_DE_ICONOS: readonly {
  grupo: GrupoDeIconos;
  titulo: string;
  detalle: string;
}[] = [
  { grupo: "prioritarios", titulo: "Indicadores prioritarios", detalle: "Lo que más se mira en cada conversación" },
  { grupo: "secundarios", titulo: "Indicadores secundarios", detalle: "El resto de pastillas de la fila" },
];

export function losIconosDelGrupo(grupo: GrupoDeIconos) {
  return ICONOS_DE_LA_FILA.filter((i) => i.grupo === grupo);
}

export const ICONOS_POR_DEFECTO: IconosDeLaFila = Object.fromEntries(
  CLAVES_DE_ICONOS.map((c) => [c, true]),
) as IconosDeLaFila;

/**
 * Lo que llega de la base o del navegador. Solo un `false` explícito apaga:
 * lo que falte o no se entienda queda ENCENDIDO. Las claves de antes que ya no
 * son pastillas (`sinLeer`, `resumenIa`) se ignoran.
 */
export function comoIconosDeLaFila(valor: unknown): IconosDeLaFila {
  const fuente =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  const salida = { ...ICONOS_POR_DEFECTO };
  for (const clave of CLAVES_DE_ICONOS) {
    if (fuente[clave] === false) salida[clave] = false;
  }
  return salida;
}

/** Con una clave cambiada; una clave que no existe no cambia nada. */
export function conElIcono(
  actuales: IconosDeLaFila,
  clave: string,
  visible: boolean,
): IconosDeLaFila {
  if (!(CLAVES_DE_ICONOS as readonly string[]).includes(clave)) return actuales;
  return { ...actuales, [clave]: visible === true };
}
