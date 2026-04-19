'use client'

import { ModuleWithItems } from '@/schema/module';
import { create } from 'zustand';
interface ModuleState {
    modules: ModuleWithItems[];
    labelModule: string | null
    canvaUrl: string | null
    setModules: (modules: ModuleWithItems[]) => void;
    setLabelModule: (label: string) => void
    setCanvaUrl: (url: string) => void
}

export const useModuleStore = create<ModuleState>((set, get) => ({
    modules: [],
    labelModule: null,
    canvaUrl: null,

    setModules: (modules) => set({ modules }),
    setLabelModule: (label) => set({ labelModule: label }),
    setCanvaUrl: (url) => set({ canvaUrl: url }),
}));
