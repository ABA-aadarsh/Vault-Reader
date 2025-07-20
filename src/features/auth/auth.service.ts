import { account } from './appwrite';
import { ID } from 'appwrite';

export async function signUp(email: string, password: string, name: string) {
  return await account.create(ID.unique(), email, password, name);
}

export async function signIn(email: string, password: string) {
  return await account.createEmailPasswordSession(email, password);
}

export async function signOut() {
  return await account.deleteSession('current');
}

export async function getCurrentUser() {
  
    return await account.get();
 
}
