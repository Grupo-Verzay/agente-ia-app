# Inventario de la plataforma — agente.ia-app.com

Documento de negocio: qué sabe hacer la plataforma, explicado sin tecnicismos.
Sirve para vender, explicar y grabar videos.

La plataforma son dos piezas:
- **El Panel** — todo lo que el cliente ve y toca.
- **El Motor** — lo que trabaja solo por detrás (responde WhatsApp, envía
  recordatorios, cobra, vigila conexiones). El cliente nunca lo ve, pero es
  donde ocurre la magia.

Todo está separado en dos capas:
- 🟦 **CAPA CLIENTE FINAL** — el dueño de un negocio que contrata el servicio.
- 🟪 **CAPA DUEÑO / RESELLER** — quien revende la plataforma o la administra.

---

## Índice

**🟦 CAPA CLIENTE FINAL**
1. [Agente de IA (el cerebro)](#1-agente-de-ia-el-cerebro)
2. [Canales de conexión](#2-canales-de-conexión)
3. [Conversaciones (Chats)](#3-conversaciones-chats)
4. [CRM y embudo de ventas](#4-crm-y-embudo-de-ventas)
5. [Automatizaciones](#5-automatizaciones)
6. [Creador de flujos](#6-creador-de-flujos)
7. [Equipo y asesores](#7-equipo-y-asesores)
8. [Agenda y citas](#8-agenda-y-citas)
9. [Tareas y recordatorios](#9-tareas-y-recordatorios)
10. [Campañas y mensajería masiva](#10-campañas-y-mensajería-masiva)
11. [Catálogo, productos y cotizaciones](#11-catálogo-productos-y-cotizaciones)
12. [Formularios públicos](#12-formularios-públicos)
13. [Finanzas del negocio](#13-finanzas-del-negocio)
14. [Herramientas de productividad](#14-herramientas-de-productividad)
15. [Integraciones externas](#15-integraciones-externas)
16. [Modo Dueño por WhatsApp](#16-modo-dueño-por-whatsapp)
17. [Configuración de la cuenta](#17-configuración-de-la-cuenta)

**🟪 CAPA DUEÑO / RESELLER**
18. [Marca propia y landing](#18-marca-propia-y-landing)
19. [Planes y precios](#19-planes-y-precios)
20. [Clientes y licencias](#20-clientes-y-licencias)
21. [Cobros y suscripciones](#21-cobros-y-suscripciones)
22. [Créditos de IA](#22-créditos-de-ia)
23. [Programa de afiliados](#23-programa-de-afiliados)
24. [Administración de la plataforma](#24-administración-de-la-plataforma)
25. [Estadísticas del negocio](#25-estadísticas-del-negocio)

**Otros**
26. [Procesos automáticos del motor](#26-procesos-automáticos-del-motor)
27. [Dudas para Carlos](#27-dudas-para-carlos)

---

# 🟦 CAPA CLIENTE FINAL

## 1. Agente de IA (el cerebro)

Donde el cliente le enseña a su agente cómo atender. Está en **Agente IA**
(`/ia`, con una pestaña por canal).

### Sección: Entrenamiento del agente

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Datos del negocio** | Guarda nombre, rubro, ubicación, horarios, teléfono, web y notas del negocio. | El agente responde con información real y no inventa datos. | Agente IA → Negocio | Funcional |
| **Camino del cliente (embudo)** | Define paso a paso qué dice el agente: saludo, presentación, oferta, cierre. | Cada conversación sigue el mismo guion de ventas, sin depender de quién conteste. | Agente IA → Entrenamiento | Funcional |
| **Preguntas frecuentes** | Lista de preguntas y sus respuestas oficiales. | El agente responde dudas repetitivas sin que nadie intervenga. | Agente IA → Preguntas frecuentes | Funcional |
| **Productos y servicios** | Fichas de lo que vende el negocio. | El agente puede describir y ofrecer productos con precio y detalle. | Agente IA → Productos | Funcional |
| **Gestión / captura de datos** | El agente recoge datos del cliente según el caso: pedidos, reservas, citas, reclamos, solicitudes. | Los datos llegan ordenados al CRM en vez de perdidos en el chat. | Agente IA → Gestión | Funcional |
| **Información adicional (Extras)** | Texto libre con reglas o información que no cabe en las otras secciones. | Ajustes finos: políticas, promociones, cosas que no debe decir. | Agente IA → Extras | Funcional |
| **Tono y personalidad** | Define cómo habla el agente (formal, cercano, breve). | El agente suena como la marca, no como un robot genérico. | Agente IA → Negocio | Funcional |
| **Analizador de comprobantes** | Lee las fotos de comprobantes de pago que envían los clientes. | Confirma pagos sin revisar manualmente cada captura. | Agente IA → Analizador de comprobantes | Funcional |
| **Palabras clave** | Palabras que disparan una respuesta o acción concreta. | Atajos para casos puntuales sin tocar todo el entrenamiento. | Agente IA → Entrenamiento | Funcional |
| **Publicar cambios** | Guarda una versión del entrenamiento y la pone en vivo. | Se puede probar y publicar cuando esté listo, sin romper lo que ya funciona. | Agente IA → botón Publicar | Funcional |
| **Historial de versiones** | Guarda cada publicación y permite volver a una anterior. | Si un cambio empeora las respuestas, se revierte en un clic. | Agente IA → Revisiones | Funcional |
| **Simulador de chat** | Permite conversar con el agente sin usar WhatsApp real. | Probar antes de que lo vea un cliente. | Agente IA → Probar | Funcional |
| **Plantillas por rubro** | Entrenamientos ya armados por tipo de negocio. | Arrancar en minutos en vez de escribir todo desde cero. | Agente IA → Plantillas | Funcional |
| **Asistente de alta (5 pasos)** | Guía inicial que configura el agente la primera vez que entras. | El cliente nuevo no se queda mirando una pantalla en blanco. | Aparece solo al entrar | Funcional |
| **Generador de flujos con IA** | Crea un flujo automático a partir del objetivo elegido. | Ahorra armar el embudo a mano. | Agente IA → Generar flujo | Funcional |

### Sección: Objetivos del agente

Al configurar el agente se elige para qué sirve. Cada objetivo trae su propio
guion y sus propios pasos:

| Objetivo | Para qué sirve |
|---|---|
| **Venta directa** | Vender productos concretos por chat. |
| **Venta consultiva** | Entender la necesidad antes de ofrecer. |
| **Agendamiento de citas** | Llenar la agenda. |
| **Calificación de leads** | Separar los interesados de los curiosos. |
| **Atención al cliente** | Resolver dudas y reclamos. |
| **Pedidos y delivery** | Tomar pedidos con sus datos de entrega. |

### Sección: Copiloto y asistencia

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Copiloto** | Asistente de IA que ayuda dentro del panel y puede fijarse en la pantalla de chats. | Tener ayuda a mano sin salir de donde se trabaja. | `/copiloto` y dentro de Chats | Funcional |
| **Métricas del agente** | Muestra cómo está rindiendo el agente. | Saber si el entrenamiento está funcionando. | Agente IA → Métricas | Funcional |
| **Generador de imágenes** | Crea imágenes con IA. | Material visual para promociones sin diseñador. | `/ai-image` | Funcional |

---

## 2. Canales de conexión

Por dónde atiende el agente. Cada canal tiene su propio entrenamiento.

| Canal | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **WhatsApp (QR)** | Conecta el número de WhatsApp actual escaneando un código. | Es la base: se usa el número de siempre, sin trámites. | Funcional |
| **WhatsApp API** | Conexión oficial de WhatsApp Business. | Para volúmenes altos y cuentas verificadas. | Funcional (requiere habilitación) |
| **Telegram** | Atiende también por Telegram. | Cubrir clientes que usan Telegram. | Funcional (requiere habilitación) |
| **Facebook Messenger** | Atiende mensajes de la página de Facebook. | Centralizar la atención de redes. | Funcional (requiere habilitación) |
| **Instagram** | Atiende mensajes directos de Instagram. | Responder DMs sin estar pendiente. | Funcional (requiere habilitación) |
| **Llamadas (voz)** | Agente de voz que puede atender o realizar llamadas. | Contactar por teléfono sin equipo de call center. | Funcional (requiere habilitación) |

| Función | Qué hace | Dónde | Estado |
|---|---|---|---|
| **Conectar por código QR** | Vincula el WhatsApp escaneando un código. | `/qr`, `/connection` | Funcional |
| **Estado de la conexión** | Muestra si el número está conectado o caído. | `/connection` | Funcional |
| **Alerta de desconexión** | Avisa cuando el WhatsApp se desconecta. | Automático | Funcional |
| **Varias líneas (multiagente)** | Manejar más de un número/agente en la misma cuenta. | `/multiagente`, `/evo` | Funcional |

---

## 3. Conversaciones (Chats)

La bandeja de entrada unificada. Está en **Chats** (`/chats`).

| Función | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Bandeja unificada** | Todas las conversaciones de todos los canales en una pantalla. | No saltar entre apps. | Funcional |
| **Tomar el control (Agente ON/OFF)** | Apagar el agente en una conversación y responder a mano. | Intervenir cuando el caso lo amerita. | Funcional |
| **Ficha del contacto** | Datos, etiquetas, historial y notas de cada persona. | Contexto completo antes de responder. | Funcional |
| **Enviar archivos y multimedia** | Mandar fotos, audios, videos y documentos. | Enviar catálogos, comprobantes, fichas. | Funcional |
| **Visor de multimedia** | Ver y reproducir lo que envía el cliente dentro del panel. | No descargar cada archivo. | Funcional |
| **Asignar a un asesor** | Pasar la conversación a una persona del equipo. | Repartir el trabajo. | Funcional |
| **Etiquetar** | Marcar la conversación con etiquetas de color. | Clasificar y filtrar después. | Funcional |
| **Notas internas** | Comentarios que solo ve el equipo. | Dejar contexto sin que el cliente lo vea. | Funcional |
| **Respuestas rápidas** | Textos guardados que se insertan con un atajo. | Responder lo repetitivo en segundos. | Funcional (`/auto-replies`) |
| **Archivar conversación** | Saca el chat de la bandeja activa. | Mantener la bandeja limpia. | Funcional |
| **Sesiones activas** | Lista de conversaciones en curso. | Ver la carga real del momento. | Funcional (`/sessions`) |
| **Envío manual de mensaje** | Mandar un WhatsApp a un número puntual. | Contactar sin esperar que escriban. | Funcional (`/messages`) |

---

## 4. CRM y embudo de ventas

Está en **CRM** (`/crm`).

### Sección: Tablero de leads

| Función | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Tablero Kanban** | Los contactos avanzan por columnas: Caliente, Finalizado, Descartado, etc. | Ver de un vistazo en qué punto está cada venta. | Funcional |
| **Estados de lead** | Clasificación del interés de cada contacto. | Priorizar a quién atender primero. | Funcional |
| **Clasificación automática por IA** | El sistema puntúa y clasifica los leads solo. | El equipo no pierde tiempo etiquetando. | Funcional |
| **Etiquetas** | Marcas de color personalizadas por contacto. | Segmentar por interés, producto o campaña. | Funcional (`/tags`) |
| **Ficha del cliente** | Datos, historial y actividad de cada contacto. | Todo el pasado del cliente en un lugar. | Funcional |
| **Registros** | Guarda pedidos, reservas, reclamos, pagos, solicitudes y reportes que capturó el agente. | Los datos del chat se vuelven información usable. | Funcional (`/crm/registros`) |

### Sección: Reportes

| Función | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Embudo de ventas** | Muestra cuántos entran y cuántos llegan al final. | Detectar dónde se cae la venta. | Funcional |
| **Reportes del CRM** | Conversaciones, conversiones y actividad. | Decidir con datos, no con intuición. | Funcional (`/crm/reportes`) |
| **Reporte semanal automático** | Resumen que llega solo cada semana. | Enterarse sin entrar a buscar. | Funcional |
| **Registro de llamadas** | Historial de llamadas del agente de voz. | Auditar qué se habló. | Funcional (`/crm/llamadas`) |

---

## 5. Automatizaciones

Reglas del tipo "cuando pase X, haz Y". Están en **CRM → Automatizaciones**
(`/crm/rules`) y en **Macros** (`/macros`).

### Sección: Disparadores

| Disparador | Cuándo se activa |
|---|---|
| **Cambio de estado** | El lead se mueve de columna en el tablero. |
| **Etiqueta** | Se agrega o quita una etiqueta. |
| **Cita** | Se agenda, confirma o pasa una cita. |
| **Tipo de tarea** | Se crea cierta clase de tarea. |
| **Asesor** | Se asigna o cambia el responsable. |

### Sección: Acciones disponibles

| Acción | Qué hace |
|---|---|
| **Agregar etiqueta** | Marca el contacto automáticamente. |
| **Quitar etiqueta** | Le retira una marca. |
| **Crear tarea** | Genera un pendiente para el equipo. |
| **Asignar asesor** | Entrega el contacto a una persona. |
| **Notificar asesor** | Avisa al responsable. |
| **Ejecutar flujo** | Dispara una secuencia de mensajes. |
| **Enviar mensaje** | Manda un texto al cliente. |
| **Enviar archivo** | Manda un adjunto. |
| **Crear recordatorio** | Programa un aviso futuro. |
| **Cambiar estado** | Mueve el lead de etapa. |
| **Activar / desactivar IA** | Enciende o apaga el agente en ese chat. |
| **Llamar con IA (voz)** | Lanza una llamada automática. |
| **Webhook externo** | Avisa a otro sistema. |

| Función | Qué hace | Estado |
|---|---|---|
| **Macros** | Paquetes de acciones que se ejecutan juntas. | Funcional |
| **Seguimientos automáticos** | Mensajes de reenganche a quien dejó de responder. | Funcional |
| **Reparto automático de leads** | Reparte los contactos nuevos entre los asesores. | Funcional |

---

## 6. Creador de flujos

Editor visual de secuencias automáticas. Está en **Flujos** (`/workflow`).

| Función | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Lienzo visual** | Se arrastran bloques y se conectan con líneas. | Armar automatizaciones sin programar. | Funcional |
| **Disparo al iniciar conversación** | El flujo arranca cuando alguien escribe por primera vez. | Bienvenida automática. | Funcional |
| **Disparo por intención** | Arranca cuando el cliente pide algo concreto. | Responder según lo que la persona quiere. | Funcional |
| **Ejecutar desde el agente** | El agente lanza un flujo por su nombre. | Combinar conversación libre con secuencias fijas. | Funcional |

### Sección: Bloques disponibles

**Contenido:** Texto · Imagen · Video · Documento · Audio

**Acciones:** Pausar · Notificar · Intención · Guardar ficha

**Automatizaciones dentro del flujo:** Agregar etiqueta · Quitar etiqueta ·
Asignar asesor · Crear tarea · Notificar asesor · Cambiar estado ·
Activar/desactivar IA · Webhook externo · Llamar con IA (voz)

**Seguimientos:** Texto · Imagen · Video · Documento · Audio

> Nota: qué bloques puede usar cada cliente depende de su plan (se configura en
> Admin → Funciones del creador de flujos por plan).

---

## 7. Equipo y asesores

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Asesores** | Crear cuentas para el equipo. | Que varias personas atiendan sin compartir clave. | `/asesores` | Funcional |
| **Pipeline de asesores** | Ver la carga y el avance de cada uno. | Saber quién está saturado. | `/asesores` | Funcional |
| **Rendimiento del equipo** | Conversaciones activas, asignadas y cerradas por persona. | Medir desempeño real. | `/equipo` | Funcional |
| **Reasignar contacto** | Pasar un cliente de un asesor a otro. | Cubrir ausencias o rebalancear. | `/equipo`, Chats | Funcional |
| **Liberar contacto** | Quitar el responsable actual. | Devolverlo a la cola. | `/equipo` | Funcional |
| **Cuentas vinculadas** | Varias cuentas conectadas entre sí con roles. | Trabajar como agencia o multi-sucursal. | Perfil | Funcional |

---

## 8. Agenda y citas

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Agenda de citas** | Calendario de reservas del negocio. | Ver el día completo. | `/schedule` | Funcional |
| **Página pública de reservas** | Enlace donde el cliente elige día y hora solo. | Agendar sin conversar. | `/bookings/[usuario]` | Funcional |
| **Agendamiento desde el chat** | El agente agenda dentro de la conversación. | Cerrar la cita en el momento. | Automático | Funcional |
| **Recordatorios de cita** | Avisos automáticos antes de la hora. | Menos inasistencias. | Automático | Funcional |
| **Preguntas al reservar** | Datos que se piden al agendar. | Llegar preparado a la cita. | `/bookings` | Funcional |
| **Agenda por equipo/servicio** | Distintos servicios y responsables con su disponibilidad. | Negocios con varios profesionales. | `/bookings` | Funcional |
| **Estados de cita** | Confirmada, atendida, cancelada, no asistió. | Control real de la agenda. | `/schedule` | Funcional |

---

## 9. Tareas y recordatorios

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Tareas** | Pendientes con responsable y fecha. | Que no se olvide el seguimiento. | `/tareas` | Funcional |
| **Compromisos detectados** | El sistema detecta promesas hechas en el chat ("te llamo el lunes"). | Convierte palabras en pendientes reales. | `/tareas` | Funcional |
| **Recordatorios** | Avisos programados, únicos o repetidos. | Cobros, renovaciones, seguimientos. | `/reminders` | Funcional |
| **Repetición** | Diario, semanal, mensual, anual o días hábiles. | Rutinas sin volver a programarlas. | `/reminders` | Funcional |
| **Notas** | Bloc de notas con formato y archivado. | Guardar acuerdos e ideas. | `/notas` | Funcional |

---

## 10. Campañas y mensajería masiva

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Campañas** | Envío de un mensaje a muchos contactos. | Promociones y avisos masivos. | `/campaigns` | Funcional |
| **Segmentación** | Elegir a quién enviar según estado o etiqueta. | Mandar solo a quien corresponde. | `/campaigns` | Funcional |
| **Programación** | Fijar fecha y hora de envío. | Preparar con antelación. | `/campaigns` | Funcional |
| **Seguimiento del envío** | Enviadas, pendientes, vencidas. | Saber si realmente salió. | `/campaigns` | Funcional |
| **Plantillas de mensaje** | Textos reutilizables. | No reescribir lo mismo. | `/templates` | Funcional |

---

## 11. Catálogo, productos y cotizaciones

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Productos** | Fichas con precio, categoría y descripción. | Base para vender y cotizar. | `/products` | Funcional |
| **Control de cupos/stock** | Lleva unidades o cupos disponibles. | No vender lo que no hay. | `/products` | Funcional |
| **Catálogo público** | Página web del catálogo con enlace propio. | Compartir productos por un link. | `/catalogo/[usuario]` | Funcional |
| **Cotizaciones** | Documentos de propuesta con estados (borrador, confirmada, cancelada). | Formalizar la oferta. | `/cotizaciones` | Funcional |
| **Confirmar venta** | Pasa la cotización a venta. | Cerrar el ciclo comercial. | `/cotizaciones` | Funcional |

---

## 12. Formularios públicos

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Constructor de formularios** | Arma formularios con campos a medida. | Captar datos sin programar. | `/mis-formularios` | Funcional |
| **Formulario público** | Página con enlace propio para compartir. | Captar leads desde redes o web. | `/f/[enlace]` | Funcional |
| **Registros recibidos** | Lista de respuestas. | Trabajar los leads que llegan. | `/mis-formularios/.../registros` | Funcional |
| **Envío a Google Sheets** | Copia las respuestas a una hoja de cálculo. | Trabajar los datos donde ya trabajas. | Configuración del formulario | Funcional |

---

## 13. Finanzas del negocio

Módulo de finanzas del cliente (`/dashboard/finance`).

| Función | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Ventas** | Registro de ingresos. | Saber cuánto entra. | Funcional |
| **Gastos** | Registro de egresos. | Saber cuánto sale. | Funcional |
| **Cuentas** | Cuentas de dinero (caja, banco). | Saber dónde está la plata. | Funcional |
| **Clientes** | Directorio de clientes de finanzas. | Cobrar y hacer seguimiento. | Funcional |
| **Proveedores** | Directorio de proveedores. | Control de pagos a terceros. | Funcional |
| **Configuración** | Ajustes del módulo. | Adaptarlo al negocio. | Funcional |

---

## 14. Herramientas de productividad

| Función | Qué hace | Dónde | Estado |
|---|---|---|---|
| **Google Sheets** | Conecta hojas de cálculo para leer o escribir datos. | `/google-sheets`, `/tools/sheets` | Funcional |
| **Google Drive** | Acceso a archivos de Drive. | `/tools/drive` | Funcional |
| **Documentos** | Trabajo con documentos. | `/tools/docs` | Funcional |
| **Canva** | Diseño integrado. | `/canva` | Funcional |
| **Base de conocimiento** | Documentos que el agente usa para responder. | `/my-data` | Funcional |
| **Datos externos** | Importa información de otros sistemas para que el agente la consulte. | `/my-data`, `/panel/external-data` | Funcional |
| **Herramientas 1 a 5** | Cinco espacios genéricos para herramientas. | `/tools/tool-1` … `tool-5` | ⚠️ Sin identidad propia: son contenedores sin nombre de negocio definido |

---

## 15. Integraciones externas

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Apps externas** | Conectar aplicaciones propias dentro del panel. | Tener todo en una sola pantalla. | `/integraciones` | Funcional |
| **Ubicación de la app** | Mostrarla en la barra lateral o dentro del chat. | Ponerla donde se usa. | `/integraciones` | Funcional |
| **Webhooks** | Avisa a otros sistemas cuando pasa algo. | Conectar con lo que ya usa el negocio. | Automatizaciones y flujos | Funcional |

---

## 16. Modo Dueño por WhatsApp

El dueño le da órdenes al sistema por WhatsApp desde su número personal.

| Orden que puede dar | Qué hace |
|---|---|
| **Resumen del día** | Cuenta cómo va el negocio hoy. |
| **Ver conversaciones** | Lista los chats recientes. |
| **Buscar un contacto** | Encuentra a una persona. |
| **Ver leads** | Muestra los contactos por estado. |
| **Mover un lead** | Lo cambia de etapa. |
| **Etiquetar contacto** | Le pone una marca. |
| **Asignar asesor** | Le da el contacto a alguien del equipo. |
| **Enviar mensaje** | Manda un WhatsApp a un cliente. |
| **Ver citas** | Lista la agenda. |
| **Ver tareas / crear tarea** | Consulta o crea pendientes. |
| **Crear recordatorio** | Programa un aviso. |
| **Ver pagos** | Consulta los pagos registrados. |
| **Ver productos** | Lista el catálogo. |
| **Ver y editar el entrenamiento** | Consulta, agrega, edita o borra instrucciones del agente. |
| **Restaurar entrenamiento** | Vuelve a una versión anterior. |

**Estado:** Funcional. Requiere activar el modo y registrar el número del dueño.

---

## 17. Configuración de la cuenta

| Función | Qué hace | Dónde | Estado |
|---|---|---|---|
| **Perfil** | Datos de la cuenta y la empresa. | `/profile` | Funcional |
| **Proveedor de IA** | Elegir el motor de inteligencia y su clave. | `/profile` | Funcional |
| **Contactos de notificación** | A qué números avisa el sistema. | `/profile` | Funcional |
| **Zona horaria** | Ajusta horarios y recordatorios. | `/profile` | Funcional |
| **Cambio de contraseña** | Actualizar la clave. | `/profile` | Funcional |
| **Mis créditos** | Consumo de inteligencia disponible. | `/credits` | Funcional |
| **Mi plan** | Plan actual y opciones de cambio. | `/planes` | Funcional |
| **Documentación** | Guías y tutoriales de uso. | `/documentation` | Funcional |
| **Panel del cliente** | Vista simplificada para el cliente final. | `/client-panel` | Funcional |

---

# 🟪 CAPA DUEÑO / RESELLER

## 18. Marca propia y landing

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Mi landing** | Página de ventas propia con enlace propio. | Vender con marca propia. | `/panel/mi-landing` → `/r/[marca]` | Funcional |
| **Marca (logo, colores, nombre)** | Personaliza la identidad visual. | Que parezca producto propio. | `/panel/mi-landing` | Funcional |
| **Textos de la landing** | Titular, subtítulo y llamados a la acción. | Adaptar el mensaje al público. | `/panel/mi-landing` | Funcional |
| **Testimonios y estadísticas** | Bloques de prueba social. | Generar confianza. | `/panel/mi-landing` | Funcional |
| **Video de presentación** | Video en la página. | Explicar el producto. | `/panel/mi-landing` | Funcional |
| **Mostrar botón "Crear mi Agente IA"** | Muestra u oculta los botones de registro. | Vender solo con contacto directo si se prefiere. | `/panel/mi-landing` | Funcional |
| **Periodos de pago visibles** | Elegir si se muestra mensual, trimestral y/o anual. | Simplificar la oferta. | `/panel/mi-landing` | Funcional |
| **Tipos de asistencia visibles** | Mostrar planes con IA, humanos o ambos. | Ajustar el catálogo. | `/panel/mi-landing` | Funcional |
| **Landing de la plataforma** | La página principal del negocio dueño. | Marca principal. | `/panel/landing`, `/admin/landing` | Funcional |
| **Página de resellers** | Landing para captar revendedores. | Reclutar socios. | `/resellers` | Funcional |

---

## 19. Planes y precios

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Mis planes** | Crear los planes que vende el reseller. | Definir la oferta propia. | `/panel/mis-planes` | Funcional |
| **Precio por periodo** | Precio mensual, trimestral y anual. | Vender con descuento por permanencia. | `/panel/mis-planes` | Funcional |
| **Enlace de pago por plan** | Enlace de cobro de cada plan. | Cobrar sin integración compleja. | `/panel/mis-planes` | Funcional |
| **Créditos incluidos** | Cuánta IA trae cada plan. | Controlar el costo por cliente. | `/panel/mis-planes` | Funcional |
| **Lista de beneficios** | Qué incluye cada plan. | Argumentario de venta. | `/panel/mis-planes` | Funcional |
| **Planes de la plataforma** | Planes globales del negocio dueño. | Oferta principal. | `/admin/planes` | Funcional |
| **Funciones por plan** | Qué módulos y bloques ve cada plan. | Diferenciar la oferta y subir de plan. | `/admin/module`, `/panel/workflow-features` | Funcional |
| **Métodos de pago** | Formas de cobro disponibles. | Cobrar como el mercado paga. | `/admin/pagos` | Funcional |

---

## 20. Clientes y licencias

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Mis clientes** | Lista de los clientes del reseller. | Administrar la cartera. | `/panel/mis-clientes` | Funcional |
| **Crear cuentas de cliente** | Dar de alta un cliente nuevo. | Vender y entregar en el momento. | `/panel/clientes` | Funcional |
| **Cuentas de prueba (demo)** | Cuentas gratuitas con límite. | Dejar probar antes de comprar. | `/panel/mis-clientes` | Funcional |
| **Límite de demos** | Cuántas pruebas puede dar cada reseller. | Controlar el costo de las pruebas. | `/admin/reseller` | Funcional |
| **Licencias del pool** | Asigna licencias compradas a clientes. | Vender por paquetes. | `/panel/mis-clientes` | Funcional |
| **Entrar como el cliente** | Ver el panel del cliente para ayudarlo. | Dar soporte sin pedir claves. | `/panel/mis-clientes` | Funcional |
| **Enlaces de registro** | Enlaces de alta por servidor. | Repartir la carga de clientes. | `/panel/register-links` | Funcional |
| **Servidores / conexiones** | Administra los servidores de WhatsApp. | Escalar sin saturar. | `/admin/conexion` | Funcional |
| **Seguimiento de pruebas** | Mensajes automáticos a quienes están en prueba. | Convertir pruebas en ventas. | `/panel/seguimientos-prueba` | Funcional |

---

## 21. Cobros y suscripciones

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Facturación de clientes** | Estado de pago de cada cliente. | Saber quién debe. | `/panel/client-billing` | Funcional |
| **Suscripciones** | Alta, cambio y cancelación de planes. | Gestionar el ciclo de vida. | `/panel/suscripciones` | Funcional |
| **Cobro automático** | Envía avisos de vencimiento y corta el acceso si no pagan. | Cobrar sin perseguir a nadie. | Automático | Funcional |
| **Mensajes de cobro** | Personaliza los textos de aviso, vencimiento, corte y eliminación. | Cobrar con el tono de la marca. | `/panel/notificaciones` | Funcional |
| **Días de gracia** | Margen antes de cortar el servicio. | No perder clientes por un día. | Configuración de cobro | Funcional |
| **Comprobantes de pago** | Registro de pagos recibidos. | Conciliar la caja. | `/panel/client-billing` | Funcional |
| **Renovación de créditos** | Repone los créditos al renovar. | El cliente no se queda sin servicio. | Automático | Funcional |

---

## 22. Créditos de IA

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Créditos por plan** | Cuántos créditos trae cada plan. | Controlar el costo de la IA. | `/admin/credits` | Funcional |
| **Créditos por cliente** | Ajuste manual a un cliente puntual. | Premiar o corregir casos. | `/panel/credits` | Funcional |
| **Consumo** | Cuánto se ha gastado y cuánto queda. | Anticipar sobrecostos. | `/panel/credits`, `/credits` | Funcional |
| **Alertas de créditos** | Avisa cuando se están acabando. | Evitar cortes por sorpresa. | Automático | Funcional |

---

## 23. Programa de afiliados

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Panel de afiliado** | Vista propia del afiliado. | Que se gestione solo. | `/afiliados` | Funcional |
| **Enlace de referido** | Enlace único que rastrea las ventas. | Atribuir cada venta a quien la trajo. | `/afiliados` | Funcional |
| **Comisiones** | Calcula lo que se le debe a cada afiliado. | Pagar sin cuentas a mano. | `/panel/afiliados` | Funcional |
| **Aprobar / rechazar / pagar** | Gestiona el estado de cada comisión. | Control del dinero que sale. | `/panel/afiliados` | Funcional |

---

## 24. Administración de la plataforma

Solo para el dueño de la plataforma.

| Función | Qué hace | Dónde | Estado |
|---|---|---|---|
| **Todos los clientes** | Lista global de cuentas. | `/admin/clientes` | Funcional |
| **Gestión de resellers** | Alta y control de revendedores. | `/admin/reseller` | Funcional |
| **Módulos y menús** | Qué ve cada plan y en qué orden. | `/admin/module` | Funcional |
| **Plantillas globales** | Entrenamientos base para todos. | `/admin/templates` | Funcional |
| **Claves de IA** | Claves y servidores del sistema. | `/admin/conexion` | Funcional |
| **Importación de datos** | Carga masiva de información. | `/admin/external-data` | Funcional |
| **Restablecer contraseñas** | Ayuda a clientes bloqueados. | `/admin/password` | Funcional |
| **Herramientas internas** | Utilidades de administración. | `/admin/tools` | Funcional |

---

## 25. Estadísticas del negocio

| Función | Qué hace | Para qué le sirve | Dónde | Estado |
|---|---|---|---|---|
| **Nuevos clientes por mes** | Altas de los últimos 12 meses. | Ver si el negocio crece. | `/panel/analytics`, `/panel/mis-estadisticas` | Funcional |
| **Ingresos mensuales** | Facturación de los últimos 12 meses. | Medir la salud financiera. | `/panel/analytics` | Funcional |
| **Distribución por plan** | Cuántos clientes hay en cada plan. | Ver qué plan se vende. | `/panel/mis-estadisticas` | Funcional |
| **Clientes activos** | Cuentas en uso real. | Detectar abandono. | `/panel/analytics` | Funcional |

---

## 26. Procesos automáticos del motor

Trabajan solos, sin que nadie los ejecute. El cliente no los ve, pero son gran
parte del valor.

| Proceso | Qué hace | Para qué le sirve | Estado |
|---|---|---|---|
| **Motor de conversación** | Recibe cada mensaje y responde con el agente entrenado. | Es el corazón del producto. | Funcional |
| **Recordatorios** | Dispara los avisos programados. | Cero olvidos. | Funcional |
| **Seguimientos** | Reengancha a quien dejó de contestar. | Recupera ventas frías. | Funcional |
| **Seguimientos del CRM** | Persigue leads según su etapa. | Nadie se queda sin atender. | Funcional |
| **Cobros** | Avisa vencimientos y corta accesos impagos. | Ingresos sin perseguir. | Funcional |
| **Seguimiento de pruebas gratis** | Contacta a quien está probando. | Convierte pruebas en clientes. | Funcional |
| **Reporte semanal** | Envía el resumen del negocio. | Enterarse sin buscar. | Funcional |
| **Vigilancia de conexión** | Detecta WhatsApp caídos y avisa. | No estar horas desconectado sin saberlo. | Funcional |
| **Reparto de leads** | Asigna los contactos huérfanos. | Ningún lead sin dueño. | Funcional |
| **Disparadores de sesión** | Lanza flujos al iniciar conversación. | Bienvenida y guion automáticos. | Funcional |
| **Renovación de créditos** | Repone créditos al renovar el plan. | Servicio continuo. | Funcional |
| **Lectura de comprobantes** | Interpreta las fotos de pago. | Confirmar pagos sin revisar a mano. | Funcional |
| **Agente de voz** | Atiende o realiza llamadas telefónicas. | Vender y atender por teléfono. | Funcional |
| **Sincronización con Google Sheets** | Vuelca datos a hojas de cálculo. | Trabajar donde ya se trabaja. | Funcional |
| **Limpieza de historial y archivos** | Borra datos viejos automáticamente. | Mantener el sistema rápido y barato. | Funcional |
| **Antiflood** | Evita respuestas duplicadas o en avalancha. | El agente no se atropella. | Funcional |
| **Recuperación de multimedia** | Recupera archivos que no llegaron bien. | No perder lo que envía el cliente. | Funcional |

---

## 27. Dudas para Carlos

Cosas que están en el código pero no puedo traducir a beneficio de negocio sin
que tú me confirmes qué son o si siguen en uso:

1. **Herramientas 1 a 5** (`/tools/tool-1` … `tool-5`) — Existen cinco espacios
   de herramienta sin nombre ni función definida. ¿Son huecos reservados para
   herramientas futuras, o cada uno ya tiene un uso que debería documentar?

2. **Pantalla "Clientes" antigua** (`/clientes`) — **Está vacía**: solo muestra
   la palabra "decapreted" en pantalla. No hace nada. Habría que quitarla del
   menú antes de grabar cualquier video, porque si alguien entra ahí ve eso.

3. **Dos zonas de flujos** (`/flow` y `/workflow`) — La zona antigua (`/flow`)
   incluye un botón para **migrar los flujos** a la nueva. La vigente para
   vender y grabar es el creador visual (`/workflow`). ¿Confirmas que ya se
   puede dejar de mostrar la antigua?

4. **Canva** (`/canva`) — Está integrado, pero no sé qué hace exactamente el
   cliente ahí ni cómo lo vendes. ¿Diseñar piezas para campañas?

5. **"Seg-pruebas" y "Mis estadísticas"** — Ambas viven en el panel de reseller.
   ¿Las usas hoy o quedaron de una etapa anterior?

6. **Panel del cliente** (`/client-panel`) — Es una vista simplificada. ¿Para
   quién es exactamente: para el cliente del cliente, o para cuentas limitadas?

7. **Módulo de Finanzas** — Es un sistema contable bastante completo dentro de
   la plataforma. ¿Lo vendes como parte del producto o está en pruebas?

8. **Cotizaciones vs. Productos** — Se solapan un poco. ¿Cómo los diferencias
   al explicarlos?

---

*Documento generado a partir del código de los dos repositorios. Todo lo
listado existe en el código; nada fue inventado.*
