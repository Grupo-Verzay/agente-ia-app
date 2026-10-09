# Traspaso: chats que un asesor pierde al mover «Sesión»/«Agente» en /equipo — parte 3

Continúa `docs/traspaso-reasignacion-de-chats-parte-2.md` (rama del PR #1205,
`claude/affectionate-cray-xfn9oa`) y la parte 1
(`claude/pr-1201-chat-reassignment-8t7imo:docs/traspaso-reasignacion-de-chats.md`).
Léelas primero. **Este PR no lleva código todavía: solo este traspaso.**

## Encargo (del usuario, literal)

«Termina el arreglo conservando lo que ya existe, y reasigna a cada asesor los
chats que ya perdió por este comportamiento. Deja banco de pruebas. Crea el PR,
fusiona y despliega cuando esté probado.» (Esta entrega parcial: NO fusionar.)

## Lo que ya se sabe (no reexplorar)

- El interruptor de /equipo (`team-client.tsx` ~883) llama SOLO a
  `toggleAdvisorIa(asesorId, parte, val)` (`actions/team-actions.ts`) →
  `aplicarALasConversaciones` / `aplicarAUna` (`lib/ia-del-asesor-db.ts`, con
  `SELECT … "assigned_advisor_id" AS asesor … FOR UPDATE`) → `queHacerAlAsignar`
  (`lib/ia-del-asesor.ts` ~66-105). Por lectura de código **solo escribe**
  `status`, `agentDisabled`, `aiOptIn` y la marca en `asesor_ia_marcas`; **nunca
  `assigned_advisor_id`**.
- `releaseAdvisorSessions` (~262, pone `assigned_advisor_id` en NULL) y
  `deleteAdvisor` (~756) están aparte, detrás de diálogos de confirmación
  (team-client ~489, ~501).
- Descartado: la divergencia sidebar vs cliente (`laSesionDelChat` es idéntica a
  `getSessionForChat`).

## Hipótesis abiertas (en orden)

1. **Solo pantalla**: «Sesión» apagada pone `Session.status = false`, y `status`
   significa también «resuelta». Algún filtro/contador de Chats («Mías», conteos
   del sidebar ~893-987, filtro por asesor ~1106, `getTeamAdvisors`) o del backend
   (`releaseStaleEscalations`, `tryAssign`, porcentaje) puede estar tratándolas
   como resueltas/sin dueño.
2. Backend (`api-webhook`, fuera del alcance de GitHub de esta sesión): si la
   causa está ahí, decírselo a Carlos en una línea.
3. El reloj de sesiones de 60 s (`INTERVALO_MINIMO_DE_SESIONES`): no acelerarlo.

Sin leer todavía: `actions/advisor-assign-actions.ts` (llama a
`aplicarALasConversaciones` en ~170, 244, 376, 422, 453, 515: asignar, tomar,
transferir, soltar), detalles de `deleteAdvisor`, la consulta de conteos de
`getTeamAdvisors`, el filtro `'unassigned'` del sidebar, `lib/chat-session-match.ts`,
`getSesionesDeLaCuenta`.

## Prueba decisiva (siguiente paso)

Banco contra Postgres: `scripts/banco-reasignacion-de-chats.sh` +
`lib/__tests__/reasignacion-de-chats-db.test.mjs`, clonando
`scripts/banco-ia-del-asesor.sh` y `lib/__tests__/ia-del-asesor-db.test.mjs`
(misma entrada `lib/__tests__/fingido/entrada-del-ia-del-asesor.ts`, que ya
exporta `toggleAdvisorIa`, `getTeamAdvisors`, `assignSessionToAdvisor`,
`updateSessionStatus`, `toggleAgentDisabled`, `upsertSessionFromChatMessage`),
con **otro PGDIR y otro puerto**. Sembrar dueño + 2 asesores con sesiones
asignadas (algunas pausadas a mano); foto de
`assignedAdvisorId/status/agentDisabled/aiOptIn/asesor_ia_marcas`;
`toggleAdvisorIa(ANA,"sesion",false)` y `"agente",false`; comparar; volver a
encender; mensaje entrante con la sesión apagada; conteos de `getTeamAdvisors`
antes/después.

- **Si cambia `assignedAdvisorId`** → arreglar quien lo escribe + script de
  recuperación desde `AssignmentLog` (última asignación por conversación, sin
  pisar asignaciones posteriores, sin inventar), en seco por defecto, `--aplicar`
  escribe, conteo por asesor.
- **Si no cambia** → arreglar la LECTURA de la pantalla (buscar por id,
  `aplicarEnLaSesion`, nada de `return previous` mudo, `console.warn` si no
  casa). No tocar datos y decirle a Carlos que no hay nada que reasignar.

## Reglas del encargo

- Banco en dos modos; `MODO=roto` pinchado a `5983031` (nunca `origin/main`),
  comprobado en rojo quitando el arreglo.
- SQL en crudo con nombres de columna de la BASE (`assigned_advisor_id`,
  `ai_opt_in`), comprobados contra `information_schema`.
- Sin columnas nuevas en tablas del backend; tablas propias con `ddl()`.
- Ningún `catch` ni `return` mudo; cambios del asesor pintados al momento y
  devueltos si el servidor dice que no.
- Al terminar: sección corta en CLAUDE.md con la regla aprendida; PR con
  `draft: false`; fusionar, verificar la corrida de `docker-publish` del commit
  de la fusión; informe a Carlos en dos líneas de negocio.
