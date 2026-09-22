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
// Ficha pública de tickets: los archivos que adjunta un cliente final que NO
// tiene cuenta. Su puerta es el código del enlace, que la propia ruta resuelve
// contra la base — nunca un `userID` que mande el navegador.
const apiTicketsPublicoPrefix = "/api/tickets-publico";

// Las rutas de LLAMADAS que llama el BACKEND, no un navegador.
//
// Esta es la puerta por la que se caía el aviso de fin de llamada, y el fallo
// era **completamente mudo**. El backend hace
// `fetch(NEXTJS_URL + "/api/calls/call-ended")` con su clave interna y sin
// cookie de sesión; el middleware no tenía este prefijo, así que contestaba
// `307` hacia `/login` — y **`fetch` sigue las redirecciones**: se traía la
// página de login con un `200`, `resp.ok` salía `true`, y el backend escribía
// «fin de llamada avisado a la App» habiendo entregado exactamente nada.
//
// Medido sobre el build servido:
//
//   POST /api/calls/call-ended  ->  307 -> /login?callbackUrl=...
//   resp.ok true · resp.status 200 · resp.url .../login
//
// De ahí el síntoma: la llamada sale, se habla, se cuelga, y en CRM › Llamadas
// no queda ni la duración. Lo que lo tapaba hasta el 21 era el sondeo en
// memoria de la propia App —que no pasa por HTTP—; en cuanto un redespliegue
// se llevó esas promesas, quedó a la vista.
//
// Y ser pública NO abre ninguna: las cuatro comprueban por su cuenta, que es
// la regla de siempre —ninguna ruta `/api` confía solo en el middleware—.
// `call-ended`, `process-bot-recording` y `rescatar` piden
// `CRM_FOLLOW_UP_RUNNER_KEY`; `recording` pide `currentUser()`.
const apiCallsPrefix = "/api/calls";

// Y las OTRAS que estaban igual, encontradas por el barrido del banco: las
// herramientas del agente. Se autentican SOLO con la clave interna —ninguna
// acepta sesión, porque ninguna la abre un navegador— así que recibían el
// mismo `307` hacia `/login`, medido:
//
//   POST /api/send-media           307 -> /login?callbackUrl=%2Fapi%2Fsend-media
//   POST /api/products             307 -> ...
//   POST /api/external-client-data 307 -> ...
//
// O sea que el agente pedía sus productos y sus datos externos y se traía la
// página de login con un `200`. Sin un solo error.
//
// Abrirlas aquí no abre nada: comprobado ruta por ruta, las nueve de estos
// cuatro prefijos tienen su puerta propia —ocho con la clave interna y
// `calls/recording` con `currentUser()`—. Es la regla de siempre: ninguna
// ruta `/api` confía solo en el middleware.
//
// **`/api/bookings` se queda FUERA a propósito, y sigue rota.** Sus tres
// rutas están igual de redirigidas, pero importan ficheros `'use server'`
// (`bookings-actions`, `send-message-with-history-action`) y abrir su prefijo
// pone en rojo `acciones-de-sistema.test.mjs`, que es la guarda de que un
// runner de sistema no quede publicado como endpoint. Eso es un frente aparte
// —o se le quita el `'use server'` a esos dos, o se decide que la guarda no
// aplica a una ruta con clave propia— y no se resuelve de paso en un arreglo
// de llamadas. Lo que no puede pasar es que se dé por revisado: está en la
// lista de exclusiones del banco con este motivo escrito al lado.
const apiSendMediaPrefix = "/api/send-media";
const apiProductsPrefix = "/api/products";
const apiExternalClientDataPrefix = "/api/external-client-data";


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
  if (currentPath.startsWith(apiTicketsPublicoPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiCallsPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiSendMediaPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiProductsPrefix)) return NextResponse.next();
  if (currentPath.startsWith(apiExternalClientDataPrefix)) return NextResponse.next();
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
    currentPath.startsWith("/p/") ||
    // Enlace de reunión (/reunion/<codigo>): se le pasa a alguien de fuera que
    // no tiene cuenta. Mandarlo al login sería pedirle que se registre para
    // poder entrar a una reunión de media hora.
    //
    // Y ser pública NO la abre: tener el enlace deja llamar a la puerta, no
    // entrar. Quien pasa lo decide alguien que ya está dentro, y eso lo
    // comprueba el servidor en cada vuelta — la puerta está en la acción, como
    // en /cobros y /documentos.
    currentPath.startsWith("/reunion/") ||
    // Ficha de soporte (/t/<codigo>): el enlace permanente que cada cuenta le
    // reparte a SUS clientes por WhatsApp. Quien lo abre no tiene cuenta en la
    // plataforma y no va a tenerla — mandarlo al login sería pedirle que se
    // registre para poder pedir ayuda.
    //
    // Y ser pública NO la abre: lo único que hace el enlace es identificar a
    // qué bandeja cae el ticket, y eso lo resuelve el servidor contra el
    // código. Del otro lado no se lee nada: ni los tickets de la cuenta, ni sus
    // contactos, ni el nombre de quien escribió antes desde ese mismo número.
    currentPath.startsWith("/t/");

  if (!isLoggedIn && !authRoutes.includes(currentPath) && !isPublicRoute) {
    // if (!isLoggedIn && !authRoutes.includes(currentPath) && !publicRoutes.includes(currentPath)) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", currentPath);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
