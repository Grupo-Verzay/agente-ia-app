"use client";

import { type CSSProperties } from "react";
import { CircleHelp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const MetricCard = ({
    icon,
    label,
    value,
    helper,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    helper?: string;
    color?: string;
}) => {
    const supportsHexAlpha = /^#[0-9A-Fa-f]{6}$/;
    const withAlpha = (alpha: string) =>
        color && supportsHexAlpha.test(color) ? `${color}${alpha}` : color;

    const cardStyle = color
        ? ({ borderColor: withAlpha("52"), backgroundColor: withAlpha("12") } as CSSProperties)
        : undefined;
    const labelStyle = color ? ({ color: withAlpha("CC") } as CSSProperties) : undefined;
    const valueStyle = color ? ({ color } as CSSProperties) : undefined;
    const iconStyle = color
        ? ({ color, borderColor: withAlpha("5C"), backgroundColor: withAlpha("16") } as CSSProperties)
        : undefined;
    const helperButtonStyle = color ? ({ color: withAlpha("B3") } as CSSProperties) : undefined;

    return (
        <Card className="border-2 bg-background/60 shadow-sm flex-1" style={cardStyle}>
            <CardContent className="flex items-center gap-2 px-3 py-3">
                <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-muted-foreground"
                    style={iconStyle}
                >
                    {icon}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate text-xs font-medium text-muted-foreground" style={labelStyle}>
                        {label}
                    </span>
                    {helper && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground"
                                    style={helperButtonStyle}
                                    aria-label={`Informacion sobre ${label}`}
                                >
                                    <CircleHelp className="h-3 w-3" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                                {helper}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <div className="shrink-0 text-lg font-bold leading-none" style={valueStyle}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
};
