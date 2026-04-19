'use client'

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

export const AdGeneratorStudio = () => {
  const studio = useAdGenerator()

  return (
    <div className="grid min-h-full content-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:items-start">
      <Card className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border-border shadow-sm">
        <CardHeader className="space-y-3 border-b bg-gradient-to-b from-muted/40 to-background p-4 lg:p-5">
          <CardTitle className="text-2xl leading-tight lg:text-3xl">Generador de imagenes</CardTitle>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <Tabs value={studio.activeStep} className="flex h-full min-h-0 flex-col">
            <StepNav
              activeStep={studio.activeStep}
              stepCompletion={studio.stepCompletion}
              onStepClick={studio.setActiveStep}
            />

            <div className="min-h-0 flex-1 px-4 py-3">
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
