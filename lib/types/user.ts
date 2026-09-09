import { BillingStatus, IaCredit, Pausar, ServiceAccessStatus, Session, User, UserAiConfig } from "@prisma/client";

export interface UserWithPausar extends User {
    pausar: Pausar[]; // Array de registros Pausar
};
export interface ClientInterface extends User {
    pausar: Pausar[];
    aiConfigs: UserAiConfig[];
    isEvoEnabled: boolean;
    qrStatus: boolean;
    reseller: User | null;
    credits: IaCredit | null;
    instancias?: { instanceName: string; instanceType: string | null }[];
    /**
     * Cómo va el servicio de este cliente. Es lo que separa a un cliente de
     * verdad de una cuenta que quedó ahí, y el mismo estado que usan Finanzas y
     * Analíticas. `null` = nunca se le configuró facturación.
     */
    billing?: { accessStatus: ServiceAccessStatus | null; billingStatus: BillingStatus | null } | null;
};