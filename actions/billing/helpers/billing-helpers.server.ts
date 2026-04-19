import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import { db } from "@/lib/db";

/**
 * Helpers SERVER (auth/guards/decimal)
 */
export async function requireAuth() {
  const user = await currentUser();
  if (!user) throw new Error("No autorizado.");
  return user;
}

export function assertAdminOrReseller(role?: string | null) {
  if (!isAdminOrReseller(role)) {
    throw new Error("No autorizado.");
  }
}

export function ensureUserId(userId?: string | null): string {
  const cleaned = String(userId ?? "").trim();
  if (!cleaned) throw new Error("userId es requerido.");
  return cleaned;
}

export function normalizeCurrencyCode(code?: string | null): string {
  const value = String(code ?? "COP").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error("currencyCode inválido. Debe ser ISO-4217 de 3 letras.");
  }
  return value;
}

export function normalizeGraceDays(value?: number | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new Error("graceDays debe ser un entero.");
  }
  if (value < 0 || value > 365) {
    throw new Error("graceDays debe estar entre 0 y 365.");
  }
  return value;
}

export function normalizeLicenseDays(value?: number | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new Error("licenseDays debe ser un entero.");
  }
  if (value < 1 || value > 365) {
    throw new Error("licenseDays debe estar entre 1 y 365.");
  }
  return value;
}

export function normalizeOptionalText(value?: string | null, maxLength = 500): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new Error(`Texto demasiado largo (máximo ${maxLength} caracteres).`);
  }
  return cleaned;
}

export async function assertBillingScope(actor: { id?: string; role?: string | null }, rawUserId?: string | null) {
  const userId = ensureUserId(rawUserId);
  assertAdminOrReseller(actor?.role);

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!targetUser) throw new Error("Cliente no encontrado.");

  if (actor?.role === "reseller") {
    if (!actor?.id) throw new Error("No autorizado.");

    const assigned = await db.reseller.findFirst({
      where: { resellerid: actor.id, userId },
      select: { id: true },
    });

    if (!assigned) throw new Error("No autorizado para gestionar este cliente.");
  }

  return userId;
}

export function toDecimal(value?: string | number | null): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
}
