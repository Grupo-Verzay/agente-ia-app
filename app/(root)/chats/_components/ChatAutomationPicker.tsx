'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, MessageCircleMore, Workflow, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import {
  getQuickReplyCategoryLabel,
  normalizeQuickReplyCategory,
  QUICK_REPLY_CATEGORIES,
} from '@/lib/quick-reply-categories';

interface ChatAutomationPickerProps {
  quickReplies: ChatQuickReplyOption[];
  workflows: ChatWorkflowOption[];
  onSendQuickReply: (quickReplyId: number) => Promise<ChatToolActionResult>;
  onSendWorkflow: (workflowId: string) => Promise<ChatToolActionResult>;
}

export const ChatAutomationPicker: React.FC<ChatAutomationPickerProps> = ({
  quickReplies,
  workflows,
  onSendQuickReply,
  onSendWorkflow,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'workflows' | 'quickReplies'>('workflows');
  const [quickReplyCategory, setQuickReplyCategory] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const quickReplyCategoryOptions = useMemo(() => {
    const used = new Set(quickReplies.map((reply) => normalizeQuickReplyCategory(reply.category)));
    return QUICK_REPLY_CATEGORIES.filter((category) => used.has(category.value));
  }, [quickReplies]);
  const filteredQuickReplies = useMemo(() => {
    if (quickReplyCategory === 'all') return quickReplies;
    return quickReplies.filter((reply) => normalizeQuickReplyCategory(reply.category) === quickReplyCategory);
  }, [quickReplies, quickReplyCategory]);

  const handleWorkflowSend = useCallback(
    async (workflowId: string) => {
      try {
        setIsSubmitting(true);
        const result = await onSendWorkflow(workflowId);
        if (!result.success) {
          toast.error(result.message || 'No se pudo enviar el workflow.');
          return;
        }
        toast.success(result.message);
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo enviar el workflow.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSendWorkflow],
  );

  const handleQuickReplySend = useCallback(
    async (quickReplyId: number) => {
      try {
        setIsSubmitting(true);
        const result = await onSendQuickReply(quickReplyId);
        if (!result.success) {
          toast.error(result.message || 'No se pudo enviar la respuesta rapida.');
          return;
        }
        toast.success(result.message);
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo enviar la respuesta rapida.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSendQuickReply],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted p-0 shrink-0"
          title="Enviar workflow o respuesta rapida"
          aria-label="Enviar workflow o respuesta rapida"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[340px] p-3">
        <div className="mb-3">
          <p className="text-sm font-semibold text-foreground">Atajos de envio</p>
          <p className="text-xs text-muted-foreground">
            Lanza un workflow manual o envia una respuesta rapida.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'workflows' | 'quickReplies')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="workflows" className="gap-2 text-xs">
              <Workflow className="h-3.5 w-3.5" />
              Workflows
            </TabsTrigger>
            <TabsTrigger value="quickReplies" className="gap-2 text-xs">
              <MessageCircleMore className="h-3.5 w-3.5" />
              Rapidas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows">
            <Command className="rounded-lg border">
              <CommandInput placeholder="Buscar workflow..." className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty className="text-xs">No hay workflows disponibles.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {workflows.map((workflow) => (
                    <CommandItem
                      key={workflow.id}
                      value={`${workflow.name} ${workflow.isPro ? 'pro' : 'basic'}`}
                      className="items-start justify-between gap-3 py-3"
                      disabled={isSubmitting}
                      onSelect={() => void handleWorkflowSend(workflow.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{workflow.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workflow.isPro ? 'Workflow Pro' : 'Workflow estandar'}
                        </p>
                      </div>
                      <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>

          <TabsContent value="quickReplies">
            <div className="space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setQuickReplyCategory('all')}
                  className={`h-7 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                    quickReplyCategory === 'all'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Todas
                </button>
                {quickReplyCategoryOptions.map((category) => (
                  <button
                    key={category.value}
                    type="button"
                    onClick={() => setQuickReplyCategory(category.value)}
                    className={`h-7 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                      quickReplyCategory === category.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              <Command className="rounded-lg border">
                <CommandInput placeholder="Buscar respuesta rapida..." className="h-9 text-xs" />
                <CommandList>
                  <CommandEmpty className="text-xs">No hay respuestas rapidas disponibles.</CommandEmpty>
                  <CommandGroup className="max-h-64 overflow-auto">
                    {filteredQuickReplies
                      .filter((qr) => qr.name !== null)
                      .map((quickReply) => (
                        <CommandItem
                          key={quickReply.id}
                          value={`${quickReply.name ?? ''} ${quickReply.message} ${quickReply.workflowName ?? ''} ${getQuickReplyCategoryLabel(quickReply.category)}`}
                          className="items-start justify-between gap-3 py-3"
                          disabled={isSubmitting}
                          onSelect={() => void handleQuickReplySend(quickReply.id)}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {quickReply.name && (
                                <span className="text-xs font-mono text-primary font-medium">
                                  /{quickReply.name}
                                </span>
                              )}
                              <p className="line-clamp-2 text-sm font-medium">{quickReply.message}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {getQuickReplyCategoryLabel(quickReply.category)}
                            </p>
                          </div>
                          <MessageCircleMore className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};
