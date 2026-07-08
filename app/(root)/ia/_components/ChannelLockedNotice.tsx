import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Aviso mostrado en Entrenamiento cuando el usuario entra a un canal que no
 * tiene habilitado. Evita crear un AgentPrompt "fantasma" y le indica dónde
 * activarlo, en lugar de mostrar un editor vacío/confuso.
 */
export function ChannelLockedNotice({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-8 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Canal no habilitado</h2>
        <p className="text-sm text-muted-foreground">
          El canal <span className="font-medium text-foreground">{label}</span> no está activo en tu
          cuenta, por eso su entrenamiento no está disponible todavía. Actívalo desde la pestaña
          Conexión de tu perfil o contacta a tu asesor.
        </p>
        <Link
          href="/profile"
          className="mt-1 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ir a Conexión
        </Link>
      </div>
    </div>
  );
}
