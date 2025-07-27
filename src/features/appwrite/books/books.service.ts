import { ID, Databases, Storage, Permission, Role } from "appwrite";
import { db } from "@/lib/dexie"; // your Dexie IndexedDB setup
import { AppwriteClient } from "@/features/appwrite"; // initialized Appwrite client
import { v4 as uuidv4 } from "uuid";
import AuthAPI from "@/features/appwrite/auth/auth.service";

const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!;
const META_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_META_COLLECTION_ID!;
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PERM_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PERM_COLLECTION_ID!;
const storage = new Storage(AppwriteClient);
const databases = new Databases(AppwriteClient);

async function uploadBook(
  //   userId: string,  //
  title: string,
  author: string,
  tags: string[],
  //   fileId: string, //
  fileUrl: string,
  isFavourite: boolean,
  //   verified: string, //
  note: string,
  image: string,
  //   permissioned_to: string[], //
  file: File,
  syncToCloud: boolean
) {
  const docId = uuidv4();
  const fileId = uuidv4();
  const user = await AuthAPI.getCurrentUser();
  const userId = user.$id;
  const verified = new Date().toISOString();

  // upload file to local index db
  await db.files.add({
    fileId,
    file,
    createdAt: new Date().toISOString(),
  });

  // upload file to local metadata db
  await db.metadata.add({
    docId,
    userId,
    title,
    author,
    tags,
    fileId,
    fileUrl,
    isFavourite,
    verified,
    note,
    image: "", //url or what
  });

  await db.permissions.add({
    fileId,
    permissioned_to: [],
  });

  if (syncToCloud) {
    await storage.createFile(BUCKET_ID, fileId, file);

    // Create metadata doc
    await databases.createDocument(
      DATABASE_ID,
      META_COLLECTION_ID,
      docId,  //Id
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
      },
      [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ]
    );

    // Create permission doc
    await databases.createDocument(
      DATABASE_ID,
      PERM_COLLECTION_ID,
      fileId,  // Id 
      {
        permissioned_to: [userId], //permissioned to the user who uploaded
      },
      [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ]
    );
  }
}


const PdfAPI = {
  uploadBook,
};

export default PdfAPI;
