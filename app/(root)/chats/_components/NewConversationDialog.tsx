'use client';

import * as React from 'react';
import { Loader2, Send, Phone, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { normalizeWhatsAppConversationJid, fmtPhone } from '@/lib/whatsapp-jid';
import type { InstanceActionSet } from './chats-client';
import type { ChatData } from '@/actions/chat-actions';

type Instancia = {
  instanceName: string;
  instanceType?: string | null;
  metaChannel?: string | null;
  company?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  instancias: Instancia[];
  instanceActionSets: InstanceActionSet[];
  contacts?: ChatData[];
  initialContact?: { jid: string; name: string; phone: string };
}

export function NewConversationDialog({ open, onClose, instancias, instanceActionSets, contacts = [], initialContact }: Props) {
  const [phone, setPhone] = React.useState('');
  const [selectedJid, setSelectedJid] = React.useState('');
  const [selectedContactName, setSelectedContactName] = React.useState('');

  React.useEffect(() => {
    if (open && initialContact) {
      setSelectedJid(initialContact.jid);
      setPhone(initialContact.phone);
      setSelectedContactName(initialContact.name);
    }
  }, [open, initialContact]);
  const [selectedInstanceName, setSelectedInstanceName] = React.useState<string>(
    instancias[0]?.instanceName ?? '',
  );
  const [message, setMessage] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [instanceOpen, setInstanceOpen] = React.useState(false);

  const sendableInstanceNames = React.useMemo(
    () => new Set(instanceActionSets.map((s) => s.instanceName)),
    [instanceActionSets],
  );

  const whatsappInstancias = instancias.filter((i) => {
    const type = i.instanceType?.trim().toLowerCase();
    const metaChannel = i.metaChannel?.trim().toLowerCase();
    const isWhatsAppLine =
      !type ||
      type === 'whatsapp' ||
      type === 'baileys' ||
      (type === 'meta' && (!metaChannel || metaChannel === 'whatsapp'));

    return isWhatsAppLine && sendableInstanceNames.has(i.instanceName);
  });

  React.useEffect(() => {
    if (!open || whatsappInstancias.length === 0) return;
    if (!whatsappInstancias.some((i) => i.instanceName === selectedInstanceName)) {
      setSelectedInstanceName(whatsappInstancias[0].instanceName);
    }
  }, [open, selectedInstanceName, whatsappInstancias]);

  const selectedInstance = whatsappInstancias.find((i) => i.instanceName === selectedInstanceName);
  const instanceLabel = selectedInstance
    ? selectedInstance.company || selectedInstance.instanceName
    : 'Seleccionar bandeja';

  const selectedActionSet = instanceActionSets.find((s) => s.instanceName === selectedInstanceName);

  const effectiveJid = selectedJid || normalizeWhatsAppConversationJid(phone.trim());
  const canSend = !!effectiveJid && message.trim().length > 0 && !!selectedActionSet && !isSending;

  const handleSend = async () => {
    if (!canSend) return;
    if (!effectiveJid) {
      toast.error('Ingresa un número de teléfono válido');
      return;
    }
    if (!selectedActionSet) {
      toast.error('Selecciona una bandeja de entrada');
      return;
    }

    setIsSending(true);
    try {
      const result = await selectedActionSet.sendText(effectiveJid, {
        kind: 'text',
        text: message.trim(),
      });
      if (result.success) {
        toast.success('Mensaje enviado');
        handleClose();
      } else {
        toast.error(result.message || 'No se pudo enviar el mensaje');
      }
    } catch {
      toast.error('Error al enviar el mensaje');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setSelectedJid('');
    setSelectedContactName('');
    setMessage('');
    setIsSending(false);
    setContactOpen(false);
    setInstanceOpen(false);
    onClose();
  };

  const handleSelectContact = (contact: ChatData) => {
    const name = contact.pushName?.trim() || fmtPhone(contact.remoteJid) || contact.remoteJid;
    setSelectedJid(contact.remoteJid);
    setPhone(fmtPhone(contact.remoteJid) || contact.remoteJid);
    setSelectedContactName(name);
    setContactOpen(false);
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setSelectedJid('');
    setSelectedContactName('');
  };

  const filteredContacts = React.useMemo(() => {
    const term = phone.trim().toLowerCase();
    if (!term) return contacts.slice(0, 12);
    return contacts
      .filter(
        (c) =>
          c.pushName?.toLowerCase().includes(term) ||
          c.remoteJid.toLowerCase().includes(term) ||
          fmtPhone(c.remoteJid).toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [contacts, phone]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-semibold">Nuevo mensaje</DialogTitle>
        </DialogHeader>

        <div className="divide-y">
          {/* Para: */}
          <div className="flex items-start gap-3 px-5 py-3">
            <span className="w-10 shrink-0 pt-1.5 text-sm text-muted-foreground">Para:</span>
            <div className="flex-1">
              <Popover open={contactOpen} onOpenChange={setContactOpen}>
                <PopoverTrigger asChild>
                  <div
                    role="combobox"
                    aria-expanded={contactOpen}
                    className="flex min-h-8 cursor-text items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/50 transition-colors"
                    onClick={() => setContactOpen(true)}
                  >
                    {selectedContactName ? (
                      <span>
                        <span className="font-medium">{selectedContactName}</span>
                        {phone && (
                          <span className="ml-1 text-muted-foreground">({phone})</span>
                        )}
                      </span>
                    ) : (
                      <input
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                        placeholder="Nombre o número de teléfono"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        onClick={(e) => { e.stopPropagation(); setContactOpen(true); }}
                        onKeyDown={(e) => { if (e.key === 'Escape') setContactOpen(false); }}
                      />
                    )}
                    {selectedContactName && (
                      <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhone('');
                          setSelectedJid('');
                          setSelectedContactName('');
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Buscar contacto..."
                      value={phone}
                      onValueChange={handlePhoneChange}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="flex flex-col items-center gap-1.5 py-4 text-sm text-muted-foreground">
                          <Phone className="h-5 w-5 opacity-50" />
                          <span>Sin coincidencias. Escribe el número directamente.</span>
                        </div>
                      </CommandEmpty>
                      {filteredContacts.length > 0 && (
                        <CommandGroup heading="Contactos recientes">
                          {filteredContacts.map((contact) => {
                            const name = contact.pushName?.trim() || fmtPhone(contact.remoteJid);
                            const phoneStr = fmtPhone(contact.remoteJid);
                            return (
                              <CommandItem
                                key={contact.remoteJid}
                                value={`${name} ${phoneStr} ${contact.remoteJid}`}
                                onSelect={() => handleSelectContact(contact)}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <div className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm font-medium">{name}</span>
                                  {phoneStr && name !== phoneStr && (
                                    <span className="text-xs text-muted-foreground">{phoneStr}</span>
                                  )}
                                </div>
                                {selectedJid === contact.remoteJid && (
                                  <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Vía: */}
          {whatsappInstancias.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="w-10 shrink-0 text-sm text-muted-foreground">Vía:</span>
              {whatsappInstancias.length === 1 ? (
                <span className="text-sm text-muted-foreground">{instanceLabel}</span>
              ) : (
                <Popover open={instanceOpen} onOpenChange={setInstanceOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>
                        {selectedInstance
                          ? (selectedInstance.company || selectedInstance.instanceName)
                          : 'Seleccionar bandeja'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1" align="start">
                    {whatsappInstancias.map((inst, idx) => {
                      const label = inst.company || inst.instanceName;
                      const isActive = inst.instanceName === selectedInstanceName;
                      return (
                        <button
                          key={inst.instanceName}
                          type="button"
                          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${isActive ? 'bg-accent/60 font-medium' : ''}`}
                          onClick={() => {
                            setSelectedInstanceName(inst.instanceName);
                            setInstanceOpen(false);
                          }}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <span className="truncate">{label}</span>
                          {isActive && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

          {/* Mensaje */}
          <div className="px-5 py-3">
            <Textarea
              placeholder="Escribe un mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  void handleSend();
                }
              }}
              className="min-h-[120px] resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0"
              autoFocus={false}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSending}>
            Descartar
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="gap-2"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-background px-1 py-px text-[10px] font-mono text-muted-foreground">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
