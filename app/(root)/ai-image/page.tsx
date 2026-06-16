import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { MainAiImage } from "./_components";

const AiImagePage = async () => {
  const user = await currentUser();
  if (!user) redirect("/login");

  let hasGoogleKey = false;
  let dbStyles: { id: string; name: string; description: string }[] = [];

  try {
    const googleProvider = await db.aiProvider.findFirst({ where: { name: "google" }, select: { id: true } });
    if (googleProvider) {
      const config = await db.userAiConfig.findFirst({
        where: { userId: user.effectiveId, providerId: googleProvider.id, isActive: true },
        select: { id: true },
      });
      hasGoogleKey = !!config;
    }
  } catch { /* ignorar */ }

  try {
    dbStyles = await db.userVisualStyle.findMany({
      where: { userId: user.effectiveId },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: "asc" },
    });
  } catch { /* ignorar hasta que el cliente Prisma esté regenerado */ }

  return <MainAiImage hasGoogleKey={hasGoogleKey} dbStyles={dbStyles} />;
};

export default AiImagePage;

