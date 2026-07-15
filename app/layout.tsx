import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { FontScaleApplier } from "@/components/font-scale-applier";
import { AppProviders } from "@/components/providers/AppProviders";
import { Toaster } from "@/components/ui/sonner";
import { ChunkRecovery } from "@/components/chunk-recovery";
import { StoragePersistence } from "@/components/storage-persistence";
import ErrorBoundary from "@/components/error-bundary";

// Poppins auto-alojada (next/font/local) para no depender de Google Fonts en dev/
// build: evita fallos de red (AbortError al descargar la fuente) y arranca offline.
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: "Verzay",
  description: "La plataforma de inteligencia artificial que potencia y automatiza tu negocio.",
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // Manifest por defecto (marca plataforma). Los layouts que conocen al reseller
  // (app autenticada y landings /r/[slug]) lo sobreescriben con ?u=/?r= para
  // servir la marca del reseller. Ver app/manifest.webmanifest/route.ts.
  manifest: "/manifest.webmanifest",
  // iOS necesita esto para tratar el acceso directo como app real (pantalla completa +
  // almacenamiento persistente), no como un bookmark efímero de Safari que pierde la sesión.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Verzay",
  },
  // Equivalente estándar (Android/Chromium) del apple-mobile-web-app-capable, que
  // esos navegadores marcan como deprecado si va solo. Ambas conviven.
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${poppins.className} overflow-hidden`}>
        {/* Tamaño de letra por dispositivo (cookie ui_scale): aplica el escalado
            del font-size base ANTES de pintar, para no parpadear. Lo controla el
            usuario en Perfil → Apariencia (components/font-size-control.tsx). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=document.cookie.match(/(?:^|; )ui_scale=([^;]+)/);var v=m?decodeURIComponent(m[1]):'100';if(v&&v!=='100')document.documentElement.style.fontSize=v+'%';}catch(e){}`,
          }}
        />
        <FontScaleApplier />
        <StoragePersistence />
        <ErrorBoundary>
          <ChunkRecovery />
          <AppProviders>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster position="bottom-right" richColors />
            </ThemeProvider>
          </AppProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}