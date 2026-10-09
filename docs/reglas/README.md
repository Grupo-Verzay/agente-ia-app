# Reglas y aprendizajes del proyecto — índice

Cada archivo reúne las reglas de un tema, con el porqué de cada una. Busca
con `grep -n "^## " docs/reglas/<tema>.md` y lee solo la sección que necesites.

Los aprendizajes nuevos se añaden aquí (en el tema que toque), nunca en un `CLAUDE.md`.

## [Proceso de trabajo: PRs, maquetas y cómo reportar](proceso-de-trabajo.md) — 5 reglas, 4 KB

- Los PR se abren LISTOS para revisión, nunca en borrador
- Las maquetas se enseñan en el HILO, nunca en el dominio real
- Un `import` que no existe se caza sin esperar al build
- El entorno de los agentes NO es un contenedor de Portainer
- Cómo reportar al terminar

## [Infraestructura, build y despliegue](infraestructura-y-despliegue.md) — 21 reglas, 76 KB

- El build borraba los avisos: `removeConsole`
- Muchas peticiones pequeñas son turno, no trabajo
- Dentro del servidor son turnos, no tandas
- Una recarga tiene que decir por qué
- "Salir" es un viaje, no tres, y se ve que está saliendo
- Una línea muerta no tiene filas: se cuenta desde `Instancias`
- Salud del envío: un envío automático que falla deja rastro, o no ha fallado
- Next: no bajar de 14.2.25, y cómo comprobarlo
- Una consulta que devuelve una página tiene que poder PARARSE
- Un abandono sin motivo es «Procesando…» para siempre
- Mudar un servicio de servidor: el certificado va DESPUÉS del DNS, y no se reintenta solo
- Una pantalla de fuera de `(root)` nace SIN poder desplazarse
- La App va a DOS réplicas; el backend a UNA, y la diferencia no es de tamaño
- La pantalla en blanco: `app/global-error.tsx` no existia, y sin el no hay NADA
- Un despliegue que cuelga de UN aviso de GitHub no tiene red
- Pendientes
- 1. El stack pisa el healthcheck de la imagen, y con los valores malos
- Cerrados
- Una cadena de tres servicios sin red debajo se cae con cualquier redespliegue
- Un `fetch` SIGUE las redirecciones, así que el middleware puede tragarse un aviso entero
- El DDL de arranque mira el catálogo primero y nunca espera un candado

## [Seguridad, permisos y alcance entre cuentas](seguridad-y-permisos.md) — 23 reglas, 113 KB

- Toda acción y toda ruta comprueban de quién es el dato
- La configuración de la PLATAFORMA es de la casa, y lo dice UNA puerta
- Las notas son de la PERSONA, no de la cuenta
- El equipo entra por su cartera, no por su rol
- El administrador de una cuenta actúa POR la cuenta
- Mis datos se lee y se guarda con la CUENTA ACTIVA
- Diagramas: si no se puede guardar, no se puede tocar
- «Súper administrador» es la PERSONA, y pasa por encima de todo
- Lo que se LEE por persona se ESCRIBE por persona
- Mudar a una persona de cuenta: su id NO cambia, y por eso se mueve poquísimo
- Usuarios: un cliente vincula SUS cuentas con la contraseña de la cuenta a vincular
- Clientes: «¿gestionas a este?» y «¿qué rol le pones?» son dos preguntas
- Clientes de reseller: el nivel lo da SU LICENCIA, no un campo suelto
- Analíticas: una cuenta administradora es de la CASA, no un cliente
- Enseñar un panel y dejar pasar a su ruta son dos preguntas
- El CRM de la familia: la URL limpia significa TODAS
- El alcance del CRM va HACIA ABAJO: la familia no es un alcance
- Ninguna puerta sube: «Ingresar», el conmutador y `assertCanAccessTargetUser`
- La bandeja de Chats también va HACIA ABAJO: líneas, rutas, otra línea, notas y tiempo real
- Enviar por un canal (Meta, Telegram) pide que la línea sea tuya o de abajo
- Una clave de IA no viaja al navegador: ni la del cliente, ni la de la casa
- La clave del servidor de WhatsApp no viaja al navegador, nunca
- Copiloto: `?u=` no puede ser código, y los dos botones se miden contra el COPILOTO

