'use client'

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ProductFormInterface, productSchema, type ProductInput } from "@/lib/validators/product";
import { createProduct, updateProduct, checkIfSkuExists } from "@/actions/products-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { optimizeFile } from "../../workflow/[workflowId]/helpers";
import { SafeImage } from "@/components/custom/SafeImage";

export const ProductForm = ({
    userId,
    product,
    variant = "button",
}: ProductFormInterface) => {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [isSkuDuplicate, setIsSkuDuplicate] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageUploaded, setImageUploaded] = useState<string | null>(null); // Para almacenar la URL de la imagen

    const form = useForm<ProductInput>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            id: product?.id,
            title: product?.title ?? "",
            description: product?.description ?? "",
            price: (product?.price as any) ?? 0,
            sku: product?.sku ?? nanoid(),
            stock: product?.stock ?? 0,
            isActive: product?.isActive ?? true,
            images: (product?.images ?? []) as string[],
            userId,
            category: product?.category ?? "",
            tags: product?.tags ?? [],
        },
    });
    const sku = useWatch({ control: form.control, name: "sku" });

    useEffect(() => {
        const checkSku = async (sku: string | null | undefined) => {
            if (sku && sku.trim() !== "") {
                const isDuplicate = await checkIfSkuExists(sku, userId);
                setIsSkuDuplicate(isDuplicate);
            } else {
                setIsSkuDuplicate(false);
            }
        };
        void checkSku(sku);
    }, [sku, userId]);

    useEffect(() => {
        if (!open) return;

        form.reset({
            id: product?.id,
            title: product?.title ?? "",
            description: product?.description ?? "",
            price: (product?.price as any) ?? 0,
            sku: product?.sku ?? nanoid(),
            stock: product?.stock ?? 0,
            isActive: product?.isActive ?? true,
            images: (product?.images ?? []) as string[],
            userId,
            category: product?.category ?? "",
            tags: product?.tags ?? [],
        });
        setImagePreview(product?.images?.[0] ?? null); // Mostrar imagen previa si existe
        setImageUploaded(product?.images?.[0] ?? null);  // Almacenar la imagen cargada en el estado
    }, [open, product, userId, form]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userId) {
            toast.error('No hay archivo seleccionado');
            return;
        }

        const toastId = toast.loading('Subiendo imagen...');
        try {
            const content = await file.arrayBuffer();
            const plainFile = {
                name: file.name,
                size: file.size,
                type: file.type,
                content: Array.from(new Uint8Array(content))
            };
            const optimizedFile = await optimizeFile(plainFile);
            const optimizedBuffer = new Uint8Array(optimizedFile.buffer);
            const blob = new Blob([optimizedBuffer], { type: optimizedFile.type });

            const formData = new FormData();
            formData.append('file', blob);
            formData.append('userID', userId);

            const res = await fetch('/api/upload-products', { method: 'POST', body: formData });

            if (!res.ok) throw new Error(await res.text());

            const { url } = await res.json();
            form.setValue("images", [url]);
            setImagePreview(url);
            setImageUploaded(url);

            toast.success('Imagen cargada', { id: toastId });
        } catch (error: any) {
            toast.error(error?.message || 'Error al subir la imagen', { id: toastId });
        }
    };

    const handleImageDelete = () => {
        form.setValue("images", []); // Limpiar el campo de imagen
        setImagePreview(null); // Limpiar vista previa
        setImageUploaded(null); // Limpiar URL almacenada
    };

    const onSubmit = form.handleSubmit(async (values) => {
        startTransition(async () => {
            try {
                if (values.id) {
                    await updateProduct(values.id, values);
                } else {
                    await createProduct(values);
                }
                setOpen(false);
            } catch (error) {
                toast.error("¡Este SKU ya está registrado!");
            }
        });
    });

    const Trigger =
        variant === "icon" ? (
            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(true)}
            >
                <Pencil className="h-4 w-4" />
            </Button>
        ) : (
            <Button
                onClick={() => setOpen(true)}
                className=""
            >
               + Agregar producto
            </Button>
        );

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
                form.clearErrors();
                setIsSkuDuplicate(false);
            }
        }}>
            <DialogTrigger asChild>{Trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{product?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <Label>Nombre</Label>
                        <Input {...form.register("title")} placeholder="Nombre del producto" />

                        <div className="flex flex-row justify-between gap-2">
                            <div className="flex w-full flex-col gap-2">
                                <Label>Precio</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register("price", { valueAsNumber: true })}
                                />
                            </div>

                            <div className="flex w-full flex-col gap-2">
                                <Label>Categoría</Label>
                                <Input {...form.register("category")} placeholder="Categoría del producto" />
                            </div>
                        </div>

                        <Label>Descripción</Label>
                        <Textarea rows={4} {...form.register("description")} placeholder="Detalles, características…" />

                        <Label>Imagen</Label>
                        <Input type="file" accept="image/*" onChange={handleImageUpload} />
                        {imagePreview && (
                            <div className="flex justify-center items-center mt-2">
                                <SafeImage src={imagePreview} alt="Vista previa" className="w-32" />
                                <Button type="button" variant={"destructive"} onClick={handleImageDelete} className="ml-2">
                                    Eliminar imagen
                                </Button>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {product?.id ? "Guardar cambios" : "Guardar"}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
