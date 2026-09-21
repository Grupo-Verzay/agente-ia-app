# Inventario de módulos y pantallas

Lo que existe hoy en la plataforma, recorrido pantalla por pantalla.
Sin propuestas ni valoraciones: solo lo que hay.

---

## Cómo se activa cada cosa

Hay **tres interruptores distintos**, y conviene no confundirlos:

| Interruptor | Dónde se toca | Qué decide |
|---|---|---|
| **Módulos** | Panel › Módulos | Qué pantallas ve una cuenta. Cada módulo tiene nombre, icono y puede llevar submódulos (pestañas). Se puede restringir por plan. |
| **Funciones de la cuenta** | Panel › Clientes › Editar cliente | Canales del agente (Llamadas, WhatsApp API, Telegram, Facebook, Instagram), funciones de IA (sintetizador, clasificación de leads, seguimientos automáticos), herramientas, créditos y plan. |
| **Permisos de persona** | Equipo › Permisos de un asesor | Cuáles de los módulos ya activos ve cada miembro del equipo. |

En las fichas de abajo:

- **Se activa por Panel › Módulos** — la pantalla solo aparece si alguien le
  crea el módulo a esa cuenta.
- **Se asigna a mano** — está disponible para crear módulo pero no viene
  montada en ninguno: hay que crearlo expresamente.
- **Siempre disponible** — no depende de módulos.

**Créditos.** Los créditos se gastan cuando el trabajo de IA lo paga la
plataforma. Si el cliente pone su propia clave de inteligencia artificial, ese
consumo lo paga él directamente y no toca la bolsa de créditos. Lo que descuenta
créditos de forma medida es: las respuestas del agente, el agente de voz en
llamadas y las transcripciones de audio (6 créditos por minuto, prorrateado).

---

# PARTE 1 — El negocio del cliente

## 1. Agente de IA

**Ruta:** `/ia` (una pestaña por canal) · **Se activa por Panel › Módulos** ·
**Consume créditos** (cada respuesta del agente)

Donde se le enseña al agente cómo atender. Hay un entrenamiento por canal:
WhatsApp es la base, y Llamadas, WhatsApp API, Telegram, Facebook e Instagram
tienen el suyo propio (cada uno se habilita por cuenta desde Panel › Clientes).

### Pantalla: Entrenamiento del agente

| Sección | Qué puede hacer el usuario |
|---|---|
| **Perfil** | Cargar nombre del negocio, sector, dirección, teléfono, sitio web, horarios de atención, redes sociales y notas extra, para que el agente no invente datos. |
| **Inicio** | Armar el guion paso a paso: saludo, presentación, oferta, cierre. Cada paso lleva su objetivo, su respuesta, la condición para avanzar y una nota interna que el agente obedece pero nunca dice al cliente. |
| **Preguntas** | Cargar preguntas frecuentes con su respuesta oficial. |
| **Productos** | Cargar fichas de lo que vende, con descripción y precio, para que el agente las ofrezca. |
| **Gestión** | Definir qué datos recoge el agente en cada caso (pedido, reserva, cita, reclamo) y qué hace después: notificar a un asesor, guardar la ficha, ejecutar un flujo. |
| **Palabras clave** | Escribir palabras que, si las dice el cliente, interceptan la conversación antes de que responda la IA (por coincidencia exacta o parcial). |
| **Extras** | Añadir contexto suelto, políticas, aclaraciones de tono o restricciones. |

Además, en esta misma pantalla:

- **Probar el agente** en un simulador de conversación sin gastar una línea real.
- **Pedirle ayuda a la IA** para mejorar el entrenamiento: crear un saludo,
  redactar preguntas frecuentes, detectar contradicciones, ver qué datos clave
  faltan, sugerir variaciones, optimizar el catálogo o evaluar el tono.
- **Aplicar una plantilla de negocio** ya armada: venta directa, venta
  consultiva, agendamiento de citas, toma de pedidos y delivery, atención y
  soporte, o calificación de leads.
- **Ver el tamaño del entrenamiento** y cuánto ocupa.
- **Volver a una versión anterior** desde el historial, que se guarda solo.
- **Ver cómo va el agente**: cuántas conversaciones atendió la IA, cuántas se
  pasaron a una persona y cuántos leads se cerraron.
- **Elegir el estilo**: responder con audios en vez de texto, escoger voz,
  género, motor de voz y las instrucciones de tono. La firma del agente.
- **Conectar herramientas** que el agente puede usar durante la conversación:
  leer una hoja de cálculo, ejecutar un flujo, escalar a un asesor, notificar,
  capturar datos, consultar datos del negocio.

### Pantalla: Agente de voz (canal Llamadas)

El mismo entrenamiento, pero para el agente que atiende llamadas: voz, motor de
texto a voz, número al que transferir cuando hace falta una persona.

---

## 2. Conexiones (canales)

**Ruta:** `/connection` · **Se activa por Panel › Módulos** · No consume créditos

Donde se conectan los canales por los que habla el negocio.

| Canal | Qué puede hacer el usuario |
|---|---|
| **WhatsApp por QR** | Escanear el código con el teléfono o vincular con un código de 8 dígitos. Ver el número conectado, la foto y el nombre. Cerrar la sesión sin perder el historial, cambiar el número, renombrar la línea o eliminarla. |
| **Llamadas de WhatsApp** | Conectar la línea desde la que el agente de voz contesta y llama. |
| **WhatsApp API oficial (Meta)** | Pegar las credenciales de Meta: identificador del número, identificador de la cuenta de negocio, token y token de verificación. |
| **Telegram** | Pegar el token del bot. |
| **Facebook Messenger** | Pegar el identificador de la página y su token. |
| **Instagram** | Pegar el identificador de la cuenta de negocio y su token. |

En cada línea conectada hay además un **interruptor del agente**: apaga y
enciende la IA de esa línea sin desconectar el número. Con el agente apagado, la
conversación sigue entrando y un asesor la atiende a mano.

---

## 3. Conversaciones (Chats)

**Ruta:** `/chats` · **Se activa por Panel › Módulos** ·
**Consume créditos** solo al transcribir notas de voz o pedir una respuesta sugerida

La bandeja de entrada. Es la pantalla que más se usa.

### Pantalla: Bandeja

