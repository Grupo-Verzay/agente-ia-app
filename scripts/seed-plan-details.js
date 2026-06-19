// seed-plan-details.js — seeds PlanDetail for all 11 remaining plans
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const PLANS = [
  // ── LITE HUMANO ──
  {
    id: '8bb2d04b-2e95-46e4-ad1f-fead472b3609',
    heroTitle: 'Plan Lite con Asistencia Humana — Lo mejor de ambos mundos',
    heroSubtitle: 'Automatización inteligente + atención humana en horario laboral. Tus clientes nunca quedan sin respuesta, ya sea de noche con IA o de día con tu equipo.',
    heroBadge: 'IA + Humano',
    stats: [
      { value: '3,000', label: 'Créditos al mes' },
      { value: '24/7', label: 'IA siempre activa' },
      { value: 'L-V', label: 'Soporte humano' },
      { value: '1', label: 'Instancia WhatsApp' },
    ],
    featureSections: [
      {
        title: 'IA de noche, humano de día',
        description: 'El agente IA responde automáticamente fuera del horario laboral. Durante horas de oficina (lunes a viernes), tu equipo puede tomar el control de las conversaciones para brindar atención más personalizada.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Diferenciador clave',
      },
      {
        title: 'Nunca pierdas un lead',
        description: 'Cada mensaje que llega se responde, sin importar la hora. El agente captura nombre, número e intención de compra de cada prospecto y lo registra automáticamente para seguimiento.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Incluido',
      },
      {
        title: 'Fácil de comenzar, sin técnicos',
        description: 'Configura tu agente en menos de 5 minutos describiendo tu negocio. No necesitas experiencia técnica. El agente aprende de tu catálogo, preguntas frecuentes y estilo de comunicación.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Sin curva de aprendizaje',
      },
    ],
    faqs: [
      { question: '¿Qué diferencia hay entre el Plan Lite IA y el Lite Humano?', answer: 'El Plan Lite IA es 100% automatizado. El Plan Lite Humano incluye todo lo anterior más la posibilidad de que un agente humano intervenga en conversaciones durante horario laboral (lunes a viernes).' },
      { question: '¿Cuándo responde la IA y cuándo responde el humano?', answer: 'La IA responde siempre de forma inmediata, las 24 horas. Durante horario laboral, el equipo humano puede revisar conversaciones y tomar el control si la situación lo requiere.' },
      { question: '¿Los 3,000 créditos son suficientes para mi negocio?', answer: 'Sí para la mayoría de negocios pequeños. Con 3,000 créditos puedes tener aproximadamente 400-600 conversaciones completas al mes.' },
      { question: '¿Puedo ver todas las conversaciones?', answer: 'Sí. Tienes acceso a un panel donde puedes revisar todas las conversaciones, respuestas del agente e historial de leads capturados.' },
      { question: '¿Puedo cancelar en cualquier momento?', answer: 'Sí, sin penalizaciones ni contratos de permanencia. Cancelas cuando quieras desde tu panel de control.' },
    ],
    testimonials: [
      { name: 'Andrea Flores', role: 'Directora', company: 'Salón Flores', text: 'El Plan Humano es perfecto para nosotros. El bot maneja las consultas de la noche y fines de semana, y nuestro equipo atiende lo importante durante el día.', avatarUrl: '', rating: 5 },
      { name: 'Roberto Sánchez', role: 'Propietario', company: 'Ferretería RyS', text: 'Pasamos de responder 20 mensajes por día a más de 100 sin contratar personal extra. La combinación IA + humano es imbatible.', avatarUrl: '', rating: 5 },
      { name: 'Camila Torres', role: 'Gerente', company: 'Inmobiliaria Torres', text: 'Capturo leads las 24 horas y mis asesores solo intervienen cuando el cliente ya está listo para comprar. Increíble eficiencia.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Listo para combinar IA con atención humana?',
    ctaSubtitle: 'Automatiza sin perder el toque personal. Comienza hoy sin compromisos.',
    ctaButtonText: 'Comenzar con el Plan Lite Humano',
    metaTitle: 'Plan Lite Humano | Agente IA — WhatsApp con IA + Equipo',
    metaDescription: 'Automatiza tu WhatsApp con IA 24/7 y complementa con atención humana en horario laboral. Desde $29/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Lite con asistencia Humana. ¿Puedes darme más información?',
  },

  // ── BÁSICO IA ──
  {
    id: '6372a348-2971-47eb-87da-f51b43cca4bf',
    heroTitle: 'Plan Básico IA — CRM, catálogo y embudos en WhatsApp',
    heroSubtitle: 'Para negocios en crecimiento que necesitan más que respuestas automáticas. Catálogo de productos, dashboard CRM, tareas y embudos Kanban para organizar y convertir más.',
    heroBadge: 'Más popular para negocios en crecimiento',
    stats: [
      { value: '3,000', label: 'Créditos al mes' },
      { value: '10', label: 'Productos en catálogo' },
      { value: '24/7', label: 'Disponible siempre' },
      { value: 'CRM', label: 'Dashboard incluido' },
    ],
    featureSections: [
      {
        title: 'Catálogo de productos integrado',
        description: 'Publica hasta 10 productos o servicios con imágenes directamente en tu WhatsApp. El agente puede mostrarlos, explicar características y guiar al cliente hacia la compra de forma automática.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Nuevo',
      },
      {
        title: 'Embudos Kanban para gestionar leads',
        description: 'Organiza tus prospectos en etapas visuales: Nuevo, Interesado, Negociación, Cerrado. Agrega etiquetas, notas y fechas de seguimiento para no perder ninguna oportunidad.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Incluido',
      },
      {
        title: 'Dashboard con gráficos en tiempo real',
        description: 'Visualiza conversaciones activas, leads captados, tareas pendientes y rendimiento del agente desde un panel central. Toma decisiones basadas en datos, no en intuición.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Incluido',
      },
    ],
    faqs: [
      { question: '¿Qué incluye el catálogo de 10 ítems?', answer: 'Puedes agregar hasta 10 productos o servicios con nombre, descripción, precio e imagen. El agente los muestra al cliente cuando pregunta por tus productos.' },
      { question: '¿Qué son los embudos Kanban?', answer: 'Es un tablero visual donde mueves a tus prospectos por etapas: Nuevo → Interesado → En negociación → Cerrado. Ayuda a organizar tu proceso de ventas y priorizar seguimientos.' },
      { question: '¿El Plan Básico incluye todo el Plan Lite?', answer: 'Sí, el Plan Básico incluye todas las funciones del Plan Lite más catálogo, dashboard, tareas, notas y embudos Kanban.' },
      { question: '¿Puedo agregar más de 10 productos?', answer: 'Con el Plan Básico el límite es 10 ítems. Si necesitas más, el Plan Enterprise permite hasta 100 ítems con imágenes.' },
      { question: '¿Cuántos créditos consume el catálogo?', answer: 'Los créditos solo se consumen cuando la IA genera respuestas. Mostrar el catálogo cuenta como una interacción normal.' },
    ],
    testimonials: [
      { name: 'Diego Morales', role: 'Fundador', company: 'TechStore DM', text: 'Con el Plan Básico organicé todo mi proceso de ventas. El Kanban me da claridad de en qué etapa está cada cliente. Las ventas subieron un 40%.', avatarUrl: '', rating: 5 },
      { name: 'Patricia Vega', role: 'Gerente Comercial', company: 'Decoraciones PV', text: 'El catálogo con imágenes cambió todo. Los clientes ven los productos directamente en WhatsApp y el agente cierra la cita. Perfecto.', avatarUrl: '', rating: 5 },
      { name: 'Marcos López', role: 'Dueño', company: 'Ropa ML Fashion', text: 'Antes tenía los leads en papeles y WhatsApp mezclados. Ahora todo está en el dashboard. Recomiendo el Plan Básico a cualquier negocio serio.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Listo para llevar tu negocio al siguiente nivel?',
    ctaSubtitle: 'CRM, catálogo y embudos incluidos. Comienza hoy sin compromisos.',
    ctaButtonText: 'Comenzar con el Plan Básico IA',
    metaTitle: 'Plan Básico IA | Agente IA — CRM + Catálogo en WhatsApp',
    metaDescription: 'Automatiza WhatsApp con IA, catálogo de 10 productos, embudos Kanban y dashboard CRM. Desde $39/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Básico con IA. ¿Puedes contarme más?',
  },

  // ── BÁSICO HUMANO ──
  {
    id: '457da9ba-e23f-446d-890b-e80c018a1158',
    heroTitle: 'Plan Básico Humano — CRM y catálogo con el poder de tu equipo',
    heroSubtitle: 'Todo el poder del Plan Básico IA más la supervisión humana en horario laboral. Más créditos, más conversaciones y más ventas cerradas por tu equipo.',
    heroBadge: 'IA + Humano + CRM',
    stats: [
      { value: '5,000', label: 'Créditos al mes' },
      { value: '10', label: 'Productos en catálogo' },
      { value: 'L-V', label: 'Soporte humano' },
      { value: 'Kanban', label: 'Gestión de leads' },
    ],
    featureSections: [
      {
        title: 'Tu equipo y la IA trabajando juntos',
        description: 'Durante el día tu equipo recibe conversaciones calificadas por la IA. El agente filtra, captura información y prioriza prospectos para que tus asesores solo hablen con clientes listos para decidir.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Sinergia perfecta',
      },
      {
        title: 'Catálogo y respuestas rápidas',
        description: 'El catálogo de 10 ítems con imágenes combinado con respuestas rápidas predefinidas permite que tus asesores respondan a decenas de consultas en minutos, no horas.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Incluido',
      },
      {
        title: 'Dashboard compartido para tu equipo de ventas',
        description: 'Panel centralizado donde tú y tu equipo ven todas las conversaciones, leads en el Kanban, tareas asignadas y gráficos de rendimiento. Todo en un solo lugar.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Incluido',
      },
    ],
    faqs: [
      { question: '¿Por qué el Plan Humano tiene más créditos que el IA?', answer: 'El Plan Humano incluye 5,000 créditos vs 3,000 del IA porque está diseñado para negocios con mayor volumen de conversaciones donde la IA trabaja más horas.' },
      { question: '¿Cómo coordina la IA con el equipo humano?', answer: 'La IA responde automáticamente fuera de horario. En horas laborales, los asesores pueden ver y tomar conversaciones activas desde el panel.' },
      { question: '¿El Kanban es compartido entre el equipo?', answer: 'Sí, todos los usuarios con acceso pueden ver y actualizar el tablero Kanban, agregar notas y cambiar etapas de los prospectos.' },
      { question: '¿Puedo asignar conversaciones a asesores específicos?', answer: 'Con el Plan Básico puedes ver quién está atendiendo a quién. La autoasignación avanzada está disponible a partir del Plan Enterprise.' },
      { question: '¿Los créditos se acumulan si no los uso todos?', answer: 'No, los créditos se renuevan mensualmente y no se acumulan al siguiente período.' },
    ],
    testimonials: [
      { name: 'Valentina Cruz', role: 'Directora Comercial', company: 'Agencia VC', text: 'Pasamos de 2 asesoras respondiendo manualmente a tener la IA haciendo el 80% del trabajo. Las chicas solo cierran ventas ahora.', avatarUrl: '', rating: 5 },
      { name: 'Felipe Ramos', role: 'Propietario', company: 'Gimnasio FitPro', text: 'El bot captura prospectos toda la noche y nuestro equipo los llama en la mañana. El Plan Básico Humano nos triplicó las inscripciones.', avatarUrl: '', rating: 5 },
      { name: 'Lucía Navarro', role: 'Coordinadora', company: 'Academia Luna', text: 'El Kanban nos permite ver exactamente en qué etapa está cada alumno potencial. Nunca más se nos escapa un prospecto.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Quieres IA + equipo humano en un solo plan?',
    ctaSubtitle: '5,000 créditos, CRM y catálogo. Comienza hoy.',
    ctaButtonText: 'Comenzar con el Plan Básico Humano',
    metaTitle: 'Plan Básico Humano | Agente IA — IA + Equipo + CRM',
    metaDescription: 'IA 24/7 + atención humana en horario laboral. 5,000 créditos, catálogo, Kanban y dashboard. Desde $49/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Básico con Asistencia Humana. ¿Puedes contarme más?',
  },

  // ── INTERMEDIO IA ──
  {
    id: 'a73e73fa-715f-437c-aee9-6311d12b7ce1',
    heroTitle: 'Plan Intermedio IA — CRM completo y agenda automatizada',
    heroSubtitle: 'Para negocios que ya dominan lo básico y quieren más. Agenda de citas con recordatorios automáticos, CRM completo, archivos multimedia y herramientas avanzadas de automatización.',
    heroBadge: 'El más completo para negocios activos',
    stats: [
      { value: '5,000', label: 'Créditos al mes' },
      { value: 'CRM', label: 'Completo incluido' },
      { value: '24/7', label: 'Agenda automática' },
      { value: '0', label: 'Citas perdidas' },
    ],
    featureSections: [
      {
        title: 'Agenda citas con recordatorios automáticos',
        description: 'El agente puede agendar citas directamente desde WhatsApp, verificar disponibilidad y enviar recordatorios automáticos al cliente el día anterior y 2 horas antes. Sin cancelaciones por olvido.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Exclusivo Intermedio+',
      },
      {
        title: 'CRM completo con ficha de contactos',
        description: 'Cada prospecto tiene su ficha completa: historial de conversaciones, datos capturados, etapa en el embudo, notas del equipo y eventos agendados. Tu CRM siempre actualizado automáticamente.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Incluido',
      },
      {
        title: 'Envío de archivos y multimedia',
        description: 'El agente puede enviar PDFs, cotizaciones, contratos, catálogos y videos directamente en WhatsApp. Configura respuestas rápidas con archivos adjuntos para agilizar tu proceso comercial.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Incluido',
      },
    ],
    faqs: [
      { question: '¿Cómo funciona la agenda automática de citas?', answer: 'Configuras tus horarios disponibles y el agente los ofrece al cliente. Cuando el cliente elige, se crea el evento automáticamente y se envían recordatorios.' },
      { question: '¿Qué archivos puede enviar el agente?', answer: 'PDFs, imágenes, videos, audios y documentos. Configuras los archivos que el agente puede enviar según el tipo de consulta del cliente.' },
      { question: '¿El CRM reemplaza a otras herramientas?', answer: 'Es un CRM integrado optimizado para WhatsApp. Para negocios medianos es más que suficiente. Si ya usas otro CRM, podemos evaluar integración según tu caso.' },
      { question: '¿Qué son las herramientas y tools avanzadas?', answer: 'Son funciones adicionales que el agente puede ejecutar: calcular precios, verificar disponibilidad, crear eventos, actualizar datos en el CRM, todo automáticamente.' },
      { question: '¿Puedo personalizar los mensajes de recordatorio?', answer: 'Sí, los mensajes de recordatorio son completamente personalizables: texto, horario de envío y frecuencia.' },
    ],
    testimonials: [
      { name: 'Santiago Ríos', role: 'Director', company: 'Clínica SR', text: 'La agenda automática transformó nuestra clínica. Antes teníamos un 30% de ausentismo. Ahora con los recordatorios automáticos bajó al 5%. Vale cada centavo.', avatarUrl: '', rating: 5 },
      { name: 'Natalia Herrera', role: 'Coach', company: 'NHerrera Coaching', text: 'Mis clientes agendan sesiones directamente en WhatsApp y reciben recordatorios. Yo solo me enfoco en el coaching, no en la administración.', avatarUrl: '', rating: 5 },
      { name: 'Germán Pérez', role: 'Gerente', company: 'Servicios GP', text: 'El CRM integrado nos permite ver toda la relación con el cliente desde WhatsApp. El equipo ahorra 3 horas diarias que antes pasaba actualizando datos manualmente.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Listo para automatizar tu agenda y CRM?',
    ctaSubtitle: 'Citas, recordatorios, archivos y CRM completo. Sin complicaciones.',
    ctaButtonText: 'Comenzar con el Plan Intermedio IA',
    metaTitle: 'Plan Intermedio IA | Agente IA — Agenda + CRM en WhatsApp',
    metaDescription: 'Agenda citas automáticamente, envía archivos y gestiona tu CRM desde WhatsApp. 5,000 créditos desde $59/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Intermedio con IA. ¿Puedes darme más información?',
  },

  // ── INTERMEDIO HUMANO ──
  {
    id: '88ca4f9d-e0f1-41f0-a6d8-f81649e0d9d9',
    heroTitle: 'Plan Intermedio Humano — Automatización avanzada y equipo experto',
    heroSubtitle: 'La combinación perfecta: 12,000 créditos de IA + agenda automática + CRM completo + tu equipo disponible en horario laboral. Para negocios que no quieren límites.',
    heroBadge: 'IA + Humano + Agenda',
    stats: [
      { value: '12,000', label: 'Créditos al mes' },
      { value: 'CRM+', label: 'Completo incluido' },
      { value: 'L-V', label: 'Soporte humano' },
      { value: '∞', label: 'Citas agendadas' },
    ],
    featureSections: [
      {
        title: 'Alta capacidad para negocios de alto volumen',
        description: 'Con 12,000 créditos mensuales puedes manejar entre 1,500 y 2,000 conversaciones completas al mes. Ideal para clínicas, inmobiliarias, academias, centros de servicio y cualquier negocio de alto volumen.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: '12,000 créditos',
      },
      {
        title: 'Agenda + CRM + equipo humano en sintonía',
        description: 'La IA agenda citas 24/7, el CRM se actualiza automáticamente y tu equipo recibe prospectos ya calificados y listos. Flujo de trabajo perfecto sin duplicar esfuerzos.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Flujo optimizado',
      },
      {
        title: 'Archivos y multimedia para cerrar más rápido',
        description: 'Envía cotizaciones personalizadas, contratos, catálogos y videos de demostración directamente desde WhatsApp. El agente los entrega en el momento exacto en que el cliente los necesita.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Incluido',
      },
    ],
    faqs: [
      { question: '¿Por qué el Plan Intermedio Humano tiene 12,000 créditos?', answer: 'Porque está diseñado para negocios con alto volumen de conversaciones. La IA trabaja 24/7 y el equipo humano complementa en horario laboral, por lo que el consumo de créditos es mayor.' },
      { question: '¿Hay límite de citas que puede agendar el sistema?', answer: 'No hay límite. El límite es tu disponibilidad y la que configures en el sistema. El agente respeta tu agenda y no sobreagenda.' },
      { question: '¿Puede el equipo humano ver y modificar las citas?', answer: 'Sí, el equipo tiene acceso completo al calendario, puede ver, modificar, cancelar o reagendar citas y el cliente recibe notificación automática del cambio.' },
      { question: '¿El CRM registra las acciones del equipo humano también?', answer: 'Sí, tanto las acciones de la IA como las del equipo humano quedan registradas en la ficha de cada contacto.' },
      { question: '¿Puedo integrar el sistema con mi herramienta actual de agendas?', answer: 'Ofrecemos integración con Google Calendar y algunos sistemas populares. Consultanos según tu caso específico.' },
    ],
    testimonials: [
      { name: 'Isabel Mora', role: 'Directora Médica', company: 'Centro Médico IM', text: 'Gestionamos 50 citas diarias sin secretaria. La IA agenda, el sistema recuerda y nuestros médicos solo se enfocan en atender. Excelente inversión.', avatarUrl: '', rating: 5 },
      { name: 'Andrés Castro', role: 'Gerente', company: 'Inmobiliaria AC', text: 'Con 12,000 créditos tenemos capacidad de sobra. El CRM integrado nos permite hacer seguimiento sin perder ningún lead.', avatarUrl: '', rating: 5 },
      { name: 'Mónica Jiménez', role: 'Fundadora', company: 'Academia MJ', text: 'Manejamos inscripciones, cobros y seguimientos desde WhatsApp. El plan Intermedio Humano es el centro de nuestra operación comercial.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Tu negocio merece más capacidad?',
    ctaSubtitle: '12,000 créditos, CRM completo y agenda automática. Escala sin límites.',
    ctaButtonText: 'Comenzar con el Plan Intermedio Humano',
    metaTitle: 'Plan Intermedio Humano | Agente IA — 12,000 créditos + CRM',
    metaDescription: 'IA 24/7 + equipo humano + agenda automática + CRM completo. 12,000 créditos desde $99/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Intermedio con Asistencia Humana. ¿Puedes informarme?',
  },

  // ── AVANZADO IA ──
  {
    id: 'bb391a0f-606e-4f54-9523-a17d42040937',
    heroTitle: 'Plan Avanzado IA — Automatización completa con flows y retargeting',
    heroSubtitle: 'Para negocios que quieren automatización de nivel profesional. Flows de seguimiento, retargeting automático, sincronización con Google Sheets y reportes detallados de resultados.',
    heroBadge: 'Automatización profesional',
    stats: [
      { value: '8,000', label: 'Créditos al mes' },
      { value: 'Flows', label: 'Seguimientos auto' },
      { value: 'Sheets', label: 'Sincronización' },
      { value: 'CRM+', label: 'Reportes avanzados' },
    ],
    featureSections: [
      {
        title: 'Flows de seguimiento y retargeting',
        description: 'Crea flujos automáticos para reactivar clientes que no respondieron: mensajes de seguimiento a las 24h, 3 días, 7 días. El agente hace el trabajo de retargeting sin que tengas que recordarlo.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Exclusivo Avanzado+',
      },
      {
        title: 'Sincronización con Google Sheets',
        description: 'Todos los datos capturados (leads, citas, ventas, estados) se sincronizan automáticamente con tu hoja de cálculo de Google. Tus reportes siempre actualizados sin copiar y pegar.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Integración nativa',
      },
      {
        title: 'Reportes, etiquetado y follow-ups inteligentes',
        description: 'Clasifica contactos por etiquetas, genera reportes de conversiones y configura follow-ups automáticos basados en el comportamiento del cliente. Toma decisiones basadas en datos reales.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Incluido',
      },
    ],
    faqs: [
      { question: '¿Qué son los flows de seguimiento?', answer: 'Son secuencias de mensajes automatizados que se envían cuando un cliente no responde. Ejemplo: si no responde en 24h, el agente envía un recordatorio; si tampoco responde en 3 días, envía una oferta especial.' },
      { question: '¿Cómo funciona la sincronización con Google Sheets?', answer: 'Conectas tu hoja de Google Sheets una vez y el sistema exporta automáticamente datos de leads, citas, ventas y conversaciones. Siempre tendrás datos actualizados sin trabajo manual.' },
      { question: '¿El retargeting lo configuro yo o es automático?', answer: 'Ambas opciones. Tienes plantillas predefinidas de retargeting que puedes activar con un clic, o puedes personalizar los mensajes, tiempos y condiciones según tu estrategia.' },
      { question: '¿Qué tipo de reportes genera el sistema?', answer: 'Reportes de conversaciones por período, tasa de respuesta, leads captados vs convertidos, horarios de mayor actividad y rendimiento del agente. Exportables a Excel o Google Sheets.' },
      { question: '¿Los tableros Kanban del Avanzado son más completos que los del Básico?', answer: 'Sí, en el Plan Avanzado puedes crear múltiples tableros Kanban con etapas personalizadas, reglas de automatización y asignación de tareas por etapa.' },
    ],
    testimonials: [
      { name: 'Ricardo Blanco', role: 'Director de Ventas', company: 'Grupo RB', text: 'Los flows de retargeting recuperaron el 25% de los prospectos que antes dábamos por perdidos. El ROI del Plan Avanzado es increíble.', avatarUrl: '', rating: 5 },
      { name: 'Sofía Mendoza', role: 'CEO', company: 'Marketing SM', text: 'Google Sheets sincronizado con nuestro WhatsApp fue un cambio de juego. Los reportes que antes tardaban un día ahora están listos en segundos.', avatarUrl: '', rating: 5 },
      { name: 'Pablo Ortega', role: 'Gerente Comercial', company: 'Distribuidora PO', text: 'El sistema de etiquetado y follow-ups nos permite dar seguimiento a 300 leads simultáneamente sin perder la personalización. Impresionante.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Listo para automatizar tus seguimientos y reportes?',
    ctaSubtitle: 'Flows, retargeting, Sheets y reportes avanzados. El siguiente nivel.',
    ctaButtonText: 'Comenzar con el Plan Avanzado IA',
    metaTitle: 'Plan Avanzado IA | Agente IA — Flows, Retargeting y Google Sheets',
    metaDescription: 'Automatiza seguimientos, retargeting y sincroniza con Google Sheets. 8,000 créditos desde $79/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Avanzado con IA. ¿Puedes contarme más?',
  },

  // ── AVANZADO HUMANO ──
  {
    id: '8af2bc3b-7055-4ca3-9fdc-4a052ff5f80e',
    heroTitle: 'Plan Avanzado Humano — Automatización premium con tu equipo experto',
    heroSubtitle: '20,000 créditos mensuales, flows avanzados, Google Sheets y la supervisión de tu equipo. Para operaciones comerciales de alto rendimiento que no toleran errores.',
    heroBadge: 'Premium para equipos de ventas',
    stats: [
      { value: '20,000', label: 'Créditos al mes' },
      { value: 'Flows+', label: 'Retargeting auto' },
      { value: 'L-V', label: 'Equipo humano' },
      { value: 'Sheets', label: 'Sincronización live' },
    ],
    featureSections: [
      {
        title: '20,000 créditos para operaciones masivas',
        description: 'Con 20,000 créditos puedes manejar entre 2,500 y 4,000 conversaciones completas al mes. Diseñado para equipos de ventas, agencias, franquicias y empresas con múltiples canales de captación.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Alta capacidad',
      },
      {
        title: 'Flows automáticos e intervención humana estratégica',
        description: 'Los flows automáticos filtran y califican prospectos. Tu equipo humano solo interviene en las conversaciones de mayor valor, donde la atención personalizada hace la diferencia entre ganar o perder un cliente.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Estrategia de ventas',
      },
      {
        title: 'Reportes avanzados para equipos de ventas',
        description: 'Dashboard por asesor, métricas de conversión, tiempo de respuesta, seguimientos pendientes y análisis de rendimiento. Tu gerente comercial tiene visibilidad total en tiempo real.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Gestión de equipo',
      },
    ],
    faqs: [
      { question: '¿Por qué elegir el Plan Avanzado Humano sobre el IA?', answer: 'El Plan Avanzado Humano tiene 20,000 vs 8,000 créditos del IA, más la participación de tu equipo en las conversaciones de mayor valor. Ideal si manejas tickets de venta altos donde el humano cierra mejor.' },
      { question: '¿20,000 créditos es suficiente para empresas medianas?', answer: 'Para la mayoría de empresas medianas (10-50 empleados) es más que suficiente. Una empresa con 500 conversaciones/mes consume aproximadamente 3,000-5,000 créditos.' },
      { question: '¿Puedo ver el rendimiento de cada asesor en el equipo?', answer: 'Sí, incluye métricas por asesor: conversaciones atendidas, tiempo de respuesta promedio, leads convertidos y rating de satisfacción.' },
      { question: '¿El sistema puede asignar automáticamente conversaciones a asesores?', answer: 'La asignación automática avanzada está disponible en el Plan Enterprise. En el Avanzado puedes asignar manualmente o por reglas básicas.' },
      { question: '¿La sincronización con Google Sheets funciona en tiempo real?', answer: 'Sí, los datos se sincronizan automáticamente. Puedes ver nuevos leads aparecer en tu hoja de cálculo en segundos.' },
    ],
    testimonials: [
      { name: 'Carolina Ávila', role: 'Directora Comercial', company: 'Grupo CA', text: 'Gestionamos un equipo de 8 asesores desde el panel. Los flows filtran leads y el equipo solo cierra. Duplicamos ventas sin duplicar el equipo.', avatarUrl: '', rating: 5 },
      { name: 'Eduardo Fuentes', role: 'CEO', company: 'Inversiones EF', text: 'Para nosotros con tickets altos, el humano cierra el trato pero la IA califica. El Plan Avanzado Humano es exactamente lo que necesitábamos.', avatarUrl: '', rating: 5 },
      { name: 'Alejandra Vargas', role: 'Gerente', company: 'Franquicias AV', text: 'Coordinamos 5 franquicias desde un solo panel. Los reportes por sucursal y por asesor nos dan visibilidad total. Indispensable.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Tu equipo merece las mejores herramientas?',
    ctaSubtitle: '20,000 créditos, flows avanzados y equipo humano. Escala con control.',
    ctaButtonText: 'Comenzar con el Plan Avanzado Humano',
    metaTitle: 'Plan Avanzado Humano | Agente IA — 20,000 créditos + Equipo',
    metaDescription: 'IA avanzada + equipo humano + flows y retargeting. 20,000 créditos para operaciones de alto rendimiento. Desde $149/mes.',
    whatsappMessage: 'Hola! Me interesa el Plan Avanzado con Asistencia Humana. ¿Puedes informarme?',
  },

  // ── ENTERPRISE IA ──
  {
    id: 'a7a0ab02-9ff6-4422-be29-334e0c14e794',
    heroTitle: 'Plan Enterprise IA — Escala masiva con automatización total',
    heroSubtitle: 'Para empresas que necesitan el máximo poder: campañas masivas con IA, catálogo de 100 productos, analítica avanzada, multiusuarios y autoasignación. La solución definitiva.',
    heroBadge: 'Para empresas que escalan',
    stats: [
      { value: '10,000', label: 'Créditos al mes' },
      { value: '100', label: 'Productos en catálogo' },
      { value: 'Multi', label: 'Usuarios incluidos' },
      { value: 'IA', label: 'Analítica avanzada' },
    ],
    featureSections: [
      {
        title: 'Campañas masivas con bots de IA',
        description: 'Lanza campañas de mensajes masivos a toda tu base de contactos con personalización individual. El sistema usa IA para optimizar tiempos de envío, personalizar mensajes y maximizar tasas de apertura y respuesta.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Exclusivo Enterprise',
      },
      {
        title: 'Multiusuarios con autoasignación inteligente',
        description: 'Agrega múltiples agentes, supervisores y administradores. El sistema asigna conversaciones automáticamente según disponibilidad, especialidad y carga de trabajo. Escala tu equipo sin perder control.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Exclusivo Enterprise',
      },
      {
        title: 'Analítica e importación de datos avanzada',
        description: 'Importa tu base de datos existente, analiza patrones de comportamiento con IA, genera reportes predictivos y exporta insights para tu equipo directivo. Decisiones basadas en datos, no intuición.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Exclusivo Enterprise',
      },
    ],
    faqs: [
      { question: '¿Cuántos usuarios pueden usar la cuenta Enterprise?', answer: 'El Plan Enterprise permite múltiples usuarios simultáneos con permisos diferenciados (agentes, supervisores, administradores). Contacta a ventas para definir el número exacto según tu operación.' },
      { question: '¿Cómo funcionan las campañas masivas?', answer: 'Seleccionas el segmento de contactos, escribes el mensaje (o lo genera la IA), programas el envío y el sistema lo distribuye respetando las políticas de WhatsApp para evitar bloqueos.' },
      { question: '¿El catálogo de 100 ítems incluye variantes de productos?', answer: 'Sí, puedes tener variantes (tallas, colores, versiones) dentro de cada ítem del catálogo. El agente puede preguntar al cliente por las variantes y mostrar las opciones disponibles.' },
      { question: '¿La autoasignación funciona con reglas personalizadas?', answer: 'Sí, puedes configurar reglas: asignar por idioma, zona geográfica, tipo de producto, turno de trabajo o de forma rotativa (round-robin).' },
      { question: '¿Qué tipo de analítica de IA incluye?', answer: 'Análisis de sentimiento de conversaciones, predicción de probabilidad de cierre, identificación de objeciones frecuentes, horarios óptimos de contacto y reportes de tendencias de demanda.' },
    ],
    testimonials: [
      { name: 'Hernán Delgado', role: 'CEO', company: 'Corporación HD', text: 'Manejamos 3,000 conversaciones al mes con un equipo de 5 personas gracias a la autoasignación y los bots. Enterprise fue la decisión correcta.', avatarUrl: '', rating: 5 },
      { name: 'Paola Sierra', role: 'Directora Marketing', company: 'Retail PS', text: 'Las campañas masivas con personalización IA nos dan tasas de apertura del 85%. Incomparable con cualquier herramienta de email que hayamos usado.', avatarUrl: '', rating: 5 },
      { name: 'Arturo Méndez', role: 'COO', company: 'Holding AM', text: 'La analítica predictiva nos ayuda a identificar qué clientes van a comprar antes de que ellos mismos lo decidan. Diferenciación total vs la competencia.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Tu empresa está lista para escalar sin límites?',
    ctaSubtitle: 'Campañas masivas, multiusuarios y analítica IA. La solución definitiva.',
    ctaButtonText: 'Comenzar con el Plan Enterprise IA',
    metaTitle: 'Plan Enterprise IA | Agente IA — Escala Masiva en WhatsApp',
    metaDescription: 'Campañas masivas, 100 productos, multiusuarios y analítica IA. 10,000 créditos desde $99/mes para empresas.',
    whatsappMessage: 'Hola! Me interesa el Plan Enterprise con IA para mi empresa. ¿Podemos hablar?',
  },

  // ── ENTERPRISE HUMANO ──
  {
    id: '543f665a-a92a-4c5a-b14d-d2bf7c096616',
    heroTitle: 'Plan Enterprise Humano — El máximo poder para empresas de alto nivel',
    heroSubtitle: '30,000 créditos, campañas masivas, analítica IA y tu mejor equipo humano. Para empresas que compiten al más alto nivel y necesitan cada ventaja disponible.',
    heroBadge: 'La solución enterprise completa',
    stats: [
      { value: '30,000', label: 'Créditos al mes' },
      { value: '100', label: 'Productos en catálogo' },
      { value: 'L-V', label: 'Equipo dedicado' },
      { value: 'IA', label: 'Analítica predictiva' },
    ],
    featureSections: [
      {
        title: '30,000 créditos para operaciones a gran escala',
        description: 'La mayor capacidad disponible: 30,000 créditos permiten hasta 4,000-6,000 conversaciones completas al mes. Diseñado para empresas con múltiples líneas de negocio, franquicias nacionales y equipos de ventas grandes.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Máxima capacidad',
      },
      {
        title: 'IA y humanos: el stack perfecto para grandes negocios',
        description: 'La IA califica, informa y calienta leads a escala masiva. Tu equipo de expertos cierra los tratos de alto valor con el contexto completo de cada prospecto. Automatización inteligente + toque humano estratégico.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Stack ganador',
      },
      {
        title: 'Analítica e importación masiva de datos',
        description: 'Importa bases de datos de miles de contactos, segméntalas con IA y lanza campañas hiperpersonalizadas. Los reportes directivos muestran ROI por campaña, por canal y por asesor en tiempo real.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Business Intelligence',
      },
    ],
    faqs: [
      { question: '¿El Plan Enterprise Humano incluye SLA de respuesta?', answer: 'Sí, incluye acuerdos de nivel de servicio (SLA) para el soporte técnico y la atención al cliente. Tiempo de respuesta garantizado según el acuerdo contratado.' },
      { question: '¿Cuántos asesores humanos puedo tener activos?', answer: 'No hay límite en el número de asesores. Puedes tener todo tu equipo activo simultáneamente con acceso diferenciado por roles (agente, supervisor, administrador, auditor).' },
      { question: '¿Cómo gestiona el sistema grandes volúmenes de campañas?', answer: 'Las campañas masivas se distribuyen respetando los límites de WhatsApp Business API para evitar bloqueos. El sistema optimiza automáticamente los envíos en ventanas de tiempo seguras.' },
      { question: '¿Hay integración con ERPs o sistemas empresariales?', answer: 'El Plan Enterprise incluye API de integración para conectar con tus sistemas existentes (CRM, ERP, BI). El equipo técnico te acompaña en la implementación.' },
      { question: '¿Se puede hacer onboarding y capacitación del equipo?', answer: 'Sí, el Plan Enterprise incluye sesiones de capacitación para tu equipo, materiales de entrenamiento y acompañamiento en los primeros 30 días de implementación.' },
    ],
    testimonials: [
      { name: 'Claudia Ríos', role: 'VP Comercial', company: 'Corporativo CRíos', text: 'Enterprise Humano nos permite manejar 800 leads semanales con un equipo de 12 personas. Sin este sistema necesitaríamos el triple de personal.', avatarUrl: '', rating: 5 },
      { name: 'Miguel Ángel Torres', role: 'CEO', company: 'Red de Franquicias MAT', text: 'Centralizamos las ventas de 15 franquicias en un solo panel. La autoasignación regional es perfecta. El ROI se pagó en el primer mes.', avatarUrl: '', rating: 5 },
      { name: 'Daniela Fuentes', role: 'Directora General', company: 'Grupo Empresarial DF', text: 'La capacitación incluida fue excelente. En 2 semanas nuestro equipo dominó la plataforma y los resultados son notables desde el primer mes.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Tu empresa merece el mejor plan disponible?',
    ctaSubtitle: '30,000 créditos, equipo humano y analítica empresarial. Hablemos.',
    ctaButtonText: 'Solicitar Demo Enterprise',
    metaTitle: 'Plan Enterprise Humano | Agente IA — 30,000 créditos + Equipo',
    metaDescription: 'La solución enterprise completa: IA masiva + equipo humano + analítica. 30,000 créditos desde $199/mes.',
    whatsappMessage: 'Hola! Somos una empresa y nos interesa el Plan Enterprise Humano. ¿Podemos agendar una demo?',
  },

  // ── PERSONALIZADO IA ──
  {
    id: '814572ab-b684-4736-b0c2-6ac831119b30',
    heroTitle: 'Plan Personalizado — Tu marca, tu plataforma, tus reglas',
    heroSubtitle: 'Para agencias, resellers y empresas que quieren vender la plataforma con su propia marca. Licencias, white-label, dashboard de clientes y facturación a tu nombre.',
    heroBadge: 'Para resellers y agencias',
    stats: [
      { value: 'Ilim.', label: 'Licencias vendibles' },
      { value: 'White', label: 'Label completo' },
      { value: 'Tu', label: 'Propia marca' },
      { value: 'Admin', label: 'Dashboard propio' },
    ],
    featureSections: [
      {
        title: 'Vende la plataforma con tu propia marca',
        description: 'Personaliza la plataforma con tu logo, colores y nombre de marca. Tus clientes verán tu marca, no la nuestra. Tienes tu propio portal de administración para gestionar todas tus cuentas desde un solo lugar.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'White-label completo',
      },
      {
        title: 'Sin límite de cobro a tus clientes',
        description: 'Tú defines cuánto cobras a cada cliente. No hay restricciones en tus precios ni en el número de clientes que puedes tener. Tu margen es tuyo, tu negocio es tuyo.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Libertad total',
      },
      {
        title: 'Acompañamiento y capacitación incluidos',
        description: 'No te lanzamos solo. Incluye capacitación personalizada de la plataforma, materiales de ventas para presentar a tus clientes y acompañamiento en el proceso de adopción de tus primeros clientes.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Soporte completo',
      },
    ],
    faqs: [
      { question: '¿Qué significa white-label exactamente?', answer: 'Significa que la plataforma lleva tu nombre y marca. Tu logo aparece en el panel de tus clientes, en los correos del sistema y en la app. No hay mención de Agente IA ante tus clientes.' },
      { question: '¿Cuánto puedo cobrar a mis clientes?', answer: 'Lo que quieras. Tú estableces tus precios. Muchos resellers obtienen márgenes del 50-200% sobre el costo de los paquetes de licencias.' },
      { question: '¿Cómo funciona el paquete de licencias?', answer: 'Compras paquetes de licencias a precio mayorista y las vendes a tus clientes al precio que definas. Hay paquetes de 5, 10 y 25 licencias.' },
      { question: '¿Qué soporte recibo como reseller?', answer: 'Canal de soporte prioritario, materiales de ventas, capacitación inicial y revisiones periódicas con tu ejecutivo de cuenta asignado.' },
      { question: '¿Puedo tener mi propio sitio web con la plataforma?', answer: 'Sí, te proporcionamos recursos para que puedas crear tu propio sitio de ventas con información de la plataforma bajo tu marca.' },
    ],
    testimonials: [
      { name: 'Jorge Medina', role: 'CEO', company: 'Agencia Digital JM', text: 'Revendemos la plataforma a 30 clientes con nuestra marca. El margen es excelente y el soporte que recibimos como reseller es impecable.', avatarUrl: '', rating: 5 },
      { name: 'Kristina Vidal', role: 'Fundadora', company: 'KVidal Tech', text: 'El white-label nos permite ofrecer una solución premium a nuestros clientes. Ellos ven nuestra marca y nosotros manejamos todo desde el dashboard de reseller.', avatarUrl: '', rating: 5 },
      { name: 'Bernardo Lozano', role: 'Director', company: 'Consultora BL', text: 'Agregamos la plataforma a nuestro portafolio de servicios y generamos ingresos recurrentes sin desarrollar nada. La capacitación inicial fue muy completa.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Quieres construir tu propio negocio de automatización?',
    ctaSubtitle: 'Tu marca, tus clientes, tus ganancias. Conversemos sobre el modelo reseller.',
    ctaButtonText: 'Quiero ser Reseller',
    metaTitle: 'Plan Personalizado Reseller | Agente IA — White-Label WhatsApp',
    metaDescription: 'Vende automatización de WhatsApp con tu propia marca. White-label completo, dashboard de clientes y licencias flexibles.',
    whatsappMessage: 'Hola! Me interesa el Plan Personalizado para revender la plataforma con mi marca. ¿Podemos hablar?',
  },

  // ── PERSONALIZADO HUMANO ──
  {
    id: 'c6950803-f441-4457-89d7-0a2efcd9b9e3',
    heroTitle: 'Plan Personalizado Humano — Reseller con soporte de equipo dedicado',
    heroSubtitle: 'Todo el poder del Plan Personalizado más la ventaja de ofrecer a tus clientes atención humana en horario laboral. El paquete más completo para agencias y resellers ambiciosos.',
    heroBadge: 'Reseller Premium',
    stats: [
      { value: 'Ilim.', label: 'Clientes sin límite' },
      { value: 'White', label: 'Label completo' },
      { value: 'Humano', label: 'L-V para tus clientes' },
      { value: 'Admin', label: 'Dashboard propio' },
    ],
    featureSections: [
      {
        title: 'Ofrece a tus clientes IA + Humano bajo tu marca',
        description: 'Con el Plan Personalizado Humano, puedes vender a tus clientes la combinación más poderosa: IA 24/7 + atención humana en horario laboral, todo bajo tu propia marca. Diferénciate radicalmente de la competencia.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Diferenciación total',
      },
      {
        title: 'Dashboard de administración para tus clientes',
        description: 'Gestiona todas las cuentas de tus clientes desde tu panel de administrador. Ve el estado de cada cuenta, uso de créditos, conversaciones activas y renovaciones próximas. Control total de tu operación.',
        imageUrl: '', imageAlt: '', layout: 'left', badge: 'Control centralizado',
      },
      {
        title: 'Facturación y administración a tu nombre',
        description: 'Factura a tus clientes directamente a nombre de tu empresa. Define tus propios ciclos de cobro, precios y condiciones. La plataforma es tuya para operarla como prefieras.',
        imageUrl: '', imageAlt: '', layout: 'right', badge: 'Tu negocio, tus reglas',
      },
    ],
    faqs: [
      { question: '¿Cuál es la diferencia entre Personalizado IA y Personalizado Humano?', answer: 'El Plan Personalizado Humano te permite ofrecer a tus clientes el modelo IA + Humano, donde además de la automatización completa, hay soporte humano disponible en horario laboral. Es un servicio premium que puedes cobrar más caro.' },
      { question: '¿Quién provee el equipo humano para mis clientes?', answer: 'El soporte humano en horario laboral lo provee nuestra plataforma. Tú lo vendes como parte de tu servicio bajo tu marca. Tus clientes reciben atención humana sin que tú tengas que contratar personal adicional.' },
      { question: '¿Puedo tener una cuenta de administrador gratuita?', answer: 'Sí, el Plan Personalizado incluye una cuenta de administrador adicional gratuita para que puedas gestionar todas las cuentas de tus clientes desde un panel maestro.' },
      { question: '¿Hay soporte para construir mi estrategia de ventas?', answer: 'Sí, incluye sesiones de estrategia con tu ejecutivo de cuenta asignado para ayudarte a posicionar y vender el producto eficientemente en tu mercado.' },
      { question: '¿Cuántas licencias mínimas debo comprar para empezar?', answer: 'El paquete mínimo de inicio es de 5 licencias. Te recomendamos empezar con 5-10 y escalar según la demanda de tus clientes.' },
    ],
    testimonials: [
      { name: 'Mariana Espinoza', role: 'CEO', company: 'Agencia ME Digital', text: 'El modelo IA + Humano es nuestra diferenciación en el mercado. Nuestros clientes pagan el doble porque ven el valor de tener ambas cosas bajo nuestra marca.', avatarUrl: '', rating: 5 },
      { name: 'Carlos Ibarra', role: 'Fundador', company: 'Automatiza.pro', text: 'Empecé con 5 licencias hace 8 meses. Hoy tengo 40 clientes activos. La plataforma se vende sola una vez que la demuestras funcionando.', avatarUrl: '', rating: 5 },
      { name: 'Roxana Peña', role: 'Directora', company: 'DigitalPyme', text: 'La cuenta de admin gratis me permite monitorear todas mis cuentas en tiempo real. Si un cliente tiene un problema, lo veo antes de que me llame. Excelente servicio.', avatarUrl: '', rating: 5 },
    ],
    ctaTitle: '¿Listo para construir tu negocio de automatización?',
    ctaSubtitle: 'Tu marca + IA + equipo humano para tus clientes. El modelo más completo.',
    ctaButtonText: 'Quiero ser Reseller Premium',
    metaTitle: 'Plan Personalizado Humano | Agente IA — Reseller Premium White-Label',
    metaDescription: 'Vende IA + atención humana bajo tu marca. White-label completo con dashboard de clientes. El modelo reseller más completo.',
    whatsappMessage: 'Hola! Me interesa el Plan Personalizado Humano para ser Reseller. ¿Agendamos una llamada?',
  },
];

async function seedAll() {
  let ok = 0;
  for (const p of PLANS) {
    const payload = {
      heroTitle: p.heroTitle,
      heroSubtitle: p.heroSubtitle,
      heroBadge: p.heroBadge,
      heroImageUrl: null,
      videoUrl: null,
      videoTitle: null,
      videoThumbnailUrl: null,
      stats: p.stats,
      featureSections: p.featureSections,
      galleryImages: [],
      faqs: p.faqs,
      testimonials: p.testimonials,
      meetingUrl: null,
      demoUrl: null,
      whatsappMessage: p.whatsappMessage,
      ctaTitle: p.ctaTitle,
      ctaSubtitle: p.ctaSubtitle,
      ctaButtonText: p.ctaButtonText,
      ctaButtonUrl: null,
      ctaSecondaryText: null,
      ctaSecondaryUrl: null,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      ogImageUrl: null,
    };
    await db.planDetail.upsert({
      where: { subscriptionPlanId: p.id },
      create: { subscriptionPlanId: p.id, ...payload },
      update: payload,
    });
    console.log('OK ->', p.heroTitle.slice(0, 50));
    ok++;
  }
  console.log('\nTotal seeded:', ok, '/ 11');
  await db.$disconnect();
}

seedAll().catch(e => { console.error(e); process.exit(1); });
