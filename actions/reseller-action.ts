"use server"

import { db } from "@/lib/db"
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import {
    CAMPOS_DE_LA_FICHA,
    comoFicha,
    estaSinAsignar,
    puedeAsignarseAlReseller,
    type FichaDeCuenta,
} from "@/lib/asignacion-de-reseller";
import { Role, ThemeApp, User } from "@prisma/client"
import { ResellerInfoResponse } from "@/schema/reseller";

interface ResellerAsUserResponse<T = User> {
    success: boolean;
    message: string;
    data?: T;
};

// Qué clientes cuelgan de cada reseller es de la CASA, y las tres acciones de
// abajo pasan por su puerta (`lib/mando-de-la-casa.ts`). Lo que decide qué se
// puede asignar y qué viaja al navegador vive en `lib/asignacion-de-reseller.ts`.

async function elResellerExiste(id: string): Promise<boolean> {
    if (!id) return false;
    const fila = await db.user.findFirst({ where: { id, role: "reseller" }, select: { id: true } });
    return !!fila;
}

/* Los clientes de un reseller (método viejo) y los que no son de nadie */
export const getClientsByReseller = async (
    resellerId: string,
): Promise<{ assignedClients: FichaDeCuenta[]; unassignedClients: FichaDeCuenta[] }> => {
    if (!(await quienMandaEnLaCasa("getClientsByReseller"))) {
        throw new Error("No autorizado")
    }

    // Asignados por la tabla `reseller`. Las filas SIN `userId` son el perfil del
    // propio reseller (slug, colores, límite de demos), no un cliente.
    const assigned = await db.reseller.findMany({
        where: { resellerid: resellerId, userId: { not: null } },
        select: { user_reseller_userIdToUser: { select: CAMPOS_DE_LA_FICHA } },
    })

    // Sin asignar: clientes que no cuelgan de NINGÚN reseller por ningún
    // camino. Se filtra en la consulta lo grueso y la regla fina la pone
    // `estaSinAsignar`, la misma con la que se decide al asignar.
    const candidatos = await db.user.findMany({
        where: { role: "user", ownerId: null, deletedAt: null, demoResellerId: null },
        select: {
            ...CAMPOS_DE_LA_FICHA,
            role: true, ownerId: true, deletedAt: true, demoResellerId: true,
            reseller_reseller_userIdToUser: { select: { resellerid: true } },
        },
        orderBy: { name: "asc" },
    })
    const unassigned = candidatos.filter((f) =>
        estaSinAsignar({
            id: f.id, role: f.role, ownerId: f.ownerId, deletedAt: f.deletedAt,
            demoResellerId: f.demoResellerId,
            resellersAsignados: f.reseller_reseller_userIdToUser
                .map((r) => r.resellerid)
                .filter((r): r is string => !!r),
        }),
    )

    return {
        assignedClients: assigned
            .map((r) => r.user_reseller_userIdToUser)
            .filter((u): u is NonNullable<typeof u> => !!u)
            .map(comoFicha),
        unassignedClients: unassigned.map(comoFicha),
    }
}

