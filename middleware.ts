import { NextResponse } from "next/server";
import { auth } from '@/auth';
const publicRoutes = ["/", "/prices"];
const authRoutes = ["/login", "/register"];
const apiAuthPrefix = "/api/auth";
const apiCronPrefix = "/api/cron";

export default auth((req) => {
  const { nextUrl } = req;
  const currentPath = nextUrl.pathname;
  const isLoggedIn = !!req.auth;

  const isTokenInvalid = (req.auth?.user as any)?.invalid === true;
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
  if (currentPath.startsWith(apiCronPrefix)) return NextResponse.next();
  if (publicRoutes.includes(currentPath)) return NextResponse.next();

  if (isLoggedIn && authRoutes.includes(currentPath)) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
  const isPublicRoute =
    publicRoutes.includes(currentPath) || currentPath.startsWith("/schedule/");

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
