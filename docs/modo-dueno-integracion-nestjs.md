# Modo Dueño por WhatsApp — Guía de integración (backend NestJS)

Esta guía define **todo lo que el backend NestJS (`api-webhook` / `ai-agent.service.ts`)
debe implementar** para que el "Modo Dueño por WhatsApp" funcione de punta a punta.

La app `verzay-app` ya expone la "mano" (los endpoints `/api/owner/*`, ver
[`modo-dueno-whatsapp.md`](./modo-dueno-whatsapp.md)). Falta el "cerebro": que el
agente **reconozca al dueño, gestione la confirmación y llame estos endpoints como
herramientas**. Aquí está el contrato exacto.

---

## 1. Principio de seguridad (leer primero)

El LLM **nunca** provee `userId`, `ownerPhone` ni `confirmed`. Esos tres campos
los **inyecta el backend**:

- `userId` y `ownerPhone` → del contexto de la sesión (la cuenta y el número que
  escribe), no del modelo.
- `confirmed` → lo pone el backend en `true` **solo** después de que el humano
  confirmó, según la máquina de estados de la sección 4.

Las definiciones de tools de la sección 5 exponen al modelo **solo los parámetros
semánticos** (título, fecha, texto…). El backend arma el body final añadiendo
`userId`, `ownerPhone` y, cuando corresponde, `confirmed`.

> Si el modelo pudiera setear `userId` o `confirmed`, un prompt-injection podría
> saltarse la identidad o la confirmación. Por eso van fuera de su alcance.

---

## 2. Configuración

En el `.env` de **ambos** proyectos, el mismo valor:

```
OWNER_COMMANDS_KEY=<secreto largo y aleatorio>
```

Base URL de la app (la que ya se usa para otros endpoints, p.ej.
`https://agente.ia-app.com`). Todas las llamadas van a `${APP_URL}/api/owner/...`.

---

## 3. Detección del "modo dueño"

Al recibir un mensaje entrante, antes de la lógica normal de cliente:

```ts
// Pseudocódigo
const fromDigits = normalizePhone(incoming.from);           // solo dígitos
const account = await getAccountForInstance(incoming.instance); // dueño de la instancia
const ownerDigits = normalizePhone(account.notificationNumber);

const isOwner =
  ownerModeEnabled(account) &&                 // feature flag por cuenta (sección 8)
  ownerActivated(account, fromDigits) &&       // PIN de activación (sección 7)
  phonesMatch(fromDigits, ownerDigits);        // mismo criterio que la app (sufijo)

if (isOwner) {
  // Usar el AGENTE DUEÑO (system prompt admin + tools owner_*).
} else {
  // Flujo normal de cliente (tools actuales).
}
```

- `phonesMatch`: normaliza a dígitos y compara por sufijo (últimos ≤10) para
  absorber prefijos de país. Es el mismo criterio que aplica la app en
  `lib/owner-command-auth.ts` (que **revalida** de todos modos).
- El agente dueño debe usar un **system prompt separado** del de clientes: su rol
  es asistente administrativo, no vender. No mezclar las dos personalidades.

---

## 4. Flujo de confirmación (máquina de estados)

Para acciones **no** de solo lectura (las marcadas "confirmación" en la sección 5):

```
1. INTENCIÓN   El modelo llama la tool con los params semánticos.
2. RESOLUCIÓN  Si la acción necesita un contacto, primero owner_buscar_contacto
               para obtener sessionId. Si hay varios, el agente pregunta cuál.
3. CONFIRMAR   El agente le muestra al dueño exactamente qué hará y pide sí/no.
               Ej: "¿Confirmas enviar a Juan (+57…): 'Tu pedido está listo'?"
4. EJECUTAR    Solo si el dueño dijo sí → el backend llama al endpoint con
               confirmed:true. Si dijo no → se cancela, no se llama.
```

Si el backend llama sin `confirmed:true`, el endpoint responde `428` (red de
seguridad). El `428` **no** debe reintentarse automáticamente: significa "faltó
la confirmación humana".

Acciones de solo lectura (`summary`, `contacts/search`, `training/get`,
`training/revisions`) **no** requieren confirmación.

---

## 5. Definiciones de herramientas (function-calling)

Base común de cada llamada HTTP:

```
POST ${APP_URL}<endpoint>
Headers: Authorization: Bearer ${OWNER_COMMANDS_KEY}
         Content-Type: application/json
Body:    { ...paramsDelModelo, userId, ownerPhone[, confirmed] }   // backend arma esto
```

