# Traspaso: barra de arriba (casita + Chats / Correos / Llamadas)

Avance PARCIAL, sin probar en navegador. No fusionar hasta terminar.

## Pedido
1. Casita después de las flechas del menú y antes del contenedor Chats/Correos.
2. Tercer bloque «Llamadas» → `/crm/llamadas`, sin contador.
3. Contenedor centrado en la columna de la lista; casita aparte a la izquierda.
4. Entrar por la casita debe permitir scroll igual que por el icono lateral de Panel.

## Hecho
- `lib/alternar-bandejas.ts`: `BANDEJAS` con Llamadas; `lasBandejasQueSeVen` (Llamadas solo si está en el menú); `dondeVaElSelector` y `anchoCon` aceptan `cuantas`.
- `components/shared/AlternarBandeja.tsx`: casita a la izquierda (`left = inicio`), selector desplazado a su derecha; el clic hace lo mismo que el menú lateral (`setLabelModule` + `router.push(resolveModuleItemDest(...))`); icono `Phone` para Llamadas.

## Hipótesis del scroll (sin verificar)
La casita era un enlace simple: no fijaba la etiqueta del módulo ni resolvía el destino del Panel, y el scroll vive en `[data-caja-del-contenido]` (el `<body>` es `overflow-hidden`).

## Pendiente
- Revisar `dondeVaElSelector`: define constantes locales que ocultan las exportadas del módulo.
- Actualizar comentarios de cabecera de `lib/alternar-bandejas.ts` y de `Breadcrumbs.tsx` (siguen hablando de Chats/Correos).
- Replicar fielmente el destino del Panel de `nav-main.tsx` (reseller, portada, primer subitem).
- Confirmar el scroll en navegador.
- Extender `scripts/banco-barra-de-arriba.sh` (casita tras el menú, tres bloques centrados, Llamadas sin contador, scroll; `MODO=roto` contra `d7e8df7`).
- Typecheck filtrado (`alternar-bandejas|AlternarBandeja`), tests, build; documentar en `docs/reglas/` (nunca en un CLAUDE.md).
