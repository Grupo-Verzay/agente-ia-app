"use client";

import { useSidebar } from "@/components/ui/sidebar";

const MultiagentePage = () => {
    const url = "https://multiagente.ia-app.com";
    const { state } = useSidebar();

    const leftOffset = state === "collapsed" ? "3rem" : "16rem";

    return (
        <div
            style={{
                position: "fixed",
                top: "1rem",
                left: `calc(${leftOffset} + 1rem)`,
                right: "1rem",
                bottom: "1rem",
                zIndex: 9,
                overflow: "hidden",
                borderRadius: "1rem",
                boxShadow: "0 4px 24px 0 rgba(0,0,0,0.12)",
                transition: "left 200ms ease-linear",
            }}
        >
            <iframe
                src={url}
                allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "111.11%",
                    height: "111.11%",
                    border: "none",
                    transform: "scale(0.9)",
                    transformOrigin: "top left",
                }}
            />
        </div>
    );
};

export default MultiagentePage;
