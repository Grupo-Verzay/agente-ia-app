import { Role } from "@prisma/client";

export const isSuperAdmin = (role?: Role | string | null): boolean => role === "super_admin";

export const isAdmin = (role?: Role | string | null): boolean => role === "admin";

export const isReseller = (role?: Role | string | null): boolean => role === "reseller";

export const isAdminLike = (role?: Role | string | null): boolean =>
  role === "admin" || role === "super_admin";

export const isAdminOrReseller = (role?: Role | string | null): boolean =>
  isAdminLike(role) || isReseller(role);
