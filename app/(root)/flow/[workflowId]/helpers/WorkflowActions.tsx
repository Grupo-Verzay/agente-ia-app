import {
    FileText,
    Image as ImageIcon,
    Video,
    File,
    Music,
    OctagonPause,
    MessageCircle,
} from "lucide-react";
import { Action } from "../types";

const iconSize = 'h-5 w-5 ';

export const baseActions: Action[] = [
    { type: "text", label: "Texto", icon: <FileText className={`${iconSize} text-purple-600`} /> },
    { type: "image", label: "Imagen", icon: <ImageIcon className={`${iconSize} text-blue-500`} /> },
    { type: "video", label: "Video", icon: <Video className={`${iconSize} text-red-500`} /> },
    { type: "document", label: "Documento", icon: <File className={`${iconSize} text-gray-500`} /> },
    { type: "audio", label: "Audio", icon: <Music className={`${iconSize} text-green-500`} /> },
    { type: "node_pause", label: "Pausar", icon: <OctagonPause className={`${iconSize} text-blue-500`} /> },
    { type: "nodo-notify", label: "Notificar", icon: <MessageCircle className={`${iconSize} text-yellow-500`} /> },
];

const legacySeguimientoActions: Action[] = [
    { type: "seguimiento-text", label: "Texto", icon: <FileText className={`${iconSize} text-purple-600`} /> },
    { type: "seguimiento-image", label: "Imagen", icon: <ImageIcon className={`${iconSize} text-blue-500`} /> },
    { type: "seguimiento-video", label: "Video", icon: <Video className={`${iconSize} text-red-500`} /> },
    { type: "seguimiento-document", label: "Documento", icon: <File className={`${iconSize} text-gray-500`} /> },
    { type: "seguimiento-audio", label: "Audio", icon: <Music className={`${iconSize} text-green-500`} /> },
];

export const seguimientoActions: Action[] = legacySeguimientoActions;

export const cardBaseActions: Action[] = [
    { type: "text", label: "Texto", icon: <FileText className={`text-white`} />, bg: "bg-gray-500" },
    { type: "image", label: "Imagen", icon: <ImageIcon className={`text-white`} />, bg: "bg-blue-500" },
    { type: "video", label: "Video", icon: <Video className={`text-white`} />, bg: "bg-red-500" },
    { type: "document", label: "Documento", icon: <File className={` text-white`} />, bg: "bg-yellow-500" },
    { type: "audio", label: "Audio", icon: <Music className={`text-white`} />, bg: "bg-green-500" },
    { type: "node_pause", label: "Pausar", icon: <OctagonPause className={`text-white`} />, bg: "bg-blue-500" },
    { type: "nodo-notify", label: "Notificar", icon: <MessageCircle className={`text-white`} />, bg: "bg-yellow-500" },
];

export const cardSeguimientoActions: Action[] = [
    { type: "seguimiento-text", label: "Texto", icon: <FileText className="text-white" />, bg: "bg-gray-500" },
    { type: "seguimiento-image", label: "Imagen", icon: <ImageIcon className="text-white" />, bg: "bg-blue-500" },
    { type: "seguimiento-video", label: "Video", icon: <Video className="text-white" />, bg: "bg-red-500" },
    { type: "seguimiento-document", label: "Documento", icon: <File className="text-white" />, bg: "bg-gray-500" },
    { type: "seguimiento-audio", label: "Audio", icon: <Music className="text-white" />, bg: "bg-green-500" },
];

export { legacySeguimientoActions };
