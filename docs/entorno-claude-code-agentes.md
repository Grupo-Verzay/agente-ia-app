# El entorno de Claude Code para los agentes de sistemas

Cómo está montado hoy y cómo montarlo igual desde cero en una cuenta nueva de
Claude. Escrito para seguirlo sin conocimientos técnicos, en orden.

Auditado el 2026-09-29, mirando el entorno de verdad (no la memoria de nadie).
Para comprobarlo tú mismo en cualquier momento, pídele a una sesión de Claude
Code: *«corre `scripts/comprobar-entorno-de-agentes.sh`»*. Solo lee; no cambia
nada.

---

## 1. Lo primero que hay que saber

**No hay ningún contenedor de Claude Code en Portainer.** Se miraron los dos
Portainer, servicio por servicio, y no existe ninguno.

Los agentes corren **en la nube de Anthropic**, en claude.ai/code. Cada vez que
abres una sesión, Anthropic enciende una máquina nueva, le baja los
repositorios de GitHub, y la apaga cuando la sesión termina. Tú no la ves ni la
administras.

Portainer es otra cosa: es **donde vive la plataforma** (la App, el backend,
Evolution, WAHA…). Los agentes solo lo **miran**, con una llave que les diste.

```
   Tú (claude.ai o la app del móvil)
        │
        ▼
   Sesión de Claude Code ── en la nube de Anthropic, entorno «Default»
        │            │
        │            └── mira (solo lectura) ──► Portainer .148  (panel-n8n.ia-app.com)
        │                                        Portainer .233  (panel-evo.ia-app.com)
        ▼
   GitHub (3 repositorios, por la aplicación de Claude)
        │  el agente abre un PR → se fusiona
        ▼
   GitHub Actions construye la imagen y la sube a ghcr.io
        │  y llama al «webhook» de Portainer con la versión exacta
        ▼
   Portainer (.148) cambia el servicio a la versión nueva
```

Por eso montar «un entorno igual» no es crear un contenedor: son **cuatro
piezas que se conectan entre sí** —GitHub, Portainer, GitHub Actions y el
entorno de Claude— y esta guía las monta en orden.

---

## 2. Lo que hay hoy (inventario)

| Pieza | Cómo está |
| --- | --- |
| Cuenta de Claude | la del correo de Verzay, con Claude Code |
| Entorno de Claude Code | uno solo, llamado **Default**, «nube de Anthropic», creado el 2026-07-18 |
| Repositorios | `Grupo-Verzay/agente-ia-app` (la App, **público**), `Grupo-Verzay/api-webhook` (el backend, privado) y `Grupo-Verzay/astracalls` (las llamadas, privado). Los tres con permiso de escritura |
| Cómo entra a GitHub | la **aplicación de Claude para GitHub**, instalada en la organización Grupo-Verzay. No hay llaves SSH ni *deploy keys*: no hacen falta |
| Variables del entorno | cuatro: `PORTAINER_URL`, `PORTAINER_TOKEN`, `PORTAINER_EVO_URL`, `PORTAINER_EVO_TOKEN` |
| Red del entorno | **restringida**: deja pasar GitHub, los registros de paquetes y los dos Portainer. **No** deja pasar `agente.ia-app.com` ni `api.openai.com` |
| Script de arranque | ninguno propio: el que trae Anthropic basta |
| Portainer .148 (`panel-n8n.ia-app.com`) | la App (`agente-app`, 2 réplicas), el backend (`backend-app`, 1 réplica), LibreChat, las WordPress, mantenimiento, Traefik |
| Portainer .233 (`panel-evo.ia-app.com`) | Evolution (`evo` … `evo5`), WAHA, las llamadas (`wacalls`), Redis, Traefik |
| Despliegue de la App | automático: al fusionar en `main` |
| Despliegue del backend | automático: al fusionar en `master` |
| Despliegue de las llamadas | **a mano**: el flujo de astracalls construye la imagen `latest` pero no avisa a Portainer |
| Secreto en GitHub | `PORTAINER_WEBHOOK_URL` en `agente-ia-app` y en `api-webhook` |

