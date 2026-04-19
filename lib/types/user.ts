import { IaCredit, Pausar, Session, User, UserAiConfig } from "@prisma/client";

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
};