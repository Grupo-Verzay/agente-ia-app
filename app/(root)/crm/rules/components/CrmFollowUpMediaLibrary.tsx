"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileImage, FileText, Film, Loader2, Music, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    createCrmFollowUpMedia,
    deleteCrmFollowUpMedia,
    getCrmFollowUpMediaByStatus,
    type CrmFollowUpMediaItem,
} from "@/actions/crm-follow-up-media-actions";
import { MAX_MEDIA_PER_STATUS } from "@/lib/crm-follow-up-media";

const ACCEPTED_TYPES = "image/*,video/*,audio/*,application/pdf";

const STATUS_HINTS: Record<string, { namePlaceholder: string; descPlaceholder: string; hint: string; nameHint: string; descHint: string }> = {
    FRIO: {
        hint: "Estos archivos se envían a leads que aún no conocen bien tu negocio. Usa materiales que presenten tu empresa, generen confianza y despierten interés.",
        namePlaceholder: "Ej: Presentación corporativa de la empresa",
        nameHint: "Escribe un nombre claro que describa el contenido. La IA lo leerá para decidir si es relevante según lo que haya dicho el lead en la conversación.",
        descPlaceholder: "Ej: Documento PDF que explica quiénes somos, qué servicios ofrecemos, nuestros clientes y por qué elegirnos frente a la competencia.",
        descHint: "Describe brevemente qué contiene el archivo. Cuanto más detallado, mejor podrá decidir la IA cuándo enviarlo.",
    },
    TIBIO: {
        hint: "Estos archivos se envían a leads que ya mostraron interés pero aún no se deciden. Usa materiales que respondan dudas, muestren opciones y acerquen a la compra.",
        namePlaceholder: "Ej: Catálogo de productos con precios actualizados",
        nameHint: "Escribe un nombre claro que describa el contenido. La IA lo leerá para decidir si es relevante según lo que haya dicho el lead en la conversación.",
        descPlaceholder: "Ej: PDF con todos los productos disponibles, sus características, precios y condiciones de compra.",
        descHint: "Describe brevemente qué contiene el archivo. Cuanto más detallado, mejor podrá decidir la IA cuándo enviarlo.",
    },
    CALIENTE: {
        hint: "Estos archivos se envían a leads listos para comprar. Usa materiales que transmitan urgencia, beneficios exclusivos o propuestas concretas para cerrar.",
        namePlaceholder: "Ej: Oferta especial 15% descuento válida esta semana",
        nameHint: "Escribe un nombre claro que describa el contenido. La IA lo leerá para decidir si es relevante según lo que haya dicho el lead en la conversación.",
        descPlaceholder: "Ej: Imagen con la promoción exclusiva para nuevos clientes, válida hasta el viernes. Incluye código de descuento.",
        descHint: "Describe brevemente qué contiene el archivo. Cuanto más detallado, mejor podrá decidir la IA cuándo enviarlo.",
    },
    FINALIZADO: {
        hint: "Estos archivos se envían a clientes que ya compraron. Usa materiales que mejoren su experiencia, fidelicen y motiven una nueva compra o recomendación.",
        namePlaceholder: "Ej: Guía de uso y configuración del producto",
        nameHint: "Escribe un nombre claro que describa el contenido. La IA lo leerá para decidir si es relevante según lo que haya dicho el cliente en la conversación.",
        descPlaceholder: "Ej: Manual en PDF paso a paso para configurar y sacar el máximo provecho del producto adquirido.",
        descHint: "Describe brevemente qué contiene el archivo. Cuanto más detallado, mejor podrá decidir la IA cuándo enviarlo.",
    },
    DESCARTADO: {
        hint: "Estos archivos se envían a leads que no continuaron. Usa materiales que reactiven el interés, recojan feedback o presenten algo nuevo que cambie su decisión.",
        namePlaceholder: "Ej: Encuesta rápida — ¿por qué no seguiste adelante?",
        nameHint: "Escribe un nombre claro que describa el contenido. La IA lo leerá para decidir si es relevante según lo que haya dicho el lead en la conversación.",
        descPlaceholder: "Ej: Formulario corto de 3 preguntas para entender el motivo de salida y mejorar el proceso de ventas.",
        descHint: "Describe brevemente qué contiene el archivo. Cuanto más detallado, mejor podrá decidir la IA cuándo enviarlo.",
    },
};

function detectMediaType(mimeType: string): string {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "document";
}

function MediaTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
    const style = { width: size, height: size };
    if (type === "image") return <FileImage style={style} />;
    if (type === "video") return <Film style={style} />;
    if (type === "audio") return <Music style={style} />;
    return <FileText style={style} />;
}

function MediaTypeLabel({ type }: { type: string }) {
    const labels: Record<string, string> = { image: "Imagen", video: "Video", audio: "Audio", document: "Documento" };
    return <span>{labels[type] ?? type}</span>;
}

type Props = { userId: string; leadStatus: LeadStatus; disabled?: boolean };

export function CrmFollowUpMediaLibrary({ userId, leadStatus, disabled = false }: Props) {
    const hints = STATUS_HINTS[leadStatus] ?? STATUS_HINTS["FRIO"];
    const [items, setItems]             = useState<CrmFollowUpMediaItem[]>([]);
    const [loading, setLoading]         = useState(false);
    const [uploading, setUploading]     = useState(false);
    const [pendingName, setPendingName] = useState("");
    const [pendingDescription, setPendingDescription] = useState("");
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [deletingId, setDeletingId]   = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getCrmFollowUpMediaByStatus(userId, leadStatus);
            if (result.success && result.data) setItems(result.data);
        } finally {
            setLoading(false);
        }
    }, [userId, leadStatus]);

    useEffect(() => { void loadItems(); }, [loadItems]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        if (!pendingName)
            setPendingName(file.name.replace(/\.[^/.]+$/, "").replaceAll("_", " ").replaceAll("-", " "));
    };

    const handleUpload = async () => {
        if (!pendingFile || !pendingName.trim()) {
            toast.error("Selecciona un archivo y escribe un nombre descriptivo.");
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", pendingFile);
            formData.append("userId", userId);

            const res  = await fetch("/api/upload-followup-media", { method: "POST", body: formData });
            const json = await res.json();
            if (!res.ok || !json.url) throw new Error(json.error ?? "Error al subir el archivo.");

            const result = await createCrmFollowUpMedia({
                userId, leadStatus,
                name: pendingName.trim(),
                description: pendingDescription.trim() || undefined,
                url: json.url,
                mediaType: detectMediaType(pendingFile.type),
            });
            if (!result.success || !result.data) throw new Error(result.message ?? "Error al guardar.");

            setItems((prev) => [...prev, result.data!]);
            setPendingFile(null);
            setPendingName("");
            setPendingDescription("");
            if (fileRef.current) fileRef.current.value = "";
            toast.success("Archivo agregado a la biblioteca.");
        } catch (err: any) {
            toast.error(err?.message ?? "Error al subir el archivo.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const result = await deleteCrmFollowUpMedia(userId, id);
            if (!result.success) throw new Error(result.message);
            setItems((prev) => prev.filter((item) => item.id !== id));
            toast.success("Archivo eliminado.");
        } catch (err: any) {
            toast.error(err?.message ?? "Error al eliminar.");
        } finally {
            setDeletingId(null);
        }
    };

    const atLimit = items.length >= MAX_MEDIA_PER_STATUS;
    const isFormDisabled = disabled || uploading || atLimit;

    return (
        <div className="space-y-4">
            {/* Formulario */}
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-sm font-medium">Agregar archivo</p>
                        {!atLimit && <p className="text-xs text-muted-foreground mt-0.5">{hints.hint}</p>}
                    </div>
                    <span className={cn(
                        "shrink-0 text-xs font-medium tabular-nums rounded-full px-2 py-0.5",
                        atLimit
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                    )}>
                        {items.length}/{MAX_MEDIA_PER_STATUS}
                    </span>
                </div>

                {atLimit ? (
                    <div className="flex flex-col items-center gap-2 py-3 text-center">
                        <div className="rounded-full bg-destructive/10 p-4">
                            <UploadCloud className="h-8 w-8 text-destructive" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-base font-bold text-destructive">Límite alcanzado — 8/8</p>
                            <p className="text-sm text-muted-foreground">
                                Eliminá un archivo de la biblioteca para poder subir uno nuevo.
                            </p>
                        </div>
                    </div>
                ) : (
                <>
                <div className="space-y-2">
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        disabled={isFormDisabled}
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <div
                        onClick={() => !isFormDisabled && fileRef.current?.click()}
                        className={cn(
                            "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-5 text-sm transition-all select-none",
                            pendingFile
                                ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                                : "border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10",
                            isFormDisabled && "pointer-events-none opacity-50"
                        )}
                    >
                        {pendingFile ? (
                            <>
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                                <span className="max-w-[260px] truncate text-center text-sm font-semibold text-green-700 dark:text-green-400">
                                    {pendingFile.name}
                                </span>
                                <span className="text-xs text-green-600 dark:text-green-500">
                                    Archivo listo · haz clic para cambiar
                                </span>
                            </>
                        ) : (
                            <>
                                <div className="rounded-xl bg-primary/10 p-3">
                                    <UploadCloud className="h-7 w-7 text-primary" />
                                </div>
                                <span className="font-medium text-foreground">Haz clic para elegir un archivo</span>
                                <span className="text-xs text-muted-foreground">Imagen · Video · Audio · PDF</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">
                        Nombre descriptivo <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        placeholder={hints.namePlaceholder}
                        value={pendingName}
                        onChange={(e) => setPendingName(e.target.value)}
                        disabled={isFormDisabled}
                    />
                    <p className="text-sm text-muted-foreground">{hints.nameHint}</p>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">
                        Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Textarea
                        rows={2}
                        placeholder={hints.descPlaceholder}
                        value={pendingDescription}
                        onChange={(e) => setPendingDescription(e.target.value)}
                        disabled={isFormDisabled}
                    />
                    <p className="text-sm text-muted-foreground">{hints.descHint}</p>
                </div>

                <div className="flex justify-center">
                    <Button size="sm" onClick={handleUpload} disabled={isFormDisabled || !pendingFile} className="bg-green-600 hover:bg-green-700 text-white">
                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        Guardar en biblioteca
                    </Button>
                </div>
                </>
                )}
            </div>

            {/* Lista */}
            <div className="space-y-2">
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando biblioteca...
                    </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                    {items.map((item) => {
                        const bgMap: Record<string, string> = {
                            image:    "bg-blue-50 dark:bg-blue-950/30",
                            video:    "bg-purple-50 dark:bg-purple-950/30",
                            audio:    "bg-green-50 dark:bg-green-950/30",
                            document: "bg-orange-50 dark:bg-orange-950/30",
                        };
                        const iconColorMap: Record<string, string> = {
                            image:    "text-blue-400",
                            video:    "text-purple-400",
                            audio:    "text-green-400",
                            document: "text-orange-400",
                        };
                        const badgeBgMap: Record<string, string> = {
                            image:    "bg-blue-500/80 text-white",
                            video:    "bg-purple-500/80 text-white",
                            audio:    "bg-green-500/80 text-white",
                            document: "bg-orange-500/80 text-white",
                        };
                        return (
                            <div key={item.id} className="group relative flex h-[220px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                                {/* Preview — altura fija siempre */}
                                {item.mediaType === "image" ? (
                                    <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0">
                                        <img src={item.url} alt={item.name} className="h-32 w-full object-cover" />
                                    </a>
                                ) : item.mediaType === "video" ? (
                                    <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0">
                                        <video
                                            src={`${item.url}#t=0.5`}
                                            className="h-32 w-full object-cover"
                                            muted
                                            playsInline
                                            preload="metadata"
                                        />
                                    </a>
                                ) : (
                                    <a href={item.url} target="_blank" rel="noreferrer" className={cn("flex h-32 w-full shrink-0 items-center justify-center", bgMap[item.mediaType] ?? "bg-muted/30")}>
                                        <span className={iconColorMap[item.mediaType] ?? "text-muted-foreground"}>
                                            <MediaTypeIcon type={item.mediaType} size={48} />
                                        </span>
                                    </a>
                                )}

                                {/* Info */}
                                <div className="flex flex-1 flex-col p-3 gap-1 overflow-hidden">
                                    <p className="line-clamp-1 text-sm font-semibold leading-tight">{item.name}</p>
                                    <p className="line-clamp-2 text-xs text-muted-foreground leading-snug">
                                        {item.description || ""}
                                    </p>
                                </div>

                                {/* Tipo de medio — overlay superior izquierdo */}
                                <span className={cn(
                                    "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow backdrop-blur-sm",
                                    badgeBgMap[item.mediaType] ?? "bg-background/80 text-foreground"
                                )}>
                                    <MediaTypeLabel type={item.mediaType} />
                                </span>

                                {/* Eliminar */}
                                <button
                                    type="button"
                                    disabled={deletingId === item.id}
                                    onClick={() => handleDelete(item.id)}
                                    className="absolute right-2 top-2 rounded-full bg-rose-500/80 p-1.5 text-white shadow backdrop-blur-sm hover:bg-rose-600/90 disabled:cursor-not-allowed"
                                >
                                    {deletingId === item.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