- **Ver todas las conversaciones** de todas las líneas conectadas, con el último
  mensaje, la hora y la foto del contacto.
- **Filtrar** por: mías, todos, sin leer, en espera de respuesta, asignadas,
  archivadas, resueltas, por etiqueta, por asesor y por línea.
- **Buscar** por nombre o número.
- **Anclar** una conversación arriba, **archivarla** o **eliminarla** (de una en
  una o varias a la vez, incluso por rango de fechas).
- Ver cuántas conversaciones tiene cada línea.

### Pantalla: Conversación abierta

- **Escribir y enviar** texto, con negrita, cursiva, tachado y emojis.
- **Adjuntar** imágenes, videos, audios y documentos.
- **Editar una foto antes de enviarla**: recortar, dibujar encima, poner flechas,
  cuadros y texto.
- **Grabar y enviar notas de voz**, o **dictar** el mensaje con la voz.
- **Responder citando** un mensaje, reaccionar con emoji, editar o eliminar lo
  enviado.
- **Transcribir una nota de voz del cliente** pulsando un botón, con el precio en
  créditos a la vista antes de pulsar.
- **Pedirle a la IA una respuesta sugerida** para ese mensaje.
- **Usar respuestas rápidas**, plantillas de WhatsApp aprobadas, flujos y
  workflows sin salir del chat.
- **Escribir una nota interna** que solo ve el equipo.
- **Llamar por WhatsApp** al contacto desde la propia conversación, con la
  tarjeta de llamada flotando mientras se sigue trabajando.
- **Ver el estado de cada mensaje**: enviado, entregado, leído, no enviado.
- **Buscar dentro de la conversación** y cargar mensajes anteriores.

### Panel lateral: ficha del contacto

- Cambiar el nombre del contacto, ver su número y unir dos fichas del mismo
  cliente.
- **Etiquetar** la conversación.
- **Asignar un asesor** o asignársela uno mismo, y ver el historial de
  asignaciones.
- **Cambiar el estado del lead** (frío, tibio, caliente, finalizado,
  descartado), el tipo de servicio y el estado del cliente (activo, inactivo).
- **Agendar una cita** desde el chat, eligiendo servicio, día y hora libre.
- **Crear tareas y recordatorios** para ese contacto.
- **Ver la agenda del contacto**: seguimientos, recordatorios, citas y
  seguimientos automáticos programados.
- **Ver los registros de CRM** de ese lead y sus campos personalizados.
- **Leer la síntesis del lead** que escribe la IA y su puntuación.
- **Ver qué flujos se ejecutaron** en esa conversación.
- **Configurar qué campos** aparecen en la ficha.

### Menú de acciones de la conversación

Transferir a otro asesor, agregar un participante, activar o desactivar el
agente de IA en ese chat, poner la firma del asesor, y **resolver la
conversación**.

---

## 4. Leads

**Ruta:** `/sessions` · **Se activa por Panel › Módulos** · No consume créditos

La lista de todos los contactos que han escrito alguna vez.

- Ver el total de leads, cuántos están activos e inactivos y cuántos tienen
  seguimientos pendientes.
- **Filtrar por línea** y ver cuántos leads tiene cada una.
- **Buscar** por nombre o número.
- **Crear un contacto** a mano.
- **Elegir qué columnas** se ven.
- Abrir el **historial de conversación** de cualquiera.
- **Eliminar** un lead, solo su historial, o solo sus seguimientos.
- **Exportar** la lista a CSV o a Excel.

---

## 5. CRM

**Ruta:** `/crm` y sus apartados · **Se activa por Panel › Módulos** ·
**Consume créditos** en las funciones de IA (síntesis, clasificación, seguimientos)

### Pantalla: Registros (`/crm/registros`)

La tabla de todo lo que el agente ha capturado: pedidos, reservas, reclamos,
solicitudes. Se puede ver el detalle de cada registro, editarlo, cambiar su
estado, adjuntar archivos, elegir columnas y **exportar a CSV**.

### Pantalla: Embudo (`/crm/kanban`)

Tablero por etapas. Se arrastra un contacto de una etapa a otra y se ve cuántos
hay en cada una. Cada etapa puede tener automatizaciones que se disparan al
entrar.

### Pantalla: Analíticas (`/crm/dashboard`)

Embudo de conversión, embudo por etiquetas, citas por estado, distribución de
movimientos, efectividad de los seguimientos, distribución por etiquetas,
alertas de inventario y comparativo del período.

### Pantalla: Reportes (`/crm/reportes`)

Informes del período con filtro de fechas y exportación.

### Pantalla: Llamadas (`/crm/llamadas`)

Registro de las llamadas por WhatsApp: salientes y entrantes, duración,
resultado, grabación y transcripción. Se puede marcar el resultado, agendar una
rellamada, devolver la llamada y exportar el historial.

### Pantalla: Reglas (`/crm/rules`)

Donde se configuran las funciones automáticas del CRM:

- **Sintetizador** — la IA resume cada conversación en un párrafo.
- **Clasificador de leads** — la IA marca cada contacto como frío, tibio,
  caliente, finalizado o descartado.
- **Seguimientos automáticos** — si un lead se queda callado, el agente le
  vuelve a escribir. Se define por cuánto tiempo, cuántos intentos, con qué
  mensaje, en qué horario y días, y qué hacer si no contesta.
- **Automatizaciones por etapa** — qué pasa cuando un lead cambia de etapa:
  asignar asesor, cambiar estado, crear una tarea, ejecutar un flujo.

---

## 6. Etiquetas

**Ruta:** `/tags` · **Se activa por Panel › Módulos** · No consume créditos

Crear etiquetas con color, asignarlas a conversaciones, ver cuántos contactos
tiene cada una y eliminarlas.

---

## 7. Flujos (respuestas guiadas)

**Ruta:** `/flow` · **Se activa por Panel › Módulos** · No consume créditos

Secuencias de mensajes que se disparan solas. Se define cómo se activa el flujo
(palabra exacta o parcial, o al escribir el cliente), en qué horario y qué días
puede enviarse, y los pasos que lo componen. Se pueden crear, duplicar, ordenar,
eliminar y pasar al creador visual conservando los pasos.

---

## 8. Creador visual de flujos

**Ruta:** `/workflow` · **Se activa por Panel › Módulos** · No consume créditos

El mismo concepto, pero dibujado: se arrastran nodos y se conectan.

