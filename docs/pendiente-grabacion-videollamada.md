# Pendiente: grabación, transcripción y resumen en el detalle de la videollamada (Tavus)

Estado: **diagnóstico hecho, arreglo sin empezar.** Este documento es el punto
de partida para el hilo que lo continúe.

## El síntoma

En CRM › Llamadas, el detalle de una videollamada con Verzy no enseña ni video,
ni audio, ni transcripción completa, ni resumen. El de una llamada de voz sí los
enseña.

## Lo que se encontró (con el código delante)

**a) Tavus nunca graba, porque no se le pide.**
`crearLaConversacion` (`lib/videollamada-ia.server.ts`) hace
`POST https://tavusapi.com/v2/conversations` con `persona_id`,
`conversation_name`, `conversational_context`, `callback_url` y `properties`
(`max_call_duration`, `participant_absent_timeout`, `participant_left_timeout`,
`language`). **No manda `enable_recording`** ni los datos del bucket S3 que
Tavus pide para grabar (`recording_s3_bucket_name`,
`recording_s3_bucket_region`, `aws_assume_role_arn`). Sin eso Tavus no graba.
Hay que activarlo del lado de Verzay y que alguien cree el bucket y el rol en
AWS para Tavus.

**b) El aviso de grabación se ignora.**
Tavus avisa con `application.recording_ready` trayendo `s3_key` y el bucket, no
una URL pública. `queHaceElAvisoDeTavus` (`lib/videollamada-ia.ts`) solo toma
una URL `https` de `recording_url | url | download_url`, así que con `s3_key` no
apunta nada.

**c) Lo que llega tarde no llega al detalle.**
`procesarElAvisoDeTavus` (`lib/videollamada-ia-aviso.server.ts`) guarda la
grabación solo en `videollamadas_ia.grabacionUrl` (`apuntarLaGrabacion`). La
fila del CRM (`chat_messages`, `messageType:'call'`, `messageId tavus_<cita>`,
`raw.call` con `isVideo:true, provider:"tavus"`) se escribe al llegar la
transcripción (`anotarEnElCrm`), y una grabación que llega después **no la
actualiza** (`hasRecording` y `recordingUrl` se quedan como estaban).

**d) El diálogo solo sabe pintar audio de AstraCalls.**
`CallDetailDialog.tsx` usa `recordingUrl ?? call.recordingUrl` y lo pinta con
`NotaDeVozSuelta` (audio). No hay camino de video, y el `recordingUrl` que le
pasa la lista sale de los ids de AstraCalls (`astraSid`/`astraCallId`), que una
fila de Tavus no tiene. El «Reintentar» llama a
`reintentarLaTranscripcionAction`, también de AstraCalls.

**Transcripción y resumen:** Tavus SÍ los entrega por el `callback_url`
(`application.transcription_ready` con `properties.transcript`), y el código ya
arma la transcripción (`laTranscripcionDeTavus`, líneas «Cliente:» /
«Asistente:») y el resumen (`elResumen`, cobrado a la cuenta). Falta comprobar
en producción que el aviso llega (la ruta `/api/videollamada/tavus` tiene que
pasar el middleware sin sesión) y que `losTurnos`
(`lib/turnos-de-la-transcripcion.ts`) reconoce «Cliente:».

## Respuesta a la pregunta de Carlos

- **Transcripción:** Tavus la entrega; Verzay ya la recibe. Hay que confirmar
  que llega y que se ve en el detalle.
- **Grabación:** Tavus solo la entrega si se activa al crear la conversación y
  se le da un bucket S3. Eso hoy no se hace: falta del lado de Verzay (código)
  y del lado de AWS (bucket + rol para Tavus).

## Plan para el hilo siguiente

1. `crearLaConversacion`: mandar `enable_recording: true` y los datos S3 desde
   el entorno (`TAVUS_S3_BUCKET`, `TAVUS_S3_REGION`, `TAVUS_AWS_ROLE_ARN`); sin
   ellos no se pide grabar y se dice en la consola.
2. `queHaceElAvisoDeTavus`: entender `s3_key` + bucket y convertirlo en algo
   reproducible (ruta propia que firme una URL de S3, o copia al bucket de la
   plataforma). Respaldo: `GET /v2/conversations/{id}?verbose=true`, que trae
   los eventos con transcripción y grabación.
3. `procesarElAvisoDeTavus`: al llegar la grabación (o la transcripción tarde),
   actualizar también `raw.call` de la fila `tavus_<cita>` con un merge de JSONB
   (`hasRecording`, `recordingUrl`, `transcript`, `summary`).
4. `lib/fila-de-llamada.ts` / `CallsCrmClient.tsx`: exponer `isVideo` y
   `provider`, y para Tavus usar `raw.call.recordingUrl`, no la ruta de
   AstraCalls.
5. `CallDetailDialog.tsx`: con `isVideo` pintar `<video controls
   preload="metadata">`; sin `isVideo`, la nota de voz de siempre. No ofrecer el
   «Reintentar» de AstraCalls en una fila de Tavus.
6. Banco `scripts/banco-detalle-de-videollamada.sh`: Tavus fingido (avisos de
   transcripción y grabación, y la consulta `verbose`), la acción contra
   Postgres y el diálogo en Chromium. `MODO=roto` pinchado a `5983031` y
   afirmando que el detalle salía sin video, sin transcripción y sin resumen.
7. Documentarlo en `CLAUDE.md`, probar, fusionar y comprobar el despliegue.

Desde este entorno no se llega a Tavus ni a AWS: todo lo de red va fingido en
el banco.
