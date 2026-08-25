import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DiagramasListClient } from "./_components/DiagramasListClient";

const DiagramasPage = async () => {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full flex-col">
      <DiagramasListClient />
    </div>
  );
};

export default DiagramasPage;
