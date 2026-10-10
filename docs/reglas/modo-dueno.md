# Modo Dueño: gobernanza en el servidor

> Reglas del Modo Dueño por WhatsApp (y de lo que venga encima: llamadas, MCP).
> Diagnóstico de partida: `docs/diagnostico-modo-dueno-y-mcp.md`. Bancos:
> `scripts/banco-modo-dueno.sh` (App) y `api-webhook/scripts/banco-modo-dueno.sh`
> (motor). Para añadir un aprendizaje: una sección `## ...` aquí. **Nunca en un
> `CLAUDE.md`.**

## Las cinco reglas viven en UN sitio: `lib/motor-del-dueno.server.ts`

Antes la confirmación vivía en un `Map` del backend, el plan no se miraba, la
bitácora era un resumen y deshacer solo existía para el entrenamiento. Ahora
toda orden, venga del canal que venga, pasa por el motor de la App:

1. **Confirmación obligatoria.** Una ruta de acción (`rutaDeAccion`) nunca
   ejecuta: PREPARA. Guarda una fila `pendiente` en `owner_acciones` con los
   datos ya resueltos (el contacto por su `sessionId`, el asesor por su id) y
   devuelve el texto exacto a confirmar, que arma el servidor
   (`textoDeConfirmacion`), no la IA. Se ejecuta solo con un «sí» limpio de la
   MISMA persona en `/api/owner/turn`, y se ejecuta LO QUE SE MOSTRÓ. Un
   `confirmed: true` en el cuerpo ya no significa nada: confirmar es una
   respuesta de la persona, no un campo del que llama.
2. **Historial y reversión.** Cada acción guarda `antes` (solo los campos que
   cambia) y una huella de `despues`. `owner_revertir_accion` lo deshace, también
   con confirmación, y **no pisa un cambio posterior**: si el dato ya no es el
   que dejó la acción, se niega. Fotos de las 5 últimas acciones de cada cosa
   (`podarFotos`), como las 5 versiones del entrenamiento.
3. **Bitácora.** `owner_acciones` guarda cuenta, persona (nombre y número),
   canal, el texto EXACTO de la orden (`pedido`), lo que se le mostró
   (`resumen`), lo que contestó (`respuesta`), las horas y el resultado. Las
   consultas también (`consulta`) y los rechazos (`rechazada`, con motivo).
   Ningún barrido la toca; las filas `owner-command` de `audit_logs` tampoco
   caducan a los 90 días (`log-cleanup.service.ts` del motor).
4. **Plan.** Cada herramienta declara su módulo (`lib/herramientas-del-dueno.ts`,
   la tabla «herramienta → rutas»). Antes de consultar o preparar, y otra vez
   antes de ejecutar, la cuenta tiene que ALCANZAR alguna de esas rutas con
   `quienesAlcanzanLaRuta` (la misma regla que pinta los candados). Si no:
   «esa función no está incluida en el plan», nunca se intenta.
5. **Alcance.** Todo filtra por la cuenta de quien ordena; el panel del Modo
   Dueño pasa por `assertCanAccessTargetUser` (antes cualquier admin o reseller
   tocaba el de cualquier cuenta).

**Una herramienta nueva** = una línea en `HERRAMIENTAS_DEL_DUENO` (módulo,
tipo, si es irreversible) + una entrada en `ACCIONES` del motor (preparar,
ejecutar y, si se puede, revertir) + una ruta con `rutaDeAccion`/`rutaDeConsulta`.
El barrido de `modo-dueno.test.mjs` falla si una ruta `/api/owner/*` ejecuta
por su cuenta.

## Un «sí» tiene que ser SOLO un sí (`queDiceLaRespuesta`)

El backend miraba solo el comienzo: «ok pero a otro número» empezaba por «ok»
y **ejecutaba la acción original**. Ahora cada palabra del mensaje tiene que
estar en el vocabulario de confirmar y al menos una tiene que confirmar. Una
palabra de fuera lo convierte en «otra»: la pendiente se DESCARTA, se le avisa
(«Descarté… no se hizo nada») y el mensaje sigue hacia la IA con ese contexto,
que lo trata como la corrección. Nada caduca en silencio: un «sí» tarde dice
que caducó (10 minutos).

