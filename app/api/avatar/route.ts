import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Hosts permitidos para el proxy (evita SSRF). Las fotos de perfil de WhatsApp
// vienen de *.whatsapp.net; agrega aquí otros orígenes legítimos si hiciera falta.
function isAllowedHost(hostname: string): boolean {
  return (
    hostname === "whatsapp.net" ||
    hostname.endsWith(".whatsapp.net") ||
    hostname.endsWith(".fbcdn.net")
  );
}

/**
 * Proxy de avatares: descarga la foto de perfil del lado servidor y la sirve.
 * Si la URL caducó (403) o falla, redirige al placeholder local (200), de modo
 * que el navegador nunca muestra un error 403/404 en consola.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  const placeholder = new URL("/placeholder.svg", request.nextUrl.origin);

  if (!raw) {
    return NextResponse.redirect(placeholder);
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.redirect(placeholder);
  }

  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return NextResponse.redirect(placeholder);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return NextResponse.redirect(placeholder);
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // El navegador cachea la foto; las URLs de WhatsApp caducan igual, así
        // que un día es un buen equilibrio entre frescura y carga.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.redirect(placeholder);
  }
}
