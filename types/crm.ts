/**
 * DATA DE EJEMPLO AMPLIADA PARA DEMO CRM
 * Todas las personas, empresas y números son ficticios.
 */

import { TipoRegistro } from "@prisma/client";

export type CrmSeedSession = {
    remoteJid: string;
    pushName: string;
    instanceId: string;
    status: boolean;
};

export type CrmSeedCliente = {
    sessionRemoteJid: string;
    nombre?: string | null;
    whatsapp?: string | null;
    empresa?: string | null;
    correo?: string | null;
    detalles?: string | null;
    // estado?: ClienteEstado;
};

export type CrmSeedRegistro = {
    sessionRemoteJid: string;
    tipo: TipoRegistro;
    fecha: string; // ISO string
    estado: string;
    resumen?: string | null;
    lead?: boolean | null;
    nombre?: string | null;
    detalles?: string | null;
    meta?: Record<string, any> | null;
};

export type CrmSeedData = {
    sessions: CrmSeedSession[];
    clientes: CrmSeedCliente[];
    registros: CrmSeedRegistro[];
};


// 🔹 DATA DEMO AMPLIADA
// export const demoCrmSeedData: CrmSeedData = {
//     sessions: [
//         {
//             remoteJid: "573102001100@s.whatsapp.net",
//             pushName: "Laura Martínez",
//             instanceId: "instance-demo-1",
//             status: true,
//         },
//         {
//             remoteJid: "573215556677@s.whatsapp.net",
//             pushName: "Andrés Gómez",
//             instanceId: "instance-demo-1",
//             status: true,
//         },
//         {
//             remoteJid: "573044448888@s.whatsapp.net",
//             pushName: "Tienda TechZone",
//             instanceId: "instance-demo-1",
//             status: true,
//         },
//         {
//             remoteJid: "584129991122@s.whatsapp.net",
//             pushName: "Pedro Sánchez",
//             instanceId: "instance-demo-2",
//             status: true,
//         },
//         {
//             remoteJid: "584149998877@s.whatsapp.net",
//             pushName: "Logística Express VE",
//             instanceId: "instance-demo-2",
//             status: false,
//         },
//         {
//             remoteJid: "5215512387643@s.whatsapp.net",
//             pushName: "Mariana Rodríguez",
//             instanceId: "instance-demo-3",
//             status: true,
//         },
//         {
//             remoteJid: "5491123456677@s.whatsapp.net",
//             pushName: "Juan Cruz",
//             instanceId: "instance-demo-3",
//             status: true,
//         },
//         {
//             remoteJid: "346611223344@s.whatsapp.net",
//             pushName: "Estudio Creativo BCN",
//             instanceId: "instance-demo-4",
//             status: true,
//         },
//     ],
//     clientes: [
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             nombre: "Laura Martínez",
//             whatsapp: "573102001100",
//             empresa: "Boutique Luna",
//             correo: "laura@boutiqueluna.com",
//             detalles: "Interesada en automatizar catálogo de ropa (tallas, colores, disponibilidad).",
//             estado: ClienteEstado.PROSPECTO,
//         },
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             nombre: "Andrés Gómez",
//             whatsapp: "573215556677",
//             empresa: "AndroMedia Agencia",
//             correo: "andres@andromedia.agency",
//             detalles: "Agencia de marketing que quiere centralizar leads de campañas.",
//             estado: ClienteEstado.ACTIVO,
//         },
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             nombre: "Equipo TechZone",
//             whatsapp: "573044448888",
//             empresa: "TechZone SAS",
//             correo: "soporte@techzone.com",
//             detalles: "E-commerce de tecnología que busca automatizar preguntas frecuentes.",
//             estado: ClienteEstado.ACTIVO,
//         },
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             nombre: "Pedro Sánchez",
//             whatsapp: "584129991122",
//             empresa: "Restaurante El Puerto",
//             correo: "gerencia@elpuerto.ve",
//             detalles: "Restaurante que desea manejar reservas por WhatsApp.",
//             estado: ClienteEstado.PROSPECTO,
//         },
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             nombre: "Equipo Logística Express",
//             whatsapp: "584149998877",
//             empresa: "Logística Express VE",
//             correo: "operaciones@logisticaexpress.ve",
//             detalles: "Empresa de envíos urgentes entre Colombia y Venezuela.",
//             estado: ClienteEstado.ACTIVO,
//         },
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             nombre: "Mariana Rodríguez",
//             whatsapp: "5215512387643",
//             empresa: "Academia de Idiomas Lince",
//             correo: "mariana@lince.edu.mx",
//             detalles: "Academia que quiere automatizar seguimiento de alumnos.",
//             estado: ClienteEstado.PROSPECTO,
//         },
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             nombre: "Juan Cruz",
//             whatsapp: "5491123456677",
//             empresa: "DigitalCRM AR",
//             correo: "juan@digitalcrm.com.ar",
//             detalles: "Consultor que revende servicios de automatización.",
//             estado: ClienteEstado.ACTIVO,
//         },
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             nombre: "Equipo Estudio Creativo BCN",
//             whatsapp: "346611223344",
//             empresa: "Estudio Creativo BCN",
//             correo: "hola@estudiocreativobcn.es",
//             detalles: "Estudio que quiere calificar leads de campañas en Europa.",
//             estado: ClienteEstado.PROSPECTO,
//         },
//     ],
//     registros: [
//         // 📱 Laura - Boutique Luna (CO)
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-01T09:15:00.000Z",
//             estado: "Nuevo",
//             resumen: "Solicita información sobre chatbot para catálogo de ropa.",
//             lead: true,
//             nombre: "Laura Martínez",
//             detalles: "Quiere automatizar respuestas sobre tallas, colores y disponibilidad de prendas.",
//             meta: {
//                 canal: "WhatsApp",
//                 interes: ["catálogo", "automatización"],
//                 presupuestoUSD: 80,
//             },
//         },
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-02T13:40:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporta que el bot responde lento.",
//             lead: null,
//             nombre: null,
//             detalles: "Indica que a veces las respuestas tardan más de 1 minuto.",
//             meta: {
//                 tiempoRespuestaSegundos: 65,
//                 versionBot: "v1.0",
//             },
//         },
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-05T10:00:00.000Z",
//             estado: "Pendiente de pago",
//             resumen: "Solicita plan Starter mensual.",
//             lead: null,
//             nombre: null,
//             detalles: "Plan Starter para una sola sucursal.",
//             meta: {
//                 plan: "Starter",
//                 periodicidad: "Mensual",
//                 importeUSD: 49,
//             },
//         },
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-05T15:25:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago inicial de configuración.",
//             meta: {
//                 metodo: "Tarjeta crédito",
//                 ultimos4: "2389",
//                 referencia: "ST-20251005-01",
//             },
//         },
//         {
//             sessionRemoteJid: "573102001100@s.whatsapp.net",
//             tipo: TipoRegistro.RESERVA,
//             fecha: "2025-10-06T16:00:00.000Z",
//             estado: "Agendado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Reserva de onboarding de 45 minutos.",
//             meta: {
//                 canal: "Google Meet",
//                 duracionMin: 45,
//                 asesor: "Tatiana",
//             },
//         },

