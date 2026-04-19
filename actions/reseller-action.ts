"use server"

import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { isAdminLike } from "@/lib/rbac";
import { Role, ThemeApp, User } from "@prisma/client"
import { ResellerInfoResponse } from "@/schema/reseller";

interface ResellerAsUserResponse<T = User> {
    success: boolean;
    message: string;
    data?: T;
};

/* Obtener todos los usuarios asociados a un reseller */
export const getClientsByReseller = async (resellerId: string) => {
    const user = await currentUser()

    if (!user || !isAdminLike(user.role)) {
        throw new Error("No autorizado")
    }

    // Clientes asignados a ese reseller
    const assigned = await db.reseller.findMany({
        where: { resellerid: resellerId },
        include: {
            user_reseller_userIdToUser: true, // Relación con User si está definida
        },
    })

    const assignedIds = assigned.map(r => r.userId)

    //all clients con rol user
    const allClients = await db.user.findMany({
        where: { role: "user" },
    })

    // Clientes sin asignar
    const unassigned = allClients.filter(c => !assignedIds.includes(c.id))

    return {
        assignedClients: assigned.map(r => r.user_reseller_userIdToUser), // si está incluido el user
        unassignedClients: unassigned,
    }
}

/* Asignar user a reseller */
export const assignClientToReseller = async (clientId: string, resellerId: string) => {
    const user = await currentUser()
    if (!user || !isAdminLike(user.role)) throw new Error("No autorizado")

    return await db.reseller.create({
        data: {
            resellerid: resellerId,
            userId: clientId,
        },
    })
}

/* eliminar user de reseller */
export const removeClientFromReseller = async (clientId: string, resellerId: string) => {
    const user = await currentUser()
    if (!user || !isAdminLike(user.role)) throw new Error("No autorizado")

    return await db.reseller.deleteMany({
        where: {
            resellerid: resellerId,
            userId: clientId,
        },
    })
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
        const user = await db.user.findUnique({ where: { id: userId } })

        if (!user) {
            return {
                success: false,
                message: "Usuario no encontrado.",
            }
        }
        // 1. Si es reseller, retorna sus propios datos
        if (user.role === Role.reseller) {
            return {
                success: true,
                message: "Usuario es un reseller.",
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
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

        // 3. Buscar al usuario reseller asignado
        const resellerUser = await db.user.findUnique({
            where: { id: assignment.resellerid },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                theme: true,
                company: true,
                notificationNumber: true,
                mapsUrl: true,
                lat: true,
                lng: true,
            },
        })

        if (!resellerUser) {
            return {
                success: false,
                message: "No se encontró el usuario revendedor asignado.",
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
