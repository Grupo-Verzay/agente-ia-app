'use client';

import * as React from 'react';
import { Loader2, Send, Phone, ChevronDown, Check, MessageCircleMore, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { normalizeWhatsAppConversationJid, fmtPhone, pickExplicitWhatsAppPhoneJid } from '@/lib/whatsapp-jid';
import { getInstanceDisplayName } from '@/lib/instance-display-name';
import type { InstanceActionSet } from './chats-client';
import type { ChatData } from '@/actions/chat-actions';
import type { ChatQuickReplyOption, ChatWorkflowOption } from '@/types/chat';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { sendMetaTemplate, type MetaTemplateOption } from '@/actions/channel-chat-actions';

type Instancia = {
  instanceName: string;
  displayName?: string | null;
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
  quickReplies?: ChatQuickReplyOption[];
  workflows?: ChatWorkflowOption[];
}

export function NewConversationDialog({ open, onClose, instancias, instanceActionSets, contacts = [], initialContact, quickReplies = [], workflows = [] }: Props) {
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
  const [sendMode, setSendMode] = React.useState<'message' | 'template' | 'quick' | 'workflow'>('message');
  const [isSending, setIsSending] = React.useState(false);
  const [sendingQuickReplyId, setSendingQuickReplyId] = React.useState<number | null>(null);
  const [sendingWorkflowId, setSendingWorkflowId] = React.useState<string | null>(null);
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
  const getInstanceLabel = (inst: Instancia) => {
    const isMetaWhatsApp = inst.instanceType?.trim().toLowerCase() === 'meta';
    const visibleName = getInstanceDisplayName(inst.instanceName, inst.displayName);
    return isMetaWhatsApp ? `${visibleName} (API)` : (inst.company || visibleName);
  };
  const instanceLabel = selectedInstance
    ? getInstanceLabel(selectedInstance)
    : 'Seleccionar bandeja';

  const selectedActionSet = instanceActionSets.find((s) => s.instanceName === selectedInstanceName);
  const effectiveJid = selectedJid || normalizeWhatsAppConversationJid(phone.trim());
  const selectedContact = contacts.find(
    (contact) => contact.remoteJid === selectedJid || contact.aliases?.includes(selectedJid),
  );
  const metaDestinationJid = pickExplicitWhatsAppPhoneJid([
    selectedContact?.remoteJid,
    selectedContact?.remoteJidAlt,
    selectedContact?.senderPn,
    ...(selectedContact?.aliases ?? []),
    phone,
    selectedJid,
  ]);
  const selectedInstanceType = selectedInstance?.instanceType?.trim().toLowerCase();
  const canSendTemplate = selectedInstanceType === 'meta' && !!metaDestinationJid && !!selectedInstanceName;
  const canSend = sendMode === 'message' && !!effectiveJid && message.trim().length > 0 && !!selectedActionSet && !isSending;

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

  const handleSendQuickReply = async (quickReplyId: number) => {
    if (!effectiveJid || !selectedActionSet) {
      toast.error('Selecciona un contacto y una bandeja.');
      return;
    }

    setSendingQuickReplyId(quickReplyId);
    try {
      const result = await selectedActionSet.sendQuickReply(effectiveJid, quickReplyId);
      if (result.success) {
        toast.success(result.message || 'Respuesta rápida enviada');
        handleClose();
      } else {
        toast.error(result.message || 'No se pudo enviar la respuesta rápida');
      }
    } catch {
      toast.error('Error al enviar la respuesta rápida');
    } finally {
      setSendingQuickReplyId(null);
    }
  };

  const handleSendWorkflow = async (workflowId: string) => {
    if (!effectiveJid || !selectedActionSet) {
      toast.error('Selecciona un contacto y una bandeja.');
      return;
    }

    setSendingWorkflowId(workflowId);
    try {
      const result = await selectedActionSet.sendWorkflow(effectiveJid, workflowId);
      if (result.success) {
        toast.success(result.message || 'Flujo enviado');
        handleClose();
      } else {
        toast.error(result.message || 'No se pudo enviar el flujo');
      }
    } catch {
      toast.error('Error al enviar el flujo');
    } finally {
      setSendingWorkflowId(null);
    }
  };

  const handleSendTemplate = async (
    template: MetaTemplateOption,
    params: string[],
  ): Promise<{ success: boolean; message?: string }> => {
    if (!selectedInstanceName) {
      return { success: false, message: 'Selecciona una bandeja.' };
    }
    if (!metaDestinationJid) {
      return {
        success: false,
        message: 'Meta necesita el número real del cliente. Este contacto está como @lid y no tiene alias telefónico.',
      };
    }

    const result = await sendMetaTemplate(selectedInstanceName, metaDestinationJid, template, params);
    if (result.success) handleClose();
    return result;
  };

  const handleClose = () => {
    setPhone('');
    setSelectedJid('');
    setSelectedContactName('');
    setMessage('');
    setSendMode('message');
    setIsSending(false);
    setSendingQuickReplyId(null);
    setSendingWorkflowId(null);
    setContactOpen(false);
    setInstanceOpen(false);
    onClose();
  };

  const handleSelectContact = (contact: ChatData) => {
    const phoneLabel =
      fmtPhone(contact.remoteJid) ||
      fmtPhone(contact.remoteJidAlt) ||
      fmtPhone(contact.senderPn) ||
      (contact.aliases ?? []).map((alias) => fmtPhone(alias)).find(Boolean) ||
      '';
    const name = contact.pushName?.trim() || phoneLabel || contact.remoteJid;
    setSelectedJid(contact.remoteJid);
    setPhone(phoneLabel || contact.remoteJid);
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
          fmtPhone(c.remoteJid).toLowerCase().includes(term) ||
          fmtPhone(c.remoteJidAlt).toLowerCase().includes(term) ||
          fmtPhone(c.senderPn).toLowerCase().includes(term) ||
          (c.aliases ?? []).some((alias) => alias.toLowerCase().includes(term) || fmtPhone(alias).toLowerCase().includes(term)),
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
                            const phoneStr =
                              fmtPhone(contact.remoteJid) ||
                              fmtPhone(contact.remoteJidAlt) ||
                              fmtPhone(contact.senderPn) ||
                              (contact.aliases ?? []).map((alias) => fmtPhone(alias)).find(Boolean) ||
                              '';
                            const name = contact.pushName?.trim() || phoneStr || contact.remoteJid;
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
                          ? getInstanceLabel(selectedInstance)
                          : 'Seleccionar bandeja'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1" align="start">
                    {whatsappInstancias.map((inst, idx) => {
                      const label = getInstanceLabel(inst);
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

          <div className="px-5 py-3">
            <Tabs value={sendMode} onValueChange={(value) => setSendMode(value as typeof sendMode)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="message" className="text-xs">Mensaje</TabsTrigger>
                <TabsTrigger value="template" className="text-xs" disabled={!canSendTemplate}>
                  Plantilla
                </TabsTrigger>
                <TabsTrigger value="quick" className="text-xs" disabled={quickReplies.length === 0}>
                  Rápida
                </TabsTrigger>
                <TabsTrigger value="workflow" className="text-xs" disabled={workflows.length === 0}>
                  Flujo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="message" className="mt-3">
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
              </TabsContent>

              <TabsContent value="template" className="mt-3">
                {canSendTemplate ? (
                  <div className="min-h-[120px] rounded-md border bg-muted/20 p-3">
                    <TemplatePickerDialog
                      inline
                      instanceName={selectedInstanceName}
                      onSendTemplate={handleSendTemplate}
                    />
                  </div>
                ) : (
                  <p className="min-h-[120px] py-8 text-center text-sm text-muted-foreground">
                    Selecciona una línea WhatsApp Cloud API.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="quick" className="mt-3">
                <Command className="rounded-lg border">
                  <CommandInput placeholder="Buscar respuesta rápida..." className="h-9 text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs">No hay respuestas rápidas disponibles.</CommandEmpty>
                    <CommandGroup className="max-h-[120px] overflow-auto">
                      {quickReplies.map((reply) => (
                        <CommandItem
                          key={reply.id}
                          value={`${reply.name ?? ''} ${reply.message}`}
                          className="items-start gap-2 py-2"
                          disabled={sendingQuickReplyId !== null}
                          onSelect={() => void handleSendQuickReply(reply.id)}
                        >
                          {sendingQuickReplyId === reply.id ? (
                            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                          ) : (
                            <MessageCircleMore className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            {reply.name && <p className="text-xs font-mono text-primary">/{reply.name}</p>}
                            <p className="line-clamp-2 text-sm">{reply.message}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </TabsContent>

              <TabsContent value="workflow" className="mt-3">
                <Command className="rounded-lg border">
                  <CommandInput placeholder="Buscar flujo..." className="h-9 text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs">No hay flujos disponibles.</CommandEmpty>
                    <CommandGroup className="max-h-[120px] overflow-auto">
                      {workflows.map((workflow) => (
                        <CommandItem
                          key={workflow.id}
                          value={`${workflow.name} ${workflow.isPro ? 'pro' : 'basic'}`}
                          className="items-start gap-2 py-2"
                          disabled={sendingWorkflowId !== null}
                          onSelect={() => void handleSendWorkflow(workflow.id)}
                        >
                          {sendingWorkflowId === workflow.id ? (
                            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                          ) : (
                            <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-medium">{workflow.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {workflow.isPro ? 'Workflow Pro' : 'Workflow estándar'}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </TabsContent>
            </Tabs>
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
