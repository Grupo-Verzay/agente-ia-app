"use server";

import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
import { loginSchema, registerSchema } from "@/lib/zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { cookies } from "next/headers";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";

export const loginAction = async (values: z.infer<typeof loginSchema>) => {
  try {
    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.cause?.err?.message };
    }
    return { error: "error 500" };
  }
};

export const registerAction = async (
  values: z.infer<typeof registerSchema>
) => {
  try {
    const { data, success } = registerSchema.safeParse(values);
    if (!success) {
      return {
        error: "Invalid data",
      };
    }

    // verificar si el usuario ya existe
    const user = await db.user.findUnique({
      where: {
        email: data.email,
      },
      include: {
        accounts: true, // Incluir las cuentas asociadas
      },
    });

    if (user) {
      // Verificar si tiene cuentas OAuth vinculadas
      const oauthAccounts = user.accounts.filter(
        (account) => account.type === "oauth"
      );
      if (oauthAccounts.length > 0) {
        return {
          error:
            "To confirm your identity, sign in with the same account you used originally.",
        };
      }
      return {
        error: "User already exists",
      };
    }

    // hash de la contraseña
    const passwordHash = await bcrypt.hash(data.password, LENGTH_PASSWORD_HASH);

    // crear el usuario
    await db.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: passwordHash,
      },
    });

    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.cause?.err?.message };
    }
    return { error: "error 500" };
  }
};

export async function adminChangeUserPassword(input: {
  userId: string;
  oldPassword: string;
  newPassword: string;
}) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: "No auth" };
  if (!isAdminLike(session.user.role)) return { success: false, message: "No autorizado" };

  const userId = input.userId;
  const oldPassword = (input.oldPassword ?? "").trim();
  const newPassword = (input.newPassword ?? "").trim();

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  if (!target) return { success: false, message: "Usuario no existe" };
  if (!target.password) return { success: false, message: "Este usuario no tiene contraseña local" };

  const oldOk = await bcrypt.compare(oldPassword, target.password);
  if (!oldOk) return { success: false, message: "Contraseña actual incorrecta" };

  // Evitar que ponga la misma contraseña
  const sameAsOld = await bcrypt.compare(newPassword, target.password);
  if (sameAsOld) return { success: false, message: "La nueva contraseña no puede ser igual a la anterior" };

  const hash = await bcrypt.hash(newPassword, 10);

  await db.user.update({
    where: { id: userId },
    data: {
      password: hash,
      tokenVersion: { increment: 1 },
    },
  });

  await db.user.update({
    where: { id: userId },
    data: {
      passPlainTxt: newPassword,
    },
  });

  return { success: true, message: "Contraseña actualizada. Se cerró sesión en todos los dispositivos." };
}

export async function selfChangePassword(input: {
  oldPassword: string;
  newPassword: string;
}) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: "No autenticado" };

  const userId = session.user.id;
  const oldPassword = (input.oldPassword ?? "").trim();
  const newPassword = (input.newPassword ?? "").trim();

  if (newPassword.length < 6) {
    return { success: false, message: "La contraseña debe tener al menos 6 caracteres" };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  if (!target) return { success: false, message: "Usuario no existe" };
  if (!target.password) return { success: false, message: "Este usuario no tiene contraseña local" };

  const oldOk = await bcrypt.compare(oldPassword, target.password);
  if (!oldOk) return { success: false, message: "Contraseña actual incorrecta" };

  const sameAsOld = await bcrypt.compare(newPassword, target.password);
  if (sameAsOld) return { success: false, message: "La nueva contraseña no puede ser igual a la anterior" };

  const hash = await bcrypt.hash(newPassword, LENGTH_PASSWORD_HASH);

  await db.user.update({
    where: { id: userId },
    data: { password: hash, tokenVersion: { increment: 1 } },
  });

  await db.user.update({
    where: { id: userId },
    data: { passPlainTxt: newPassword },
  });

  return { success: true, message: "Contraseña actualizada correctamente." };
}

export async function impersonateUser(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: "No auth" };

  const realUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!realUser || !isAdminLike(realUser.role)) {
    return { success: false, message: "No autorizado" };
  }

  const exists = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!exists) return { success: false, message: "Usuario no existe" };

  cookies().set("impersonate_user_id", targetUserId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return { success: true };
}

export async function logoutAction() {
  const store = cookies();

  // cookie de impersonación (clave para tu bug)
  store.delete("impersonate_user_id");

  // (Opcional) si guardas otros estados por cookies, bórralos aquí
  // store.delete("sidebar_state");
  return { success: true };
}
