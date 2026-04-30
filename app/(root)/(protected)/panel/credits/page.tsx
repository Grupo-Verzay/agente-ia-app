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

  const userId = searchParams.userId;

  if (!userId) {
    return <p className="text-red-500">Error: userId no proporcionado</p>;
  }

  return <CreditMain userId={userId} />;
};

export default CreditPage;
