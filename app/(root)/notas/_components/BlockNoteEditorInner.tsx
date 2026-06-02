'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { Block } from '@blocknote/core'
import { useEffect, useRef } from 'react'

interface Props {
  initialContent?: Block[]
  onChange: (blocks: Block[]) => void
  editable?: boolean
}

export default function BlockNoteEditorInner({ initialContent, onChange, editable = true }: Props) {
  const editor = useCreateBlockNote({
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
  })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    return editor.onChange(() => {
      onChangeRef.current(editor.document as Block[])
    })
  }, [editor])

  return (
    <div className="bn-container-wrapper h-full overflow-y-auto">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        className="h-full"
      />
    </div>
  )
}
