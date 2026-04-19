'use client'

import { themes } from '@/schema/theme'
import { ThemeApp } from '@prisma/client'
import { create } from 'zustand'

interface ThemeStore {
    current: ThemeApp
    setTheme: (brand: ThemeApp) => void
    initTheme: (initialTheme: ThemeApp) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
    current: 'Default',

    setTheme: (brand) => {
        const vars = themes[brand]
        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value)
        })
        set({ current: brand })
    },

    initTheme: (initialTheme: ThemeApp) => {
        const brandToUse = themes[initialTheme] ? initialTheme : 'Default'
        const vars = themes[brandToUse]
        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value)
        })
        set({ current: brandToUse })
    },
}))