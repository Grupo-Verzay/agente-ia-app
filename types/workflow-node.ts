import { User, WorkflowNode } from "@prisma/client";

import {
  FileText,
  Image as ImageIcon,
  Video,
  File,
  Music,
  AlarmClock,
  OctagonPause,
  MessageCircle,
  Brain,
  FileSpreadsheet,
  Tag,
  UserPlus,
  CheckCircle2,
  BellRing,
  RefreshCw,
  Bot,
  Webhook,
  Phone,
} from "lucide-react";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export type WorkflowNodeType =
  | "text"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "node_pause"
  | "nodo-notify"
  | "intention"
  | "guardar-ficha"
  | AutomationActionType
  | `seguimiento-${"text" | "image" | "video" | "document" | "audio"}`;

// Nodos de automatización (reúsan los handlers de las automatizaciones del
// Kanban en el backend). Su configuración se guarda como JSON en el campo
// `message` del WorkflowNode (no envían nada al cliente, solo efecto CRM).
export type AutomationActionType =
  | "tag-add"
  | "tag-remove"
  | "assign-advisor"
  | "create-task"
  | "notify-advisor"
  | "change-status"
  | "toggle-ai"
  | "webhook"
  | "ai-call";

// Mapa nodo de /workflow -> StageActionType del motor de automatizaciones del
// backend. Debe mantenerse igual al AUTOMATION_TIPO_MAP de workflow.service.ts.
export const AUTOMATION_NODE_TO_STAGE_ACTION: Record<AutomationActionType, string> = {
  "tag-add": "TAG_ADD",
  "tag-remove": "TAG_REMOVE",
  "assign-advisor": "ASSIGN",
  "create-task": "TASK",
  "notify-advisor": "NOTIFY_ADVISOR",
  "change-status": "CHANGE_STATUS",
  "toggle-ai": "TOGGLE_AI",
  "webhook": "WEBHOOK",
  "ai-call": "AI_CALL",
};

export const AUTOMATION_NODE_TYPES: AutomationActionType[] = [
  "tag-add",
  "tag-remove",
  "assign-advisor",
  "create-task",
  "notify-advisor",
  "change-status",
  "toggle-ai",
  "webhook",
  "ai-call",
];

export const isAutomationNodeType = (tipo?: string | null): tipo is AutomationActionType =>
  !!tipo && (AUTOMATION_NODE_TYPES as string[]).includes(tipo);

export type WorkflowNodeDB = WorkflowNode

export type WorkflowEdgeDB = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type PropsWorkflowCanvas = {
  nodesDB: WorkflowNodeDB[];
  edgesDB?: WorkflowEdgeDB[];
  workflowId: string;
  user: User;

  registerCreateNode?: (fn: (action: import('@/types/workflow-node').Action) => void) => void;
};

export type CustomNodeData = {
  nodeDB: WorkflowNodeDB; // cambiar a tu DTO real
  workflowId: string;
  user: User;
  totalNodes: number;
  seguimientoNodes: number;
};

export interface PropsNodeCard {
  workflowId: string;
  nodes: WorkflowNode;
  user: User;
  targetHandle?: ReactNode;
}

export const MAX_MESSAGE_LENGTH = 1000;

export type PaletteItem = {
  type: string;      // tipo de ReactFlow: ej "customNode"
  label: string;     // label UI
  nodeTipo: string;  // tu WorkflowNode.tipo (texto, imagen, audio...)
  icon?: ReactNode;
};

export const PALETTE: PaletteItem[] = [
  { type: "customNode", label: "Texto", nodeTipo: "texto" },
  { type: "customNode", label: "Imagen", nodeTipo: "imagen" },
  { type: "customNode", label: "Audio", nodeTipo: "audio" },
  { type: "customNode", label: "Documento", nodeTipo: "documento" },
  { type: "customNode", label: "Intención", nodeTipo: "intention" },
  { type: "customNode", label: "Seguimiento Video", nodeTipo: "seguimiento-video" },
];

