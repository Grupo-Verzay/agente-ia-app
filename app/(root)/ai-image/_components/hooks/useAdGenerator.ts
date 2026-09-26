'use client'

import { useMemo, useRef, useState } from 'react'
import {
  deleteUserVisualStyle,
  generarCopyDelAnuncio,
  generateAdImage,
  saveUserVisualStyle,
} from '@/actions/ai-image-actions'
import { laLlaveDeLaVista, porQueFalloGemini } from '@/lib/copy-del-anuncio'
import {
  AD_FORMATS,
  DEFAULT_STYLES,
  GENERATION_MODELS,
  IMAGE_QUALITY_OPTIONS,
  MARKETING_TEMPLATES,
  STUDIO_STEPS,
} from '../ad-generator.constants'
import type { AdFormat, CustomStyle, StudioStepId } from '../ad-generator.types'

// Record<imageIndex, Record<"templateId_formatId", string[]>>
type GeneratedImages = Record<number, Record<string, string[]>>

// El copy vive en la MISMA llave que su imagen: una por producto y vista, no
// una por variante — el texto habla del producto y de la red, y esos no cambian
// entre variantes de la misma imagen.
type CopiesGenerados = Record<number, Record<string, string>>

/** Para los avisos y el «generando»: el producto y su vista, en una cadena. */
const llaveDelAviso = (imageIndex: number, vista: string) => `${imageIndex}|${vista}`