//         // 📲 Andrés - AndroMedia Agencia (CO)
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-03T14:00:00.000Z",
//             estado: "Nuevo",
//             resumen: "Quiere conectar 3 números de WhatsApp.",
//             lead: true,
//             nombre: "Andrés Gómez",
//             detalles: "Busca centralizar la atención de varias marcas en un solo panel.",
//             meta: {
//                 cantidadInstancias: 3,
//                 vertical: "Agencia de marketing",
//                 origenLead: "Facebook Ads",
//             },
//         },
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-07T10:30:00.000Z",
//             estado: "Aprobado",
//             resumen: "Upgrade de plan Pro a Agencia.",
//             lead: null,
//             nombre: null,
//             detalles: "Acepta migrar a plan Agencia con más agentes simultáneos.",
//             meta: {
//                 planAnterior: "Pro",
//                 planNuevo: "Agencia",
//                 agentesIncluidos: 5,
//             },
//         },
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-07T11:15:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago por upgrade a plan Agencia.",
//             meta: {
//                 metodo: "Transferencia bancaria",
//                 banco: "Bancolombia",
//                 referencia: "BC-AG-7721",
//             },
//         },
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-09T09:50:00.000Z",
//             estado: "Pendiente",
//             resumen: "No ve chats en panel después de sincronizar Chatwoot.",
//             lead: null,
//             nombre: null,
//             detalles: "Indica que los mensajes entran pero no se muestran en la bandeja.",
//             meta: {
//                 integracion: "Chatwoot",
//                 entorno: "Producción",
//                 prioridad: "Alta",
//             },
//         },
//         {
//             sessionRemoteJid: "573215556677@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-10T18:20:00.000Z",
//             estado: "Cerrado",
//             resumen: "Webhook devuelve error 500 al probar campañas.",
//             lead: null,
//             nombre: null,
//             detalles: "Se detectó error 500 al disparar el webhook desde el CRM.",
//             meta: {
//                 endpoint: "/webhook/whatsapp",
//                 statusCode: 500,
//                 requestId: "req-abc-001",
//             },
//         },

