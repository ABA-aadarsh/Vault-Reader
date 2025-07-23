'use client'
import type { ForwardedRef } from 'react'
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps
} from '@mdxeditor/editor'

import "./theme.css"

export default function InitializedMDXEditor({
  editorRef,
  ...props
}: { editorRef: ForwardedRef<MDXEditorMethods> | null } & MDXEditorProps) {
  return (
    <MDXEditor
      ref={editorRef}
      {...props}
    />
  )
}