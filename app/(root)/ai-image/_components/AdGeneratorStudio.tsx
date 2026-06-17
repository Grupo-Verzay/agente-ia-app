'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useAdGenerator } from './hooks/useAdGenerator'
import { AdPreviewPanel } from './AdPreviewPanel'
import { StepNav } from './StepNav'
import { StepFooter } from './StepFooter'
import { StepImages } from './steps/StepImages'
import { StepCampaign } from './steps/StepCampaign'
import { StepStyle } from './steps/StepStyle'
import { StepEngine } from './steps/StepEngine'
import { GoogleKeyDialog } from './GoogleKeyDialog'

interface AdGeneratorStudioProps {
  hasGoogleKey: boolean
  dbStyles: { id: string; name: string; description: string }[]
}

export const AdGeneratorStudio = ({ hasGoogleKey, dbStyles }: AdGeneratorStudioProps) => {
  const studio = useAdGenerator(dbStyles)
  const [keyConfigured, setKeyConfigured] = useState(hasGoogleKey)
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="grid gap-3 p-2 sm:p-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <Card className="flex flex-col overflow-hidden rounded-[28px] border-border shadow-sm lg:min-h-0">
        <CardHeader className="space-y-2.5 border-b bg-gradient-to-b from-muted/40 to-background px-4 py-3">
          <CardTitle className="text-lg font-semibold">Generador de imágenes</CardTitle>
          {!keyConfigured && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                Necesitas una API key de Google (Gemini) para generar imágenes.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={() => setDialogOpen(true)}
              >
                Configurar
              </Button>
            </div>
          )}
          <GoogleKeyDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSaved={() => setKeyConfigured(true)}
          />
        </CardHeader>

        <CardContent className="flex flex-1 flex-col p-0 lg:min-h-0">
          <Tabs value={studio.activeStep} className="flex flex-col lg:h-full lg:min-h-0">
            <StepNav
              activeStep={studio.activeStep}
              stepCompletion={studio.stepCompletion}
              onStepClick={studio.setActiveStep}
            />

            <div className="flex-1 px-4 py-2 lg:min-h-0">
              <TabsContent value="images" className="mt-0 h-full data-[state=inactive]:hidden">
                <StepImages
                  fileInputRef={studio.fileInputRef}
                  sourceImages={studio.sourceImages}
                  activeImageIndex={studio.activeImageIndex}
                  currentSourceImage={studio.currentSourceImage}
                  onUpload={studio.handleImageUpload}
                  onRemove={studio.removeImage}
                  onSelectImage={studio.setActiveImageIndex}
                />
              </TabsContent>

              <TabsContent value="campaign" className="mt-0 h-full data-[state=inactive]:hidden">
                <StepCampaign
                  includeText={studio.includeText}
                  onIncludeTextChange={studio.setIncludeText}
                  isLandingKitMode={studio.isLandingKitMode}
                  onLandingKitModeChange={studio.setIsLandingKitMode}
                  selectedFormats={studio.selectedFormats}
                  onToggleFormat={studio.toggleFormat}
                  selectedTemplate={studio.selectedTemplate}
                  onTemplateChange={studio.setSelectedTemplate}
                  selectedTemplateMeta={studio.selectedTemplateMeta}
                  visualDNA={studio.visualDNA}
                  onVisualDNAChange={studio.setVisualDNA}
                  customPrompt={studio.customPrompt}
                  onCustomPromptChange={studio.setCustomPrompt}
                />
              </TabsContent>

              <TabsContent value="style" className="mt-0 h-full data-[state=inactive]:hidden">
                <StepStyle
                  customStyles={studio.customStyles}
                  selectedStyleId={studio.selectedStyleId}
                  onSelectStyle={studio.setSelectedStyleId}
                  isAddingStyle={studio.isAddingStyle}
                  onToggleAddStyle={() => studio.setIsAddingStyle((prev) => !prev)}
                  newStyleName={studio.newStyleName}
                  onNewStyleNameChange={studio.setNewStyleName}
                  newStyleDesc={studio.newStyleDesc}
                  onNewStyleDescChange={studio.setNewStyleDesc}
                  onAddStyle={studio.addCustomStyle}
                  onCancelAddStyle={() => studio.setIsAddingStyle(false)}
                  onDeleteStyle={studio.deleteCustomStyle}
                  isSavingStyle={studio.isSavingStyle}
                />
              </TabsContent>

              <TabsContent value="engine" className="mt-0 h-full data-[state=inactive]:hidden">
                <StepEngine
                  selectedModel={studio.selectedModel}
                  onSelectModel={studio.setSelectedModel}
                  imageCount={studio.imageCount}
                  onImageCountChange={studio.setImageCount}
                  imageQuality={studio.imageQuality}
                  onImageQualityChange={studio.setImageQuality}
                  sourceImagesCount={studio.sourceImages.length}
                  outputsPerImage={studio.outputsPerImage}
                  totalOutputs={studio.totalOutputs}
                  includeText={studio.includeText}
                  selectedStyle={studio.selectedStyle}
                  customPrompt={studio.customPrompt}
                />
              </TabsContent>
            </div>

            <StepFooter
              currentStepIndex={studio.currentStepIndex}
              currentStepLabel={studio.currentStepMeta.label}
              currentStepHelper={studio.currentStepMeta.helper}
              isLastStep={studio.isLastStep}
              isGenerating={studio.isGenerating}
              canMoveForward={studio.canMoveForward}
              canGenerate={studio.canGenerate}
              isLandingKitMode={studio.isLandingKitMode}
              error={studio.error}
              onPrevious={studio.goToPreviousStep}
              onNext={studio.goToNextStep}
              onGenerate={studio.handleGenerateAll}
            />
          </Tabs>
        </CardContent>
      </Card>

      <AdPreviewPanel
        sourceImagesCount={studio.sourceImages.length}
        activeImageIndex={studio.activeImageIndex}
        onSelectImage={studio.setActiveImageIndex}
        isLandingKitMode={studio.isLandingKitMode}
        activeTemplate={studio.activeTemplate}
        onSelectTemplate={studio.setActiveTemplate}
        selectedFormats={studio.selectedFormats}
        activeFormat={studio.activeFormat}
        onSelectFormat={studio.setActiveFormat}
        previewFormat={studio.previewFormat}
        currentPreview={studio.currentPreview}
        currentVariants={studio.currentVariants}
        activeVariant={studio.safeVariant}
        onSelectVariant={studio.setActiveVariant}
        isGenerating={studio.isGenerating}
        selectedTemplate={studio.selectedTemplate}
        onDownload={studio.downloadImage}
      />
    </div>
  )
}
