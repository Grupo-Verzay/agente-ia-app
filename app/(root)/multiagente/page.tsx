"use client";

const MultiagentePage = () => {
    const url = "https://multiagente.ia-app.com";

    return (
        <div
            className="-mx-4 -mt-4 overflow-hidden"
            style={{ height: "calc(100vh - 4.5rem)" }}
        >
            <iframe
                src={url}
                allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                style={{ display: "block", width: "100%", height: "100%", border: "none" }}
            />
        </div>
    );
};

export default MultiagentePage;
