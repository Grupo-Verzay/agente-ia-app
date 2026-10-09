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

## Por leer todavía

- `getSessionForChat` en `chat-sidebar.tsx` y `chats-client.tsx`; el filtro y los
  contadores `'unassigned'` (`chat-sidebar.tsx` ~945, ~1082, ~1106).
- `lib/chat-session-match.ts` y `getSesionesDeLaCuenta` (qué llaves llegan).
- `lib/ia-del-asesor-db.ts`, `lib/ia-del-asesor.ts` y `scripts/banco-ia-del-asesor.sh`.
- `ChatContactItem.tsx`, `ChatTabBar.tsx`, `AdvisorAssignBadge.tsx`.
- `deleteAdvisor` en `actions/team-actions.ts` (~756), que no se leyó a detalle.

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
