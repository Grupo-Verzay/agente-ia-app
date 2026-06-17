'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, ShoppingBag, Save, MessageCircle, Instagram,
  Facebook, Palette, Type, Image, ChevronDown, ExternalLink,
  Package, Hash, Link, Check,
} from 'lucide-react';
import { getCatalogConfig, updateCatalogConfig, updateCatalogSlug } from '@/actions/catalog-config-actions';

type Props = { userId: string };

export function CatalogoPanel({ userId }: Props) {
  const [whatsapp, setWhatsapp] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [showStock, setShowStock] = useState(true);
  const [showSku, setShowSku] = useState(false);
  const [slug, setSlug] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basicos: true, identidad: false, textos: false,
    redes: false, opciones: false,
  });
  const toggle = (k: string) => setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  useEffect(() => {
    getCatalogConfig(userId).then((cfg) => {
      setWhatsapp(cfg.whatsappNumber ?? '');
      setBannerUrl(cfg.bannerUrl ?? '');
      setPrimaryColor(cfg.primaryColor ?? '');
      setHeadline(cfg.headline ?? '');
      setSubheadline(cfg.subheadline ?? '');
      setInstagram(cfg.instagram ?? '');
      setFacebook(cfg.facebook ?? '');
      setTiktok(cfg.tiktok ?? '');
      setCtaText(cfg.ctaText ?? '');
      setShowStock(cfg.showStock);
      setShowSku(cfg.showSku);
      setSlug(cfg.slug ?? '');
      setSlugInput(cfg.slug ?? '');
      setLoading(false);
    });
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    const res = await updateCatalogConfig({
      whatsappNumber: whatsapp || null,
      bannerUrl: bannerUrl || null,
      primaryColor: primaryColor || null,
      headline: headline || null,
      subheadline: subheadline || null,
      instagram: instagram || null,
      facebook: facebook || null,
      tiktok: tiktok || null,
      ctaText: ctaText || null,
      showStock,
      showSku,
      slug,
    });
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setSaving(false);
  };

  const handleSaveSlug = async () => {
    setSlugSaving(true);
    const res = await updateCatalogSlug(slugInput);
    if (res.success && res.slug) {
      setSlug(res.slug);
      setSlugInput(res.slug);
      toast.success('URL personalizada guardada');
    } else {
      toast.error(res.message ?? 'Error al guardar');
    }
    setSlugSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
      </div>
    );
  }

  const publicUrl = slug ? `/c/${slug}` : `/catalogo/${userId}`;
  const friendlyUrl = slug ? `/c/${slug}` : null;

  return (
    <div className="flex flex-col gap-6 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Catálogo Público</h2>
          <p className="text-sm text-muted-foreground">
            Personaliza la apariencia y datos de tu catálogo de productos.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => window.open(publicUrl, '_blank')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver catálogo
        </Button>
      </div>

      {/* URL amigable */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">URL personalizada</span>
        </div>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-background px-3 text-sm">
            <span className="text-muted-foreground shrink-0">/c/</span>
            <input
              className="min-w-0 flex-1 bg-transparent py-2 outline-none"
              placeholder="nombre-empresa"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            />
          </div>
          <Button size="sm" onClick={handleSaveSlug} disabled={slugSaving || !slugInput.trim() || slugInput === slug} className="shrink-0 gap-1.5">
            {slugSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Guardar
          </Button>
        </div>
        {friendlyUrl && (
          <p className="text-xs text-muted-foreground">
            URL activa:{' '}
            <a href={friendlyUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
              {typeof window !== 'undefined' ? window.location.host : 'agente.ia-app.com'}{friendlyUrl}
            </a>
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4" /> Configuración del catálogo
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 divide-y divide-border">

          {/* ── Datos básicos ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('basicos')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos básicos</p>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', openSections.basicos && '-rotate-180')} />
            </button>
            <div className={cn(openSections.basicos ? 'pb-3 space-y-4' : 'hidden')}>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <MessageCircle className="h-3.5 w-3.5 text-green-500" /> Número WhatsApp
                </Label>
                <Input
                  placeholder="ej. 573233612620"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Se mostrará un botón "Consultar por WhatsApp" en las cards de producto.
                </p>
              </div>
            </div>
          </div>

          {/* ── Identidad visual ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('identidad')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identidad visual</p>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', openSections.identidad && '-rotate-180')} />
            </button>
            <div className={cn(openSections.identidad ? 'pb-3 space-y-4' : 'hidden')}>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Image className="h-3.5 w-3.5 text-purple-500" /> URL de imagen de portada / banner
                </Label>
                <Input
                  placeholder="https://... (imagen de 1200x300px recomendado)"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Palette className="h-3.5 w-3.5 text-blue-500" /> Color primario (hex)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor || '#3B82F6'}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    placeholder="#3B82F6"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Color usado en precios y botones del catálogo.
                </p>
              </div>
            </div>
          </div>

          {/* ── Textos ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('textos')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Textos del catálogo</p>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', openSections.textos && '-rotate-180')} />
            </button>
            <div className={cn(openSections.textos ? 'pb-3 space-y-4' : 'hidden')}>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Type className="h-3.5 w-3.5 text-yellow-500" /> Título principal
                </Label>
                <Input
                  placeholder="ej. Nuestro catálogo de productos"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Type className="h-3.5 w-3.5 text-slate-400" /> Descripción / slogan
                </Label>
                <Textarea
                  placeholder="ej. Encuentra los mejores productos al mejor precio"
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <MessageCircle className="h-3.5 w-3.5 text-green-500" /> Texto del botón WhatsApp
                </Label>
                <Input
                  placeholder="ej. Consultar por WhatsApp"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Redes sociales ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('redes')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', openSections.redes && '-rotate-180')} />
            </button>
            <div className={cn(openSections.redes ? 'pb-3 space-y-4' : 'hidden')}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
                  </Label>
                  <Input placeholder="@usuario" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook
                  </Label>
                  <Input placeholder="@pagina" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.95a8.28 8.28 0 0 0 4.83 1.55V7.05a4.85 4.85 0 0 1-1.06-.36z"/>
                    </svg> TikTok
                  </Label>
                  <Input placeholder="@usuario" value={tiktok} onChange={(e) => setTiktok(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Opciones de visualización ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('opciones')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opciones de visualización</p>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', openSections.opciones && '-rotate-180')} />
            </button>
            <div className={cn(openSections.opciones ? 'pb-3 space-y-4' : 'hidden')}>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Mostrar stock</p>
                    <p className="text-xs text-muted-foreground">Muestra la cantidad disponible en cada producto</p>
                  </div>
                </div>
                <Switch checked={showStock} onCheckedChange={setShowStock} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Mostrar SKU</p>
                    <p className="text-xs text-muted-foreground">Muestra el código de referencia del producto</p>
                  </div>
                </div>
                <Switch checked={showSku} onCheckedChange={setShowSku} />
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Footer: URL pública + Guardar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Catálogo público:{' '}
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            agente.ia-app.com{publicUrl}
          </a>
        </p>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