//         // 💻 TechZone (CO) - E-commerce tecnología
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-04T08:45:00.000Z",
//             estado: "Nuevo",
//             resumen: "Solicita demo para automatizar preguntas frecuentes de laptops.",
//             lead: true,
//             nombre: "Equipo TechZone",
//             detalles: "Quiere que el bot responda sobre specs, garantía y stock.",
//             meta: {
//                 categoriaPrincipal: "Laptops",
//                 idioma: "es",
//                 canalVenta: "WhatsApp + Web",
//             },
//         },
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-08T11:05:00.000Z",
//             estado: "En proceso",
//             resumen: "Compra paquete de bot para e-commerce.",
//             lead: null,
//             nombre: null,
//             detalles: "Paquete Ecommerce Plus con flujos de carrito abandonado.",
//             meta: {
//                 plan: "Ecommerce Plus",
//                 canales: ["WhatsApp", "Instagram"],
//                 importeUSD: 120,
//             },
//         },
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-08T11:45:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago con PayPal del paquete Ecommerce Plus.",
//             meta: {
//                 metodo: "PayPal",
//                 email: "pagos@techzone.com",
//                 referencia: "PP-88231",
//             },
//         },
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-12T17:30:00.000Z",
//             estado: "En revisión",
//             resumen: "Clientes reciben mensajes duplicados al pagar.",
//             lead: null,
//             nombre: null,
//             detalles: "Indica que algunos clientes reciben doble confirmación de pago.",
//             meta: {
//                 modulo: "checkout",
//                 gateway: "MercadoPago",
//                 duplicados: 2,
//             },
//         },
//         {
//             sessionRemoteJid: "573044448888@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-15T10:10:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporta que algunos productos no se sincronizan.",
//             lead: null,
//             nombre: null,
//             detalles: "Faltan productos en el catálogo del bot respecto a la tienda.",
//             meta: {
//                 totalProductos: 560,
//                 productosSincronizados: 525,
//             },
//         },

//         // 🍽️ Pedro - Restaurante El Puerto (VE)
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-01T18:20:00.000Z",
//             estado: "Nuevo",
//             resumen: "Quiere usar bot para reservas nocturnas.",
//             lead: true,
//             nombre: "Pedro Sánchez",
//             detalles: "Solo atiende cenas y quiere automatizar reservas por franjas horarias.",
//             meta: {
//                 turnos: ["cena"],
//                 mesas: 20,
//                 ciudad: "Puerto La Cruz",
//             },
//         },
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             tipo: TipoRegistro.RESERVA,
//             fecha: "2025-10-02T19:00:00.000Z",
//             estado: "Agendado",
//             resumen: "Reserva demo de flujo de reservas.",
//             lead: null,
//             nombre: null,
//             detalles: "Demo para revisar mensajes de confirmación y recordatorios.",
//             meta: {
//                 canal: "Zoom",
//                 horaLocal: "19:00",
//                 pais: "VE",
//             },
//         },
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-06T14:10:00.000Z",
//             estado: "Confirmado",
//             resumen: "Contrata plan Restaurante con módulo reservas.",
//             lead: null,
//             nombre: null,
//             detalles: "Incluye menú digital y confirmación automática de reservas.",
//             meta: {
//                 plan: "Restaurante",
//                 importeUSD: 90,
//                 sucursales: 1,
//             },
//         },
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-06T14:40:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago inicial 50% para configuración de menú.",
//             meta: {
//                 metodo: "Zelle",
//                 referencia: "ZL-REST-2025-01",
//                 montoUSD: 45,
//             },
//         },
//         {
//             sessionRemoteJid: "584129991122@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-09T21:05:00.000Z",
//             estado: "Pendiente",
//             resumen: "Cliente no recibe confirmación de reserva.",
//             lead: null,
//             nombre: null,
//             detalles: "Un cliente reportó que no le llegó el mensaje de confirmación.",
//             meta: {
//                 tipoCliente: "Final",
//                 canal: "WhatsApp",
//             },
//         },

