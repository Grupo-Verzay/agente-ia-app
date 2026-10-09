# actions/ — acciones de servidor (`"use server"`)

Cada archivo `*-actions.ts` exporta acciones que el navegador llama
directamente. Todo lo que llega en sus argumentos es **dato del navegador**.

## Reglas de este módulo

- **El id que llega no decide nada: se comprueba.** Toda acción que reciba un
  `userId`, `sessionId` o id de recurso pasa antes por
  `assertCanAccessTargetUser` con el DUEÑO de ese recurso. Si el recurso no
  trae dueño, se resuelve con una consulta pequeña y luego se comprueba.
- Lo que llega es el id de la COSA: el dueño sale de la fila, no de otro
  parámetro. La cuenta de la acción sale de la línea de la fila.
- Un archivo `"use server"` solo exporta funciones asíncronas. La lógica pura
  o de sistema va a `lib/*.server.ts` o `lib/*.ts`.
- **Un runner de sistema no es una acción**: lo que corre un cron o un
  despachador del servidor vive en `lib/*.server.ts`, nunca exportado aquí
  (la guarda no lo cerraría, lo apagaría).
- El alcance va HACIA ABAJO (`puedeLlegarA`, `lasCuentasDeLaBandeja`): la
  familia de cuentas no es un alcance. Ninguna puerta sube.
- Lo que se lee por persona (`sessionUserId ?? id`) se escribe igual. Lo que
  firma una persona se guarda con su id, que no cambia al mudarla de cuenta.
- La configuración de la plataforma la decide `mandaEnLaCasaDeVerdad`; el
  súper administrador es la PERSONA y pasa por encima de todo.
- Todo uso de IA lo paga la cuenta DUEÑA de lo analizado; el saldo lo lee
  `lib/saldo-de-la-cuenta.ts`. `ia_credits.used` va en TOKENS y `total` en
  CRÉDITOS: no convertir uno en otro.
- Borrar en bloque es UNA acción de servidor, no N llamadas.
- Un envío automático que falla deja rastro (salud del envío).

## Detalle

- `docs/reglas/seguridad-y-permisos.md`
- `docs/reglas/cobros-creditos-y-planes.md`
- Por dominio: `docs/reglas/README.md`
