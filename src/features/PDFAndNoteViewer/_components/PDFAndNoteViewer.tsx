"use client";
import { NoteEditor } from "@/features/Note/_components/NoteEditor"
import { PDFViewer } from "@/features/PDFViewer/PDFViewer"

export const PDFAndNoteViewer = ()=>{
  return (
    <div className="flex items-center w-full h-full">
      <PDFViewer/>
      <NoteEditor/>
    </div>
  )
}