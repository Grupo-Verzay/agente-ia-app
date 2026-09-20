"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * El alto y el aire de TODOS los dialogos de la plataforma.
 *
 * Son dos numeros y estan aqui, no en cada pantalla:
 *
 * - **`calc(100dvh - 4rem)`**, o sea **2rem de aire arriba y 2rem abajo**
 *   contra la ventana. En un movil baja a 1rem por lado
 *   (`calc(100dvh - 2rem)`), que es donde el aire empieza a costar pantalla.
 * - Y es **fijo**: se resta en `rem`, no en un porcentaje. Un `90vh` deja
 *   45px de aire en un portatil y 108px en un monitor grande, asi que el
 *   dialogo se ve pegado al borde justo donde la pantalla es mas pequena —
 *   que es lo que se veia.
 *
 * **`dvh` y no `vh`**: en un movil `100vh` cuenta la barra del navegador como
 * si no estuviera, asi que el dialogo mide mas que lo que se ve y el pie —los
 * botones— queda por debajo del borde. `dvh` es el alto de verdad.
 *
 * # Y no hay tope en pixeles
 *
 * Habia un `min(585px, ...)` delante. Eso no es un margen: es un techo que no
 * se mueve, asi que en una pantalla alta el dialogo se quedaba a media altura
 * con sitio de sobra, y en una baja el margen que mandaba era el otro. Un solo
 * numero, y que sea el que deja el aire.
 */
export const ALTO_DEL_DIALOGO =
  "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]"

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideCloseButton?: boolean }
>(({ className, children, hideCloseButton, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg [&>[data-cerrar]+*]:-mt-4 translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        ALTO_DEL_DIALOGO,
        className
      )}
      {...props}
    >
      {/* La X va en una caja de alto CERO y pegajosa, no suelta en absoluto.
          Quien desplaza es el propio dialogo, asi que un `absolute` se va
          hacia arriba con el contenido: al bajar, la X desaparecia — y de
          camino pasaba por encima del titulo.

          Y el hueco que abre se le quita al de ABAJO, no a ella. Un
          `-mb-4` aqui **no hace nada**: en una rejilla el hueco lo pone
          `gap` entre pistas y el margen negativo de una pista de alto cero
          no lo descuenta. Medido: el titulo bajaba 16px y el dialogo crecia
          otros 16, en TODA la plataforma. El `-mt-4` va en el hermano
          siguiente (`[&>[data-cerrar]+*]:-mt-4`, en la clase del dialogo),
          que si tiene alto y si encoge su pista. */}
      {!hideCloseButton && (
        <div data-cerrar className="sticky top-0 z-20 h-0">
          <DialogPrimitive.Close className="absolute -right-2 -top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
      )}
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

/**
 * Las tres zonas: la cabecera se queda arriba, el pie abajo, y solo el cuerpo
 * se desplaza.
 *
 * Quien desplaza es el propio `DialogContent`, no un `<div>` intermedio, y eso
 * es a proposito: **el pie de la mitad de los dialogos no es hijo directo del
 * dialogo**. Esta dentro del `<form>` —donde TIENE que estar, o el boton
 * `type="submit"` deja de enviar nada— o dentro del `<div>` que agrupa el
 * cuerpo. Metiendo el cuerpo en un contenedor con scroll propio habria que
 * sacar esos pies de su sitio, y sacarlos rompe el envio del formulario.
 *
 * `position: sticky` no mueve nada de sitio: la cabecera y el pie se quedan
 * clavados contra los bordes del dialogo **este donde este cada uno en el
 * arbol**. El resultado que se ve es el mismo —titulo y botones siempre
 * delante— y el HTML de las 176 pantallas no se toca.
 *
 * # La sombra tapa el relleno, y por eso NO es un margen negativo
 *
 * Lo que desplaza es la caja de relleno, asi que el contenido sigue
 * viendose en los 24px de `p-6` de arriba antes de desaparecer: pasaria por
 * encima del titulo. Tirar de la cabecera hacia arriba con `-mt-6` lo taparia
 * —y **rompe los 24 dialogos que van con `p-0`**, donde ese margen la saca
 * fuera del dialogo—.
 *
 * Una sombra sin desenfoque del color del fondo pinta esa banda **sin ocupar
 * ni un pixel de maquetacion**: con `p-6` cubre justo el relleno, y con `p-0`
 * se sale de la caja y el `overflow` la recorta. La misma clase vale para los
 * dos sin preguntar cuanto relleno tiene cada uno.
 */
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      "sticky top-0 z-10 bg-background shadow-[0_-1.5rem_0_0_hsl(var(--background))]",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * El pie de la casa: **cancelar pegado al borde izquierdo y la accion pegada al
 * derecho**, en extremos opuestos. Nunca los dos juntos a la derecha.
 *
 * Dos cosas, y la segunda es la que se olvida:
 *
 * - `justify-between` reparte a los HIJOS DIRECTOS. Metiendo los dos botones
 *   dentro de un `<div className="flex gap-2">` el pie ve **un solo hijo**, lo
 *   manda a un extremo y los botones salen amontonados. Es justo lo que le
 *   pasaba al dialogo de crear tarea de Proyectos.
 * - Con **un solo boton** —guardar, sin cancelar— `justify-between` lo deja a
 *   la IZQUIERDA, que es el mismo fallo por el otro lado: una accion colgando
 *   del borde que no le toca. Por eso el `:only-child` se empuja con `ml-auto`.
 *   Asi el caso de un boton sale bien sin que cada dialogo tenga que acordarse
 *   de escribir `justify-end`, que es lo que hacia que se perdiera la regla.
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row flex-wrap items-center justify-between gap-2",
      "[&>*:only-child]:ml-auto",
      // Pegado abajo, como la cabecera arriba: ver la nota de `DialogHeader`.
      "sticky bottom-0 z-10 bg-background shadow-[0_1.5rem_0_0_hsl(var(--background))]",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
