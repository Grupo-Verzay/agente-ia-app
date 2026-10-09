# Chats — contexto del módulo

Pantalla principal: `_components/chats-client.tsx` (lista + conversación +
paneles). Datos: `app/api/chats/*` (`bootstrap`, `lista`, `conversacion`,
`sesiones`, `buscar`), `actions/chat-actions.ts`, `actions/chat-manual-actions.ts`,
`hooks/chats/useChatsRealtime.ts`, `lib/chat-persistence.ts`, `lib/waha.ts`.

## Reglas que más se rompen

**Tiempo y carga**
- El reloj (sondeo) responde; el tiempo real solo adelanta. Nada que detecte
  un fallo va detrás de algo que pueda fallar.
- Marcas de tiempo **siempre en segundos** (`lib/epoch.ts`).
- Toda petición lleva plazo (también «Cargar mensajes anteriores»); agotar la
  espera no es tirar la respuesta. Una consulta paginada tiene que poder pararse.
- Muchas peticiones pequeñas son turno, no trabajo: una cola, no lotes.
- La lista es grande: no rehacerla por gusto (`React.memo`, regla estable al
  hacer scroll). La bandeja no espera a crear fichas que faltan (van de fondo).
- «Todos» son las ACTIVAS: ni borradas, ni archivadas, ni resueltas.

**Identidad y línea**
- De qué chat viene lo dice `remoteJid`, no el primer teléfono. Buscar la fila
  por TODAS las identidades (`contact.aliases` no son todas; `@lid` se usa entero).
- La salida es la línea de la CONVERSACIÓN, resuelta al enviar; el proveedor
  sale de la fila. Ficha, etiquetas y atajos son los de SU línea/cuenta.
- La sesión se busca por su id, no por el número.

**Estado de la conversación**
- Un mensaje entrante deja el chat SIN LEER; solo lo limpia abrirlo.
- Archivada/resuelta vuelven solo si escribe el CONTACTO. Bloquear no se
  levanta solo. Resincronizar historial NO es novedad.
- Eliminar deja una LÁPIDA (`chats_eliminados`); borrar en bloque marca ya y
  purga de fondo, con el universo leído en el servidor.
- Lo que se cambia desde la conversación abierta pinta SU fila al momento
  (avisa con el id de la sesión).

**Interfaz**
- Formato de WhatsApp, no markdown. Un panel a la vez, todos por la derecha,
  como TERCERA columna; lo flotante mide el hueco y elige el lado donde cabe.
- Quitar un mando de la fila no quita su dato. Ninguna pastilla más estrecha
  que alta; el renglón de pastillas mide su hueco.

## Detalle

- `docs/reglas/chats-bandeja-y-tiempo-real.md`
- `docs/reglas/chats-datos-y-acciones.md`
- `docs/reglas/chats-interfaz.md`
- `docs/reglas/canales-lineas-y-correo.md` (proveedores, líneas, `@lid`)
- Alcance de la bandeja entre cuentas: `docs/reglas/seguridad-y-permisos.md`
