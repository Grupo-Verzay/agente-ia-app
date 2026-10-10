// Los adjuntos de una NOTA INTERNA con los componentes de VERDAD: la burbuja
// (`window.__burbujas`: lo que se ve al abrir la nota) y la caja de escribir en
// modo nota (`window.__caja`: lo que se puede adjuntar y guardar). Las acciones
// de servidor están mudas; lo que hace la caja se anota en `window.__eventos`.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
// Estos dos nombres los resuelve el banco: los componentes de HOY o, con
// `MODO=roto`, los de `ANTES_REF`.
import { InternalNoteBubble } from "componente-de-la-burbuja";
import { ChatInputBar } from "componente-de-la-caja";

const w = window as any;
w.__eventos = [];

function Caja({ inicial }: { inicial: any }) {
    const [noteMode, setNoteMode] = useState<boolean>(inicial.noteMode ?? true);
    const [input, setInput] = useState<string>(inicial.input ?? "");
    const [media, setMedia] = useState<any[]>(inicial.media ?? []);
    const [grabado, setGrabado] = useState<any>(inicial.recordedAudio ?? null);
    const ref = useRef<HTMLTextAreaElement>(null);
    return (
        <div style={{ maxWidth: 720, margin: "24px auto" }} data-caja="">
            <ChatInputBar
                input={input}
                composeMediaList={media}
                replyTo={null}
                isRecording={false}
                recordSecs={0}
                recordedAudio={grabado}
                isSending={inicial.enviando ?? false}
                session={{ id: 1, status: false } as any}
                quickReplies={[]}
                workflows={[]}
                textareaRef={ref}
                slashOpen={false}
                slashSuggestions={[]}
                onInputChange={(e) => setInput(e.target.value)}
                onKeyPress={() => {}}
                onAddComposeMedia={(m) => setMedia((p) => (p.length >= 4 ? p : [...p, m]))}
                onRemoveComposeMedia={(i) => setMedia((p) => p.filter((_, k) => k !== i))}
                onClearReplyTo={() => {}}
                onStartRecording={() => {}}
                onStopRecordingAndPreview={() => {}}
                onCancelRecording={() => setGrabado(null)}
                onSend={() => w.__eventos.push({ tipo: "enviar-al-cliente" })}
                onApplySlashSuggestion={() => {}}
                onSendQuickReply={async () => ({ success: true } as any)}
                onSendWorkflow={async () => ({ success: true } as any)}
                onSessionMutate={() => {}}
                noteMode={noteMode}
                onToggleNoteMode={() => setNoteMode((v) => !v)}
                onSendNote={async (texto) => {
                    w.__eventos.push({ tipo: "guardar-nota", texto, archivos: media.map((m) => m.fileName) });
                    setInput("");
                    setMedia([]);
                }}
                onAdjuntarAudioALaNota={() => {
                    w.__eventos.push({ tipo: "adjuntar-audio" });
                    setMedia((p) => [...p, { mediatype: "audio", dataUrl: grabado.dataUrlWithPrefix, mimeType: "audio/webm", fileName: "audio-1.webm" }]);
                    setGrabado(null);
                }}
            />
            <Toaster />
        </div>
    );
}

const raiz = createRoot(document.getElementById("app")!);
if (w.__que === "caja") {
    raiz.render(<Caja inicial={w.__caja} />);
} else {
    raiz.render(
        <div style={{ maxWidth: 560, margin: "24px auto" }}>
            {(w.__burbujas as any[]).map((b, i) => (
                <div key={i} data-burbuja={i}>
                    <InternalNoteBubble
                        content={b.content}
                        authorName="Ana Asesora"
                        authorEmail="ana@banco.test"
                        timestamp="2026-10-09T17:30:00.000Z"
                        isOwn
                        adjuntos={b.adjuntos}
                        onDelete={() => {}}
                    />
                </div>
            ))}
        </div>,
    );
}
w.listo = true;
