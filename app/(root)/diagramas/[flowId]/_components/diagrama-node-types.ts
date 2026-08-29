import {
  AlarmClock,
  AlignLeft,
  Bell,
  Book,
  CalendarCheck,
  CirclePause,
  CirclePlay,
  CircleStop,
  ClipboardList,
  CreditCard,
  File,
  FileSearch,
  FileSpreadsheet,
  GitFork,
  Headset,
  History,
  Image as ImageIcon,
  Lightbulb,
  Link,
  ListChecks,
  MapPin,
  Megaphone,
  MousePointerClick,
  Music,
  ReceiptText,
  RefreshCw,
  SquareCheckBig,
  Shapes,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  User,
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
  /**
   * Palabras por las que tambien se encuentra en el buscador, ademas del
   * nombre. Sirven para los sinonimos y para los nombres viejos: quien
   * escriba "pausa" o "cobro" sigue llegando al nodo que se renombro.
   */
  keywords?: string;
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

/**
 * Los que se usan a diario, arriba del panel. El orden es el del recorrido de
 * una conversacion, no el alfabetico: es el orden en que se van necesitando
 * al armar un flujo.
 */
export const diagramaPrincipalActions: DiagramaAction[] = [
  // Idea: la nota suelta del lienzo. No es un paso del proceso -no lleva
  // nombre encima ni icono fijo-: es una caja donde se escribe directamente,
  // se estira desde su esquina y se pinta de un color. Va primera porque es
  // con la que se empieza a pensar el diagrama, antes de saber los pasos.
  { type: 'idea', label: 'Idea', icon: Lightbulb, bg: 'bg-yellow-400', iconClassName: 'h-4 w-4 text-white', keywords: 'nota post-it apunte texto libre pizarra' },
  // Libre: el unico nodo que no trae nada decidido. Icono, color, largo y lo
  // que va dentro de la caja se eligen en su modal. Ver LIBRE_ICONOS.
  { type: 'libre', label: 'Libre', icon: Shapes, bg: 'bg-zinc-700', iconClassName: 'h-4 w-4 text-white', keywords: 'personalizado a medida' },
  // Decision: el unico nodo rectangular. Sale por tres conectores, para poder
  // dibujar que pasa cuando la respuesta no es la esperada.
  { type: 'intention', label: 'Decisión', icon: GitFork, bg: 'bg-black', iconClassName: 'h-4 w-4 text-white', keywords: 'si no condicion pregunta bifurcacion' },
  { type: 'campana', label: 'Campaña', icon: Megaphone, bg: 'bg-orange-600', iconClassName: 'h-4 w-4 text-white', keywords: 'promocion masivo difusion' },
  { type: 'paso', label: 'Ejecutar Paso', icon: Stairs, bg: 'bg-rose-500', iconClassName: 'h-4 w-4 text-white', keywords: 'paso etapa generico' },
  { type: 'flujo', label: 'Ejecutar flujo', icon: Workflow, bg: 'bg-teal-600', iconClassName: 'h-4 w-4 text-white', keywords: 'lanzar automatizacion' },
  { type: 'sheets_read', label: 'Consultar datos', icon: FileSearch, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white', keywords: 'consultar sheets hoja calculo buscar google' },
  { type: 'nota', label: 'Agregar una nota', icon: Book, bg: 'bg-amber-500', iconClassName: 'h-4 w-4 text-white', keywords: 'nota interna recordar apunte' },
  { type: 'cta', label: 'Llamado a la acción', icon: MousePointerClick, bg: 'bg-orange-500', iconClassName: 'h-4 w-4 text-white', keywords: 'cta llamada boton invitar' },
  { type: 'node_pause', label: 'Esperar una respuesta', icon: CirclePause, bg: 'bg-sky-500', iconClassName: 'h-4 w-4 text-white', keywords: 'pausa esperar detener' },
  // Fin: la pareja de Inicio. Es el unico nodo sin conector de salida -nada
  // cuelga despues de un final-, igual que Inicio es el unico sin entrada.
  { type: 'fin', label: 'Finalización del proceso', icon: CircleStop, bg: 'bg-red-600', iconClassName: 'h-4 w-4 text-white', keywords: 'fin terminar cerrar final' },
];

/**
 * El resto, ordenadas por el momento de la conversacion en que aparecen:
 * primero lo que el cliente ve, despues el cierre, y al final lo que pasa por
 * detras y el cliente no ve.
 */
export const diagramaAccionActions: DiagramaAction[] = [
  { type: 'menu', label: 'Menú de opciones', icon: ListChecks, bg: 'bg-indigo-700', iconClassName: 'h-4 w-4 text-white', keywords: 'lista elegir opciones' },
  { type: 'solicitud', label: 'Tomar solicitud', icon: ClipboardList, bg: 'bg-indigo-500', iconClassName: 'h-4 w-4 text-white', keywords: 'datos formulario pedido' },
  { type: 'cotizacion', label: 'Enviar cotización', icon: ReceiptText, bg: 'bg-amber-700', iconClassName: 'h-4 w-4 text-white', keywords: 'precio presupuesto' },
  { type: 'pago', label: 'Enviar medio de pago', icon: CreditCard, bg: 'bg-rose-700', iconClassName: 'h-4 w-4 text-white', keywords: 'cobro pago pagar dinero' },
  { type: 'cita', label: 'Agendar la cita', icon: CalendarCheck, bg: 'bg-green-600', iconClassName: 'h-4 w-4 text-white', keywords: 'calendario reservar agenda' },
  { type: 'link', label: 'Enviar link acción', icon: Link, bg: 'bg-blue-700', iconClassName: 'h-4 w-4 text-white', keywords: 'enlace url' },
  { type: 'sheets_write', label: 'Registrar datos', icon: FileSpreadsheet, bg: 'bg-emerald-600', iconClassName: 'h-4 w-4 text-white', keywords: 'registrar sheets hoja calculo guardar google' },
  { type: 'notificacion', label: 'Notificar asesor', icon: Bell, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white', keywords: 'notificacion avisar alerta' },
  { type: 'escalar', label: 'Escalar a humano', icon: Headset, bg: 'bg-lime-600', iconClassName: 'h-4 w-4 text-white', keywords: 'asesor persona pasar' },
  { type: 'seguimiento', label: 'Activar seguimiento', icon: History, bg: 'bg-violet-500', iconClassName: 'h-4 w-4 text-white', keywords: 'seguimiento recordar despues insistir' },
  { type: 'automatizacion', label: 'Iniciar automatización', icon: Zap, bg: 'bg-cyan-500', iconClassName: 'h-4 w-4 text-white', keywords: 'automatizacion automatico proceso' },
];

/**
 * Tipos que ya no se ofrecen al agregar un nodo, pero que siguen definidos.
 *
 * Se sacaron del panel por poco uso, no se borraron: los diagramas que ya los
 * tienen dibujados los siguen mostrando con su icono y su color. Si se
 * quitaran de aqui, esos nodos apareceran con el icono generico.
 */
export const diagramaRetiredActions: DiagramaAction[] = [
  { type: 'text', label: 'Texto', icon: AlignLeft, bg: 'bg-gray-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'image', label: 'Imagen', icon: ImageIcon, bg: 'bg-blue-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'video', label: 'Video', icon: Video, bg: 'bg-red-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'document', label: 'Documento', icon: File, bg: 'bg-yellow-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'audio', label: 'Audio', icon: Music, bg: 'bg-green-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'llamada_ia', label: 'Llamada IA', icon: PhoneAi, bg: 'bg-fuchsia-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'devolver', label: 'Devolver paso', icon: RefreshCw, bg: 'bg-purple-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'recordatorio', label: 'Recordatorio', icon: AlarmClock, bg: 'bg-pink-500', iconClassName: 'h-4 w-4 text-white' },
  { type: 'etiqueta', label: 'Etiquetar', icon: Tag, bg: 'bg-slate-600', iconClassName: 'h-4 w-4 text-white' },
  { type: 'tarea', label: 'Crear tarea', icon: SquareCheckBig, bg: 'bg-violet-600', iconClassName: 'h-4 w-4 text-white' },
];

/**
 * Catalogo de iconos del nodo Libre.
 *
 * Es una lista corta a proposito: la gracia del nodo Libre es elegir rapido,
 * no bucear en las mil y pico de lucide. `id` es lo que se guarda en la base,
 * asi que no se renombra una vez publicado -si cambia, los nodos ya guardados
 * se quedan sin icono-.
 */
export const LIBRE_ICONOS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'mensaje', label: 'Mensaje', icon: AlignLeft },
  { id: 'imagen', label: 'Imagen', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'archivo', label: 'Archivo', icon: File },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'decision', label: 'Decisión', icon: GitFork },
  { id: 'pausa', label: 'Pausa', icon: CirclePause },
  { id: 'tabla', label: 'Hoja de cálculo', icon: FileSpreadsheet },
  { id: 'lupa', label: 'Consulta', icon: FileSearch },
  { id: 'campana', label: 'Aviso', icon: Bell },
  { id: 'lista', label: 'Lista', icon: ClipboardList },
  { id: 'telefono', label: 'Llamada', icon: Headset },
  { id: 'lugar', label: 'Ubicación', icon: MapPin },
  { id: 'agenda', label: 'Agenda', icon: CalendarCheck },
  { id: 'tarjeta', label: 'Pago', icon: CreditCard },
  { id: 'visto', label: 'Listo', icon: SquareCheckBig },
  { id: 'estrella', label: 'Destacado', icon: Star },
  { id: 'camion', label: 'Envío', icon: Truck },
  { id: 'reloj', label: 'Espera', icon: AlarmClock },
  { id: 'usuario', label: 'Persona', icon: User },
  { id: 'carrito', label: 'Compra', icon: ShoppingCart },
  { id: 'etiqueta', label: 'Etiqueta', icon: Tag },
  { id: 'link', label: 'Enlace', icon: Link },
  { id: 'flujo', label: 'Flujo', icon: Workflow },
];

/**
 * Colores del nodo Libre. Valores fijos y no clases de Tailwind: el color se
 * guarda en la base y se aplica como `style`, asi que el purgador nunca lo ve.
 */
export const LIBRE_COLORES = [
  '#6b7280', '#2563eb', '#0ea5e9', '#059669', '#22c55e', '#eab308',
  '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1', '#111827',
];

export const LIBRE_POR_DEFECTO = {
  modo: 'icono' as const,
  icono: 'mensaje',
  color: '#6b7280',
  // Porcentaje del alto de la caja: 100 = cuadrada.
  largo: 100,
  dentro: '',
};

export const LIBRE_LARGO_MIN = 100;
export const LIBRE_LARGO_MAX = 320;

/**
 * Todos los tipos que el lienzo sabe dibujar, ofrecidos o no. Es de donde
 * FlowNode saca el icono y el color de cada nodo, asi que tiene que incluir
 * tambien los retirados.
 */
export const diagramaActions: DiagramaAction[] = [
  diagramaInicioAction,
  ...diagramaPrincipalActions,
  ...diagramaAccionActions,
  ...diagramaRetiredActions,
];

/* ── Nodo Idea ─────────────────────────────────────────────── */

/**
 * Emojis de la barra del nodo Idea. Se insertan dentro del texto, donde este
 * el cursor: no son un icono aparte del nodo, son parte de lo escrito, asi
 * que se pueden poner varios o ninguno.
 */
export const IDEA_EMOJIS = ['💡', '🎯', '💰', '👥', '⏰', '⚠️', '✅', '❓', '🤖', '🧑‍💻'];

/**
 * Colores del nodo Idea: se usan de fondo, no de icono, asi que son claros a
 * proposito -el texto va encima en negro-. Valores fijos y no clases de
 * Tailwind: el color se guarda en la base y se aplica como `style`.
 */
export const IDEA_COLORES = [
  '#ffffff', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#ede9fe',
];

export const IDEA_POR_DEFECTO = {
  color: '#ffffff',
  negrita: false,
  ancho: 200,
  alto: 96,
};

export const IDEA_ANCHO_MIN = 120;
export const IDEA_ALTO_MIN = 64;
