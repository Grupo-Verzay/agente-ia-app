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

## Endpoints (Fase 1)

Todos son `POST`, reciben JSON y responden JSON. Errores:
`401` secreto inválido · `403` número no autorizado · `422` parámetros inválidos.

### `POST /api/owner/task` — Crear tarea
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

### `POST /api/owner/reminder` — Crear recordatorio
Igual que la tarea pero sin `type` (se fija en `"Recordatorio"`). Devuelve el
objeto bajo la clave `reminder`. Un recordatorio es una tarea asignada al propio
dueño; reutiliza la misma infraestructura de tareas.

### `POST /api/owner/summary` — Resumen del día (solo lectura)
```json
{ "userId": "...", "ownerPhone": "573001234567" }
```
Respuesta `200`:
```json
{ "success": true, "summary": {
  "pendingTasks": 12, "tasksDueToday": 3, "appointmentsToday": 5,
  "generatedAt": "2026-07-18T..." } }
```

## Configuración

Añade a `.env`:
```
OWNER_COMMANDS_KEY=<secreto largo y aleatorio, compartido con el backend>
```

## Roadmap (fases siguientes)

- **Fase 0 (pendiente en backend):** motor de confirmación genérico y modo dueño
  separado del agente de clientes.
- **Fase 2 (con confirmación):** enviar mensaje a un contacto, mover lead de
  estado, etiquetar, agendar cita a un cliente, asignar lead/tarea a un asesor.
- **Fase 3 (controles fuertes):** auto-mejora del entrenamiento del agente
  (propone → el dueño confirma → nueva revisión en `AgentPromptRevision`),
  envío masivo con límites, llamadas por voz (AstraCalls).
