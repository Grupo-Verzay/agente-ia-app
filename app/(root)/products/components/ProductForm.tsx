'use client'

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ProductFormInterface, productSchema, type ProductInput } from "@/lib/validators/product";
import { createProduct, updateProduct, checkIfSkuExists } from "@/actions/products-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Loader2, ImagePlus, X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { optimizeFile } from "../../workflow/[workflowId]/helpers";
import { SafeImage } from "@/components/custom/SafeImage";

export const ProductForm = ({
    userId,
    product,
    variant = "button",
    disabled = false,
}: ProductFormInterface) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSkuDuplicate, setIsSkuDuplicate] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
    const [priceDisplay, setPriceDisplay] = useState('');
    const [comparePriceDisplay, setComparePriceDisplay] = useState('');
    const [trackStock, setTrackStock] = useState(() => (product?.stock ?? -1) >= 0);
    const [stockDisplay, setStockDisplay] = useState(() => {
        const s = product?.stock ?? -1;
        return s >= 0 ? String(s) : '';
    });
    const [tagInput, setTagInput] = useState('');

    const form = useForm<ProductInput>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            id: product?.id,
            title: product?.title ?? "",
            description: product?.description ?? "",
            price: product?.price != null ? Number(product.price) : 0,
            sku: product?.sku ?? "",
            stock: product?.stock ?? -1,
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
            comparePrice: product?.comparePrice != null ? Number(product.comparePrice) : null,
            sku: product?.sku ?? "",
            stock: product?.stock ?? 0,
            isActive: product?.isActive ?? true,
            images: (product?.images ?? []) as string[],
            userId,
            category: product?.category ?? "",
            tags: product?.tags ?? [],
        });
        const initialPrice = product?.price != null ? Number(product.price) : 0;
        setPriceDisplay(initialPrice > 0 ? initialPrice.toLocaleString('es-CO') : '');
        const initialCompare = product?.comparePrice != null ? Number(product.comparePrice) : 0;
        setComparePriceDisplay(initialCompare > 0 ? initialCompare.toLocaleString('es-CO') : '');
        const initialStock = product?.stock ?? -1;
        const tracking = initialStock >= 0;
        setTrackStock(tracking);
        setStockDisplay(tracking ? String(initialStock) : '');
        setTagInput('');
    }, [open, product, userId, form]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, slotIndex: number) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;

        setUploadingImage(true);
        setUploadingIndex(slotIndex);
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

            const current = form.getValues('images') ?? [];
            form.setValue('images', [...current, url]);
            toast.success('Imagen cargada', { id: toastId });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Error al subir imagen';
            toast.error(msg, { id: toastId });
        } finally {
            setUploadingImage(false);
            setUploadingIndex(null);
            e.target.value = '';
        }
    };

    const handleImageRemove = (index: number) => {
        const current = form.getValues('images') ?? [];
        form.setValue('images', current.filter((_, i) => i !== index));
    };

    const onSubmit = form.handleSubmit(async (values) => {
        setIsSaving(true);
        try {
            if (values.id) {
                await updateProduct(values.id, values);
            } else {
                await createProduct(values);
            }
            toast.success(values.id ? 'Producto actualizado' : 'Producto creado');
            setOpen(false);
            router.refresh();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Error al guardar el producto';
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
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
                disabled={disabled}
                title={disabled ? "Límite de productos alcanzado para tu plan" : undefined}
            >
               + Agregar
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
            <DialogContent className="sm:max-w-lg h-[585px] flex flex-col overflow-hidden">
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
                <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex flex-col gap-3 flex-1 overflow-y-auto px-1">

                        {/* Imágenes — hasta 4 */}
                        <div className="flex flex-col gap-2 shrink-0">
                            <div className="flex gap-2 justify-center">
                                {(form.watch('images') ?? []).map((url, i) => (
                                    <div key={i} className="relative group w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-gray-100">
                                        <SafeImage src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors" />
                                        <button
                                            type="button"
                                            onClick={() => handleImageRemove(i)}
                                            className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                        {i === 0 && (
                                            <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">
                                                Principal
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {(form.watch('images') ?? []).length < 4 && (
                                    <label className={`flex w-24 h-24 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all select-none
                                        ${uploadingImage ? 'pointer-events-none opacity-50' : 'border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10'}`}>
                                        {uploadingImage && uploadingIndex === (form.watch('images') ?? []).length ? (
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        ) : (
                                            <>
                                                <ImagePlus className="h-5 w-5 text-primary/60" />
                                                <span className="text-[10px] text-muted-foreground mt-1">Agregar</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={uploadingImage}
                                            onChange={(e) => handleImageUpload(e, (form.watch('images') ?? []).length)}
                                            className="sr-only"
                                        />
                                    </label>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                {(form.watch('images') ?? []).length}/4 fotos · La primera es la imagen principal
                            </p>
                        </div>

                        {/* Nombre */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Nombre</Label>
                            <Input {...form.register("title")} placeholder="Ej: Zapatilla deportiva" />
                        </div>

                        {/* Precio — Precio anterior */}
                        <div className="flex gap-3">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-sm font-semibold">Precio</Label>
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
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-sm font-semibold">
                                    Precio antes{' '}
                                    <span className="font-normal text-muted-foreground">(opcional)</span>
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                    <Input
                                        className="pl-6"
                                        inputMode="numeric"
                                        value={comparePriceDisplay}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            const num = raw ? parseInt(raw, 10) : 0;
                                            setComparePriceDisplay(num > 0 ? num.toLocaleString('es-CO') : '');
                                            form.setValue('comparePrice', num > 0 ? num : null);
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Se mostrará tachado en el catálogo</p>
                            </div>
                        </div>

                        {/* Categoría — Código */}
                        <div className="flex gap-3">
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-sm font-semibold">Categoría</Label>
                                <Input {...form.register("category")} placeholder="Ej: Zapatos" />
                            </div>
                            <div className="flex w-full flex-col gap-1.5">
                                <Label className="text-sm font-semibold">Código</Label>
                                <Input {...form.register("sku")} placeholder="Ej: SAD005" />
                                {isSkuDuplicate && (
                                    <p className="text-xs text-destructive">Este código ya está registrado.</p>
                                )}
                            </div>
                        </div>

                        {/* Inventario */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Inventario</Label>
                            <div className="flex gap-3 items-center">
                                <div className="w-full">
                                    <Input
                                        inputMode="numeric"
                                        disabled={!trackStock}
                                        value={trackStock ? stockDisplay : ''}
                                        placeholder={trackStock ? "0" : "Sin límite"}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            const num = raw === '' ? 0 : parseInt(raw, 10);
                                            setStockDisplay(raw);
                                            form.setValue('stock', num);
                                        }}
                                    />
                                </div>
                                <div className="w-full flex items-center justify-end gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {trackStock ? 'Controlado' : 'Sin límite'}
                                    </span>
                                    <Switch
                                        checked={trackStock}
                                        onCheckedChange={(v) => {
                                            setTrackStock(v);
                                            if (!v) {
                                                form.setValue('stock', -1);
                                                setStockDisplay('');
                                            } else {
                                                form.setValue('stock', 0);
                                                setStockDisplay('0');
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Etiquetas */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">
                                Etiquetas{' '}
                                <span className="font-normal text-muted-foreground">(opcional)</span>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={tagInput}
                                    placeholder="Ej.: oferta, nuevo, verano..."
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const tag = tagInput.trim().toLowerCase();
                                            const current = form.getValues('tags') ?? [];
                                            if (tag && !current.includes(tag) && current.length < 10) {
                                                form.setValue('tags', [...current, tag]);
                                            }
                                            setTagInput('');
                                        }
                                        if (e.key === 'Backspace' && tagInput === '') {
                                            const current = form.getValues('tags') ?? [];
                                            if (current.length > 0) {
                                                form.setValue('tags', current.slice(0, -1));
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const tag = tagInput.trim().toLowerCase();
                                        const current = form.getValues('tags') ?? [];
                                        if (tag && !current.includes(tag) && current.length < 10) {
                                            form.setValue('tags', [...current, tag]);
                                        }
                                        setTagInput('');
                                    }}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                            {(form.watch('tags') ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {(form.watch('tags') ?? []).map((tag) => (
                                        <span
                                            key={tag}
                                            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const current = form.getValues('tags') ?? [];
                                                    form.setValue('tags', current.filter((t) => t !== tag));
                                                }}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Descripción */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Descripción</Label>
                            <Textarea rows={5} className="resize-none" {...form.register("description")} placeholder={"Características del producto:\n- Marca\n- Material\n- Talla\n- Color"} />
                        </div>

                    </div>

                        {/* Acciones */}
                        <div className="flex justify-between gap-2 pt-3 mt-2 shrink-0">
                            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button variant="save" type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar
                            </Button>
                        </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
