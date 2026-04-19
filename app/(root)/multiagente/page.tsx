"use client";

const MultiagentePage = () => {
    const url = "https://multiagente.ia-app.com";

    return (
        <iframe
            width="100%"
            height="100%"
            src={url}
            allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
        />
    );
};

export default MultiagentePage; 