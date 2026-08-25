import {
  FileText,
  Image as ImageIcon,
  Video,
  File,
  Music,
  OctagonPause,
  Brain,
  StickyNote,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

/**
 * Nodos propios de Diagramas. A diferencia de Workflow, un diagrama no
 * ejecuta nada -es solo para explicarle el proceso a un cliente-, asi que
 * aqui NO se reutiliza la lista de acciones de automatizacion/seguimiento de
 * Workflow (tags, webhooks, IA, campañas...): esos tipos no representan
 * nada visualmente distinto de una nota con texto libre. `type` es un
 * string libre (no el union cerrado de Workflow) para poder tener tipos que
 * no existen alla, como "nota".
 */
export interface DiagramaAction {
  type: string;
  label: string;
  icon: LucideIcon;
  bg?: string;
  iconClassName?: string;
}

export const diagramaContentActions: DiagramaAction[] = [
  { type: 'text', label: 'Texto', icon: FileText, bg: 'bg-gray-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'image', label: 'Imagen', icon: ImageIcon, bg: 'bg-blue-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'video', label: 'Video', icon: Video, bg: 'bg-red-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'document', label: 'Documento', icon: File, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'audio', label: 'Audio', icon: Music, bg: 'bg-green-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaLogicActions: DiagramaAction[] = [
  { type: 'intention', label: 'Decisión', icon: Brain, bg: 'bg-black', iconClassName: 'h-4 w-4 text-white' },
  { type: 'node_pause', label: 'Pausa', icon: OctagonPause, bg: 'bg-sky-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'nota', label: 'Nota', icon: StickyNote, bg: 'bg-amber-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaActions: DiagramaAction[] = [...diagramaContentActions, ...diagramaLogicActions];
