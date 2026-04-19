import { Upload, LayoutTemplate, Palette, Cpu } from 'lucide-react'
import type { AdFormatOption, CustomStyle, GenerationModel, ImageQualityOption, MarketingTemplate, StudioStep } from './ad-generator.types'

export const DEFAULT_STYLES: CustomStyle[] = [
  { id: 'minimalist', name: 'Minimalista', description: 'Fondos limpios y enfoque total en el producto.' },
  { id: 'premium', name: 'Premium', description: 'Iluminacion de lujo y texturas de alta gama.' },
  { id: 'lifestyle', name: 'Estilo de Vida', description: 'Entornos naturales y realistas.' },
  { id: 'creative', name: 'Creativo', description: 'Composiciones artisticas y llamativas.' },
]

export const AD_FORMATS: AdFormatOption[] = [
  { id: '1:1', name: 'Post Instagram', sub: '1080 x 1080' },
  { id: '9:16', name: 'Story / WhatsApp', sub: '1080 x 1920' },
  { id: '16:9', name: 'Post Facebook', sub: '1200 x 675' },
]

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  { id: 'hero', name: '1. Hero Section', description: 'Impacto, problema y solucion.' },
  { id: 'pain', name: '2. Identificacion Dolor', description: 'Bullets emocionales.' },
  { id: 'solution', name: '3. Presentacion Solucion', description: 'Intro producto y beneficios.' },
  { id: 'benefits', name: '4. Beneficios Profundos', description: 'Transformacion real.' },
  { id: 'social', name: '5. Prueba Social', description: 'Testimonios y calificaciones.' },
  { id: 'demo', name: '6. Demostracion', description: 'Como se usa en pasos.' },
  { id: 'objections', name: '7. Manejo Objeciones', description: 'Confianza y garantias.' },
  { id: 'offer', name: '8. Oferta Irresistible', description: 'Descuentos y combos.' },
  { id: 'cta', name: '9. Llamado a la Accion', description: 'Urgencia y CTA fuerte.' },
  { id: 'trust', name: '10. Seccion Confianza', description: 'Sellos y politicas.' },
]

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini Flash (Equilibrado)',
    desc: 'Rapido y versatil. Ideal para la mayoria de anuncios.',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Pro (Alta Calidad)',
    desc: 'Maximo detalle y mejor manejo de texto. Requiere API Key propia.',
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
  { id: 'campaign', label: 'imagen', helper: 'Define estructura y mensaje.', icon: LayoutTemplate },
  { id: 'style', label: 'Estilo', helper: 'Elige la direccion visual.', icon: Palette },
  { id: 'engine', label: 'Motor', helper: 'Selecciona el modelo IA.', icon: Cpu },
]
