"use server";


import { GoogleGenAI } from "@google/genai";

const getGeminiApiKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  "";

export async function generateAdImage(
  base64Image: string,
  style: string,
  customPrompt: string,
  template: string,
  aspectRatio: "1:1" | "9:16" | "16:9" = "1:1",
  seed?: number,
  globalContext?: string,
  includeText?: boolean,
  model: string = "gemini-2.5-flash-image",
  quality: string = "high"
) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Falta la API key de Gemini en el servidor. Configura GEMINI_API_KEY (o GOOGLE_API_KEY / GOOGLE_GENAI_API_KEY)."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  let templateInstruction = "";

  switch (template) {
    case "hero":
      templateInstruction =
        "SECCIÓN HERO: Composición de alto impacto. El producto debe ser el héroe central, brillante y atractivo. Crea una atmósfera que combine el problema y la solución. Deja espacio para un título grande, subtítulo, precio y un botón de CTA.";
      break;
    case "pain":
      templateInstruction =
        "IDENTIFICACIÓN DEL DOLOR: Escena emocional que refleja el problema principal que resuelve el producto. El producto aparece como la luz al final del túnel. Composición pensada para bullets de texto emocionales.";
      break;
    case "solution":
      templateInstruction =
        "PRESENTACIÓN DE LA SOLUCIÓN: El producto en un entorno limpio y explicativo. Muestra el producto de forma clara y amigable. Espacio para 3-5 beneficios clave.";
      break;
    case "benefits":
      templateInstruction =
        "BENEFICIOS PROFUNDOS: Escena de transformación. Muestra el resultado positivo y la tranquilidad en la vida del cliente tras usar el producto. Enfoque en beneficios prácticos y emocionales.";
      break;
    case "social":
      templateInstruction =
        "PRUEBA SOCIAL: Escena auténtica de estilo de vida. Personas reales interactuando con el producto con satisfacción. Espacio para testimonios, estrellas de calificación y fotos de 'manos reales'.";
      break;
    case "demo":
      templateInstruction =
        "DEMOSTRACIÓN / CÓMO SE USA: Composición secuencial o clara que sugiera simplicidad. El producto en acción siendo usado fácilmente. Espacio para pasos 1, 2 y 3.";
      break;
    case "objections":
      templateInstruction =
        "MANEJO DE OBJECIONES: Escena que transmite seguridad y confianza. Enfoque en garantías, sellos de calidad y el concepto de 'Pago Contra Entrega'. Espacio para bloques de confianza.";
      break;
    case "offer":
      templateInstruction =
        "OFERTA IRRESISTIBLE: Composición agresiva y atractiva. El producto rodeado de elementos que sugieran descuento, combos o regalos adicionales. Espacio para precios 'Antes vs Hoy'.";
      break;
    case "cta":
      templateInstruction =
        "LLAMADO A LA ACCIÓN FUERTE: Escena de urgencia. El producto listo para ser enviado. Enfoque en 'Unidades Limitadas' y 'Envío Rápido'. Espacio para un botón de acción dominante.";
      break;
    case "trust":
      templateInstruction =
        "SECCIÓN FINAL DE CONFIANZA: Composición institucional y segura. Sellos visuales de soporte, garantía y políticas claras. El producto como respaldo de una marca seria.";
      break;
    default:
      templateInstruction =
        "Composición publicitaria estándar, equilibrada y profesional.";
  }

  const qualityInstruction =
    quality === "ultra"
      ? "Cinematic 8K ultra-photorealistic, maximum fidelity, hyper-detailed textures, professional studio lighting."
      : quality === "standard"
        ? "High Definition, clean and professional quality, web-optimized."
        : "Ultra detailed 4K, professional studio quality, sharp textures, calidad fotográfica 8K, estilo cinematográfico, iluminación de estudio."

  const textRule = includeText
    ? "INCLUYE TEXTOS PROFESIONALES: Agrega títulos, subtítulos, precios en COP y botones de CTA de nivel profesional en español, siguiendo la estructura de marketing solicitada. Usa tipografías modernas y legibles."
    : "NO incluyas ningún tipo de texto, letras, números o logotipos. La imagen debe estar limpia para edición posterior.";

  const prompt = `
    GENERA UNA IMAGEN PUBLICITARIA DE ALTA CALIDAD siguiendo estas especificaciones:
    
    1. CONTEXTO VISUAL (ADN): ${globalContext || "Ambiente de estudio profesional"}.
    2. ESTRUCTURA DE MARKETING: ${templateInstruction}
    3. ESTILO: ${style}.
    4. DETALLES: ${customPrompt}.
    5. FORMATO: ${aspectRatio === "9:16"
      ? "Story Vertical (9:16)"
      : aspectRatio === "16:9"
        ? "Post Horizontal (16:9)"
        : "Post Cuadrado (1:1)"
    }.
    
    REGLAS OBLIGATORIAS:
    - MANTENER LA FIDELIDAD DEL PRODUCTO ORIGINAL.
    - ${textRule}
    - Consistencia total en paleta de colores e iluminación con el ADN visual.
    - ${qualityInstruction}
    - DEBES DEVOLVER UNA IMAGEN COMO RESULTADO.
  `;

  if (model === "imagen-4.0-generate-001") {
    const response = await ai.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio:
          aspectRatio === "9:16"
            ? "9:16"
            : aspectRatio === "16:9"
              ? "16:9"
              : "1:1",
      },
    });

    const base64EncodeString = response.generatedImages?.[0]?.image?.imageBytes;

    if (!base64EncodeString) {
      throw new Error("El modelo no devolvió ninguna imagen válida.");
    }

    return `data:image/png;base64,${base64EncodeString}`;
  }

  const imageData = base64Image.split(",")[1];

  if (!imageData) {
    throw new Error("La imagen base64 no es válida.");
  }

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: imageData,
            mimeType: "image/png",
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      seed,
      imageConfig: {
        aspectRatio,
      },
    },
  });

  const candidate = response.candidates?.[0];

  if (!candidate) {
    throw new Error("El modelo no devolvió ninguna respuesta.");
  }

  for (const part of candidate.content?.parts || []) {
    if (part.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }

    if (part.text) {
      console.warn("El modelo devolvió texto en lugar de una imagen:", part.text);

      const text = part.text.toLowerCase();

      if (text.includes("seguridad") || text.includes("política")) {
        throw new Error(
          "La generación fue bloqueada por filtros de seguridad. Intenta con un prompt menos descriptivo de personas."
        );
      }
    }
  }

  throw new Error(
    "El modelo no generó una imagen. Esto puede deberse a un prompt demasiado complejo o restricciones del modelo."
  );
}