El día de la auditoría, lo que corre en producción era exactamente lo último
fusionado en los tres repositorios.

---

## 3. Hallazgos

Cosas que conviene saber antes de copiarlo, de más a menos importante.

1. **Las dos llaves de Portainer son de ADMINISTRADOR.** Con ellas se puede
   borrar cualquier stack, incluida la App. Las normas del proyecto dicen que
   los agentes solo miran, pero la llave les deja hacer mucho más. En la cuenta
   nueva, la llave debería ser de un usuario de Portainer que **no** sea
   administrador (paso 6).
2. **El PR automático sale como BORRADOR**, y las normas del proyecto
   (`CLAUDE.md`) prohíben los PR en borrador porque sacarlos de ahí se atasca.
   Los agentes lo corrigen a mano cada vez. En la cuenta nueva, apágalo (paso 8).
3. **La red no deja ver la App publicada** (`agente.ia-app.com`). El agente
   sabe que desplegó porque lo ve en Portainer, pero no puede abrir
   `/api/health` para confirmar que la App contesta. Conviene añadir ese
   dominio (paso 7).
4. **Las llamadas (astracalls) no se despliegan solas**, a diferencia de la App
   y del backend. Hoy alguien tiene que actualizar el servicio `wacalls_wacalls`
   en el Portainer .233 después de cada cambio. No se cambió en esta auditoría:
   hacerlo automático exige crear el webhook en ese Portainer y guardar su
   secreto en GitHub, y eso lo decides tú (ver «Pendiente» al final).
5. **Los stacks están en modo «editor»**, no conectados a Git. Lo que manda en
   producción es lo que hay pegado en Portainer, no el archivo del repositorio.
   Nunca pegues la plantilla del repositorio encima sin copiar antes los
   secretos del stack que ya corre (lo explica `CLAUDE.md`).
6. **La plantilla del backend (`api-webhook/portainer-stack.yml`) tiene
   contraseñas escritas dentro.** El repositorio es privado, pero cualquiera con
   acceso a él las lee. Recomendado: cambiarlas y dejarlas solo en Portainer.

---

## 4. Paso a paso para montarlo desde cero

Hazlo **en este orden**: cada paso usa algo que crea el anterior.

Los nombres exactos de los botones pueden cambiar un poco con el tiempo; busca
el más parecido.

### Paso 1 — La cuenta de Claude

1. Entra en claude.ai con la cuenta nueva.
2. Comprueba que el plan incluye **Claude Code** (debe aparecer «Code» en el
   menú de la izquierda, o poder abrir claude.ai/code).

### Paso 2 — GitHub: conectar Claude a los repositorios

1. Necesitas ser **dueño** de la organización de GitHub (Grupo-Verzay, o la
   nueva). Si no lo eres, pídeselo a quien lo sea.
2. Entra en **claude.ai/connect-github** con la cuenta nueva de Claude.
3. Pulsa **Conectar** e inicia sesión en GitHub.
4. Cuando GitHub pregunte dónde instalar la aplicación de Claude, elige la
   organización y marca **«Solo repositorios seleccionados»**.
5. Marca los tres: `agente-ia-app`, `api-webhook` y `astracalls`.
6. Acepta los permisos que pide (leer y escribir código, *pull requests* y
   ver las Actions). **No hace falta crear llaves SSH, *deploy keys* ni tokens
   personales**: la aplicación de Claude hace de llave.

### Paso 3 — GitHub Actions: construir la imagen al fusionar

Esto **ya está hecho en los repositorios** (los archivos
`.github/workflows/…`). Si usas los mismos repositorios, sáltalo. Si son
repositorios nuevos, copia esos archivos tal cual.

En `agente-ia-app` hay además un segundo flujo, **`despliegue-perdido`**, que
cada diez minutos mira si el último commit de `main` tiene su corrida de
`docker-publish` y, si no tiene NINGUNA, la lanza. Existe porque el aviso de
push de GitHub se puede perder: el 29-09 la fusión del #1047 se quedó sin
corrida y producción siguió una versión atrás sin que nada lo dijera. No
relanza una corrida en rojo ni una cancelada. Cópialo también.