## [Cobros, créditos de IA, planes y facturación](cobros-creditos-y-planes.md) — 23 reglas, 114 KB

- Renovación mensual: una columna que se pisa no tiene historia
- Notas de voz: se paga por MINUTO y el contador mide TOKENS
- Clientes: «activo» es cuenta habilitada Y servicio al día
- Cobros: la cartera de una cuenta NO es el cobro de la plataforma
- El saldo de una cuenta lo lee UNA regla, y la App y el motor tienen que decir lo mismo
- Quién paga la IA se PREGUNTA, no se marca
- `ia_credits.used` está en TOKENS y `total` en CRÉDITOS, a propósito
- Los créditos se reponen AL PAGAR, y el cupo se lee de Panel › Planes
- Un ciclo pagado es UNA escritura, y los cuatro caminos pasan por ella
- Vencimientos: un DÍA, no un instante, y quien lo juzga es uno solo
- Chats: el SENTIMIENTO del cliente se analiza al ABRIR Chats, y lo paga la cuenta dueña
- Todo uso de IA lo paga la cuenta DUEÑA de lo que se analiza
- La página de un plan (`/planes/<plan>`) se arma EN VIVO del panel de Planes
- Planes: el nombre es UNO por nivel, y la dirección lleva el NIVEL sin la modalidad
- La página de un plan: «Qué incluye» es un acordeón, y todos los bloques miden lo de la landing
- La página de un plan: la guía se DESPLIEGA dentro, «Qué incluye» nace plegado, y la landing sin franjas
- La página de un plan: de entrada las DESTACADAS, la guía sin video y con el tema de la App, e «Inicio» arriba
- La página de un plan: «Ver todas» en el orden del editor, y abrir la guía no mueve la página
- La página de un plan: «Todo incluido, sin sorpresas» va a la vista, entre las preguntas y el precio
- Planes: UNA plantilla maestra de funciones por audiencia, y cada plan solo enciende y destaca
- Créditos: una cuenta sin pagar NO recibe créditos, y editar a mano no adelanta la renovación
- Perfil › «Plan y facturación»: la prueba se decide como en el panel, y los planes van en «Cambiar plan»
- Transcribir con la clave PROPIA del cliente: siempre la de OpenAI, y su error se dice

## [Finanzas](finanzas.md) — 3 reglas, 19 KB

- Finanzas de la familia: se elige qué se suma, y sumar monedas distintas NO
- Finanzas: «Compras» abre una COMPRA, con el proveedor de la lista
- Finanzas: un fondo claro FIJO necesita su tono de modo oscuro

## [Proyectos y tareas](proyectos.md) — 3 reglas, 32 KB

- Proyectos: medir el trabajo, y las tres cosas que no estaban guardadas
- Proyectos: un aviso que espera es un aviso que no llega
- Proyectos compartidos: un proyecto, un juego de tareas

## [Chat de equipo](chat-de-equipo.md) — 6 reglas, 93 KB

- Chat de equipo: un hilo por CUENTA, y el aviso es el que ya existía
- Chat de equipo: en una fila de mandos, dos cosas distintas NO llevan el mismo glifo
- Chat de equipo: CANALES y DIRECTOS, no un hilo único
- Chats → equipo: la conversación se SEÑALA, no se cuenta
- Chat de equipo: limpiar un historial, un puesto que cambia de ocupante, y el orden de los directos
- Chat de equipo: se vuelve al canal donde se estaba

## [Videollamadas, salas y Reuniones](videollamadas-y-reuniones.md) — 19 reglas, 143 KB

