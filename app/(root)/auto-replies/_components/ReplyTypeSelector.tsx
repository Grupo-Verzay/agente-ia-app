'use client';

import { MessageSquareText, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReplyType = 'text' | 'flow';

interface ReplyTypeOption {
    value: ReplyType;
    label: string;
    description: string;
    icon: React.ElementType;
}

const REPLY_TYPE_OPTIONS: ReplyTypeOption[] = [
    {
        value: 'text',
        label: 'Texto simple',
        description: 'Mensaje de texto',
        icon: MessageSquareText,
    },
    {
        value: 'flow',
        label: 'Ejecutar flujo',
        description: 'Activa un flujo automatizado',
        icon: Workflow,
    },
];

interface ReplyTypeSelectorProps {
    value: ReplyType;
    onChange: (value: ReplyType) => void;
    disabled?: boolean;
}

export const ReplyTypeSelector = ({ value, onChange, disabled }: ReplyTypeSelectorProps) => {
    return (
        <div className="grid grid-cols-2 gap-3">
            {REPLY_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = value === option.value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'flex flex-row items-center justify-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all duration-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30'
                        )}
                    >
                        <div className={cn(
                            'flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}>
                            <Icon size={16} />
                        </div>
                        <div>
                            <p className={cn(
                                'text-sm font-semibold leading-none',
                                isSelected ? 'text-primary' : 'text-foreground'
                            )}>
                                {option.label}
                            </p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
