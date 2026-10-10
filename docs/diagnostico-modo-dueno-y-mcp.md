# Diagnóstico: Modo Dueño hoy y qué falta para ampliarlo y exponerlo como MCP

10 de octubre de 2026 · Fase 1 del encargo «Evolución del Modo Dueño + exposición como MCP».
Solo lectura: no se tocó código. Repos revisados: `agente-ia-app` (App), `api-webhook`
(Backend) y `astracalls` (Llamadas).

---

## Resumen para decidir

- El Modo Dueño **ya existe y funciona por texto y audio de WhatsApp**: 20 herramientas
  (10 de consulta, 10 de acción). Por llamada y videollamada **no existe**: si el dueño
  llama, le contesta el bot de ventas como a cualquier cliente.
- El motor de acciones vive en la App (`lib/owner-commands.ts`, `lib/owner-training.ts`,
  rutas `/api/owner/*`); el Backend solo pone el razonamiento (LangGraph) y llama a esas
  rutas. Esa separación es buena base para reutilizarlo en llamadas y en el MCP.
- Las cinco reglas de gobernanza del encargo **no se cumplen hoy**:
  1. Confirmación: tareas y recordatorios se ejecutan sin confirmar, y la confirmación
     vive en memoria y se dispara con «ok pero…».
  2. Reversión: solo existe para el entrenamiento del agente (prompt).
  3. Bitácora: solo se apuntan las escrituras, sin el texto exacto, y sin saber cuál de las
     personas autorizadas dio la orden.
  4. Plan: no hay ningún control por plan/módulo en el Modo Dueño (y los candados del panel
     solo bloquean en pantalla, no en el servidor).
  5. Alcance de cuenta: sí se respeta (todo filtra por la cuenta).
- No hay ningún MCP ni tokens de acceso por persona: todo acceso externo usa secretos
  compartidos del servidor.
- Recomendación: **primero endurecer la base común** (confirmación persistente, bitácora con
  reversión, control por plan en servidor, identidad), luego ampliar texto/audio, y en
  paralelo el MCP sobre el mismo motor. Llamadas después; videollamada al final.

---

## 1. Cómo está implementado hoy

### Interruptor y datos

- Pantalla: `/profile` → pestaña «Comportamiento» → «Funciones avanzadas»
  (`app/(root)/profile/_components/UserInformation.tsx:1029-1040`), tarjeta
  `OwnerModeToggle.tsx` («Modo Dueño por WhatsApp», `:141`, interruptor `:149`).
- Permite hasta **5 personas autorizadas** (nombre, número, rol; `MAX_OWNERS=5` en `:21`,
  límite solo de pantalla, el servidor no lo hace cumplir).
- Acciones de servidor: `actions/owner-mode-actions.ts` (`setOwnerModeEnabled :55`,
  `saveOwnerPeople :75`). Pueden cambiarlo la propia cuenta o un admin/super_admin/reseller.
- Base de datos (modelo `User`):
  - `ownerModeEnabled` (`owner_mode_enabled`).
  - `ownerModePhone` (`owner_mode_phone`): JSON `[{name,phone,role}]` o formato antiguo con
    números separados por comas (`lib/owner-contacts.ts`).
  - Si la lista está vacía se usa `notificationNumber`.
- Interruptores globales por entorno: `OWNER_MODE_ENABLED`, `NEXTJS_URL` y
  `OWNER_COMMANDS_KEY` (Backend); `OWNER_COMMANDS_KEY` (App). El middleware deja pasar
  `/api/owner` sin sesión; cada ruta se autentica sola (`lib/owner-command-auth.ts`).

### Flujo de un mensaje del dueño

1. Llega a `WebhookService.processWebhook` (`api-webhook/src/modules/webhook/webhook.service.ts:1081`),
   igual que cualquier mensaje: Evolution, Waha, Meta o Telegram.
2. Antes del Modo Dueño hay salidas tempranas: grupos, estados, `@lid` sin resolver,
   **«Robot» de la línea apagado** (`:1528-1592`) y **cuenta sin clave de IA** (`:1631`).
   En cualquiera de esos casos el Modo Dueño no responde.
3. `isOwnerMessage` (`ai-agent/owner/owner-agent.service.ts:119-138`) decide con prioridad
   máxima, antes del puente de operador, del registro de lead, de los créditos, del
   antiflood y del buffer (`webhook.service.ts:1639-1690`).
4. El texto y el audio pasan por el mismo extractor que los clientes
   (`message-type-handler.service.ts:243`):
   - Las notas de voz se transcriben con Whisper (`whisper-1`, español) si el proveedor es
     OpenAI; con otro proveedor van al modelo de chat como audio
     (`ai-agent.service.ts:5407-5484`).
   - Las imágenes se describen con el LLM.