Lo único que hay que revisar en cada repositorio:

1. GitHub → el repositorio → **Settings → Actions → General**.
2. En **Actions permissions**, que esté permitido ejecutar Actions.
3. Tras la primera construcción aparecerá un paquete en
   **github.com/orgs/Grupo-Verzay/packages** (`agente-ia-app`, `api-webhook`,
   `wacalls`). Si el repositorio es privado, su paquete también lo es: Portainer
   necesitará la llave del paso 4.

### Paso 4 — Portainer: que pueda bajar las imágenes

Hazlo en los **dos** Portainer.

1. En GitHub, con tu usuario: **Settings → Developer settings → Personal access
   tokens → Tokens (classic) → Generate new token**. Nombre: `portainer-ghcr`.
   Marca **solo** `read:packages`. Guárdalo en tu gestor de contraseñas, no en
   un chat.
2. En Portainer: **Registries → Add registry → Custom registry**.
   - Nombre: `ghcr`
   - URL: `ghcr.io`
   - Autenticación: activada. Usuario: tu usuario de GitHub. Contraseña: el
     token del punto 1.
3. Guardar.

> No se pudo leer esta parte en la auditoría (los registros llevan
> credenciales y se dejaron fuera a propósito). Que las imágenes privadas se
> estén bajando hoy indica que está hecho; en la cuenta nueva, hazlo tú.

### Paso 5 — Portainer y GitHub: el despliegue automático

Una vez por cada servicio que se despliega solo: la App (`agente-app_verzay_app`)
y el backend (`backend-app_api-webhook-verzay`), los dos en el Portainer .148.

1. En Portainer: **Services →** el servicio → baja hasta **Service webhook** y
   actívalo.
2. Copia la dirección que aparece (empieza por `https://panel-n8n…/api/webhooks/`).
3. En GitHub → el repositorio de ese servicio → **Settings → Secrets and
   variables → Actions → New repository secret**.
   - Nombre: `PORTAINER_WEBHOOK_URL` (exactamente así)
   - Valor: la dirección del punto 2.
4. Guardar.

> **Ojo:** cada vez que en Portainer pulses **«Update the stack»**, el servicio
> se recrea y su webhook cambia. Si después de eso un despliegue sale en rojo
> con «El webhook de Portainer falló», repite este paso con la dirección nueva.
> El flujo está hecho para fallar en rojo y decirlo: nunca se queda un
> despliegue a medias sin avisar.

### Paso 6 — Portainer: las llaves para Claude

Una llave en **cada** Portainer.

1. Recomendado (hallazgo 1): crea antes un usuario propio para Claude.
   **Users → Add user**, nombre `claude-code`, **sin** marcar administrador.
   Luego **Environments → primary → Manage access** y dale acceso a ese
   usuario. Así la llave puede mirar pero no borrar stacks.
2. Entra en Portainer **con ese usuario** → arriba a la derecha, tu nombre →
   **My account → Access tokens → Add access token**. Descripción:
   `claude-code`.
3. Copia la llave **en ese momento**: Portainer no la vuelve a enseñar.
4. Repite en el otro Portainer.

Tendrás cuatro datos. No los pegues en ningún chat:

| Nombre | Qué va |
| --- | --- |
| `PORTAINER_URL` | `https://panel-n8n.ia-app.com` (el Portainer de la App) |
| `PORTAINER_TOKEN` | la llave de ese Portainer |
| `PORTAINER_EVO_URL` | `https://panel-evo.ia-app.com` (el Portainer de WhatsApp) |
| `PORTAINER_EVO_TOKEN` | la llave de ese Portainer |

### Paso 7 — El entorno de Claude Code

1. Abre **claude.ai/code** con la cuenta nueva.
2. En la barra de arriba de una sesión está el **selector de entorno**. Ábrelo
   y elige **Añadir entorno** (o **Editar** sobre «Default»).
