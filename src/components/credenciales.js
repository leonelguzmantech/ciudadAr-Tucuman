// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCNRcjIIR5n7z73iH1tEyIjRg87kTl9r5E",
  authDomain: "elcambio-50197.firebaseapp.com",
  projectId: "elcambio-50197",
  storageBucket: "elcambio-50197.appspot.com",
  messagingSenderId: "625650666267",
  appId: "1:625650666267:web:ee3b7dd9151e32ee19a1be"
};

// Initialize Firebase
const appfirebase = initializeApp(firebaseConfig);
export default appfirebase;