export enum WorkflowStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLICADO"
}
// Límites anti-spam por flujo
export const MAX_NODES_PER_WORKFLOW = 50;
export const MAX_SEGUIMIENTOS_PER_WORKFLOW = 50;

// Un solo creador de flujos: todo abre en el editor visual (/workflow).
// Se conserva el parámetro isPro por compatibilidad con las llamadas
// existentes, pero ya no cambia la ruta.
export function getWorkflowEditorPath(workflowId: string, _isPro = false) {
  return `/workflow/${workflowId}`;
}

export type UpdateNodePositionInput = {
  nodeId: string;
  posX: number;
  posY: number;
};

export type NodeDB = { id: string; order: number };
export type EdgeDB = { sourceId: string; targetId: string };
