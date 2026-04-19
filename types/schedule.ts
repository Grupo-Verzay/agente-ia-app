// Tipos mínimos que el componente necesita
import { Country } from '@/components/custom/CountryCodeSelect';
import { UserWithApiKeys } from '@/schema/schema';
import { AppointmentStatus } from "@prisma/client";

export interface ServiceInterface {
    selectedService: string;
    setSelectedService: (serviceId: string) => void; // compatible con <Select onValueChange />
    setStep: (step: number) => void;
    user: UserWithApiKeys;
}

// Tipos auxiliares
export type Slot = {
    startTime: string; // ISO
    endTime: string;   // ISO
    label?: string;    // se genera en el componente
    minutes?: number;  // se genera en el componente
};

export type GetAvailableSlotsResult = {
    success: boolean;
    data?: Slot[];
    message?: string;
};

export type GetAvailableSlotsFn = (
    userId: string,
    ymd: string,        // "yyyy-MM-dd"
    durationMinutes: number
) => Promise<GetAvailableSlotsResult>;

export interface DateHourInterface {
    // estado/acciones
    setSelectedDate: (date?: Date) => void;
    setSelectedSlot: (slot: string | null) => void;        // `${start}|${end}`
    setSelectedDateYmd: (ymd: string) => void;             // "yyyy-MM-dd"
    setStep: (step: number) => void;                        // o (step: 0|1|2|3)
    setSlots: (slots: Slot[]) => void;

    // datos entrantes
    selectedService: string;
    selectedSlot: string | null;
    selectedDate?: Date;
    slots: Slot[];
    timezone: string;
    serverTimeZone: string;
    slotDuration: number;
    // mínimos del usuario (solo usas user.id)
    user: UserWithApiKeys;

    // validaciones para avanzar (usadas en canContinueStep2)
    phone: string;
    areaCode: string;
    nameClient: string;
}


export interface ScheduleFormInterface {
    // valores actuales
    nameClient: string;
    areaCode: string;         // p. ej., "+57"
    phone: string;
    countries?: Country[];    // opcional porque haces countries && <CountryCodeSelect />

    // estado UI / validaciones
    canContinueStep2: boolean;

    // acciones
    setNameClient: (name: string) => void;
    setAreaCode: (code: string) => void;
    setPhone: (phone: string) => void;
    setStep: (step: number) => void; // o 0|1|2|3 si quieres más estricto
}

export interface SummaryComponentInterface {
    // datos base
    user: UserWithApiKeys;
    timezone: string;

    // datos del cliente
    nameClient: string;
    areaCode: string;   // ej: "+57"
    phone: string;

    // estado de UI
    loading: boolean;

    // selección actual
    selectedService: string;          // serviceId
    selectedSlot: string | null;      // `${startISO}|${endISO}`
    selectedDate?: Date;

    // acciones
    setStep: (step: number) => void;        // o: (step: 0|1|2|3) => void
    setOpenDialog: (open: boolean) => void; // o: React.Dispatch<React.SetStateAction<boolean>>
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
    PENDIENTE: "Pendiente",
    CONFIRMADA: "Confirmada",
    ATENDIDA: "Atendida",
    CANCELADA: "Cancelada",
    NO_ASISTIDA: "No asistida",
};