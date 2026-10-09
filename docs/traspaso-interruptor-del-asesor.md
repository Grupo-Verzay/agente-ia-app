# Traspaso: interruptor del asesor y chats que parecen «sin asignar»

Avance PARCIAL, solo diagnóstico, sin ningún cambio de código. No fusionar.

## Pedido (Carlos)
Al apagar el interruptor de un asesor en `/equipo` («Sesión» o «Agente»), los chats que ya tenía
asignados aparecen sin asignar. Solo diagnosticar; no arreglar hasta que él lo pida.

## Verificado
- Los interruptores van por `toggleAdvisorIa` (`actions/team-actions.ts`) → `lib/ia-del-asesor-db.ts`
  (`aplicarAUna`) → `queHacerAlAsignar` (`lib/ia-del-asesor.ts`).
- `queHacerAlAsignar` solo devuelve `status`, `agentDisabled` y `aiOptIn` (más la marca). **No puede
  tocar `assigned_advisor_id`**, y `aplicarAUna` no lo escribe. Por ese camino el asesor asignado no cambia.
- Los caminos que SÍ sueltan chats son `releaseAdvisorSessions` (`team-actions.ts`, ~262) y
  `deleteAdvisor` (~756). No se comprobó si algo los llama junto con el interruptor.
- En Chats, una fila cuenta como «sin asignar» si `chatSession` es nulo o su `assignedAdvisorId` es nulo
  (`chat-sidebar.tsx`: contador ~945, «Mías» ~1082, filtro `'unassigned'` ~1106). `chatSession` sale de
  `getSessionForChat(chat, chatSessions)` (línea 639).

## Hipótesis sin verificar
1. `getSessionForChat` no encuentra la sesión de esa fila (la sesión se guarda bajo dos llaves: el número
   y `linea::numero`) y la fila se ve «sin asignar» aunque en la base siga asignada.
2. Algo llama a `releaseAdvisorSessions` o `deleteAdvisor` junto con el interruptor.
3. El backend (`api-webhook`: reparto automático, `releaseStaleEscalations`) suelta los chats.
4. El reloj de sesiones (60 s) deja la lista con datos viejos justo después de apagar.

## Pendiente (en este orden)
1. Leer el cuerpo de `getSessionForChat` en `chat-sidebar.tsx:232` y en `chats-client.tsx:671`, y cómo se
   arma `chatSessions` (`lib/chat-session-match`, `getSesionesDeLaCuenta`).
2. Buscar quién llama a `releaseAdvisorSessions` / `deleteAdvisor`.
3. Mirar en la base si `Session.assigned_advisor_id` cambia de verdad al apagar (si cambia, es el backend;
   si no cambia, es solo de pantalla).
4. Revisar `ChatContactItem.tsx`, `ChatTabBar.tsx` y `AdvisorAssignBadge.tsx`.
5. Solo si Carlos lo pide: arreglar y añadir banco con `MODO=roto`.

## Cómo responderle
Dos líneas, en español llano, sin nombres de archivos ni funciones (ver «Cómo reportar al terminar»
en `CLAUDE.md`).
