'use client';

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from 'next/navigation';
import { updateNode, deleteNode, updateUrlNode, updateDelayNode, deleteFileNode, updateInactivityNode, updateNodeAiEnabled, updateNodeNotifyPhones, updateNodeMenuOptions } from "@/actions/workflow-node-action";
import { MAX_OPCIONES_MENU, buildMenuPreview, parseMenuOptions } from "@/lib/workflow-menu";
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
import { Action, ACTIONS, CARD_ACTIONS, MAX_MESSAGE_LENGTH, PropsNodeCard, isAutomationNodeType } from "@/types/workflow-node";
import { EmbeddingNode } from '.';
import { AutomationNodeConfig } from "./AutomationNodeConfig";
import { SafeImage } from "@/components/custom/SafeImage";
import { Badge } from "@/components/ui/badge";
import { NodeDocumentViewer } from "@/components/shared/NodeDocumentViewer";

export const NodeCard = ({ nodes, workflowId, user, targetHandle }: PropsNodeCard) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState(nodes.message);
  // Nodo "Notificar": a quien avisa este nodo en concreto.
  const [telefonosNotificar, setTelefonosNotificar] = useState(
    (nodes as { notifyPhones?: string | null }).notifyPhones ?? '',
  );
  // Nodo "Menu": las opciones, una por linea.
  const [opcionesMenu, setOpcionesMenu] = useState(
    (nodes as { menuOptions?: string | null }).menuOptions ?? '',
  );
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
  const isMenuNode = nodeType === 'menu';
  const isAutomationNode = isAutomationNodeType(nodeType);
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

  /**
   * Guarda al salir del campo, no en cada tecla: escribir un numero son doce
   * pulsaciones y no hacen falta doce escrituras en la base.
   */
  const guardarTelefonosNotificar = async () => {
    const anterior = (nodes as { notifyPhones?: string | null }).notifyPhones ?? '';
    if (telefonosNotificar.trim() === anterior.trim()) return;

    const res = await updateNodeNotifyPhones(nodes.id, telefonosNotificar);
    if (!res.success) {
      toast.error(res.message);
      // Se vuelve a lo que habia: dejar en pantalla algo que no se guardo es
      // peor que perder lo tecleado, porque parece guardado.
      setTelefonosNotificar(anterior);
      return;
    }
    toast.success(res.message);
    router.refresh();
  };

  const guardarOpcionesMenu = async () => {
    const anterior = (nodes as { menuOptions?: string | null }).menuOptions ?? '';
    if (opcionesMenu.trim() === anterior.trim()) return;

    const res = await updateNodeMenuOptions(nodes.id, opcionesMenu);
    if (!res.success) {
      toast.error(res.message);
      setOpcionesMenu(anterior);
      return;
    }
    toast.success(res.message);
    // Hace falta refrescar: al cambiar el numero de opciones cambian los
    // conectores del nodo, y se dibujan a partir de lo guardado.
    router.refresh();
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

  /** El texto del mensaje, con su tope de largo. */
  const aplicarMensaje = (value: string) => {
    if (value.length > MAX_MESSAGE_LENGTH) return toast.info(`El mensaje excede ${MAX_MESSAGE_LENGTH} caracteres`);
    setMessage(value);
  };

  const handleChangeMessages = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (!e?.target) return;
    aplicarMensaje(e.target.value);
  };

  // La pregunta del menu se escribe en un <input>, no en un <textarea>, asi que
  // necesita su propio manejador; el tope de largo es el mismo.
  const alEscribirPreguntaMenu = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e?.target) return;
    aplicarMensaje(e.target.value);
  };

  const fileInputId = `file-input-${nodes.id}`; //  ID único por nodo

  const renderContent = () => {
    if (isAutomationNode) {
      return <AutomationNodeConfig node={nodes} user={user} />;
    }

    if (nodeType === 'guardar-ficha') {
      return (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3 nodrag">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Guarda los datos del contacto en su ficha y los sincroniza a Google Sheets.
            No envía nada al cliente.
          </p>
          <div className="flex items-center gap-2">
            <Switch
              id={`ia-ficha-${nodes.id}`}
              checked={iaEnabled}
              onCheckedChange={handleAiEnabled}
              disabled={isSavingAiEnabled}
              className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-400"
            />
            <Label htmlFor={`ia-ficha-${nodes.id}`} className="text-sm font-semibold">
              Capturar datos con IA
            </Label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {iaEnabled
              ? 'El bot extraerá de la conversación los campos de tu ficha de contacto (email, ciudad, etc.).'
              : 'Solo se guardará lo ya conocido (teléfono y nombre).'}
          </p>
          {iaEnabled && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Instrucción para la IA (opcional)
              </Label>
              <textarea
                value={message}
                onChange={handleChangeMessages}
                onBlur={handleSave}
                placeholder="Ej: el negocio vende seguros; captura el tipo de póliza y el presupuesto que menciona el cliente."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">
                Da contexto del negocio para una mejor extracción. Los campos que se guardan
                son los de tu ficha de contacto.
              </p>
            </div>
          )}
        </div>
      );
    }

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

    if (isMenuNode) {
      const opciones = parseMenuOptions(opcionesMenu);
      return (
        <div className="nodrag flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Pregunta</Label>
            <Input
              value={message}
              onChange={alEscribirPreguntaMenu}
              onBlur={() => handleSave()}
              placeholder="Ej: ¿En qué te podemos ayudar?"
              className="h-8 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Opciones — una por línea</Label>
            <textarea
              value={opcionesMenu}
              onChange={(e) => setOpcionesMenu(e.target.value)}
              onBlur={guardarOpcionesMenu}
              rows={4}
              placeholder={'Ventas\nSoporte\nHorarios'}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
            />
            {/* La numeracion la pone el sistema, no se escribe: asi el numero
                que ve el cliente y el conector del nodo son siempre el mismo. */}
            <p className="text-[11px] text-muted-foreground">
              {opciones.length === 0
                ? 'Sin opciones el menú no puede ramificar.'
                : `${opciones.length} de ${MAX_OPCIONES_MENU}. El número lo pone el sistema.`}
            </p>
          </div>

          {opciones.length > 0 && (
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Así lo recibe el cliente
              </p>
              <p className="whitespace-pre-wrap text-xs text-foreground">
                {buildMenuPreview(message ?? '', opciones)}
              </p>
            </div>
          )}
        </div>
      );
    }

    if (isNotifyNode) return (
      <div className="nodrag flex flex-col gap-1.5">
        <Label className="text-xs">Avisar a</Label>
        <Input
          value={telefonosNotificar}
          onChange={(e) => setTelefonosNotificar(e.target.value)}
          onBlur={guardarTelefonosNotificar}
          placeholder={user.notificationNumber ?? 'Ej: 573001234567'}
          className="h-8 text-sm"
        />
        {/* Vacio no es un error: el nodo cae en los numeros de la cuenta, que es
            como se comportaba antes de poder escribirlos aqui. Se dice, para que
            nadie crea que dejarlo en blanco apaga el aviso. */}
        <p className="text-[11px] text-muted-foreground">
          {telefonosNotificar.trim()
            ? 'Separa varios con coma.'
            : (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                Vacío: avisa a los números de la cuenta.
              </span>
            )}
        </p>
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
      return <EmbeddingNode node={nodes} />;
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
              fileType={isAutomationNode ? 'text' : baseType}
              onDeleteFile={handleDeleteFile}
              onDeleteNode={handleDeleteNode}
            />
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {renderContent()}

          {!isNotifyNode && !isMenuNode && !isPauseNode && !isAutomationNode && nodeType !== 'guardar-ficha' && baseType !== 'text' && baseType !== 'document' && baseType !== 'audio' && !isIntention && (
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
