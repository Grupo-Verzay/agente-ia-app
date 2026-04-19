'use client';

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useRouter } from 'next/navigation';
import { User, WorkflowNode } from "@prisma/client";
import { updateNode, deleteNode, updateUrlNode, updateDelayNode, deleteFileNode, updateNodeAiEnabled } from "@/actions/workflow-node-action";
import { ACCEPT_TYPES, baseActions, getAcceptTypeString, legacySeguimientoActions, optimizeFile, validateFileType } from "../helpers";
import { Action } from "../types";
import { NodeActions } from "./NodeActions";
import { cardBaseActions, cardSeguimientoActions } from "../helpers";

import {
  Card,
  CardHeader,
  CardContent
} from "@/components/ui/card";

import { toast } from "sonner";
import {
  GripVertical,
  MessageSquareIcon,
  Phone,
  UploadIcon,
} from "lucide-react";
import { TimeInput } from "@/components/shared/TimeInput";

import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { GenericTextarea } from "@/components/shared/GenericTextarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CSS } from '@dnd-kit/utilities'
import { SafeImage } from "@/components/custom/SafeImage";
import { Badge } from "@/components/ui/badge";
import { NodeDocumentViewer } from "@/components/shared/NodeDocumentViewer";

interface Props {
  workflowId: string;
  nodes: WorkflowNode;
  user: User;
};

const MAX_MESSAGE_LENGTH = 1000;