5. `OwnerAgentService.handle` (`:145-267`):
   - Agente LangGraph `createReactAgent`, con el proveedor y modelo de la cuenta (solo
     OpenAI o Google), `recursionLimit: 20`.
   - Prompt fijo `owner-agent.prompt.ts`.
   - Cada herramienta hace POST a `${NEXTJS_URL}/api/owner/*` con el Bearer compartido.
     El `userId` y el teléfono los pone el servidor, no el modelo.
6. La respuesta sale por la misma línea, se guarda en el historial y termina. El dueño nunca
   se trata como lead.

## 2. Qué puede consultar y ejecutar hoy

Herramientas en `api-webhook/src/modules/ai-agent/owner/owner-agent.service.ts:302-704`. La
lógica está en `agente-ia-app/lib/owner-commands.ts` y `lib/owner-training.ts`.

**Consulta (se ejecutan al momento, no se apuntan en bitácora)**

| Herramienta | Qué devuelve |
| --- | --- |
| `owner_resumen_dia` | tareas pendientes, tareas de hoy, citas de hoy |
| `owner_listar_citas` | citas de hoy o próximas (cliente, hora, servicio, estado) |
| `owner_listar_tareas` | tareas pendientes o de hoy |
| `owner_listar_leads` | leads por estado (FRIO/TIBIO/CALIENTE/…) |
| `owner_listar_conversaciones` | recientes o sin responder |
| `owner_listar_productos` | catálogo |
| `owner_listar_pagos` | ingresos o gastos |
| `owner_buscar_contacto` | por teléfono o nombre (fija el «contacto activo») |
| `owner_ver_entrenamiento` | instrucciones actuales del agente |
| `owner_listar_revisiones_entrenamiento` | versiones guardadas del entrenamiento |

**Acciones sin confirmación**
- `owner_crear_tarea`.
- `owner_crear_recordatorio`: es una tarea interna de tipo «Recordatorio», **no** un
  recordatorio que se le envía a un cliente.

**Acciones con confirmación «sí/no»**
- `owner_enviar_mensaje`: envía a un cliente por la línea de la cuenta.
- `owner_mover_lead`: cambia el estado del kanban de leads. Ver el fallo probable en §7.
- `owner_etiquetar_contacto`.
- `owner_asignar_asesor`: no dispara las automatizaciones del asesor.
- Entrenamiento: `owner_agregar_instruccion_entrenamiento`,
  `owner_editar_instruccion_entrenamiento`, `owner_eliminar_instruccion_entrenamiento`,
  `owner_restaurar_entrenamiento`.

**No existe hoy**
- Flujos ejecutados.
- Disparar flujos.
- Campañas o envíos masivos.
- Recordatorios a clientes.
- Mover tarjetas de los **embudos** (las tablas `embudos*` son distintas del kanban de
  estado de lead).
- Precios y productos (solo se pueden leer).
- Frases automáticas.
- Ajustes del comportamiento.
- Módulos y permisos.
- Créditos y plan.
- Llamadas salientes.

## 3. Cómo se valida que quien escribe es el dueño

- **Texto y audio**:
  - Se toman los dígitos del JID del remitente y se comparan con la lista
    `ownerModePhone` (o con `notificationNumber` si la lista está vacía). La regla es
    `phonesMatch`: igualdad exacta **o los últimos `min(largoA, largoB, 10)` dígitos
    iguales**, con un mínimo de 7.
  - La App repite la misma comprobación en cada ruta (`guardOwnerRequest`,
    `lib/owner-command-auth.ts:127-162`) y filtra todo por la cuenta.
- **Debilidades**:
  - La coincidencia por sufijo deja entrar a un número de otro país con los mismos
    últimos 10 dígitos, o con solo 7 si se guardó un número corto.
  - El segundo factor (PIN) está diseñado en `docs/modo-dueno-integracion-nestjs.md` pero
    **no está construido**.
  - Si el número llega como `@lid` y no se resuelve, el dueño no se reconoce y se trata
    como cliente.
  - En grupos no funciona.
- **Llamadas y videollamadas: no hay ninguna validación de dueño.**
  - `handleCallEvent` (`webhook.service.ts:780-853`) solo apunta la llamada perdida.
  - El voicebot (`api-webhook/src/modules/voicebot/*`) siempre usa el prompt de ventas.
  - AstraCalls no tiene el concepto de dueño de cuenta: su `Owner` es el navegador que
    tomó la llamada.