- **Nodos de contenido**: texto, imagen, video, documento y nota de voz.
- **Acciones**: pausar, notificar, detectar intención, guardar la ficha del
  cliente.
- **Automatizaciones**: poner o quitar una etiqueta, asignar un asesor, crear una
  tarea, avisar a un asesor, cambiar el estado del lead, activar o desactivar la
  IA, llamar a un sistema externo y **llamar por teléfono con voz de IA**.
- **Disparadores por IA**: en vez de una palabra exacta, se describe la intención
  ("quiere cancelar") y el agente decide si dispara el flujo. Se le pone un
  umbral de certeza, un mensaje si no coincide y un aviso a quien corresponda.
- **Seguimiento por inactividad**: si el cliente no responde dentro del flujo, se
  le escribe de nuevo.

Qué nodos puede usar cada cuenta lo decide el administrador desde el panel.

---

## 9. Diagramas

**Ruta:** `/diagramas` · **Se activa por Panel › Módulos** · No consume créditos

Mapas visuales para explicar procesos: se crean cajas con texto, color e icono,
se conectan y se ordenan. Cada diagrama se puede renombrar, duplicar, compartir
con otra cuenta (solo lectura o con edición), y repartir dentro del propio equipo.

---

## 10. Macros

**Ruta:** `/macros` · **Se activa por Panel › Módulos** · No consume créditos

Una macro es una lista de acciones que se ejecutan de un tirón sobre una
conversación: poner una etiqueta, asignar un asesor, mover de etapa, enviar una
respuesta rápida, ejecutar un flujo, activar o desactivar el agente de IA,
esperar unos segundos o unos días, y marcar la conversación como resuelta. Se le
pone nombre y color y queda disponible en el chat.

---

## 11. Respuestas rápidas

**Ruta:** `/auto-replies` · **Se activa por Panel › Módulos** · No consume créditos

Textos guardados que el asesor inserta en el chat escribiendo un atajo. Se
organizan por categoría y cada una puede llevar un flujo asociado.

---

## 12. Recordatorios y campañas

**Rutas:** `/reminders` y `/campaigns` · **Se activan por Panel › Módulos** ·
No consumen créditos

Las dos pantallas son la misma herramienta con dos usos.

**Recordatorios** — mensajes programados a un contacto o a una lista: se escribe
el mensaje (con variables como el nombre), se adjunta imagen, video, audio o
documento, se elige fecha y hora, y se puede repetir cada cierto tiempo. Hay
historial de envíos con enviados, pendientes y fallidos.

**Campañas** — lo mismo, pero a un segmento: se eligen los destinatarios por
etiqueta, estado del lead y puntuación mínima, y se ve el resumen de entrega.

---

## 13. Agenda de citas

**Ruta:** `/schedule` · **Se activa por Panel › Módulos** · No consume créditos

- **Crear servicios**: nombre, descripción, duración, color.
- **Definir la disponibilidad** por día y franja horaria.
- **Ver y gestionar las citas**: confirmada, atendida, no asistida, cancelada.
- **Enviar el enlace público** para que el cliente reserve solo.
- **Escribir el mensaje automático de WhatsApp** que recibe el cliente al
  reservar.
- **Conectar Google Calendar** para que las citas aparezcan también ahí.

---

## 14. Reservas con equipo (multiagenda)

**Ruta:** `/bookings` · **Se activa por Panel › Módulos** · No consume créditos

La versión para negocios con varias personas atendiendo.

- **Crear especialistas** con su color y su disponibilidad semanal propia.
- **Crear servicios** y decir qué especialistas los atienden.
- **Definir la anticipación mínima** para reservar y el enlace de la reunión.
- **Preguntas propias del formulario** de reserva.
- **Ver la agenda** de todos y el detalle de cada cita.
- **Enlace público** donde el cliente elige servicio, especialista, día y hora.

Agenda y Multiagenda son dos módulos alternativos: se asigna uno u otro.

---

## 15. Tareas

**Ruta:** `/tareas` · **Se activa por Panel › Módulos** · No consume créditos

Lista de pendientes del equipo. Cada tarea lleva título, descripción, tipo,
responsable, contacto asociado y fecha de vencimiento. Se filtran por para
cuándo vencen (mañana, próxima semana, próximo mes), se marcan como hechas y se
ven las completadas. Se pueden crear desde cualquier chat. Al cerrarlas se pide
el tiempo dedicado.

---

## 16. Proyectos

**Ruta:** `/proyectos` · **Se activa por Panel › Módulos** · No consume créditos

Tableros de trabajo interno.

- **Crear proyectos**, ponerles responsable y equipo, y organizarlos en carpetas.
- **Tablero por columnas**: se arrastran las tarjetas entre columnas y se
  reordenan dentro de una columna.
- **Cada tarjeta** lleva título, descripción, responsable, fecha límite,
  comentarios y archivos adjuntos (se pueden pegar capturas con Ctrl+V).
- **Al dar por hecha una tarea se apunta el tiempo** que llevó y a qué cliente
  se le dedicó, y si fue trabajo de montaje o de soporte.
- **Reparto del trabajo**: cuánto tiempo se le dedicó a cada cliente y cuánto
  hizo cada persona.
- **Compartir un proyecto con otra cuenta**, en solo lectura o con edición.
- **Avisos**: cuando a alguien se le asigna una tarea, se comenta o se da por
  hecha, le salta una ventana que no se cierra sola.

---

## 17. Tickets de soporte

**Rutas:** `/tickets` (quien atiende) y `/mis-tickets` (quien pide) ·
**Se activan por Panel › Módulos** · No consumen créditos

- **Abrir un ticket** desde un botón flotante: título, descripción y archivos.
- **Tablero de tickets** con cinco estados: recibido, en proceso, en revisión,
  resuelto y descartado. Se arrastran entre columnas.
- **Asignar responsable** y fecha de vencimiento.
- **Descartar con motivo escrito**, que el cliente lee.
- **Al pasar a resuelto se le avisa al cliente por WhatsApp**, una sola vez.
- **Enlace público permanente** (`/t/<código>`) que la cuenta le reparte a sus
  propios clientes: quien lo abre no necesita tener cuenta, rellena nombre,
  WhatsApp, título, descripción y archivos, y el ticket cae en la bandeja
  correcta.

