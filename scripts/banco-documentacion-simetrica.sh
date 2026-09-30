#!/usr/bin/env bash
# El banco de la DOCUMENTACIÓN SIMÉTRICA: la flecha de regreso en las cuatro
# pantallas internas, el orden propio arrastrando (portada, guías publicadas y
# tutoriales), el buscador a la izquierda y «Nuevo» a la derecha, la rejilla de
# tutoriales compacta, Meta ordenada y sin pestañas de otros módulos encima.
#
# Tres mitades: las REGLAS puras y un barrido del código; las ACCIONES del
# orden contra Postgres (es de la persona, un id inventado no entra, las guías
# publicadas son de la casa); y las PANTALLAS reales en Chromium sobre el CSS
# del build a 1440/1280/1024/390.
#
# `MODO=roto` lee las pantallas de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA el fallo: sin flecha, «Crear» pegado al buscador, sin
# arrastre y con las pestañas del panel encima.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-e3f2e7a}"
export ANTES_REF

OUT=lib/__tests__/.compilado/documentacion-simetrica
mkdir -p "$OUT"

# 1. Las reglas puras.
npx esbuild lib/orden-propio.ts lib/pantallas-sin-pestanas.ts lib/buscar-en-documentacion.ts \
  lib/orden-de-las-tarjetas.ts --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error

# 2. Las acciones contra Postgres (solo en el modo bueno: el «antes» no tenía ninguna).
if [ "$MODO" != "roto" ]; then
  PGDIR=/tmp/pgdocsimetrica
  PORT=55531
  if [ ! -d "$PGDIR" ]; then
    mkdir -p "$PGDIR"
    chown postgres:postgres "$PGDIR"
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
  fi
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
  sleep 2
  su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

  export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
  export DIRECT_URL="$DATABASE_URL"
  export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
         CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
         S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost S3_BUCKET_NAME=verzay-media \
         GEMINI_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null

  npx esbuild lib/__tests__/fingido/entrada-de-orden-propio.ts --bundle \
    --platform=node --format=esm --outdir=$OUT \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error
  sed -i '/server-only/d' "$OUT/entrada-de-orden-propio.js"
fi

# 3. Las pantallas reales, en el navegador (solo en el modo bueno).
HARNESS="$OUT/harness.js"
rm -f "$HARNESS"
if [ "$MODO" != "roto" ] && [ -d ".next/static/css" ]; then
  ENTRY=".banco-documentacion-simetrica-entry.tsx"
  trap 'rm -f "$ENTRY"' EXIT
  cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { MainTutorial } from "@/app/(root)/documentation/tutorial/_components/MainTutorial";
import { MainGuide } from "@/app/(root)/documentation/guide/_components/MainGuide";
import { MainActualizaciones } from "@/app/(root)/documentation/actualizaciones/_components/MainActualizaciones";
import { MetaCredentialsGuide } from "@/app/(root)/documentation/meta/_components/MetaCredentialsGuide";
import { MainDocumentation } from "@/app/(root)/documentation/_components";
import { EditarIntroduccionDeLaGuia } from "@/app/(root)/documentation/guide/_components/EditarIntroduccionDeLaGuia";
import { MODULOS_CON_GUIA, NOMBRE_DE_LA_GUIA } from "@/lib/introduccion-de-la-guia";

const w = window as any;
const USUARIO = { id: "u1", role: "admin", name: "Carlos" } as any;
const PORTADA = [
  { id: "actualizaciones", title: "Actualizaciones", description: "Publica novedades.", href: "/documentation/actualizaciones", accent: "#2563eb", icon: <span>•</span>, buttonLabel: "Abrir" },
  { id: "tutoriales", title: "Administrador tutoriales", description: "Tutoriales de cada pantalla.", href: "/documentation/tutorial", accent: "#16a34a", icon: <span>•</span>, buttonLabel: "Abrir" },
  { id: "guias", title: "Administrador guías", description: "Guías publicadas y manuales.", href: "/documentation/guide", accent: "#9333ea", icon: <span>•</span>, buttonLabel: "Abrir" },
  { id: "meta", title: "Conexión API de Meta", description: "Conecta WhatsApp oficial.", href: "/documentation/meta", accent: "#0ea5e9", icon: <span>•</span>, buttonLabel: "Abrir" },
];
const raiz = () => (w.__raiz ??= createRoot(document.getElementById("app")!));
w.pantalla = (nombre: string) => {
  w.__raiz?.unmount?.();
  w.__raiz = null;
  const el =
    nombre === "tutoriales" ? <MainTutorial user={USUARIO} ordenInicial={w.__orden ?? {}} /> :
    nombre === "guias" ? (
      <MainGuide
        user={USUARIO}
        ordenInicial={w.__orden ?? {}}
        guiasPublicas={MODULOS_CON_GUIA.slice(0, 4).map((m) => ({
          id: m, nombre: NOMBRE_DE_LA_GUIA[m],
          nodo: <EditarIntroduccionDeLaGuia key={m} modulo={m} conAsa nombre={NOMBRE_DE_LA_GUIA[m]} />,
        }))}
      />
    ) :
    nombre === "actualizaciones" ? <MainActualizaciones cuentaId="c1" /> :
    nombre === "meta" ? <MetaCredentialsGuide /> :
    <MainDocumentation modules={PORTADA as any} ordenInicial={w.__orden ?? {}} />;
  raiz().render(el);
};
w.listo = true;
TSX
  node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" "$HARNESS" \
    --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
    --alias:@prisma/client=./lib/__tests__/fingido/documentacion/prisma-de-navegador.ts \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:@/actions/guide-actions=./lib/__tests__/fingido/documentacion/acciones-de-guias.ts \
    --alias:@/actions/manual-actions=./lib/__tests__/fingido/documentacion/acciones-de-manuales.ts \
    --alias:@/actions/orden-propio-actions=./lib/__tests__/fingido/documentacion/acciones-de-orden-propio.ts
  rm -f "$ENTRY"
fi

node --test lib/__tests__/documentacion-simetrica.test.mjs "$@"