- Videollamada y SALAS: la misma llamada, más gente y más pistas
- Reuniones: un módulo de la CUENTA, y la sala se soltó del canal
- La conexión viva cuelga del LAYOUT, no de la ruta ni de la conversación
- Reuniones: TRES tamaños, y la pantalla completa se pide DENTRO del clic
- Reuniones: volver después de un corte, y grabar lo que se dijo
- Reuniones: las grabaciones son su PROPIA pestaña, con miniatura
- Reuniones: el video llena la CAJA, y los mandos flotan y se apartan
- Reuniones: moderar donde se mira, y que la puerta SUENE
- La sala usable: quien habla en grande, fondo, mano, chat y moderación
- Agenda: la videollamada con IA (Tavus) es un MODO al lado del enlace fijo
- Agente IA › Videollamadas: se entrena IGUAL que Llamadas
- Videollamada: «Verzy, yo sigo desde aquí» lo decide la SALA, y la pantalla cambia sin esperar
- Videollamada: Verzy en grande SOLO al presentarse, y la llamada tiene un límite de minutos
- Videollamada: con pantalla compartida los mandos se esconden solos
- Videollamada: la pantalla compartida llena la sala, y los mandos y la miniatura son UNA barra
- Videollamada: Verzy apunta en la pestaña «Notas» del chat, y un fallo de carga no se ve
- Videollamada: la pantalla compartida se ve ENTERA, va rápida y a la ruta exacta
- Videollamada: sin páginas de error, el dispositivo del cliente, y el video crece al esconder los mandos
- Videollamada: la GRABA la sala del cliente, y llega al detalle de CRM › Llamadas

## [Llamadas de voz, llamadas con IA y CRM › Llamadas](llamadas.md) — 19 reglas, 121 KB

- Llamadas de voz: la señalización va por la BASE, no por un socket
- La llamada del directo nace en VOZ o en VIDEO, y se SUBE solo si el otro acepta
- La llamada de WhatsApp: el fin lo dice el AUDIO, y la tarjeta no bloquea
- La ventana de llamada: arranca PLEGADA, y no se puede perder
- Llamadas: se llama con el número de la línea, no con el de quien mira
- La llamada con IA: lanzarla y GRABARLA son dos mitades, y una no existía
- El asistente de voz: el prompt es de la CUENTA, el contexto es de la CONVERSACIÓN
- Llamar y llamar con IA: una barra, y un MENÚ en vez de un segundo botón
- La llamada termina y la plataforma no se entera: el fin lo AVISA AstraCalls
- CRM › Llamadas: la barra es la de Leads, y marcar vive en una ventana
- «Llamar con IA» como SEGUIMIENTO: una sola puerta, y el prefijo se quita entero
- CRM › Llamadas: el detalle usa la nota de voz de Chats, y los turnos solo si el texto los trae
- Llamadas se alinea con Leads: una fila de mandos, un tamaño y el número en azul
- Llamadas y Leads, simétricas: el texto se HEREDA, «Marcar resultado» siempre, y flechas en las dos
- CRM › Llamadas: cinco arreglos en la misma pantalla
- Llamadas: la cuenta es «● Ventas» junto al nombre, no una columna
- Una llamada es de la cuenta DUEÑA de la conversación, no de quien mira
- La llamada con IA: el enlace no se manda dos veces, y no se llama dos veces
- El cupo de llamadas: un sitio que solo se libera cuando todo sale bien no es un cupo

## [CRM: embudos, agenda, tickets, calidad y equipo](crm-embudos-agenda-equipo.md) — 21 reglas, 143 KB

- Un grupo TIENE ficha, y toda consulta de CRM la excluye
- Escalar a una persona: dos puertas, un solo camino
- Tickets: el WhatsApp sale al PASAR a resuelto, no al estar
- Actividad del equipo: una fila es un CUBO, no un latido
- Borrar los seguimientos de un número es borrarlos en SU cuenta
- Calidad de conversaciones (CRM › Calidad) y exportar conversaciones
- Recordatorios: salen a SU hora, en la zona de la CUENTA, y una cita siempre los programa
- La Agenda de la familia: las CITAS bajan, la configuración se queda
- Embudos: la conversación va al embudo de SU ASESOR, y eso no se guarda
- Embudos: la etapa se cambia DESDE EL CHAT, y es la misma puerta
- Embudos: el tablero de OTRA cuenta, y todos los asesores juntos
- Embudos: siete etapas, tres del SISTEMA, y vaciar Perdido SELLA
- Embudos: una columna del tablero es una ETAPA, y nada más
- Lo que crea un asesor es SUYO: etiquetas y respuestas rápidas
- Agenda: «Reagendar» mueve la MISMA cita y rehace sus recordatorios
- La encuesta de satisfacción (NPS): se cuelga de RESOLVER, y la respuesta se va a BUSCAR
- Notas internas: una hija puede mencionar a los administradores de su MADRE, solo para avisar
- Equipo: la auto-asignación tiene TRES modos, y «Por porcentaje» es un contador continuo
- Equipo: los interruptores «Sesión» y «Agente» de cada asesor
- Equipo: los interruptores NUNCA le quitan los chats al asesor
- Equipo: el interruptor «Ver número» deja a UN agente ver el número completo

