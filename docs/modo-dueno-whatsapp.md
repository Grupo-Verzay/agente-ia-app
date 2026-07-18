# Modo Dueño por WhatsApp

Canal por el que **el dueño de la cuenta** le da órdenes al agente por WhatsApp
y el agente las ejecuta **dentro de la plataforma** (crear tareas, recordatorios,
consultar un resumen, etc.), sin que el dueño tenga que entrar a la app.

> Es distinto del "mensaje a operario" (`OperatorBridge`): ahí la IA pregunta a
> un humano y el humano responde. Aquí **el dueño manda y la IA ejecuta**.

## Arquitectura (dos proyectos)

- **Backend NestJS (`api-webhook` / `ai-agent.service.ts`)** — el "cerebro":
  procesa el WhatsApp entrante, reconoce que quien escribe es el dueño, decide
  qué herramienta usar y **llama a los endpoints `/api/owner/*`** de esta app.
- **Esta app (`verzay-app`)** — la "mano": expone los endpoints ejecutables,
  valida identidad y permisos, ejecuta la acción sobre la base y la audita.

Este repositorio implementa **solo la mano** (los endpoints). El wiring de las
herramientas del agente (que el backend reconozca el modo dueño y llame estos
endpoints) es trabajo del proyecto NestJS.

## Seguridad

Cada endpoint aplica dos controles (`lib/owner-command-auth.ts`):

1. **Secreto compartido** — `Authorization: Bearer <OWNER_COMMANDS_KEY>` (o el
   header `x-owner-commands-secret`). Solo el backend puede invocar.
2. **Identidad del dueño** — el body incluye `ownerPhone` (el número que dio la
   orden) y `userId` (la cuenta). Se verifica que `ownerPhone` coincide con
   `User.notificationNumber` de esa cuenta. Aunque el backend ya haya decidido
   entrar en "modo dueño", esta app **revalida** antes de ejecutar (defensa en
   profundidad).

En Fase 1 solo se autoriza al **titular** de la cuenta. Ampliar a cuentas
vinculadas con rol administrador queda para una fase posterior.

Toda acción de escritura se registra en `AuditLog` con `metadata.source =
"owner-command"`.

## Endpoints

Todos son `POST`, reciben JSON y responden JSON. Todos incluyen en el body
`userId` (la cuenta) y `ownerPhone` (el número que dio la orden). Errores:
`401` secreto inválido · `403` número no autorizado · `422` parámetros inválidos
· `428` falta confirmación · `404/409/502` según la acción.

### Fase 1 — acciones seguras (no afectan a terceros)

#### `POST /api/owner/task` — Crear tarea
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "title": "Llamar al proveedor", "dueDate": "2026-07-20T14:00:00Z",
  "type": "Seguimiento" }
```
`type` es opcional (por defecto `"Seguimiento"`). Respuesta `201`:
```json
{ "success": true, "message": "Tarea creada.",
  "task": { "id": "...", "title": "...", "type": "...", "dueDate": "...", "status": "pending" } }
```

#### `POST /api/owner/reminder` — Crear recordatorio
Igual que la tarea pero sin `type` (se fija en `"Recordatorio"`). Devuelve el
objeto bajo la clave `reminder`. Un recordatorio es una tarea asignada al propio
dueño; reutiliza la misma infraestructura de tareas.

#### `POST /api/owner/summary` — Resumen del día (solo lectura)
```json
{ "userId": "...", "ownerPhone": "573001234567" }
```
Respuesta `200`:
```json
{ "success": true, "summary": {
  "pendingTasks": 12, "tasksDueToday": 3, "appointmentsToday": 5,
  "generatedAt": "2026-07-18T..." } }
```

### Fase 2 — acciones sobre un contacto (requieren confirmación)

Las acciones de escritura de Fase 2 exigen `confirmed: true` en el body; sin él
responden `428`. La confirmación con el dueño la gestiona el agente **antes** de
llamar al endpoint. El contacto se identifica por `sessionId` (resuélvelo antes
con `/contacts/search`); la app valida que la sesión pertenezca a la cuenta.

#### `POST /api/owner/contacts/search` — Buscar contacto (solo lectura)
```json
{ "userId": "...", "ownerPhone": "573001234567", "query": "Juan" }
```
Respuesta `200`: `contacts: [{ sessionId, name, remoteJid, leadStatus, tags }]`
(máx. 20). No requiere confirmación.

#### `POST /api/owner/message` — Enviar mensaje a un contacto
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "sessionId": 123, "text": "Tu pedido está listo", "confirmed": true }
```
Envía desde la instancia conectada del dueño (sin fallback a la línea oficial).
`409` si no hay instancia conectada.

