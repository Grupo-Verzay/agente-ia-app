"use client";

import { useState, useEffect } from "react";

const MultiagentePage = () => {
    const url = "https://multiagente.ia-app.com";
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    if (isMobile) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                <iframe
                    src={url}
                    allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
                />
            </div>
        );
    }

    return (
        <div data-full-bleed className="relative h-full w-full overflow-hidden">
            <iframe
                src={url}
                allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    border: "none",
                }}
            />
        </div>
    );
};

export default MultiagentePage;
