import { db } from "@/lib/db";
import { loginSchema } from "@/lib/zod";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Notice this is only an object, not a full Auth.js instance
export default {
  providers: [
    //Google,
    //GitHub,
    Credentials({
      authorize: async (credentials) => {
        const { data, success } = loginSchema.safeParse(credentials);

        if (!success) {
          throw new Error("Credenciales Incorrectas.");
        }

        // verificar si existe el usuario en la base de datos
        const user = await db.user.findUnique({
          where: {
            email: data.email,
          },
        });

          if (!user || !user.password) {
            throw new Error("Usuario no existe");
          }

        // verificar si la contraseña es correcta
        const isValid = await bcrypt.compare(data.password, user.password);
        // const isValid = data.password === user.password;


        if (!isValid) {
          throw new Error("Email o contraseña incorrectos.");
        }

        return user;
      },
    }),
  ],
} satisfies NextAuthConfig;
