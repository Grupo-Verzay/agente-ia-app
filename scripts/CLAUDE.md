# scripts/ — bancos de prueba y utilidades

- `banco-*.sh` (~260): un banco por regla o pantalla. Compilan con esbuild,
  corren `node --test` sobre `lib/__tests__/` y, si hace falta, Chromium
  (`/opt/pw-browsers`) sobre el CSS del build (`npm run build`).
- `sembrar-guia-*.mjs`, `generar-*`, `narracion-*`, `capturar-*`,
  `miniaturas-*`: producción de las guías públicas `/guia/<módulo>`.
- `comprobar-*.sh|mjs`: comprobaciones de solo lectura (entorno de agentes,
  tipos, tamaño de los `CLAUDE.md`).
- `vigilar-despliegue.mjs`, `despliegue-perdido.mjs`: red del despliegue.

## Reglas de este módulo

- **Todo banco tiene `MODO=roto`**: lee el código de antes (`ANTES_REF`,
  pinchado a un commit, nunca `origin/main`) y afirma que el fallo existía.
  Un banco que no se pone rojo sobre el código roto no prueba nada.
- Un banco que llama al manejador de una ruta no prueba que la ruta se alcance.
- Se cazan imports rotos sin esperar al build: `banco-importaciones.sh`.
- Ningún script escribe en un `CLAUDE.md`. Lo que un script quiera dejar
  escrito va a `docs/`.
- Los scripts que tocan producción solo leen (las llaves de Portainer son de
  administrador: no usarlas para cambiar nada).

## Detalle

- `docs/reglas/proceso-de-trabajo.md`
- `docs/reglas/guias-publicas.md` (producción de guías)