3. **Nombre:** `Default` (o el que quieras).
4. **Acceso a la red:** elige el nivel **personalizado** (dominios
   permitidos) y añade:
   - `panel-n8n.ia-app.com`
   - `panel-evo.ia-app.com`
   - `agente.ia-app.com` ← recomendado (hallazgo 3); hoy no está
   Los de GitHub y los registros de paquetes vienen permitidos de fábrica.
5. **Variables de entorno:** pega las cuatro, una por línea, así (con tus
   valores de verdad en lugar de los puntos):
   ```
   PORTAINER_URL=https://panel-n8n.ia-app.com
   PORTAINER_TOKEN=...
   PORTAINER_EVO_URL=https://panel-evo.ia-app.com
   PORTAINER_EVO_TOKEN=...
   ```
6. **Script de arranque:** déjalo vacío. No hace falta.
7. Guardar. Las sesiones **nuevas** lo toman; las que ya estaban abiertas, no.

### Paso 8 — Ajuste de los PR

En los ajustes de Claude Code de la cuenta, busca la opción de **crear el pull
request automáticamente** y ponla en **listo para revisión**, no en borrador
(hallazgo 2). Si no encuentras cómo, no pasa nada: `CLAUDE.md` ya obliga a los
agentes a abrirlos listos.

### Paso 9 — La primera sesión

1. En claude.ai/code, **nueva sesión**, entorno el del paso 7, y marca los tres
   repositorios.
2. Escríbele: *«Corre `scripts/comprobar-entorno-de-agentes.sh` y dime qué
   sale.»*
3. Lo esperado es que termine en **«Entorno de agentes: bien.»**. Los avisos de
   «token de administrador» o de `agente.ia-app.com` son los hallazgos 1 y 3:
   no rompen nada, pero dicen que falta afinar.

Si sale **MAL** en algo:

| Dice | Qué hacer |
| --- | --- |
| `faltan: PORTAINER_…` | paso 7, punto 5, y abre una sesión **nueva** |
| `contesta HTTP 401` | la llave está mal o caducó: paso 6 |
| `contesta HTTP 000` / `la red no lo deja ver` | falta el dominio: paso 7, punto 4 |
| `no se encuentra el servicio` | el servicio se llama distinto en tu Portainer |

### Paso 10 — Prueba de despliegue de punta a punta

1. Pide a la sesión un cambio pequeño en `agente-ia-app` (por ejemplo, una línea
   en esta guía), que abra el PR y lo fusione.
2. En GitHub → **Actions**, el flujo **docker-publish** tiene que terminar en
   verde (tarda unos 8 minutos). Si al minuto no aparece ninguna corrida para
   ese commit, el aviso de GitHub se perdió: el flujo **despliegue-perdido**
   lo detecta y la lanza solo en un máximo de unos 20 minutos (ver abajo).
3. Vuelve a correr el comprobador: en el punto 3 tiene que decir que la App
   corre el commit recién fusionado.

---

## 5. Lo que nunca se hace

- **Pegar una llave, un token o una contraseña en el chat.** Van en los
  ajustes del entorno o en los secretos de GitHub, nunca en una conversación.
- **Pegar la plantilla de un stack en Portainer sin copiar antes sus secretos**
  del stack que ya corre. Se los lleva por delante.
- **Dar a los agentes una llave de administrador** si se puede evitar.
- **Usar Portainer desde una sesión de Claude para desplegar a mano** la App o
  el backend: eso lo hace GitHub al fusionar. Lo de las llamadas, hoy manual,
  es la excepción anotada abajo.

---

## Pendiente

- **Despliegue automático de las llamadas (astracalls).** Para igualarlo con la
  App y el backend haría falta: activar el webhook del servicio
  `wacalls_wacalls` en el Portainer .233, guardarlo como `PORTAINER_WEBHOOK_URL`
  en el repositorio `astracalls`, y añadir a su flujo el mismo paso que tienen
  los otros dos. Es un cambio en cómo se actualiza el servidor de llamadas, así
  que se deja para cuando lo decidas.
- **Llaves de Portainer sin permiso de administrador** (hallazgo 1).
- **`agente.ia-app.com` en la red del entorno** (hallazgo 3).
