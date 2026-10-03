import { NextResponse } from "next/server";
import { RUTA_DE_VUELTA } from "@/lib/youtube-acceso.mjs";

/**
 * La cookie que ata la vuelta de Google a ESTE navegador. Va acotada a la ruta
 * de vuelta: no viaja en ninguna otra petición de la App.
 */
export const COOKIE_DEL_VIAJE_DE_YOUTUBE = "youtube_oauth_nonce";
export const RUTA_DE_LA_COOKIE = RUTA_DE_VUELTA;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapar(texto: string): string {
    return String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Una página mínima para las dos rutas de YouTube.
 *
 * Son rutas y no pantallas porque lo que hacen es redirigir el navegador entero
 * hacia Google y de vuelta; pero cuando hay algo que DECIR —falta registrar la
 * dirección de vuelta, Google dijo que no, quedó conectado— una redirección
 * muda no le dice a nadie qué hacer. Todo lo que entra aquí se escapa: el
 * motivo de Google y el nombre del canal llegan de fuera.
 */
export function laPaginaDeYoutube({
    titulo,
    parrafos,
    enlace,
    tono = "aviso",
    estado = 200,
}: {
    titulo: string;
    parrafos: string[];
    enlace?: { texto: string; href: string };
    tono?: "bien" | "mal" | "aviso";
    estado?: number;
}): NextResponse {
    const color = tono === "bien" ? "#15803d" : tono === "mal" ? "#b91c1c" : "#1d4ed8";
    const cuerpo = parrafos.map((p) => `<p>${escapar(p)}</p>`).join("\n");
    const boton = enlace
        ? `<p><a class="boton" href="${escapar(enlace.href)}">${escapar(enlace.texto)}</a></p>`
        : "";
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapar(titulo)}</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
  main { max-width: 36rem; margin: 3rem auto; padding: 0 1rem; }
  .tarjeta { background: #fff; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; color: ${color}; }
  p { line-height: 1.5; margin: 0 0 0.75rem; overflow-wrap: anywhere; }
  .boton { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 0.6rem 1rem; border-radius: 0.5rem; }
</style>
</head>
<body>
<main><div class="tarjeta" data-youtube="${tono}">
<h1>${escapar(titulo)}</h1>
${cuerpo}
${boton}
</div></main>
</body>
</html>`;
    return new NextResponse(html, {
        status: estado,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
}
