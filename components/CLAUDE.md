# components/ — componentes de interfaz

`ui/` (shadcn/Radix), `shared/` (piezas comunes de la plataforma),
`custom/` (barra de arriba `Breadcrumbs.tsx`, etc.) y uno por dominio.

## Reglas de este módulo

- **La barra de una lista no se pinta a mano: `shared/BarraDeAcciones`.**
  Cinco huecos; la zona izquierda se desplaza (no crece) y lo de dentro no
  encoge; el buscador es un hueco aparte y el único fijo que cede. Lo que casi
  nadie toca va al `⋯`, que sale siempre. El botón azul dice «Nuevo».
- Las métricas van en la BARRA, no en tarjetas encima de la lista.
- La barra de pestañas que se corta lleva flechas y trae sola la activa.
- Paneles laterales: UNA medida para toda la plataforma; un panel a la vez.
- Diálogos: la X a 16 px del borde; UNA altura, el aire se resta en `rem`.
  Lo que se abre dentro de un flotante va encima, con `hideCloseButton`.
- Lo flotante mide el hueco y elige el lado donde CABE.
- Un `opacity-0` no libera sitio. `space-y-*` también da margen a un hijo
  absoluto. Un `padding` no encoge; un hijo del flex sí.
- En una fila de mandos, dos cosas distintas no llevan el mismo glifo.
- Un fondo claro FIJO necesita su tono de modo oscuro.
- La barra de escribir es UNA, compartida por las pantallas que la usan.
- El menú lateral se comprime solo al entrar a cualquier sección.

## Detalle

- `docs/reglas/ui-componentes-y-maquetacion.md`
- `docs/reglas/chats-interfaz.md`
- Pruebas visuales: bancos en Chromium (`scripts/CLAUDE.md`).
