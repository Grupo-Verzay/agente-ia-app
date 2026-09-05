import { z } from "zod";

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),

  // Auth
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET es requerido"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL debe ser una URL válida"),
  AUTH_RESEND_KEY: z.string().min(1, "AUTH_RESEND_KEY es requerido"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerido"),

  // Backend (Baileys / Evolution) — requerido en producción
  BACKEND_URL: z.string().url("BACKEND_URL debe ser una URL válida").optional(),
  BAILEYS_SECRET: z.string().min(1).optional(),

  // Internal service keys — requeridos en producción
  CRM_FOLLOW_UP_RUNNER_KEY: z.string().min(1, "CRM_FOLLOW_UP_RUNNER_KEY es requerido"),
  CRON_SECRET: z.string().min(1).optional(),
  SECRET_API_KEY: z.string().min(1).optional(),

  // S3 / Minio
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY es requerido"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY es requerido"),
  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT es requerido"),
  S3_PUBLIC_URL: z.string().url("S3_PUBLIC_URL debe ser una URL válida"),
  S3_BUCKET_NAME: z.string().default("verzay-media"),

  // AI — se requiere al menos una clave de Google
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_GENAI_API_KEY: z.string().optional(),
  OPENAI_SYSTEM_API_KEY: z.string().optional(),

  // OAuth (opcionales)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
}).refine(
  (data) => data.GEMINI_API_KEY || data.GOOGLE_API_KEY || data.GOOGLE_GENAI_API_KEY,
  {
    message: "Se requiere al menos una clave de Google AI: GEMINI_API_KEY, GOOGLE_API_KEY o GOOGLE_GENAI_API_KEY",
    path: ["GEMINI_API_KEY"],
  }
);

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const parsed = envSchema.safeParse(process.env);

if (!isBuildPhase && !parsed.success) {
  console.error("❌ Variables de entorno inválidas:");
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  });
  throw new Error("Variables de entorno inválidas. Revisa la configuración del servidor.");
}

export const env = (parsed.success ? parsed.data : {}) as z.infer<typeof envSchema>;