## 4. Versionado del system prompt

- Tablas compartidas por App y Backend:
  - `AgentPrompt` guarda el prompt vivo (`sections`, `promptText`, `status`, `version`,
    que es solo un contador).
  - `AgentPromptRevision` guarda las copias (`revisionNumber`, `sectionsSnapshot`,
    `promptTextSnapshot`, `publishedBy`, `notes`).
- Se crea una versión **solo al pulsar «Guardar»** (`publishPrompt`,
  `lib/entrenamiento-del-agente.server.ts:507-569`). Los parches por sección no crean
  versión.
- Tope de 5: `REVISIONES_A_CONSERVAR = 5` (`:481`):
  - `podarRevisionesAntiguas` poda después de cada publicación.
  - Además corre una limpieza diaria (`lib/prompt-revisions-cleanup.server.ts`, llamada
    desde `app/api/cron/billing`).
- Restaurar: `restoreRevision` (`:594-622`) copia `sectionsSnapshot` al borrador.
- **Fallo:** al restaurar desde la pantalla no se reconstruye `promptText`, que es lo que
  lee el Backend. El agente sigue hablando con la versión anterior hasta que alguien pulsa
  «Guardar». El Modo Dueño sí lo hace bien: restaura y republica
  (`lib/owner-training.ts:382-426`).
- `publishedBy` lo manda el navegador y no se contrasta con la sesión.
- El versionado es **exclusivo del prompt**:
  - Precios, productos, ajustes, flujos y embudos no tienen historial.
  - Lo más cercano a algo genérico es `audit_logs` (`actions/audit-log-actions.ts`). Guarda
    un resumen y metadatos, **sin la foto de antes y después**, solo para unos tipos de
    entidad (crm, cita, nota, tarea, proyecto) y se borra a los 90 días
    (`log-cleanup.service.ts`).

## 5. Roles superadministrador y administrador

- Rol de plataforma: `enum Role { user, affiliate, reseller, admin, super_admin }` en
  `User.role`.
- Rol de equipo, aparte: `User.ownerId` + `advisorRole` («agente» | «administrador») y
  `LinkedAccount` con `LinkedAccountRole`. Permisos por persona:
  `deniedModuleItems`/`grantedModuleItems`.
- Sesión (JWT): solo `id`, `role`, `plan`, `tokenVersion`. Lo demás lo resuelve
  `currentUser()` (`lib/auth.ts`):
  - Cuenta efectiva.
  - Persona real.
  - Rol de la persona frente al rol de la cuenta.
  - Si se está dentro de otra cuenta con «Ingresar» (cookie `impersonate_user_id`).
- `assertCanAccessTargetUser` (`actions/billing/helpers/app-access-guard.ts:16-101`)
  deja pasar si se cumple alguna de estas:
  - Es la propia cuenta.
  - Es el dueño del equipo.
  - Es un super_admin de verdad (`lib/super-admin-de-verdad.ts`).
  - Es una cuenta enlazada «hacia abajo».
  - Es admin o reseller dentro de su alcance (`lib/alcance-entre-cuentas.ts`). Un reseller
    además necesita la fila `reseller` del cliente.

  Nunca deja subir. **Depende de la sesión de navegador.**
- «Ingresar» a una cuenta: `impersonateUser` (`actions/auth-action.ts:213-280`).
- **No hay tokens de API por persona.** El acceso externo usa secretos compartidos:
  - `OWNER_COMMANDS_KEY`.
  - `CRM_FOLLOW_UP_RUNNER_KEY`.
  - `CRON_SECRET`.

  `ApiKey` y `verzay_api_keys` no sirven para esto: son claves de Evolution y de OpenAI.

## 6. Canales: mensajería, llamada y videollamada

| Canal | Infraestructura | IA en tiempo real | ¿Puede usar herramientas? | Modo Dueño |
| --- | --- | --- | --- | --- |
| Texto | Evolution/Waha → Backend | LangGraph por turno | Sí (20 del dueño) | Sí |
| Audio (nota de voz) | igual + Whisper | igual | Sí | Sí |
| Llamada WhatsApp | AstraCalls (Go, whatsmeow + VoIP propio, códec MLow) | **Sí: OpenAI Realtime `gpt-realtime` voz a voz** | **Sí, durante la llamada** | No |
| Videollamada WhatsApp | AstraCalls solo negocia el vídeo; no hay ruta de imagen (ni VP8) | solo audio | igual que la llamada | No |
| Videollamada con avatar | producto web aparte: Tavus CVI sobre Daily (no es WhatsApp) | LLM propio de Tavus | 4 herramientas, ejecutadas **desde el navegador** | No |