export const useAdGenerator = (initialDbStyles: { id: string; name: string; description: string }[] = []) => {
  const [activeStep, setActiveStep] = useState<StudioStepId>('images')
  const [sourceImages, setSourceImages] = useState<string[]>([])
  const [generatedImages, setGeneratedImages] = useState<GeneratedImages>({})
  const [copies, setCopies] = useState<CopiesGenerados>({})
  const [copyEnMarcha, setCopyEnMarcha] = useState<string | null>(null)
  const [copyErrores, setCopyErrores] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLandingKitMode, setIsLandingKitMode] = useState(false)
  const [includeText, setIncludeText] = useState(false)
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>([
    ...DEFAULT_STYLES,
    ...initialDbStyles.map((s) => ({ ...s, canDelete: true })),
  ])
  const [selectedStyleId, setSelectedStyleId] = useState(DEFAULT_STYLES[0].id)
  const [isSavingStyle, setIsSavingStyle] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(MARKETING_TEMPLATES[0].id)
  const [selectedModel, setSelectedModel] = useState(GENERATION_MODELS[0].id)
  const [imageCount, setImageCount] = useState<number>(1)
  const [imageQuality, setImageQuality] = useState(IMAGE_QUALITY_OPTIONS[1].id)
  const [customPrompt, setCustomPrompt] = useState('')
  const [visualDNA, setVisualDNA] = useState('')
  const [selectedFormats, setSelectedFormats] = useState<AdFormat[]>(['1:1', '9:16', '16:9'])
  const [activeFormat, setActiveFormat] = useState<AdFormat>('1:1')
  const [activeTemplate, setActiveTemplate] = useState<string>(MARKETING_TEMPLATES[0].id)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [activeVariant, setActiveVariant] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isAddingStyle, setIsAddingStyle] = useState(false)
  const [newStyleName, setNewStyleName] = useState('')
  const [newStyleDesc, setNewStyleDesc] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Quita un producto del mapa y corre los de detrás, conservando sus vistas. */
  const reindexarSinEl = <T,>(mapa: Record<number, T>, index: number): Record<number, T> => {
    const next: Record<number, T> = {}
    Object.entries(mapa).forEach(([key, value]) => {
      const imageIndex = Number(key)
      if (imageIndex < index) { next[imageIndex] = value; return }
      if (imageIndex > index) { next[imageIndex - 1] = value }
    })
    return next
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const selectedStyle = useMemo(
    () => customStyles.find((s) => s.id === selectedStyleId) ?? customStyles[0],
    [customStyles, selectedStyleId]
  )

  const selectedTemplateMeta = useMemo(
    () => MARKETING_TEMPLATES.find((t) => t.id === selectedTemplate) ?? MARKETING_TEMPLATES[0],
    [selectedTemplate]
  )

  const selectedModelMeta = useMemo(
    () => GENERATION_MODELS.find((m) => m.id === selectedModel) ?? GENERATION_MODELS[0],
    [selectedModel]
  )

  const outputsPerImage = isLandingKitMode ? MARKETING_TEMPLATES.length : selectedFormats.length
  const totalOutputs = sourceImages.length * outputsPerImage * imageCount
  const currentStepIndex = STUDIO_STEPS.findIndex((s) => s.id === activeStep)
  const currentStepMeta = STUDIO_STEPS[currentStepIndex] ?? STUDIO_STEPS[0]
  const isLastStep = currentStepIndex === STUDIO_STEPS.length - 1
  const currentSourceImage = sourceImages[activeImageIndex]

  const stepCompletion: Record<StudioStepId, boolean> = {
    images: sourceImages.length > 0,
    campaign:
      Boolean(isLandingKitMode || selectedTemplate) &&
      Boolean(customPrompt.trim() || visualDNA.trim() || includeText || isLandingKitMode),
    style: Boolean(selectedStyleId),
    engine: Boolean(selectedModel),
  }

  const canMoveForward = activeStep !== 'images' || sourceImages.length > 0
  const canGenerate = sourceImages.length > 0 && !isGenerating

  const previewFormat: AdFormat = isLandingKitMode ? '1:1' : activeFormat
  const previewTemplate = isLandingKitMode ? activeTemplate : selectedTemplate
  const currentKey = laLlaveDeLaVista(previewTemplate, previewFormat)
  const currentVariants = generatedImages[activeImageIndex]?.[currentKey] ?? []
  const safeVariant = Math.min(activeVariant, Math.max(0, currentVariants.length - 1))
  const currentPreview = currentVariants[safeVariant]

  // El copy que se ve es el de la vista que se ve: misma llave que la imagen.
  const llaveDeEsteAviso = llaveDelAviso(activeImageIndex, currentKey)
  const currentCopy = copies[activeImageIndex]?.[currentKey] ?? ''
  const isGeneratingCopy = copyEnMarcha === llaveDeEsteAviso
  const copyError = copyErrores[llaveDeEsteAviso] ?? null

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    try {
      const base64Images = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
        )
      )
      setSourceImages((prev) => [...prev, ...base64Images])
      setError(null)
    } catch {
      setError('No se pudieron leer una o mas imagenes.')
    }
  }

  const removeImage = (index: number) => {
    setSourceImages((prev) => {
      const next = prev.filter((_, i) => i !== index)
      setActiveImageIndex((current) => {
        if (next.length === 0) return 0
        if (current > index) return current - 1
        if (current >= next.length) return next.length - 1
        return current
      })
      return next
    })

    setGeneratedImages((prev) => reindexarSinEl(prev, index))
    // Los copies se corren IGUAL que las imágenes: si no, al quitar el producto
    // 1 el texto del 2 se quedaría debajo de la imagen del 3.
    setCopies((prev) => reindexarSinEl(prev, index))
    // Los avisos llevan el índice del producto dentro de su llave, así que
    // después de correrlos apuntarían al de al lado: se vacían. Un aviso que
    // se va no pierde nada — vuelve a salir al reintentar.
    setCopyErrores({})
  }

  const addCustomStyle = async () => {
    if (!newStyleName.trim() || !newStyleDesc.trim()) return
    setIsSavingStyle(true)
    try {
      const result = await saveUserVisualStyle(newStyleName.trim(), newStyleDesc.trim())
      if (result.success && result.style) {
        const newStyle: CustomStyle = { ...result.style, canDelete: true }
        setCustomStyles((prev) => [...prev, newStyle])
        setSelectedStyleId(newStyle.id)
        setNewStyleName('')
        setNewStyleDesc('')
        setIsAddingStyle(false)
      }
    } finally {
      setIsSavingStyle(false)
    }
  }

  const deleteCustomStyle = async (id: string) => {
    await deleteUserVisualStyle(id)
    setCustomStyles((prev) => prev.filter((s) => s.id !== id))
    if (selectedStyleId === id) setSelectedStyleId(DEFAULT_STYLES[0].id)
  }

  /**
   * Pide el texto del post de una vista ya generada.
   *
   * Es UNA función y la llaman los dos caminos —la tanda y el botón de volver a
   * generar—: con dos, el copy de la tanda y el de regenerar podrían pedirse
   * con datos distintos y el texto cambiaría de tono sin que nadie lo pidiera.
   *
   * No lanza nunca: esto corre detrás de la imagen, y un fallo del texto no
   * puede tumbar la tanda que ya la generó.
   */
  const pedirElCopy = async (imageIndex: number, templateId: string, formatId: AdFormat, imagen: string) => {
    const vista = laLlaveDeLaVista(templateId, formatId)
    const aviso = llaveDelAviso(imageIndex, vista)
    const plantilla = MARKETING_TEMPLATES.find((t) => t.id === templateId)
    const styleDesc = customStyles.find((s) => s.id === selectedStyleId)?.description ?? ''

    setCopyEnMarcha(aviso)
    setCopyErrores((prev) => {
      const next = { ...prev }
      delete next[aviso]
      return next
    })

    try {
      const resultado = await generarCopyDelAnuncio(
        imagen,
        formatId,
        plantilla ? `${plantilla.name} — ${plantilla.description}` : undefined,
        styleDesc,
        customPrompt,
        visualDNA
      )

      if (resultado.ok && resultado.copy) {
        setCopies((prev) => ({
          ...prev,
          [imageIndex]: { ...(prev[imageIndex] ?? {}), [vista]: resultado.copy as string },
        }))
        return true
      }

      // Un copy que no sale sin decir por qué se lee como que la función no
      // existe: el motivo se queda debajo del panel, no en un aviso que se va.
      setCopyErrores((prev) => ({ ...prev, [aviso]: resultado.motivo ?? 'No se pudo generar el texto.' }))
      return false
    } catch (err) {
      console.error('[ai-image] fallo al pedir el copy', err)
      setCopyErrores((prev) => ({ ...prev, [aviso]: porQueFalloGemini(err).mensaje }))
      return false
    } finally {
      setCopyEnMarcha(null)
    }
  }

  /** El botón de volver a generar: la vista que se tiene delante. */
  const regenerarElCopy = async () => {
    if (!currentPreview || isGeneratingCopy) return
    await pedirElCopy(activeImageIndex, previewTemplate, previewFormat, currentPreview)
  }

  /** La edición a mano se guarda en su vista: cambiar de red y volver la conserva. */
  const editarElCopy = (texto: string) => {
    setCopies((prev) => ({
      ...prev,
      [activeImageIndex]: { ...(prev[activeImageIndex] ?? {}), [currentKey]: texto },
    }))
  }

  const handleGenerateAll = async () => {
    if (sourceImages.length === 0) return
    setIsGenerating(true)
    setError(null)
    setActiveVariant(0)

    const styleDesc = customStyles.find((s) => s.id === selectedStyleId)?.description ?? ''
    const batchSeed = Math.floor(Math.random() * 1000000)

    try {
      const newGenerated: GeneratedImages = { ...generatedImages }

      for (let i = 0; i < sourceImages.length; i++) {
        if (!newGenerated[i]) newGenerated[i] = {}

        const templatesToGen = isLandingKitMode ? MARKETING_TEMPLATES.map((t) => t.id) : [selectedTemplate]
        const formatsToGen = isLandingKitMode ? ['1:1'] : selectedFormats

        for (const templateId of templatesToGen) {
          for (const formatId of formatsToGen as AdFormat[]) {
            const key = laLlaveDeLaVista(templateId, formatId)
            newGenerated[i][key] = []

            for (let v = 0; v < imageCount; v++) {
              await new Promise((resolve) => setTimeout(resolve, 1500))

              const variantSeed = batchSeed + v * 137

              try {
                const result = await generateAdImage(
                  sourceImages[i],
                  styleDesc,
                  customPrompt,
                  templateId,
                  formatId,
                  variantSeed,
                  visualDNA,
                  includeText,
                  selectedModel,
                  imageQuality
                )
                newGenerated[i][key] = [...newGenerated[i][key], result]
                setGeneratedImages({ ...newGenerated })
              } catch (err: unknown) {
                console.error(`Error generating image ${i} key ${key} variant ${v}:`, err)
                // Por qué falló Gemini lo lee UNA función, la misma que usa el
                // copy: con la lista de rechazos copiada en dos sitios, uno de
                // los dos acabaría diciendo «error desconocido» sobre una clave
                // caducada.
                const { causa, mensaje, detiene } = porQueFalloGemini(err)

                if (detiene) {
                  setError(causa === 'cuota' ? `${mensaje} Se generaron algunas imágenes.` : mensaje)
                  setIsGenerating(false)
                  return
                }
                // Lo que no se reconoce ya NO es mudo: antes este `catch` se
                // acababa aquí sin escribir nada, así que la variante no salía
                // y en pantalla no había ni un aviso que mirar.
                setError(mensaje)
              }
            }

            // El copy va DETRÁS de la imagen y solo si alguna salió: sin imagen
            // no hay de qué hablar, y pedirlo igual gastaría una llamada para
            // devolver un texto que no acompaña a nada.
            const primera = newGenerated[i][key][0]
            if (primera) await pedirElCopy(i, templateId, formatId, primera)
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError('Error al generar las imagenes.')
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadImage = (imageIndex: number, templateId: string, formatId: AdFormat, variantIndex?: number) => {
    const key = laLlaveDeLaVista(templateId, formatId)
    const variants = generatedImages[imageIndex]?.[key]
    const img = variants?.[variantIndex ?? safeVariant]
    if (!img) return
    const link = document.createElement('a')
    link.href = img
    link.download = `ad-${imageIndex}-${templateId}-${formatId.replace(':', 'x')}-v${(variantIndex ?? safeVariant) + 1}.png`
    link.click()
  }

  const toggleFormat = (format: AdFormat) => {
    setSelectedFormats((prev) => {
      if (prev.includes(format)) {
        if (prev.length === 1) return prev // must keep at least 1
        const next = prev.filter((f) => f !== format)
        if (activeFormat === format) setActiveFormat(next[0])
        return next
      }
      return [...prev, format]
    })
  }

  const goToPreviousStep = () => {
    if (currentStepIndex <= 0) return
    setActiveStep(STUDIO_STEPS[currentStepIndex - 1].id)
  }

  const goToNextStep = () => {
    if (!canMoveForward || isLastStep) return
    setActiveStep(STUDIO_STEPS[currentStepIndex + 1].id)
  }

  return {
    // State
    activeStep, setActiveStep,
    sourceImages,
    generatedImages,
    isGenerating,
    isLandingKitMode, setIsLandingKitMode,
    includeText, setIncludeText,
    customStyles,
    selectedStyleId, setSelectedStyleId,
    selectedTemplate, setSelectedTemplate,
    selectedModel, setSelectedModel,
    imageCount, setImageCount,
    imageQuality, setImageQuality,
    selectedFormats, toggleFormat,
    customPrompt, setCustomPrompt,
    visualDNA, setVisualDNA,
    activeFormat, setActiveFormat,
    activeTemplate, setActiveTemplate,
    activeImageIndex, setActiveImageIndex,
    activeVariant, setActiveVariant,
    error,
    isAddingStyle, setIsAddingStyle,
    isSavingStyle,
    newStyleName, setNewStyleName,
    newStyleDesc, setNewStyleDesc,
    fileInputRef,
    // Derived
    selectedStyle,
    selectedTemplateMeta,
    selectedModelMeta,
    outputsPerImage,
    totalOutputs,
    currentStepIndex,
    currentStepMeta,
    isLastStep,
    currentSourceImage,
    stepCompletion,
    canMoveForward,
    canGenerate,
    previewFormat,
    previewTemplate,
    currentPreview,
    currentVariants,
    safeVariant,
    // El copy de la vista que se ve
    currentCopy,
    isGeneratingCopy,
    copyError,
    // Handlers
    handleImageUpload,
    removeImage,
    addCustomStyle,
    deleteCustomStyle,
    handleGenerateAll,
    regenerarElCopy,
    editarElCopy,
    downloadImage,
    goToPreviousStep,
    goToNextStep,
  }
}
