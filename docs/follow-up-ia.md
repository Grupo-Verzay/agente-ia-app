# Follow-up IA

## Resumen

Este desarrollo agrega follow-up automatico y manual sobre los workflows avanzados.

Permite:

- programar seguimientos desde nodos `seguimiento-*`
- elegir entre follow-up `static` o `ai`
- generar el mensaje con IA usando contexto real de la conversacion
- cancelar seguimientos cuando el lead responde
- reintentar o cancelar desde el CRM
- procesar la cola de forma manual o automatica
- ver estado, historial reciente y errores desde el CRM

## Proyectos involucrados

### `verzay-app`

Responsable de:

- configuracion del follow-up en el editor `/workflow/[workflowId]`
- acciones manuales desde CRM
- resumen, filtros e historial visual
- disparo manual del runner por HTTP

### `api-webhook`

Responsable de:

- persistir y ejecutar la cola de follow-ups
- generar mensajes IA
- enviar mensajes a traves de Evolution
- cancelar pendientes al detectar respuesta humana
- correr el scheduler automatico

## Que mejora trae

Antes, un seguimiento dependia de logica mas estatica o de operacion manual.

Con este desarrollo:

- el seguimiento queda integrado al workflow real
- la IA puede retomar contexto de CRM e historial reciente
- el CRM muestra el estado operativo del follow-up
- los errores quedan auditables
- el equipo puede procesar una cola completa o una sola sesion
- hay menos riesgo de insistir al lead si ya respondio

## BD usada

La funcionalidad usa PostgreSQL via Prisma.

Ambos proyectos (`verzay-app` y `api-webhook`) tienen datasource Prisma con:

```prisma
provider = "postgresql"
url      = env("DATABASE_URL")
```

El follow-up persiste principalmente en la tabla `seguimientos` y en la configuracion de `WorkflowNode`.

## Flujo completo

1. Un usuario configura un nodo `seguimiento-*` dentro de un workflow avanzado.
2. El workflow se ejecuta y crea un registro en `seguimientos`.
3. Ese registro queda `pending` hasta que vence su delay (`time`).
4. El runner lo toma:
   - si es `static`, usa el mensaje del nodo
   - si es `ai`, genera el mensaje en ese momento
5. El backend envia el mensaje por Evolution.
6. Si el envio sale bien:
   - el follow-up pasa a `sent`
   - se guarda `generatedMessage`
   - se limpia `errorReason`
   - se actualiza la sesion
   - se guarda el mensaje en el historial de chat como `ia`
7. Si el envio falla:
   - sube `followUpAttempt`
   - se guarda `errorReason`
   - si todavia quedan intentos, vuelve a `pending`
   - si alcanzo el maximo, pasa a `failed`
8. Si el lead responde antes del siguiente envio y `followUpCancelOnReply=true`:
   - los pendientes de esa sesion pasan a `cancelled`

## Como se usa

### 1. Configuracion en workflow

Ruta recomendada:

- `/workflow/[workflowId]`

Dentro de un nodo `seguimiento-*`:

1. Configura el mensaje base, media y delay como ya se hacia.
2. En el bloque nuevo de follow-up elige el modo:
   - `static`: usa el mensaje del nodo
   - `ai`: genera el texto al ejecutar
3. Si el modo es `ai`, define:
   - `Objetivo del follow-up`
   - `Prompt interno`
   - `Maximo de intentos IA`
   - `Cancelar si responde`
4. El guardado se hace al cambiar switches o al salir del campo.

### 2. Ejecucion automatica

Si el backend tiene activo el scheduler:

- el runner revisa la cola periodicamente
- procesa solo registros `pending`
- envia los follow-ups vencidos

### 3. Ejecucion manual

Desde CRM se puede:

- procesar toda la cola del usuario
- procesar una sola sesion
- cancelar follow-ups activos de una sesion
- reactivar follow-ups fallidos

### 4. Seguimiento en CRM

En el dashboard CRM ya existe:

- metricas de follow-up
- columna `Follow-up`
- filtro por estado
- detalle del ultimo follow-up
- historial reciente de intentos
- visualizacion del error si fallo

## Como funciona la IA

Cuando `followUpMode = ai`, el mensaje no se deja fijo al momento de configurar el workflow.

Se genera al ejecutar el seguimiento usando:

- configuracion IA del usuario (`provider`, `model`, `apiKey`)
- prompt del agente
- historial reciente de chat
- resumen del ultimo `Registro` del CRM
- `followUpGoal`
- `followUpPrompt`
- numero de intento actual
- `fallbackMessage` si la generacion no aporta contenido util

Esto hace que el follow-up llegue con contexto mas fresco que un mensaje predefinido.

