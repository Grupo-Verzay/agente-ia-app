export type ProductType = {
    id: string;
    title: string;
    description: string | null;
    price: number;
    sku: string | null;
    stock: number;
    isActive: boolean;
    images: string[];
    category: string;  // Nueva propiedad para la categoría
    tags: string[];    // Nueva propiedad para las etiquetas
    userId: string;
    createdAt: Date;
    updatedAt: Date;
};

export interface ProductTableInterface {
    data: { items: ProductType[]; total: number; page: number; pages: number };
    userId: string;
};

export interface ProductLimitInfo {
    current: number;
    limit: number | null;
    reached: boolean;
}

export interface ProductStats {
    total: number;
    active: number;
    outOfStock: number;
    availableSlots: number | null; // null = sin límite (plan personalizado)
}

export interface MainProductsProps extends ProductTableInterface {
    initialFilter?: string;
    limitInfo?: ProductLimitInfo;
    stats: ProductStats;
};
