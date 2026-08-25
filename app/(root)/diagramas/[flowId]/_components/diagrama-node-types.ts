import {
  CirclePlay,
  FileText,
  Image as ImageIcon,
  Video,
  File,
  Music,
  OctagonPause,
  GitFork,
  StickyNote,
  FileSpreadsheet,
  FileSearch,
  Bell,
  ClipboardList,
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

/**
 * Nodo de arranque. No esta en el panel lateral a proposito: se crea solo,
 * uno por diagrama, al crear el diagrama (ver createFlowAction). Sirve para
 * que quien abre el lienzo vea de un vistazo por donde empieza el proceso.
 */
export const diagramaInicioAction: DiagramaAction = {
  type: 'inicio',
  label: 'Inicio',
  icon: CirclePlay,
  bg: 'bg-emerald-500',
  iconClassName: 'h-4 w-4 text-white',
};

export const diagramaContentActions: DiagramaAction[] = [
  { type: 'text', label: 'Texto', icon: FileText, bg: 'bg-gray-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'image', label: 'Imagen', icon: ImageIcon, bg: 'bg-blue-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'video', label: 'Video', icon: Video, bg: 'bg-red-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'document', label: 'Documento', icon: File, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'audio', label: 'Audio', icon: Music, bg: 'bg-green-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaLogicActions: DiagramaAction[] = [
  { type: 'intention', label: 'Decisión', icon: GitFork, bg: 'bg-black', iconClassName: 'h-4 w-4 text-white' },
  { type: 'node_pause', label: 'Pausa', icon: OctagonPause, bg: 'bg-sky-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'nota', label: 'Nota', icon: StickyNote, bg: 'bg-amber-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'sheets_write', label: 'Registrar en Sheets', icon: FileSpreadsheet, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'sheets_read', label: 'Consultar Sheets', icon: FileSearch, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'notificacion', label: 'Notificación', icon: Bell, bg: 'bg-violet-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'solicitud', label: 'Tomar solicitud', icon: ClipboardList, bg: 'bg-indigo-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaActions: DiagramaAction[] = [
  diagramaInicioAction,
  ...diagramaContentActions,
  ...diagramaLogicActions,
];
