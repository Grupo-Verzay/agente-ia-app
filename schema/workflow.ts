import { z } from "zod";

export const createWorkflowSchema = z.object({
    name: z.string().max(50),
    description: z.string().max(500).optional(),
    isPro: z.boolean().default(false),
})

export type createWorkflowSchemaType = z.infer<typeof createWorkflowSchema>;