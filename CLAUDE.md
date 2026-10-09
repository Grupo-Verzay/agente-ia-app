# agente-ia-app — reglas globales

App Next.js 14 (App Router) + Prisma/PostgreSQL de Verzay: Chats multicanal
(WhatsApp vía Evolution/Waha, Meta, Telegram), CRM, agente IA, llamadas y
videollamadas. El backend (`api-webhook`) es otro repo y comparte la base.

## Este archivo y los demás `CLAUDE.md` son de solo lectura para agentes

- **Ningún agente, script o hook escribe en ningún `CLAUDE.md`.** Lo bloquean
  `.claude/settings.json` (hook `bloquear-claude-md`), el pre-commit y el CI.
- Cada aprendizaje, registro o regla nueva va a `docs/reglas/<tema>.md` como
  una sección `## ...` (índice: `docs/reglas/README.md`). Si no encaja en
  ningún tema, archivo nuevo en `docs/reglas/` y una línea en su índice.
- Tope duro: 2.000 tokens por `CLAUDE.md` (`scripts/comprobar-claude-md.mjs`).
  Solo una persona, fuera de Claude Code, edita un `CLAUDE.md`.

## Reglas que no se tocan

1. **Los PR se abren LISTOS (`draft: false`), nunca en borrador**: sacarlos de
   borrador pasa por GraphQL, que en esta cuenta da límite durante horas.
2. **Las maquetas se enseñan en el hilo** (captura, archivo, artifact privado),
   nunca como ruta de la App. Nada en `app/` se llama «maqueta».
3. **Toda acción y toda ruta comprueban de quién es el dato**
   (`assertCanAccessTargetUser`); ninguna ruta `/api` confía solo en el
   middleware. El alcance va siempre hacia ABAJO, nunca sube.
4. **Ningún fallo puede ser mudo.** No quitar `warn`/`info` de
   `removeConsole` en `next.config.js`.
5. **Next ≥ 14.2.25** (CVE-2025-29927). No bajar.
6. **El esquema lo migra el backend**, nunca este repo
   (`docs/db-migrations-ownership.md`). DDL en caliente solo por
   `lib/ddl-sin-bloquear.ts`.
7. Las claves (IA, servidor de WhatsApp) nunca viajan al navegador.
8. Si un despliegue sale rojo, leer el primer `Type error` del log antes de
   culpar al último PR.

## Al terminar: cómo reportar

Carlos no es programador. Dos líneas en español llano: qué quedó arreglado
(en palabras de negocio) y qué tocar en pantalla para probarlo (o «nada que
probar»). Sin archivos, funciones, PR ni ramas, salvo que pida el detalle.

## Índice: dónde está cada cosa

| Tema | Dónde |
| --- | --- |
| Reglas por tema (con el porqué) | `docs/reglas/README.md` |
| Pantallas y rutas | `app/CLAUDE.md` |
| Chats | `app/(root)/chats/CLAUDE.md` |
| Acciones de servidor y permisos | `actions/CLAUDE.md` |
| Lógica compartida y tests | `lib/CLAUDE.md` |
| Componentes e interfaz | `components/CLAUDE.md` |
| Estado del cliente (zustand) | `stores/CLAUDE.md` |
| Base de datos | `prisma/CLAUDE.md` |
| Bancos de prueba y scripts | `scripts/CLAUDE.md` |
| Despliegue e infraestructura | `deploy/CLAUDE.md` |
| Autenticación | `auth.ts`, `auth.config.ts`, `middleware.ts`, `app/(auth)/` → `docs/reglas/seguridad-y-permisos.md` |
| Emergencias | `docs/manual-emergencia.md` |
| Entorno de los agentes | `docs/entorno-claude-code-agentes.md` |
| Copia íntegra del CLAUDE.md antiguo (1,6 MB) | `docs/_respaldo/CLAUDE_completo.md` — no leerla entera |

Un comentario del código que dice «ver CLAUDE.md, «X»» se refiere al archivo
antiguo: busca «X» con `grep -rn "X" docs/reglas/`.