A continuación, cada tool: descripción (para el modelo), parámetros que **sí**
expone el modelo, endpoint, y si requiere confirmación.

### 5.1 `owner_resumen_dia` — endpoint `/api/owner/summary` — RO
> Devuelve un resumen del día del dueño: tareas pendientes, tareas que vencen hoy
> y citas de hoy. Úsala cuando el dueño pida "cómo va mi día", "mi resumen", etc.

Parámetros del modelo: _ninguno_.

### 5.2 `owner_crear_tarea` — endpoint `/api/owner/task`
> Crea una tarea para el dueño. Úsala cuando pida recordar hacer algo con una
> fecha/hora. Convierte la fecha natural a ISO 8601 antes de llamar.
```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "Qué hay que hacer" },
    "dueDate": { "type": "string", "description": "Fecha/hora en ISO 8601 (UTC)" },
    "type": { "type": "string", "description": "Opcional. Por defecto 'Seguimiento'." }
  },
  "required": ["title", "dueDate"]
}
```

### 5.3 `owner_crear_recordatorio` — endpoint `/api/owner/reminder`
> Crea un recordatorio para el dueño (una tarea de tipo Recordatorio). Igual que
> crear tarea pero para "recuérdame…". Convierte la fecha a ISO 8601.
```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "dueDate": { "type": "string", "description": "ISO 8601 (UTC)" }
  },
  "required": ["title", "dueDate"]
}
```

### 5.4 `owner_buscar_contacto` — endpoint `/api/owner/contacts/search` — RO
> Busca contactos del dueño por nombre o número. Úsala SIEMPRE antes de una acción
> sobre un contacto (mensaje, lead, etiqueta) para obtener su `sessionId`. Si
> devuelve varios, pregunta al dueño cuál.
```json
{
  "type": "object",
  "properties": { "query": { "type": "string", "description": "Nombre o número" } },
  "required": ["query"]
}
```
Respuesta: `contacts: [{ sessionId, name, remoteJid, leadStatus, tags }]`.

### 5.5 `owner_enviar_mensaje` — endpoint `/api/owner/message` — CONFIRMACIÓN
> Envía un mensaje de WhatsApp a un contacto del dueño, desde la instancia de su
> cuenta. Requiere el `sessionId` (obtenido con owner_buscar_contacto). Confirma
> con el dueño antes de enviar.
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "integer" },
    "text": { "type": "string", "description": "Mensaje a enviar" }
  },
  "required": ["sessionId", "text"]
}
```

### 5.6 `owner_mover_lead` — endpoint `/api/owner/lead-status` — CONFIRMACIÓN
> Cambia el estado de lead (kanban) de un contacto. Requiere `sessionId`. Confirma
> antes. Dispara notificaciones/automatizaciones de etapa.
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "integer" },
    "status": { "type": "string", "enum": ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"] }
  },
  "required": ["sessionId", "status"]
}
```

### 5.7 `owner_etiquetar_contacto` — endpoint `/api/owner/tag` — CONFIRMACIÓN
> Aplica una etiqueta (por nombre) a un contacto. Si no existe, se crea. Requiere
> `sessionId`. Confirma antes.
```json
{
  "type": "object",
  "properties": {
    "sessionId": { "type": "integer" },
    "tag": { "type": "string", "description": "Nombre de la etiqueta" }
  },
  "required": ["sessionId", "tag"]
}
```

### 5.8 `owner_ver_entrenamiento` — endpoint `/api/owner/training/get` — RO
> Muestra las instrucciones de entrenamiento actuales del agente. Úsala cuando el
> dueño pregunte qué tiene configurado o antes de proponer un cambio.

Parámetros del modelo: _ninguno_ (el backend puede pasar `agentId` si maneja
varios canales; por defecto el de WhatsApp base).

### 5.9 `owner_listar_revisiones_entrenamiento` — endpoint `/api/owner/training/revisions` — RO
> Lista el historial de versiones del entrenamiento (para hacer rollback). Úsala
> cuando el dueño diga "vuelve a como estaba" para mostrarle a qué revisión volver.

Parámetros del modelo: _ninguno_.

### 5.10 `owner_agregar_instruccion_entrenamiento` — endpoint `/api/owner/training/instruction` — CONFIRMACIÓN
> Agrega una instrucción al entrenamiento del agente y la publica (queda activa).
> Úsala cuando el dueño diga que el agente no está haciendo bien un flujo y quiera
> corregirlo. Solo AGREGA; no reescribe ni borra. Muestra la instrucción y confirma
> antes de aplicarla.
```json
{
  "type": "object",
  "properties": {
    "instruction": { "type": "string", "description": "La regla/comportamiento a agregar" },
    "title": { "type": "string", "description": "Opcional. Título corto de la instrucción." }
  },
  "required": ["instruction"]
}
```