## Que guarda

### En `WorkflowNode`

Configuracion editable del nodo:

- `followUpMode`
- `followUpPrompt`
- `followUpGoal`
- `followUpCancelOnReply`
- `followUpMaxAttempts`

### En `seguimientos`

Snapshot operativo del seguimiento:

- `idNodo`
- `serverurl`
- `instancia`
- `apikey`
- `remoteJid`
- `mensaje`
- `tipo`
- `time`
- `media`
- `followUpMode`
- `followUpPrompt`
- `followUpGoal`
- `followUpCancelOnReply`
- `followUpMaxAttempts`
- `followUpAttempt`
- `followUpStatus`
- `generatedMessage`
- `errorReason`
- `createdAt`
- `updatedAt`

### En historial y CRM

Ademas:

- el backend lee el ultimo `Registro` para contexto
- el backend lee historial de chat para contexto
- al enviar bien, guarda el mensaje final en chat history como mensaje `ia`
- la sesion se sincroniza para quitar seguimientos ya enviados, cancelados o fallidos

## Que envia

El envio final depende del tipo de nodo:

- `seguimiento-text`: envia texto
- `seguimiento-image`: envia imagen con caption
- `seguimiento-video`: envia video con caption
- `seguimiento-document`: envia documento con caption
- `seguimiento-audio`: si hay texto final, envia texto primero y luego el audio

Si el modo es `ai`, la IA genera el texto/caption. La media sigue saliendo del nodo configurado.

## Estados del follow-up

- `pending`: pendiente de ejecucion
- `processing`: tomado por el runner
- `sent`: enviado correctamente
- `failed`: agoto intentos o fallo terminal
- `cancelled`: cancelado por respuesta o accion manual

## Endpoint operativo del runner

Endpoint backend:

```http
POST /webhook/follow-up/process
```

Body soportado:

```json
{
  "limit": 25,
  "userId": "user-id",
  "instanceId": "instance-id",
  "remoteJid": "573001112233@s.whatsapp.net"
}
```

Notas:

- `userId` permite procesar solo la cola de ese usuario
- `instanceId` + `remoteJid` permiten procesar una sola sesion
- si existe `FOLLOW_UP_RUNNER_KEY`, el header `x-runner-key` es obligatorio

## Variables de entorno

### Frontend (`verzay-app`)

- `FOLLOW_UP_RUNNER_URL`
  - opcional
  - si existe, se usa para el disparo manual del runner
  - si no existe, se usa `user.webhookUrl`

- `FOLLOW_UP_RUNNER_KEY`
  - opcional
  - si existe, se envia como header `x-runner-key`

### Backend (`api-webhook`)

- `FOLLOW_UP_RUNNER_ENABLED`
  - `true` para activar scheduler automatico
  - `false` para dejar solo ejecucion manual

- `FOLLOW_UP_RUNNER_INTERVAL_MS`
  - intervalo de revision de cola
  - default: `60000`

- `FOLLOW_UP_RUNNER_LIMIT`
  - maximo de follow-ups procesados por tick
  - default: `25`

- `FOLLOW_UP_RUNNER_KEY`
  - opcional
  - protege `POST /webhook/follow-up/process`

## Consideraciones operativas

- Si el backend corre en varias replicas o varios procesos, no conviene activar el scheduler en todas.
- El lock actual evita solape dentro del mismo proceso, no entre replicas distintas.
- Recomendacion: dejar el scheduler activo en una sola instancia o mover la ejecucion a un cron externo unico.

## Checklist de validacion

### Infra y despliegue

- [ ] La migracion Prisma de follow-up esta aplicada en la BD real
- [ ] `verzay-app` esta desplegado con el build nuevo
- [ ] `api-webhook` esta desplegado con el build nuevo
- [ ] `DATABASE_URL` apunta a la BD correcta
- [ ] `user.webhookUrl` apunta al `api-webhook` real o existe `FOLLOW_UP_RUNNER_URL`
- [ ] Si se usa seguridad, `FOLLOW_UP_RUNNER_KEY` coincide entre front y backend
- [ ] Si el scheduler automatico se usara en produccion, `FOLLOW_UP_RUNNER_ENABLED=true`
- [ ] Solo una instancia del backend tiene activo el scheduler

### Configuracion del workflow

- [ ] Se puede abrir el workflow avanzado correcto en `/workflow/[workflowId]`
- [ ] Un nodo `seguimiento-*` muestra el bloque nuevo de follow-up
- [ ] Se puede cambiar entre `static` y `ai`
- [ ] `Objetivo del follow-up` guarda correctamente
- [ ] `Prompt interno` guarda correctamente
- [ ] `Maximo de intentos` guarda correctamente
- [ ] `Cancelar si responde` guarda correctamente