## [Agente IA, flujos, prompts y entrenamiento](agente-ia-y-flujos.md) — 11 reglas, 36 KB

- Agente: «Agregar caso» y «Agregar transición» escriben en el BLOQUE del paso
- Agente: una prohibición que no viaja en el prompt no existe
- El Robot no es el webhook
- Un saliente automático lo escribe QUIEN LO MANDA, no el eco del proveedor
- Flujos: una vez por conversación, salvo que el dueño abra REPETICIONES
- El prompt maestro: el global, o el PROPIO de la cuenta si el dueño se lo escribió
- AI imágenes: el COPY sale de la RED de la vista previa, y se escribe con la misma clave
- Flujos: el «Menú con botones» es el MISMO paso que el de texto, entregado de otra forma
- Flujos: lo que cuelga de un seguimiento sale CON el seguimiento, y un menú ahí espera
- Entrenamiento › Cotizaciones: la App DECIDE y arma el PDF, el backend lo MANDA o escala
- Flujos: cambiar el tipo es escribir el nuevo y QUITAR los otros dos

## [Guías públicas (`/guia/<módulo>`)](guias-publicas.md) — 23 reglas, 159 KB

- Documentación pública: `/guia/<módulo>`, generada desde la App real
- La decimoquinta guía, Finanzas: el resumen y sus seis pantallas, y lo que se arregló al documentarlas
- La decimosexta guía, Mis datos: una hoja de Google FINGIDA, y la pantalla arreglada
- La decimoséptima guía, Llamadas: llamar, el historial y sus ventanas, sin llamar a nadie
- La decimoctava guía, Productos: y documentarla destapó productos que nacían agotados
- La decimonovena guía, Crear flujos: la lista Y su editor, y las pastillas ahora filtran
- La vigésima guía, Agenda: el calendario, la página pública y sus ocho pestañas
- La vigesimoprimera guía, Recordatorios: lo que se arregló al documentarla
- La vigesimosegunda guía, Etiquetas: el tablero y su Gestionar, y el filtro que no se quitaba
- La vigesimotercera guía, Conexión y Ajustes: una pantalla, ocho pestañas, un apartado por pestaña
- La vigesimocuarta guía, Chats: la pantalla más completa, y la llamada que caía en otro chat
- La vigesimoquinta guía, Correos: los buzones son de MENTIRA, y nada se envía
- La vigesimosexta guía, Follow-ups IA: el asistente del sintetizador, la clasificación y los follow-ups por estado
- La vigesimoséptima guía, Mis tareas: y la cifra y la lista no decían lo mismo
- La vigesimoctava guía, Multiagenda: la agenda de un equipo, y la reserva pública que pedía sesión
- La vigesimoctava guía, Campañas: y documentarla destapó campañas que no hacían lo que decían
- La trigésima guía, Embudos: el tablero, sus siete etapas y la papelera de Perdido
- La trigesimoprimera guía, Cobros: la cartera, sus tres avisos y nada que se cobre de verdad
- La trigesimoprimera guía, Calificación: el tablero por etapa, y los rangos de puntaje son UNO
- La vigesimonovena guía, Informes: trece secciones plegables, y el buscador que no buscaba
- La guía de Proyectos: la lista, el tablero y la ventana de una tarea
- La trigesimosegunda guía, Reportes: el resumen semanal, lo que la IA no supo y la Calidad
- Las guías (`/guia/*`) siguen el tema de la App, con tokens `--guia-*`

## [Documentación interna, notas, carpetas y formularios](documentacion-interna.md) — 12 reglas, 90 KB

- Documentación: lo que se menciona tiene que poder ENCONTRARSE
- Compartir: hay TRES implementaciones, y esto no añadió la cuarta
- Documentación: las CARPETAS, y por qué la pertenencia no es una columna
- Carpetas: ordenan la pantalla, no viven dentro de la cosa
- La campana: nueve pastillas, y tres fuentes nuevas que NO son un aviso nuevo
- Documentación: flecha de regreso, orden propio arrastrando, y una barra
- Documentación › Actualizaciones: publicar y que salte UNA vez a cada persona
- Documentación es un apartado del panel: lleva su barra, como Embudos
- Mis notas: archivar y desarchivar son UN botón con dos caras
- Mis notas: la pantalla, arreglada al documentarla
- La nota rápida: un papel por PERSONA, que se guarda solo
- Mis formularios: el formulario público es PÚBLICO, y las reglas viven en un sitio

