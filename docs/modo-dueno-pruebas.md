# Modo Dueño por WhatsApp — Guía de pruebas (cuenta piloto)

Qué escribirle al agente y qué debería pasar en cada caso. Pensada para rodar el
Modo Dueño en una cuenta real antes de habilitarlo a todos.

## 0. Antes de empezar (checklist de activación)

- [ ] `OWNER_COMMANDS_KEY` con el **mismo valor** en la app y en el backend.
- [ ] Migración aplicada (`prisma migrate deploy` → columna `owner_mode_enabled`).
- [ ] Backend: `NEXTJS_URL` correcto, `OWNER_MODE_ENABLED=true`.
- [ ] En el panel de la cuenta piloto: **Perfil → Modo Dueño por WhatsApp = ON**.
- [ ] En ese mismo perfil: **número de notificación = tu número personal real**.
- [ ] WhatsApp del negocio conectado (QR o Meta).
- [ ] Escribe **desde el número personal del dueño** (el del número de notificación)
      al **número del negocio**.

> Si algo no responde como dueño, revisa primero estos 6 puntos: casi siempre es
> el número que no coincide, el flag apagado, o el secreto distinto entre lados.

## 1. Pruebas de seguridad (hazlas primero)

| # | Prueba | Esperado |
|---|--------|----------|
| S1 | Escribe desde un número que **NO** es el del dueño | Lo atiende como **cliente normal**; NO ejecuta acciones de administración |
| S2 | Apaga el interruptor en el panel y escribe como dueño | Lo atiende como cliente normal (el modo dueño está desactivado → la app responde 403) |
| S3 | Como dueño, pide "manda un mensaje a Juan" pero responde **"no"** a la confirmación | **No** envía nada |

## 2. Fase 1 — acciones seguras (sin confirmación)

| Escribe | Esperado | Verifica |
|---------|----------|----------|
| "¿Cómo va mi día?" | Resumen: tareas pendientes, tareas que vencen hoy, citas de hoy | Que los números cuadren con el panel |
| "Créame una tarea: llamar al proveedor mañana a las 3pm" | Confirma que la creó | Aparece en /tareas con la fecha/hora correcta |
| "Recuérdame el viernes revisar cotizaciones" | Confirma el recordatorio | Tarea tipo "Recordatorio" en la fecha correcta |

**Ojo a las fechas:** revisa que "mañana 3pm" quede en la hora correcta (zona
horaria). Si se desfasa, hay que ajustar el prompt del agente dueño.

## 3. Fase 2 — sobre un contacto (con confirmación)

| Escribe | Esperado | Verifica |
|---------|----------|----------|
| "Búscame a [nombre]" | Lista de contactos que coinciden | Si hay varios, debe preguntarte cuál |
| "Mándale a [nombre]: tu pedido está listo" | **Primero muestra qué enviará y pide confirmación** → tras tu "sí", envía | El mensaje llega al contacto |
| "Pasa a [nombre] a ganado" | Pide confirmación → mueve el lead | Estado en el kanban / CRM |
| "Etiqueta a [nombre] como VIP" | Pide confirmación → aplica etiqueta | Etiqueta visible en el contacto |
| "Asígnale [nombre] al asesor María" | Pide confirmación → asigna | Asesor asignado en el contacto |

**Clave:** en todas estas, el agente debe **mostrar qué hará y esperar tu "sí"**
antes de ejecutar. Si actúa sin confirmar, hay que reforzar el prompt.

## 4. Fase 3 — entrenamiento del agente de clientes

| Escribe | Esperado | Verifica |
|---------|----------|----------|
| "¿Qué instrucciones tiene el agente?" | Lista las instrucciones actuales | — |
| "El agente no pregunta el servicio antes de la fecha. Agrega esa instrucción" | Muestra la instrucción y pide confirmación → publica | Probar con un chat de cliente que el comportamiento cambió |
| "Muéstrame las versiones del entrenamiento" | Lista de revisiones con número y fecha | — |
| "Vuelve a la versión anterior" | Pide confirmación → restaura esa revisión | El comportamiento vuelve al previo |

## 5. Qué revisar en cada prueba

1. **La respuesta del agente** en el chat de WhatsApp.
2. **El efecto real** en la plataforma (tarea creada, lead movido, mensaje enviado…).
3. **`AuditLog`**: cada acción de escritura queda con `metadata.source = "owner-command"`.
4. **Logs del backend** si algo falla: busca `[owner-mode]` y `[owner-tool]`.

## 6. Si algo no sale bien — dónde mirar

| Síntoma | Causa probable / acción |
|---------|-------------------------|
| Me atiende como cliente, no como dueño | Número no coincide con `notificationNumber`, flag apagado, o `OWNER_MODE_ENABLED` off |
| "No autorizado" / no ejecuta | `OWNER_COMMANDS_KEY` distinto entre app y backend |
| Fechas desfasadas | Ajustar zona horaria en el prompt del agente dueño |
| No pide confirmación | Reforzar la regla de confirmación en el system prompt |
| No encuentra el contacto | Probar con el número en vez del nombre |
| No envía el mensaje | Instancia de WhatsApp del dueño no conectada (la app responde 409) |

## 7. Nota sobre el afinado

El comportamiento de un agente de IA casi siempre necesita un par de ajustes al
prompt tras las primeras pruebas reales (elección de tool, confirmación, fechas).
Es esperable: el prompt del agente dueño vive en
`api-webhook: src/modules/ai-agent/owner/owner-agent.prompt.ts` y se puede afinar
sin tocar la lógica.
