'use client'

import { ModuleWithItems } from '@/schema/module';
import { UserNavPref } from '@/types/nav-preference';
import { create } from 'zustand';

export type UserIntegrationItem = {
    id: string
    name: string
    url: string
    order: number
}

interface ModuleState {
    modules: ModuleWithItems[];
    navPrefs: UserNavPref[];
    labelModule: string | null
    canvaUrl: string | null
    userIntegrations: UserIntegrationItem[]
    setModules: (modules: ModuleWithItems[]) => void;
    setNavPrefs: (prefs: UserNavPref[]) => void;
    setLabelModule: (label: string) => void
    setCanvaUrl: (url: string) => void
    setUserIntegrations: (integrations: UserIntegrationItem[]) => void
}

export const useModuleStore = create<ModuleState>((set) => ({
    modules: [],
    navPrefs: [],
    labelModule: null,
    canvaUrl: null,
    userIntegrations: [],

    setModules: (modules) => set({ modules }),
    setNavPrefs: (prefs) => set({ navPrefs: prefs }),
    setLabelModule: (label) => set({ labelModule: label }),
    setCanvaUrl: (url) => set({ canvaUrl: url }),
    setUserIntegrations: (integrations) => set({ userIntegrations: integrations }),
}));
