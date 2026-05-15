"use client";

const MultiagentePage = () => {
    const url = "https://multiagente.ia-app.com";

    return (
        <div className="-m-4 flex-1 min-h-0 overflow-hidden">
            <iframe
                width="100%"
                height="100%"
                src={url}
                allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                style={{ display: "block", height: "100%", width: "100%" }}
            />
        </div>
    );
};

export default MultiagentePage;