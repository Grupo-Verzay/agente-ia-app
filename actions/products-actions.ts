// actions/products-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listParams, productSchema } from "@/lib/validators/product";
import { db } from "@/lib/db"; // tu prisma client
import { Prisma, Plan } from "@prisma/client";

const PLAN_PRODUCT_LIMITS: Record<Plan, number | null> = {
    lite:           0,
    basico:        10,
    intermedio:    25,
    avanzado:      50,
    enterprise:   100,
    personalizado: null, // sin límite fijo; depende del productLimit asignado por el admin
};

async function getProductLimit(userId: string): Promise<number | null> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { plan: true, productLimit: true },
    });
    if (!user) return 0;
    if (user.productLimit != null) return user.productLimit;
    const planLimit = PLAN_PRODUCT_LIMITS[user.plan];
    return planLimit !== undefined ? planLimit : 0;
}

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

    // 1️⃣ Verificar límite de productos
    const [limit, current] = await Promise.all([
        getProductLimit(input.userId),
        db.product.count({ where: { userId: input.userId } }),
    ]);

    // null = sin límite (plan personalizado sin productLimit asignado aún)
    if (limit !== null && current >= limit) {
        throw new Error(
            limit === 0
                ? 'Tu plan no incluye el módulo de productos. Actualiza tu plan para acceder.'
                : `Límite de ${limit} productos alcanzado para tu plan.`,
        );
    }

    // 2️⃣ Verificar si el SKU ya existe (solo si fue ingresado)
    const normalizedSku = input.sku?.trim() || null;
    if (normalizedSku) {
        const existingProduct = await db.product.findFirst({
            where: { sku: normalizedSku, userId: input.userId },
        });
        if (existingProduct) {
            throw new Error("El SKU ya está registrado");
        }
    }

    try {
        // 3️⃣ Crear el producto
        const product = await db.product.create({
            data: {
                ...input,
                sku: normalizedSku,
                tags: input.tags || [],
                category: input.category || "",
            },
        });

        // 3️⃣ Realizar la revalidación de la ruta
        revalidatePath("/products");
        revalidatePath("/catalogo", "layout");

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
        sku: data.sku?.trim() || null,
        tags: data.tags || [],
        category: data.category || "",
    };

    // 3️⃣ Ejecutar el update limpio
    const product = await db.product.update({
        where: { id },
        data: updatedData,
    });

    revalidatePath("/products");
    revalidatePath("/catalogo", "layout");
    return product;
}

export async function deleteProduct(id: string, userId: string) {
    await db.product.deleteMany({ where: { id, userId } });
    revalidatePath("/products");
    return { ok: true };
}

export async function getProductLimitInfo(userId: string) {
    const [limit, current] = await Promise.all([
        getProductLimit(userId),
        db.product.count({ where: { userId } }),
    ]);
    return { current, limit, reached: limit !== null && current >= limit };
}

export async function getProductStats(userId: string) {
    const [limit, total, active, outOfStock] = await Promise.all([
        getProductLimit(userId),
        db.product.count({ where: { userId } }),
        db.product.count({ where: { userId, isActive: true } }),
        db.product.count({ where: { userId, stock: { lte: 0 } } }),
    ]);

    return {
        total,
        active,
        outOfStock,
        availableSlots: limit !== null ? Math.max(0, limit - total) : null,
    };
}

export async function checkIfSkuExists(sku: string, userId: string) {
    const existingProduct = await db.product.findFirst({
        where: { sku, userId },
    });
    return existingProduct !== null;
}

export async function getPublicCatalog(userId: string) {
    const [user, products, config] = await Promise.all([
        db.user.findUnique({
            where: { id: userId },
            select: { name: true, company: true, image: true, preferredCurrencyCode: true },
        }),
        db.product.findMany({
            where: { userId, isActive: true },
            orderBy: { title: 'asc' },
            select: {
                id: true,
                title: true,
                description: true,
                price: true,
                comparePrice: true,
                sku: true,
                stock: true,
                category: true,
                tags: true,
                images: true,
            },
        }),
        db.catalogConfig.findUnique({ where: { userId } }),
    ]);

    if (!user) return null;

    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

    return {
        user: {
            name: user.name,
            company: user.company,
            image: user.image,
            currencyCode: user.preferredCurrencyCode,
        },
        config: {
            whatsappNumber: config?.whatsappNumber ?? null,
            bannerUrl: config?.bannerUrl ?? null,
            primaryColor: config?.primaryColor ?? null,
            headline: config?.headline ?? null,
            subheadline: config?.subheadline ?? null,
            instagram: config?.instagram ?? null,
            facebook: config?.facebook ?? null,
            tiktok: config?.tiktok ?? null,
            ctaText: config?.ctaText ?? null,
            showStock: config?.showStock ?? true,
            showSku: config?.showSku ?? false,
        },
        products: products.map((p) => ({
            ...p,
            price: Number(p.price),
            comparePrice: p.comparePrice != null ? Number(p.comparePrice) : null,
        })),
        categories,
    };
}
