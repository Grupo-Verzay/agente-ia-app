"use client";

import React from "react";
import ErrorScreen, { ErrorReportPayload } from "./shared/ErrorScreen";
import { anotarElFallo, comoSeLee, esRecuperable } from "@/lib/fallos-del-navegador";
import { hardReload } from "@/lib/hard-reload";
import { intentarRecuperar } from "@/lib/recuperar-del-desfase";

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

    componentDidCatch(error: any, info: { componentStack: string }) {
        this.setState({ componentStack: info?.componentStack });

        // Queda anotado ANTES de cualquier recarga: lo que no se anote aqui se
        // lo lleva la recarga por delante y no queda ni rastro que mirar.
        anotarElFallo("arbol", error, info?.componentStack ? "con componentStack" : undefined);

        // Intento automatico de recuperacion cuando es un desfase de version
        // (un despliegue mientras la pestaña estaba abierta). La lista de lo
        // que se cura recargando vive en `lib/`, no copiada aqui.
        const leido = comoSeLee(error);
        if (esRecuperable(leido.mensaje, leido.nombre) && !this.state.triedChunkRecovery) {
            this.setState({ triedChunkRecovery: true });
            intentarRecuperar(`error no capturado (error boundary): ${leido.nombre || leido.mensaje}`);
        }
    }

    private handleRetry = () => {
        // Recarga pidiendo el HTML de nuevo al servidor: si el error vino de un
        // desfase de versión, un reload normal puede devolver el documento viejo
        // desde caché y volver a fallar igual.
        hardReload('error no capturado (error boundary)');
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
