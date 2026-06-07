import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAffiliate, isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import {
  getMyAffiliateProfileAction,
  getMyReferralsAction,
  getMyCommissionsAction,
} from "@/actions/affiliate-actions";
import { AffiliateDashboard } from "./_components/AffiliateDashboard";

export default async function AffiliadosPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAffiliate(user.role) && !isAdminOrReseller(user.role)) return <AccessDenied />;

  const [profileRes, referralsRes, commissionsRes] = await Promise.all([
    getMyAffiliateProfileAction(),
    getMyReferralsAction(),
    getMyCommissionsAction(),
  ]);

  if (!profileRes.success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <p className="text-sm">No tienes un perfil de afiliado activo.</p>
        <p className="text-xs">Contacta al administrador para activarlo.</p>
      </div>
    );
  }

  return (
    <AffiliateDashboard
      profile={profileRes.data}
      referrals={referralsRes.success ? referralsRes.data : []}
      commissions={commissionsRes.success ? commissionsRes.data : []}
    />
  );
}
