'use client'

import React from 'react'
import { Upload, Sparkles, X } from 'lucide-react'
import { SafeImage } from '@/components/custom/SafeImage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface StepImagesProps {
  fileInputRef: React.RefObject<HTMLInputElement>
  sourceImages: string[]
  activeImageIndex: number
  currentSourceImage: string | undefined
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (index: number) => void
  onSelectImage: (index: number) => void
}

export const StepImages = ({
  fileInputRef,
  sourceImages,
  activeImageIndex,
  currentSourceImage,
  onUpload,
  onRemove,
  onSelectImage,
}: StepImagesProps) => {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={onUpload}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* Preview / Dropzone */}
      {currentSourceImage ? (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-border/70 bg-muted/10">
          <SafeImage
            src={currentSourceImage}
            alt={`Producto ${activeImageIndex + 1}`}
            fill
            sizes="460px"
            className="object-contain p-3"
            referrerPolicy="no-referrer"
          />
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full">Producto {activeImageIndex + 1}</Badge>
            <Badge variant="outline" className="rounded-full bg-background/90">
              {sourceImages.length} cargada{sourceImages.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-[220px] flex-1 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/70 bg-muted/10 px-6 py-4 text-center transition hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-background">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Haz clic para subir imágenes</p>
            <p className="text-xs text-muted-foreground">Idealmente 1 a 4 ángulos del producto</p>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-left">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sube una imagen limpia del producto primero. Luego puedes añadir más ángulos para generar la misma imagen en lote.
            </p>
          </div>
        </button>
      )}

      {/* Botón agregar más — solo cuando ya hay imágenes */}
      {sourceImages.length > 0 && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 py-2.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" />
          Agregar más imágenes
        </button>
      )}

      {/* Miniaturas */}
      {sourceImages.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2.5">
          {sourceImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0">
              <div
                onClick={() => onSelectImage(idx)}
                className={[
                  'relative h-[72px] w-[72px] cursor-pointer overflow-hidden rounded-2xl border-2 transition',
                  activeImageIndex === idx
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/40',
                ].join(' ')}
              >
                <SafeImage
                  src={img}
                  alt={`Producto ${idx + 1}`}
                  fill
                  sizes="72px"
                  className="object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full shadow-sm"
                onClick={() => onRemove(idx)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
