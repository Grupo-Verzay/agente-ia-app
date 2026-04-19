import { z } from "zod";

export const createNodeflowSchema = z.object({
  workflowId: z.string().min(1, "El ID del flujo es obligatorio."),
  message: z.string().max(100, "El mensaje debe tener máximo 100 caracteres."),
  tipo: z.string().max(50, "El tipo debe tener máximo 50 caracteres."),
  url: z.string().url("Debe ser una URL válida.").optional(),
});

export type createNodeflowSchemaType = z.infer<typeof createNodeflowSchema>;