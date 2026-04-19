'use client';

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from 'next/navigation';
import { updateNode, deleteNode, updateUrlNode, updateDelayNode, deleteFileNode, updateInactivityNode, updateNodeAiEnabled } from "@/actions/workflow-node-action";
import { ACCEPT_TYPES, getAcceptTypeString, optimizeFile, validateFileType } from "../helpers";
import { NodeActions } from "./NodeActions";
import { Card, CardHeader, CardFooter, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquareIcon, Phone, UploadIcon } from "lucide-react";
import { TimeInput } from "@/components/shared/TimeInput";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GenericTextarea } from "@/components/shared/GenericTextarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Action, ACTIONS, CARD_ACTIONS, MAX_MESSAGE_LENGTH, PropsNodeCard } from "@/types/workflow-node";
import { EmbeddingNode } from '.';
import { SafeImage } from "@/components/custom/SafeImage";
import { Badge } from "@/components/ui/badge";
import { NodeDocumentViewer } from "@/components/shared/NodeDocumentViewer";

export const NodeCard = ({ nodes, workflowId, user, targetHandle }: PropsNodeCard) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState(nodes.message);
  const [delay, setDelay] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDraggingFile, setIsDragging] = useState(false);
  const [inactivity, setInactivity] = useState(nodes.inactividad ?? false);
  const [iaEnabled, setIaEnabled] = useState(nodes.aiEnabled ?? false);
  const [isSavingAiEnabled, setIsSavingAiEnabled] = useState(false);

  const nodeType = nodes.tipo?.toLowerCase() as Action['type'];
  const baseType = nodeType.startsWith('seguimiento-')
    ? nodeType.split('-')[1] as Action['type']
    : nodeType;
  const isIntention = nodeType === 'intention';
  const isPauseNode = nodeType === 'node_pause';
  const isNotifyNode = nodeType === 'nodo-notify';
  const hasContent = nodeType === 'text' ? !!message : !!nodes.url;
  const currentAction = ACTIONS.find((a) => a.type === nodeType);
  const currentCardAction = CARD_ACTIONS.find((a) => a.type === nodeType);

  const IconCard = currentCardAction?.icon ?? MessageSquareIcon;

  const accept = baseType && ACCEPT_TYPES[baseType] ? ACCEPT_TYPES[baseType].join(',') : '*';

  const isSeguimiento = nodeType.startsWith('seguimiento-');
  const labelSegumientoCategory = isSeguimiento
    ? `Seguimiento ${currentAction?.label.replace('Seguimiento ', '')}`
    : currentAction?.label;

  useEffect(() => {
    setIaEnabled(nodes.aiEnabled ?? false);
  }, [nodes.aiEnabled]);

  const handleInactivity = async (checked: boolean) => {
    if (loading) return;
    setLoading(true);
    setInactivity(checked);
    const toastId = `update-inactivity`;

    try {
      const res = await updateInactivityNode(nodes.id, checked);
      if (!res?.success) return toast.error(res?.message ?? 'Error', { id: toastId });
      toast.success(res.message, { id: toastId });
    } catch (error) {
      toast.error(`Server err: ${error}`, { id: toastId });
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  const handleSave = () => {
    if (message !== nodes.message) {
      startTransition(async () => {
        try {
          await updateNode(nodes.id, message);
          toast.success('Mensaje actualizado correctamente');
        } catch (error) {
          toast.error(`Error actualizando el nodo: ${error}`);
        }
      });
    }
    setIsEditing(false);
  };

  const handleAiEnabled = async (checked: boolean) => {
    if (isSavingAiEnabled) return;

    const previousValue = iaEnabled;
    setIaEnabled(checked);
    setIsSavingAiEnabled(true);

    const toastId = `update-ai-enabled-${nodes.id}`;

    try {
      const res = await updateNodeAiEnabled(nodes.id, checked);
      if (!res?.success) {
        setIaEnabled(previousValue);
        return toast.error(res?.message ?? 'Error', { id: toastId });
      }

      toast.success(res.message, { id: toastId });
    } catch (error) {
      setIaEnabled(previousValue);
      toast.error(`Server err: ${error}`, { id: toastId });
    } finally {
      setIsSavingAiEnabled(false);
    }
  };

  const handleDeleteNode = async () => {
    const toastId = `delete-${currentAction?.label}`;
    toast.loading(`Eliminando ${currentAction?.label}...`, { id: toastId });

    try {
      if (nodes.url) {
        const fileRes = await deleteFileNode(nodes.url, nodes.id);
        if (!fileRes.success) return toast.error(fileRes.message, { id: toastId });
      }

      const res = await deleteNode(nodes.id, workflowId);
      if (!res?.success) return toast.error(res?.message ?? "Error desconocido", { id: toastId });

      toast.success(res.message, { id: toastId });
      router.refresh();
    } catch (error) {
      toast.error(`Error eliminando el nodo: ${error instanceof Error ? error.message : error}`, { id: toastId });
    }
  };

  const handleDeleteFile = async () => {
    const toastId = `delete-${currentAction?.type}`;
    toast.loading(`Eliminando ${currentAction?.type}...`, { id: toastId });

    try {
      const res = await deleteFileNode(nodes.url as string, nodes.id);
      if (!res?.success) return toast.error(res?.message ?? 'Error', { id: toastId });
      toast.success(res.message, { id: toastId });
      router.refresh();
    } catch (error) {
      toast.error(`Error eliminando el archivo: ${error}`, { id: toastId });
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return toast.error('No hay archivo seleccionado');

    setIsUploading(true);
    const toastLoading = toast.loading('Subiendo archivo...');
    const nodeTypeIsImage = baseType === 'image';
    let blob: Blob | undefined;

    try {
      if (nodeTypeIsImage) {
        const content = await file.arrayBuffer();
        const plainFile = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: Array.from(new Uint8Array(content))
        };

        const optimizedFile = await optimizeFile(plainFile);
        const optimizedBuffer = new Uint8Array(optimizedFile.buffer);
        blob = new Blob([optimizedBuffer], { type: optimizedFile.type });
      }

      const formData = new FormData();
      formData.append('file', (nodeTypeIsImage ? blob : file) as Blob);
      formData.append('file', file);
      formData.append('userID', user.id);
      formData.append('workflowID', workflowId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());

      const { url } = await res.json();

      const result = await updateUrlNode(nodes.id, url);
      if (!result.success) throw new Error(result.message);

      toast.success(result.message, { id: toastLoading });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al subir el archivo', { id: toastLoading });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };

  const handleFile = (file: File) => {
    if (!file) return;
    const isValid = validateFileType(file, baseType);
    if (!isValid) {
      const readableTypes = getAcceptTypeString(baseType);
      toast.error(`Tipo de archivo no válido. Se esperaba: ${baseType} (${readableTypes})`);
      return;
    }
    handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  };

  const handleTimeChange = (delay: string) => setDelay(delay);

  const handleOnBlurTime = async () => {
    if (!delay) return;
    if (parseInt(delay) === 0) return;

    try {
      const res = await updateDelayNode(nodes.id, delay.toString());
      if (!res?.success) return toast.error(res?.message ?? 'Error');
      toast.success(res.message);
    } catch (error) {
      toast.error(`Error al actualizar un seguimiento. ${error}`);
    }
  };

  const handleChangeMessages = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (!e?.target) return;
    const { value } = e.target;
    if (value.length > MAX_MESSAGE_LENGTH) return toast.info(`El mensaje excede ${MAX_MESSAGE_LENGTH} caracteres`);
    setMessage(value);
  };

  const fileInputId = `file-input-${nodes.id}`; //  ID único por nodo

  const renderContent = () => {
    if (isPauseNode) {
      return (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3 nodrag">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  id={`ai-enabled-${nodes.id}`}
                  checked={iaEnabled}
                  onCheckedChange={handleAiEnabled}
                  disabled={isSavingAiEnabled}
                  className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-400"
                />
                <Label htmlFor={`ai-enabled-${nodes.id}`} className="text-sm font-semibold">
                  Activar IA
                </Label>
              </div>
            </div>
          </div>

          {iaEnabled && (
            <div className="pt-1">
              <TimeInput
                className="text-xs text-muted-foreground"
                onChange={handleTimeChange}
                onBlur={handleOnBlurTime}
                currentValue={nodes.delay || "minutes-0"}
              />
            </div>
          )}
        </div>
      );
    }

    if (isNotifyNode) return (
      <div className="flex flex-1 justify-center">
        <Badge variant="secondary">
          <Phone className="w-3.5 h-3.5 mr-1.5" />
          <p className="text-muted-foreground text-sm">
            {user.notificationNumber}
          </p>
        </Badge>
      </div>
    );

    if (baseType === 'text') {
      return (
        <div className="nodrag">
          <GenericTextarea
            fileType={baseType}
            message={message}
            handleSave={handleSave}
            setIsEditing={setIsEditing}
            setMessage={handleChangeMessages}
            isPending={isPending}
            isEditing={isEditing}
          />
        </div>
      );
    }

    if (isIntention) {
      return <EmbeddingNode node={nodes as any} />;
    }

    if (hasContent) {
      return (
        <div className="flex items-center w-full rounded nodrag">
          {baseType === 'image' && <SafeImage src={nodes.url!} alt="Contenido" className="rounded-md w-full h-auto object-contain" />}
          {baseType === 'video' && <video src={nodes.url!} controls className="rounded-md w-full h-auto" />}
          {baseType === 'audio' && <audio src={nodes.url!} controls className="w-full" />}
          {baseType === 'document' && (
            <NodeDocumentViewer
              url={nodes.url!}
              filename={nodes.nameFile}
              caption={nodes.nameFile ?? nodes.message}
              className="nodrag"
            />
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 w-full nodrag">
        <div
          className={`flex items-center justify-center w-full h-32 border-2 rounded-lg cursor-pointer transition 
          ${isDraggingFile ? 'border-primary bg-primary/10' : 'border-dashed border-muted-foreground/50 bg-muted/50'}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.getElementById(fileInputId)?.click()}
        >
          <div className="flex flex-col items-center justify-center w-full px-2">
            <UploadIcon className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center mt-1">
              {isDraggingFile ? 'Suelta el archivo aquí' : 'Arrastra o haz click'}
            </p>

            {file && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground truncate w-full px-2">{file.name}</p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{file.name}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <Input
            id={fileInputId}
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileChange}
          />
        </div>
      </div>
    );
  };
  return (
    <div className="flex items-center justify-center p-1">
      <Card className="shadow-md border-border rounded-2xl min-w-[300px] max-w-[300px] transition-all duration-300 hover:shadow-lg">
        <CardHeader className="relative flex items-center p-3">
          {/* HANDLE WORKFLOW */}
          {targetHandle}

          <div className={`absolute -top-4 flex items-center space-x-2 ${currentCardAction?.bg || 'bg-background'} rounded-md px-3 py-1 shadow-md`}>
            {<IconCard className={currentCardAction?.iconClassName ?? "h-4 w-4"} />}
            <span className="text-xs font-bold uppercase text-white">
              {`${isSeguimiento ? labelSegumientoCategory : currentCardAction?.label}` || "Tipo desconocido"}
            </span>
          </div>

          <div className="absolute top-0 right-1 nodrag">
            <NodeActions
              fileType={baseType}
              onDeleteFile={handleDeleteFile}
              onDeleteNode={handleDeleteNode}
            />
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {renderContent()}

          {!isNotifyNode && !isPauseNode && baseType !== 'text' && baseType !== 'document' && baseType !== 'audio' && !isIntention && (
            <div className="flex w-full mt-2 nodrag">
              <GenericTextarea
                fileType={baseType}
                message={message}
                handleSave={handleSave}
                setIsEditing={setIsEditing}
                setMessage={handleChangeMessages}
                isPending={isPending}
                isEditing={isEditing}
              />
            </div>
          )}

          {isSeguimiento && (
            <div className="flex items-center gap-1 pt-2 text-sm nodrag">
              <Switch
                id={`inactividad-${nodes.id}`}
                checked={inactivity}
                onCheckedChange={handleInactivity}
                disabled={loading}
                className="scale-75"
              />
              <Label htmlFor={`inactividad-${nodes.id}`}>Activar Inactividad</Label>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">?</TooltipTrigger>
                  <TooltipContent>
                    <p>Seguimiento solo si no responden</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </CardContent>

        {isSeguimiento && (
          <>
            <Separator />
            <CardFooter className="pt-2 nodrag">
              <TimeInput
                className="text-xs text-muted-foreground"
                onChange={handleTimeChange}
                onBlur={handleOnBlurTime}
                currentValue={nodes.delay || 'minutes-0'}
              />
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
};
