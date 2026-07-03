import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { AppProviders } from "@/components/providers/AppProviders";
import { Toaster } from "@/components/ui/sonner";
import { ChunkRecovery } from "@/components/chunk-recovery";
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
};

export const metadata: Metadata = {
  title: "Agente IA",
  description: "La plataforma de inteligencia artificial que potencia y automatiza tu negocio.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${poppins.className} overflow-hidden`}>
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