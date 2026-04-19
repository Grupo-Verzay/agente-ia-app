"use client";

import { type CSSProperties } from "react";
import { CircleHelp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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
        ? ({
              borderColor: withAlpha("52"),
              backgroundColor: withAlpha("12"),
          } as CSSProperties)
        : undefined;

    const labelStyle = color ? ({ color: withAlpha("CC") } as CSSProperties) : undefined;
    const valueStyle = color ? ({ color } as CSSProperties) : undefined;
    const iconStyle = color
        ? ({
              color,
              borderColor: withAlpha("5C"),
              backgroundColor: withAlpha("16"),
          } as CSSProperties)
        : undefined;
    const helperButtonStyle = color
        ? ({ color: withAlpha("B3") } as CSSProperties)
        : undefined;

    return (
        <Card className="border-2 bg-background/60 shadow-sm" style={cardStyle}>
            <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span
                            className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground"
                            style={labelStyle}
                        >
                            {label}
                        </span>
                        {helper ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:opacity-100"
                                        style={helperButtonStyle}
                                        aria-label={`Informacion sobre ${label}`}
                                    >
                                        <CircleHelp className="h-3.5 w-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="max-w-56 text-xs"
                                >
                                    {helper}
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </div>
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-muted-foreground"
                        style={iconStyle}
                    >
                        {icon}
                    </div>
                </div>
                <div className="text-xl font-semibold leading-none" style={valueStyle}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
};
