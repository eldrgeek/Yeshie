import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, Firestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logError } from '@yeshie/shared/utils/logger';

// Your web app's Firebase configuration 
// Replace with your own Firebase config or load from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Function to upload JSON schema to Firestore
export async function uploadSchema(schemaName: string, schema: any): Promise<string> {
  try {
    const schemaDoc = doc(collection(db, 'schemas'), schemaName);
    await setDoc(schemaDoc, { 
      name: schemaName, 
      schema: schema, 
      createdAt: new Date().toISOString() 
    });
    return schemaDoc.id;
  } catch (error) {
    logError('Error uploading schema:', error);
    throw error;
  }
}

// Function to retrieve a schema by name
export async function getSchema(schemaName: string): Promise<any> {
  try {
    const schemaDoc = doc(collection(db, 'schemas'), schemaName);
    const schemaSnapshot = await getDoc(schemaDoc);
    if (schemaSnapshot.exists()) {
      return schemaSnapshot.data();
    } else {
      throw new Error(`Schema ${schemaName} not found`);
    }
  } catch (error) {
    logError('Error retrieving schema:', error);
    throw error;
  }
}

// Upload a file to Firebase Storage
export async function uploadFile(file: File, path: string): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    logError('Error uploading file:', error);
    throw error;
  }
}

export { db, storage }; 