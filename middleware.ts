import { NextResponse } from "next/server";
// Instancia ligera, sin Prisma ni bcrypt: ver auth.middleware.ts. Este archivo
// corre en cada petición y aquí solo hace falta leer el token de la cookie.
import { auth } from '@/auth.middleware';
const publicRoutes = ["/", "/prices", "/inicio", "/completar-registro"];
const authRoutes = ["/login", "/register"];
const apiAuthPrefix = "/api/auth";
const apiAvatarPrefix = "/api/avatar";
const apiCronPrefix = "/api/cron";
const apiSchedulePrefix = "/api/schedule";
const apiAdminPrefix = "/api/admin";
// Modo Dueño por WhatsApp: el backend llama estos endpoints máquina-a-máquina
// (sin sesión de usuario); su seguridad es el secreto OWNER_COMMANDS_KEY.
const apiOwnerPrefix = "/api/owner";
// Pagos: los llama la pasarela, no un navegador con sesión. Sin esto el aviso
// de Wompi recibe una redirección al login en vez del webhook, y el pago se
// pierde. Cada uno trae su propia seguridad: /confirm pide CRON_SECRET y
// /wompi verifica la firma del evento.
const apiPaymentPrefix = "/api/payment";
// Señal de vida para el `healthcheck` de Docker. Lo llama el propio contenedor,
// sin cookie ninguna: si pidiera sesión recibiría la redirección al login, un
// 307 que el healthcheck da por fallo, y Swarm mataría contenedores sanos en
// bucle. No expone nada: contesta `{ ok: true }` y no toca la base.
const apiHealthPrefix = "/api/health";

export default auth((req) => {
  const { nextUrl } = req;
  const currentPath = nextUrl.pathname;
  const isLoggedIn = !!req.auth;

  const isTokenInvalid = (req.auth?.user as { invalid?: boolean })?.invalid === true;
  if (isLoggedIn && isTokenInvalid) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", currentPath);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = req.auth?.user?.role ?? 'user';
  const userPlan = req.auth?.user?.plan ?? 'basico';

  if (process.env.NODE_ENV !== 'production') {
    console.log({ isLoggedIn, currentPath, userRole, userPlan });
  }

  if (currentPath.startsWith(apiAuthPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiAvatarPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiCronPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiSchedulePrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiAdminPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiOwnerPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiPaymentPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiHealthPrefix)) return NextResponse.next();
  if (publicRoutes.includes(currentPath)) return NextResponse.next();

  if (isLoggedIn && authRoutes.includes(currentPath)) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
  const isPublicRoute =
    publicRoutes.includes(currentPath) ||
    currentPath.startsWith("/schedule/") ||
    currentPath.startsWith("/r/") ||
    // Enlace corto de venta (/plan/4): lo abre un cliente que aún no existe.
    currentPath.startsWith("/plan/") ||
    // Enlace corto de pago (/p/K7M2QX): le llega al cliente por WhatsApp y lo
    // abre sin sesión. Mandarlo al login sería pedirle que se registre para
    // poder pagar.
    currentPath.startsWith("/p/");

  if (!isLoggedIn && !authRoutes.includes(currentPath) && !isPublicRoute) {
    // if (!isLoggedIn && !authRoutes.includes(currentPath) && !publicRoutes.includes(currentPath)) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", currentPath);
    return NextResponse.redirect(loginUrl);
  }

  // La hora de entrada, para poder medir el hueco que va de aqui a la primera
  // linea de una accion de servidor.
  //
  // El navegador ve 1,5-3,5 s de TTFB en acciones cuyo trabajo medido son ~250
  // ms, y ese hueco tiene dos tramos que no sabiamos separar: lo de antes del
  // middleware (red, Traefik, aceptar la conexion) y lo de despues (resolver la
  // accion, leer el cuerpo, o esperar al unico hilo de JavaScript). Este sello
  // los parte en dos, con el mismo reloj a los dos lados.
  //
  // Solo se sella aqui, en la salida normal: los `return` de arriba son rutas
  // publicas y de maquina, que no nos interesan. Ver `lib/reloj-de-la-peticion`.
  const cabeceras = new Headers(req.headers);
  cabeceras.set("x-entro-en", String(Date.now()));
  return NextResponse.next({ request: { headers: cabeceras } });
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
