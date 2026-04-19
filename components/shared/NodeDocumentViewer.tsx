"use client";

/**
 * NodeDocumentViewer
 *
 * Compact document viewer designed for Workflow / Flow NodeCards.
 * Responsibilities (SRP):
 *   - Detect MIME type from filename or URL extension
 *   - Render a card-compatible compact preview
 *   - Delegate full rendering to DocumentViewer via a Dialog
 *
 * Extension is open (OCP): add new MIME types by editing EXTENSION_MIME_MAP only.
 * Depends on DocumentViewer via its public interface (DIP).
 */

import React, { useState } from "react";
import {
    Download,
    ExternalLink,
    FileArchive,
    FileCode,
    FileSpreadsheet,
    FileText,
    FileType,
    Maximize2,
} from "lucide-react";

import { DocumentViewer } from "@/app/(root)/chats/_components/media-viewer/viewers/DocumentViewer";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

// ─── MIME type detection (OCP — extend map, never touch logic) ───────────────

const EXTENSION_MIME_MAP: Record<string, string> = {
    pdf:  "application/pdf",
    doc:  "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls:  "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt:  "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt:  "text/plain",
    csv:  "text/csv",
    rtf:  "application/rtf",
    zip:  "application/zip",
    rar:  "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    html: "text/html",
    json: "application/json",
    xml:  "application/xml",
    js:   "text/javascript",
};

/** Extracts the lowercase extension from a filename or URL. */
function getExtension(name: string): string {
    return (name.split("?")[0].split(".").pop() ?? "").toLowerCase();
}

/**
 * Resolves MIME type by checking `filename` first, then the raw `url`.
 * Falls back to `application/octet-stream` when unknown.
 */
export function getMimeTypeFromNode(url: string, filename?: string | null): string {
    const ext = filename ? getExtension(filename) : getExtension(url);
    return EXTENSION_MIME_MAP[ext] ?? "application/octet-stream";
}

// ─── Icon map (mirrors DocumentViewer, SRP — defined once here) ──────────────

const ICON_MAP: Array<{ mimes: string[]; icon: React.FC<{ className?: string }> }> = [
    { mimes: ["application/pdf"], icon: FileType },
    {
        mimes: [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
        ],
        icon: FileSpreadsheet,
    },
    {
        mimes: [
            "application/zip",
            "application/x-zip-compressed",
            "application/x-rar-compressed",
            "application/x-7z-compressed",
        ],
        icon: FileArchive,
    },
    {
        mimes: ["text/html", "text/javascript", "application/json", "application/xml"],
        icon: FileCode,
    },
];

function getDocIcon(mimeType: string): React.FC<{ className?: string }> {
    for (const { mimes, icon } of ICON_MAP) {
        if (mimes.some((m) => mimeType.startsWith(m) || mimeType === m)) return icon;
    }
    return FileText;
}

function getExtLabel(mimeType: string): string {
    const part = mimeType.split("/")[1] ?? "";
    return (
        part
            .replace("vnd.openxmlformats-officedocument.", "")
            .replace("vnd.ms-", "")
            .toUpperCase() || "ARCHIVO"
    );
}

function isPdf(mimeType: string): boolean {
    return mimeType === "application/pdf" || mimeType.endsWith("/pdf");
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NodeDocumentViewerProps {
    /** Public URL of the stored document. */
    url: string;
    /** Original filename (preferred for MIME detection). */
    filename?: string | null;
    /** Caption displayed in both compact and full views. */
    caption?: string | null;
    /** Extra class applied to the outer wrapper. */
    className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NodeDocumentViewer({
    url,
    filename,
    caption,
    className,
}: NodeDocumentViewerProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    const mimeType = getMimeTypeFromNode(url, filename);
    const pdf = isPdf(mimeType);
    const DocIcon = getDocIcon(mimeType);
    const displayCaption = caption || filename || "Documento";

    return (
        <div className={`w-full overflow-hidden rounded-md border border-border ${className ?? ""}`}>
            {/* ── PDF: compact iframe preview ─────────────────────────────── */}
            {pdf && (
                <div className="relative">
                    <iframe
                        src={url}
                        title={displayCaption}
                        className="w-full bg-white"
                        style={{ height: "180px", border: "none", display: "block" }}
                    />

                    {/* Overlay gradient + action button */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/90 to-transparent" />

                    <div className="absolute bottom-2 right-2 flex gap-1.5 pointer-events-auto">
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 gap-1.5 text-xs shadow-sm"
                            onClick={() => setDialogOpen(true)}
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Ver completo
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Non-PDF: icon + name + actions ──────────────────────────── */}
            {!pdf && (
                <div className="flex items-center gap-3 bg-muted/40 px-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <DocIcon className="h-5 w-5 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">
                            {displayCaption}
                        </p>
                        <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            {getExtLabel(mimeType)}
                        </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                            <a href={url} download title="Descargar">
                                <Download className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir en nueva pestaña"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Full-screen Dialog (PDF) ─────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="flex max-h-[95vh] max-w-4xl flex-col gap-0 overflow-hidden bg-zinc-900 p-0">
                    <DialogHeader className="flex-row items-center justify-between border-b border-white/10 px-4 py-3">
                        <DialogTitle className="truncate text-sm font-medium text-white/80">
                            {displayCaption}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto">
                        <DocumentViewer
                            url={url}
                            mimeType={mimeType}
                            caption={displayCaption}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
