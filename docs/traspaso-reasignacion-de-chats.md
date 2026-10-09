# Traspaso: chats que se pierden al apagar el interruptor de un asesor (PR #1201)

Avance PARCIAL. Solo diagnóstico, sin ningún cambio de código. **No fusionar.**
Continúa el trabajo de `docs/traspaso-interruptor-del-asesor.md` (leerlo primero).

## Pedido (Carlos)
1. Terminar el diagnóstico: al apagar el interruptor de un asesor en `/equipo` («Sesión» o «Agente»),
   los chats que ya tenía asignados quedan sin asignar (o se ven así).
2. Arreglar conservando todo lo que ya funciona.
3. Reasignar a cada asesor los chats que ya perdió por este comportamiento.
4. Dejar banco de pruebas (dos modos, `MODO=roto` pinchado a un commit, nunca `origin/main`).
5. Crear PR, fusionar y desplegar **solo cuando esté probado y él lo diga**.

## Ya descartado
- `toggleAdvisorIa` (`actions/team-actions.ts`) → `aplicarAUna` (`lib/ia-del-asesor-db.ts`) →
  `queHacerAlAsignar` (`lib/ia-del-asesor.ts`): solo devuelve `status`, `agentDisabled`, `aiOptIn` y la
  marca. **Nunca escribe `assigned_advisor_id`.**
- `aplicarALasConversaciones`: tampoco lo escribe.

## Lo leído en este hilo
- `getSessionForChat` (`chat-sidebar.tsx` ~220-270): con una línea conocida solo mira
  `sessions[\`${linea}::${numero}\`]`; **no cae a la llave global** (el número pelado). Si la sesión del
  contacto solo está bajo la llave global, la fila sale «sin asignar» aunque la base siga intacta.
- `releaseAdvisorSessions` y `deleteAdvisor` solo se referencian en `team-actions.ts` y `team-client.tsx`.
- `team-client.tsx`: `deleteAdvisor(deleteTarget.id)` en ~489, `releaseAdvisorSessions(advisorId)` en ~501;
  el interruptor (~883) llama **solo** a `toggleAdvisorIa(advisor.id, parte, val)`. Falta leer el contexto
  de ~483-505 y ~870-900 para confirmar que ningún otro paso se encadena.

## Hipótesis abiertas
1. **Solo pantalla**: `getSessionForChat` no encuentra la sesión de la fila (se guarda bajo dos llaves:
   número y `linea::numero`) y se ve «sin asignar» aunque `Session.assigned_advisor_id` siga puesto.
2. Algo llama a `releaseAdvisorSessions` o `deleteAdvisor` junto con el interruptor.
3. El backend (`api-webhook`: reparto automático, `releaseStaleEscalations`) suelta los chats.
4. El reloj de sesiones (60 s, `INTERVALO_MINIMO_DE_SESIONES`) deja la lista con datos viejos justo
   después de apagar.

## La prueba que decide (hacerla primero)
¿`Session.assigned_advisor_id` cambia de verdad en la base al apagar el interruptor?
- **Cambia** → pérdida real de datos. Es el backend o una acción encadenada (hipótesis 2 o 3). Recuperar
  desde `AssignmentLog` (historial de asignaciones) y/o desde `asesor_ia_marcas`.
- **No cambia** → solo pantalla (hipótesis 1 o 4). Se arregla la lectura en Chats; **no se toca ningún dato**
  y no hay nada que reasignar (regla de CLAUDE.md: un problema de pantalla no toca datos).

Desde la nube no hay acceso a la base de producción: se reproduce en una base local (`db push`), con una
cuenta, un asesor y un par de conversaciones asignadas, apagando el interruptor con las acciones de verdad.

## Plan (en este orden)
1. Leer `team-client.tsx` ~483-505 y ~870-900, y `team-actions.ts` (`releaseAdvisorSessions` ~262,
   `deleteAdvisor` ~756, `toggleAdvisorIa`).
2. Leer `chats-client.tsx` ~671 (segunda copia de `getSessionForChat`) y el filtro `'unassigned'`
   (`chat-sidebar.tsx` ~945, ~1082, ~1106), `lib/chat-session-match.ts` y `getSesionesDeLaCuenta`.
3. Reproducir contra Postgres local y responder la prueba que decide.
4. Si es de pantalla: buscar la sesión por TODAS las identidades y por `id` (regla de Chats), sin caer en
   un `return` mudo. Si es de datos: corregir la causa (sin ablandar nada de `asesor_ia_marcas`).
5. Script de recuperación (solo si hubo pérdida real): por defecto **solo informa** (dry-run), `--aplicar`
   escribe, cuenta por asesor, y reasigna desde `AssignmentLog` sin pisar lo asignado después.
6. Banco con dos modos (`scripts/banco-*.sh`, ampliando `scripts/banco-ia-del-asesor.sh` o uno nuevo):
   `MODO=roto` contra un commit pinchado afirma el fallo.
7. Fusionar y desplegar solo si Carlos lo pide.

## Reglas de CLAUDE.md que aplican
- PR siempre LISTO para revisión (`draft: false`), nunca en borrador.
- Buscar por todas las identidades del contacto; ningún `catch` mudo; no rehacer la lista de Chats por clic;
  pintar en local antes del servidor; en SQL en crudo, columnas de la base (`assigned_advisor_id`).
- Scripts que cambian datos: dry-run por defecto.

## Cómo responderle a Carlos
Dos líneas, en español llano, sin nombres de archivos ni funciones.
