'use client'

import { ModuleWithItems } from '@/schema/module';
import { UserNavPref } from '@/types/nav-preference';
import { create } from 'zustand';

interface ModuleState {
    modules: ModuleWithItems[];
    navPrefs: UserNavPref[];
    labelModule: string | null
    canvaUrl: string | null
    setModules: (modules: ModuleWithItems[]) => void;
    setNavPrefs: (prefs: UserNavPref[]) => void;
    setLabelModule: (label: string) => void
    setCanvaUrl: (url: string) => void
}

export const useModuleStore = create<ModuleState>((set) => ({
    modules: [],
    navPrefs: [],
    labelModule: null,
    canvaUrl: null,

    setModules: (modules) => set({ modules }),
    setNavPrefs: (prefs) => set({ navPrefs: prefs }),
    setLabelModule: (label) => set({ labelModule: label }),
    setCanvaUrl: (url) => set({ canvaUrl: url }),
}));