## [Páginas públicas, propuestas y /demo](paginas-publicas-y-propuestas.md) — 5 reglas, 28 KB

- Propuestas comerciales: el enlace sale POR LA LÍNEA de la propuesta, y el contacto no se publica
- Las tres públicas llevan UN pie: el mismo texto, la raya al ancho del contenido y el aire de entre bloques
- El vídeo de ventas (`/demo`): el panel es la App de VERDAD, y lo demás lo dice
- La propuesta pública: el precio dos veces, la cuadrícula sin huecos, sin la guía del Agente IA, y el video se compacta
- Propuestas: el saludo de envío por WhatsApp es de la CUENTA, y el modal se llama «Configuración»

## [Canales, líneas, proveedores (Evolution/Waha/Meta) y Correo](canales-lineas-y-correo.md) — 15 reglas, 84 KB

- El sufijo de dispositivo: en SQL en crudo la columna es la de la BASE
- Una línea es UNA instancia; el proveedor es un ajuste suyo
- El primer mensaje a un lead guardado a mano: el número va LIMPIO, y Waha confirma a quién
- Un contacto sin número (`@lid`) se llama y se contesta por su `@lid` ENTERO
- Conexión: el canal se llama igual; el proveedor solo se nombra al cambiarlo
- Conexión: los canales de credenciales, un botón y una sola tarjeta
- "Escribiendo…" hay que pedirlo dos veces
- La salida es la línea de la CONVERSACIÓN, y se resuelve AL ENVIAR
- El proveedor sale de la FILA, no del parámetro
- Evolution esconde el motivo en `response.message`
- El texto roto no se arregla en la conexión: ya está en los caracteres
- Una lista de líneas sale de `Instancias`, no de las credenciales de quien mira
- Rellenar el historial de una línea: no duplicar y no partir la conversación
- Correo: un canal APARTE de Chats, y de UNA persona
- Grabar una nota de voz AHÍ MISMO: un grabador para las seis pantallas que suben audio

## [Interfaz: barras, paneles, diálogos y maquetación](ui-componentes-y-maquetacion.md) — 14 reglas, 97 KB

- La barra de una lista no se pinta a mano: `BarraDeAcciones`
- Las métricas van en la BARRA, no en tarjetas encima de la lista
- La barra de pestañas se corta: flechas, y la activa se trae sola
- Los paneles laterales: UNA medida para toda la plataforma
- Un hilo se abre por el final, y no se mueve solo
- La barra de escribir es UNA, y lo que la forma vive fuera de las dos pantallas
- Un `opacity-0` no libera sitio: el hueco sigue ahí
- La X de un diálogo va a 16 px del BORDE, con el relleno medido
- Un diálogo tiene UNA altura, y el aire se resta en `rem`
- El menú lateral se comprime solo al entrar a CUALQUIER sección
- Lo que se abre DENTRO de un flotante va encima de él, y la ✕ se esconde con `hideCloseButton`
- Los botones del borde: el copiloto es el EJE, y la nota rápida
- Chats y Correos: el panel vacío es UNO, y una barrita arriba alterna entre las dos
- El menú lateral: el numerito de pendientes va por la RUTA, esté donde esté el apartado

## [Chats: bandeja, tiempo real, carga y rendimiento](chats-bandeja-y-tiempo-real.md) — 22 reglas, 70 KB