### Persistencia

- [ ] Al ejecutar el workflow se crea un registro en `seguimientos`
- [ ] El seguimiento copia el modo y configuracion del nodo
- [ ] `followUpStatus` inicia como `pending`
- [ ] `followUpAttempt` inicia en `0`
- [ ] `generatedMessage` inicia vacio
- [ ] `errorReason` inicia vacio

### Follow-up estatico

- [ ] Un follow-up `static` de texto se envia al vencer el delay
- [ ] Un follow-up `static` de imagen se envia con caption correcto
- [ ] Un follow-up `static` de video se envia con caption correcto
- [ ] Un follow-up `static` de documento se envia con caption correcto
- [ ] Un follow-up `static` de audio envia audio y, si aplica, texto previo
- [ ] Al enviar correctamente pasa a `sent`

### Follow-up IA

- [ ] Un follow-up `ai` se genera al momento de ejecutar, no al crear el nodo
- [ ] La IA usa contexto reciente y no repite ciegamente el mensaje anterior
- [ ] El texto generado se guarda en `generatedMessage`
- [ ] En tipos con media, la caption generada acompana la media correcta
- [ ] En audio, si la IA genera texto, se envia primero el texto y luego el audio

### Cancelacion por respuesta

- [ ] Si el lead responde antes del siguiente follow-up y `cancelOnReply=true`, el pendiente pasa a `cancelled`
- [ ] Si `cancelOnReply=false`, la respuesta del lead no cancela el pendiente
- [ ] La sesion deja de listar IDs viejos en `seguimientos` cuando corresponde

### Reintentos y fallos

- [ ] Si el envio falla, sube `followUpAttempt`
- [ ] Si aun quedan intentos, el registro vuelve a `pending`
- [ ] Si se agotan intentos, el estado final es `failed`
- [ ] `errorReason` guarda el motivo del fallo
- [ ] Reactivar fallidos desde CRM limpia `generatedMessage`
- [ ] Reactivar fallidos desde CRM limpia `errorReason`

### CRM

- [ ] El dashboard muestra metricas de follow-up
- [ ] La tabla muestra la columna `Follow-up`
- [ ] El filtro por estado funciona
- [ ] El popover muestra resumen, historial y error
- [ ] `Procesar ahora` por sesion funciona
- [ ] `Cancelar activos` funciona
- [ ] `Reactivar fallidos` funciona
- [ ] `Procesar follow-ups` global del usuario funciona

### Runner

- [ ] `POST /webhook/follow-up/process` responde correctamente
- [ ] Con `userId`, procesa solo follow-ups de ese usuario
- [ ] Con `userId + instanceId + remoteJid`, procesa solo esa sesion
- [ ] El scheduler automatico procesa sin duplicar envios

### Observabilidad

- [ ] Los logs del backend muestran fallos utiles
- [ ] Los cambios de `followUpStatus` son coherentes
- [ ] `generatedMessage` y `errorReason` quedan auditables en produccion

## Checklist corta para aprobacion funcional

Se puede considerar listo para uso productivo cuando:

- [ ] Se probo al menos 1 follow-up `static`
- [ ] Se probo al menos 1 follow-up `ai`
- [ ] Se probo cancelacion por respuesta
- [ ] Se probo reintento manual desde CRM
- [ ] Se probo fallo real o simulado y se vio `errorReason`
- [ ] Se probo procesamiento manual por sesion
- [ ] Se probo procesamiento automatico por scheduler
- [ ] No hay duplicados por multiples instancias

## Problemas comunes

### El follow-up no se ejecuta solo

Revisar:

- `FOLLOW_UP_RUNNER_ENABLED`
- que exista una sola instancia scheduler
- que haya registros `pending` vencidos

### El boton manual del CRM falla

Revisar:

- `FOLLOW_UP_RUNNER_URL` o `user.webhookUrl`
- `FOLLOW_UP_RUNNER_KEY`
- reachability real del endpoint `/webhook/follow-up/process`

### Se generan mensajes pero no salen por WhatsApp

Revisar en `seguimientos`:

- `serverurl`
- `instancia`
- `apikey`
- `remoteJid`
- `tipo`
- `media`

### Se repiten envios

Revisar:

- multiples replicas del backend con scheduler activo
- ejecuciones manuales concurrentes

## Recomendacion operativa

Para operacion estable:

1. Activar scheduler en una sola instancia.
2. Usar CRM para monitorear estados y errores.
3. Dejar `cancelar si responde` activo por defecto.
4. Usar el modo `ai` solo donde el objetivo comercial este bien definido.

