// ============================================================
// CONFIGURATION FIREBASE — à compléter
// ============================================================
// 1. Va sur https://console.firebase.google.com et crée un projet (plan gratuit "Spark").
// 2. Dans "Authentication" > "Sign-in method", active le fournisseur "Email/Mot de passe".
// 3. Dans "Firestore Database", crée une base (mode production), puis applique les règles
//    fournies dans le fichier firestore.rules à la racine du projet.
// 4. Dans "Paramètres du projet" > "Vos applications" > Ajouter une application Web,
//    copie l'objet de configuration ci-dessous et remplace les valeurs "À_COMPLETER".

const firebaseConfig = {
  apiKey: "AIzaSyBIYalHJmKuYPCuMp4gNG3C-H7phpC-rvk",
  authDomain: "efficience-atelier.firebaseapp.com",
  projectId: "efficience-atelier",
  storageBucket: "efficience-atelier.firebasestorage.app",
  messagingSenderId: "928801038925",
  appId: "1:928801038925:web:c46971ece9cc804b4c3204"
};

// Liste des emails qui doivent recevoir automatiquement le rôle "admin"
// (vue Manager / Statistiques Globales) lors de la création de leur compte.
// Tu peux aussi changer le rôle manuellement depuis la console Firestore
// (collection "users", document de l'utilisateur, champ "role" = "admin").
const ADMIN_EMAILS = [
  // "manager@entreprise.fr",
];

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