- Chats: el reloj responde, el tiempo real solo adelanta
- Chats: las marcas de tiempo, siempre en segundos
- Chats: nada que detecte un fallo puede ir detrás de algo que falle
- Chats: un fallo de segundos no puede costar medio minuto
- Chats: agotar la espera no es tirar la respuesta
- Chats: resincronizar historial NO es novedad
- Chats: la pausa busca por TODAS las identidades
- Chats: las sesiones no vuelven al reloj de la lista, y la agenda no se sube
- Chats: lo que se cambia desde la conversación abierta pinta SU fila al momento
- Chats: la sesión se busca por su id, no por el número
- Chats: "Cargar mensajes anteriores" también necesita plazo
- Chats: un mensaje entrante deja el chat SIN LEER, y solo lo limpia ABRIRLO
- El número en la PESTAÑA: solo lo que exige respuesta
- Chats: `contact.aliases` NO son todas las identidades
- Chats: de qué chat viene lo dice `remoteJid`, no el primer teléfono que aparezca
- Chats: buscar la fila por TODAS las identidades
- Chats: el buscador también busca DENTRO de los mensajes, y por fecha
- Chats: el filtro de canales tiene que sumar
- Chats: la bandeja estaba topada en 300, y no lo decía
- Chats: la bandeja NO espera a crear las fichas que faltan
- Chats: la lista es grande, no rehacerla por gusto
- Chats: la regla de la lista no se recalcula al hacer scroll

## [Chats: fichas, marcas, borrado, etiquetas y acciones](chats-datos-y-acciones.md) — 23 reglas, 85 KB

- Chats: la ficha de contacto se LEE y se GUARDA por la misma puerta
- Chats: la nota interna es la vista previa si es LO ÚLTIMO
- Chats: la ficha de la conversación abierta es la de SU LÍNEA
- Chats: la marca de borrado va bajo TODAS las identidades
- Chats: archivada y resuelta vuelven solo cuando escribe el CONTACTO
- Chats: «Bloqueados» y «Silenciados» son marcas del CONTACTO, y bloquear no se levanta solo
- Chats: borrar en bloque es MARCAR ya y purgar de fondo
- Chats: eliminar deja una LÁPIDA, y nada reescribe lo eliminado
- Chats: las etiquetas de una conversación son las de SU línea
- Chats: el panel de filtros ofrece etiquetas y embudos de UNA cuenta
- Chats: los Atajos de una conversación son los de SU línea
- Chats: quitar un mando de la fila NO quita su dato
- Chats: el idioma del cliente se DETECTA, y la traducción va sola
- Chats: la reacción del CLIENTE se cuelga de su mensaje, como la nuestra
- Chats: reenviar un mensaje es el MISMO envío, a otra conversación
- Chats: una ubicación compartida es una TARJETA con mapa, como un documento
- Chats: el formato es de WhatsApp, no markdown
- Chats: el editor de la foto es un paso opcional, no el camino
- Chats: «Compromiso detectado» se quitó; «Promesa del cliente» NO
- Chats: la campanita, la barrita de formato y resolver en lote
- Chats: el contexto del lead, el recordatorio y la tarea son barra lateral
- Chats: mencionar a un compañero le ABRE esa conversación, y resolver se la cierra
- Chats: lanzar un flujo A MANO también marca la fila

## [Chats: interfaz de la lista, la cabecera y los paneles](chats-interfaz.md) — 19 reglas, 99 KB

- Chats: un PADDING no encoge; un hijo del flex sí
- Chats: la barra de la lista se QUEDA; el ancho sale de las pastillas
- Chats: el menú de Acciones no puede crecer con el equipo
- Chats: dónde nace un panel flotante lo decide UNA función
- Chats: Macros y Acciones no se van nunca; las pestañas se pliegan en «Más»
- Chats: un ancho COMÚN para los paneles, y las dos filas por sus dos extremos
- Chats: los paneles laterales se mueven IGUAL, y un cambio es un RELEVO
- Chats: UN panel a la vez, todos por la derecha, y los menús cuelgan de SU botón
- Chats: el panel de la derecha es la TERCERA columna, no una hoja sobre la ventana
- Chats: las tres barras de escribir y los pies fijos son UNO
- Chats: todo lo flotante mide el hueco y elige el lado donde CABE
- Chats: la línea de estado va DENTRO de los 32 px de la fila del nombre
- Chats: ninguna pastilla de la fila es más estrecha que alta
- Chats: el renglón de pastillas MIDE su hueco, y un tope no puede hacerlo
- Chats: «Sin clasificar» no es un dato, así que no gasta una pastilla
- Chats: los dos desplegables de la cabecera se leen igual, y en MAYÚSCULA
- Chats: los controles de la cabecera, a UNA separación; y la marca abre la fila
- Chats: los iconitos de la fila los elige cada PERSONA, en Apariencia
- Chats: el estado de la sesión es UNA pastilla que ES el interruptor
