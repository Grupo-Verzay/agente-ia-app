import React from 'react'
import { Upload, Image as ImageIcon, Sparkles, X } from 'lucide-react'
import { SafeImage } from '@/components/custom/SafeImage'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { STUDIO_STEPS } from '../ad-generator.constants'

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
}: StepImagesProps) => (
  <ScrollArea className="h-full pr-2">
    <div className="flex min-h-full flex-col gap-3 pb-1">
      <input
        type="file"
        ref={fileInputRef}
        onChange={onUpload}
        accept="image/*"
        multiple
        className="hidden"
      />

      <div className="relative min-h-[180px] overflow-hidden rounded-3xl border border-border/70 bg-muted/20 sm:min-h-[200px]">
        {currentSourceImage ? (
          <>
            <SafeImage
              src={currentSourceImage}
              alt={`Producto ${activeImageIndex + 1}`}
              fill
              sizes="460px"
              className="object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full">Producto {activeImageIndex + 1}</Badge>
              <Badge variant="outline" className="rounded-full bg-background/90">
                {sourceImages.length} cargadas
              </Badge>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-background">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Todavia no hay referencias cargadas</p>
              <p className="text-xs text-muted-foreground">
                La imagen seleccionada aqui sera la base del preview y de la generacion.
              </p>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex min-h-[108px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-5 text-center transition hover:bg-muted/50"
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border bg-background">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Haz clic para subir imagenes</p>
        <p className="text-xs text-muted-foreground">{`${STUDIO_STEPS[0].helper} Idealmente 1 a 4 angulos del producto`}</p>
      </button>

      {sourceImages.length > 0 ? (
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-3 pb-2">
            {sourceImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => onSelectImage(idx)}
                className={`relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-2xl border transition ${
                  activeImageIndex === idx
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <SafeImage
                  src={img}
                  alt={`Producto ${idx + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-1 top-1 h-6 w-6 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(idx)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <Alert className="rounded-2xl border-border/70">
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Recomendacion</AlertTitle>
          <AlertDescription>
            Sube una imagen limpia del producto primero. Luego puedes anadir mas angulos para generar la
            misma imagen en lote.
          </AlertDescription>
        </Alert>
      )}
    </div>
  </ScrollArea>
)
