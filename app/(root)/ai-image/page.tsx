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
  } catch (err) {
    // Callado, esto se veía como «te falta la API key» sobre una cuenta que sí
    // la tiene: el aviso ámbar salía por un fallo de lectura, no por la clave.
    console.warn("[ai-image] no se pudo leer la API key de Google", err);
  }

  try {
    dbStyles = await db.userVisualStyle.findMany({
      where: { userId: user.effectiveId },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    // Sin sus estilos la biblioteca sale solo con los de fábrica: se dice por qué.
    console.warn("[ai-image] no se pudieron leer los estilos de la cuenta", err);
  }

  return <MainAiImage hasGoogleKey={hasGoogleKey} dbStyles={dbStyles} />;
};

export default AiImagePage;