//         // 🚚 Logística Express VE
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-05T13:10:00.000Z",
//             estado: "Nuevo",
//             resumen: "Solicita flujo para cotizar envíos automáticos.",
//             lead: true,
//             nombre: "Equipo Logística Express",
//             detalles: "Quiere que el bot calcule tarifas según peso y destino.",
//             meta: {
//                 paisesDestino: ["CO", "VE"],
//                 pesoMaxKg: 50,
//                 canal: "WhatsApp",
//             },
//         },
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-07T09:25:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporta que el cálculo de tarifas no coincide.",
//             lead: null,
//             nombre: null,
//             detalles: "Se observa diferencia entre tabla interna y cálculo del bot.",
//             meta: {
//                 diferenciaPromedioUSD: 3.5,
//                 versionTarifas: "2025-Q4",
//             },
//         },
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-08T16:40:00.000Z",
//             estado: "En revisión",
//             resumen: "Cliente recibió monto diferente al acordado.",
//             lead: null,
//             nombre: null,
//             detalles: "El cliente asegura que la cotización enviada no coincide con el cobro.",
//             meta: {
//                 tipo: "Reclamo tarifa",
//                 prioridad: "Alta",
//             },
//         },
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-11T11:15:00.000Z",
//             estado: "Confirmado",
//             resumen: "Aprueba desarrollo de flujo avanzado de logística.",
//             lead: null,
//             nombre: null,
//             detalles: "Incluye tracking de envíos y actualización de estados.",
//             meta: {
//                 SLA: "72h",
//                 incluyeSeguimiento: true,
//             },
//         },
//         {
//             sessionRemoteJid: "584149998877@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-11T11:45:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago del desarrollo del flujo de logística.",
//             meta: {
//                 metodo: "Pago móvil",
//                 referencia: "PM-9988",
//             },
//         },

//         // 🎓 Mariana - Academia de Idiomas Lince (MX)
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-03T15:35:00.000Z",
//             estado: "Nuevo",
//             resumen: "Pide información para atención automática de alumnos.",
//             lead: true,
//             nombre: "Mariana Rodríguez",
//             detalles: "Quiere automatizar recordatorios de clases y pagos.",
//             meta: {
//                 idiomas: ["inglés", "francés"],
//                 niveles: ["A1", "A2", "B1"],
//                 alumnosActivos: 120,
//             },
//         },
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-06T12:05:00.000Z",
//             estado: "Confirmado",
//             resumen: "Contrata piloto para 30 días.",
//             lead: null,
//             nombre: null,
//             detalles: "Piloto limitado para grupos seleccionados.",
//             meta: {
//                 duracionDias: 30,
//                 estudiantesActivos: 120,
//             },
//         },
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-06T12:25:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago piloto con tarjeta.",
//             meta: {
//                 metodo: "Tarjeta débito",
//                 banco: "BBVA",
//                 referencia: "AC-PL-3021",
//             },
//         },
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-10T18:50:00.000Z",
//             estado: "Pendiente",
//             resumen: "Alumnos reportan que no les llega link de Zoom.",
//             lead: null,
//             nombre: null,
//             detalles: "Algunos alumnos no recibieron el enlace de clase grupal.",
//             meta: {
//                 cursosAfectados: 3,
//                 plataforma: "Zoom",
//             },
//         },
//         {
//             sessionRemoteJid: "5215512387643@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-13T10:10:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporte interno: quiere separar conversaciones por sede.",
//             lead: null,
//             nombre: null,
//             detalles: "Busca segmentar alumnos por sede Centro y Norte.",
//             meta: {
//                 sedes: ["Centro", "Norte"],
//                 estrategia: "multi-instancia",
//             },
//         },

