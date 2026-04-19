'use client'

import { useEffect, useState } from 'react'
import { Crown, XIcon } from 'lucide-react'

export const CommunityBanner = () => {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const hidden = localStorage.getItem('hideTopBanner')
        if (!hidden) setVisible(true)
    }, [])

    const handleClose = () => {
        localStorage.setItem('hideTopBanner', 'true')
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div className="flex w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm py-2 px-4 shadow-md items-center justify-center relative">
            <div className="flex gap-2">
                <span className="flex flex-row gap-1 justify-center items-center">
                    <Crown className="h-3" />
                    Únete a nuestra comunidad en WhatsApp y entérate de todas las novedades.
                </span>
                <a
                    href="https://chat.whatsapp.com/BV7vxpVgP6UC7LoxP609mm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold hover:text-yellow-300"
                >
                    Unirme ahora →
                </a>
            </div>
            <button
                onClick={handleClose}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
                aria-label="Cerrar"
            >
                <XIcon size={16} />
            </button>
        </div>
    )
}
