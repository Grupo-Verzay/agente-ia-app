import { Plan } from "@prisma/client";

/**
 * Catálogo de las piezas del creador de flujos y helpers de acceso por plan.
 *
 * La "featureKey" de cada pieza es su `type` en la paleta (types/workflow-node.ts),
 * p. ej. "webhook", "text", "seguimiento-video". Este catálogo es la fuente de
 * verdad para: (1) la tabla de Admin (Funciones × Planes) y (2) el candado del
 * panel del creador. Debe mantenerse en sincronía con las paletas de
 * types/workflow-node.ts (nodeActions, accionActions, automationActions,
 * seguimientoActions).
 */

export type WorkflowFeatureGroup = "Nodos" | "Acciones" | "Automatizaciones" | "Seguimientos";

export type WorkflowFeature = {
  key: string;
  label: string;
  group: WorkflowFeatureGroup;
};

export const WORKFLOW_FEATURE_GROUPS: WorkflowFeatureGroup[] = [
  "Nodos",
  "Acciones",
  "Automatizaciones",
  "Seguimientos",
];

export const WORKFLOW_FEATURES: WorkflowFeature[] = [
  // Nodos
  { key: "text", label: "Texto", group: "Nodos" },
  { key: "image", label: "Imagen", group: "Nodos" },
  { key: "video", label: "Video", group: "Nodos" },
  { key: "document", label: "Documento", group: "Nodos" },
  { key: "audio", label: "Audio", group: "Nodos" },
  // Acciones
  { key: "node_pause", label: "Pausar", group: "Acciones" },
  { key: "nodo-notify", label: "Notificar", group: "Acciones" },
  { key: "intention", label: "Intención", group: "Acciones" },
  { key: "guardar-ficha", label: "Guardar ficha", group: "Acciones" },
  // Automatizaciones
  { key: "tag-add", label: "Agregar tag", group: "Automatizaciones" },
  { key: "tag-remove", label: "Quitar tag", group: "Automatizaciones" },
  { key: "assign-advisor", label: "Asignar asesor", group: "Automatizaciones" },
  { key: "create-task", label: "Crear tarea", group: "Automatizaciones" },
  { key: "notify-advisor", label: "Notificar asesor", group: "Automatizaciones" },
  { key: "change-status", label: "Cambiar estado", group: "Automatizaciones" },
  { key: "toggle-ai", label: "Activar / Desactivar IA", group: "Automatizaciones" },
  { key: "webhook", label: "Webhook externo", group: "Automatizaciones" },
  { key: "ai-call", label: "Llamar con IA (voz)", group: "Automatizaciones" },
  // Seguimientos
  { key: "seguimiento-text", label: "Texto", group: "Seguimientos" },
  { key: "seguimiento-image", label: "Imagen", group: "Seguimientos" },
  { key: "seguimiento-video", label: "Video", group: "Seguimientos" },
  { key: "seguimiento-document", label: "Documento", group: "Seguimientos" },
  { key: "seguimiento-audio", label: "Audio", group: "Seguimientos" },
];

const VALID_FEATURE_KEYS = new Set(WORKFLOW_FEATURES.map((f) => f.key));

export function isValidFeatureKey(key: string): boolean {
  return VALID_FEATURE_KEYS.has(key);
}

/** featureKey -> planes con acceso. Ausente o vacío = disponible para todos. */
export type FeatureAccessMap = Record<string, Plan[]>;

/**
 * ¿Está bloqueada esta función para este plan?
 * Reglas:
 *  - Sin regla para la función (no hay fila) → disponible para TODOS.
 *  - Hay regla → SOLO los planes listados tienen acceso (una lista vacía
 *    significa que se bloqueó para todos los planes).
 */
export function isFeatureLockedForPlan(
  featureKey: string,
  plan: Plan,
  access: FeatureAccessMap,
): boolean {
  const allowed = access[featureKey];
  if (allowed === undefined) return false;
  return !allowed.includes(plan);
}

/** Conjunto de featureKeys bloqueadas para un plan (vacío si está exento). */
export function lockedFeatureKeys(
  plan: Plan | undefined | null,
  access: FeatureAccessMap,
  exempt = false,
): Set<string> {
  const set = new Set<string>();
  if (exempt || !plan) return set;
  for (const f of WORKFLOW_FEATURES) {
    if (isFeatureLockedForPlan(f.key, plan, access)) set.add(f.key);
  }
  return set;
}
