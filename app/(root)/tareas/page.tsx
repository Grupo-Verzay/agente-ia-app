import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { TasksClient } from "./_components/TasksClient";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full flex-col">
      <TasksClient userId={user.id} userName={user.name} />
    </div>
  );
}