---

## 18. Productos y catálogo

**Rutas:** `/products`, `/mis-catalogo` · **Se activan por Panel › Módulos** ·
No consumen créditos

**Productos** — fichas con nombre, código, categoría, descripción, precio,
precio tachado, inventario e imagen. El código no se puede repetir. Desde aquí
se abre la vista previa del catálogo público.

**Catálogo público** — se configura la portada: datos del negocio, colores,
logo, textos, redes sociales, dirección web propia, y si se muestra el código y
el stock de cada producto. Queda publicado en una dirección que se le pasa al
cliente.

---

## 19. Cotizaciones

**Ruta:** `/cotizaciones` · **Se activa por Panel › Módulos** · No consume créditos

Armar una cotización poniendo el nombre y el teléfono del cliente y eligiendo
productos del catálogo, con cantidad y precio unitario. Calcula subtotal y
total, lleva notas y condiciones de pago, y pasa por estados: borrador, enviada
y cancelada. Se puede **imprimir** y **confirmar la venta**.

---

## 20. Formularios

**Ruta:** `/mis-formularios` · **Se activa por Panel › Módulos** · No consume créditos

- **Crear un formulario** con los campos que se quiera (texto, opciones,
  archivo), marcando cuáles son obligatorios.
- **Dirección propia** para el enlace.
- **Activarlo o desactivarlo**.
- **Copiar el enlace** para repartirlo.
- **Enviar un WhatsApp automático** a quien lo rellena, con la plantilla que se
  escriba.
- **Redirigir a otra página** después de enviarlo.
- **Volcar las respuestas a una hoja de Google** automáticamente.
- **Ver los registros recibidos** y el detalle de cada uno.

---

## 21. Finanzas

**Ruta:** `/dashboard/finance` y sus apartados · **Se activa por Panel › Módulos** ·
No consume créditos

| Pantalla | Qué puede hacer el usuario |
|---|---|
| **Resumen** | Ver ingresos, gastos y balance del año, con gráfica y desglose mes a mes. Buscar un movimiento y aterrizar en él. |
| **Ventas** | Registrar ingresos con fecha, concepto, monto, cuenta, categoría y soportes (capturas o PDF). Filtrar por mes, elegir columnas, exportar y eliminar en bloque. |
| **Gastos** | Lo mismo para las salidas de dinero. |
| **Cuentas** | Crear cuentas (caja, banco) con su moneda y marcar una por defecto. Ver el saldo de cada una. |
| **Clientes** | Fichas de a quién se le vende, con campos propios configurables. |
| **Proveedores** | Fichas de a quién se le compra. |
| **Configuración** | Categorías, moneda preferida, campos personalizados y vaciar la contabilidad. |

Quien administra una cuenta madre puede **elegir qué cuentas de su familia ve a
la vez** y consolidarlas. Con monedas distintas se muestra el desglose de cada
una y no se suma un total.

---

## 22. Cobros

**Ruta:** `/cobros` · **Se asigna a mano** · No consume créditos

La cartera de cobro de una cuenta con sus propios clientes (internet,
streaming, suscripciones, lo que sea).

- **Crear una deuda**: cliente, concepto, monto, moneda, fecha de vencimiento,
  días de gracia y días de licencia.
- **Datos de pago propios de ese cobro** (número de cuenta, enlace), que salen
  pegados al final del mensaje.
- **Recordatorios automáticos por WhatsApp**: uno antes, otro el día del
  vencimiento y otro después. Se elige a cuántos días.
- **Adjuntar archivos** (la factura, un comprobante) que salen detrás del
  mensaje.
- **Cobrar ahora** a mano.
- **Confirmar el pago**: salta al siguiente ciclo y queda el historial de ciclos
  pagados.
- **Marcar comprobante recibido**, con lo que los recordatorios paran hasta que
  alguien lo revise.
- **Configuración**: la plantilla de los tres mensajes, la cuenta de cobro, la
  moneda y los días.

---

## 23. Equipo

**Ruta:** `/equipo` · **Se activa por Panel › Módulos** · No consume créditos

- **Crear asesores** con nombre, correo y contraseña.
- **Dar rol**: administrador (ve y gestiona todo) o agente (solo ve las
  conversaciones que le asignan).
- **Repartir permisos**: qué módulos y qué apartados ve cada persona.
- **Auto-asignación**: repartir las conversaciones nuevas entre el equipo
  automáticamente.
- **Ver la carga de cada asesor**: conversaciones activas, asignadas, cerradas,
  calientes y convertidas.
- **Mudar a una persona a otra cuenta** de la familia conservando su trabajo.

---

## 24. Pipeline de asesores

**Ruta:** `/asesores` · **Se activa por Panel › Módulos** · No consume créditos

Tablero donde se arrastra un contacto encima de un asesor para asignárselo, y se
configuran las automatizaciones que se disparan al asignar.

---

## 25. Chat de equipo

**Ruta:** `/chat-equipo` y botón fijo en el borde derecho de toda la plataforma ·
**Se asigna a mano** ·
**Consume créditos** solo al transcribir notas de voz

El chat interno, para hablar entre compañeros sin salir de la plataforma.

- **Canal general** (todo el equipo), **canales de área** y **mensajes
  directos** entre dos personas.
- **Un canal puede cruzar varias cuentas** de la misma familia: la cuenta madre
  lo reparte y toda la gente de esas cuentas lo ve desde su propia sesión.
- **Escribir con formato y emojis**, adjuntar imágenes, videos y archivos.
- **Notas de voz** y dictado, con botón para transcribirlas (el precio en
  créditos se ve antes de pulsar).
- **Mencionar a alguien** escribiendo `@`, con lista de quién hay en ese canal.
  Al mencionado le salta un aviso que no se cierra solo.
- **Citar un mensaje**, reaccionar con emoji, editar y eliminar lo propio.
- **Buscar** en todo el historial y saltar al mensaje encontrado con su contexto.
- **Contador de mensajes sin leer** y **sonido** cuando es un directo o una
  mención.
- **Avisos en el escritorio o el móvil aunque la plataforma esté cerrada**.
- **Compartir una conversación de WhatsApp con el equipo**: se manda una tarjeta
  y quien la pulsa cae dentro de ese chat.

---

## 26. Llamadas y reuniones de video

