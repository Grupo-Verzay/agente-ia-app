import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Header from '@/components/shared/header'
import { currentUser } from '@/lib/auth'
import { isAdminLike } from '@/lib/rbac'
import Link from 'next/link'
import { FileText, Handshake, LayoutGrid, Link2, PlugZap, UserCog, Wallet } from 'lucide-react'
import AccessDenied from '@/app/AccessDenied'

const AdminPage = async () => {
  const user = await currentUser()

  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  };

  const allCards = [
    {
      title: "Conexiones API",
      description: "Administra accesos, claves para tus clientes.",
      icon: <PlugZap className="text-blue-600" />,
      href: "/admin/conexion",
      buttonLabel: "Ir a Conexiones",
    },
    {
      title: "Gestión de Clientes",
      description: "Agrega, edita o elimina clientes fácilmente desde un solo lugar.",
      icon: <UserCog className="text-green-600" />,
      href: "/admin/clientes",
      buttonLabel: "Ir a Clientes",
    },
    {
      title: "Control de Revendedores",
      description: "Asigna y gestiona revendedores y sus permisos sobre clientes.",
      icon: <Handshake className="text-purple-600" />,
      href: "/admin/reseller",
      buttonLabel: "Ir a Resellers",
    },
    {
      title: "Documentación",
      description: "Organiza y actualiza la documentación técnica del sistema.",
      icon: <FileText className="text-yellow-600" />,
      href: "/documentation",
      buttonLabel: "Ir a Documentación",
    },
    {
      title: "Gestión de Módulos",
      description: "Activa, desactiva o configura módulos disponibles.",
      icon: <LayoutGrid className="text-red-600" />,
      href: "/admin/module",
      buttonLabel: "Ir a Módulos",
    },
    {
      title: "Gestión de contraseñas",
      description: "Setea contraseñas y cambia contraseñas por cliente.",
      icon: <LayoutGrid className="text-teal-600" />,
      href: "/admin/password",
      buttonLabel: "Ir a Contraseñas",
    },
    // {
    //   title: "Plantillas IA",
    //   description: "Crea y gestiona plantillas para prompts personalizados.",
    //   icon: <FileCog className="text-teal-600" />,
    //   href: "/admin/templates",
    //   buttonLabel: "Ir a Plantillas",
    // },
    {
      title: "Finanzas",
      description: "Gestiona facturación, pagos y control financiero de clientes.",
      icon: <Wallet className="text-indigo-600" />,
      href: "/admin/client-billing",
      buttonLabel: "Ir a Finanzas",
    },
    {
      title: "Links de Registro",
      description: "Genera y copia los links de registro asociados a cada servidor de Evolution.",
      icon: <Link2 className="text-cyan-600" />,
      href: "/admin/register-links",
      buttonLabel: "Ver Links",
    },
  ];

  // 🔐 Filtrar según rol del usuario
  const visibleCards =
    user.role === "reseller"
      ? allCards.filter(card => card.title === "Administrador Clientes")
      : allCards

  return (
    <>
      <Header
        title="Panel Super Administrativo"
      />

      <div className="flex flex-wrap pt-4 gap-2 items-center justify-center">
        {visibleCards.map((card, index) => (
          <Card
            key={index}
            className="
              flex flex-col 
              justify-between 
              border-border 
              rounded-2xl 
              transition-all 
              duration-300 
              hover:shadow-lg 
              hover:scale-[1.015] 
              hover:border-primary 
              bg-background
              max-w-80
              min-w-80"
          >
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="p-2 bg-muted rounded-xl w-fit">{card.icon}</div>
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base font-semibold">{card.title}</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                    {card.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="flex-grow" />

            <CardFooter className="p-5 pt-3">
              <Button
                asChild
                className="w-full transition-all duration-300 hover:scale-[1.01]"
              >
                <Link href={card.href}>{card.buttonLabel}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </>
  )
}

export default AdminPage
