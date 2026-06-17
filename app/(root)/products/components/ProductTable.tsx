"use client";

import { useMemo, useState } from "react";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "./ProductForm";
import { deleteProduct } from "@/actions/products-actions";
import { Trash2, Loader2 } from "lucide-react";
import { ProductTableInterface, ProductType } from "@/types/products";
import { SafeImage } from "@/components/custom/SafeImage";
import { useRouter } from "next/navigation";


export const ProductTable = ({
    data,
    userId,
}: ProductTableInterface) => {
    const router = useRouter();
    const [deleteTarget, setDeleteTarget] = useState<ProductType | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteProduct(deleteTarget.id, userId);
        setIsDeleting(false);
        setDeleteTarget(null);
        router.refresh();
    };

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
            cell: ({ getValue }) => (
                <span className="whitespace-nowrap">{`$${Number(getValue()).toLocaleString('es-CO')}`}</span>
            ),
        },
        {
            header: "Stock",
            accessorKey: "stock",
            cell: ({ getValue }) => {
                const v = getValue() as number;
                if (v < 0) return <span className="text-muted-foreground text-xs">Sin límite</span>;
                return (
                    <span className={v === 0 ? 'text-destructive font-medium' : ''}>
                        {v}
                    </span>
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
            header: () => <span className="block text-center">Imagen</span>,
            id: "imagen",
            cell: ({ row }) => (
                <div className="flex justify-center">
                    {row.original.images.length > 0 ? (
                        <SafeImage
                            src={row.original.images[0]}
                            alt="Product"
                            width={64}
                            height={64}
                            className="w-16 h-16 object-cover rounded"
                        />
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    )}
                </div>
            ),
        },
        {
            id: "actions",
            header: "Acciones",
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
                        onClick={() => setDeleteTarget(row.original)}
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
        <>
        <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteTarget(null); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Eliminar producto</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    ¿Seguro que quieres eliminar <span className="font-semibold text-foreground">&quot;{deleteTarget?.title}&quot;</span>? Esta acción no se puede deshacer.
                </p>
                <div className="flex justify-between gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                        Cancelar
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Eliminar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border">
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="w-full flex-1 overflow-auto">
                    <table className="w-full text-sm">
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id} className="border-b">
                                    {hg.headers.map((h) => (
                                        <th
                                            key={h.id}
                                            className="text-left py-3 px-3 text-sm font-semibold text-foreground"
                                            style={
                                                h.column.id === "imagen" ? { width: 160, minWidth: 160 } :
                                                h.column.id === "actions" ? { width: 88, minWidth: 88 } :
                                                undefined
                                            }
                                        >
                                            {h.isPlaceholder
                                                ? null
                                                : flexRender(h.column.columnDef.header, h.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((r) => (
                                <tr key={r.id} className="border-t hover:bg-muted/40 transition-colors">
                                    {r.getVisibleCells().map((c) => (
                                        <td
                                            key={c.id}
                                            className="py-3 px-3 align-middle"
                                            style={
                                                c.column.id === "imagen" ? { width: 160, minWidth: 160 } :
                                                c.column.id === "actions" ? { width: 88, minWidth: 88 } :
                                                undefined
                                            }
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
                                        className="py-8 px-3 text-center text-sm text-muted-foreground"
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
        </>
    );
};
