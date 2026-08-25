import {
  AlignLeft,
  Bell,
  Book,
  CirclePause,
  CirclePlay,
  ClipboardList,
  File,
  FileSearch,
  FileSpreadsheet,
  GitFork,
  History,
  Image as ImageIcon,
  MousePointerClick,
  Music,
  Video,
  Workflow,
  Zap,
  createLucideIcon,
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
 * Dos dibujos que la libreria de iconos no trae y que si estan en el catalogo
 * aprobado: la escalera de "Paso" y el telefono con destello de "Llamada IA".
 * Se arman con el mismo constructor de la libreria para que acepten las
 * mismas propiedades (tamaño, grosor de linea, color) que todos los demas.
 */
const Stairs = createLucideIcon('Stairs', [
  ['path', { d: 'M3 20h5v-4h5v-4h5V7h3', key: 'stairs-1' }],
]);

const PhoneAi = createLucideIcon('PhoneAi', [
  [
    'path',
    {
      d: 'M7.5 4h-2A1.5 1.5 0 0 0 4 5.6C4 13 11 20 18.4 20A1.5 1.5 0 0 0 20 18.5v-2a1 1 0 0 0-.8-1l-2.6-.5a1 1 0 0 0-1 .4l-.8 1a11.5 11.5 0 0 1-4.7-4.7l1-.8a1 1 0 0 0 .4-1L11 6.8a1 1 0 0 0-1-.8Z',
      key: 'phone-ai-1',
    },
  ],
  ['path', { d: 'M17 2.5 17.6 4l1.4.6-1.4.6L17 6.6 16.4 5 15 4.4 16.4 4Z', key: 'phone-ai-2' }],
]);

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
  { type: 'text', label: 'Texto', icon: AlignLeft, bg: 'bg-gray-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'image', label: 'Imagen', icon: ImageIcon, bg: 'bg-blue-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'video', label: 'Video', icon: Video, bg: 'bg-red-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'document', label: 'Documento', icon: File, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'audio', label: 'Audio', icon: Music, bg: 'bg-green-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaLogicActions: DiagramaAction[] = [
  { type: 'node_pause', label: 'Pausa', icon: CirclePause, bg: 'bg-sky-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'nota', label: 'Nota', icon: Book, bg: 'bg-amber-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'sheets_write', label: 'Registrar en Sheets', icon: FileSpreadsheet, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'sheets_read', label: 'Consultar Sheets', icon: FileSearch, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'notificacion', label: 'Notificación', icon: Bell, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'solicitud', label: 'Tomar solicitud', icon: ClipboardList, bg: 'bg-indigo-500', iconClassName: 'h-4 w-4 text-white' },
  // Decision: el unico nodo rectangular. Sale por dos conectores, Si y No,
  // para poder dibujar que pasa cuando la respuesta no es la esperada.
  { type: 'intention', label: 'Decisión', icon: GitFork, bg: 'bg-black', iconClassName: 'h-4 w-4 text-white' },
  { type: 'flujo', label: 'Ejecutar flujo', icon: Workflow, bg: 'bg-teal-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'cta', label: 'Llamada a la acción', icon: MousePointerClick, bg: 'bg-orange-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'paso', label: 'Paso', icon: Stairs, bg: 'bg-rose-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'seguimiento', label: 'Seguimiento', icon: History, bg: 'bg-violet-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'llamada_ia', label: 'Llamada IA', icon: PhoneAi, bg: 'bg-fuchsia-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'automatizacion', label: 'Automatización', icon: Zap, bg: 'bg-cyan-500', iconClassName: 'h-4 w-4 text-white' },
];

export const diagramaActions: DiagramaAction[] = [
  diagramaInicioAction,
  ...diagramaContentActions,
  ...diagramaLogicActions,
];
