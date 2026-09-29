// El entorno de los agentes de Claude Code: lo que se comprueba y cómo se lee.
//
// Puro: no toca la red ni la base. Lo usan el comprobador en vivo
// (scripts/comprobar-entorno-de-agentes.sh) y su banco
// (scripts/banco-entorno-de-agentes.sh). La guía para montarlo desde cero es
// docs/entorno-claude-code-agentes.md, y las tres cosas tienen que decir lo
// mismo: el banco lo comprueba.

/**
 * Las variables que el entorno de la nube de Claude tiene que traer. Solo se
 * mira que EXISTAN: el valor no se imprime nunca.
 */
export const VARIABLES = [
  "PORTAINER_URL",
  "PORTAINER_TOKEN",
  "PORTAINER_EVO_URL",
  "PORTAINER_EVO_TOKEN",
];

/**
 * Qué se despliega dónde. `automatico` = GitHub Actions llama al webhook de
 * Portainer al fusionar; `manual` = alguien actualiza el servicio a mano.
 */
export const REPOSITORIOS = [
  {
    repo: "agente-ia-app",
    rama: "main",
    flujo: ".github/workflows/docker-publish.yml",
    panel: "PORTAINER",
    servicio: "agente-app_verzay_app",
    despliegue: "automatico",
  },
  {
    repo: "api-webhook",
    rama: "master",
    flujo: ".github/workflows/docker-publish.yml",
    panel: "PORTAINER",
    servicio: "backend-app_api-webhook-verzay",
    despliegue: "automatico",
  },
  {
    repo: "astracalls",
    rama: "main",
    flujo: ".github/workflows/docker-image.yml",
    panel: "PORTAINER_EVO",
    servicio: "wacalls_wacalls",
    despliegue: "manual",
  },
];

/** Los nombres que faltan, en el orden de VARIABLES. Recibe NOMBRES, no valores. */
export function lasQueFaltan(nombresPresentes) {
  const hay = new Set(nombresPresentes);
  return VARIABLES.filter((v) => !hay.has(v));
}

/**
 * El commit con el que está etiquetada la imagen de un servicio, o null si va
 * con una etiqueta que no es un commit (`latest`). Tolera el `@sha256:…` que
 * Swarm pega detrás.
 */
export function elCommitDeLaImagen(imagen) {
  if (typeof imagen !== "string") return null;
  const sinDigest = imagen.split("@")[0];
  const etiqueta = sinDigest.includes(":") ? sinDigest.split(":").pop() : "";
  return /^[0-9a-f]{40}$/.test(etiqueta) ? etiqueta : null;
}

/**
 * ¿Lo que corre es lo último fusionado?
 *  - con commit en la etiqueta: se compara el commit, que es lo exacto.
 *  - con `latest`: solo se puede comparar la FECHA del último cambio del
 *    servicio contra la de la última fusión; se dice que es una aproximación.
 */
export function estadoDelDespliegue({ imagen, ultimoCommit, servicioActualizado, ultimaFusion }) {
  const commit = elCommitDeLaImagen(imagen);
  if (commit) {
    return commit === ultimoCommit ? "al_dia" : "atrasado";
  }
  const actualizado = Date.parse(servicioActualizado ?? "");
  const fusion = Date.parse(ultimaFusion ?? "");
  if (Number.isNaN(actualizado) || Number.isNaN(fusion)) return "no_se_sabe";
  return actualizado >= fusion ? "probablemente_al_dia" : "probablemente_atrasado";
}

/**
 * Qué hace el flujo de GitHub Actions de un repositorio. Se lee el texto: no
 * hace falta interpretar el YAML entero para saber estas cinco cosas.
 */
export function loQueHaceElFlujo(texto) {
  const t = String(texto ?? "");
  return {
    publicaEnGhcr: /registry:\s*ghcr\.io/.test(t),
    etiquetaConElCommit: /\$\{\{\s*github\.sha\s*\}\}/.test(t) && /ghcr\.io\/[^\s]+:\$\{\{\s*github\.sha/.test(t),
    despliegaPorWebhook: /PORTAINER_WEBHOOK_URL/.test(t),
    fallaSinElSecreto: /-z\s+"\$PORTAINER_WEBHOOK_URL"/.test(t),
    fallaSiNoEs2xx: /-lt\s+200/.test(t) && /-ge\s+300/.test(t),
    pideLaVersionExacta: /tag=\$\{\{\s*github\.sha\s*\}\}/.test(t),
  };
}

/** Los flujos con despliegue automático tienen que hacer las seis cosas. */
export function loQueLeFaltaAlFlujo(texto) {
  const hace = loQueHaceElFlujo(texto);
  return Object.entries(hace)
    .filter(([, si]) => !si)
    .map(([que]) => que);
}

/** Portainer: 1 es administrador, 2 usuario normal. Lo demás no se sabe. */
export function elRolDelToken(rol) {
  if (rol === 1) return "administrador";
  if (rol === 2) return "usuario";
  return "desconocido";
}
