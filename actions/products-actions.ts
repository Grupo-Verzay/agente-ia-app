// actions/products-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listParams, productSchema } from "@/lib/validators/product";
import { db } from "@/lib/db"; // tu prisma client
import { Prisma } from "@prisma/client";

export async function listProducts(raw: z.input<typeof listParams>) {
    const { userId, q, page, perPage, onlyActive } = listParams.parse(raw);

    const where: Prisma.ProductWhereInput = {
        userId,
        ...(onlyActive ? { isActive: true } : {}),
        ...(q ? { title: { contains: q, mode: Prisma.QueryMode.insensitive } } : {}),
    };

    const [items, total] = await Promise.all([
        db.product.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        db.product.count({ where }),
    ]);

    // 🔧 normalizamos el tipo Decimal → number
    const normalized = items.map(p => ({
        ...p,
        price: Number(p.price),
    }));

    return {
        items: normalized,
        total,
        page,
        perPage,
        pages: Math.ceil(total / perPage),
    };
}

export async function createProduct(raw: unknown) {
    const input = productSchema.omit({ id: true }).parse(raw);

    // 1️⃣ Verificar si el SKU ya existe
    const existingProduct = await db.product.findFirst({
        where: { sku: input.sku, userId: input.userId },
    });

    if (existingProduct) {
        // Si ya existe el SKU, lanzar un error o mensaje
        throw new Error("El SKU ya está registrado");
    }

    try {
        // 2️⃣ Crear el producto
        const product = await db.product.create({
            data: {
                ...input,
                tags: input.tags || [], // Aseguramos que `tags` sea un array vacío si no se proporciona
                category: input.category || "", // Aseguramos que `category` esté presente
            },
        });

        // 3️⃣ Realizar la revalidación de la ruta
        revalidatePath("/products");

        return product;
    } catch (error) {
        // Capturamos cualquier error inesperado de la base de datos
        console.error("Error al crear el producto:", error);
        throw new Error("Hubo un error al crear el producto");
    }
}

export async function updateProduct(id: string, raw: unknown) {
    // 1️⃣ Validar con Zod
    const input = productSchema.partial({ id: true }).parse(raw);

    // 2️⃣ Excluir userId del update (no se debe tocar el FK)
    const { id: _omit, userId: _ignore, ...data } = input;

    // Aseguramos que los campos tags y category estén correctamente formateados
    const updatedData = {
        ...data,
        tags: data.tags || [], // Si no hay tags, se establece un array vacío
        category: data.category || "", // Si no hay category, se establece como cadena vacía
    };

    // 3️⃣ Ejecutar el update limpio
    const product = await db.product.update({
        where: { id },
        data: updatedData,
    });

    revalidatePath("/products");
    return product;
}

export async function deleteProduct(id: string, userId: string) {
    await db.product.delete({ where: { id } });
    revalidatePath("/products");
    return { ok: true };
}

export async function checkIfSkuExists(sku: string, userId: string) {
    const existingProduct = await db.product.findFirst({
        where: { sku, userId },
    });
    return existingProduct !== null;
}