// Tipos base (acciones generales)
export type BaseActionType = "text" | "image" | "video" | "document" | "audio" | "seguimiento" | "node_pause" | "nodo-notify" | "intention" | "guardar-ficha" | AutomationActionType;

// Tipos de seguimiento (prefijo "seguimiento-")
export type SeguimientoActionType =
  | "seguimiento-text"
  | "seguimiento-image"
  | "seguimiento-video"
  | "seguimiento-document"
  | "seguimiento-audio"

export type PropsWorkflowSidebar = {
  totalNodes: number;
  seguimientoNodes: number;
  onCreateNode: (action: Action) => void;
};
// Tipo combinado para ActionType
export type ActionType = BaseActionType | SeguimientoActionType;

export interface Action {
  type: ActionType;
  label: string;
  icon: LucideIcon;
  bg?: string;
  iconClassName?: string;
}

const stylesSeguimiento = "text-purple-700";

//  Acciones base (OJO: "seguimiento" idealmente NO debe estar aquí si será solo categoría)
export const baseActions: Action[] = [
  { type: "text", label: "Texto", icon: FileText, iconClassName: `text-purple-600` },
  { type: "image", label: "Imagen", icon: ImageIcon, iconClassName: `text-blue-500` },
  { type: "video", label: "Video", icon: Video, iconClassName: `text-red-500` },
  { type: "document", label: "Documento", icon: File, iconClassName: `text-gray-500` },
  { type: "audio", label: "Audio", icon: Music, iconClassName: `text-green-500` },
  { type: "node_pause", label: "Pausar", icon: OctagonPause, iconClassName: `text-blue-500` },
  { type: "nodo-notify", label: "Notificar", icon: MessageCircle, iconClassName: `text-yellow-500` },
  { type: "intention", label: "Intención", icon: Brain, iconClassName: "text-cyan-500" },
  { type: "guardar-ficha", label: "Guardar ficha", icon: FileSpreadsheet, iconClassName: "text-teal-600" },
];

//  Acciones de seguimiento (sub-tipos)
export const seguimientoActions: Action[] = [
  { type: "seguimiento-text", label: "Texto", icon: FileText, iconClassName: `text-purple-600` },
  { type: "seguimiento-image", label: "Imagen", icon: ImageIcon, iconClassName: `text-blue-500` },
  { type: "seguimiento-video", label: "Video", icon: Video, iconClassName: `text-red-500` },
  { type: "seguimiento-document", label: "Documento", icon: File, iconClassName: `text-gray-500` },
  { type: "seguimiento-audio", label: "Audio", icon: Music, iconClassName: `text-green-500` },
];

//  Acciones de automatización (efecto CRM: mismas del Kanban)
export const automationActions: Action[] = [
  { type: "tag-add", label: "Agregar tag", icon: Tag, iconClassName: "text-emerald-600" },
  { type: "tag-remove", label: "Quitar tag", icon: Tag, iconClassName: "text-rose-500" },
  { type: "assign-advisor", label: "Asignar asesor", icon: UserPlus, iconClassName: "text-indigo-500" },
  { type: "create-task", label: "Crear tarea", icon: CheckCircle2, iconClassName: "text-sky-500" },
  { type: "notify-advisor", label: "Notificar asesor", icon: BellRing, iconClassName: "text-amber-500" },
  { type: "change-status", label: "Cambiar estado", icon: RefreshCw, iconClassName: "text-violet-500" },
  { type: "toggle-ai", label: "Activar / Desactivar IA", icon: Bot, iconClassName: "text-cyan-500" },
  { type: "webhook", label: "Webhook externo", icon: Webhook, iconClassName: "text-slate-500" },
  { type: "ai-call", label: "Llamar con IA (voz)", icon: Phone, iconClassName: "text-green-600" },
];