**Ruta:** `/reuniones` · **Se asigna a mano** ·
**La grabación consume créditos** al transcribir

### Llamada de voz entre dos personas

Desde un mensaje directo del chat de equipo, de navegador a navegador, sin
WhatsApp ni teléfono. Suena estés en la pantalla que estés, se ve si la otra
persona está disponible, y queda registrada en el hilo con su duración. La
tarjeta se arrastra y se pliega a una barra para seguir trabajando.

### Reuniones de video (hasta cuatro personas)

- **Abrir una sala** y repartir su enlace.
- **Quien tiene cuenta entra directo**; quien viene de fuera con el enlace
  **espera a que alguien de dentro le abra la puerta**.
- **Vista de quien habla** (grande) o **cuadrícula**.
- **Cámara, micrófono y compartir pantalla**.
- **Fondo desenfocado o de color**.
- **Levantar la mano**.
- **Chat dentro de la reunión** (se borra con la sala).
- **Moderar**: silenciar a alguien o sacarlo.
- **Caducidad del enlace** (por defecto una semana, hasta 30 días), que se puede
  mover después, y enlace **permanente** para quien administra la cuenta.
- **Revocar** el enlace, que echa también a quien esté dentro, y **regenerarlo**.
- **Volver sola a la reunión** si se cae internet, durante un minuto.
- **Ventana flotante** que se arrastra y se pliega a una pastilla para seguir
  trabajando en otra pantalla sin cortar la reunión.
- **Historial**: qué reuniones hubo, cuándo, cuánto duraron y quién entró.

### Grabación de reuniones

**Ruta:** `/reuniones/grabaciones` · **Módulo aparte, se vende por separado**

Graba solo el audio o video y audio. Quien administra la cuenta puede grabar;
mientras se graba sale un aviso en rojo con el nombre de quien está grabando.
Después se puede **transcribir** la grabación y obtener un **resumen con los
puntos tratados** (esto sí gasta créditos, con el precio a la vista antes de
pulsar). Las grabaciones se guardan 180 días; la transcripción y el resumen se
quedan para siempre.

---

## 27. Documentación interna

**Ruta:** `/documentos` · **Se asigna a mano** · No consume créditos

La documentación de la empresa: lo que antes vivía en archivos de Word sueltos.

- **Espacios** y **carpetas** para organizar.
- **Documentos** con editor de texto y **listas** que se ven como tabla,
  tablero o calendario.
- **Mencionar** un cliente, una tarea o un ticket dentro del texto: desde la
  ficha de ese cliente o tarea se ve qué documentos lo nombran, y al pulsar se
  aterriza en la ficha exacta.
- **Buscador** sobre todo el texto.
- **Historial de versiones** y volver atrás.
- **Compartir** con personas del equipo o con otra cuenta entera, en lectura o
  edición.
- **Fijar** documentos arriba y **archivar** los que ya no se usan.
- **Exportar** a Markdown.
- **Plantillas** para arrancar un documento.

---

## 28. Notas

**Ruta:** `/notas` · **Se activa por Panel › Módulos** · No consume créditos

Notas personales con editor de texto, color y archivos adjuntos. Se pueden
fijar, ordenar, vincular a un contacto de WhatsApp (y entonces se ven también en
la pestaña Notas de ese chat) y **compartir con el equipo** en solo lectura o
con edición. Las notas son de la persona, no de la cuenta: cada uno ve las
suyas y las que le compartieron.

---

## 29. Datos externos y base de conocimiento

**Ruta:** `/my-data` · **Se activa por Panel › Módulos** · No consume créditos

- **Base de conocimiento**: bloques de texto que el agente consulta para
  responder (manuales, políticas, condiciones).
- **Datos de clientes propios**: importar una tabla (por ejemplo desde una hoja
  de cálculo) diciendo qué columna lleva el número de WhatsApp, para que el
  agente reconozca al cliente y consulte sus datos.
- **Herramientas de consulta**: definir qué puede preguntar el agente contra esa
  tabla, con qué nombre y con qué descripción.

---

## 30. Integraciones y herramientas embebidas

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Integraciones** | `/integraciones` | Añadir aplicaciones externas propias, que quedan como pestañas dentro de Chats. Se reordenan arrastrando. |
| **Copiloto** | `/copiloto` y botón fijo en el borde derecho | Un asistente de IA embebido, aparte del agente que atiende clientes. Se puede fijar como pestaña en Chats y abrir a pantalla completa. |
| **Multiagente** | `/multiagente` | Panel de multiagente embebido. |
| **Canva** | `/canva` | Canva embebido dentro de la plataforma. |
| **Google Sheets** | `/google-sheets` | Vincular una hoja de cálculo y verla dentro. |
| **Documentos / Drive / Sheets** | `/tools/docs`, `/tools/drive`, `/tools/sheets` | Herramientas de Google embebidas. |
| **Herramientas 1 a 5** | `/tools/tool-1` … `/tools/tool-5` | Cinco espacios libres donde el administrador pega la dirección de cualquier herramienta externa y queda embebida con el nombre que quiera. |

Todas **se activan por Panel › Módulos**. No consumen créditos.

---

## 31. Generador de anuncios con IA

**Ruta:** `/ai-image` · **Se activa por Panel › Módulos** ·
**No consume créditos** (usa la clave de Google del propio cliente)

Crea imágenes publicitarias a partir de fotos del producto.

- **Subir de una a cuatro fotos** del producto desde distintos ángulos.
- **Definir el estilo visual** de la marca: nombre del estilo, descripción,
  dirección creativa.
- **Elegir cuántas variantes** salir y cuántas salidas por producto.
- **Incluir o no texto** dentro de la imagen.
- **Generar las 10 etapas** de una estructura de marketing completa.
- **Biblioteca visual** con lo ya generado.

---

## 32. Actividad del equipo

**Ruta:** `/actividad-equipo` · **Se activa por Panel › Módulos** · No consume créditos

Dónde pasa la jornada cada persona y qué hizo.

- **Tiempo por sección**: Chats, Tickets, Proyectos, Cobros, Clientes, Panel y
  otras.
- **Acciones contadas**: chats atendidos, mensajes enviados, tickets creados y
  cerrados, tareas movidas, cobros enviados, seguimientos y clientes tocados.
- **Filtro por fechas** y separación entre la gente de casa y la de las cuentas
  de clientes.

