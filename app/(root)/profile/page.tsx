import { redirect } from 'next/navigation';
import { UserInformation } from '@/app/(root)/profile/_components/UserInformation';
import { currentUser } from '@/lib/auth';
import { getCountryCodes } from '@/actions/get-country-action';
import { ApiKey, Instancia, PromptInstance } from "@prisma/client";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getApiKeyById } from "@/actions/api-action";
import { getPromptsByUserId } from "@/actions/prompt-actions";
import { isWahaConfigured } from "@/lib/waha";
interface ActionResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}
export interface InstanceInterfaceConn {
  instance?: Instancia;
  info?: any;
  prompts: PromptInstance[]; // mejor que sea siempre array
}

export type InstanceKind = "Whatsapp" | "Instagram" | "Facebook" | "Desconocido";

type InstancesData = Record<InstanceKind, InstanceInterfaceConn>;

export interface UserInformationProps {
  userId: string;
  countries: any[];
  instancesData: InstancesData;
  metaInstances: Instancia[];
  telegramInstances: Instancia[];
  /** Lineas servidas por Waha. Perfil no las conocia y enseñaba "Crear instancia". */
  wahaInstances: Instancia[];
  /** Hay servidor de Waha configurado: se ofrece cambiar de proveedor. */
  hayServidorWaha?: boolean;
  /** La cuenta tiene Evolution: desde una linea Waha se puede volver. */
  puedeVolverAEvolution?: boolean;
  autoOpenApiKey?: boolean;
  autoSetup?: boolean;
  /** Solo lectura: agentes (no dueño ni administrador) ven el perfil sin poder editar. */
  readOnly?: boolean;
}

// Adapta las funciones de tipo para manejar arrays
function hasInstancias(result: { data?: Instancia[] | null }): result is { data: Instancia[] } {
  return !!result.data && result.data.length > 0;
}
function hasApikey(result: { data?: ApiKey | null }): result is { data: ApiKey } {
  return !!result.data;
}
function hasPrompts(result: { data?: PromptInstance[] | null }): result is { data: PromptInstance[] } {
  return !!result.data && result.data.length > 0;
}

// Normaliza el tipo (null/undefined -> "Desconocido")
const normalizeType = (t?: string | null): InstanceKind => {
  if (!t) return "Desconocido";
  const normalized = t.trim();

  if (
    normalized === "Whatsapp" ||
    normalized === "Instagram" ||
    normalized === "Facebook"
  ) {
    return normalized as InstanceKind;
  }

  return "Desconocido";
};

const ProfilePage = async ({ searchParams }: { searchParams?: { openApiKey?: string; autoSetup?: string } }) => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };

  // Los asesores (sub-cuentas) SÍ acceden a Perfil. Usan effectiveId, por lo que
  // ven/gestionan la configuración (conexión, instancias, etc.) de la cuenta principal.
  const effectiveId = user.effectiveId ?? user.id;

  // Obtener instancias, API key y prompts en paralelo
  const [resInstancias, resApikey, resPrompts] = await Promise.all([
    getInstancesByUserId(effectiveId),
    getApiKeyById(user.apiKeyId ?? ''),
    getPromptsByUserId(effectiveId)
  ]);

  const instancias = hasInstancias(resInstancias) ? resInstancias.data : [];
  const apiKey = hasApikey(resApikey) ? resApikey.data : null;
  const prompts = hasPrompts(resPrompts) ? resPrompts.data : [];


  const instancesData: InstancesData = {
    Whatsapp: { prompts: [] },
    Instagram: { prompts: [] },
    Facebook: { prompts: [] },
    Desconocido: { prompts: [] },
  };

  const metaInstances: Instancia[] = [];
  const telegramInstances: Instancia[] = [];
  const wahaInstances: Instancia[] = [];

  // Asignar instancias sin sobrescribir otras
  instancias.forEach((instancia) => {
    const type = instancia.instanceType?.trim();
    if (type === 'meta') { metaInstances.push(instancia); return; }
    if (type === 'telegram') { telegramInstances.push(instancia); return; }
    // Sin esto, una linea de Waha caia en "Desconocido" y la pestaña Conexion
    // enseñaba el formulario de "Crear instancia" de Evolution. Pulsarlo creaba
    // una SEGUNDA linea con el mismo nombre y el numero quedaba partido en dos.
    if (type === 'waha') { wahaInstances.push(instancia); return; }
    const normalized = normalizeType(instancia.instanceType);
    if (!instancesData[normalized].instance) {
      instancesData[normalized].instance = instancia;
    }
  });

  // Asignar prompts al tipo correspondiente
  prompts.forEach((prompt) => {
    const type = normalizeType(prompt.instanceType);
    instancesData[type].prompts.push(prompt);
  });

  // El estado en vivo (Evolution) ya NO se pide aqui: bloqueaba el
  // renderizado de la pagina completa si Evolution estaba caido o lento.
  // Se pide aparte, desde el cliente, en getInstanceLiveStatusAction.

  const countries = await getCountryCodes();
  const hayServidorWaha = await isWahaConfigured();

  return (
    <>
      <UserInformation userId={effectiveId} countries={countries} instancesData={instancesData} metaInstances={metaInstances} telegramInstances={telegramInstances} wahaInstances={wahaInstances} hayServidorWaha={hayServidorWaha} puedeVolverAEvolution={Boolean(user.apiKeyId)} autoOpenApiKey={searchParams?.openApiKey === 'true'} autoSetup={searchParams?.autoSetup === '1'} readOnly={!!user.ownerId && user.advisorRole !== 'administrador'} />
    </>
  );
}

export default ProfilePage;
