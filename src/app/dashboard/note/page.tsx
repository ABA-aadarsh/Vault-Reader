"use client";
import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFAndNoteViewer } from "@/features/PDFAndNoteViewer/_components/PDFAndNoteViewer";
import dynamic from "next/dynamic";

const PDFViewer = dynamic(
  () => import("@/features/PDFViewer/PDFViewer").then(mod => mod.PDFViewer),
  { ssr: false }
);

export default function Page () {
  return (
    <div className="grid  ">
      <PDFViewer/>
      {/* <NoteEditor/> */}
      {/* <PDFAndNoteViewer/> */}
    </div>
  )
}