'use client'

import { useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Copy, ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_AI_LABELS } from '@/schema/ai'

const EXTRA_TAB_LABELS = {
    ANALYZER: "Analizador",
} as const

export const allowed = ["TRAINING", "FAQs", "ANALYZER"] as const
type AllowedTab = typeof allowed[number]

type PromptByTab = Partial<Record<string, string>>

export const AiTabs = ({
    onTabChange,
    promptsByTab, 
}: {
    onTabChange?: (tab: string) => void
    promptsByTab: PromptByTab
}) => {
    const tabLabels = { ...TYPE_AI_LABELS, ...EXTRA_TAB_LABELS }
    const firstAllowed = Object.entries(tabLabels).find(([key]) => allowed.includes(key as AllowedTab))?.[0] ?? allowed[0]
    const [activeTab, setActiveTab] = useState<string>(firstAllowed)
    const scrollRef = useRef<HTMLDivElement>(null)

    const activeTabs = Object.entries(tabLabels).filter(([key]) => allowed.includes(key as AllowedTab))

    const handleTabClick = (key: string) => {
        setActiveTab(key)
        onTabChange?.(key)
    }

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return
        const scrollAmount = 150
        scrollRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth',
        })
    }

    const activePrompt = useMemo(() => promptsByTab[activeTab] ?? "", [promptsByTab, activeTab])

    return (
        <div className="w-full">
            <div className="flex justify-between">
                <Button variant="ghost" size="icon" onClick={() => scroll('left')} className="sm:hidden">
                    <ArrowLeft />
                </Button>

                <div
                    ref={scrollRef}
                    className={cn(
                        'flex overflow-x-auto gap-2 pb-1 scrollbar-none',
                        'sm:overflow-visible sm:justify-start sm:flex-wrap'
                    )}
                >
                    {activeTabs.map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => handleTabClick(key)}
                            className={cn(
                                'px-4 py-2 rounded-t-md font-medium text-sm border-b-2 transition-colors duration-150 whitespace-nowrap',
                                activeTab === key
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground'
                            )}
                        >
                            {label}
                        </button>
                    ))}

                    <PromptPreviewDialog
                        activeTab={activeTab}
                        activeLabel={tabLabels[activeTab as keyof typeof tabLabels] ?? activeTab}
                        promptFormatted={activePrompt}
                    />
                </div>

                <Button variant="ghost" size="icon" onClick={() => scroll('right')} className="sm:hidden">
                    <ArrowRight />
                </Button>
            </div>
        </div>
    )
}

interface PromptPreviewDialogProps {
    activeTab: string
    activeLabel: string
    promptFormatted: string
}

export const PromptPreviewDialog = ({ activeTab, activeLabel, promptFormatted }: PromptPreviewDialogProps) => {
    const [open, setOpen] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(promptFormatted ?? "")
            toast.success("Copiado al portapapeles")
        } catch {
            toast.error("No se pudo copiar")
        }
    }

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                Previsualizar
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] p-0 flex flex-col">
                    <DialogHeader className="px-6 pt-6 pb-3 border-b">
                        <DialogTitle className="flex items-center justify-between w-full">
                            Vista previa — {activeLabel}
                            <Button size="sm" variant="ghost" onClick={handleCopy} className="gap-1 hover:bg-muted">
                                <Copy className="w-4 h-4" />
                                Copiar
                            </Button>
                        </DialogTitle>
                        {/* si quieres mostrar el key técnico */}
                        <div className="text-xs text-muted-foreground">Tab: {activeTab}</div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/30 rounded-md text-sm font-mono whitespace-pre-wrap leading-relaxed">
                        {promptFormatted || "No hay contenido para mostrar."}
                    </div>

                    <DialogFooter className="px-6 py-3 border-t">
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
