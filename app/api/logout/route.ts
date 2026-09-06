import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/**
 * Salir en UNA sola petición.
 *
 * "Salir" hacía tres viajes al servidor desde el navegador antes de moverse:
 * una acción de servidor para borrar las cookies de impersonación, el GET del
 * token CSRF de next-auth y el POST de `signOut`; solo después cambiaba de
 * página. Y sin ninguna señal en pantalla mientras tanto. Con el contenedor
 * ocupado, cada viaje tardaba segundos, así que la persona pulsaba una y otra
 * vez ("le doy, le doy y no sale") y cada pulsación lanzaba la cadena entera
 * de nuevo.
 *
 * Aquí el navegador simplemente navega a esta ruta: la pestaña enseña su
 * propio indicador de carga al instante, hay UN viaje, no toca la base
 * -la sesión es JWT: borrar la cookie ES cerrar la sesión- y contesta con una
 * redirección al login.
 *
 * Pública a propósito: si llega alguien sin sesión, el middleware ya lo manda
 * al login, que es justo donde quería ir.
 */
export const dynamic = "force-dynamic";

const COOKIES_DE_SESION = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  // Impersonación y cuenta activa (panel de administración).
  "impersonate_user_id",
  "active_account_id",
];

export async function GET() {
  // next-auth borra sus cookies con sus propios nombres y atributos. Si
  // fallara, abajo se borran igual a mano: salir tiene que salir.
  try {
    await signOut({ redirect: false });
  } catch (error) {
    console.warn("[auth] signOut de next-auth fallo al salir; se borran las cookies a mano.", error);
  }

  // Redirección RELATIVA, a propósito. Con `new URL("/login", request.url)` la
  // dirección salía con el host que ve el servidor detrás de Traefik -el id del
  // contenedor, `https://7b2fa5d4c09c:3000/login`- y el navegador aterrizaba en
  // "no se puede acceder a esta página". Un `Location: /login` a secas lo
  // resuelve el navegador contra el dominio que él mismo pidió, que es el bueno
  // siempre, sin adivinar cabeceras `x-forwarded-*` ni variables de entorno.
  const respuesta = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  for (const nombre of COOKIES_DE_SESION) {
    // Las que empiezan por `__Secure-`/`__Host-` solo se pueden tocar con
    // `Secure`: el navegador ignora un Set-Cookie sin el atributo.
    respuesta.cookies.set(nombre, "", { path: "/", maxAge: 0, secure: nombre.startsWith("__") });
  }
  // Que ningún intermedio guarde esta respuesta.
  respuesta.headers.set("Cache-Control", "no-store");
  return respuesta;
}
