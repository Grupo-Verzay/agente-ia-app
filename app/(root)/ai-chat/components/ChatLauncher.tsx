"use client";

import { cn } from "@/lib/utils";

export const ChatLauncher = ({
    open,
    onOpenChange,
    className,
    controlsId = "ai-chat-sheet",
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    className?: string;
    controlsId?: string;
}) => {
    const bubbleTransform = open
        ? "translateX(24px) translateY(4px) rotate(45deg)"
        : "translateX(0px) translateY(0px) rotate(0deg)";

    return (
        <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? "Cerrar chat" : "Abrir chat"}
            aria-controls={controlsId}
            aria-expanded={open}
            className={cn(
                "group relative flex h-[50px] w-[50px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                className,
            )}
        >
            <span className="sr-only">{open ? "Cerrar chat" : "Abrir chat"}</span>

            <span className="pointer-events-none absolute left-[5px] top-[5px] h-10 w-10 rounded-full bg-[#1950ff] shadow-[0_2.1px_1.3px_rgba(0,0,0,0.044),0_5.9px_4.2px_rgba(0,0,0,0.054),0_12.6px_9.5px_rgba(0,0,0,0.061),0_25px_20px_rgba(0,0,0,0.1)]" />

            <svg
                className="relative z-10 h-[50px] w-[50px]"
                width="100"
                height="100"
                viewBox="0 0 100 100"
                aria-hidden="true"
            >
                <g
                    className="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)]"
                    style={{
                        transform: bubbleTransform,
                        transformBox: "view-box",
                        transformOrigin: "50px 50px",
                    }}
                >
                    <path
                        className="fill-none stroke-white stroke-[2.75] [stroke-linecap:round] transition-[stroke-dashoffset] duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]"
                        style={{
                            strokeDasharray: "60 90",
                            strokeDashoffset: open ? 21 : -20,
                        }}
                        d="M30.7873 85.113394V46.556405C30.7873 41.101961 36.826342 35.342 40.898074 35.342H59.113981C63.73287 35.342 69.29995 40.103201 69.29995 46.784744"
                    />
                    <path
                        className="fill-none stroke-white stroke-[2.75] [stroke-linecap:round] transition-[stroke-dashoffset] duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]"
                        style={{
                            strokeDasharray: "67 87",
                            strokeDashoffset: open ? 30 : -18,
                        }}
                        d="M13.461999 65.039335H58.028684C63.483128 65.039335 69.243089 59.000293 69.243089 54.928561V45.605853C69.243089 40.986964 65.02087 35.419884 58.339327 35.419884"
                    />
                </g>

                <circle
                    className={cn(
                        "fill-white transition-transform duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                        open && "scale-0",
                    )}
                    style={{ transformOrigin: "50% 50%" }}
                    cx="42.5"
                    cy="50.7"
                    r="1.9"
                />
                <circle
                    className={cn(
                        "fill-white transition-transform duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                        open && "scale-0",
                    )}
                    style={{ transformOrigin: "50% 50%" }}
                    cx="49.9"
                    cy="50.7"
                    r="1.9"
                />
                <circle
                    className={cn(
                        "fill-white transition-transform duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                        open && "scale-0",
                    )}
                    style={{ transformOrigin: "50% 50%" }}
                    cx="57.3"
                    cy="50.7"
                    r="1.9"
                />
            </svg>
        </button>
    );
};
