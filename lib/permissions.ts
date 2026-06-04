import type { Plan, Role } from "@prisma/client";
import { isAdminLike, isAdminOrReseller, isReseller } from "@/lib/rbac";

export type AdvisorRole = "agente" | "administrador";

export type PermissionSubject = {
  role?: Role | string | null;
  plan?: Plan | string | null;
  ownerId?: string | null;
  advisorRole?: string | null;
};

export type AppPermission =
  | "manage:users"
  | "manage:billing"
  | "manage:modules"
  | "manage:resellers"
  | "manage:linked_accounts"
  | "manage:team"
  | "edit:workflows"
  | "view:admin_panel";

const ROLE_LABELS: Record<string, string> = {
  user: "Usuario",
  admin: "Administrador",
  reseller: "Reseller",
  super_admin: "Super administrador",
};

const ADVISOR_ROLE_LABELS: Record<AdvisorRole, string> = {
  agente: "Agente",
  administrador: "Administrador de equipo",
};

export function isAdvisorAccount(user?: PermissionSubject | null) {
  return Boolean(user?.ownerId);
}

export function isAdvisorAdmin(user?: PermissionSubject | null) {
  return user?.advisorRole === "administrador";
}

export function getRoleLabel(role?: Role | string | null) {
  return ROLE_LABELS[role ?? ""] ?? "Usuario";
}

export function getAdvisorRoleLabel(advisorRole?: string | null) {
  return ADVISOR_ROLE_LABELS[(advisorRole as AdvisorRole) ?? "agente"] ?? "Agente";
}

export function getEffectiveRoleLabel(user?: PermissionSubject | null) {
  if (isAdvisorAccount(user)) return getAdvisorRoleLabel(user?.advisorRole);
  return getRoleLabel(user?.role);
}

export function getRoleScopeLabel(user?: PermissionSubject | null) {
  if (isAdvisorAccount(user)) return "Cuenta vinculada";
  if (isReseller(user?.role)) return "Marca / reseller";
  if (isAdminLike(user?.role)) return "Administracion";
  return "Cuenta principal";
}

export function canManageLinkedAccounts(user?: PermissionSubject | null) {
  return !isAdvisorAccount(user) || isAdvisorAdmin(user);
}

export function canManageTeam(user?: PermissionSubject | null) {
  return !isAdvisorAccount(user) || isAdvisorAdmin(user);
}

export function canManageUsers(user?: PermissionSubject | null) {
  return isAdminOrReseller(user?.role);
}

export function canManageBilling(user?: PermissionSubject | null) {
  return isAdminOrReseller(user?.role);
}

export function canManageModules(user?: PermissionSubject | null) {
  return isAdminLike(user?.role);
}

export function canManageResellers(user?: PermissionSubject | null) {
  return isAdminLike(user?.role);
}

export function canEditWorkflows(user?: PermissionSubject | null) {
  return !isAdvisorAccount(user) || isAdvisorAdmin(user);
}

export function canViewAdminPanel(user?: PermissionSubject | null) {
  return isAdminLike(user?.role);
}

export function hasPermission(user: PermissionSubject | null | undefined, permission: AppPermission) {
  switch (permission) {
    case "manage:users":
      return canManageUsers(user);
    case "manage:billing":
      return canManageBilling(user);
    case "manage:modules":
      return canManageModules(user);
    case "manage:resellers":
      return canManageResellers(user);
    case "manage:linked_accounts":
      return canManageLinkedAccounts(user);
    case "manage:team":
      return canManageTeam(user);
    case "edit:workflows":
      return canEditWorkflows(user);
    case "view:admin_panel":
      return canViewAdminPanel(user);
    default:
      return false;
  }
}

export function getAccessDeniedMessage(reason?: string) {
  if (reason === "admin_only") return "Este modulo esta reservado para administradores.";
  if (reason === "invalid_plan") return "Tu plan actual no incluye este modulo.";
  return "No tienes permisos para acceder a este modulo.";
}
