'use client'
import type { ForwardedRef } from 'react'
import { useState } from 'react'
import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  toolbarPlugin,
  directivesPlugin,
  insertDirective$,
  ButtonWithTooltip,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  ListsToggle,
  Separator,
  jsxPlugin,
  insertJsx$
} from '@mdxeditor/editor'
import { usePublisher } from '@mdxeditor/editor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileText, Plus, Quote } from 'lucide-react'

// Custom Page Button Component - Inline JSX component
function PageButton({ page }: { page: string }) {
  return (
    <button
      className="inline-flex items-center px-2 py-1 mx-1 text-xs font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90 transition-colors duration-200 cursor-pointer"
      onClick={() => {
        // Add your page navigation logic here
        console.log(`Navigate to page ${page}`)
        // Example: window.location.href = `/page/${page}`
      }}
    >
      <FileText className="w-3 h-3 mr-1" />
      Page {page}
    </button>
  )
}

// JSX Editor wrapper component
function PageButtonEditor({ mdastNode }: any) {
  const page = mdastNode.attributes?.page || '1'
  return <PageButton page={page} />
}

// Simple inline toolbar button component for inserting page buttons
function InsertPageButton() {
  const insertJsx = usePublisher(insertJsx$)
  const [isInputVisible, setIsInputVisible] = useState(false)
  const [pageNumber, setPageNumber] = useState('')

  const handleInsert = () => {
    if (pageNumber.trim()) {
      insertJsx({
        name: 'PageButton',
        kind: 'text',
        props: { page: pageNumber.trim() }
      })
      setPageNumber('')
      setIsInputVisible(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInsert()
    } else if (e.key === 'Escape') {
      setIsInputVisible(false)
      setPageNumber('')
    }
  }

  if (isInputVisible) {
    return (
      <div className="flex items-center gap-1">
        <Input
          placeholder="Page number"
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!pageNumber.trim()) {
              setIsInputVisible(false)
            }
          }}
          className="w-20 h-7 text-xs bg-background border-border"
          autoFocus
        />
        <Button
          size="sm"
          onClick={handleInsert}
          disabled={!pageNumber.trim()}
          className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
        >
          ✓
        </Button>
      </div>
    )
  }

  return (
    <ButtonWithTooltip title="Insert Page Button" onClick={() => setIsInputVisible(true)}>
      <FileText className="w-4 h-4" />
    </ButtonWithTooltip>
  )
}

// Custom Quote Block Button
function InsertCustomQuote() {
  const insertDirective = usePublisher(insertDirective$)
  const [open, setOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [quote, setQuote] = useState('')

  const handleInsert = () => {
    if (quote.trim()) {
      insertDirective({
        type: 'containerDirective',
        name: 'custom-quote',
        attributes: { author: author.trim() || 'Anonymous' }
      })
      setOpen(false)
      setAuthor('')
      setQuote('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ButtonWithTooltip title="Insert Custom Quote">
          <Quote className="w-4 h-4" />
        </ButtonWithTooltip>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Insert Custom Quote</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Add a styled quote block with attribution.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quote-text" className="text-sm font-medium text-foreground">
              Quote Text
            </Label>
            <textarea
              id="quote-text"
              placeholder="Enter the quote text..."
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-author" className="text-sm font-medium text-foreground">
              Author (Optional)
            </Label>
            <Input
              id="quote-author"
              placeholder="Enter author name..."
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="bg-background border-border text-foreground hover:bg-accent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInsert}
            disabled={!quote.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Insert Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Custom Quote Component
function CustomQuote({ author, children }: { author: string; children: any }) {
  return (
    <blockquote className="my-4 pl-6 border-l-4 border-primary bg-accent/20 py-3 pr-4 rounded-r-lg">
      <div className="text-foreground font-medium leading-relaxed mb-2">
        "{children}"
      </div>
      <footer className="text-sm text-muted-foreground">
        — {author}
      </footer>
    </blockquote>
  )
}

// Custom quote directive
const customQuoteDirective = {
  name: 'custom-quote',
  testNode: (node: any) => {
    return node.name === 'custom-quote'
  },
  attributes: ['author'],
  hasChildren: true,
  Editor: ({ mdastNode, lexicalNode, parentEditor }: any) => {
    return (
      <CustomQuote author={mdastNode.attributes?.author || 'Anonymous'}>
        {mdastNode.children?.[0]?.value || ''}
      </CustomQuote>
    )
  }
}

export default function InitializedMDXEditor({
  editorRef,
  ...props
}: { editorRef: ForwardedRef<MDXEditorMethods> | null } & MDXEditorProps) {
  return (
    <MDXEditor
      ref={editorRef}
      className="bg-background prose prose-invert outline-none border border-border rounded-lg"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        jsxPlugin({
          jsxComponentDescriptors: [
            {
              name: 'PageButton',
              kind: 'text',
              source: './components/PageButton',
              props: [
                { name: 'page', type: 'string' }
              ],
              hasChildren: false,
              Editor: PageButtonEditor
            }
          ]
        }),
        directivesPlugin({
          directiveDescriptors: [customQuoteDirective]
        }),
        toolbarPlugin({
          toolbarContents: () => (
            <div className="flex flex-wrap items-center gap-1 p-2 bg-background border-b border-border">
              <UndoRedo />
              <Separator />
              <BoldItalicUnderlineToggles />
              <Separator />
              <BlockTypeSelect />
              <Separator />
              <CreateLink />
              <InsertImage />
              <Separator />
              <ListsToggle />
              <Separator />
              <InsertPageButton />
              <InsertCustomQuote />
            </div>
          )
        })
      ]}
      {...props}
    />
  )
}

// Example usage in your markdown:
// <PageButton page="15" />

// :::custom-quote{author="Albert Einstein"}
// Imagination is more important than knowledge.
// :::