### Llamada de WhatsApp

- Ya tiene razonamiento en streaming (`astracalls/cmd/server/voicebot.go`):
  - VAD en el servidor.
  - Transcripción de entrada.
  - Interrupción por energía.
  - La sesión se abre antes de contestar para ganar latencia.
- La configuración llega por llamada desde el Backend (`voicebot.service.ts` `resolve`).
- Las herramientas se ejecutan con POST a `/voicebot/tool` (`executeTool`), con timeout de
  8 s. Reutilizan los constructores de herramientas del agente de chat
  (`buildVoicebotToolset`).
- **Es la pieza más reutilizable**: para el Modo Dueño por llamada falta enchufarle las
  herramientas del dueño, no construir el canal.
- Defectos encontrados:
  - El prompt de voz siempre dice «es una llamada que TÚ haces», incluso en llamadas
    entrantes.
  - No se usan `transferTo` ni el saludo.
  - No se avisa «un momento» mientras corre una herramienta.
  - Al interrumpir, no se recorta la respuesta (falta `conversation.item.truncate`).
  - El juego de herramientas se reconstruye en cada llamada a herramienta.

### Videollamada

- En la de WhatsApp el bot solo oye: AstraCalls procesa únicamente audio
  (`callmanager_media.go:127-130`). Para «ver lo que el dueño comparte» hace falta un
  pipeline de vídeo (VP8) y un modelo de visión. Es trabajo nuevo grande.
- En la de avatar (Tavus):
  - El avatar comparte una pantalla generada en el servidor.
  - Nada lee la cámara ni la pantalla del cliente.
  - Las herramientas corren en el navegador mediante rutas firmadas. Para usar el motor del
    dueño habría que cambiar el LLM de Tavus por uno propio (custom LLM apuntando al
    Backend) o reenviar esas llamadas al Backend.

## 7. Limitaciones que bloquean la Fase 2

**Gobernanza**
1. **Confirmación**:
   - Tareas y recordatorios se ejecutan sin confirmar.
   - Lo pendiente vive en un `Map` en memoria de 10 min: se pierde al reiniciar y no se
     comparte entre réplicas.
   - La expresión de «sí» solo mira el comienzo: «ok pero a otro número» **ejecuta**.
   - Cualquier otra respuesta descarta lo pendiente sin avisar.
   - El `confirmed: true` que exige la App lo pone el propio Backend: no es una segunda
     comprobación independiente.
2. **Reversión**: no existe fuera del prompt. Mensajes, cambios de estado, etiquetas y
   asignaciones no se pueden deshacer.
3. **Bitácora** (`audit_logs`):
   - No apunta consultas.
   - Del mensaje enviado guarda el largo, no el texto.
   - `actorId` es la cuenta, no la persona (de las 5) que dio la orden.
   - No apunta el canal ni lo pedido frente a lo confirmado.
   - Se traga sus propios errores.
   - Se borra a los 90 días.
   - `writeAuditLog` se puede llamar desde el navegador porque está exportada en un archivo
     `'use server'`.
4. **Plan**:
   - El Modo Dueño no mira ni plan ni módulos.
   - Los candados del panel (`Module.lockedPlans/allowedPlans`, `UserModule`) se aplican en
     el cliente (`LockedRouteGuard`). No hay comprobación en servidor de `lockedPlans`, y
     el Backend no tiene ninguna.

**Identidad**

5. Coincidencia por sufijo, sin PIN; `@lid` sin resolver; llamadas sin comprobación.

**Técnicas**

6. **Motor acoplado a la sesión**:
   - Casi toda la lógica de escritura vive en acciones con `assertCanAccessTargetUser`, que
     exige una sesión de navegador.
   - `owner_mover_lead` llama a `updateSessionLeadStatus` → `assertUserCanUseApp` →
     `assertCanAccessTargetUser` sin sesión. **Lo más probable es que hoy falle siempre**
     (devuelve «No se pudo actualizar»). Hay que verificarlo en producción.
   - Campañas (`createReminder`), embudos (`moverTarjetaAction`), productos y ajustes
     necesitan pasar su lógica a un núcleo `lib/*.server.ts` sin sesión, como ya se hizo
     con el editor del agente (`lib/entrenamiento-del-agente.server.ts`).
7. **Depende de otros interruptores**:
   - El Modo Dueño se apaga si el «Robot» de la línea está apagado o si la cuenta no tiene
     clave de IA.
   - No consume ni registra créditos.
   - No hay límite de frecuencia.