//         // 🇦🇷 Juan Cruz - DigitalCRM AR
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-04T13:00:00.000Z",
//             estado: "Nuevo",
//             resumen: "Quiere centralizar mensajes de MercadoLibre y WhatsApp.",
//             lead: true,
//             nombre: "Juan Cruz",
//             detalles: "Necesita que el bot identifique pedidos y reclamos.",
//             meta: {
//                 integraciones: ["MercadoLibre", "WhatsApp"],
//                 volumenMensajesDia: 200,
//             },
//         },
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-07T09:00:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporta que no se están guardando notas internas.",
//             lead: null,
//             nombre: null,
//             detalles: "Las notas agregadas por el equipo no aparecen en el historial.",
//             meta: {
//                 modulo: "CRM-notas",
//                 prioridad: "Media",
//             },
//         },
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-09T11:35:00.000Z",
//             estado: "Confirmado",
//             resumen: "Solicita módulo adicional de reportes.",
//             lead: null,
//             nombre: null,
//             detalles: "Requiere dashboards de ventas y tiempos de respuesta.",
//             meta: {
//                 modulo: "reportes avanzados",
//                 importeUSD: 35,
//             },
//         },
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-09T11:55:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago módulo de reportes.",
//             meta: {
//                 metodo: "Stripe",
//                 referencia: "ST-REP-7788",
//             },
//         },
//         {
//             sessionRemoteJid: "5491123456677@s.whatsapp.net",
//             tipo: TipoRegistro.RECLAMO,
//             fecha: "2025-10-12T16:20:00.000Z",
//             estado: "Pendiente",
//             resumen: "No ve las etiquetas de productos en el embudo.",
//             lead: null,
//             nombre: null,
//             detalles: "Solicita que las etiquetas se reflejen en la vista de embudo.",
//             meta: {
//                 etapa: "Calificado",
//                 etiquetasEsperadas: 4,
//             },
//         },

//         // 🇪🇸 Estudio Creativo BCN
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             tipo: TipoRegistro.SOLICITUD,
//             fecha: "2025-10-01T09:05:00.000Z",
//             estado: "Nuevo",
//             resumen: "Solicita bot para calificar leads de campañas de Meta Ads.",
//             lead: true,
//             nombre: "Equipo Estudio Creativo BCN",
//             detalles: "Quiere que el bot pregunte presupuesto, tipo de proyecto y plazo.",
//             meta: {
//                 pais: "ES",
//                 volumenLeadsMes: 300,
//                 canalPrincipal: "Meta Ads",
//             },
//         },
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             tipo: TipoRegistro.RESERVA,
//             fecha: "2025-10-02T08:00:00.000Z",
//             estado: "Agendado",
//             resumen: "Reserva sesión para diseño de flujo de bienvenida.",
//             lead: null,
//             nombre: null,
//             detalles: "Sesión de descubrimiento para definir journey del lead.",
//             meta: {
//                 canal: "Google Meet",
//                 horaLocal: "10:00",
//                 idioma: "es",
//             },
//         },
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             tipo: TipoRegistro.PEDIDO,
//             fecha: "2025-10-05T10:30:00.000Z",
//             estado: "Confirmado",
//             resumen: "Confirma compra de paquete de 2 agentes.",
//             lead: null,
//             nombre: null,
//             detalles: "Un agente para soporte y otro para ventas.",
//             meta: {
//                 agentes: 2,
//                 tipo: "Soporte + Ventas",
//                 importeUSD: 160,
//             },
//         },
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             tipo: TipoRegistro.PAGO,
//             fecha: "2025-10-05T10:50:00.000Z",
//             estado: "Confirmado",
//             resumen: null,
//             lead: null,
//             nombre: null,
//             detalles: "Pago total del paquete de 2 agentes.",
//             meta: {
//                 metodo: "Transferencia SEPA",
//                 referencia: "SEPA-BCN-2025-10",
//             },
//         },
//         {
//             sessionRemoteJid: "346611223344@s.whatsapp.net",
//             tipo: TipoRegistro.REPORTE,
//             fecha: "2025-10-08T15:15:00.000Z",
//             estado: "Abierto",
//             resumen: "Reporte de mejoras: quiere más métricas en panel.",
//             lead: null,
//             nombre: null,
//             detalles: "Pide métricas de CTR, tiempo de respuesta y conversión.",
//             meta: {
//                 metricasSolicitadas: ["CTR", "Tiempo respuesta", "Conversión"],
//                 prioridad: "Baja",
//             },
//         },
//     ],
// };