#### `POST /api/owner/lead-status` — Mover estado de lead (kanban)
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "sessionId": 123, "status": "FINALIZADO", "confirmed": true }
```
`status` ∈ `FRIO | TIBIO | CALIENTE | FINALIZADO | DESCARTADO`. Dispara las
notificaciones y automatizaciones de etapa existentes.

#### `POST /api/owner/tag` — Etiquetar contacto
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "sessionId": 123, "tag": "VIP", "confirmed": true }
```
Si la etiqueta no existe para la cuenta, se crea.

> **Agendar cita a un cliente** ya está cubierto por el endpoint existente
> `POST /api/schedule/appointment` (tool `crear_cita`), por eso no se duplica aquí.

### Fase 3 — auto-mejora del entrenamiento

El entrenamiento del agente **no es código**: vive en `AgentPrompt.sections` y está
versionado en `AgentPromptRevision`. Por eso el dueño puede ajustar el
comportamiento del agente por WhatsApp sin entrar a la plataforma ni redesplegar.

Diseño conservador y reversible: solo se **agregan** instrucciones (nunca se
reescribe ni se borra lo existente), cada cambio se publica como una revisión
(snapshot para rollback), y existe restore para volver atrás. `agentId` es
opcional (por defecto `system-prompt-ai`, el entrenamiento base de WhatsApp).

#### `POST /api/owner/training/get` — Ver entrenamiento (solo lectura)
```json
{ "userId": "...", "ownerPhone": "573001234567" }
```
Respuesta: `training: { agentId, promptId, version, status, steps: [{ id, title, mainMessage }] }`.

#### `POST /api/owner/training/revisions` — Historial de revisiones (solo lectura)
Respuesta: `revisions: [{ revisionNumber, publishedAt, notes }]` (máx. 20).

#### `POST /api/owner/training/instruction` — Agregar instrucción
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "instruction": "Primero pregunta el servicio y luego la fecha",
  "title": "Orden del flujo de agenda", "confirmed": true }
```
Agrega un step al entrenamiento y publica una nueva revisión (queda activa).

#### `POST /api/owner/training/restore` — Rollback a una revisión
```json
{ "userId": "...", "ownerPhone": "573001234567",
  "revisionNumber": 4, "confirmed": true }
```
Restaura y republica la revisión indicada.

### Fase 3 — pendiente (requiere backend / diseño con límites)

- **Envío masivo / campaña.** Reutilizable vía el mecanismo de `Reminders`
  (campaña), pero requiere ensamblar credenciales de instancia + programación y
  un **límite duro de destinatarios** por seguridad. No se construye a ciegas:
  conviene diseñarlo con tope y cola, idealmente en el backend.
- **Llamadas salientes.** El sistema actual de voz es WebRTC desde el navegador
  o el voicebot para llamadas **entrantes**; no hay acción de servidor para
  llamadas salientes automáticas. Requiere trabajo en AstraCalls / backend.

## Configuración

Añade a `.env`:
```
OWNER_COMMANDS_KEY=<secreto largo y aleatorio, compartido con el backend>
```

## Roadmap (fases siguientes)

- **Fase 0 (pendiente en backend):** motor de confirmación genérico y modo dueño
  separado del agente de clientes. En esta app la confirmación se exige vía el
  flag `confirmed` (428 si falta); el flujo conversacional de confirmación es
  responsabilidad del backend NestJS.
- **Fase 2 — pendiente:** asignar lead/tarea a un asesor. Se dejó fuera porque
  `assignSessionToAdvisor` depende de contexto de sesión (`requireOwnerOrAdmin`)
  y de internals no exportados (`logAssignment`, `triggerAdvisorAutomations`);
  conviene refactorizarlo para exponer una versión invocable por máquina antes
  de añadir el endpoint.
- **Fase 3 — implementado:** auto-mejora del entrenamiento (agregar instrucción
  + publicar revisión, reversible) y rollback a revisiones previas.
- **Fase 3 — pendiente:** envío masivo con límites y llamadas salientes por voz
  (ver arriba).
