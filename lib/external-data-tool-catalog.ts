import type { ExternalDataBuiltinToolType } from '@/types/external-client-data';

/**
 * CatÃ¡logo de herramientas builtin del sistema.
 * Es la fuente de verdad compartida entre el frontend (UI) y las server actions.
 * Cada entrada tiene implementaciÃ³n real en NestJS (dispatcher en ai-agent.service.ts).
 *
 * IMPORTANTE: No agregar entradas aquÃ­ sin antes implementar el toolType
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
    defaultDisplayName: 'NotificaciÃ³n al asesor',
    defaultDescription:
      'Utiliza esta **tool** para notificar al asesor humano cuando el cliente lo solicite explicitamente, haya una solicitud compleja o exista un registro que requiere atencion manual (solicitud/pedido/reclamo/pago). No la uses despues de crear una cita/reserva con las herramientas de agenda, porque ese flujo ya envia su confirmacion automatica.',
    isCritical: true,
    helpText:
      'EnvÃ­a una notificaciÃ³n interna al equipo de soporte cuando el cliente lo necesita. Recomendado tener siempre habilitada.',
    sortOrder: 0,
  },
  {
    toolType: 'ejecutar_flujos',
    defaultKey: 'Ejecutar_Flujos',
    defaultDisplayName: 'Ejecutar flujos automatizados',
    defaultDescription:
      'Siempre consulta y ejecuta esta **tool** si existen flujos disponibles en la base de datos que correspondan a la solicitud del usuario. Si se encuentra un flujo, se ejecuta. Si no hay flujos, la IA continÃºa la conversaciÃ³n normalmente.',
    isCritical: true,
    helpText:
      'Permite al agente disparar flujos automatizados configurados en el sistema. Es crÃ­tica para el funcionamiento de la automatizaciÃ³n.',
    sortOrder: 1,
  },
  {
    toolType: 'listar_workflows',
    defaultKey: 'listar_workflows',
    defaultDisplayName: 'Listar flujos disponibles',
    defaultDescription: 'Devuelve todos los **flujos** disponibles para este cliente.',
    isCritical: true,
    helpText:
      'Permite al agente conocer quÃ© flujos automÃ¡ticos estÃ¡n disponibles antes de ejecutarlos.',
    sortOrder: 2,
  },
  {
    toolType: 'buscar_producto',
    defaultKey: 'buscar_producto',
    defaultDisplayName: 'Buscar producto',
    defaultDescription:
      'Busca un **producto del catÃ¡logo por nombre, categorÃ­a o SKU**. Ãšsala cuando el cliente pregunte por un **producto especÃ­fico**, su precio, disponibilidad o caracterÃ­sticas. El resultado incluye nombre, precio, stock, categorÃ­a, descripciÃ³n e imÃ¡genes del producto (campo images[]). Si el producto tiene imÃ¡genes, el sistema las enviarÃ¡ automÃ¡ticamente al cliente.',
    isCritical: true,
    helpText:
      'Permite al agente consultar el catÃ¡logo de productos en tiempo real. Retorna nombre, precio, stock, categorÃ­a y URLs de imÃ¡genes. Las imÃ¡genes se envÃ­an vÃ­a /api/send-media.',
    sortOrder: 3,
  },
  {
    toolType: 'listar_productos',
    defaultKey: 'listar_productos',
    defaultDisplayName: 'Listar productos disponibles',
    defaultDescription:
      'Lista **todos los productos** activos del catÃ¡logo con nombre, precio, categorÃ­a, stock e imÃ¡genes. Ãšsala cuando el cliente quiera ver quÃ© productos estÃ¡n disponibles o pida el catÃ¡logo completo. Cada producto incluye un campo images[] con **URLs de sus imÃ¡genes**, que el sistema enviarÃ¡ al cliente automÃ¡ticamente.',
    isCritical: true,
    helpText:
      'Devuelve el catÃ¡logo completo de productos activos incluyendo imÃ¡genes. Las imÃ¡genes de cada producto se envÃ­an vÃ­a /api/send-media. Recomendado cuando tienes pocos productos.',
    sortOrder: 4,
  },
  {
    toolType: 'listar_servicios_agenda',
    defaultKey: 'listar_servicios_agenda',
    defaultDisplayName: 'Listar servicios de agenda',
    defaultDescription:
      'Lista los **servicios disponibles** para agendar una cita. Ãšsala al inicio del flujo de agendamiento, cuando el cliente **quiera reservar una cita** o pregunte quÃ© **servicios se pueden agendar**. Retorna id y nombre de cada servicio.',
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
      'Consulta los **horarios libres para una fecha especÃ­fica**. Ãšsala despuÃ©s de que el cliente haya elegido un servicio y proporcione una fecha. El cliente puede expresar la fecha de forma natural ("maÃ±ana", "el martes", "en 3 dÃ­as", "a las 10", "10 am", "5 de la tarde", "5:00 pm") â€” convierte **siempre la fecha a formato YYYY-MM-DD** y la **hora a formato HH:MM (24h)** antes de llamar esta tool. Retorna una lista de slots con startTime y endTime en UTC.',
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
      'Crea una cita en la agenda del usuario. Ãšsala Ãºnicamente despuÃ©s de confirmar con el cliente: **servicio, fecha y hora**. Los datos del cliente (nombre y telÃ©fono) los obtienes del contexto de la conversaciÃ³n. Convierte **siempre la fecha a formato YYYY-MM-DD** y la **hora a formato HH:MM (24h)** antes de llamar esta tool. **Valida disponibilidad y evita solapamientos automÃ¡ticamente**.',
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
      'Consulta **automÃ¡ticamente los datos externos del cliente actual** usando su nÃºmero de WhatsApp â€” sin necesidad de pedirle ningÃºn dato. Ãšsala siempre antes de solicitar cÃ©dula u otro identificador, cuando el cliente pregunte por **su propia informaciÃ³n:** cuenta, servicio contratado, saldo u otros campos cargados en el sistema. **Si no retorna datos, el cliente no estÃ¡ registrado en el sistema**.',
    isCritical: false,
    helpText:
      'Busca en datos externos el registro asociado al nÃºmero de WhatsApp del cliente que estÃ¡ escribiendo. Requiere que el cliente tenga datos cargados.',
    sortOrder: 8,
  },
  {
    toolType: 'buscar_cliente_por_dato',
    defaultKey: 'buscar_cliente_por_dato',
    defaultDisplayName: 'Buscar cliente por dato',
    defaultDescription:
      'Busca en los **datos externos cargados** a partir de un **campo y valor que proporciona el cliente** (ej: CEDULA, CORREO, REFERENCIA). Ãšsala cuando el cliente dÃ© un **identificador especÃ­fico** y necesites encontrar su registro. El nombre del campo debe ir **en MAYÃšSCULAS** y coincidir exactamente con el encabezado de la tabla. Si no retorna datos, el cliente no estÃ¡ registrado en el sistema.',
    isCritical: false,
    helpText:
      'Permite al agente buscar por cualquier campo del registro externo. Ãštil cuando el cliente pregunta por datos de un tercero proporcionando su cÃ©dula u otro identificador.',
    sortOrder: 9,
  },
  {
    toolType: 'etiquetar_contacto',
    defaultKey: 'etiquetar_contacto',
    defaultDisplayName: 'Etiquetar contacto',
    defaultDescription:
      'Aplica una etiqueta al contacto tan pronto identifiques su intenciÃ³n o interÃ©s â€” no esperes al final de la conversaciÃ³n.\n\n**ETIQUETAS DISPONIBLES** (elige la mÃ¡s especÃ­fica):\n- "interesado": preguntÃ³ por precios, disponibilidad o quiere mÃ¡s info de un producto/servicio.\n- "listo_para_comprar": pidiÃ³ agendar, cotizar o tiene intenciÃ³n de cerrar.\n- "no_interesado": descartÃ³ explÃ­citamente el servicio.\n- "soporte_pendiente": tiene un problema o queja activa.\n\n**REGLAS:**\n- Usa SIEMPRE una de estas etiquetas cuando se cumpla la condiciÃ³n, sin importar si el cliente lo dijo explÃ­citamente o se infiere del contexto.\n- Si mencionÃ³ su sector/rubro, inclÃºyelo en la etiqueta: "interesado_estetica", "listo_para_comprar_restaurante", etc.\n- Usa "sin_etiqueta" SOLO si no hay ningÃºn indicio de intenciÃ³n.',
    isCritical: false,
    helpText:
      'Crea y asigna etiquetas al contacto automÃ¡ticamente. Si la etiqueta no existe, se crea. Ãštil para segmentar contactos desde la conversaciÃ³n.',
    sortOrder: 10,
  },
  {
    toolType: 'registrar_nota_seguimiento',
    defaultKey: 'registrar_nota_seguimiento',
    defaultDisplayName: 'Registrar nota de seguimiento',
    defaultDescription:
      'Guarda una nota de seguimiento sobre el contacto actual. Ãšsala para registrar informaciÃ³n relevante de la conversaciÃ³n: acuerdos, compromisos, estado del cliente o cualquier detalle importante para el equipo.',
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
      'Programa un **recordatorio para hacer seguimiento** a este contacto en una **fecha y hora especÃ­ficas**. Ãšsala cuando el cliente pida que lo contacten mÃ¡s tarde o cuando sea necesario retomar la conversaciÃ³n.',
    isCritical: false,
    helpText:
      'Crea un recordatorio vinculado al contacto y a la instancia de WhatsApp. Se puede usar para agendar seguimientos automÃ¡ticos.',
    sortOrder: 12,
  },
  {
    toolType: 'buscar_plantilla',
    defaultKey: 'buscar_plantilla',
    defaultDisplayName: 'Buscar plantilla de mensaje',
    defaultDescription:
      'Busca en el **catÃ¡logo de plantillas** de **mensajes predefinidas por nombre**, categorÃ­a o descripciÃ³n. Ãšsala cuando necesites **encontrar un texto o respuesta** estÃ¡ndar para una situaciÃ³n comÃºn.',
    isCritical: false,
    helpText:
      'Permite al agente encontrar plantillas de mensajes configuradas en el sistema. Ãštil para mantener consistencia en las respuestas frecuentes.',
    sortOrder: 13,
  },
  {
    toolType: 'leer_google_sheets',
    defaultKey: 'leer_google_sheets',
    defaultDisplayName: 'Leer Google Sheets',
    defaultDescription:
      'Lee datos de una hoja de cÃ¡lculo pÃºblica de Google Sheets. Ãšsala cuando el cliente pregunte por informaciÃ³n relacionada que estÃ¡ en la hoja de cÃ¡lculo como: precios, inventario, listas, etc. Retornar TODAS las filas coincidentes. La hoja estÃ¡ compartida como "Cualquiera con el enlace puede ver".\n\nEntregar la informaciÃ³n correspondiente con el formato Ãºnico establecido. NO agregues columna ni valor â€” devuelve todas las filas con los precios, inventario, listas, etc. disponibles tal como estÃ¡n en la hoja.\n\nDevuelve TODAS las filas disponibles con la informaciÃ³n que encuentres (pueden ser entre 1 y 12 filas). Mostrar TODAS las filas devueltas sin recortar. NO limitar a 3. PROHIBIDO inventar datos.',
    isCritical: false,
    helpText:
      'El agente puede consultar cualquier Google Sheet pÃºblico en tiempo real. Requiere la URL completa de la hoja. Devuelve hasta 10 filas con todos los campos. Ideal para precios, inventarios o datos que cambian frecuentemente.',
    sortOrder: 14,
  },
  {
    toolType: 'escribir_google_sheets',
    defaultKey: 'escribir_google_sheets',
    defaultDisplayName: 'Guardar en Google Sheets',
    defaultDescription:
      'Guarda una nueva fila de datos en una hoja de Google Sheets configurada. Ãšsala cuando **necesites registrar informaciÃ³n** recopilada en la conversaciÃ³n: leads, solicitudes, pagos, formularios, etc. Los campos enviados **deben coincidir exactamente con los encabezados** de la hoja â€” no inventes columnas que no existen. El Sheet destino se toma de la configuraciÃ³n de la herramienta.',
    isCritical: false,
    helpText:
      'Requiere crear un Google Apps Script en la hoja destino y publicarlo como web app. El agente envÃ­a los datos como un objeto JSON y el script los escribe como una nueva fila. Los campos deben coincidir con los encabezados de la hoja.',
    sortOrder: 15,
  },
  {
    toolType: 'editar_google_sheets',
    defaultKey: 'editar_google_sheets',
    defaultDisplayName: 'Editar Google Sheets',
    defaultDescription:
      'Edita una **fila existente** en una hoja de cÃ¡lculo de Google Sheets. Ãšsala cuando **necesites actualizar datos** ya registrados: **cambiar estado, precio, disponibilidad u otro campo**. Busca la fila por un campo clave (ej. cÃ©dula, cÃ³digo, correo) y **actualiza los campos indicados**.',
    isCritical: false,
    helpText:
      'Requiere credenciales de cuenta de servicio de Google (GOOGLE_SHEETS_CREDENTIALS). El agente busca la fila por un campo clave y actualiza las columnas especificadas. Los encabezados de la hoja deben coincidir con los campos enviados.',
    sortOrder: 16,
  },
  {
    toolType: 'scrape_web',
    defaultKey: 'scrape_web',
    defaultDisplayName: 'Consultar pÃ¡gina web',
    defaultDescription:
      'Extrae y lee el contenido de texto de una **URL pÃºblica** (pÃ¡gina web, blog, ficha de producto, etc.). Ãšsala cuando el cliente pida informaciÃ³n que estÃ¡ en una pÃ¡gina web especÃ­fica o cuando necesites consultar datos de una fuente externa en tiempo real. **Solo si la URL es vÃ¡lida y accesible pÃºblicamente** â€” no intentes con URLs internas, privadas o que requieran login.',
    isCritical: false,
    helpText:
      'Permite al agente leer el contenido de cualquier pÃ¡gina web pÃºblica: sitios HTML estÃ¡ticos, pÃ¡ginas de precios, fichas tÃ©cnicas, blogs, etc. No funciona con pÃ¡ginas que requieren login ni con aplicaciones de una sola pÃ¡gina (SPA/React). Devuelve el texto limpio extraÃ­do de la pÃ¡gina.',
    sortOrder: 15,
  },
  {
    toolType: 'consultar_inventario',
    defaultKey: 'consultar_inventario',
    defaultDisplayName: 'Consultar inventario',
    defaultDescription:
      'Consulta el **stock disponible de los productos**. Ãšsala cuando el cliente pregunte **si hay existencias de un producto** o **cuÃ¡ntas unidades quedan**. Puedes buscar por nombre o pedir todo el inventario.',
    isCritical: false,
    helpText:
      'Devuelve nombre, precio y stock de los productos activos. Si el stock es 0 lo indica como sin stock. Ideal para negocios con inventario propio.',
    sortOrder: 17,
  },
  {
    toolType: 'client_validation',
    defaultKey: 'client_validation',
    defaultDisplayName: 'ValidaciÃ³n de cliente',
    defaultDescription:
      'Antes de responder, valida el estado del contacto: si es nuevo, si tiene servicio contratado (IA o Humano) y si estÃ¡ activo o inactivo. La IA adapta su saludo y comportamiento segÃºn esa clasificaciÃ³n.',
    isCritical: false,
    helpText:
      'Inyecta el contexto del contacto (ServiceType y ClientStatus) en el prompt del agente antes de cada respuesta. Solo activa esta herramienta si clasificas a tus contactos por tipo de servicio o estado de cliente.',
    sortOrder: 19,
  },
  {
    toolType: 'crear_cotizacion',
    defaultKey: 'crear_cotizacion',
    defaultDisplayName: 'Crear cotizaciÃ³n',
    defaultDescription:
      'Genera una **cotizaciÃ³n formal con los productos/servicios** que el cliente solicita. Ãšsala cuando el cliente pida un **presupuesto, cotizaciÃ³n o lista de precios para comprar**. Requiere el **nombre del cliente y los Ã­tems con cantidad y precio unitario**.',
    isCritical: false,
    helpText:
      'Crea un registro de cotizaciÃ³n en la app con estado "borrador". El agente puede generarla directamente desde el chat y el equipo la verÃ¡ en /cotizaciones.',
    sortOrder: 18,
  },
];
