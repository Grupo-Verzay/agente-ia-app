// actions/products-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { exigirLaCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
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
    const { userId: userIdPedido, q, page, perPage, onlyActive } = listParams.parse(raw);
    const userId = await exigirLaCuentaDeLaAccion(userIdPedido);

    const where: Prisma.ProductWhereInput = {
        userId,
        ...(onlyActive ? { isActive: true } : {}),
        ...(q ? { title: { contains: q, mode: Prisma.QueryMode.insensitive } } : {}),
    };

    const [items, total] = await Promise.all([
        db.product.findMany({
            where,
            orderBy: [{ order: "asc" }, { createdAt: "desc" }],
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

export async function reorderProducts(userIdPedido: string, orderedIds: string[]) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
    if (!userId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
        return { ok: true };
    }

    const products = await db.product.findMany({
        where: { userId, id: { in: orderedIds } },
        select: { id: true },
    });
    const allowed = new Set(products.map((p) => p.id));
    const cleanIds = orderedIds.filter((id) => allowed.has(id));

    await db.$transaction(
        cleanIds.map((id, index) =>
            db.product.updateMany({
                where: { id, userId },
                data: { order: index },
            }),
        ),
    );

    revalidatePath("/products");
    revalidatePath("/catalogo", "layout");
    return { ok: true };
}

export async function createProduct(raw: unknown) {
    const parseado = productSchema.omit({ id: true }).parse(raw);
    // `raw` llega del navegador, así que su `userId` es un dato de fuera como
    // cualquier otro: Zod comprueba la FORMA, no de quién es la cuenta.
    const input = { ...parseado, userId: await exigirLaCuentaDeLaAccion(parseado.userId) };

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
        const lastProduct = await db.product.findFirst({
            where: { userId: input.userId },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const product = await db.product.create({
            data: {
                ...input,
                sku: normalizedSku,
                tags: input.tags || [],
                category: input.category || "",
                order: (lastProduct?.order ?? -1) + 1,
            },
        });

        // 3️⃣ Realizar la revalidación de la ruta
        revalidatePath("/products");
        revalidatePath("/catalogo", "layout");

        return product;
    } catch (error) {
        // El código duplicado es un caso esperable (dos pestañas, doble clic o
        // una carrera con otra creación), no un fallo del sistema: se devuelve
        // el mismo mensaje que la comprobación previa para que el formulario
        // señale el campo en vez de mostrar un error genérico de render.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            throw new Error("El SKU ya está registrado");
        }

        // Capturamos cualquier error inesperado de la base de datos
        console.error("Error al crear el producto:", error);
        throw new Error("Hubo un error al crear el producto");
    }
}

/**
 * Editar un producto.
 *
 * **El dueño NO llegaba de ninguna parte.** El `where` era `{ id }` a secas, y
 * el `userId` del formulario se descartaba a propósito («no se debe tocar el
 * FK») — cierto, pero al descartarlo se quedaba sin nadie a quien preguntarle
 * de quién era la fila. O sea que con cualquier sesión y el id de un producto
 * se le podía cambiar el precio, el stock o el título a otra cuenta.
 *
 * El dueño sale de **la propia fila**, no del formulario: se lee y se comprueba
 * contra la sesión. Preguntárselo al navegador sería volver a fiarse de lo que
 * manda, que es justo lo que este barrido viene a cerrar.
 */
export async function updateProduct(id: string, raw: unknown) {
    // 1️⃣ Validar con Zod
    const input = productSchema.partial({ id: true }).parse(raw);

    // 2️⃣ De quién es la fila, y si quien llama la alcanza.
    const fila = await db.product.findUnique({ where: { id }, select: { userId: true } });
    if (!fila) throw new Error("El producto no existe.");
    await exigirLaCuentaDeLaAccion(fila.userId);

    // 3️⃣ Excluir userId del update (no se debe tocar el FK)
    const { id: _omit, userId: _ignore, ...data } = input;

    // Aseguramos que los campos tags y category estén correctamente formateados
    const updatedData = {
        ...data,
        sku: data.sku?.trim() || null,
        tags: data.tags || [],
        category: data.category || "",
    };

    // 4️⃣ Ejecutar el update limpio
    let product;
    try {
        product = await db.product.update({
            where: { id },
            data: updatedData,
        });
    } catch (error) {
        // Mismo caso que al crear: cambiar el código a uno que ya usa otro
        // producto de la cuenta es un error del usuario, no del sistema.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            throw new Error("El SKU ya está registrado");
        }
        throw error;
    }

    revalidatePath("/products");
    revalidatePath("/catalogo", "layout");
    return product;
}

export async function deleteProduct(id: string, userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
    await db.product.deleteMany({ where: { id, userId } });
    revalidatePath("/products");
    return { ok: true };
}

export async function getProductLimitInfo(userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
    const [limit, current] = await Promise.all([
        getProductLimit(userId),
        db.product.count({ where: { userId } }),
    ]);
    return { current, limit, reached: limit !== null && current >= limit };
}

export async function getProductStats(userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
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

export async function checkIfSkuExists(sku: string, userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
    const existingProduct = await db.product.findFirst({
        where: { sku, userId },
    });
    return existingProduct !== null;
}

/**
 * El catálogo PÚBLICO de una cuenta.
 *
 * **Esta sí recibe el id del navegador a propósito, y no lleva guarda.** Es lo
 * que pintan `/catalogo/[userId]` y `/c/[slug]`, dos páginas públicas: quien
 * las abre es un cliente final sin sesión, así que `currentUser()` devuelve
 * `null` y cualquier comprobación las tumbaría enteras.
 *
 * Y no hay nada que cerrar: solo salen los productos **activos** y los cuatro
 * campos de marca que el dueño publicó para que se vean. Lo que decide qué se
 * enseña es `isActive`, no quién pregunta.
 *
 * Si algún día se le añade un campo que no sea para el público —un costo, un
 * margen, un teléfono interno— entonces sí hay que volver aquí: el que la
 * pantalla sea pública no convierte en público todo lo que se le meta dentro.
 */
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
