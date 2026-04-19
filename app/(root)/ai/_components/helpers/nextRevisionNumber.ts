import { db } from "@/lib/db";

export async function nextRevisionNumber(promptId: string) {
  const count = await db.agentPromptRevision.count({ where: { promptId } });
  return count + 1;
}
