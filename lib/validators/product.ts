// lib/validators/product.ts
import { z } from "zod";

export const productSchema = z.object({
    id: z.string().cuid().optional(),
    title: z.string().min(2, "Mínimo 2 caracteres").max(120),
    description: z.string().max(5000).optional().nullable(),
    price: z.union([
        z.number().nonnegative("Precio inválido"),
        z.string().regex(/^\d+(\.\d{1,2})?$/, "Formato numérico 0.00")
    ]).transform(v => typeof v === "string" ? Number(v) : v),
    sku: z.string().max(60).optional().nullable(),
    stock: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    images: z.array(z.string().url()).max(10).default([]),
    userId: z.string(),
    category: z.string().min(1, "La categoría es obligatoria").max(100),  // Nueva validación para la categoría
    tags: z.array(z.string().max(50)).max(10).default([]),  // Nueva validación para las etiquetas (máximo 10)
});

export const listParams = z.object({
    userId: z.string(),
    q: z.string().optional(),
    page: z.number().int().min(1).default(1),
    perPage: z.number().int().min(1).max(100).default(20),
    onlyActive: z.boolean().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

export interface ProductFormInterface {
    userId: string;
    product?: Partial<ProductInput> & { id?: string };
    variant?: "button" | "icon";
}