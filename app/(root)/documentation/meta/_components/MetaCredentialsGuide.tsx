'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  KeyRound,
  Webhook,
  ShieldCheck,
  Zap,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Copy,
} from 'lucide-react';
import { FaWhatsapp, FaFacebook, FaInstagram, FaMeta } from 'react-icons/fa6';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WEBHOOK_PATH = '/webhook/meta';

const Copyable = ({ value, label }: { value: string; label?: string }) => {
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      toast.success('Copiado al portapapeles');
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="group inline-flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted"
      title="Copiar"
    >
      <span>{label ?? value}</span>
      <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
    </button>
  );
};

const Step = ({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) => (
  <div className="flex gap-4">
    <div className="flex flex-col items-center">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </div>
      <div className="mt-1 w-px flex-1 bg-border" />
    </div>
    <div className="flex-1 pb-6">
      <p className="font-semibold leading-tight">{title}</p>
      <div className="mt-1.5 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  </div>
);

const CredChip = ({
  name,
  where,
  required,
}: {
  name: string;
  where: string;
  required?: boolean;
}) => (
  <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-medium">
        {name}
        {required ? (
          <Badge className="h-4 bg-red-500/90 px-1.5 text-[10px]">
            Requerido
          </Badge>
        ) : (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            Opcional
          </Badge>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{where}</p>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const MetaCredentialsGuide = () => {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      {/* HERO ------------------------------------------------------ */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border bg-muted/40 px-4 py-1.5 text-sm font-medium text-muted-foreground">
          <FaMeta className="h-4 w-4 text-[#0866FF]" />
          API oficial de Meta
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          Conecta WhatsApp, Facebook e Instagram
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Guía paso a paso para obtener tus credenciales oficiales de Meta y
          conectar tus canales al Agente IA de Verzay.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1">
            <FaWhatsapp className="h-3.5 w-3.5 text-green-500" /> WhatsApp Cloud API
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1">
            <FaFacebook className="h-3.5 w-3.5 text-[#1877F2]" /> Messenger
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1">
            <FaInstagram className="h-3.5 w-3.5 text-[#E4405F]" /> Instagram DM
          </Badge>
        </div>
      </div>

      {/* DOS CAMINOS ---------------------------------------------- */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="relative overflow-hidden border-green-500/40">
          <div className="absolute right-3 top-3">
            <Badge className="bg-green-600">Recomendado</Badge>
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-green-500" />
              Conexión automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              El camino más rápido. Con el botón{' '}
              <span className="font-medium text-foreground">
                “WhatsApp API”
              </span>{' '}
              o{' '}
              <span className="font-medium text-foreground">
                “Coexistencia API”
              </span>{' '}
              en la pantalla de Conexión, Meta abre una ventana donde inicias
              sesión y autorizas tu cuenta.
            </p>
            <p>
              La app obtiene y guarda por ti el{' '}
              <span className="font-medium text-foreground">
                Access Token
              </span>
              , el <span className="font-medium text-foreground">Phone Number ID</span>{' '}
              y el <span className="font-medium text-foreground">WABA ID</span>.
              No necesitas copiar nada manualmente.
            </p>
            <Button asChild size="sm" className="mt-1">
              <Link href="/connection">
                Ir a Conexión <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Credenciales manuales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Si prefieres (o necesitas) usar tu propia app de Meta, obtienes las
              credenciales en{' '}
              <span className="font-medium text-foreground">
                Meta for Developers
              </span>{' '}
              y las pegas en la app.
            </p>
            <p>
              Sigue los pasos de abajo. Al final las ingresas en{' '}
              <span className="font-medium text-foreground">
                Conexión → “Ingresar credenciales manualmente”
              </span>
              .
            </p>
            <Button asChild size="sm" variant="outline" className="mt-1">
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir Meta for Developers{' '}
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* PRERREQUISITOS ------------------------------------------- */}
      <Alert className="mb-8">
        <ClipboardCheck className="h-4 w-4" />
        <AlertTitle>Antes de empezar necesitas</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>
              Una cuenta en{' '}
              <a
                className="font-medium text-primary underline"
                href="https://business.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meta Business Suite
              </a>{' '}
              (Administrador Comercial).
            </li>
            <li>
              Una <span className="font-medium">cuenta de desarrollador</span> en{' '}
              <a
                className="font-medium text-primary underline"
                href="https://developers.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                developers.facebook.com
              </a>
              .
            </li>
            <li>
              Para WhatsApp: un{' '}
              <span className="font-medium">número de teléfono</span> que{' '}
              <span className="font-medium">no esté</span> registrado en la app
              normal de WhatsApp/WhatsApp Business (o listo para migrar a
              Coexistencia).
            </li>
            <li>
              Para Instagram: una cuenta{' '}
              <span className="font-medium">Profesional</span> (Empresa o
              Creador) vinculada a una Página de Facebook.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* PASOS COMUNES -------------------------------------------- */}
      <h2 className="mb-4 text-lg font-bold">
        Paso 1 · Crea tu app en Meta
      </h2>
      <Card className="mb-8">
        <CardContent className="pt-6">
          <Step n={1} title="Entra a Meta for Developers">
            <p>
              Ve a{' '}
              <a
                className="font-medium text-primary underline"
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noopener noreferrer"
              >
                developers.facebook.com/apps
              </a>{' '}
              y haz clic en <span className="font-medium">“Crear app”</span>.
            </p>
          </Step>
          <Step n={2} title="Elige el tipo de app">
            <p>
              Selecciona{' '}
              <span className="font-medium text-foreground">“Empresa”</span>{' '}
              (Business) como caso de uso y vincúlala a tu Administrador
              Comercial.
            </p>
          </Step>
          <Step n={3} title="Agrega los productos que vas a usar">
            <p>
              En el panel de la app, agrega los productos según tus canales:{' '}
              <span className="font-medium text-foreground">WhatsApp</span>,{' '}
              <span className="font-medium text-foreground">
                Messenger
              </span>{' '}
              y/o{' '}
              <span className="font-medium text-foreground">
                Instagram
              </span>
              .
            </p>
          </Step>
          <Step n={4} title="Obtén el App ID y el App Secret">
            <p>
              En{' '}
              <span className="font-medium text-foreground">
                Configuración → Básico
              </span>{' '}
              encuentras el{' '}
              <span className="font-medium text-foreground">App ID</span> y el{' '}
              <span className="font-medium text-foreground">App Secret</span>{' '}
              (haz clic en “Mostrar”). Guárdalos; son las llaves maestras de tu
              app.
            </p>
          </Step>
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                5
              </div>
            </div>
            <div className="flex-1">
              <p className="font-semibold leading-tight">
                Modo producción y verificación del negocio
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Para atender clientes reales, tu app debe pasar a{' '}
                <span className="font-medium text-foreground">Live</span> y tu
                negocio debe estar{' '}
                <span className="font-medium text-foreground">verificado</span>{' '}
                por Meta. En modo desarrollo solo puedes escribir a números de
                prueba.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CREDENCIALES POR CANAL ----------------------------------- */}
      <h2 className="mb-4 text-lg font-bold">
        Paso 2 · Credenciales por canal
      </h2>
      <Tabs defaultValue="whatsapp" className="mb-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <FaWhatsapp className="h-4 w-4 text-green-500" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="facebook" className="gap-1.5">
            <FaFacebook className="h-4 w-4 text-[#1877F2]" />
            <span className="hidden sm:inline">Facebook</span>
          </TabsTrigger>
          <TabsTrigger value="instagram" className="gap-1.5">
            <FaInstagram className="h-4 w-4 text-[#E4405F]" />
            <span className="hidden sm:inline">Instagram</span>
          </TabsTrigger>
        </TabsList>

        {/* WhatsApp -------------------------------------------- */}
        <TabsContent value="whatsapp" className="mt-4">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <CredChip
                  name="Phone Number ID"
                  where="WhatsApp → Configuración de la API"
                  required
                />
                <CredChip
                  name="Access Token"
                  where="WhatsApp → Configuración de la API (o usuario del sistema)"
                  required
                />
                <CredChip
                  name="WABA ID"
                  where="WhatsApp → Configuración de la API"
                />
                <CredChip
                  name="Verify Token"
                  where="Lo defines tú (string aleatorio)"
                />
              </div>

              <div>
                <Step n={1} title="Abre la Configuración de la API">
                  <p>
                    En el producto{' '}
                    <span className="font-medium text-foreground">
                      WhatsApp → Configuración de la API
                    </span>{' '}
                    (API Setup) verás una tarjeta con tu número de prueba y
                    los IDs.
                  </p>
                </Step>
                <Step n={2} title="Copia el Phone Number ID y el WABA ID">
                  <p>
                    Debajo del selector de número aparecen el{' '}
                    <span className="font-medium text-foreground">
                      Identificador del número de teléfono
                    </span>{' '}
                    (Phone Number ID) y el{' '}
                    <span className="font-medium text-foreground">
                      Identificador de la cuenta de WhatsApp Business
                    </span>{' '}
                    (WABA ID).
                  </p>
                </Step>
                <Step n={3} title="Genera un Access Token permanente">
                  <p>
                    El token temporal de esa pantalla dura{' '}
                    <span className="font-medium text-foreground">
                      24 horas
                    </span>
                    . Para producción crea un{' '}
                    <span className="font-medium text-foreground">
                      Usuario del sistema
                    </span>{' '}
                    en Meta Business Suite (Configuración → Usuarios del
                    sistema), asígnale la app y la WABA con permiso{' '}
                    <span className="font-mono text-xs">
                      whatsapp_business_messaging
                    </span>{' '}
                    y genera un token sin expiración.
                  </p>
                </Step>
                <Step n={4} title="Registra tu número real">
                  <p>
                    Agrega y verifica tu número de teléfono en{' '}
                    <span className="font-medium text-foreground">
                      WhatsApp → Números de teléfono
                    </span>{' '}
                    (recibes un código por SMS/llamada). Ese es el número con el
                    que atenderás a tus clientes.
                  </p>
                </Step>
              </div>

              <Alert>
                <Zap className="h-4 w-4" />
                <AlertTitle>Coexistencia</AlertTitle>
                <AlertDescription className="text-sm">
                  Si quieres seguir usando la app de WhatsApp Business en tu
                  teléfono <span className="font-medium">y</span> el Agente IA a
                  la vez, usa el botón{' '}
                  <span className="font-medium">“Coexistencia API”</span> en la
                  pantalla de Conexión (conexión automática).
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Facebook ------------------------------------------- */}
        <TabsContent value="facebook" className="mt-4">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <CredChip
                  name="Page ID"
                  where="Tu Página de Facebook → Información"
                  required
                />
                <CredChip
                  name="Page Access Token"
                  where="Messenger → Configuración de la API"
                  required
                />
                <CredChip
                  name="Verify Token"
                  where="Lo defines tú (string aleatorio)"
                />
              </div>

              <div>
                <Step n={1} title="Agrega el producto Messenger">
                  <p>
                    En tu app, agrega{' '}
                    <span className="font-medium text-foreground">
                      Messenger
                    </span>{' '}
                    y ve a su{' '}
                    <span className="font-medium text-foreground">
                      Configuración de la API
                    </span>
                    .
                  </p>
                </Step>
                <Step n={2} title="Vincula tu Página de Facebook">
                  <p>
                    En{' '}
                    <span className="font-medium text-foreground">
                      Generar tokens de acceso
                    </span>{' '}
                    conecta la Página desde la que quieres responder los
                    mensajes de Messenger.
                  </p>
                </Step>
                <Step n={3} title="Copia el Page ID y el Page Access Token">
                  <p>
                    El{' '}
                    <span className="font-medium text-foreground">
                      Page ID
                    </span>{' '}
                    está en la información de tu Página; el{' '}
                    <span className="font-medium text-foreground">
                      Page Access Token
                    </span>{' '}
                    se genera en esa misma pantalla de Messenger.
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Instagram ------------------------------------------ */}
        <TabsContent value="instagram" className="mt-4">
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <CredChip
                  name="Instagram Account ID"
                  where="Vinculado a tu Página de Facebook"
                  required
                />
                <CredChip
                  name="Access Token"
                  where="Con permisos de Instagram Messaging"
                  required
                />
                <CredChip
                  name="Verify Token"
                  where="Lo defines tú (string aleatorio)"
                />
              </div>

              <div>
                <Step n={1} title="Convierte tu Instagram a Profesional">
                  <p>
                    En la app de Instagram: Configuración → Cuenta → cambia a{' '}
                    <span className="font-medium text-foreground">
                      cuenta Profesional
                    </span>{' '}
                    (Empresa o Creador).
                  </p>
                </Step>
                <Step n={2} title="Vincula Instagram con una Página de Facebook">
                  <p>
                    Desde Meta Business Suite, conecta tu cuenta de Instagram a
                    la Página de Facebook. Los DMs de Instagram usan la misma
                    infraestructura de Messenger.
                  </p>
                </Step>
                <Step n={3} title="Agrega el producto Instagram y genera el token">
                  <p>
                    Agrega{' '}
                    <span className="font-medium text-foreground">
                      Instagram
                    </span>{' '}
                    en tu app y genera un token con permisos{' '}
                    <span className="font-mono text-xs">
                      instagram_basic
                    </span>{' '}
                    e{' '}
                    <span className="font-mono text-xs">
                      instagram_manage_messages
                    </span>
                    . Copia el{' '}
                    <span className="font-medium text-foreground">
                      Instagram Account ID
                    </span>
                    .
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* WEBHOOK --------------------------------------------------- */}
      <h2 className="mb-4 text-lg font-bold">Paso 3 · Configura el Webhook</h2>
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="h-5 w-5 text-violet-500" />
            Conecta Meta con Verzay
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El webhook es lo que permite que Meta te{' '}
            <span className="font-medium text-foreground">envíe</span> los
            mensajes entrantes. Sin él, el Agente IA no recibe nada.
          </p>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  URL de devolución de llamada (Callback URL)
                </p>
                <p className="mt-1 text-sm">
                  La URL de tu backend terminada en{' '}
                  <Copyable value={WEBHOOK_PATH} />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ej: <span className="font-mono">https://api.tu-dominio.com{WEBHOOK_PATH}</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <Step n={1} title="Define un Verify Token">
              <p>
                Inventa un{' '}
                <span className="font-medium text-foreground">
                  string aleatorio
                </span>{' '}
                (por ejemplo{' '}
                <span className="font-mono text-xs">
                  verzay_9f3k2p
                </span>
                ). Debe coincidir con el configurado en el servidor.
              </p>
            </Step>
            <Step n={2} title="Registra el webhook en Meta">
              <p>
                En el producto (WhatsApp / Messenger / Instagram) →{' '}
                <span className="font-medium text-foreground">
                  Configuración → Webhooks
                </span>
                , pega la Callback URL y el Verify Token. Meta hará una
                verificación automática (GET) y debe responder “Verificado”.
              </p>
            </Step>
            <Step n={3} title="Suscríbete a los campos de mensajes">
              <p>
                Suscribe al menos el campo{' '}
                <span className="font-mono text-xs">messages</span> para
                recibir los mensajes entrantes de tus clientes.
              </p>
            </Step>
          </div>

          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Con conexión automática esto es automático</AlertTitle>
            <AlertDescription className="text-sm">
              Si conectas con los botones{' '}
              <span className="font-medium">“WhatsApp API”</span> o{' '}
              <span className="font-medium">“Coexistencia API”</span>, la
              suscripción del webhook se hace sola. Este paso solo aplica si
              usas tu propia app de Meta con credenciales manuales.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* PASO FINAL: PEGAR EN LA APP ------------------------------ */}
      <h2 className="mb-4 text-lg font-bold">
        Paso 4 · Pega tus credenciales en Verzay
      </h2>
      <Card className="mb-8 border-primary/30">
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Ve a{' '}
            <span className="font-medium text-foreground">Conexión</span> y en la
            tarjeta de{' '}
            <span className="font-medium text-foreground">
              WhatsApp Cloud API
            </span>{' '}
            haz clic en{' '}
            <span className="font-medium text-foreground">
              “Ingresar credenciales manualmente”
            </span>
            . Completa:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Phone Number ID
              (requerido)
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Access Token
              (requerido)
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> WABA ID
              (opcional)
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Verify Token
              (opcional)
            </div>
          </div>
          <Button asChild>
            <Link href="/connection">
              Ir a Conexión <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* FAQ / TROUBLESHOOTING ------------------------------------ */}
      <h2 className="mb-4 text-lg font-bold">Preguntas frecuentes</h2>
      <Accordion type="single" collapsible className="mb-8">
        <AccordionItem value="q1">
          <AccordionTrigger className="text-left">
            El webhook no se verifica (“The callback URL couldn’t be
            validated”)
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            Revisa que la URL termine en{' '}
            <span className="font-mono">{WEBHOOK_PATH}</span>, que el backend
            esté en línea con HTTPS válido, y que el{' '}
            <span className="font-medium">Verify Token</span> sea idéntico al
            configurado en el servidor. Meta hace una petición GET que debe
            devolver el <span className="font-mono">hub.challenge</span>.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q2">
          <AccordionTrigger className="text-left">
            Mi Access Token dejó de funcionar a las 24 horas
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            El token que aparece en “Configuración de la API” es temporal.
            Genera un token permanente con un{' '}
            <span className="font-medium">Usuario del sistema</span> en Meta
            Business Suite y vuelve a guardarlo en la app.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q3">
          <AccordionTrigger className="text-left">
            No puedo enviar el primer mensaje / “fuera de la ventana de 24 h”
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            WhatsApp solo permite mensajes libres dentro de las 24 h posteriores
            al último mensaje del cliente. Para iniciar una conversación fuera de
            esa ventana debes usar una{' '}
            <span className="font-medium">plantilla</span> aprobada por Meta.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q4">
          <AccordionTrigger className="text-left">
            Mi número no aparece / ya está en uso en WhatsApp
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            Un número solo puede estar en la app normal de WhatsApp{' '}
            <span className="font-medium">o</span> en la Cloud API. Elimínalo de
            la app de WhatsApp Business antes de registrarlo, o usa el modo{' '}
            <span className="font-medium">Coexistencia</span> para mantener
            ambos.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q5">
          <AccordionTrigger className="text-left">
            ¿Necesito verificar mi negocio?
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            Sí para producción. Sin verificación de negocio y app en modo Live,
            solo podrás escribir a un número limitado de destinatarios de prueba.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* CTA FINAL ------------------------------------------------- */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-muted/30 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="max-w-md text-sm text-muted-foreground">
          ¿Te trabaste en algún paso? Lo más sencillo es usar la{' '}
          <span className="font-medium text-foreground">conexión automática</span>
          , que hace casi todo esto por ti.
        </p>
        <Button asChild>
          <Link href="/connection">
            Conectar ahora <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
};
