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
      'Utiliza esta **tool** para notificar al asesor humano cuando el cliente lo solicite explícitamente, hayan (solicitudes complejas, dudas de pago o agendamiento), exista un registro guardado (solicitud/pedido/cita/pago/reclamo), o cuando el cliente envíe una **Imagen de comprobante de pago que requiere validación**. Consulta las reglas completas en [3.1] del sistema antes de ejecutar.',
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
      'Siempre consulta y ejecuta esta **tool** si existen flujos disponibles en la base de datos que correspondan a la solicitud del usuario. Si se encuentra un flujo, se ejecuta. Si no hay flujos, la IA continúa la conversación normalmente.',
    isCritical: true,
    helpText:
      'Permite al agente disparar flujos automatizados configurados en el sistema. Es crítica para el funcionamiento de la automatización.',
    sortOrder: 1,
  },
  {
    toolType: 'listar_workflows',
    defaultKey: 'listar_workflows',
    defaultDisplayName: 'Listar flujos disponibles',
    defaultDescription: 'Devuelve todos los **flujos** disponibles para este cliente.',
    isCritical: true,
    helpText:
      'Permite al agente conocer qué flujos automáticos están disponibles antes de ejecutarlos.',
    sortOrder: 2,
  },
  {
    toolType: 'buscar_producto',
    defaultKey: 'buscar_producto',
    defaultDisplayName: 'Buscar producto',
    defaultDescription:
      'Busca un producto del catálogo por nombre, categoría o SKU. Úsala cuando el cliente pregunte por un producto específico, su precio, disponibilidad o características. El resultado incluye nombre, precio, stock, categoría, descripción e imágenes del producto (campo images[]). Si el producto tiene imágenes, el sistema las enviará automáticamente al cliente.',
    isCritical: true,
    helpText:
      'Permite al agente consultar el catálogo de productos en tiempo real. Retorna nombre, precio, stock, categoría y URLs de imágenes. Las imágenes se envían vía /api/send-media.',
    sortOrder: 3,
  },
  {
    toolType: 'listar_productos',
    defaultKey: 'listar_productos',
    defaultDisplayName: 'Listar productos disponibles',
    defaultDescription:
      'Lista todos los productos activos del catálogo con nombre, precio, categoría, stock e imágenes. Úsala cuando el cliente quiera ver qué productos están disponibles o pida el catálogo completo. Cada producto incluye un campo images[] con URLs de sus imágenes, que el sistema enviará al cliente automáticamente.',
    isCritical: true,
    helpText:
      'Devuelve el catálogo completo de productos activos incluyendo imágenes. Las imágenes de cada producto se envían vía /api/send-media. Recomendado cuando tienes pocos productos.',
    sortOrder: 4,
  },
  {
    toolType: 'listar_servicios_agenda',
    defaultKey: 'listar_servicios_agenda',
    defaultDisplayName: 'Listar servicios de agenda',
    defaultDescription:
      'Lista los servicios disponibles para agendar una cita. Úsala al inicio del flujo de agendamiento, cuando el cliente quiera reservar una cita o pregunte qué servicios se pueden agendar. Retorna id y nombre de cada servicio.',
    isCritical: false,
    helpText:
      'Llama a GET /api/schedule/services?userId={userId}. Devuelve la lista de servicios configurados por el usuario para su agenda.',
    sortOrder: 5,
  },
  {
    toolType: 'consultar_slots_disponibles',
    defaultKey: 'consultar_slots_disponibles',
    defaultDisplayName: 'Consultar horarios disponibles',
    defaultDescription:
      'Consulta los horarios libres para una fecha específica. Úsala después de que el cliente haya elegido un servicio y proporcione una fecha. Requiere: fecha en formato YYYY-MM-DD. Retorna una lista de slots con startTime y endTime en UTC.',
    isCritical: false,
    helpText:
      'Llama a GET /api/schedule/slots?userId={userId}&date={YYYY-MM-DD}. Usa la disponibilidad configurada del usuario y descuenta citas ya registradas.',
    sortOrder: 6,
  },
  {
    toolType: 'crear_cita',
    defaultKey: 'crear_cita',
    defaultDisplayName: 'Crear cita',
    defaultDescription:
      'Crea una cita en la agenda del usuario. Úsala únicamente después de confirmar con el cliente: servicio, fecha y hora. Los datos del cliente (nombre y teléfono) los obtienes del contexto de la conversación. Valida disponibilidad y evita solapamientos automáticamente.',
    isCritical: false,
    helpText:
      'Llama a POST /api/schedule/appointment. Requiere: userId, serviceId, pushName, phone (remoteJid), instanceName, startTime (ISO UTC), endTime (ISO UTC), timezone.',
    sortOrder: 7,
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
    sortOrder: 8,
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
    sortOrder: 9,
  },
  {
    toolType: 'etiquetar_contacto',
    defaultKey: 'etiquetar_contacto',
    defaultDisplayName: 'Etiquetar contacto',
    defaultDescription:
      'Aplica una etiqueta al contacto tan pronto identifiques su intención o interés — no esperes al final de la conversación.\n\n**ETIQUETAS DISPONIBLES** (elige la más específica):\n- "interesado": preguntó por precios, disponibilidad o quiere más info de un producto/servicio.\n- "listo_para_comprar": pidió agendar, cotizar o tiene intención de cerrar.\n- "no_interesado": descartó explícitamente el servicio.\n- "soporte_pendiente": tiene un problema o queja activa.\n\n**REGLAS:**\n- Usa SIEMPRE una de estas etiquetas cuando se cumpla la condición, sin importar si el cliente lo dijo explícitamente o se infiere del contexto.\n- Si mencionó su sector/rubro, inclúyelo en la etiqueta: "interesado_estetica", "listo_para_comprar_restaurante", etc.\n- Usa "sin_etiqueta" SOLO si no hay ningún indicio de intención.',
    isCritical: false,
    helpText:
      'Crea y asigna etiquetas al contacto automáticamente. Si la etiqueta no existe, se crea. Útil para segmentar contactos desde la conversación.',
    sortOrder: 10,
  },
  {
    toolType: 'registrar_nota_seguimiento',
    defaultKey: 'registrar_nota_seguimiento',
    defaultDisplayName: 'Registrar nota de seguimiento',
    defaultDescription:
      'Guarda una nota de seguimiento sobre el contacto actual. Úsala para registrar información relevante de la conversación: acuerdos, compromisos, estado del cliente o cualquier detalle importante para el equipo.',
    isCritical: false,
    helpText:
      'Agrega una nota con marca de tiempo al historial de seguimientos del contacto. Las notas quedan visibles en el panel CRM para el equipo.',
    sortOrder: 11,
  },
  {
    toolType: 'crear_recordatorio',
    defaultKey: 'crear_recordatorio',
    defaultDisplayName: 'Crear recordatorio',
    defaultDescription:
      'Programa un recordatorio para hacer seguimiento a este contacto en una fecha y hora específicas. Úsala cuando el cliente pida que lo contacten más tarde o cuando sea necesario retomar la conversación.',
    isCritical: false,
    helpText:
      'Crea un recordatorio vinculado al contacto y a la instancia de WhatsApp. Se puede usar para agendar seguimientos automáticos.',
    sortOrder: 12,
  },
  {
    toolType: 'buscar_plantilla',
    defaultKey: 'buscar_plantilla',
    defaultDisplayName: 'Buscar plantilla de mensaje',
    defaultDescription:
      'Busca en el catálogo de plantillas de mensajes predefinidas por nombre, categoría o descripción. Úsala cuando necesites encontrar un texto o respuesta estándar para una situación común.',
    isCritical: false,
    helpText:
      'Permite al agente encontrar plantillas de mensajes configuradas en el sistema. Útil para mantener consistencia en las respuestas frecuentes.',
    sortOrder: 13,
  },
  {
    toolType: 'leer_google_sheets',
    defaultKey: 'leer_google_sheets',
    defaultDisplayName: 'Leer Google Sheets',
    defaultDescription:
      'Lee datos de una hoja de cálculo pública de Google Sheets. Úsala cuando el cliente pregunte por información relacionada que está en la hoja de cálculo como: precios, inventario, listas, etc. Retornar TODAS las filas coincidentes. La hoja está compartida como "Cualquiera con el enlace puede ver".\n\nEntregar la información correspondiente con el formato único establecido. NO agregues columna ni valor — devuelve todas las filas con los precios, inventario, listas, etc. disponibles tal como están en la hoja.\n\nDevuelve TODAS las filas disponibles con la información que encuentres (pueden ser entre 1 y 12 filas). Mostrar TODAS las filas devueltas sin recortar. NO limitar a 3. PROHIBIDO inventar datos.',
    isCritical: false,
    helpText:
      'El agente puede consultar cualquier Google Sheet público en tiempo real. Requiere la URL completa de la hoja. Devuelve hasta 10 filas con todos los campos. Ideal para precios, inventarios o datos que cambian frecuentemente.',
    sortOrder: 14,
  },
  {
    toolType: 'escribir_google_sheets',
    defaultKey: 'escribir_google_sheets',
    defaultDisplayName: 'Guardar en Google Sheets',
    defaultDescription:
      'Guarda datos en una hoja de cálculo de Google Sheets vía un webhook de Google Apps Script. Úsala cuando el usuario quiera registrar información (leads, solicitudes, formularios, etc.) o cuando se deba guardar datos recopilados en la conversación.',
    isCritical: false,
    helpText:
      'Requiere crear un Google Apps Script en la hoja destino y publicarlo como web app. El agente envía los datos como un objeto JSON y el script los escribe como una nueva fila. Los campos deben coincidir con los encabezados de la hoja.',
    sortOrder: 15,
  },
  {
    toolType: 'editar_google_sheets',
    defaultKey: 'editar_google_sheets',
    defaultDisplayName: 'Editar Google Sheets',
    defaultDescription:
      'Edita una fila existente en una hoja de cálculo de Google Sheets. Úsala cuando necesites actualizar datos ya registrados: cambiar estado, precio, disponibilidad u otro campo. Busca la fila por un campo clave (ej. cédula, código, correo) y actualiza los campos indicados.',
    isCritical: false,
    helpText:
      'Requiere credenciales de cuenta de servicio de Google (GOOGLE_SHEETS_CREDENTIALS). El agente busca la fila por un campo clave y actualiza las columnas especificadas. Los encabezados de la hoja deben coincidir con los campos enviados.',
    sortOrder: 16,
  },
  {
    toolType: 'scrape_web',
    defaultKey: 'scrape_web',
    defaultDisplayName: 'Consultar página web',
    defaultDescription:
      'Extrae y lee el contenido de texto de una URL pública (página web, blog, ficha de producto, etc.). Úsala cuando el cliente pida información que está en una página web específica o cuando necesites consultar datos de una fuente externa en tiempo real.',
    isCritical: false,
    helpText:
      'Permite al agente leer el contenido de cualquier página web pública: sitios HTML estáticos, páginas de precios, fichas técnicas, blogs, etc. No funciona con páginas que requieren login ni con aplicaciones de una sola página (SPA/React). Devuelve el texto limpio extraído de la página.',
    sortOrder: 15,
  },
  {
    toolType: 'consultar_inventario',
    defaultKey: 'consultar_inventario',
    defaultDisplayName: 'Consultar inventario',
    defaultDescription:
      'Consulta el stock disponible de los productos. Úsala cuando el cliente pregunte si hay existencias de un producto o cuántas unidades quedan. Puedes buscar por nombre o pedir todo el inventario.',
    isCritical: false,
    helpText:
      'Devuelve nombre, precio y stock de los productos activos. Si el stock es 0 lo indica como sin stock. Ideal para negocios con inventario propio.',
    sortOrder: 17,
  },
  {
    toolType: 'crear_cotizacion',
    defaultKey: 'crear_cotizacion',
    defaultDisplayName: 'Crear cotización',
    defaultDescription:
      'Genera una cotización formal con los productos/servicios que el cliente solicita. Úsala cuando el cliente pida un presupuesto, cotización o lista de precios para comprar. Requiere el nombre del cliente y los ítems con cantidad y precio unitario.',
    isCritical: false,
    helpText:
      'Crea un registro de cotización en la app con estado "borrador". El agente puede generarla directamente desde el chat y el equipo la verá en /cotizaciones.',
    sortOrder: 18,
  },
];
