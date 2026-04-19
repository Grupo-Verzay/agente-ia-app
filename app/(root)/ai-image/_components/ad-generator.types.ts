import type { LucideIcon } from 'lucide-react'

export interface CustomStyle {
  id: string
  name: string
  description: string
}

export type AdFormat = '1:1' | '9:16' | '16:9'

export type StudioStepId = 'images' | 'campaign' | 'style' | 'engine'

export interface StudioStep {
  id: StudioStepId
  label: string
  helper: string
  icon: LucideIcon
}

export interface AdFormatOption {
  id: AdFormat
  name: string
  sub: string
}

export interface MarketingTemplate {
  id: string
  name: string
  description: string
}

export interface GenerationModel {
  id: string
  name: string
  desc: string
}

export interface ImageQualityOption {
  id: string
  name: string
  desc: string
  promptHint: string
}
