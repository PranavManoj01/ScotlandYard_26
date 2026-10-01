import firebase from "firebase/app";
import "firebase/firestore";

// setup firebase
const firebaseConfig = {
  apiKey: "AIzaSyDX9y8DKfgamBk2Bi9BvWtwX5nWVR9EOcw",

  authDomain: "scoty-d0c4a.firebaseapp.com",

  projectId: "scoty-d0c4a",

  storageBucket: "scoty-d0c4a.firebasestorage.app",

  messagingSenderId: "632227298483",

  appId: "1:632227298483:web:313cf56cc7643b3cc4c4c6",

  measurementId: "G-LZFQVZNTDE"

};

export const db = firebase.initializeApp(firebaseConfig).firestore();
