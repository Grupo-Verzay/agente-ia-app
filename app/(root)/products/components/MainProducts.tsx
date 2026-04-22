'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ProductForm } from './ProductForm'
import { ProductTable } from './ProductTable'
import { MainProductsProps } from '@/types/products'

export const MainProducts = ({ userId, data, initialFilter = '' }: MainProductsProps) => {
    const [filter, setFilter] = useState(initialFilter)
    const router = useRouter()
    const pathname = usePathname() ?? '/'

    useEffect(() => { setFilter(initialFilter) }, [initialFilter])

    // Debounce search — reset to page 1 on new query
    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            if (filter.trim()) params.set('q', filter.trim())
            params.set('page', '1')
            const search = params.toString()
            router.replace(search ? `${pathname}?${search}` : pathname)
        }, 400)
        return () => clearTimeout(timeout)
    }, [filter, pathname, router])

    const goToPage = useCallback((page: number) => {
        const params = new URLSearchParams()
        if (filter.trim()) params.set('q', filter.trim())
        params.set('page', String(page))
        router.push(`${pathname}?${params.toString()}`)
    }, [filter, pathname, router])

    const { page, pages, total } = data

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

            {pages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">
                        {total} producto{total !== 1 ? 's' : ''} · Página {page} de {pages}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={page <= 1}
                            onClick={() => goToPage(page - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={page >= pages}
                            onClick={() => goToPage(page + 1)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
