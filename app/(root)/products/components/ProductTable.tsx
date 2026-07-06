"use client";

import { CSSProperties, useEffect, useMemo, useState, useTransition } from "react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { deleteProduct, reorderProducts } from "@/actions/products-actions";
import { Trash2, Loader2, GripVertical } from "lucide-react";
import { ProductTableInterface, ProductType } from "@/types/products";
import { SafeImage } from "@/components/custom/SafeImage";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function SortableProductRow({
    product,
    children,
}: {
    product: ProductType;
    children: React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={cn("border-t transition-colors hover:bg-muted/40", isDragging && "relative z-10 bg-background opacity-80 shadow-sm")}
        >
            <td className="w-10 px-2 py-3 align-middle">
                <button
                    type="button"
                    aria-label={`Mover ${product.title}`}
                    title="Arrastra para ordenar"
                    className="flex h-8 w-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4" />
                </button>
            </td>
            {children}
        </tr>
    );
}

export const ProductTable = ({
    data,
    userId,
}: ProductTableInterface) => {
    const router = useRouter();
    const [deleteTarget, setDeleteTarget] = useState<ProductType | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isReordering, startReorderTransition] = useTransition();
    const [items, setItems] = useState<ProductType[]>(data.items);

    useEffect(() => {
        setItems(data.items);
    }, [data.items]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        await deleteProduct(deleteTarget.id, userId);
        setIsDeleting(false);
        setDeleteTarget(null);
        router.refresh();
    };

    const columns = useMemo<ColumnDef<ProductType>[]>(() => [
        { header: "Nombre", accessorKey: "title", cell: ({ getValue }) => <span className="uppercase">{(getValue() as string) ?? ""}</span> },
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
        data: items,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const next = arrayMove(items, oldIndex, newIndex);
        setItems(next);
        startReorderTransition(() => {
            void reorderProducts(userId, next.map((item) => item.id)).then(() => router.refresh());
        });
    };

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
                                    <th className="w-10 px-2 py-3" title={isReordering ? "Guardando orden..." : "Ordenar"} />
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
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                                <tbody>
                                    {table.getRowModel().rows.map((r) => (
                                        <SortableProductRow key={r.original.id} product={r.original}>
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
                                        </SortableProductRow>
                                    ))}

                                    {items.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={columns.length + 1}
                                                className="py-8 px-3 text-center text-sm text-muted-foreground"
                                            >
                                                No hay productos para mostrar.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </SortableContext>
                        </DndContext>
                    </table>
                </div>

            </CardContent>
        </Card>
        </>
    );
};
