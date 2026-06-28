# Canales de mensajería (Telegram + Meta) — Guía técnica

Bandeja unificada: **WhatsApp (Evolution/Baileys), Telegram, Facebook, Instagram
y WhatsApp Cloud** en el mismo panel de Chats. La IA responde automáticamente en
todos los canales y el operador puede responder manualmente desde el mismo lugar.

Repos involucrados:
- **Backend:** `api-webhook` (NestJS) — webhooks, IA, envío, persistencia.
- **Frontend:** `agente-ia-app` (Next.js) — UI de conexión y panel de Chats.

---

## 1. Arquitectura (resumen)

- **Entrada:** cada canal tiene un normalizador que convierte su webhook a un DTO común.
  - Telegram → `POST /webhook/telegram/:instanceName`
  - Meta → `POST /webhook/meta`
- **Almacenamiento de credenciales:** se reutiliza la tabla `Instancias` (sin migración).
  - Telegram: `instanceType='telegram'`, `metaAccessToken`=bot token, `metaVerifyToken`=secret.
  - Meta: `instanceType='meta'`, `metaChannel` ∈ {whatsapp, facebook, instagram}.
- **Envío:** `WhatsAppSenderFactory` enruta por `instanceType` al adaptador correcto.
- **Bandeja unificada:** los mensajes de Telegram/Meta (entrantes y salientes) se
  persisten en `chat_messages` / `chat_conversations`, las mismas tablas que lee el panel.
- **Media:** se descarga (Telegram `getFile`, Meta Graph con Bearer), se sube a
  almacenamiento (MinIO/S3) y se muestra en el panel; el video se transcribe con ffmpeg+Whisper.

---

## 2. Requisitos de despliegue

1. **Redeploy** de ambos contenedores tomando el último commit.
2. El backend debe ejecutar **`npm install`** en el build (baja `ffmpeg-static`, necesario para video).
3. **Variables de entorno:**

| Variable | Dónde | Para qué |
|---|---|---|
| `BACKEND_URL` | frontend (y backend) | URL **pública HTTPS** del backend; Telegram la usa para webhook y media |
| `CRM_FOLLOW_UP_RUNNER_KEY` | backend **y** frontend (mismo valor) | autentica el envío manual desde el panel |
| `s3.endpoint`, `s3.accessKey`, `s3.secretKey`, `s3.bucketName`, `s3.publicUrl` | backend | almacenamiento de media (MinIO/S3) |
| `META_VERIFY_TOKEN` | backend (opcional) | verificación del webhook de Meta |
| Clave del proveedor de IA | perfil del usuario | respuestas y transcripción (Whisper) |

---

## 3. Checklist de prueba

| Entrante | Telegram | Meta (WA/FB/IG) |
|---|:--:|:--:|
| Texto | ☐ | ☐ |
| Foto (visión) | ☐ | ☐ |
| Audio/voz (Whisper) | ☐ | ☐ |
| PDF/documento | ☐ | ☐ |
| Video (audio→transcripción) | ☐ | ☐ |
| Visible en el panel de Chats | ☐ | ☐ |
| IA responde automáticamente | ☐ | ☐ |
| Responder manual (texto) | ☐ | ☐ |
| Responder manual (media) | ☐ | ☐ |

---

## 4. Diagnóstico (logs del backend)

- `[Telegram]` / `[Meta]` → recepción y normalización de webhooks.
- `[Media]` → descarga/subida de archivos a almacenamiento.
- `[Video]` → extracción de audio con ffmpeg.
- `[Meta/...] Fuera de la ventana de 24h` → el cliente debe escribir primero
  (WhatsApp Cloud requiere plantilla aprobada fuera de las 24 h).

---

## 5. Límites conocidos

- **No-leídos:** indicador simple (1/0, "pendiente de responder"), no conteo exacto.
- **Ventana de 24 h de Meta:** fuera de ella, la IA no inicia conversación (correcto);
  el operador en Facebook/Instagram sí puede responder hasta 7 días (etiqueta de agente
  humano); en WhatsApp Cloud requiere plantilla aprobada.
