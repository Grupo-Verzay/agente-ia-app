'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { createLowlight, common } from 'lowlight'
import { useEffect, useRef } from 'react'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, Code2,
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, AlignLeft, AlignCenter, AlignRight, Undo, Redo, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

const lowlight = createLowlight(common)

interface Props {
  initialContent?: object
  onChange: (content: object) => void
  editable?: boolean
}

export default function TiptapEditor({ initialContent, onChange, editable = true }: Props) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: 'Escribe algo, o usa / para insertar bloques...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Image,
      Link.configure({ openOnClick: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialContent ?? '',
    editable,
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getJSON())
    },
  })

  useEffect(() => {
    return () => { editor?.destroy() }
  }, [editor])

  if (!editor) return null

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} />
      <div className="tiptap-scroll flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="tiptap-content h-full min-h-[300px] px-2 py-1 focus:outline-none"
        />
      </div>
      <style>{tiptapStyles}</style>
    </div>
  )
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border/50 px-2 py-1 shrink-0">
      <ToolbarToggle pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código inline">
        <Code className="h-3.5 w-3.5" />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarToggle pressed={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarToggle pressed={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
        <List className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Lista de tareas">
        <CheckSquare className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
        <Quote className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Bloque de código">
        <Code2 className="h-3.5 w-3.5" />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarToggle pressed={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinear izquierda">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrar">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinear derecha">
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarToggle pressed={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador">
        <Minus className="h-3.5 w-3.5" />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarToggle pressed={false} onClick={() => editor.chain().focus().undo().run()} title="Deshacer" disabled={!editor.can().undo()}>
        <Undo className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle pressed={false} onClick={() => editor.chain().focus().redo().run()} title="Rehacer" disabled={!editor.can().redo()}>
        <Redo className="h-3.5 w-3.5" />
      </ToolbarToggle>
    </div>
  )
}

function ToolbarToggle({
  pressed, onClick, title, children, disabled,
}: {
  pressed: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}

const tiptapStyles = `
  .tiptap-content .ProseMirror {
    outline: none;
    min-height: 300px;
  }
  .tiptap-content .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: hsl(var(--muted-foreground));
    pointer-events: none;
    height: 0;
  }
  .tiptap-content .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; margin: 1rem 0 0.5rem; line-height: 1.2; }
  .tiptap-content .ProseMirror h2 { font-size: 1.4rem; font-weight: 600; margin: 0.875rem 0 0.4rem; line-height: 1.3; }
  .tiptap-content .ProseMirror h3 { font-size: 1.15rem; font-weight: 600; margin: 0.75rem 0 0.35rem; line-height: 1.4; }
  .tiptap-content .ProseMirror p { margin: 0.4rem 0; line-height: 1.7; }
  .tiptap-content .ProseMirror ul, .tiptap-content .ProseMirror ol { padding-left: 1.5rem; margin: 0.5rem 0; }
  .tiptap-content .ProseMirror li { margin: 0.2rem 0; line-height: 1.6; }
  .tiptap-content .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.5rem; }
  .tiptap-content .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
  .tiptap-content .ProseMirror ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.3rem; cursor: pointer; }
  .tiptap-content .ProseMirror blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1rem; margin: 0.75rem 0; color: hsl(var(--muted-foreground)); font-style: italic; }
  .tiptap-content .ProseMirror code { background: hsl(var(--muted)); border-radius: 0.25rem; padding: 0.1em 0.35em; font-size: 0.875em; font-family: monospace; }
  .tiptap-content .ProseMirror pre { background: hsl(var(--muted)); border-radius: 0.5rem; padding: 1rem; margin: 0.75rem 0; overflow-x: auto; }
  .tiptap-content .ProseMirror pre code { background: none; padding: 0; font-size: 0.85em; }
  .tiptap-content .ProseMirror hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 1.5rem 0; }
  .tiptap-content .ProseMirror strong { font-weight: 700; }
  .tiptap-content .ProseMirror em { font-style: italic; }
  .tiptap-content .ProseMirror u { text-decoration: underline; }
  .tiptap-content .ProseMirror s { text-decoration: line-through; }
  .tiptap-content .ProseMirror a { color: hsl(var(--primary)); text-decoration: underline; cursor: pointer; }
`
