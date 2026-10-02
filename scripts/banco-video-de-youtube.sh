#!/usr/bin/env bash
# El banco del corte de YouTube «Mientras tú dormías, esto pasó con un
# cliente» (`public/demo/verzay-youtube.mp4`): el vídeo de ventas de `/demo`
# contado de NOCHE, con la llamada entera y el cierre multiagente.
#
#   `lib/__tests__/video-de-youtube.test.mjs`, en cuatro mitades:
#     1. la voz dice el guion palabra por palabra, la llamada va entera, todo
#        está sintetizado con Cedar en su propia caché y las voces de la
#        llamada son las del vídeo de ventas;
#     2. la historia de noche: Laura escribe un lunes a las nueve de la noche,
#        la IA insiste a las dos horas, la llama al día siguiente por la tarde,
#        la cita es la que se confirma en la llamada, nada queda en el pasado
#        ni de madrugada, y el vídeo de ventas sigue de día como estaba;
#     3. el grabador: cada frase y cada mensaje una vez, cada `alDecir` en la
#        frase que suena, el rodaje compartido con `/demo` (sin
#        `recordVideo`), cortes de los cinco chats al empezar sin portada ni
#        marca, la llamada sin narración encima y el respiro antes de las
#        varias líneas, con el logo solo al final;
#     4. el vídeo publicado medido con ffmpeg: H.264 + AAC 1920×1080, la voz
#        desde el principio, la llamada seguida, el respiro en la pista y
#        ningún otro hueco mudo.
#
# `MODO=roto` lee ANTES_REF —pinchado a un commit, nunca `origin/main`— y
# afirma que allí no había corte de YouTube: ni grabador, ni narración, ni
# historia de noche, ni cortes en el estudio, y que lo único que había (el
# vídeo de ventas) abre con la portada y la marca antes de la historia.
#
# Regenerar el vídeo: `npm run build && scripts/generar-video-de-youtube.sh`
# y volver a construir.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-7a0d1ac}"

node --test lib/__tests__/video-de-youtube.test.mjs
