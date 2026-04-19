import { UnderConstruction } from "@/components/custom"
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ApiKey, Instancia, PromptInstance } from "@prisma/client";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getApiKeyById } from "@/actions/api-action";
import { fetchInstanceAction } from "@/actions/fetch-intance-action";
import { getPromptsByUserId } from "@/actions/prompt-actions";
import { ConnectionMain } from "./_components";

// Tipo de la respuesta esperada
interface ActionResponse<T> {
    success: boolean;
    message: string;
    data?: T;
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

// 🔹 Normaliza el tipo (null/undefined -> "Desconocido")
const normalizeType = (t?: string | null): string => {
    const valid = ["Whatsapp", "Instagram", "Facebook"];
    if (!t) return "Desconocido";
    const normalized = t.trim();
    return valid.includes(normalized) ? normalized : "Desconocido";
};

const Connection = async ({ searchParams }: SearchParamProps) => {
    const user = await currentUser();
    if (!user) {
        redirect("/login");
    }

    // Obtener instancias, API key y prompts en paralelo
    const [resInstancias, resApikey, resPrompts] = await Promise.all([
        getInstancesByUserId(user.id),
        getApiKeyById((user as any).apiKeyId),
        getPromptsByUserId(user.id)
    ]);

    const instancias = hasInstancias(resInstancias) ? resInstancias.data : [];
    const apiKey = hasApikey(resApikey) ? resApikey.data : null;
    const prompts = hasPrompts(resPrompts) ? resPrompts.data : [];

    // Estructura base para las instancias
    const instancesData: Record<string, {
        instance?: Instancia;
        info?: any;
        prompts?: PromptInstance[];
    }> = {
        Whatsapp: { prompts: [] },
        Instagram: { prompts: [] },
        Facebook: { prompts: [] },
        Desconocido: { prompts: [] },
    };

    // Asignar instancias sin interferir entre tipos
    instancias.forEach(instancia => {
        const type = normalizeType(instancia.instanceType);
        if (!instancesData[type]) instancesData[type] = { prompts: [] };
        if (!instancesData[type].instance) {
            instancesData[type].instance = instancia;
        }
    });

    // Asignar prompts por tipo
    prompts.forEach(prompt => {
        const type = normalizeType(prompt.instanceType);
        if (!instancesData[type]) instancesData[type] = { prompts: [] };
        instancesData[type].prompts?.push(prompt);
    });

    // Obtener info de Evolution solo para instancias de tipo WhatsApp
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

    // Render principal
    return (
        <div className="flex flex-1 flex-wrap gap-4 items-center justify-center">
            <ConnectionMain
                user={user}
                instance={instancesData["Whatsapp"].instance}
                instanceInfo={instancesData["Whatsapp"].info}
                instanceType={"Whatsapp"}
                prompts={instancesData["Whatsapp"].prompts}
            />
            {/* <ConnectionMain
                user={user}
                instance={instancesData["Instagram"].instance}
                instanceInfo={instancesData["Instagram"].info}
                instanceType={"Instagram"}
                prompts={instancesData["Instagram"].prompts}
            />
            <ConnectionMain
                user={user}
                instance={instancesData["Facebook"].instance}
                instanceInfo={instancesData["Facebook"].info}
                instanceType={"Facebook"}
                prompts={instancesData["Facebook"].prompts}
            /> */}
            {/* No se renderiza la tarjeta “Desconocido” */}
        </div>
    );
};

export default Connection;