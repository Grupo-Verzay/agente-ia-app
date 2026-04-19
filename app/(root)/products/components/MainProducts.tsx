// MainProducts.tsx
'use client'

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ProductForm } from './ProductForm'
import { ProductTable } from './ProductTable'
import { MainProductsProps } from '@/types/products'
import { useRouter } from 'next/navigation'


export const MainProducts = ({ userId, data, initialFilter = '' }: MainProductsProps) => {
    const [filter, setFilter] = useState(initialFilter)

    const router = useRouter()
    const rawPathname = usePathname()
    const pathname = rawPathname ?? "/"; // 👈 aquí lo forzamos a string

    // Cuando cambie initialFilter desde el server (por navegación), sincronizamos
    useEffect(() => {
        setFilter(initialFilter)
    }, [initialFilter])

    // Debounce: cada vez que el usuario escribe, actualizamos ?q=
    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()

            if (filter.trim()) {
                params.set('q', filter.trim())
            }
            // Siempre que cambie el filtro, volvemos a la página 1
            params.set('page', '1')

            const search = params.toString()
            router.replace(search ? `${pathname}?${search}` : pathname)
        }, 400) // 400ms debounce

        return () => clearTimeout(timeout)
    }, [filter, pathname, router])

    return (
        <div className="p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar producto..."
                        className="pl-8 text-sm"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                <ProductForm userId={userId} />
            </div>

            <ProductTable data={data} userId={userId} />
        </div>
    )
}
