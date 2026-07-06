import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import type { ModuleWithItems } from "@/schema/module";

export async function getClientPanelModules(): Promise<{
  user: Awaited<ReturnType<typeof currentUser>>;
  modules: ModuleWithItems[];
}> {
  const user = await currentUser();
  if (!user) return { user, modules: [] };

  const allModules = await db.module.findMany({
    include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    orderBy: { order: "asc" },
  });

  if (isAdminOrReseller(user.role)) {
    return {
      user,
      modules: allModules.filter((module) => !module.adminOnly),
    };
  }

  const userModuleRecords = await db.userModule.findMany({
    where: { B: user.id },
    select: { A: true },
  });

  const allowedIds = new Set(userModuleRecords.map((record) => record.A));
  const modules =
    allowedIds.size > 0
      ? allModules.filter((module) => allowedIds.has(module.id))
      : allModules.filter((module) => !module.adminOnly);

  return {
    user,
    modules: modules.filter((module) => !module.adminOnly),
  };
}
