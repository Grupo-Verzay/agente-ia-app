import { Upload, LayoutTemplate, Palette, Cpu } from 'lucide-react'
import type { AdFormatOption, CustomStyle, GenerationModel, ImageQualityOption, MarketingTemplate, StudioStep } from './ad-generator.types'

export const DEFAULT_STYLES: CustomStyle[] = [
  { id: 'minimalist', name: 'Minimalista', description: 'Fondos limpios y enfoque total en el producto.' },
  { id: 'premium', name: 'Premium', description: 'Iluminación de lujo y texturas de alta gama.' },
  { id: 'lifestyle', name: 'Estilo de Vida', description: 'Entornos naturales y realistas.' },
  { id: 'creative', name: 'Creativo', description: 'Composiciones artísticas y llamativas.' },
]

export const AD_FORMATS: AdFormatOption[] = [
  { id: '1:1', name: 'Post Instagram', sub: '1080 x 1080' },
  { id: '9:16', name: 'Story / WhatsApp', sub: '1080 x 1920' },
  { id: '16:9', name: 'Post Facebook', sub: '1200 x 675' },
]

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  { id: 'hero', name: '1. Hero Section', description: 'Impacto, problema y solución.' },
  { id: 'pain', name: '2. Identificación Dolor', description: 'Bullets emocionales.' },
  { id: 'solution', name: '3. Presentación Solución', description: 'Intro producto y beneficios.' },
  { id: 'benefits', name: '4. Beneficios Profundos', description: 'Transformación real.' },
  { id: 'social', name: '5. Prueba Social', description: 'Testimonios y calificaciones.' },
  { id: 'demo', name: '6. Demostración', description: 'Cómo se usa en pasos.' },
  { id: 'objections', name: '7. Manejo Objeciones', description: 'Confianza y garantías.' },
  { id: 'offer', name: '8. Oferta Irresistible', description: 'Descuentos y combos.' },
  { id: 'cta', name: '9. Llamado a la Acción', description: 'Urgencia y CTA fuerte.' },
  { id: 'trust', name: '10. Sección Confianza', description: 'Sellos y políticas.' },
]

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini Flash (Equilibrado)',
    desc: 'Rápido y versátil. Ideal para la mayoría de anuncios.',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Pro (Alta Calidad)',
    desc: 'Máximo detalle y mejor manejo del texto dentro de la imagen.',
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4 (Fotorrealismo)',
    desc: 'Especializado en texturas y realismo de estudio.',
  },
]

export const IMAGE_QUALITY_OPTIONS: ImageQualityOption[] = [
  {
    id: 'standard',
    name: 'Estándar',
    desc: 'HD optimizado. Rápido y eficiente para redes sociales.',
    promptHint: 'High Definition, clean and professional quality, web-optimized.',
  },
  {
    id: 'high',
    name: 'Alta calidad',
    desc: '4K detallado. Ideal para impresión y presentaciones.',
    promptHint: 'Ultra detailed 4K, professional studio quality, sharp textures.',
  },
  {
    id: 'ultra',
    name: 'Ultra HD',
    desc: '8K cinematográfico. Máxima fidelidad y detalle.',
    promptHint: 'Cinematic 8K ultra-photorealistic, maximum fidelity, hyper-detailed textures, professional studio lighting.',
  },
]

export const STUDIO_STEPS: StudioStep[] = [
  { id: 'images', label: 'Producto', helper: 'Sube las referencias base.', icon: Upload },
  { id: 'campaign', label: 'Campaña', helper: 'Define estructura y mensaje.', icon: LayoutTemplate },
  { id: 'style', label: 'Estilo', helper: 'Elige la dirección visual.', icon: Palette },
  { id: 'engine', label: 'Motor', helper: 'Selecciona el modelo de IA.', icon: Cpu },
]
