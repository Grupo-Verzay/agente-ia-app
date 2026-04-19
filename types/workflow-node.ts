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
  | `seguimiento-${"text" | "image" | "video" | "document" | "audio"}`;

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
export type BaseActionType = "text" | "image" | "video" | "document" | "audio" | "seguimiento" | "node_pause" | "nodo-notify" | "intention";

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
];

//  Acciones de seguimiento (sub-tipos)
export const seguimientoActions: Action[] = [
  { type: "seguimiento-text", label: "Texto", icon: FileText, iconClassName: `text-purple-600` },
  { type: "seguimiento-image", label: "Imagen", icon: ImageIcon, iconClassName: `text-blue-500` },
  { type: "seguimiento-video", label: "Video", icon: Video, iconClassName: `text-red-500` },
  { type: "seguimiento-document", label: "Documento", icon: File, iconClassName: `text-gray-500` },
  { type: "seguimiento-audio", label: "Audio", icon: Music, iconClassName: `text-green-500` },
];

export const cardBaseActions: Action[] = [
  { type: "text", label: "Texto", icon: FileText, bg: "bg-gray-500", iconClassName: "h-4 w-4 text-white" },
  { type: "image", label: "Imagen", icon: ImageIcon, bg: "bg-blue-500", iconClassName: "h-4 w-4 text-white" },
  { type: "video", label: "Video", icon: Video, bg: "bg-red-500", iconClassName: "h-4 w-4 text-white" },
  { type: "document", label: "Documento", icon: File, bg: "bg-yellow-500", iconClassName: "h-4 w-4 text-white" },
  { type: "audio", label: "Audio", icon: Music, bg: "bg-green-500", iconClassName: "h-4 w-4 text-white" },
  { type: "node_pause", label: "Pausar", icon: OctagonPause, bg: "bg-blue-500", iconClassName: "h-4 w-4 text-white" },
  { type: "nodo-notify", label: "Notificar", icon: MessageCircle, bg: "bg-yellow-500", iconClassName: "h-4 w-4 text-white" },
  { type: "intention", label: "Intención", icon: Brain, bg: "bg-black", iconClassName: "h-4 w-4 text-white" },
];

export const cardSeguimientoActions: Action[] = [
  { type: "seguimiento-text", label: "Texto", icon: FileText, bg: "bg-gray-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-image", label: "Imagen", icon: ImageIcon, bg: "bg-blue-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-video", label: "Video", icon: Video, bg: "bg-red-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-document", label: "Documento", icon: File, bg: "bg-gray-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
  { type: "seguimiento-audio", label: "Audio", icon: Music, bg: "bg-green-500", iconClassName: `h-4 w-4 text-white ${stylesSeguimiento}` },
];

export const ACTIONS = [...baseActions, ...seguimientoActions];
export const CARD_ACTIONS = [...cardBaseActions, ...cardSeguimientoActions];