---

## 33. Perfil y cuenta

**Ruta:** `/profile` · **Se activa por Panel › Módulos** · No consume créditos

| Sección | Qué puede hacer el usuario |
|---|---|
| **Cuenta** | Nombre, empresa, logo, favicon, colores del panel, zona horaria, tamaño de letra, tema claro u oscuro. |
| **Seguridad** | Cambiar contraseña, cambiar correo (con confirmación), ver las sesiones activas y cerrarlas todas. |
| **Plan y facturación** | Ver el plan actual, el vencimiento, el estado del servicio y **pagar y renovar** desde ahí. |
| **Créditos de IA** | Ver los créditos totales, consumidos y disponibles, y cuándo renuevan. |
| **Proveedor de IA** | Poner la clave propia de OpenAI o Google y elegir el modelo. Con clave propia el consumo lo paga el cliente y no gasta créditos. |
| **Estado del agente** | Frases para apagar y encender el agente, reactivación automática tras un tiempo sin mensajes, retraso antes de responder, temperatura del agente. |
| **Escalado** | Si el agente puede pasar la conversación a una persona por su cuenta, si al escalar se calla, y a los cuántos minutos se suelta si nadie responde. |
| **Contactos de notificación** | Números de WhatsApp que reciben los avisos del sistema. |
| **Copias de seguridad** | Exportar y restaurar los datos de la cuenta. |
| **Canal de comunicación** | El WhatsApp de soporte y el enlace a Google Maps del negocio. |

---

## 34. Modo Dueño por WhatsApp

**Sin pantalla** — se usa escribiéndole al propio agente · No consume créditos aparte

El dueño le escribe a su propio número de WhatsApp y el agente le obedece:

- Crear una tarea o un recordatorio.
- Pedir el resumen del día.
- Buscar un contacto y ver su ficha.
- Enviarle un mensaje a un contacto.
- Mover un lead de estado o etiquetarlo.
- Consultar citas, pagos, productos y leads.
- Entrenar al agente sobre la marcha.

Todo lo que escribe queda registrado. Las acciones que tocan a un contacto piden
confirmación antes de ejecutarse.

---

# PARTE 2 — Administración y reventa

## 35. Panel › Módulos

**Ruta:** `/panel/module` · Solo administración

Donde se decide qué ve cada cuenta.

- **Crear un módulo**: nombre visible, icono, ruta (de una lista cerrada de
  pantallas disponibles) y orden en el menú.
- **Añadir submódulos** (las pestañas que salen arriba).
- **Restringir por plan**: qué planes lo ven y a cuáles se les muestra con
  candado.
- **Marcarlo como solo administración**.
- **Dirección personalizada** para las pantallas embebidas.

---

## 36. Panel › Clientes

**Ruta:** `/panel/clientes` · Solo administración

La cartera de cuentas.

- **Crear un cliente**: nombre, empresa, correo, teléfono, contraseña, plan y rol.
- **Buscar** por empresa, nombre, correo o marca, y filtrar por estado del
  servicio.
- **Editar la ficha** y desde ahí:
  - asignar plan y licencia disponible;
  - dar o quitar **créditos**, o ponerla en ilimitado;
  - elegir la **clave de IA** que usa (la de la plataforma o la suya);
  - encender por cuenta los **canales** del agente: Llamadas, WhatsApp API,
    Telegram, Facebook e Instagram;
  - encender las **funciones de IA**: sintetizador, clasificación de leads y
    seguimientos automáticos;
  - configurar sus **herramientas**;
  - elegir su **servidor** de WhatsApp;
  - silenciar las respuestas del agente;
  - abrir sus **copias de seguridad**.
- **Repartir módulos** a esa cuenta.
- **Entrar a la cuenta** del cliente para ver lo que él ve.
- **Asignar el cliente** a un asesor o a un revendedor.
- **Eliminarla**.
- Ver de un vistazo qué cuentas tienen la línea desconectada.

---

## 37. Panel › Facturación de clientes

**Ruta:** `/panel/client-billing` · Solo administración

Tabla de cobro por cliente: precio, moneda, método de pago, fecha de inicio,
días de licencia, días de gracia y si ya pagó. Con semáforo de vencimiento
(vencido, vence hoy, faltan pocos días, con margen). Se edita el pago de cada
uno, se elige qué columnas ver y se confirma el cobro.

---

## 38. Panel › Planes, suscripciones y pagos

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Planes** | `/panel/planes` | Crear los planes que se venden: nombre visible, precio, créditos incluidos, características (una por línea), etiqueta ("Más popular"), colores, imágenes, orden, textos para buscadores y redes, enlace de demo y de reunión, y mensaje pre-escrito de WhatsApp. Hay planes para clientes directos y planes para revendedores. |
| **Suscripciones** | `/panel/suscripciones` | Ver las altas que piden los clientes y aprobarlas o rechazarlas con motivo, con fecha de inicio y vencimiento. |
| **Métodos de pago** | `/panel/pagos` | Crear las formas de pago que ve el cliente: nombre, emoji, datos de la cuenta e instrucciones. |

---

## 39. Panel › Créditos y claves de IA

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Créditos** | `/panel/credits` | Ver y ajustar los créditos totales y consumidos de una cuenta. |
| **Claves de IA** | `/panel/api-keys` | Registrar las claves de inteligencia artificial de la plataforma, cada una con su cupo de cuentas. Marcar cuál es la de por defecto, activarla o desactivarla, y **traspasar sus cuentas a otra clave** antes de borrarla. |

---

## 40. Panel › Servidores y conexión

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Conexión** | `/panel/conexion` | Crear y editar las conexiones a los servidores de WhatsApp (dirección y clave). |
| **Monitoreo** | `/panel/evo` | Configurar hasta cinco servidores y sus claves, y entrar a su gestor. |
| **Gestor embebido** | `/evo` | El panel del servidor de WhatsApp dentro de la plataforma. |
| **Enlaces de registro** | `/panel/register-links` | Generar un enlace de alta por servidor, para repartir clientes entre servidores. |

---

