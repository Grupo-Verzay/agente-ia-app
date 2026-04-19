// Tipos base (acciones generales)
export type BaseActionType = "text" | "image" | "video" | "document" | "audio" | "seguimiento" | "node_pause" | "nodo-notify";

// Tipos de seguimiento (prefijo "seguimiento-")
export type SeguimientoActionType =
    | "seguimiento-text"
    | "seguimiento-image"
    | "seguimiento-video"
    | "seguimiento-document"
    | "seguimiento-audio"

// Tipo combinado para ActionType
export type ActionType = BaseActionType | SeguimientoActionType;

export interface Action {
    type: ActionType;
    label: string;
    icon: JSX.Element;
    bg?: string;
};