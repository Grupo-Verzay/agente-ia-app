'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Search, Package, CheckCircle2, PackageX, Boxes, ExternalLink } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ProductForm } from './ProductForm'
import { ProductTable } from './ProductTable'
import { MainProductsProps } from '@/types/products'
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas'
import { ModuleToolbar } from '@/components/shared/ModuleToolbar'

export const MainProducts = ({ userId, data, initialFilter = '', limitInfo, stats }: MainProductsProps) => {
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
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
            <ModuleToolbar className="shrink-0">
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar producto..."
                        className="w-full pl-8 text-sm"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                {/* Las cifras que abrían la pantalla en tarjetas. Ninguna
                    tiene filtro equivalente en esta lista, así que van sin
                    aspecto de pulsables. */}
                <PastillasDeMetricas
                    metricas={[
                        { clave: 'total', icono: <Package />, etiqueta: 'Total productos', valor: stats.total, color: '#3B82F6', ayuda: 'Productos registrados en el catálogo' },
                        { clave: 'active', icono: <CheckCircle2 />, etiqueta: 'Activos', valor: stats.active, color: '#22C55E', ayuda: 'Productos disponibles para usar' },
                        { clave: 'outOfStock', icono: <PackageX />, etiqueta: 'Sin stock', valor: stats.outOfStock, color: '#EF4444', ayuda: 'Productos agotados' },
                        { clave: 'slots', icono: <Boxes />, etiqueta: 'Cupos disponibles', valor: stats.availableSlots ?? '∞', color: '#8B5CF6', ayuda: 'Productos que aún puedes agregar según tu plan' },
                    ]}
                />
                <div className="toolbar-collapse flex items-center gap-3">
                    {limitInfo && limitInfo.limit !== null && (
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${limitInfo.reached ? 'text-destructive' : 'text-foreground'}`}>
                            <Package className="h-4 w-4" />
                            {limitInfo.current}/{limitInfo.limit} productos
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => window.open(`/catalogo/${userId}`, '_blank')}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver catálogo
                    </Button>
                    <ProductForm userId={userId} disabled={limitInfo?.reached} />
                </div>
            </ModuleToolbar>

            <ProductTable data={data} userId={userId} />

            {pages > 1 && (
                <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1">
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
