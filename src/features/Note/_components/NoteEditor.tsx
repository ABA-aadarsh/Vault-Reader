"use client";

import { Editor } from "@/components/shared/MDXEditor/ForwardRefMDXEditor";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BlockTypeSelect, BoldItalicUnderlineToggles, ButtonWithTooltip, CreateLink, directivesPlugin, headingsPlugin, insertDirective$, InsertImage, insertJsx$, jsxPlugin, listsPlugin, ListsToggle, markdownShortcutPlugin, quotePlugin, thematicBreakPlugin, toolbarPlugin, UndoRedo, usePublisher } from "@mdxeditor/editor";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@radix-ui/react-dialog";
import { Label } from "@radix-ui/react-label";
import { Separator } from "@radix-ui/react-separator";
import { FileText, Plus, Quote, Check, X } from "lucide-react";
import { useState } from "react";
import '@mdxeditor/editor/style.css'
import "./theme.css"

function PageButton({ page }: { page: string }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary bg-accent/50 border border-border rounded-md hover:bg-accent hover:border-primary/50 transition-colors duration-150 cursor-pointer"
      onClick={() => {
        console.log(`Navigate to page ${page}`)
      }}
    >
      <FileText className="w-3 h-3" />
      Page {page}
    </button>
  )
}

// Enhanced JSX Editor wrapper component with correct prop handling
function PageButtonEditor({ mdastNode, descriptor }: any) {
  console.log('PageButtonEditor mdastNode:', mdastNode); // Debug log
  console.log('PageButtonEditor descriptor:', descriptor); // Debug log
  console.log('mdastNode.attributes:', mdastNode.attributes); // Additional debug
  console.log('mdastNode full structure:', JSON.stringify(mdastNode, null, 2)); // Full structure
  
  // Correct prop resolution - attributes is an array of {name, value} objects
  let page = '1'; // default
  
  if (mdastNode.attributes && Array.isArray(mdastNode.attributes)) {
    // Find the attribute with name 'page'
    const pageAttribute = mdastNode.attributes.find((attr: any) => attr.name === 'page');
    if (pageAttribute && pageAttribute.value) {
      page = pageAttribute.value;
    }
  }
  
  console.log('Final resolved page:', page); // Debug log
  
  return <PageButton page={String(page)} />
}

// Fixed inline toolbar button component for inserting page buttons
function InsertPageButton() {
  const insertJsx = usePublisher(insertJsx$)
  const [isInputVisible, setIsInputVisible] = useState(false)
  const [pageNumber, setPageNumber] = useState('')

  const handleInsert = () => {
    if (pageNumber.trim()) {
      console.log('Inserting JSX with page:', pageNumber.trim()); // Debug log
      
      // Try multiple insertion formats to ensure compatibility
      const jsxPayload = {
        name: 'PageButton',
        kind: 'text' as const,
        props: { 
          page: pageNumber.trim() 
        },
        // Add additional properties that might help with prop passing
        attributes: {
          page: pageNumber.trim()
        }
      }
      
      console.log('JSX payload:', jsxPayload); // Debug the payload
      
      insertJsx(jsxPayload)
      
      setPageNumber('')
      setIsInputVisible(false)
    }
  }

  const handleCancel = () => {
    setPageNumber('')
    setIsInputVisible(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInsert()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  if (isInputVisible) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-background border border-border rounded-md">
        <Input
          placeholder="Page number"
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-20 h-6 px-2 py-0 text-xs border-0 bg-transparent focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
        <button
          onClick={handleInsert}
          disabled={!pageNumber.trim()}
          className="h-6 w-6 p-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 rounded flex items-center justify-center"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={handleCancel}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <ButtonWithTooltip title="Insert page reference" onClick={() => setIsInputVisible(true)}>
      <FileText className="w-4 h-4" />
    </ButtonWithTooltip>
  )
}

// Minimal Custom Quote Block Button
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
        <ButtonWithTooltip title="Insert quote block" onClick={() => setOpen(true)}>
          <Quote className="w-4 h-4" />
        </ButtonWithTooltip>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-popover border border-border rounded-lg shadow-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg font-semibold text-popover-foreground">
            Insert Quote
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Add a quote block with optional attribution.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="quote-text" className="text-sm font-medium text-popover-foreground">
              Quote text
            </Label>
            <textarea
              id="quote-text"
              placeholder="Enter quote text..."
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-author" className="text-sm font-medium text-popover-foreground">
              Author (optional)
            </Label>
            <Input
              id="quote-author"
              placeholder="Author name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInsert}
            disabled={!quote.trim()}
            className="text-sm"
          >
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Clean minimal quote component
function CustomQuote({ author, children }: { author: string; children: any }) {
  return (
    <blockquote className="my-4 pl-4 border-l-2 border-border bg-accent/30 py-2 pr-3 rounded-r-md">
      <div className="text-foreground italic mb-1 text-sm leading-relaxed">
        "{children}"
      </div>
      {author && author !== 'Anonymous' && (
        <footer className="text-xs text-muted-foreground">
          — {author}
        </footer>
      )}
    </blockquote>
  )
}

// Custom quote directive with proper children handling
const customQuoteDirective = {
  name: 'custom-quote',
  testNode: (node: any) => {
    return node.name === 'custom-quote'
  },
  attributes: ['author'],
  hasChildren: true,
  Editor: ({ mdastNode }: any) => {
    const content = mdastNode.children?.[0]?.value || ''
    return (
      <CustomQuote author={mdastNode.attributes?.author || 'Anonymous'}>
        {content}
      </CustomQuote>
    )
  }
}

export const NoteEditor = () => {
  return (
    <div className="w-full">
      <Editor
        markdown=""
        className="prose prose-sm w-full max-w-full prose-invert dark-theme dark-editor"
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
                  { 
                    name: 'page', 
                    type: 'string'
                  }
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
              <div className="flex items-center gap-1 p-2 bg-card text-card-foreground m-0 border-b border-border">
                <div className="flex flex-row items-center">
                  <UndoRedo />
                </div>
                
                <Separator orientation="vertical" className="mx-2 h-5" />
                
                <div className="flex items-center">
                  <BoldItalicUnderlineToggles />
                </div>
                
                <Separator orientation="vertical" className="mx-2 h-5" />
                
                <div className="flex items-center">
                  <BlockTypeSelect />
                </div>
                
                <Separator orientation="vertical" className="mx-2 h-5" />
                
                <div className="flex items-center">
                  <CreateLink />
                  <InsertImage />
                </div>
                
                <Separator orientation="vertical" className="mx-2 h-5" />
                
                <div className="flex items-center">
                  <ListsToggle />
                </div>
                
                <Separator orientation="vertical" className="mx-2 h-5" />
                
                <div className="flex items-center">
                  <InsertPageButton />
                  <InsertCustomQuote />
                </div>
              </div>
            )
          })
        ]}
      />
    </div>
  )
}