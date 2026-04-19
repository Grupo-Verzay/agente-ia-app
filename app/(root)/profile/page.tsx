import { redirect } from 'next/navigation';
import { UserInformation } from '@/app/(root)/profile/_components/UserInformation';
import { currentUser } from '@/lib/auth';
import { getCountryCodes } from '@/actions/get-country-action';
import { ApiKey, Instancia, PromptInstance } from "@prisma/client";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getApiKeyById } from "@/actions/api-action";
import { fetchInstanceAction } from "@/actions/fetch-intance-action";
import { getPromptsByUserId } from "@/actions/prompt-actions";
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

const ProfilePage = async () => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };


  // Obtener instancias, API key y prompts en paralelo
  const [resInstancias, resApikey, resPrompts] = await Promise.all([
    getInstancesByUserId(user.id),
    getApiKeyById((user as any).apiKeyId),
    getPromptsByUserId(user.id)
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

  // Asignar instancias sin sobrescribir otras
  instancias.forEach((instancia) => {
    const type = normalizeType(instancia.instanceType);
    if (!instancesData[type].instance) {
      instancesData[type].instance = instancia;
    }
  });

  // Asignar prompts al tipo correspondiente
  prompts.forEach((prompt) => {
    const type = normalizeType(prompt.instanceType);
    instancesData[type].prompts.push(prompt);
  });

  // Consultar Evolution solo para WhatsApp
  if (apiKey) {
    const fetchPromises = instancias.map(async (instancia) => {
      const type = normalizeType(instancia.instanceType);
      if (type !== "Whatsapp") return;

      if (instancesData[type]?.instance) {
        const instanceInfo = await fetchInstanceAction({
          evoApiKey: apiKey.key,
          evoUrl: apiKey.url,
          instanceName: instancia.instanceName
        });

        instancesData[type].info = instanceInfo?.data;
      }
    });

    await Promise.all(fetchPromises);
  }

  const countries = await getCountryCodes();

  return (
    <>
      <UserInformation userId={user.id} countries={countries} instancesData={instancesData} />
    </>
  );
}

export default ProfilePage;