export const NodeCard = ({ nodes, workflowId, user }: Props) => {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isDraggingNode } = useSortable({ id: nodes.id })
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState(nodes.message);
  const [delay, setDelay] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDragging] = useState(false);
  const [iaEnabled, setIaEnabled] = useState(nodes.aiEnabled ?? false); // true = muestra el TimeInput al inicio
  const [isSavingAiEnabled, setIsSavingAiEnabled] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDraggingNode ? 0.5 : 1,
    cursor: 'grab',
  }

  const nodeType = nodes.tipo?.toLowerCase() as Action['type'];
  const baseType = nodeType.startsWith('seguimiento-')
    ? nodeType.split('-')[1] as Action['type']
    : nodeType;
  const isPauseNode = nodeType === 'node_pause';
  const isNotifyNode = nodeType === 'nodo-notify';
  const hasContent = nodeType === 'text' ? !!message : !!nodes.url;
  const allActions = [...baseActions, ...legacySeguimientoActions];
  const currentAction = allActions.find(
    (action) => action.type.toLowerCase() === nodeType
  );

  const allCardActions = [...cardBaseActions, ...cardSeguimientoActions];
  const currentCardAction = allCardActions.find(
    (action) => action.type.toLowerCase() === nodeType
  );

  const accept = baseType && ACCEPT_TYPES[baseType]
    ? ACCEPT_TYPES[baseType].join(',')
    : '*';

  // Mostrar "Seguimiento" en la etiqueta pero usar baseType para la lógica
  const isSeguimiento = nodeType.startsWith('seguimiento-');
  const labelSegumientoCategory = isSeguimiento
    ? `Seguimiento ${currentAction?.label.replace('Seguimiento ', '')}`
    : currentAction?.label;

  useEffect(() => {
    setIaEnabled(nodes.aiEnabled ?? false);
  }, [nodes.aiEnabled]);

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

  const handleDeleteNode = async () => {
    const toastId = `delete-${currentAction?.label}`;
    toast.loading(`Eliminando ${currentAction?.label}...`, { id: toastId });

    try {
      // Paso 1: Eliminar archivo y limpiar la URL (si aplica)
      if (nodes.url) {
        const fileRes = await deleteFileNode(nodes.url, nodes.id);

        if (!fileRes.success) {
          toast.error(fileRes.message, { id: toastId });
          return;
        }
      }
      // Paso 2: Eliminar el nodo
      const res = await deleteNode(nodes.id, workflowId);

      if (!res || !res.success) {
        toast.error(res?.message || "Error desconocido al eliminar el nodo.", { id: toastId });
        return;
      }

      toast.success(res.message, { id: toastId });
      router.refresh();

    } catch (error) {
      console.error("Error en eliminación:", error);
      toast.error(`Error eliminando el nodo: ${error instanceof Error ? error.message : error}`, {
        id: toastId,
      });
    }
  };

  const handleDeleteFile = async () => {
    const toastId = `delete-${currentAction?.type}`;
    toast.loading(`Eliminando ${currentAction?.type}...`, { id: toastId });

    try {
      const res = await deleteFileNode(nodes.url as string, nodes.id);
      if (!res) return;
      if (!res.success) return toast.error(res?.message, { id: toastId });
      toast.success(res?.message, { id: toastId });
      router.refresh();
    } catch (error) {
      toast.error(`Error eliminando el archivo: ${error}`, { id: toastId });
    }
  };

  // const handleCancelUpload = () => {
  //   setFile(null);
  // };

  const handleUpload = async (file: File) => {
    if (!file) {
      toast.error('No hay archivo seleccionado');
      return;
    }

    setIsUploading(true);
    const toastLoading = toast.loading('Subiendo archivo...');
    const nodeTypeIsImage = baseType === 'image';
    let blob;

    try {
      if (nodeTypeIsImage) {
        // 1. Optimizar el archivo (manejo correcto del tipo)
        const content = await file.arrayBuffer();
        const plainFile = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: Array.from(new Uint8Array(content)) // lo convertimos en array serializable
        };

        const optimizedFile = await optimizeFile(plainFile);
        let optimizedBuffer;

        optimizedBuffer = new Uint8Array(optimizedFile.buffer);
        blob = new Blob([optimizedBuffer], { type: optimizedFile.type });
      };
      // else {
      //   optimizedBuffer = new Uint8Array(optimizedFile.content);
      //   blob = new Blob([optimizedBuffer], { type: optimizedFile.type });
      // }

      // 2. Crear FormData
      const formData = new FormData();
      formData.append('file', (nodeTypeIsImage ? blob : file) as Blob); // usamos el blob optimizado para imagen
      formData.append('file', file);
      formData.append('userID', user.id);
      formData.append('workflowID', workflowId);

      // 3. Subir a la API
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());

      const { url } = await res.json();

      // 4. Actualizar nodo
      const result = await updateUrlNode(nodes.id, url);
      if (!result.success) throw new Error(result.message);

      toast.success(result.message, { id: toastLoading });
      router.refresh();

    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al subir el archivo multimedia',
        { id: toastLoading }
      );
    } finally {
      setIsUploading(false);
    }
  };

  /* Drag and drop events */
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFile = (file: File) => {
    if (!file) return;
    const isValid = validateFileType(file, baseType);
    if (!isValid) {
      const readableTypes = getAcceptTypeString(baseType);
      toast.error(`Tipo de archivo no válido. Se esperaba: ${baseType} (${readableTypes})`);
      return;
    }
    /* Implementación para subida de files automaticamente */
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
    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleTimeChange = (delay: string) => {
    setDelay(delay);
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
      toast.error(`Error actualizando IA: ${error}`, { id: toastId });
    } finally {
      setIsSavingAiEnabled(false);
    }
  };

  const handleOnBlurTime = async () => {
    if (!delay) return;
    if (parseInt(delay) === 0) return;

    try {
      //convierte los segundos
      // const delayInSeconds = convertToSeconds(delay);

      const res = await updateDelayNode(nodes.id, delay.toString());

      if (!res) return toast.error('404');
      if (!res.success) return toast.error(res?.message);

      toast.success(res?.message);

    } catch (error) {
      toast.error(`Error al actualizar un seguimiento. Contactese con nosotros. ${error}`)
    }
  };

  const renderContent = () => {
    if (isPauseNode) {
      return (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
          {/* Header: switch + título + descripción */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="airplane-mode"
                  checked={iaEnabled}
                  onCheckedChange={handleAiEnabled}
                  disabled={isSavingAiEnabled}
                  className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-400"
                />
                <Label
                  htmlFor="airplane-mode"
                  className="text-sm font-semibold"
                >
                  Activar IA
                </Label>
              </div>
            </div>
          </div>

          {/* Contenido: solo se muestra cuando está activado */}
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
        <GenericTextarea
          fileType={baseType}
          message={message}
          handleSave={handleSave}
          setIsEditing={setIsEditing}
          setMessage={handleChangeMessages}
          isPending={isPending}
          isEditing={isEditing}
        />
      )
    }

    // Para tipos de archivo (image, video, audio, documento)
    if (hasContent) {
      return (
        <div className="flex items-center w-full rounded">
          {baseType === 'image' && (
            <SafeImage src={nodes.url!} alt="Contenido del nodo" className="rounded-md w-full h-auto object-contain" />
          )}
          {baseType === 'video' && (
            <video src={nodes.url!} controls className="rounded-md w-full h-auto" />
          )}
          {baseType === 'audio' && (
            <audio src={nodes.url!} controls className="w-full" />
          )}
          {baseType === 'document' && (
            <NodeDocumentViewer
              url={nodes.url!}
              filename={nodes.nameFile}
              caption={nodes.nameFile ?? nodes.message}
            />
          )}
        </div>
      );
    }

    // Si no hay content, mostrar opción de subir archivo
    return (
      <div className="flex flex-col gap-2 w-full">
        <div
          className={`flex items-center justify-center w-full h-32 border-2 rounded-lg cursor-pointer transition 
          ${isDraggingFile ? 'border-primary bg-primary/10' : 'border-dashed border-muted-foreground/50 bg-muted/50'}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="flex flex-col items-center justify-center w-full px-2">
            <UploadIcon className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center mt-1">
              {isDraggingFile ? 'Suelta el archivo aquí' : 'Arrastra o haz click'}
            </p>
            {file && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground truncate w-full px-2">
                    {file.name}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{file.name}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <Input
            id="file-input"
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileChange}
          />
        </div>

        {/* {file && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelUpload}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? "Subiendo..." : "Subir"}
            </Button>
          </div>
        )} */}
      </div>
    );
  };

  const handleChangeMessages = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    // Verificación de seguridad (TypeScript ya valida el tipo, pero es redundante por si el evento es manualmente disparado)
    if (!e?.target) {
      console.error('Evento inválido o sin target');
      return;
    }

    const { value } = e.target;

    if (value.length > MAX_MESSAGE_LENGTH) {
      toast.info(`El mensaje excede el límite de ${MAX_MESSAGE_LENGTH} caracteres`)
      return;
    }

    setMessage(value);
  };

  return (
    <div className="flex items-center justify-center p-1" ref={setNodeRef} style={style}>
      <Card className="shadow-md border-border rounded-2xl min-w-[300px] max-w-[300px] transition-all duration-300 hover:shadow-lg hover:scale-105">
        <CardHeader className="relative flex items-center p-3">
          <div className="absolute top-0 left-1">
            <button
              className="p-1 rounded hover:bg-muted cursor-grab active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {/* Badge tipo de mensaje */}
          <div className={`absolute -top-4 flex items-center space-x-2 ${currentCardAction?.bg || 'bg-background'} rounded-md px-3 py-1 shadow-md`}>
            {currentCardAction?.icon || (
              <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs font-bold uppercase text-white">
              {`${isSeguimiento ? labelSegumientoCategory : currentCardAction?.label}` || "Tipo desconocido"}
            </span>
          </div>
          <div className="absolute top-0 right-1">
            <NodeActions
              fileType={baseType}
              onDeleteFile={() => handleDeleteFile()}
              onDeleteNode={() => handleDeleteNode()}
            />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {renderContent()}
          {!isNotifyNode && !isPauseNode && baseType !== 'text' && baseType !== 'document' && baseType !== 'audio' &&
            <div className="flex w-full mt-2">
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
          }
        </CardContent>
      </Card>
    </div>
  );
};