## 41. Panel › Revendedores y afiliados

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Revendedores** | `/panel/reseller` | Asignarle licencias a un revendedor y repartirle clientes: ver los asignados, los pendientes y el resumen de facturación mensual. |
| **Afiliados** | `/panel/afiliados` | Crear perfiles de afiliado, ponerles su tasa de comisión, ver sus referidos y sus comisiones, y marcarlas como pagadas. |
| **Panel del afiliado** | `/afiliados` | Lo que ve el afiliado: su enlace de referido, sus referidos y sus comisiones. |

---

## 42. Panel › Landing propia

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Landing de la plataforma** | `/panel/landing` | Editar la página pública de venta. |
| **Mi landing (revendedor)** | `/panel/mi-landing` | Cada revendedor arma su propia página de venta: nombre del negocio, logo, colores, titular, estadísticas del encabezado, WhatsApp, redes, enlace de agenda, qué planes mostrar (mensual, trimestral, anual), si se ve el botón de crear agente, y a qué hoja de cálculo llegan sus leads. Queda publicada en su propia dirección. |
| **Mis planes (revendedor)** | `/panel/mis-planes` | Los planes que ese revendedor le vende a sus clientes. |

---

## 43. Panel › Analíticas

**Ruta:** `/panel/analytics` · Solo administración

- **Ingresos mensuales** de los últimos 12 meses.
- **Usuarios nuevos** de los últimos 12 meses y usuarios por plan.
- **Uso global** de créditos: cargados, consumidos y disponibles.
- **Rendimiento por revendedor**.
- **Renovación mensual**: del último mes cerrado, cuántas cuentas siguieron y
  cuántas se fueron, con nombre y correo (se conservan aunque la cuenta se haya
  eliminado). Si un mes no tiene datos completos se dice, en vez de enseñar un
  porcentaje falso.
- **Actividad de instancias**: qué líneas no recibieron ni un mensaje (rojo),
  cuáles reciben y la IA no contestó (amarillo) y cuáles van bien (no se listan).
- **Rendimiento de Chats**: vigilancia del día anterior.

**Mis estadísticas** (`/panel/mis-estadisticas`) es la misma idea para un
revendedor sobre su propia cartera.

---

## 44. Panel › Salud del envío

**Ruta:** `/panel/salud-envios` · **Se asigna a mano** · Solo administración

Qué salió y qué falló de todo lo que la plataforma manda sola: cobros, avisos de
desconexión, facturación, seguimiento de prueba, informe semanal y aviso de
ticket resuelto. Con fecha, cuenta, canal, destinatario, si salió o no y **el
motivo del fallo**. Arriba, el resumen por canal y las alertas. Se filtra por
cuenta, estado, canal y días. Se guardan 30 días.

---

## 45. Panel › Avisos y seguimientos

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Notificaciones** | `/panel/notificaciones` | Decidir qué cuenta atiende los tickets, por qué línea salen los avisos, los horarios de revisión, los días de gracia antes de suspender y el texto de cada aviso, con vista previa. |
| **Seguimientos de prueba** | `/panel/seguimientos-prueba` | Los mensajes que recibe quien está en prueba gratis: cuántos días dura, qué se le escribe cada día y por qué línea sale. |
| **Plantillas** | `/panel/templates` | Plantillas de entrenamiento listas por categoría, que un cliente puede aplicar a su agente. |
| **Datos externos** | `/panel/external-data` | Administrar las tablas de datos de clientes de cada cuenta y sus herramientas de consulta. |
| **Contraseñas** | `/panel/password` | Actualizar contraseñas en bloque, con registro de qué se actualizó, qué se saltó y qué falló. |
| **Funciones del creador visual** | `/panel/workflow-features` | Qué nodos y automatizaciones puede usar cada cuenta en el creador visual. |

---

## 46. Portadas por rol

| Pantalla | Ruta | Quién la ve |
|---|---|---|
| **Panel del superadministrador** | `/panel` | Quien administra la plataforma. |
| **Panel del administrador** | `/panel-admin` | Administradores, con sus propios apartados. |
| **Panel del revendedor** | `/reseller-panel` | Revendedores. Es solo el contenedor de pestañas: lleva directo a su primer apartado. |
| **Panel del cliente** | `/client-panel` | El cliente final. |
| **Inicio** | `/` | La portada con los accesos a los módulos de esa cuenta y, para el cliente, una lista de tres pasos para poner el agente en marcha: conectar WhatsApp, configurar el agente y encenderlo. |

---

# PARTE 3 — Pantallas públicas (sin cuenta)

Las pantallas que se abren sin tener cuenta en la plataforma. Son los enlaces
que se reparten por WhatsApp, se pegan en una firma o se anuncian: quien los
abre no se registra, entra directo. Cada una sale con el logo, el nombre y los
colores del negocio que la reparte.

| Pantalla | Ruta | Qué hace |
|---|---|---|
| **Landing de venta** | `/inicio` | La página comercial: qué hace el agente, para qué negocios sirve, testimonios, precios y botón de crear agente. |
| **Landing del revendedor** | `/r/<marca>` | La misma página, con la marca, los colores y los planes de ese revendedor. |
| **Programa de revendedores** | `/resellers` | Página de captación: beneficios, cómo funciona, ejemplo de margen y preguntas frecuentes. |
| **Detalle de un plan** | `/planes/<plan>` | Qué incluye el plan, capturas del panel, testimonios y preguntas frecuentes. |
| **Enlace corto de venta** | `/plan/<nivel>` | El que se dicta por teléfono o se pega en WhatsApp: lleva al alta con el plan ya puesto. |
| **Enlace corto de pago** | `/p/<código>` | El que llega en el aviso de cobro. Calcula el precio al abrirse, así que si cambia el precio el aviso viejo sigue cobrando lo correcto. |
| **Alta de cuenta** | `/completar-registro` | Crear la cuenta con los datos mínimos. |
| **Documentación de conexión** | `/documentacion` | Guía paso a paso para conectar WhatsApp API oficial, Facebook e Instagram. |
| **Catálogo público** | `/catalogo/<cuenta>`, o `/c/<marca>` con dirección propia | El catálogo de productos del negocio, con su logo, sus colores y buscador por categoría. |
| **Formulario público** | `/f/<cuenta>/<formulario>`, o `/f/<nombre>` si se le puso dirección propia | El formulario que arma el cliente, con la marca del negocio arriba y subida de archivos. |
| **Reserva de cita** | `/schedule/<cuenta>` | Elegir servicio, día, hora y dejar los datos. |
| **Reserva con especialista** | `/bookings/<cuenta>` | Lo mismo, eligiendo además con quién: servicio, especialista, día, hora y datos. |
| **Ficha de soporte** | `/t/<código>` | Donde el cliente final de una cuenta abre un ticket sin tener cuenta. |
| **Reunión por enlace** | `/reunion/<código>` | Entrar a una reunión de video. Quien no tiene cuenta espera a que le abran. |
| **Inicio de sesión** | `/login` | Entrar. |

