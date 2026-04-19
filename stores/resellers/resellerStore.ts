'use client'

import { create } from 'zustand'
import { ResellerData } from '@/schema/reseller'

interface ResellerStore {
    reseller: ResellerData | null
    isLoaded: boolean
    setReseller: (data: ResellerData) => void
    clearReseller: () => void
}

export const useResellerStore = create<ResellerStore>((set) => ({
    reseller: null,
    isLoaded: false,

    setReseller: (data) => {
        set({ reseller: data, isLoaded: true });
    },

    clearReseller: () => {
        set({ reseller: null, isLoaded: true });
    }
}));