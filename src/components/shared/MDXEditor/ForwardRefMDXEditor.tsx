'use client'
import dynamic from 'next/dynamic'
import { forwardRef } from "react"
import { type MDXEditorMethods, type MDXEditorProps} from '@mdxeditor/editor'
const _Editor = dynamic(() => import('./InitializedMDXEditor'), {
  ssr: false
})
export const Editor = forwardRef<MDXEditorMethods, MDXEditorProps>((props, ref) => <_Editor {...props} editorRef={ref} />)
Editor.displayName = 'Editor'