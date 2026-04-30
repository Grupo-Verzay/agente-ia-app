"use client"

import {
    ColumnDef,
} from "@tanstack/react-table"
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ApiKey } from "@prisma/client"
import { toast } from "sonner"
import { DialogApiKeyType } from "../connection-types"

export const getColumns = (
    handleDialogAction: (apiKeyId: string, dialogType: DialogApiKeyType) => void
): ColumnDef<ApiKey>[] => [
        {
            accessorKey: "id",
            header: "ID",
            enableHiding: true,
            meta: { shouldShow: false }
        },
        {
            accessorKey: "url",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        URL
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const url = row.getValue("url") as string;
                return (
                    <div className="font-medium">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {url}
                        </a>
                    </div>
                )
            },
        },
        {
            accessorKey: "key",
            header: "API Key",
            cell: ({ row }) => {
                const key = row.getValue("key") as string;
                return (
                    <div className="flex items-center">
                        <span className="font-mono px-2 py-1 rounded">
                            {key.substring(0, 8)}...
                        </span>
                    </div>
                )
            },
        },
        {
            accessorKey: "createdAt",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Fecha de creación
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const date = row.getValue("createdAt") as Date;
                const formattedDate = new Intl.DateTimeFormat('es-CO', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(new Date(date));

                return <div>{formattedDate}</div>;
            },
        },
        {
            accessorKey: "updatedAt",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Última actualización
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const date = row.getValue("updatedAt") as Date;
                const formattedDate = new Intl.DateTimeFormat('es-CO', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(new Date(date));

                return <div>{formattedDate}</div>;
            },
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => {
                const apiKey = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            {/* <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(apiKey.key)}
                        >
                            Asignar
                        </DropdownMenuItem> */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => handleDialogAction(apiKey.id, 'edit')}
                                className="text-blue-600"
                            >
                                Editar API Key
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => handleDialogAction(apiKey.id, 'delete')}
                                className="text-red-600"
                            >
                                Eliminar API Key
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
        },
    ]