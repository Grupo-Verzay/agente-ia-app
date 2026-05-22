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
import { Pencil, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
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
    const [uploadingImage, setUploadingImage] = useState(false);
    const [priceDisplay, setPriceDisplay] = useState('');

    const form = useForm<ProductInput>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            id: product?.id,
            title: product?.title ?? "",
            description: product?.description ?? "",
            price: product?.price != null ? Number(product.price) : 0,
            sku: product?.sku ?? "",
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
            price: product?.price != null ? Number(product.price) : 0,
            sku: product?.sku ?? "",
            stock: product?.stock ?? 0,
            isActive: product?.isActive ?? true,
            images: (product?.images ?? []) as string[],
            userId,
            category: product?.category ?? "",
            tags: product?.tags ?? [],
        });
        setImagePreview(product?.images?.[0] ?? null);
        const initialPrice = product?.price != null ? Number(product.price) : 0;
        setPriceDisplay(initialPrice > 0 ? initialPrice.toLocaleString('es-CO') : '');
    }, [open, product, userId, form]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;

        setUploadingImage(true);
        const toastId = toast.loading('Subiendo imagen...');
        try {
            const content = await file.arrayBuffer();
            const plainFile = { name: file.name, size: file.size, type: file.type, content: Array.from(new Uint8Array(content)) };
            const optimizedFile = await optimizeFile(plainFile);
            const blob = new Blob([new Uint8Array(optimizedFile.buffer)], { type: optimizedFile.type });

            const formData = new FormData();
            formData.append('file', blob);
            formData.append('userID', userId);

            const res = await fetch('/api/upload-products', { method: 'POST', body: formData });
            if (!res.ok) throw new Error(await res.text());
            const { url } = await res.json();

            form.setValue("images", [url]);
            setImagePreview(url);
            toast.success('Imagen cargada', { id: toastId });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Error al subir imagen';
            toast.error(msg, { id: toastId });
        } finally {
            setUploadingImage(false);
            e.target.value = '';
        }
    };

    const handleImageRemove = () => {
        form.setValue("images", []);
        setImagePreview(null);
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
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center justify-between pr-6">
                        <DialogTitle>{product?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={form.watch("isActive")}
                                onCheckedChange={(v) => form.setValue("isActive", v)}
                            />
                            <Label htmlFor="isActive" className="cursor-pointer text-sm whitespace-nowrap">
                                {form.watch("isActive") ? "Activo" : "Inactivo"}
                            </Label>
                        </div>
                    </div>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="flex flex-col gap-3">

                        {/* Nombre — Precio */}
                        <div className="flex gap-3">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label>Nombre del producto</Label>
                                <Input {...form.register("title")} placeholder="Nombre del producto" />
                            </div>
                            <div className="flex w-full flex-col gap-1.5">
                                <Label>Precio</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                    <Input
                                        className="pl-6"
                                        inputMode="numeric"
                                        value={priceDisplay}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            const num = raw ? parseInt(raw, 10) : 0;
                                            setPriceDisplay(num > 0 ? num.toLocaleString('es-CO') : '');
                                            form.setValue('price', num);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Categoría — Código */}
                        <div className="flex gap-3">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label>Categoría</Label>
                                <Input {...form.register("category")} placeholder="Ej: Zapatos" />
                            </div>
                            <div className="flex w-full flex-col gap-1.5">
                                <Label>Código</Label>
                                <Input {...form.register("sku")} placeholder="Ej: SAD005" className="font-mono" />
                            </div>
                        </div>

                        {/* Descripción */}
                        <div className="flex flex-col gap-1.5">
                            <Label>Descripción</Label>
                            <Textarea rows={4} {...form.register("description")} placeholder={"Características del producto:\n- Material\n- Talla\n- Color"} />
                        </div>

                        {/* Imagen */}
                        <div className="flex flex-col gap-1.5">
                            <div className="relative group aspect-square w-40 mx-auto rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                                {!imagePreview ? (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer gap-1 text-muted-foreground hover:text-foreground transition-colors">
                                        <span className="text-2xl leading-none">+</span>
                                        <span className="text-xs">Subir imagen</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={uploadingImage}
                                            onChange={handleImageUpload}
                                            className="sr-only"
                                        />
                                    </label>
                                ) : (
                                    <>
                                        <SafeImage
                                            src={imagePreview}
                                            alt="Vista previa"
                                            className="max-w-full max-h-full object-contain p-1"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                                        <button
                                            type="button"
                                            onClick={handleImageRemove}
                                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <span className="bg-destructive text-destructive-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                                                ✕
                                            </span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex justify-between gap-2 pt-3 border-t">
                            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button variant="save" type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
