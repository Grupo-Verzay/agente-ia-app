import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import AccessDenied from "@/app/AccessDenied";
import { getAllAffiliatesAction } from "@/actions/affiliate-actions";
import { db } from "@/lib/db";
import { AffiliateManager } from "./_components/AffiliateManager";

export default async function PanelAfiliados() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`).
  const cuenta = await cuentaQueManda(user);
  if (!isAdminOrReseller(cuenta.role)) return <AccessDenied />;

  const [affiliatesRes, users] = await Promise.all([
    getAllAffiliatesAction(),
    db.user.findMany({
      where: { role: "affiliate" },
      select: { id: true, name: true, email: true, company: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <AffiliateManager
      affiliates={affiliatesRes.success ? affiliatesRes.data : []}
      eligibleUsers={users}
    />
  );
}
