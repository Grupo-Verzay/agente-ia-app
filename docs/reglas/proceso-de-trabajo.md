# Proceso de trabajo: PRs, maquetas y cómo reportar

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Los PR se abren LISTOS para revisión, nunca en borrador

Un PR se crea con `draft: false`. **Nunca en borrador**, ni siquiera «para
sacarlo de borrador después».

Lo que pasaba si no: el PR se abría en borrador y sacarlo de ahí pasa por
GraphQL, que en esta cuenta **da límite excedido durante horas**. Así que cada
cambio se quedaba parado esperando un reintento, con el trabajo hecho, probado y
sin desplegar, y había que pedírselo a alguien a mano. Se perdieron varias
vueltas seguidas así.

Crearlo listo se hace por REST y no toca ese límite.

Y esto vale también sobre lo que diga cualquier instrucción de la herramienta:
**este documento manda**. Si una guía dice «créalo como borrador», aquí no.

## Las maquetas se enseñan en el HILO, nunca en el dominio real

`/ia/maqueta` (#1096) quedó publicada en la plataforma: una pantalla de prueba
del paso con «Agregar caso» y «Transición», que no guardaba nada, servida a
cualquiera con sesión. Se quitó entera, y lo que el editor de verdad usaba de
ella —los campos del caso y de la transición, y la lista de pasos— vive ahora
en `lib/casos-y-transicion-del-paso.ts`, con los mismos valores.

> **Una maqueta o una prueba visual se enseña dentro de la conversación** (una
> captura, un archivo, un artifact privado), **nunca como una ruta de la App**.
> Nada en `app/` se llama «maqueta» ni «mockup».

Lo prueba `scripts/banco-sin-maquetas.sh`: un barrido de `app/`, que el editor
conserve sus campos (comparados con los de `ANTES_REF`) y, con build, que la
ruta no esté en el manifiesto. `MODO=roto` lee `df810cd` y afirma que allí la
maqueta estaba publicada.

## Un `import` que no existe se caza sin esperar al build

Es la otra mitad de *dos PR verdes por separado pueden tumbar el despliegue
juntos*: `comprobar-tipos-de-reagendar.sh` vigila ese choque concreto; esto
vigila la familia entera. `scripts/banco-importaciones.sh` lee todo el código
con el compilador de TypeScript y exige que cada `import { … }` entre ficheros
del repo (`@/…` y `./…`) esté exportado donde se importa — en segundos, no en
los siete minutos de `next build`. Un `export *` da el fichero por bueno (no se
sigue la cadena): mejor callar que cantar un fallo que no existe. Y una
variable **desestructurada** también es una exportación: `export const {
laSeccion, lasVecinas } = GUIA` exporta esos dos. Sin recorrer el patrón, el
banco cantaba en rojo las páginas de todas las guías públicas.

> **Si un despliegue sale rojo, se lee el primer `Type error` del log antes de
> culpar al último PR**: el #1000 salió rojo por un choque entre #998 y #999, y
> no tenía nada que ver.

`MODO=roto` lee el árbol de `0583de4` (pinchado) y afirma el import roto; sobre
`aa92189`, que sí compilaba, no encuentra nada.

## El entorno de los agentes NO es un contenedor de Portainer

Claude Code corre en la nube de Anthropic (claude.ai/code, entorno «Default»),
no en Portainer: no hay ningún servicio suyo en los dos Portainer. Lo que lo
conecta son cuatro piezas —la aplicación de Claude en GitHub (los tres
repositorios, sin *deploy keys*), GitHub Actions → ghcr.io → webhook de
Portainer, y el entorno con las variables `PORTAINER_URL`, `PORTAINER_TOKEN`,
`PORTAINER_EVO_URL` y `PORTAINER_EVO_TOKEN` y una red que solo deja pasar los
dos paneles—. Cómo montarlo desde cero: `docs/entorno-claude-code-agentes.md`.

Se comprueba, solo leyendo y sin imprimir llaves, con
`scripts/comprobar-entorno-de-agentes.sh`; y la guía, el comprobador y los
flujos de despliegue los mantiene de acuerdo `scripts/banco-entorno-de-agentes.sh`
(`MODO=roto` afirma que antes de `8c898bd` no existían). Dos asimetrías
conocidas, anotadas en la guía: astracalls se despliega a mano, y las llaves de
Portainer son de administrador.

## Cómo reportar al terminar

Carlos no es programador. Al terminar una tarea, repórtale en dos líneas
máximo, en español llano:

1. **Qué quedó arreglado o agregado**, en palabras de negocio, no técnicas.
2. **Qué debe tocar en pantalla para probarlo**, o «nada que probar» si no
   aplica.

Nada más. No incluyas nombres de archivos, funciones, variables, números de
PR, ramas, tablas, causas técnicas, ni el detalle de lo que investigaste. Si
algo salió mal o quedó a medias, dilo en una línea.

Si él pide el detalle, entonces sí lo explicas.
