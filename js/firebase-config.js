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
  apiKey: "À_COMPLETER",
  authDomain: "À_COMPLETER.firebaseapp.com",
  projectId: "À_COMPLETER",
  storageBucket: "À_COMPLETER.appspot.com",
  messagingSenderId: "À_COMPLETER",
  appId: "À_COMPLETER"
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
