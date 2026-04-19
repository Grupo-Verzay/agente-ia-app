import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainAiImage } from "./_components";

const AiImagePage = async () => {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  return <MainAiImage />;
};

export default AiImagePage;

