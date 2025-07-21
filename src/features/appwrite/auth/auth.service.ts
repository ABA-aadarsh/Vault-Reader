import { ID } from 'appwrite';
import { AppwriteClientAccount } from '..';

const SESSION_KEY = 'vault-user-session';
const USER_KEY = 'vault-user';

function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// Save user locally
function cacheUser(user: any) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Load user from local cache
function getCachedUser() {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

// Save that user is logged in
function setLoggedInState(email: string) {
  localStorage.setItem(SESSION_KEY, email);
}

function clearLoggedInState() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}

function isLoggedInOffline() {
  return !!localStorage.getItem(SESSION_KEY);
}

// ---- API Wrappers ----

async function signup(email: string, password: string, name: string) {
  if (!isOnline()) throw new Error('Must be online to sign up');
  const user = await AppwriteClientAccount.create(ID.unique(), email, password, name);
  return user;
}

async function signin(email: string, password: string) {
  if (!isOnline()) throw new Error('Must be online to sign in');
  try {
    const existing = await AppwriteClientAccount.get();
    if (existing) {
      cacheUser(existing);
      setLoggedInState(existing.email);
      return existing;
    }
  } catch (_) {
  }
  await AppwriteClientAccount.createEmailPasswordSession(email, password);
  const user = await AppwriteClientAccount.get();
  cacheUser(user);
  setLoggedInState(user.email);
  return user;
}

async function signout() {
  if (isOnline()) {
    try {
      await AppwriteClientAccount.deleteSession('current');
    } catch (e) {
      // silent fail
    }
  }
  clearLoggedInState();
}

async function getCurrentUser(): Promise<any> {
  if (isOnline()) {
    try {
      const user = await AppwriteClientAccount.get();
      cacheUser(user);
      return user;
    } catch (err) {
      // fallback to cached
      return getCachedUser();
    }
  } else if (isLoggedInOffline()) {
    return getCachedUser();
  } else {
    throw new Error('Not authenticated (offline)');
  }
}

function isAuthenticated(): boolean {
  return isLoggedInOffline();
}

const AuthAPI = {
  signup,
  signin,
  signout,
  getCurrentUser,
  isAuthenticated,
  isOnline,
};

export default AuthAPI;
