# Traspaso: chats que "pierden" a su asesor — parte 2

**Estado: diagnóstico a medias. NO fusionar este PR.** Solo lleva este documento,
para que otro hilo continúe sin repetir lo ya hecho. No hay cambios de código.

Continúa lo que dejó el PR #1202 (rama `claude/pr-1201-chat-reassignment-8t7imo`):
lee antes `docs/traspaso-reasignacion-de-chats.md` y
`docs/traspaso-interruptor-del-asesor.md` de esa rama
(`git show origin/claude/pr-1201-chat-reassignment-8t7imo:docs/traspaso-reasignacion-de-chats.md`).

## Lo que pidió Carlos

Terminar el diagnóstico, arreglar conservando lo que ya existe, **reasignar a
cada asesor los chats que ya perdió** por este comportamiento, dejar banco de
pruebas y PR. En este hilo dijo además: no fusionar, dejar listo para seguir en
un hilo nuevo. Fusionar y desplegar solo si él lo autoriza de nuevo.

## Ya descartado (no volver a leerlo)

- El interruptor **«Sesión» / «Agente»** de `/equipo` (`toggleAdvisorIa` →
  `aplicarAUna` → `queHacerAlAsignar`, `actions/team-actions.ts`) solo devuelve
  `status`, `agentDisabled`, `aiOptIn` y la marca de `asesor_ia_marcas`. **Nunca
  escribe `Session.assigned_advisor_id`.**
- El `Switch` de `team-client.tsx` llama **solo** a `toggleAdvisorIa`. No llama a
  `releaseAdvisorSessions` ni a `deleteAdvisor`.
- `releaseAdvisorSessions` (pone `assigned_advisor_id = NULL` a todo lo del
  asesor) y `deleteAdvisor` son acciones aparte, cada una detrás de un diálogo
  de confirmación (`handleRelease`, `handleDelete`).

O sea: desde la App, apagar el interruptor no debería quitarle los chats a nadie.

## Hipótesis que siguen abiertas

1. **Solo pantalla.** La base está intacta pero Chats pinta la fila como "sin
   asignar": `getSessionForChat` (`chat-sidebar.tsx` ~220-270; copia en
   `chats-client.tsx` ~671) busca solo `sessions[\`${linea}::${numero}\`]` y no
   cae a la llave global. Si la sesión no está bajo esa llave, el asesor
   desaparece de la fila. Ojo: la regla de CLAUDE.md pide buscar la sesión por
   `id` (`aplicarEnLaSesion`) y avisar si no encaja nada.
3. **Backend (`api-webhook`).** Auto-asignación (`tryAssign`), reparto por
   porcentaje o `releaseStaleEscalations` pueden soltar/reasignar al pasar una
   conversación a pausada. **Ese repositorio está fuera del alcance de esta
   sesión**: si la causa está ahí, avisar a Carlos en una línea.
4. **Reloj de sesiones de 60 s** (`INTERVALO_MINIMO_DE_SESIONES`) con datos
   viejos. No se debe acelerar (regla de CLAUDE.md).

(La hipótesis 2 del traspaso anterior quedó descartada por lo de arriba.)

## La prueba que decide

> Al apagar el interruptor, ¿cambia `Session.assigned_advisor_id` en la base?

- **Cambia** → pérdida real. Hay que arreglar quién lo escribe y **recuperar**
  lo perdido desde `AssignmentLog` (última asignación por conversación, sin
  pisar asignaciones posteriores) y `asesor_ia_marcas`.
- **No cambia** → es solo lectura/pantalla. Arreglar Chats; **no hay nada que
  reasignar**, y hay que decirle a Carlos que los chats nunca se perdieron.

Desde la nube no hay acceso a la base de producción. Se reproduce en Postgres
local: levantar uno, `npx prisma db push`, sembrar una cuenta con dos asesores y
conversaciones asignadas, y llamar a las acciones reales de `team-actions.ts`
(solo se finge `currentUser()`, `revalidatePath` y `cache()`), como hacen
`scripts/banco-ia-del-asesor.sh` y compañía.

## Avance de este hilo (segunda sesión)

**La causa exacta SIGUE sin identificarse.** La prueba en Postgres que decide
**no se ha escrito ni corrido todavía**; Carlos ya la autorizó
("Sí, haz la prueba en Postgres local para confirmar la causa").

Lo que sí se confirmó leyendo código (sin ejecutar nada):

- `lib/ia-del-asesor-db.ts`: `aplicarALasConversaciones` y `aplicarAUna` solo
  **leen** `assigned_advisor_id` (`SELECT … "assigned_advisor_id" AS asesor …
  FOR UPDATE`) y escriben únicamente lo que devuelve `queHacerAlAsignar`.
- `lib/ia-del-asesor.ts` `queHacerAlAsignar` (líneas ~66-105): `datos` solo puede
  llevar `status`, `agentDisabled` y `aiOptIn`. Nunca el asesor.
- `lasConversacionesDelAsesor(asesorId, cuentaId)` = asignadas ∪ marcadas.