// División visual de baseActions: NODOS (contenido/media) vs ACCIONES (lógica)
export const nodeActions: Action[] = baseActions.filter((a) =>
  ['text', 'image', 'video', 'document', 'audio'].includes(a.type)
);
export const accionActions: Action[] = baseActions.filter((a) =>
  ['node_pause', 'nodo-notify', 'intention', 'guardar-ficha'].includes(a.type)
);

export const cardBaseActions: Action[] = [
  { type: "text", label: "Texto", icon: FileText, bg: "bg-gray-500", iconClassName: "h-4 w-4 text-white" },
  { type: "image", label: "Imagen", icon: ImageIcon, bg: "bg-blue-500", iconClassName: "h-4 w-4 text-white" },
  { type: "video", label: "Video", icon: Video, bg: "bg-red-500", iconClassName: "h-4 w-4 text-white" },
  { type: "document", label: "Documento", icon: File, bg: "bg-yellow-500", iconClassName: "h-4 w-4 text-white" },
  { type: "audio", label: "Audio", icon: Music, bg: "bg-green-500", iconClassName: "h-4 w-4 text-white" },
  { type: "node_pause", label: "Pausar", icon: OctagonPause, bg: "bg-blue-500", iconClassName: "h-4 w-4 text-white" },
  { type: "nodo-notify", label: "Notificar", icon: MessageCircle, bg: "bg-yellow-500", iconClassName: "h-4 w-4 text-white" },
  { type: "intention", label: "Intención", icon: Brain, bg: "bg-black", iconClassName: "h-4 w-4 text-white" },
  { type: "guardar-ficha", label: "Guardar ficha", icon: FileSpreadsheet, bg: "bg-teal-600", iconClassName: "h-4 w-4 text-white" },
];

export const cardSeguimientoActions: Action[] = [
  { type: "seguimiento-text", label: "Texto", icon: FileText, bg: "bg-gray-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-image", label: "Imagen", icon: ImageIcon, bg: "bg-blue-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-video", label: "Video", icon: Video, bg: "bg-red-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-document", label: "Documento", icon: File, bg: "bg-gray-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-audio", label: "Audio", icon: Music, bg: "bg-green-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
];

export const cardAutomationActions: Action[] = [
  { type: "tag-add", label: "Agregar tag", icon: Tag, bg: "bg-emerald-600", iconClassName: "h-4 w-4 text-white" },
  { type: "tag-remove", label: "Quitar tag", icon: Tag, bg: "bg-rose-500", iconClassName: "h-4 w-4 text-white" },
  { type: "assign-advisor", label: "Asignar asesor", icon: UserPlus, bg: "bg-indigo-500", iconClassName: "h-4 w-4 text-white" },
  { type: "create-task", label: "Crear tarea", icon: CheckCircle2, bg: "bg-sky-500", iconClassName: "h-4 w-4 text-white" },
  { type: "notify-advisor", label: "Notificar asesor", icon: BellRing, bg: "bg-amber-500", iconClassName: "h-4 w-4 text-white" },
  { type: "change-status", label: "Cambiar estado", icon: RefreshCw, bg: "bg-violet-500", iconClassName: "h-4 w-4 text-white" },
  { type: "toggle-ai", label: "Activar / Desactivar IA", icon: Bot, bg: "bg-cyan-500", iconClassName: "h-4 w-4 text-white" },
  { type: "webhook", label: "Webhook externo", icon: Webhook, bg: "bg-slate-500", iconClassName: "h-4 w-4 text-white" },
  { type: "ai-call", label: "Llamar con IA (voz)", icon: Phone, bg: "bg-green-600", iconClassName: "h-4 w-4 text-white" },
];

export const ACTIONS = [...baseActions, ...seguimientoActions, ...automationActions];
export const CARD_ACTIONS = [...cardBaseActions, ...cardSeguimientoActions, ...cardAutomationActions];