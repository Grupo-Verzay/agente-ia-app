"use client";

import { useMemo } from "react";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "./ProductForm";
import { deleteProduct } from "@/actions/products-actions";
import { Trash2 } from "lucide-react";
import { ProductTableInterface, ProductType } from "@/types/products";
import { SafeImage } from "@/components/custom/SafeImage";


export const ProductTable = ({
    data,
    userId,
}: ProductTableInterface) => {
    const columns = useMemo<ColumnDef<ProductType>[]>(() => [
        { header: "Nombre", accessorKey: "title" },
        {
            header: "Detalles",
            accessorKey: "description",
            cell: ({ getValue }) => {
                const value = getValue() as string | null;
                if (!value) return "—";
                const text = value.trim();
                if (!text) return "—";
                return text.length > 80 ? `${text.slice(0, 80)}…` : text;
            },
        },
        // {
        //     header: "SKU",
        //     accessorKey: "sku",
        //     cell: ({ getValue }) => getValue() || "—",
        // },
        {
            header: "Precio",
            accessorKey: "price",
            cell: ({ getValue }) =>
                `$${getValue()}`,
        },
        // { header: "Stock", accessorKey: "stock" },
        // {
        //     header: "Estado",
        //     accessorKey: "isActive",
        //     cell: ({ getValue }) => (
        //         <Badge variant={getValue() ? "default" : "secondary"}>
        //             {getValue() ? "Activo" : "Inactivo"}
        //         </Badge>
        //     ),
        // },
        {
            header: "Categoría", // Nueva columna para la categoría
            accessorKey: "category",
            cell: ({ getValue }) => getValue() || "—",
        },
        // {
        //     header: "Etiquetas", // Nueva columna para las etiquetas
        //     accessorKey: "tags",
        //     cell: ({ getValue }) => {
        //         const tags = getValue() as string[]; // Hacemos un type assertion a string[]
        //         return tags && tags.length > 0 ? tags.join(", ") : "—";
        //     },
        // },
        {
            header: "Imagen",
            cell: ({ row }) => (
                <div>
                    {row.original.images.length > 0 ? (
                        <SafeImage
                            src={row.original.images[0]}
                            alt="Product"
                            width={64}
                            height={64}
                            className="w-16 h-16 object-cover"
                        />
                    ) : (
                        "—"
                    )}
                </div>
            ),
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => (
                <div className="flex gap-2 justify-end">
                    <ProductForm
                        product={row.original}
                        userId={userId}
                        variant="icon"
                    />
                    <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        onClick={async () => {
                            await deleteProduct(row.original.id, userId);
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ),
        },
    ], [userId]);

    const table = useReactTable({
        data: data.items,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <Card>
            <CardContent className="p-2">
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id} className="text-xs">
                                    {hg.headers.map((h) => (
                                        <th
                                            key={h.id}
                                            className="text-left py-2 px-2 font-medium"
                                        >
                                            {h.isPlaceholder
                                                ? null
                                                : h.column.columnDef.header as any}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((r) => (
                                <tr key={r.id} className="border-t">
                                    {r.getVisibleCells().map((c) => (
                                        <td
                                            key={c.id}
                                            className="py-2 px-2 align-center"
                                        >
                                            {flexRender(
                                                c.column.columnDef.cell,
                                                c.getContext(),
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {data.items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="py-4 px-2 text-center text-xs text-muted-foreground"
                                    >
                                        No hay productos para mostrar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación simple */}
                <div className="flex items-center justify-end gap-2 p-2">
                    <span className="text-xs">
                        Página {data.page} de {data.pages}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
};