### 5.11 `owner_restaurar_entrenamiento` — endpoint `/api/owner/training/restore` — CONFIRMACIÓN
> Restaura el entrenamiento a una revisión previa (rollback) y la republica. Úsala
> cuando un cambio empeoró al agente. Confirma la revisión antes.
```json
{
  "type": "object",
  "properties": {
    "revisionNumber": { "type": "integer", "description": "Nº de revisión (de owner_listar_revisiones_entrenamiento)" }
  },
  "required": ["revisionNumber"]
}
```

---

## 6. Respuestas y mapeo de errores → lenguaje natural

Todas responden JSON con `{ success: boolean, message: string, ... }`. El backend
debe traducir los códigos a mensajes claros para el dueño:

| Código | Significado | Qué decirle al dueño |
|---|---|---|
| `200/201` | OK | Confirmar lo hecho ("Listo, tarea creada.") |
| `401` | Secreto inválido | Error de configuración (no exponer detalles) — avisar a soporte |
| `403` | Número no autorizado | "No puedo verificar que seas el dueño de esta cuenta." |
| `404` | Contacto/entrenamiento no encontrado | "No encontré ese contacto / no hay entrenamiento configurado." |
| `409` | Sin instancia conectada / conflicto de versión | "No hay un WhatsApp conectado" / "Intenta de nuevo." |
| `428` | Falta confirmación | No reintentar: volver al paso de confirmar |
| `422` | Parámetros inválidos | Pedir el dato faltante/correcto |
| `502` | Falló la acción subyacente | "No se pudo completar, intenta más tarde." |

---

## 7. Endurecimiento de identidad — PIN de activación (recomendado)

Validar solo por número de WhatsApp es razonable pero suplantable. Antes de dar
poderes de escritura, activar el modo dueño con un segundo factor ligero:

1. La **primera vez** que un número intenta entrar en modo dueño, el backend
   genera un código de un solo uso y lo entrega por un canal ya confiable de la
   cuenta (email del dueño, o el panel de la app).
2. El dueño escribe el código por WhatsApp. El backend marca ese
   `(cuenta, número)` como **activado** (guardarlo con expiración/renovación).
3. Mientras no esté activado, el agente dueño solo permite acciones de **solo
   lectura** (o ninguna), nunca escritura.

Esto vive en el backend (o en una tabla nueva en la app si se prefiere
centralizar). No está implementado todavía.

---

## 8. Interruptor por cuenta (opt-in)

El modo dueño debe poder **activarse/desactivarse por cuenta**, apagado por
defecto. Opciones:

- Campo nuevo en `User` (p.ej. `ownerModeEnabled boolean @default(false)`) +
  migración Prisma, o
- Config existente por cuenta si ya hay un mecanismo de flags.

El backend consulta ese flag en el paso `ownerModeEnabled(account)` de la
sección 3.

---

## 9. Otros controles antes de producción

- **Rate limiting** por cuenta (p.ej. N acciones/minuto) para evitar disparos en
  cadena, además del secreto que ya limita el origen al backend.
- **Build/typecheck/pruebas** de la app antes de mergear (`npm run build`), en
  especial el flujo de entrenamiento (publicación de prompts).
- **Auditoría**: todo queda en `AuditLog` (`metadata.source = "owner-command"`);
  conviene una vista para revisarlo.

---

## 10. Checklist de puesta en marcha

- [ ] `OWNER_COMMANDS_KEY` configurado en app y backend (mismo valor).
- [ ] `notificationNumber` real cargado para cada dueño que use el modo.
- [ ] Flag `ownerModeEnabled` por cuenta (apagado por defecto).
- [ ] Detección de modo dueño en NestJS (sección 3).
- [ ] System prompt del agente dueño (separado del de clientes).
- [ ] Registro de las 11 tools `owner_*` (sección 5).
- [ ] Máquina de estados de confirmación (sección 4).
- [ ] Inyección server-side de `userId`/`ownerPhone`/`confirmed` (sección 1).
- [ ] Mapeo de errores → lenguaje natural (sección 6).
- [ ] PIN de activación (sección 7).
- [ ] Rate limiting (sección 9).
- [ ] `npm run build` verde + pruebas de los endpoints.
- [ ] Pendientes de funcionalidad: asignar asesor, envío masivo (tope+cola),
      llamadas salientes (AstraCalls).
```
