'use client';

import { useState, useMemo } from 'react';
import { Search, Package, Tag, AlertCircle, MessageCircle } from 'lucide-react';

type Product = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  comparePrice: number | null;
  sku: string | null;
  stock: number;
  category: string;
  tags: string[];
  images: string[];
};

type Props = {
  products: Product[];
  categories: string[];
  currencyCode: string;
  accentColor: string;
  whatsappNumber: string | null;
  ctaText: string | null;
  showStock: boolean;
  showSku: boolean;
};

function formatPrice(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

function buildWhatsAppUrl(number: string, productTitle: string) {
  const clean = number.replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola, me interesa el producto: *${productTitle}*`);
  return `https://wa.me/${clean}?text=${msg}`;
}

export function CatalogoClient({
  products, categories, currencyCode, accentColor,
  whatsappNumber, ctaText, showStock, showSku,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      const matchesCategory = !activeCategory || p.category === activeCategory;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, activeCategory]);

  return (
    <div className="flex flex-col gap-6">
      {/* Buscador + filtros en la misma fila */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-base text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition-all border"
              style={activeCategory === null
                ? { backgroundColor: accentColor, color: '#fff', borderColor: accentColor }
                : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition-all border"
                style={activeCategory === cat
                  ? { backgroundColor: accentColor, color: '#fff', borderColor: accentColor }
                  : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm text-gray-400 -mt-2">
        {filtered.length} {filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-gray-300">
          <Package className="h-16 w-16" />
          <p className="text-base text-gray-400">No se encontraron productos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              currencyCode={currencyCode}
              accentColor={accentColor}
              whatsappNumber={whatsappNumber}
              ctaText={ctaText}
              showStock={showStock}
              showSku={showSku}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product, currencyCode, accentColor, whatsappNumber, ctaText, showStock, showSku,
}: {
  product: Product;
  currencyCode: string;
  accentColor: string;
  whatsappNumber: string | null;
  ctaText: string | null;
  showStock: boolean;
  showSku: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const mainImage = !imgError && product.images.length > 0 ? product.images[0] : null;
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.comparePrice != null && product.comparePrice > product.price;
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / product.comparePrice!) * 100)
    : 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      {/* Imagen */}
      <div className="relative h-52 w-full shrink-0 overflow-hidden bg-gray-100">
        {mainImage ? (
          <img
            src={mainImage}
            alt={product.title}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-14 w-14 text-gray-300" />
          </div>
        )}

        {/* Badge descuento */}
        {hasDiscount && (
          <span className="absolute top-3 left-3 rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow">
            -{discountPct}%
          </span>
        )}

        {/* Sin stock */}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-500">
              <AlertCircle className="h-4 w-4" />
              Sin stock
            </span>
          </div>
        )}

        {/* Badge disponible */}
        {!outOfStock && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/90 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Disponible
          </span>
        )}

        {/* Categoría */}
        {product.category && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm">
            {product.category}
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
          {product.title}
        </h3>

        {product.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Tags */}
        {product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {product.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stock + SKU */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {showStock && product.stock > 0 && (
            <span>{product.stock} unidades disponibles</span>
          )}
          {showSku && product.sku && (
            <span>SKU: {product.sku}</span>
          )}
        </div>

        {/* Precio */}
        <div className="mt-auto pt-3 border-t border-gray-100">
          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col">
              {hasDiscount && (
                <span className="text-sm text-gray-400 line-through">
                  {formatPrice(product.comparePrice!, currencyCode)}
                </span>
              )}
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: accentColor }}>
                {formatPrice(product.price, currencyCode)}
              </span>
            </div>
            {showStock && product.stock > 0 && product.stock <= 10 && (
              <span className="text-xs text-orange-500 font-semibold">
                ¡Últimas {product.stock}!
              </span>
            )}
          </div>
        </div>

        {/* Botón WhatsApp */}
        {whatsappNumber ? (
          outOfStock ? (
            <button
              disabled
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-gray-400 bg-gray-100 cursor-not-allowed"
            >
              Sin stock disponible
            </button>
          ) : (
            <a
              href={buildWhatsAppUrl(whatsappNumber, product.title)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all hover:brightness-105 active:scale-95 shadow-md"
              style={{ backgroundColor: '#25D366', boxShadow: '0 4px 12px rgba(37,211,102,0.25)' }}
            >
              <MessageCircle className="h-4 w-4" />
              {ctaText || 'Consultar por WhatsApp'}
            </a>
          )
        ) : null}
      </div>
    </div>
  );
}
