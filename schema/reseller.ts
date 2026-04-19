import { ThemeApp } from "@prisma/client";

export interface ResellerInfoResponse {
    success: boolean;
    message: string;
    data?: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
        theme: ThemeApp;
        company: string;
        notificationNumber: string;
        mapsUrl: string;
        lat: string;
        lng: string;
    };
}

export interface ResellerData {
    id: string
    name: string | null
    email: string
    image: string | null
    theme: ThemeApp
    company: string
    notificationNumber: string
    mapsUrl: string
    lat: string
    lng: string
}
