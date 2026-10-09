# Pendiente: grabación, transcripción y resumen en el detalle de la videollamada (Tavus)

Estado: **diagnóstico hecho, decidido grabar en el navegador; código sin empezar.** Este documento es el punto
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

## Diagnóstico de las dos preguntas (2026-10-09)

1. **¿Tavus graba en un S3 compatible genérico (MinIO)?** No. Sus opciones
   de grabación son Amazon S3 (con `aws_assume_role_arn`), Google Cloud
   Storage o Azure Blob. No acepta un endpoint propio, así que no puede
   escribir en nuestro MinIO.
2. **¿El audio se puede traer sin depender del video de Tavus?** Sí. La sala
   del navegador (`components/videollamada/SalaDeLaVideollamada.tsx`, con
   `DailyIframe.createCallObject`) tiene la pista del avatar (remota de
   Daily, en un `<video>` siempre montado) y el micrófono del cliente (pista
   local). Se puede grabar ahí, como Reuniones, y subir a MinIO. La
   transcripción ya llega por el webhook de Tavus.

## Decisión: grabar en el NAVEGADOR, no en Tavus

Se descarta el plan de abajo (S3 de Tavus). Lo nuevo:

- Grabar en la sala, igual que Reuniones (`hooks/useGrabacionDeLaReunion.ts`,
  `lib/grabacion-de-reunion.ts`, `lib/grabacion-de-reunion.server.ts`): mezcla
  de audio en un `AudioContext` (voz del avatar + micrófono propio, con el
  `ConstantSourceNode` en silencio para que el grafo ruede) y video dibujado en
  un lienzo (avatar en grande; si hay pantalla compartida, el `<img>` MJPEG de
  `/api/videollamada/pantalla?stream=1` en grande y el avatar en miniatura).
  Un fichero de audio aparte a `AUDIO_BPS` siempre.
- Subir por partes de 8 MiB (relleno a 5 cifras, `composeObject`) a MinIO por
  una ruta propia firmada con la cita (la sala no tiene sesión), p. ej.
  `/api/videollamada/grabacion` (y añadir su prefijo al middleware, ver
  *Un `fetch` SIGUE las redirecciones*).
- Al cerrar: merge de JSONB en `raw.call` de la fila `tavus_<cita>`
  (`hasRecording`, `recordingUrl`, `videoUrl`), con paréntesis
  (`raw || (... )`, el `-` liga más fuerte que `||`). Si la fila aún no
  existe (la transcripción llega después), guardarlo en `videollamadas_ia` y
  que `anotarEnElCrm` lo copie.
- Pendiente de confirmar leyendo la sala: cámara del cliente (pista local, no
  se pinta) — decidir si entra en el lienzo o solo su audio.

### Pasos

1. Leer `SalaDeLaVideollamada.tsx` y confirmar pistas (avatar audio+video,
   micrófono y cámara del cliente).
2. Hook `useGrabacionDeLaVideollamada` reutilizando las piezas puras de
   Reuniones (no copiar: extraer si hace falta).
3. Ruta de partes firmada + unión + merge en `raw.call`.
4. `lib/fila-de-llamada.ts` / `CallsCrmClient.tsx`: exponer `isVideo` y
   `provider`; para Tavus usar `raw.call.recordingUrl`/`videoUrl`.
5. `CallDetailDialog.tsx`: título **«Detalle de la videollamada»** cuando
   `isVideo`; `<video controls preload="metadata">`; transcripción + Resumen
   IA; sin el «Reintentar» de AstraCalls en filas de Tavus.
6. Banco `scripts/banco-detalle-de-videollamada.sh` (sala montada con un Daily
   fingido, la ruta contra Postgres con bucket fingido y el diálogo en
   Chromium). `MODO=roto` pinchado a `5983031`.
7. Sección en `CLAUDE.md`, fusionar y comprobar el despliegue.

## Plan anterior (descartado: Tavus solo graba en Amazon S3)

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
