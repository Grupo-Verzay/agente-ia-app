import type { ExternalDataBuiltinToolType } from '@/types/external-client-data';

/**
 * Catálogo de herramientas builtin del sistema.
 * Es la fuente de verdad compartida entre el frontend (UI) y las server actions.
 * Cada entrada tiene implementación real en NestJS (dispatcher en ai-agent.service.ts).
 *
 * IMPORTANTE: No agregar entradas aquí sin antes implementar el toolType
 * en el backend (buildToolFromConfig en ai-agent.service.ts).
 */
export const BUILTIN_TOOL_CATALOG: {
  toolType: ExternalDataBuiltinToolType;
  defaultKey: string;
  defaultDisplayName: string;
  defaultDescription: string;
  isCritical: boolean;
  helpText: string;
  sortOrder: number;
}[] = [
  {
    toolType: 'notificacion_asesor',
    defaultKey: 'Notificacion_Asesor',
    defaultDisplayName: 'Notificación al asesor',
    defaultDescription:
      'Utiliza esta herramienta cuando un usuario necesite la ayuda directa de un asesor humano (reclamos, solicitudes complejas, dudas de pago o agendamiento).',
    isCritical: true,
    helpText:
      'Envía una notificación interna al equipo de soporte cuando el cliente lo necesita. Recomendado tener siempre habilitada.',
    sortOrder: 0,
  },
  {
    toolType: 'ejecutar_flujos',
    defaultKey: 'Ejecutar_Flujos',
    defaultDisplayName: 'Ejecutar flujos automatizados',
    defaultDescription:
      'Siempre consulta y ejecuta si existen flujos disponibles en la base de datos que correspondan a la solicitud del usuario. Si se encuentra un flujo, se ejecuta. Si no hay flujos, la IA continúa la conversación normalmente.',
    isCritical: true,
    helpText:
      'Permite al agente disparar flujos automatizados configurados en el sistema. Es crítica para el funcionamiento de la automatización.',
    sortOrder: 1,
  },
  {
    toolType: 'listar_workflows',
    defaultKey: 'listar_workflows',
    defaultDisplayName: 'Listar flujos disponibles',
    defaultDescription: 'Devuelve todos los flujos disponibles para este usuario.',
    isCritical: false,
    helpText:
      'Permite al agente conocer qué flujos automáticos están disponibles antes de ejecutarlos.',
    sortOrder: 2,
  },
  {
    toolType: 'consultar_datos_cliente',
    defaultKey: 'consultar_datos_cliente',
    defaultDisplayName: 'Consultar datos del cliente',
    defaultDescription:
      'Consulta el perfil externo del cliente actual: cédula, correo, servicio contratado, monto, sector, convenio u otros campos configurados. Úsala cuando el cliente pregunte por su información de cuenta, servicio o datos personales registrados.',
    isCritical: false,
    helpText:
      'Busca en datos externos el registro asociado al número de WhatsApp del cliente que está escribiendo. Requiere que el cliente tenga datos cargados.',
    sortOrder: 3,
  },
  {
    toolType: 'buscar_cliente_por_dato',
    defaultKey: 'buscar_cliente_por_dato',
    defaultDisplayName: 'Buscar cliente por dato',
    defaultDescription:
      'Busca la información de un cliente a partir de un dato conocido (cédula, RIF, correo, etc.). Solo consulta datos del usuario actual, nunca información de otros clientes.',
    isCritical: false,
    helpText:
      'Permite al agente buscar por cualquier campo del registro externo. Útil cuando el cliente pregunta por datos de un tercero proporcionando su cédula u otro identificador.',
    sortOrder: 4,
  },
];
