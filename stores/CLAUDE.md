# stores/ — estado del cliente (zustand)

Stores con `create` de zustand: `useChatUnreadStore` (sin leer de Chats),
`useCorreosSinLeerStore`, `useTaskStore`, `ai-chat/useChatStore` (con
`persist`), `clients/`, `modules/useModuleStore` (etiqueta del módulo
activo), `reminders/`, `resellers/`, `ui/themeStore`. `index.ts` reexporta
algunos.

## Reglas de este módulo

- **Una sola fuente por dato.** Cada store dice en su cabecera quién lo
  escribe; nadie más lo escribe. P. ej. `useChatUnreadStore` lo escribe la
  bandeja y es exactamente el número de la pastilla «Sin leer».
- El número de la pestaña cuenta solo lo que exige respuesta.
- Un store es estado de pantalla: nada de permisos, saldo ni datos de otra
  cuenta. Lo que decide reglas se lee del servidor.
- Nada sensible en `persist` (claves, tokens, datos de clientes).

## Detalle

- `docs/reglas/chats-bandeja-y-tiempo-real.md` (sin leer, pestaña)
- `docs/reglas/ui-componentes-y-maquetacion.md`