8. **Contexto del agente**:
   - Al prompt del dueño no se le inyecta la fecha ni la zona horaria, y debe producir
     fechas ISO a partir de «mañana a las 3».
   - El historial del dueño comparte clave con el de un cliente del mismo número.
   - Un fallo de transcripción llega al LLM como texto `[ERROR_TRANSCRIBING_AUDIO]`.
9. **Proveedores**: solo OpenAI y Google en `LlmClientFactory`.
10. **Documentación desactualizada**: `docs/modo-dueno-*.md` e `INVENTARIO-MODULOS.md`
    (dice «sin pantalla» y que «todo queda registrado»).

---

## Respuestas a las preguntas abiertas

**¿Se puede reutilizar la lógica de candados como filtro del Modo Dueño?**
- Sí, la regla pura sí. `cuentaAlcanzaLaRuta` (`lib/acceso-a-modulo.ts:63-108`) y
  `quienesAlcanzanLaRuta` (`lib/alcance-de-modulo.server.ts`) ya responden «¿esta cuenta ve
  este módulo?» leyendo la base, sin sesión. Es la misma fuente que pinta los candados.
- Falta:
  1. Que cada herramienta declare su módulo (tabla «herramienta → ruta del módulo»).
  2. Comprobarlo **en el servidor**, dentro del motor, antes de preparar la acción.
  3. Comprobarlo también en las pantallas, porque hoy el candado solo se pinta en el
     navegador.

**¿Llamadas y videollamadas soportan razonamiento en streaming?**
- **Llamada: sí, ya.** OpenAI Realtime con herramientas durante la llamada. Falta:
  - Detectar al dueño en `resolve`.
  - Darle su prompt y sus herramientas.
  - Una confirmación por voz con estado persistente.
  - Un «un momento» mientras corre una herramienta.
  - Más de 8 s de timeout para acciones lentas.
- **Videollamada de WhatsApp:** solo audio. Ver la pantalla exige un pipeline de vídeo
  nuevo en AstraCalls más visión.
- **Avatar (Tavus):** exige pasar sus herramientas al servidor.

**¿Cómo extender el versionado de 5 copias sin disparar el almacenamiento?**
- Una sola tabla nueva de «acciones ejecutadas», migrada por el Backend. Cada fila guarda:
  - Quién (persona y cuenta).
  - Canal.
  - Texto pedido.
  - Resumen confirmado.
  - Hora de la confirmación.
  - Resultado.
  - **Solo los campos que cambian**: antes y después en JSON, no la foto entera de la
    entidad.
- La bitácora se guarda siempre (es la prueba de responsabilidad; propuesta: 1 año). La
  foto «antes» se poda a las últimas 5 por entidad, igual que el prompt.
- Lo irreversible (mensaje enviado, campaña ya salida) se marca «no reversible» y el
  agente lo dice **antes** de confirmar.
- El prompt mantiene su tabla actual.

**¿MCP como servicio aparte o compartiendo el backend de ejecución?**
- Un **solo motor de acciones**: el que ya está en la App (`lib/owner-*`), ampliado y
  expuesto por una API interna. Tres «bocas» delgadas encima:
  1. Agente del dueño por texto y audio (Backend).
  2. Voicebot (Backend + AstraCalls).
  3. Servidor MCP.
- El MCP puede ser una ruta de la App (`/api/mcp`) o un proceso pequeño. Lo importante es
  que **no tenga lógica propia**: confirmación, plan, bitácora y reversión viven en el
  motor y se aplican igual a las tres bocas.
- El MCP necesita lo que hoy no existe:
  - **Tokens por persona**, ligados al `User` y a su rol, revocables.
  - Una versión sin sesión de `assertCanAccessTargetUser`, basada en `juzgarElAlcance`,
    para que el super_admin/admin cruce cuentas solo hacia abajo.

**¿Orden de construcción?**
- **Base común (bloquea todo lo demás):**
  1. Confirmación persistente en base y estricta.
  2. Tabla de acciones con bitácora y reversión.
  3. Control por plan en servidor.
  4. Identidad endurecida (número exacto + PIN opcional).
  5. Arreglar mover lead y restaurar prompt.
- **Después, en paralelo:**
  - Ampliar texto y audio con las nuevas herramientas: precios, frases, ajustes, embudos,
    campañas, recordatorios a clientes, módulos y permisos.
  - MCP sobre el mismo motor.
- **Luego:** llamada de WhatsApp, que es barata porque el streaming ya existe.
- **Al final:** videollamada (avatar o WhatsApp con visión), que es trabajo nuevo de
  infraestructura.
