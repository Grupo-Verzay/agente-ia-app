"use client"

import { useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ClientInterface } from "@/lib/types"
import { QrCodeIcon, PowerIcon, UsersIcon } from "lucide-react"
import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ClientStatusSummaryProps {
    users: ClientInterface[]
    onFilterChange: (status: StatusKey | null) => void
}

export type StatusKey = "total" | "qrDisconnected" | "qrConnected" | "evoOn" | "evoOff"

interface StatusConfig {
    icon: LucideIcon
    colorClass: string
    tooltip: string
}

const statusMap: Record<StatusKey, StatusConfig> = {
    total: {
        icon: UsersIcon,
        colorClass: "text-muted-foreground",
        tooltip: "Total de usuarios",
    },
    qrDisconnected: {
        icon: QrCodeIcon,
        colorClass: "text-red-600",
        tooltip: "QR desconectado",
    },
    qrConnected: {
        icon: QrCodeIcon,
        colorClass: "text-green-600",
        tooltip: "QR conectado",
    },
    evoOn: {
        icon: PowerIcon,
        colorClass: "text-green-600",
        tooltip: "Robot encendido",
    },
    evoOff: {
        icon: PowerIcon,
        colorClass: "text-red-600",
        tooltip: "Robot apagado",
    },
}

export const ClientStatusPanel = ({ users, onFilterChange }: ClientStatusSummaryProps) => {
    // Conteo de usuarios por estado
    const counts = users.reduce<Record<StatusKey, number>>((acc, user) => {
        acc.total += 1
        if (user.qrStatus === true) acc.qrDisconnected += 1
        if (user.qrStatus === false) acc.qrConnected += 1
        if (user.isEvoEnabled === true) acc.evoOn += 1
        if (user.isEvoEnabled === false) acc.evoOff += 1
        return acc
    }, {
        total: 0,
        qrDisconnected: 0,
        qrConnected: 0,
        evoOn: 0,
        evoOff: 0,
    })

    // Función futura para ejecutar filtro

    const handleFilter = useCallback((status: StatusKey) => {
        if (status === "total") {
            onFilterChange(null); // Mostrar todos
        } else {
            onFilterChange(status);
        }
    }, [onFilterChange]);

    return (
        <div className="flex flex-col sm:flex-row">
            {(
                ["total", "qrDisconnected", "qrConnected", "evoOn", "evoOff"] as StatusKey[]
            ).map((key) => {
                const { icon: Icon, colorClass, tooltip } = statusMap[key]
                const value = counts[key]

                return (
                    <Tooltip key={key}>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={() => handleFilter(key)}
                                variant={"outline"}
                                className="w-full"
                            >
                                <Icon className={`${colorClass} size-5`} />
                                <span className="text-md">
                                    {value}
                                </span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tooltip}</TooltipContent>
                    </Tooltip>
                )
            })}
        </div>
    )
}