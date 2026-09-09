import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import { db } from "@/lib/db";
import { clientesDelAsesor } from "@/lib/clientes-del-asesor";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

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

export async function assertBillingScope(
  actor: {
    id?: string;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
  },
  rawUserId?: string | null,
) {
  const userId = ensureUserId(rawUserId);

  // Alguien del equipo sin rol de admin pasa por su cartera: solo los clientes
  // que le asignaron, y solo esos. Es la misma llave que abre el listado, para
  // que no se le enseñe una fila que luego no puede tocar.
  const cartera = await clientesDelAsesor(actor ?? {});
  if (cartera) {
    if (!cartera.includes(userId)) {
      throw new Error("No autorizado para gestionar este cliente.");
    }
    return userId;
  }

  // Por qué cuenta se factura. El administrador de una cuenta actúa por ella, y
  // preguntando por SU rol —`user`, siempre— el corte del reseller de abajo no
  // se le aplicaba nunca: el administrador de un reseller habría podido tocar
  // la facturación de cualquier cliente de la plataforma.
  const cuenta = await cuentaQueManda(actor ?? {});

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, demoResellerId: true },
  });
  if (!targetUser) throw new Error("Cliente no encontrado.");

  if (cuenta.role === "reseller") {
    if (!cuenta.id) throw new Error("No autorizado.");

    // Autorizado si el cliente está vinculado por el sistema NUEVO (demoResellerId)
    // o el VIEJO (Reseller.userId). Antes solo miraba el viejo, por eso rechazaba
    // ("No autorizado para gestionar este cliente") a clientes vinculados por
    // demoResellerId aunque sí aparecieran en el listado de billing.
    const assigned =
      targetUser.demoResellerId === cuenta.id
        ? true
        : await db.reseller.findFirst({
            where: { resellerid: cuenta.id, userId },
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
