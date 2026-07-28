import NextAuth from "next-auth";
import type { Plan, Role } from "@prisma/client";

/**
 * Instancia de autenticación EXCLUSIVA para el middleware.
 *
 * El middleware se ejecuta en CADA petición de la app, en el runtime del borde.
 * Importaba `@/auth`, y con ello el adaptador de Prisma, el cliente de Prisma
 * entero y bcrypt: 127 kB que se cargan una y otra vez para, en realidad, hacer
 * una sola cosa — leer el token de la cookie y mirar si hay sesión.
 *
 * Nada de eso hace falta aquí:
 *
 * - El adaptador y los proveedores solo intervienen al INICIAR sesión, que
 *   ocurre en `/api/auth/*`, no en el middleware.
 * - `bcrypt` solo se usa al comparar la contraseña, en ese mismo momento.
 * - El callback `jwt` solo corre cuando se emite el token, tampoco aquí.
 *
 * Queda solo lo que el middleware sí necesita: la estrategia de token y el
 * callback `session`, que es el que rellena `req.auth.user` con el rol y el plan
 * a partir del token ya firmado. Se copia TAL CUAL el de `auth.ts`, para que lo
 * que ve el middleware sea exactamente lo mismo que ve el resto de la app.
 *
 * El inicio de sesión, el registro y todo lo demás siguen usando `@/auth` sin
 * cambios.
 */
export const { auth } = NextAuth({
    session: { strategy: "jwt" },
    providers: [],
    callbacks: {
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
                session.user.plan = token.plan as Plan;
                session.user.tokenVersion = token.tokenVersion ?? 0;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
});
