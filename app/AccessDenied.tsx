'use client'

import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

/**
 * `detalle` lo pone quien deniega, con el dato que explica el corte. Sin él la
 * pantalla solo dice "no puedes", y desde fuera no hay manera de saber cuál de
 * las condiciones falló.
 */
function AccessDenied({ detalle }: { detalle?: string }) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-[85vh] px-4 bg-gradient-to-br from-muted via-background to-muted/70">
      <div className="backdrop-blur-lg border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full text-center bg-background/90 animate-fade-in">
        <div className="flex justify-center mb-6">
          <ShieldAlert className="h-16 w-16 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Acceso Denegado</h1>
        <p className="text-sm text-muted-foreground mb-6">
          No tienes permisos para ver esta página. Si crees que es un error, contacta al administrador.
        </p>
        {detalle && (
          <p className="mb-6 rounded-lg bg-muted px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            {detalle}
          </p>
        )}
        <Button variant="default" className="w-full" onClick={() => router.back()}>
          Volver atrás
        </Button>
      </div>
    </div>
  )
}

export default AccessDenied
