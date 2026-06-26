// Mapa nombre-de-ícono → componente lucide, compartido por el panel de
// contacto y el modal de configuración de campos. Mantener en sync con
// CONTACT_ICON_NAMES de lib/contact-fields.ts.
import {
  Building2, Briefcase, CreditCard, Phone, Mail, Calendar, Flag, MapPin,
  Home, Globe, AtSign, Share2, Linkedin, FileText, Tag,
} from 'lucide-react';

export const CONTACT_ICON_MAP: Record<string, React.ElementType> = {
  Building2, Briefcase, CreditCard, Phone, Mail, Calendar, Flag, MapPin,
  Home, Globe, AtSign, Share2, Linkedin, FileText, Tag,
};

export const resolveContactIcon = (name: string): React.ElementType =>
  CONTACT_ICON_MAP[name] ?? Tag;
