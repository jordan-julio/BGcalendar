// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBaiQkoUMxMX3wE_tdyMJiOpRnC3oLMBt8",
  authDomain: "calendarbg-b8b21.firebaseapp.com",
  projectId: "calendarbg-b8b21",
  storageBucket: "calendarbg-b8b21.appspot.com",
  messagingSenderId: "966785744813",
  appId: "1:966785744813:web:6f9affcc6adb8687366b24",
  measurementId: "G-0HS8NL71G1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only on client side)
const analytics = typeof window !== "undefined" ? getAnalytics(app) : undefined;

// Initialize Messaging (only on client side)
const messaging = typeof window !== "undefined" ? getMessaging(app) : null;

// Export everything
export { app, analytics, messaging, getToken, onMessage };