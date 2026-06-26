import type { Metadata } from 'next';
import { getPublicCatalog } from '@/actions/products-actions';
import { notFound } from 'next/navigation';
import { Bot, Instagram, Facebook } from 'lucide-react';
import { getPublicBrandingByUserId } from '@/actions/public-branding-actions';
import { CatalogoClient } from './_components/CatalogoClient';

export async function generateMetadata({ params }: { params: { userId: string } }): Promise<Metadata> {
  const branding = await getPublicBrandingByUserId(params.userId);
  return {
    title: `${branding.brandName} — Catálogo`,
    icons: { icon: branding.faviconUrl },
  };
}

export default async function CatalogoPublicoPage({
  params,
}: {
  params: { userId: string };
}) {
  const data = await getPublicCatalog(params.userId);
  if (!data) return notFound();

  const { user, config, products, categories } = data;
  const accent = config.primaryColor || '#6366F1';

  const hasBanner = !!config.bannerUrl;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">

      {/* ── HERO PORTADA ── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ minHeight: hasBanner ? '300px' : 'auto' }}
      >
        {/* Imagen de fondo */}
        {hasBanner && (
          <>
            <img
              src={config.bannerUrl!}
              alt="portada"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Degradado oscuro abajo para legibilidad */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
          </>
        )}

        {/* Barra superior — redes sociales */}
        <div className="relative z-10 flex justify-end px-6 pt-4">
          <div className="flex items-center gap-4">
            {config.instagram && (
              <a href={`https://instagram.com/${config.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                className={`transition-colors ${hasBanner ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-pink-500'}`} title="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
            )}
            {config.facebook && (
              <a href={`https://facebook.com/${config.facebook.replace('@', '')}`} target="_blank" rel="noreferrer"
                className={`transition-colors ${hasBanner ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-blue-600'}`} title="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
            )}
            {config.tiktok && (
              <a href={`https://tiktok.com/${config.tiktok.replace('@', '')}`} target="_blank" rel="noreferrer"
                className={`transition-colors ${hasBanner ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`} title="TikTok">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.95a8.28 8.28 0 0 0 4.83 1.55V7.05a4.85 4.85 0 0 1-1.06-.36z" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* Logo + nombre + headline centrado sobre la imagen */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 pb-10 pt-6 text-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.company}
              className={`h-20 w-20 rounded-2xl object-cover shadow-xl ring-4 ${hasBanner ? 'ring-white/30' : 'ring-gray-100'}`}
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl shadow-xl ring-4 ring-white/20"
              style={{ backgroundColor: accent }}
            >
              <Bot className="h-10 w-10 text-white" />
            </div>
          )}

          <div>
            <h1 className={`text-3xl font-extrabold sm:text-4xl ${hasBanner ? 'text-white drop-shadow-md' : 'text-gray-900'}`}>
              {config.headline || user.company}
            </h1>
            {config.subheadline && (
              <p className={`mt-2 text-base sm:text-lg max-w-xl mx-auto ${hasBanner ? 'text-white/80' : 'text-gray-500'}`}>
                {config.subheadline}
              </p>
            )}
            {!config.headline && user.name && user.name !== user.company && (
              <p className={`mt-1 text-sm ${hasBanner ? 'text-white/70' : 'text-gray-500'}`}>{user.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── STICKY NAV ── */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {user.image ? (
              <img src={user.image} alt={user.company} className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-gray-900">{user.company}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">Catálogo</span>
        </div>
      </header>

      {/* Contenido */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <CatalogoClient
          products={products}
          categories={categories}
          currencyCode={user.currencyCode}
          accentColor={accent}
          whatsappNumber={config.whatsappNumber}
          ctaText={config.ctaText}
          showStock={config.showStock}
          showSku={config.showSku}
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-6 text-center">
        <p className="text-xs text-gray-400">
          Catálogo creado con{' '}
          <span className="font-medium text-gray-500">Agente IA</span>
        </p>
      </footer>
    </main>
  );
}
