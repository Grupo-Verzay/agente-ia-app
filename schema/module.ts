import { z } from "zod"
import { Module, ModuleItem, Plan } from "@prisma/client";
import {
    ShieldCheckIcon,
    ChartPieIcon,
    BookOpenIcon,
    ViewfinderCircleIcon,
    SparklesIcon,
    UsersIcon,
    ChatBubbleLeftRightIcon,
    ChatBubbleBottomCenterTextIcon,
    ClipboardDocumentListIcon,
    Cog6ToothIcon,
    BellAlertIcon,
    DocumentTextIcon,
    ChatBubbleLeftEllipsisIcon,
    FunnelIcon,

    //NUEVOS PARA TU MENÚ
    HomeIcon,                       // Inicio
    InboxIcon,                      // Bandeja de entrada
    CurrencyDollarIcon,            // Finanzas o precios
    CreditCardIcon,                // Pagos
    ShoppingCartIcon,              // Compras / Ecommerce
    CalendarDaysIcon,              // Agendamiento / calendario
    ChartBarIcon,                  // Reportes / Estadísticas
    ServerIcon,                    // Infraestructura / Integraciones
    GlobeAltIcon,                  // Web / internacional
    PuzzlePieceIcon,               // Extensiones / Plugins
    BoltIcon,                      // Automatización / AI
    AdjustmentsHorizontalIcon,     // Configuración avanzada
    IdentificationIcon,            // Perfiles / identificaciones
    KeyIcon,                       // Accesos / credenciales
    DevicePhoneMobileIcon,         // Versión móvil
    LifebuoyIcon                   // Soporte / Ayuda
} from "@heroicons/react/24/solid";
import { PLAN_VALUES } from "@/types/plans";

export const iconMap = {
    ShieldCheckIcon,
    ChartPieIcon,
    BookOpenIcon,
    ViewfinderCircleIcon,
    SparklesIcon,
    UsersIcon,
    ChatBubbleLeftRightIcon,
    ChatBubbleBottomCenterTextIcon,
    ClipboardDocumentListIcon,
    Cog6ToothIcon,
    BellAlertIcon,
    DocumentTextIcon,
    ChatBubbleLeftEllipsisIcon,
    FunnelIcon,

    HomeIcon,
    InboxIcon,
    CurrencyDollarIcon,
    CreditCardIcon,
    ShoppingCartIcon,
    CalendarDaysIcon,
    ChartBarIcon,
    ServerIcon,
    GlobeAltIcon,
    PuzzlePieceIcon,
    BoltIcon,
    AdjustmentsHorizontalIcon,
    IdentificationIcon,
    KeyIcon,
    DevicePhoneMobileIcon,
    LifebuoyIcon
};

export const ItemModuleSchema = z.object({
    url: z.string().min(1),
    title: z.string().min(1),
    customUrl: z.string().optional(),
})

export const FormModuleSchema = z.object({
    id: z.string().optional(),
    label: z.string().min(1, "Campo requerido"),
    route: z.string().min(1, "Campo requerido"),
    customUrl: z.string().optional(),
    icon: z.string().min(1, "Campo requerido"),
    adminOnly: z.boolean().default(false),
    requiresPremium: z.boolean().default(false),

    showInSidebar: z.boolean().optional().default(true),

    allowedPlans: z.array(z.enum(PLAN_VALUES)),
    items: z.array(ItemModuleSchema).optional(),
})

export type FormModuleValues = z.infer<typeof FormModuleSchema>

export type ModuleWithItems = Module & {
    moduleItems: ModuleItem[];
};