---

# PARTE 4 — Lo que trabaja solo (sin pantalla)

Procesos que corren por detrás. El cliente nunca los ve, pero es donde pasa casi
todo.

| Proceso | Qué hace |
|---|---|
| **El agente atendiendo** | Recibe cada mensaje, decide si responde la IA, ejecuta flujos, dispara automatizaciones y guarda el historial. **Consume créditos.** |
| **Agente de voz** | Contesta y hace llamadas con voz. **Consume créditos.** |
| **Seguimientos automáticos** | Vuelve a escribirle al lead que se quedó callado. |
| **Recordatorios y campañas** | Manda lo programado a su hora. |
| **Disparadores de conversación** | Ejecuta lo configurado cuando pasa algo en un chat. |
| **Automatizaciones por etapa** | Reacciona cuando un lead cambia de etapa. |
| **Reparto automático de conversaciones** | Asigna los chats nuevos entre el equipo. |
| **Vigilancia de conexiones** | Detecta que una línea se cayó y avisa por WhatsApp. |
| **Facturación diaria** | Cobra, suspende y elimina cuentas vencidas, y anota quién renovó. |
| **Seguimiento de prueba gratis** | Escribe cada día a quien está probando. |
| **Informe semanal** | Resume la semana y lo manda. **Consume créditos.** |
| **Renovación de créditos** | Repone la bolsa al confirmarse un pago. |
| **Avisos de vencimiento** | La víspera y el día, para tareas y tickets. |
| **Limpieza** | Borra mensajes de más de 90 días, registros viejos y archivos caducados. |
| **Modo Dueño por WhatsApp** | Las órdenes que el dueño le escribe a su propio número. |
| **Pagos** | Recibe el aviso de la pasarela y reactiva la cuenta sola. |

---

# PARTE 5 — Existe en el código, pero sin pantalla o a medias

Lo que está construido y hoy no se puede usar, o no hace lo que su nombre dice.

| Qué | Ruta | En qué estado está |
|---|---|---|
| **Tablero principal** | `/dashboard` | Muestra un cartel de "en construcción". No hay contenido. |
| **Código QR** | `/qr` | La pantalla existe y está vacía: no pinta nada. |
| **Clientes (antigua)** | `/clientes` | Reemplazada. Solo muestra la palabra "deprecated". |
| **Herramientas del panel** | `/panel/tools` | Marcador de posición: muestra el texto "pageTool". |
| **Créditos del cliente** | `/credits` | No muestra créditos: muestra una oferta de dos planes (PYMES y BUSINESS) con botones que abren WhatsApp para pedir la actualización. |
| **Herramientas** | `/tools` | Muestra exactamente la misma oferta de planes que la pantalla anterior, no una lista de herramientas. |
| **Herramientas 1 a 5** | `/tools/tool-1` … `-5` | Funcionan solo si el administrador les pegó una dirección. Sin ella, la pantalla devuelve al índice sin decir por qué. |
| **Panel del revendedor** | `/reseller-panel` | Se puede asignar como módulo, pero no tiene portada propia: solo sirve de contenedor y lleva al primer apartado. |
| **Ruta sin destino** | `/with-out-route` | Aparece comentada en la lista de rutas asignables. No existe la pantalla. |
| **Envío suelto de mensaje** | `/messages` | Una caja para mandar un WhatsApp escribiendo el número a mano. Es una utilidad mínima, sin historial ni lista. |
| **Catálogo del panel** | `/panel/catalogo` | La pantalla existe y funciona (es la misma que "Mi catálogo"), pero no está en la lista de rutas asignables: solo se llega escribiendo la dirección. |
| **Funciones del creador visual** | `/panel/workflow-features` | Igual: funciona, pero no se puede crear como módulo. Solo se llega por la dirección. |
| **Guía de Meta** | `/documentation/meta` | Igual: existe y no es asignable. |
| **Asistente de chat interno** | (carpeta sin pantalla) | Hay un asistente de chat construido —componentes, servicios y estado— del que solo se usa hoy una pieza suelta. No tiene pantalla propia. |
| **Alta por Meta en un clic** | (sin pantalla) | El camino de conexión automática con Meta está construido y completo —ventana emergente, intercambio de credenciales y elección del número—, y **ninguna pantalla lo usa hoy**: no se llega a él desde ningún sitio. |

---

## Resumen en una tabla

| Bloque | Módulos | Se activan por Panel › Módulos | Consumen créditos |
|---|---|---|---|
| Atención | Agente IA, Conexiones, Chats, Leads, Etiquetas | Sí | Agente IA siempre; Chats solo al transcribir o pedir respuesta sugerida |
| Ventas | CRM, Productos, Catálogo, Cotizaciones, Campañas, Recordatorios | Sí | CRM en sus funciones de IA |
| Automatización | Flujos, Creador visual, Diagramas, Macros, Respuestas rápidas | Sí | No |
| Agenda | Agenda, Reservas con equipo | Sí (uno u otro) | No |
| Trabajo interno | Tareas, Proyectos, Tickets, Documentación, Notas, Actividad del equipo | Sí (Documentación se asigna a mano) | No |
| Comunicación interna | Chat de equipo, Llamadas, Reuniones | Se asignan a mano | Solo al transcribir |
| Grabación de reuniones | Grabaciones | Módulo aparte, se vende por separado | Al transcribir y resumir |
| Dinero | Finanzas, Cobros | Finanzas sí; Cobros se asigna a mano | No |
| Equipo | Equipo, Pipeline de asesores | Sí | No |
| Datos | Datos externos, Base de conocimiento, Formularios | Sí | No |
| Embebidos | Copiloto, Canva, Multiagente, Google, Herramientas 1-5, Integraciones | Sí | No |
| Creatividad | Generador de anuncios | Sí | No (clave propia del cliente) |
| Administración | Panel completo | Por rol | No |