Hipótesis nueva (sin verificar, no darla por cierta): **`Session.status` tiene
doble sentido** ("conversación resuelta" y "IA pausada por intervención
humana"). El interruptor «Sesión» apagado pone `status = false`. Si Chats (filtro
o contadores) o el backend (`releaseStaleEscalations`, `tryAssign`, reparto por
porcentaje) leen `status = false` como "resuelta / sin dueño", el chat parecería
o quedaría desasignado sin que nadie toque `assigned_advisor_id`. Es la primera
cosa que hay que mirar después de la prueba.

Tampoco se leyó todavía `actions/advisor-assign-actions.ts` (llama a
`aplicarALasConversaciones` en ~170, 244, 376, 422, 453 y 515): ahí viven
asignar, tomar, transferir y soltar.

### Cómo escribir la prueba (andamio ya existente)

Copiar el patrón de `scripts/banco-ia-del-asesor.sh` y
`lib/__tests__/ia-del-asesor-db.test.mjs` (mismo Postgres local, mismo
`prisma db push`, mismo esbuild con los alias de `lib/__tests__/fingido/`; la
entrada `entrada-del-ia-del-asesor.ts` ya exporta `toggleAdvisorIa`,
`getTeamAdvisors`, `assignSessionToAdvisor`, `updateSessionStatus`,
`toggleAgentDisabled`, `upsertSessionFromChatMessage` y `db`). Los ayudantes
`quien(id)`, `sesion(asesor, extra)` y `leer(id)` del test existente sirven tal
cual (dueño, dos asesores con `ownerId` y `advisorRole: "agente"`, una fila de
`Instancias`).

Pasos:

1. Sembrar: dueño, dos asesores, varias conversaciones asignadas a cada uno
   (algunas con `status: true`, otras ya pausadas a mano).
2. Foto de antes: `assignedAdvisorId`, `status`, `agentDisabled`, `aiOptIn` y
   las filas de `asesor_ia_marcas`.
3. Llamar a `toggleAdvisorIa(asesor, "sesion", false)` y luego
   `toggleAdvisorIa(asesor, "agente", false)` (acciones reales).
4. Foto de después y comparar. **Pregunta única: ¿cambió `assignedAdvisorId`?**
5. Encender de nuevo (`true`) y comprobar que se devuelve solo lo que apagó el
   interruptor.
6. Opcional: simular un mensaje entrante (`upsertSessionFromChatMessage`) con el
   interruptor «Sesión» apagado y ver si algo reasigna o reabre.

### Siguiente paso según el resultado

- `assignedAdvisorId` **no cambia** → no hay pérdida en la base. Entonces el
  fallo es de lectura/pantalla (Chats) o del `status` leído por el backend:
  arreglar buscando la sesión por `id` (`aplicarEnLaSesion`) y, si el culpable
  es el backend, avisar a Carlos en una línea (ese repositorio no está en esta
  sesión). No hay nada que reasignar.
- `assignedAdvisorId` **cambia** → pérdida real: arreglar quién lo escribe y
  hacer el script de recuperación (ver "Plan según el resultado").

## Por leer todavía

- `actions/advisor-assign-actions.ts` (asignar, tomar, transferir, soltar).
- `getSessionForChat` en `chat-sidebar.tsx` y `chats-client.tsx`; el filtro y los
  contadores `'unassigned'` (`chat-sidebar.tsx` ~945, ~1082, ~1106). Mirar si
  usan `status` para decidir "sin asignar".
- `lib/chat-session-match.ts` y `getSesionesDeLaCuenta` (qué llaves llegan).
- `ChatContactItem.tsx`, `ChatTabBar.tsx`, `AdvisorAssignBadge.tsx`.
- `deleteAdvisor` en `actions/team-actions.ts` (~756), que no se leyó a detalle.
- (Ya leídos en este hilo: `lib/ia-del-asesor-db.ts`, `lib/ia-del-asesor.ts` y
  `scripts/banco-ia-del-asesor.sh`.)

## Plan según el resultado

1. Reproducir la prueba decisiva y anotar el resultado aquí.
2. Si es pantalla: buscar la sesión por `id` en todas sus llaves, nunca
   `return previous` mudo, y avisar en consola si no encaja. Banco con dos modos;
   `MODO=roto` pinchado a un commit (nunca `origin/main`) y comprobar que se pone
   rojo al quitar el arreglo.
3. Si es pérdida real: arreglar el origen, y escribir un script de recuperación
   **en seco por defecto, que solo escribe con `--aplicar`** (como
   `scripts/subir-clientes-a-su-licencia.mjs`), con conteo por asesor, usando
   `AssignmentLog`, sin inventar nada que no esté registrado y sin pisar
   asignaciones posteriores.
4. Añadir una sección corta a CLAUDE.md con la regla aprendida.
5. Reporte a Carlos: dos líneas, español llano, sin detalle técnico.

## Reglas de CLAUDE.md que aplican

- Los PR se abren LISTOS (`draft: false`), nunca en borrador.
- Nada de columnas nuevas en tablas del backend; tablas propias con `ddl()`.
- Ningún `catch` ni `return` mudo; usar `console.warn/info/error`.
- En SQL en crudo, nombres de columna de la BASE (`assigned_advisor_id`),
  comprobados contra `information_schema`.
- No acelerar el reloj de sesiones ni rehacer la lista de Chats por clic.
- Lo que cambia el asesor se pinta al momento y se revierte si el servidor dice no.
