import { CreditMain } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";

interface Props {
  searchParams: {
    userId?: string;
  };
}

const CreditPage = async ({ searchParams }: Props) => {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  }

  return <CreditMain userId={searchParams.userId} />;
};

export default CreditPage;
