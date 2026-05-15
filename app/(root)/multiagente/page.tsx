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
                top: 0,
                left: leftOffset,
                right: 0,
                bottom: 0,
                zIndex: 9,
                overflow: "hidden",
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
