import { ID, Databases, Storage } from "appwrite";
import { db } from "@/lib/dexie"; // your Dexie IndexedDB setup
import { AppwriteClient } from "@/features/appwrite"; // initialized Appwrite client
import { v4 as uuidv4 } from 'uuid';


const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!;
const META_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_META_COLLECTION_ID!;
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PERM_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PERM_COLLECTION_ID!;
const storage = new Storage(AppwriteClient);
const databases = new Databases(AppwriteClient);

// // Local DB insert
// async function savePdfLocally(title: string, file: File) {
//   await db.pdfs.add({
//     title,
//     file,
//     uploaded: false,
//   });
// }

// // Upload to Appwrite Storage
// async function uploadPdfToStorage(file: File) {
//   const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
//   return uploadedFile;
// }

// // Create document in Appwrite DB
// async function createPdfDocument(
//   userId: string,
//   title: string,
//   author: string,
//   tags: string[],
//   fileId: string,
//   isFavourite: boolean,
//   updatedAt: string,
//   note: string,
//   image: string
// ) {
//   const doc = await databases.createDocument(
//     DATABASE_ID,
//     COLLECTION_ID,
//     ID.unique(),
//     {
//       userId,
//       title,
//       author,
//       tags,
//       fileId,
//       isFavourite,
//       updatedAt,
//       note,
//       image,
//     }
//   );
//   return doc;
// }

// // Direct online PDF upload (use if online only)
// async function uploadPdfOnline(
//   userId: string,
//   title: string,
//   author: string,
//   tags: string[],
//   fileId: string,
//   isFavourite: boolean,
//   updatedAt: string,
//   note: string,
//   image: string,
//   file: File
// ) {
//   const uploaded = await uploadPdfToStorage(file);
//   const doc = await createPdfDocument(
//     userId,
//     title,
//     author,
//     tags,
//     uploaded.$id,
//     isFavourite,
//     updatedAt,
//     note,
//     image
//   );
//   return doc;
// }

// // only form index db
// async function getUserBooks(userId: string) {
//   const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
//     Query.equal("userId", userId),
//   ]);
//   return res.documents;
// }

async function uploadBook(
  userId: string,  //
  title: string,  
  author: string,
  tags: string[],
//   fileId: string, //
  fileUrl: string, 
  isFavourite: boolean,
  verified: string, //
  note: string, 
  image: string,
  permissioned_to: string[], //
  file: File,
  syncToCloud: boolean
) {

  const docId = uuidv4(); 
  const fileId = uuidv4();

  if (!syncToCloud) {
    // upload file to local index db
    await db.files.add({
      fileId,
      file,
      createdAt: new Date().toISOString(),
    });

    await db.metadata.add({
      docId,
      userId,
      title,
      author,
      tags: [],
      fileId,
      fileUrl,  
      isFavourite,
      verified: new Date().toISOString(),
      note: "",
      image: "",  //url or what
    });

    await db.permissions.add({
      fileId,
      permissioned_to: [],
    });
  }else {

    //  Upload file to Appwrite storage with controlled fileId
    await storage.createFile(BUCKET_ID, fileId, file);

    // Create metadata doc
    await databases.createDocument(
      DATABASE_ID,
      META_COLLECTION_ID,
      ID.unique(),
      {
        userId,
        title,
        author,
        tags,
        fileId,
        fileUrl,
        isFavourite,
        verified, //which time to put here?
        note,
        image,
      }
    );

    // Create permission doc
    await databases.createDocument(
      DATABASE_ID,
      PERM_COLLECTION_ID,
      ID.unique(),
      {
        fileId,
        permissioned_to, //need to make schema for permissions
      }
    );
  } 
}

const PdfAPI = {
  uploadBook,
};

export default PdfAPI;
