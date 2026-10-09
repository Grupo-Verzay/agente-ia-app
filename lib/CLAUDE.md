# lib/ — lógica compartida

Funciones puras (`*.ts`, testeables sin base) y de servidor (`*.server.ts`,
con Prisma/red). Los tests están en `lib/__tests__/` (`node --test`), con
dobles en `lib/__tests__/fingido/`; casi todos se lanzan desde su banco
`scripts/banco-*.sh`, que compila lo necesario con esbuild a
`lib/__tests__/.compilado/` (no versionado).

## Piezas que deciden reglas (usarlas, no copiarlas)

| Qué | Dónde |
| --- | --- |
| Marcas de tiempo en segundos | `epoch.ts` |
| Ids de WhatsApp, grupos y `@lid` | `id-de-whatsapp.ts` |
| DDL en caliente sin bloquear tablas | `ddl-sin-bloquear.ts` (`asegurarColumna`, `asegurarIndice`) |
| Saldo y créditos de IA | `saldo-de-la-cuenta.ts`, `ciclo-pagado.ts` |
| Vencimientos (un DÍA, no un instante) | `vencimiento.ts` |
| Envío por canal (Meta, Telegram) | `envio-por-canal.server.ts`, `linea-del-canal.server.ts` |
| Borrado de chats y lápidas | `borrado-de-chats.server.ts` |
| Recarga forzada con motivo | `hard-reload.ts` |
| Pantallas públicas con scroll | `pantalla-publica.ts` |
| Tarjetas de «Tutoriales del módulo» | `tutoriales-del-modulo.ts` |

## Reglas de este módulo

- Una regla vive en UNA función pura y todos la llaman; si hace falta en el
  backend, se copia byte a byte y un test lo vigila.
- Ningún fallo es mudo: `console.warn/info` se conservan en producción.
- Una tabla nuestra que no está en `schema.prisma` se lee con SQL en crudo y
  nombres de columna de la BASE. En SQL en crudo el código de Postgres
  (`42P01`…) viaja en `error.meta.code`, no en `error.code` (que es `P2010`).
- Una consulta que devuelve una página tiene que poder pararse (plazo).
- Dentro del servidor, trabajo en cola con N obreros, no lotes.
- Ninguna clave de IA ni del servidor de WhatsApp sale hacia el navegador.

## Detalle

`docs/reglas/README.md` — sobre todo `infraestructura-y-despliegue.md`,
`canales-lineas-y-correo.md` y `cobros-creditos-y-planes.md`.
