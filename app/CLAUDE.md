# app/ — pantallas y rutas (Next 14, App Router)

## Mapa

- `(root)/` — el panel con sesión: un directorio por módulo (`chats`, `crm`,
  `embudos`, `proyectos`, `reuniones`, `chat-equipo`, `correo`, `documentation`,
  `ia`, `flow`, `cobros`, `planes`…). `layout.tsx` hace `requireAuth`.
- `(auth)/` — `login`, `logout`, `register`.
- `(public)/`, `guia/`, `p/`, `propuesta/`, `planes`, `demo/`, `reunion/`,
  `videollamada/`, `bookings/`, `schedule/`, `t/` — páginas públicas.
- `api/` — rutas HTTP (chats, cron, webhooks, subidas, health).
- `global-error.tsx` y `error.tsx` — **no borrar**: sin `global-error.tsx`
  un fallo del layout raíz deja la pantalla en blanco y sin rastro.

## Reglas de este módulo

- **Ninguna ruta `/api` confía solo en el middleware**: comprueba sesión
  (`currentUser()`) y dueño del dato dentro de la ruta. Lo que se abre sin
  sesión (webhooks, públicas) se documenta como tal y valida su propio secreto.
- **Nada en `app/` es una maqueta**: las pruebas visuales van en el hilo.
- Una pantalla de fuera de `(root)` nace sin poder desplazarse (el `<body>` es
  `overflow-hidden`): declara su contenedor con
  `PANTALLA_PUBLICA_QUE_SE_DESPLAZA` (`lib/pantalla-publica.ts`).
- Una recarga forzada tiene que decir por qué (`lib/hard-reload.ts`).
- Un `fetch` sigue redirecciones: si el middleware manda una ruta de
  servidor a servidor a `/login`, quien llama recibe un `200` falso. Probar
  que la ruta se ALCANZA, no solo su manejador.
- Las páginas públicas (`/guia`, `/p`, `/propuesta`, `/planes`) siguen el tema
  de la App con tokens `--guia-*`, un pie común, y el contacto no se publica.
- Enseñar un panel en el menú y dejar pasar a su ruta son dos preguntas: el
  menú esconde, la ruta comprueba permisos.

## Dónde está el detalle

- Seguridad de rutas: `docs/reglas/seguridad-y-permisos.md`
- Fallos de build, pantalla en blanco, middleware: `docs/reglas/infraestructura-y-despliegue.md`
- Interfaz y maquetación: `docs/reglas/ui-componentes-y-maquetacion.md`
- Por módulo: `docs/reglas/README.md` (chats, llamadas, videollamadas,
  embudos/agenda, proyectos, finanzas, chat de equipo, documentación,
  guías públicas, propuestas y planes, agente IA y flujos).
- Chats tiene su propio `app/(root)/chats/CLAUDE.md`.
