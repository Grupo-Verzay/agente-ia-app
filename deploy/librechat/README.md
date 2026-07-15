# LibreChat dentro de Verzay — guía de despliegue

Asistente tipo ChatGPT/Claude **embebido** en Verzay: chatear con GPT y Claude,
**subir archivos**, **historial** guardado y búsqueda. Usa **API por uso** (no
la suscripción Plus/Max).

> Esto es infraestructura: lo despliega quien maneja el **servidor / Portainer**.
> No es un cambio de la app Verzay.

## Pasos (para quien administra el servidor)

1. **Subdominio**: apunta un subdominio (ej. `ia.verzay.com`) al servidor y, en el
   reverse proxy (Traefik/nginx), enruta al contenedor `librechat` puerto `3080`
   (igual que los demás servicios).

2. **Permitir el embebido en Verzay** — CLAVE. LibreChat por defecto NO se deja
   cargar en iframe. En el reverse proxy del subdominio, agrega este header a las
   respuestas de `ia.verzay.com`:
   ```
   Content-Security-Policy: frame-ancestors 'self' https://agente.ia-app.com
   ```
   (reemplaza por el dominio real de Verzay). Y **no** envíes `X-Frame-Options: DENY`.

3. **Variables**: copia `.env.example` a `.env` (o pégalas como variables del Stack
   en Portainer) y rellena:
   - `OPENAI_API_KEY` y `ANTHROPIC_API_KEY` (las claves de modelos).
   - `DOMAIN_CLIENT` / `DOMAIN_SERVER` = tu subdominio.
   - Los secretos: genera cada uno con `openssl rand -hex 32` (el `CREDS_IV` con `-hex 16`).

4. **Desplegar**: en Portainer → Stacks → Add stack → pega `docker-compose.yml` →
   carga el `.env` → Deploy.

5. **Crear tu usuario**: entra a `https://ia.verzay.com`, regístrate (ese será tu
   único acceso). Luego pon `ALLOW_REGISTRATION=false` y redesplega para cerrarlo.

## Conectarlo en Verzay (lo hace el usuario, es por cuenta = solo tú lo ves)

En Verzay → módulo **Integraciones** → **Nueva**:
- Nombre: `IA` (o `ChatGPT`, `Asistente`…)
- URL: `https://ia.verzay.com`

Aparecerá como pestaña dentro del chat. Como el servidor es tuyo y permitiste el
embebido (paso 2), esta vez **sí carga** embebido (no como los sitios oficiales).

## Notas
- Versiones de imágenes: revisar contra la doc oficial de LibreChat por si hay
  cambios: https://www.librechat.ai/docs/local/docker
- Costo: se paga por uso de las APIs (OpenAI/Anthropic), aparte de tu Plus/Max.
