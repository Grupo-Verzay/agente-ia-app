"use server";

import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { MisClientesMain } from "./_components/MisClientesMain";

const MisClientesPage = async () => {
  const user = await currentUser();
  if (!user || user.role !== "reseller") return <AccessDenied />;
  return <MisClientesMain />;
};

export default MisClientesPage;
