"use server";

import { GoogleGenAI } from "@google/genai";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  comoSeLeeElCopy,
  instruccionesDelCopy,
  laRedDelFormato,
  porQueFalloGemini,
} from "@/lib/copy-del-anuncio";

async function getGeminiApiKey(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("Falta la API key de Gemini. Configura tu clave de Google en Mi Perfil.");

  const googleProvider = await db.aiProvider.findFirst({
    where: { name: "google" },
    select: { id: true },
  });

  if (googleProvider) {
    const config = await db.userAiConfig.findFirst({
      where: { userId: user.effectiveId, providerId: googleProvider.id, isActive: true },
      select: { apiKey: true },
    });
    if (config?.apiKey) return config.apiKey;
  }

  throw new Error("Falta la API key de Gemini. Configura tu clave de Google en Mi Perfil.");
}

export async function saveUserGoogleApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autenticado" };

  const googleProvider = await db.aiProvider.findFirst({
    where: { name: "google" },
    select: { id: true },
  });
  if (!googleProvider) return { success: false, message: "Proveedor Google no encontrado en el sistema" };

  await db.userAiConfig.upsert({
    where: { userId_providerId: { userId: user.effectiveId, providerId: googleProvider.id } },
    update: { apiKey, isActive: true },
    create: { userId: user.effectiveId, providerId: googleProvider.id, apiKey, isActive: true },
  });

  return { success: true, message: "API key guardada correctamente" };
}

export async function getUserVisualStyles(): Promise<{ id: string; name: string; description: string }[]> {
  const user = await currentUser();
  if (!user) return [];
  return db.userVisualStyle.findMany({
    where: { userId: user.effectiveId },
    select: { id: true, name: true, description: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function saveUserVisualStyle(
  name: string,
  description: string
): Promise<{ success: boolean; style?: { id: string; name: string; description: string }; message?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autenticado" };
  const style = await db.userVisualStyle.create({
    data: { userId: user.effectiveId, name: name.trim(), description: description.trim() },
    select: { id: true, name: true, description: true },
  });
  return { success: true, style };
}

export async function deleteUserVisualStyle(id: string): Promise<{ success: boolean }> {
  const user = await currentUser();
  if (!user) return { success: false };
  await db.userVisualStyle.deleteMany({ where: { id, userId: user.effectiveId } });
  return { success: true };
}

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
  const apiKey = await getGeminiApiKey();

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

/**
 * El modelo que escribe el copy.
 *
 * NO es el que se elige en el paso «Motor»: aquellos son generadores de
 * IMAGEN y no devuelven texto. Este es el modelo de texto de la misma familia
 * y, sobre todo, **usa la misma clave de Gemini** que ya está configurada en
 * esta pantalla — no hay una segunda credencial que configurar.
 */
const MODELO_DEL_COPY = "gemini-2.5-flash";

export interface CopyGenerado {
  ok: boolean;
  copy?: string;
  red?: string;
  motivo?: string;
}

/**
 * El texto del post que acompaña a la imagen ya generada.
 *
 * Devuelve un resultado en vez de lanzar, a propósito: esto corre **detrás** de
 * la imagen, que es lo que de verdad se vino a generar, así que un fallo aquí
 * no puede tumbar la tanda. Pero tampoco es mudo — el motivo baja al panel y se
 * escribe en la consola, porque un copy que no aparece sin decir por qué se lee
 * como que la función no existe.
 */
export async function generarCopyDelAnuncio(
  imagenGenerada: string,
  formato: string,
  plantilla?: string,
  estilo?: string,
  detalles?: string,
  adn?: string
): Promise<CopyGenerado> {
  const red = laRedDelFormato(formato);

  try {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const prompt = instruccionesDelCopy({ formato, plantilla, estilo, detalles, adn });

    // La imagen ya creada va DENTRO de la petición: el copy tiene que hablar de
    // lo que se ve, no de lo que se pidió. Sin ella, dos productos distintos con
    // la misma plantilla darían el mismo texto.
    const datos = typeof imagenGenerada === "string" ? imagenGenerada.split(",")[1] : "";

    const partes: { inlineData?: { data: string; mimeType: string }; text?: string }[] = [];
    if (datos) partes.push({ inlineData: { data: datos, mimeType: "image/png" } });
    partes.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: MODELO_DEL_COPY,
      contents: { parts: partes },
    });

    const crudo = (response.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    const copy = comoSeLeeElCopy(crudo, formato);

    if (!copy) {
      console.warn("[ai-image] el modelo no devolvió copy", { red, modelo: MODELO_DEL_COPY });
      return { ok: false, red, motivo: "El modelo no devolvió ningún texto. Vuelve a intentarlo." };
    }

    return { ok: true, copy, red };
  } catch (error) {
    const { mensaje } = porQueFalloGemini(error);
    console.warn("[ai-image] no se pudo generar el copy", { red, mensaje });
    return { ok: false, red, motivo: mensaje };
  }
}
