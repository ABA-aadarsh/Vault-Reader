import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFAndNoteViewer } from "@/features/PDFAndNoteViewer/_components/PDFAndNoteViewer";
import { PDFViewer } from "@/features/PDFViewer/PDFViewer";

export default function Page () {
  return (
    <div className="grid grid-cols-2 ">
      <PDFViewer/>
      <NoteEditor/>
    </div>
  )
}