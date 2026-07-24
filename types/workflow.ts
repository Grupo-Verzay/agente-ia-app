export enum WorkflowStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLICADO"
}
// Límites anti-spam por flujo
export const MAX_NODES_PER_WORKFLOW = 50;
export const MAX_SEGUIMIENTOS_PER_WORKFLOW = 50;

export function getWorkflowEditorPath(workflowId: string, isPro = false) {
  return isPro ? `/workflow/${workflowId}` : `/flow/${workflowId}`;
}

export type UpdateNodePositionInput = {
  nodeId: string;
  posX: number;
  posY: number;
};

export type NodeDB = { id: string; order: number };
export type EdgeDB = { sourceId: string; targetId: string };