## La pendiente vive en la base, no en la memoria de un proceso

`owner_acciones` es de la App (`lib/acciones-del-dueno-db.ts`, con
`ddl-sin-bloquear`). Decidir una pendiente es un `UPDATE … WHERE estado =
'pendiente' RETURNING`: una sola réplica y una sola vez. Lo que se comprobó al
preparar (verificación, plan) se vuelve a comprobar antes de ejecutar.

## Identidad: número exacto + código de verificación (PIN)

- `elNumeroEsDelDueno` (`lib/identidad-del-dueno.ts`, **copia byte a byte** en
  `api-webhook/src/utils/identidad-del-dueno.ts`): iguales; o guardado sin
  código de país (8–10 dígitos) y el remitente termina en él; o los dos con
  código de país, misma cola de 10 y mismos dos primeros dígitos (México 52/521,
  Argentina 54/549). Antes bastaba la cola: +52 300… entraba por +57 300….
- **Código de verificación**: en Perfil › Comportamiento › Modo Dueño, la llave
  junto a cada persona genera 6 dígitos (15 min, se ven una vez). La persona los
  manda por WhatsApp. Sin verificar puede CONSULTAR, pero nada que cambie algo
  se prepara. Caduca a los 30 días sin uso; cinco fallos queman el código.
- **`@lid` sin traducir**: si quien escribe con el número oculto manda un
  código vigente, la App ata ese `@lid` a la persona del código
  (`owner_identidad.lid`) y el motor la reconoce desde entonces. Antes se la
  trataba como cliente (Waha) o se descartaba el mensaje (Evolution).
- El panel exige números de 8 dígitos o más y como mucho 5 personas, también en
  el servidor.

## Mover un lead y restaurar el entrenamiento ya no dependen de la sesión

- `cambiarElEstadoDelLead` (`lib/estado-del-lead.server.ts`) es el cuerpo sin
  puerta de `updateSessionLeadStatus`. El Modo Dueño llamaba a la acción, que
  pedía la sesión del navegador: **fallaba siempre** con «No autorizado».
- `restaurarYPublicar` (`lib/entrenamiento-del-agente.server.ts`): restaurar
  una versión desde el editor dejaba `promptText` —lo que lee el agente— con la
  versión de antes hasta el siguiente «Guardar». Ahora restaurar publica.

## Escribir el historial no es un POST del navegador

`writeAuditLog` vive en `lib/registro-de-cambios.server.ts` (`server-only`).
Exportado desde `actions/audit-log-actions.ts` (`"use server"`) era un endpoint:
cualquiera con sesión escribía filas de historial a nombre de cualquier cuenta.

## Llamadas: cómo se extendería la identidad (evaluación, sin construir)

Hoy una llamada del dueño la contesta el bot de ventas: ni `handleCallEvent` ni
`VoicebotService.resolve` miran quién llama. Para la Fase 3:

1. **Reconocer**: `resolve` recibe `from` (JID completo o `@lid`); se le pasa a
   `quienEsElDueno` del motor, la MISMA función que el texto (número exacto o
   `@lid` atado). Si es una persona autorizada, se devuelve el prompt y las
   herramientas del dueño en vez de las de ventas.
2. **Segundo factor por voz**: una llamada no tiene por dónde recibir el
   código del panel. Propuesta: que solo entre en Modo Dueño quien ya esté
   verificado por texto (`estaVerificado`) y, antes de preparar cualquier
   cambio, pedirle de viva voz un código de 6 dígitos generado en ese momento
   en el panel (el mismo `generarCodigoDeVerificacion`). Las consultas pueden ir
   sin él.
3. **Confirmar**: el mismo motor. Las herramientas de la llamada preparan
   (`rutaDeAccion`) y la confirmación por voz pasa por `/api/owner/turn` con el
   texto transcrito del turno; `queDiceLaRespuesta` sirve igual. La pendiente ya
   vive en la base, así que no depende del proceso de AstraCalls.
4. **Bitácora**: `canal = 'whatsapp_llamada'` y el `pedido` es la transcripción
   del turno.