/* Asignar un cliente a un reseller: a UNO, nunca a dos */
export const assignClientToReseller = async (
    clientId: string,
    resellerId: string,
): Promise<{ success: boolean; message: string }> => {
    if (!(await quienMandaEnLaCasa("assignClientToReseller"))) {
        return { success: false, message: "No autorizado" }
    }
    if (!(await elResellerExiste(resellerId))) {
        return { success: false, message: "Esa cuenta no es un reseller." }
    }

    try {
        // En una transacción y con un candado por CLIENTE: dos pestañas
        // asignándolo a dos resellers a la vez verían las dos que no es de
        // nadie. Con el candado la segunda espera y ve la fila de la primera.
        return await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('reseller-asignacion:' || ${clientId}))`
            const fila = await tx.user.findUnique({
                where: { id: clientId },
                select: {
                    id: true, role: true, ownerId: true, deletedAt: true, demoResellerId: true,
                    reseller_reseller_userIdToUser: { select: { resellerid: true } },
                },
            })
            const veredicto = puedeAsignarseAlReseller(
                fila
                    ? {
                        id: fila.id, role: fila.role, ownerId: fila.ownerId,
                        deletedAt: fila.deletedAt, demoResellerId: fila.demoResellerId,
                        resellersAsignados: fila.reseller_reseller_userIdToUser
                            .map((r) => r.resellerid)
                            .filter((r): r is string => !!r),
                    }
                    : null,
                resellerId,
            )
            if (!veredicto.ok) return { success: false, message: veredicto.motivo }
            await tx.reseller.create({ data: { resellerid: resellerId, userId: clientId } })
            return { success: true, message: "Cliente asignado" }
        })
    } catch (e) {
        console.error("[assignClientToReseller]", e)
        return { success: false, message: "Error al asignar el cliente." }
    }
}

/* Quitar un cliente de un reseller */
export const removeClientFromReseller = async (
    clientId: string,
    resellerId: string,
): Promise<{ success: boolean; message: string }> => {
    if (!(await quienMandaEnLaCasa("removeClientFromReseller"))) {
        return { success: false, message: "No autorizado" }
    }
    if (!clientId || !resellerId) return { success: false, message: "Faltan datos." }

    // Solo filas de ASIGNACIÓN: con `userId` puesto. La fila del perfil del
    // reseller no tiene `userId` y no se toca.
    const r = await db.reseller.deleteMany({
        where: { resellerid: resellerId, userId: clientId },
    })
    if (r.count === 0) return { success: false, message: "Ese cliente no estaba asignado a este reseller." }
    return { success: true, message: "Cliente quitado del revendedor." }
};

/**
 * Obtiene la información visual (tema, logo, datos) del reseller
 * correspondiente al usuario actual. Si es reseller, retorna sus datos;
 * si es cliente, retorna los datos del reseller asignado.
 *
 * @param userId - ID del usuario a verificar
 * @returns Información del reseller asociado o propio
 */
export const getResellerProfileForUser = async (
    userId: string
): Promise<ResellerInfoResponse> => {
    try {
        // Solo las columnas que se usan abajo: antes traía la fila entera del
        // usuario (~80 columnas) para leer doce, en cada navegación.
        const user = await db.user.findUnique({
            where: { id: userId },
            select: {
                id: true, role: true, name: true, email: true, image: true,
                faviconUrl: true, brandName: true, theme: true, company: true,
                notificationNumber: true, mapsUrl: true, lat: true, lng: true,
            },
        })

        if (!user) {
            return {
                success: false,
                message: "Usuario no encontrado.",
            }
        }
        // 1. Si es super_admin, retorna sus propios datos frescos de DB (tema + logo global)
        if (user.role === Role.super_admin) {
            return {
                success: true,
                message: "Usuario super administrador.",
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    faviconUrl: user.faviconUrl,
                    brandName: user.brandName,
                    theme: user.theme ?? 'Default',
                    company: user.company,
                    notificationNumber: user.notificationNumber,
                    mapsUrl: user.mapsUrl,
                    lat: user.lat,
                    lng: user.lng,
                },
            }
        }

        // 2. Si es reseller, retorna sus propios datos
        if (user.role === Role.reseller) {
            return {
                success: true,
                message: "Usuario es un reseller.",
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    faviconUrl: user.faviconUrl,
                    brandName: user.brandName,
                    theme: user.theme ?? 'Default',
                    company: user.company,
                    notificationNumber: user.notificationNumber,
                    mapsUrl: user.mapsUrl,
                    lat: user.lat,
                    lng: user.lng,
                },
            }
        }

        // 2. Si es cliente, busca si está asignado a un reseller
        const assignment = await db.reseller.findFirst({
            where: { userId },
        })

        if (!assignment?.resellerid) {
            return {
                success: false,
                message: "Este usuario no está asignado a ningún reseller.",
            }
        }

        // 3. Buscar al usuario reseller asignado — debe tener rol reseller
        const resellerUser = await db.user.findUnique({
            where: { id: assignment.resellerid },
            select: {
                id: true,
                role: true,
                name: true,
                email: true,
                image: true,
                faviconUrl: true,
                brandName: true,
                theme: true,
                company: true,
                notificationNumber: true,
                mapsUrl: true,
                lat: true,
                lng: true,
            },
        })

        if (!resellerUser || resellerUser.role !== Role.reseller) {
            return {
                success: false,
                message: "El usuario asignado no es un revendedor válido.",
            }
        }
        return {
            success: true,
            message: "Se encontró usuario asignado a un Reseller.",
            data: {
                id: resellerUser.id,
                name: resellerUser.name,
                email: resellerUser.email,
                image: resellerUser.image,
                faviconUrl: resellerUser.faviconUrl,
                brandName: resellerUser.brandName,
                theme: resellerUser.theme ?? 'Default',
                company: resellerUser.company,
                notificationNumber: resellerUser.notificationNumber,
                mapsUrl: resellerUser.mapsUrl,
                lat: resellerUser.lat,
                lng: resellerUser.lng,
            },
        }
    } catch (error) {
        console.error("Error en getResellerProfileForUser:", error)
        return {
            success: false,
            message: "Error interno al obtener información del reseller.",
        }
    }
};
