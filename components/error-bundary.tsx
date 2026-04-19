"use client";

import React from "react";
import ErrorScreen, { ErrorReportPayload } from "./shared/ErrorScreen";

type State = {
    hasError: boolean;
    error?: unknown;
    componentStack?: string;
    triedChunkRecovery?: boolean;
};

type Props = {
    children: React.ReactNode;
    buildInfo?: { version?: string; gitSha?: string };
    onReport?: (data: ErrorReportPayload) => Promise<void> | void;
    onHomeHref?: string; // opcional: a dónde mandar al home
};

export default class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: undefined, componentStack: undefined, triedChunkRecovery: false };
    }

    static getDerivedStateFromError(error: unknown): Partial<State> {
        return { hasError: true, error };
    }

    async componentDidCatch(error: any, info: { componentStack: string }) {
        this.setState({ componentStack: info?.componentStack });

        // Intento automático de recuperación cuando es un fallo de carga de chunks (deploy + cliente con cache vieja)
        if (error?.name === "ChunkLoadError" || /Loading chunk [\d]+ failed/i.test(String(error))) {
            if (!this.state.triedChunkRecovery) {
                this.setState({ triedChunkRecovery: true });
                await this.tryChunkRecovery();
            }
        }

        // Aquí podrías loguear en tu sistema (Sentry/tu API) si gustas
        // console.error("Captured by ErrorBoundary:", error, info);
    }

    private async tryChunkRecovery() {
        try {
            // Limpia Cache Storage (si existiera)
            if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
            // Actualiza SW si existiera
            if ("serviceWorker" in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                await reg?.update();
            }
        } catch {
            // Silencio: es best-effort
        } finally {
            // Fuerza recarga
            window.location.reload();
        }
    }

    private handleRetry = () => {
        // Estrategia simple: recargar. Si prefieres, puedes intentar un soft-retry de la vista.
        window.location.reload();
    };

    private handleHome = () => {
        if (this.props.onHomeHref) {
            window.location.assign(this.props.onHomeHref);
        } else {
            window.location.assign("/");
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <ErrorScreen
                    error={this.state.error}
                    componentStack={this.state.componentStack}
                    onRetry={this.handleRetry}
                    onHome={this.handleHome}
                    onReport={this.props.onReport}
                    buildInfo={this.props.buildInfo}
                />
            );
        }
        return this.props.children;
    }
}
