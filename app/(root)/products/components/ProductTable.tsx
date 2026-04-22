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
            header: "SKU",
            accessorKey: "sku",
            cell: ({ getValue }) => {
                const v = getValue() as string | null;
                return v ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span> : "—";
            },
        },
        {
            header: "Precio",
            accessorKey: "price",
            cell: ({ getValue }) => `$${Number(getValue()).toLocaleString('es-CO')}`,
        },
        {
            header: "Stock",
            accessorKey: "stock",
            cell: ({ getValue }) => {
                const v = getValue() as number;
                return (
                    <Badge variant={v <= 0 ? "destructive" : v < 5 ? "outline" : "secondary"}>
                        {v}
                    </Badge>
                );
            },
        },
        {
            header: "Estado",
            accessorKey: "isActive",
            cell: ({ getValue }) => (
                <Badge variant={getValue() ? "default" : "secondary"}>
                    {getValue() ? "Activo" : "Inactivo"}
                </Badge>
            ),
        },
        {
            header: "Categoría",
            accessorKey: "category",
            cell: ({ getValue }) => getValue() || "—",
        },
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
                            className="w-16 h-16 object-cover rounded"
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

            </CardContent>
        </Card>
    );
};
