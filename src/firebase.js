import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBKRfdeJLiuqctIoP190hDUa43-WdneRjc",
  authDomain: "yanyanball.firebaseapp.com",
  projectId: "yanyanball",
  storageBucket: "yanyanball.firebasestorage.app",
  messagingSenderId: "611007061494",
  appId: "1:611007061494:web:cffbe1131f392ff9873bd7",
  measurementId: "G-SLY9CLLS61"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
