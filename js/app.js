// ============================================================
// APPLICATION — Suivi Efficience Atelier
// ============================================================

let currentUser = null; // { uid, email, displayName, role }
let currentDay = { date: null, heuresReelles: null, interventions: [], totalRetours: 0, retoursDetails: [] };
let monthAggregateCache = { temps: 0, heures: 0, pieces: 0, interventions: 0 };
let ssFamille = null;
let ssMarque = null;

const todayISO = () => new Date().toISOString().slice(0, 10);

const DIACRITICS_REGEX = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
function normalizeText(str) {
  return (str || "").toString().normalize("NFD").replace(DIACRITICS_REGEX, "").toLowerCase();
}

function formatDateFr(iso) {
  const [y, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

/**
 * Mini-composant : champ texte + liste de résultats filtrés, qui ne s'affiche
 * qu'à partir d'1 lettre tapée. Retourne {getValue, reset}.
 */
function setupSearchableSelect({ inputEl, resultsEl, options, getLabel, getValue, onSelect, onClear }) {
  let selectedValue = null;

  inputEl.addEventListener("input", () => {
    selectedValue = null;
    if (onClear) onClear();
    const q = normalizeText(inputEl.value);
    if (q.length < 1) {
      resultsEl.classList.add("hidden");
      resultsEl.innerHTML = "";
      return;
    }
    const matches = options.filter(o => normalizeText(getLabel(o)).includes(q)).slice(0, 50);
    resultsEl.innerHTML = "";
    if (!matches.length) {
      resultsEl.classList.add("hidden");
      return;
    }
    matches.forEach(o => {
      const div = document.createElement("div");
      div.textContent = getLabel(o);
      div.addEventListener("click", () => {
        inputEl.value = getLabel(o);
        selectedValue = getValue(o);
        resultsEl.classList.add("hidden");
        resultsEl.innerHTML = "";
        if (onSelect) onSelect(selectedValue, o);
      });
      resultsEl.appendChild(div);
    });
    resultsEl.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => {
    if (e.target !== inputEl && !resultsEl.contains(e.target)) {
      resultsEl.classList.add("hidden");
    }
  });

  return {
    getValue: () => selectedValue,
    reset: () => {
      inputEl.value = "";
      selectedValue = null;
      resultsEl.classList.add("hidden");
      resultsEl.innerHTML = "";
    }
  };
}

// ------------------------------------------------------------
// UTILITAIRES UI
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function showScreen(screen) {
  $("auth-screen").classList.toggle("hidden", screen !== "auth");
  $("app-screen").classList.toggle("hidden", screen !== "app");
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  $(`view-${viewName}`).classList.remove("hidden");
  document.querySelector(`.tab-btn[data-view="${viewName}"]`).classList.add("active");

  if (viewName !== "equipe") arreterStatsEquipeLive();
  if (viewName === "dashboard") renderTechnicianDashboard();
  if (viewName === "equipe") renderStatsEquipe();
  if (viewName === "nps") renderNPS();
  if (viewName === "admin") renderAdminDashboard();
}

// ------------------------------------------------------------
// AUTHENTIFICATION
// ------------------------------------------------------------
$("show-signup").addEventListener("click", (e) => {
  e.preventDefault();
  $("login-form").classList.add("hidden");
  $("signup-form").classList.remove("hidden");
});
$("show-login").addEventListener("click", (e) => {
  e.preventDefault();
  $("signup-form").classList.add("hidden");
  $("login-form").classList.remove("hidden");
});

$("show-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  $("forgot-error").textContent = "";
  $("forgot-success").textContent = "";
  $("forgot-email").value = $("login-email").value.trim();
  $("login-form").classList.add("hidden");
  $("forgot-form").classList.remove("hidden");
});
$("show-login-from-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  $("forgot-form").classList.add("hidden");
  $("login-form").classList.remove("hidden");
});

$("btn-forgot").addEventListener("click", async () => {
  $("forgot-error").textContent = "";
  $("forgot-success").textContent = "";
  const email = $("forgot-email").value.trim();
  if (!email) {
    $("forgot-error").textContent = "Merci de saisir ton email.";
    return;
  }
  $("btn-forgot").disabled = true;
  try {
    await auth.sendPasswordResetEmail(email);
    $("forgot-success").textContent = "Email envoyé ! Vérifie ta boîte de réception (et les spams) pour choisir un nouveau mot de passe.";
  } catch (err) {
    $("forgot-error").textContent = traduireErreurFirebase(err);
  } finally {
    $("btn-forgot").disabled = false;
  }
});

$("btn-login").addEventListener("click", async () => {
  $("login-error").textContent = "";
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    $("login-error").textContent = traduireErreurFirebase(err);
  }
});

$("btn-signup").addEventListener("click", async () => {
  $("signup-error").textContent = "";
  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  if (!name || !email || password.length < 6) {
    $("signup-error").textContent = "Merci de remplir tous les champs (mot de passe ≥ 6 caractères).";
    return;
  }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? "admin" : "technician";
    await db.collection("users").doc(cred.user.uid).set({
      email, displayName: name, role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    $("signup-error").textContent = traduireErreurFirebase(err);
  }
});

$("btn-logout").addEventListener("click", () => auth.signOut());

function traduireErreurFirebase(err) {
  const map = {
    "auth/invalid-email": "Email invalide.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/missing-email": "Merci de saisir un email.",
    "auth/too-many-requests": "Trop de tentatives, réessaie dans quelques minutes."
  };
  return map[err.code] || err.message;
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    showScreen("auth");
    return;
  }
  const docSnap = await db.collection("users").doc(user.uid).get();
  let userData = docSnap.exists ? docSnap.data() : null;
  if (!userData) {
    // Sécurité : si le doc utilisateur n'existe pas encore, on le crée par défaut.
    userData = {
      email: user.email,
      displayName: user.email,
      role: ADMIN_EMAILS.includes((user.email || "").toLowerCase()) ? "admin" : "technician"
    };
    await db.collection("users").doc(user.uid).set(userData);
  }
  currentUser = { uid: user.uid, email: userData.email, displayName: userData.displayName, role: userData.role };

  $("user-badge").textContent = `${currentUser.displayName} ${currentUser.role === "admin" ? "(Manager)" : ""}`;
  $("tab-admin").classList.toggle("hidden", currentUser.role !== "admin");

  showScreen("app");
  initSaisieView();
  switchView("saisie");
});

// ------------------------------------------------------------
// NAVIGATION
// ------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ------------------------------------------------------------
// VUE SAISIE — initialisation
// ------------------------------------------------------------
function initSaisieView() {
  ssFamille = setupSearchableSelect({
    inputEl: $("inp-famille"),
    resultsEl: $("ss-famille-results"),
    options: getFamillesOptions(),
    getLabel: (f) => f.fam,
    getValue: (f) => f.fam,
    onSelect: updateTempsAllouePreview,
    onClear: updateTempsAllouePreview
  });

  ssMarque = setupSearchableSelect({
    inputEl: $("inp-marque"),
    resultsEl: $("ss-marque-results"),
    options: (window.MARQUES_LIST || []).map(m => ({ marque: m })),
    getLabel: (o) => o.marque,
    getValue: (o) => o.marque,
    onSelect: updateTempsAllouePreview,
    onClear: updateTempsAllouePreview
  });

  $("inp-date").value = todayISO();
  $("saisie-content").classList.add("hidden");
  $("card-ouverture").classList.remove("hidden");
}

$("inp-type").addEventListener("change", updateTempsAllouePreview);

// Chips de type d'intervention (TAR / TAN / ETC) : pilotent le <select> caché
// "inp-type" pour ne rien changer au reste de la logique (qui lit/écoute ce select).
document.querySelectorAll("#type-select .type-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#type-select .type-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    $("inp-type").value = chip.dataset.type;
    $("inp-type").dispatchEvent(new Event("change"));
  });
});

// Stepper +/- pour le nombre de pièces détachées
$("btn-pieces-moins").addEventListener("click", () => {
  const v = Math.max(0, (parseInt($("inp-pieces").value, 10) || 0) - 1);
  $("inp-pieces").value = v;
});
$("btn-pieces-plus").addEventListener("click", () => {
  const v = (parseInt($("inp-pieces").value, 10) || 0) + 1;
  $("inp-pieces").value = v;
});

function updateTempsAllouePreview() {
  const fam = ssFamille ? ssFamille.getValue() : null;
  const marque = ssMarque ? ssMarque.getValue() : "";
  const type = $("inp-type").value;
  if (!fam) {
    $("temps-alloue-preview").textContent = "—";
    $("temps-alloue-source").textContent = "";
    return;
  }
  const res = getTempsAlloue(fam, marque, type);
  if (res) {
    $("temps-alloue-preview").textContent = formatHeures(res.temps);
    $("temps-alloue-source").textContent = res.source;
  } else {
    $("temps-alloue-preview").textContent = "Non trouvé";
    $("temps-alloue-source").textContent = "";
  }
}

// ------------------------------------------------------------
// OUVERTURE / CHANGEMENT DE JOURNEE
// ------------------------------------------------------------
$("btn-ouvrir-journee").addEventListener("click", () => {
  const date = $("inp-date").value;
  if (!date) {
    alert("Merci de choisir une date.");
    return;
  }
  ouvrirJournee(date);
});

$("btn-changer-journee").addEventListener("click", () => {
  $("saisie-content").classList.add("hidden");
  $("card-ouverture").classList.remove("hidden");
});

// Raccourcis "Aujourd'hui" / "Hier" : on règle la date puis on ouvre direct.
function decalerDateISO(isoDate, deltaJours) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + deltaJours);
  return d.toISOString().slice(0, 10);
}
$("shortcut-today").addEventListener("click", () => {
  const date = todayISO();
  $("inp-date").value = date;
  ouvrirJournee(date);
});
$("shortcut-yesterday").addEventListener("click", () => {
  const date = decalerDateISO(todayISO(), -1);
  $("inp-date").value = date;
  ouvrirJournee(date);
});

// Petits messages d'attente, clin d'œil au métier SAV — un tirage au sort
// différent à chaque ouverture de journée pour ne pas être répétitif.
const MESSAGES_CHARGEMENT_SAV = [
  "Détartrage de la cafetière avant de commencer…",
  "On retire le pain coincé dans le grille-pain…",
  "On démêle le câble de l'aspirateur…",
  "Chargement du café de l'atelier (avec une cafetière qui marche, promis)…",
  "On compte les pièces détachées une par une (presque)…",
  "Le technicien cherche son tournevis cruciforme…",
  "Recomptage des heures (sans tricher)…",
  "Le client rappelle pour son micro-ondes, on accélère…",
  "Vérification que le sèche-cheveux ne chauffe plus pour rien…",
  "On range les résistances par taille, ça aide à rien mais bon…",
  "Décodage de l'écriture du bon de commande…",
  "On cherche qui a piqué le dernier filtre d'aspirateur…",
  "On dépanne la base de données comme un vieux fer à repasser…",
  "Conversion des heures en tasses de café…",
  "On planque le carton de pièces avant l'inventaire…",
  "On évite que deux journées se mélangent (promis)…",
  "L'aspirateur reprend son souffle avant le diagnostic…",
  "On débogue avec un tournevis plat (ça marche pas mais on essaie)…",
  "On checke si le grille-pain a bien refroidi…",
  "Petit détartrage du conic-gradient…",
  "On attend que la cafetière (et la base de données) se réveillent…",
  "Le vendeur a encore vendu du Darty Max, on valide la prise en charge…",
  "Estimation du temps avant le prochain coup de fil pour un grille-pain…",
  "On compare le devis au prix d'un appareil neuf chez Darty…",
  "Le client demande si Darty Max rembourse aussi le café renversé…",
  "Calibrage du sourire \"service client\" avant l'intervention…",
  "On explique une fois de plus ce que couvre Darty Max…",
  "On compte les vis une par une (à peu près)…",
  "Mise à jour du café (toujours pas trouvé le bouton \"plus fort\")…",
  "On revérifie que la journée d'hier n'est pas revenue se mélanger (elle a déjà essayé)…",
  "Recherche de la bonne pièce détachée (elle était sous le café)…",
  "On recompte les pièces détachées, version 2 (la première fois on a perdu le fil)…",
  "Le client demande si Darty Max couvre aussi les coups de colère…",
  "On range le tournevis plat avec les autres (qui ne servent à rien non plus)…",
  "Calibrage de la patience avant le prochain appel client…",
  "On revérifie que le café n'a pas grillé avant la résistance…",
  "Le vendeur jure que Darty Max marche même sur un grille-pain en pièces…",
  "On cherche le bon tournevis (cruciforme, plat, et celui qu'on a jamais retrouvé)…",
  "Synchronisation du café avec la base de données (priorité au café)…",
  "Le client demande si Darty Max couvre les pièces perdues sous le canapé…"
];
function messageChargementAleatoire() {
  return MESSAGES_CHARGEMENT_SAV[Math.floor(Math.random() * MESSAGES_CHARGEMENT_SAV.length)];
}

// Jeton d'ouverture : si l'utilisateur enchaîne plusieurs ouvertures de
// journée rapidement, seule la dernière demandée doit pouvoir mettre à jour
// l'UI/currentDay — sinon une réponse Firestore "en retard" d'une ancienne
// demande peut écraser la journée qu'on vient d'ouvrir avec les données
// d'une autre date (symptôme : la même intervention apparaît sur 2 jours).
let ouvertureToken = 0;

async function ouvrirJournee(date) {
  const monToken = ++ouvertureToken;
  $("btn-ouvrir-journee").disabled = true;
  $("shortcut-today").disabled = true;
  $("shortcut-yesterday").disabled = true;
  $("ouverture-loading-msg").textContent = messageChargementAleatoire();
  $("ouverture-loading").classList.remove("hidden");

  // Pause minimale (3 à 4 secondes) pour que le message de chargement ait le
  // temps d'être lu — sans ça l'ouverture est trop rapide et le message
  // n'apparaît qu'une fraction de seconde. Le vrai temps de chargement
  // (Firestore) se déroule en parallèle ; seul le délai manquant est attendu.
  const dureeMinimum = 3000 + Math.random() * 1000;
  const debut = Date.now();

  try {
    const docId = `${currentUser.uid}_${date}`;
    // source: "server" force une lecture serveur (jamais le cache local du SDK),
    // pour être certain à 100% que chaque journée lit ses propres données.
    const snap = await db.collection("days").doc(docId).get({ source: "server" });

    const nouvelleJournee = { date, heuresReelles: null, interventions: [], totalRetours: 0, retoursDetails: [] };
    if (snap.exists) {
      const data = snap.data();
      nouvelleJournee.heuresReelles = data.heuresReelles ?? null;
      // .map() pour cloner profondément les objets d'intervention : on ne veut
      // jamais qu'un tableau chargé depuis Firestore puisse être la même
      // référence qu'un tableau utilisé pour une autre journée.
      nouvelleJournee.interventions = (data.interventions || []).map(it => ({ ...it }));
      // Détail des retours (dossier + commentaire). Compat descendante : pour
      // les anciennes journées enregistrées avec un simple compteur, on
      // reconstitue des entrées vides afin de conserver le total.
      if (Array.isArray(data.retoursDetails)) {
        nouvelleJournee.retoursDetails = data.retoursDetails.map(r => ({ ...r }));
      } else {
        const n = data.totalRetours || 0;
        nouvelleJournee.retoursDetails = Array.from({ length: n }, () => ({ dossier: "", commentaire: "" }));
      }
      nouvelleJournee.totalRetours = nouvelleJournee.retoursDetails.length;
    }

    let aggregat;
    try {
      aggregat = await chargerAggregatMoisHorsJour(date);
    } catch (err) {
      console.error("[Efficience] Échec du calcul de l'agrégat mensuel :", err);
      aggregat = { temps: 0, heures: 0, pieces: 0, interventions: 0 };
    }

    const ecoule = Date.now() - debut;
    if (ecoule < dureeMinimum) {
      await new Promise(resolve => setTimeout(resolve, dureeMinimum - ecoule));
    }

    if (monToken !== ouvertureToken) return; // une ouverture plus récente a pris le relais

    currentDay = nouvelleJournee;
    monthAggregateCache = aggregat;
    console.log(`[Efficience] Journée ouverte → document Firestore "${docId}" — ${currentDay.interventions.length} intervention(s) chargée(s).`);

    $("inp-heures-reelles").value = currentDay.heuresReelles ?? "";
    syncHeuresPresetActive();
    $("lbl-date-ouverte").textContent = formatDateFr(date);
    $("save-status").textContent = "";
    $("card-ouverture").classList.add("hidden");
    $("saisie-content").classList.remove("hidden");

    renderInterventionsTable();
    renderRetourCount();
    renderTopStats();
  } finally {
    if (monToken === ouvertureToken) {
      $("btn-ouvrir-journee").disabled = false;
      $("shortcut-today").disabled = false;
      $("shortcut-yesterday").disabled = false;
      $("ouverture-loading").classList.add("hidden");
    }
  }
}

async function chargerAggregatMoisHorsJour(date) {
  const moisActuel = date.slice(0, 7);
  const { start, end } = moisRangeISO(moisActuel);
  // IMPORTANT : on garde exactement la même forme de requête (mêmes champs,
  // même orderBy) que celle du Dashboard (renderTechnicianDashboard) afin de
  // réutiliser l'unique index composite Firestore déjà créé. Une requête de
  // forme différente (même avec les mêmes champs filtrés) exige son propre
  // index — sans quoi elle échoue silencieusement et l'agrégat mensuel
  // retombe à zéro, ce qui faisait afficher la valeur du jour à la place du
  // mensuel sur la fiche de saisie.
  const snap = await db.collection("days")
    .where("uid", "==", currentUser.uid)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .orderBy("date", "desc")
    .get({ source: "server" });

  const agg = { temps: 0, heures: 0, pieces: 0, interventions: 0 };
  snap.forEach(d => {
    const j = d.data();
    if (j.date === date) return; // la journée en cours est comptée en direct
    agg.temps += j.totalTempsAlloue || 0;
    agg.heures += j.heuresReelles || 0;
    agg.pieces += j.totalPieces || 0;
    agg.interventions += j.totalInterventions || 0;
  });
  return agg;
}

/** Applique une bordure de couleur à un .stat-card selon le niveau de performance */
function appliquerNiveauCarte(valueElId, metricKey, value) {
  const valueEl = $(valueElId);
  if (!valueEl) return;
  const card = valueEl.closest(".stat-card");
  if (!card) return;
  card.classList.remove("niveau-bord-vert", "niveau-bord-orange", "niveau-bord-rouge", "niveau-bord-neutre");
  card.classList.add(`niveau-bord-${getNiveauPerformance(metricKey, value)}`);
}

function renderTopStats() {
  const totalTempsJour = currentDay.interventions.reduce((s, i) => s + i.tempsAlloue, 0);
  const totalPiecesJour = currentDay.interventions.reduce((s, i) => s + i.nbPieces, 0);
  const effJour = calculEfficience(totalTempsJour, currentDay.heuresReelles);

  const totalTempsMois = monthAggregateCache.temps + totalTempsJour;
  const totalHeuresMois = monthAggregateCache.heures + (currentDay.heuresReelles || 0);
  const totalPiecesMois = monthAggregateCache.pieces + totalPiecesJour;
  const totalInterventionsMois = monthAggregateCache.interventions + currentDay.interventions.length;

  const effMois = calculEfficience(totalTempsMois, totalHeuresMois);
  const consoMois = calculConsoPieces(totalPiecesMois, totalInterventionsMois);

  $("top-eff-jour").textContent = formatPct(effJour);
  $("top-eff-mois").textContent = formatPct(effMois);
  $("top-conso-mois").textContent = formatNombre(consoMois, 2);

  appliquerNiveauCarte("top-eff-jour", "efficience", effJour);
  appliquerNiveauCarte("top-eff-mois", "efficience", effMois);
  appliquerNiveauCarte("top-conso-mois", "consoPieces", consoMois);
}

function renderRetourCount() {
  currentDay.totalRetours = (currentDay.retoursDetails || []).length;
  $("retour-count").textContent = currentDay.totalRetours;

  const liste = $("retour-liste");
  if (!liste) return;
  const details = currentDay.retoursDetails || [];
  if (details.length === 0) {
    liste.innerHTML = `<li class="retour-liste-vide">Aucun retour enregistré pour cette journée.</li>`;
    return;
  }
  liste.innerHTML = details.map((r, idx) => `
    <li class="retour-item">
      <div class="retour-item-main">
        <span class="retour-item-dossier">${r.dossier ? escapeHtmlRetour(r.dossier) : "Dossier non renseigné"}</span>
        ${r.commentaire ? `<span class="retour-item-commentaire">${escapeHtmlRetour(r.commentaire)}</span>` : ""}
      </div>
      <button type="button" class="btn btn-ghost retour-item-suppr" data-idx="${idx}" title="Retirer ce retour">✕</button>
    </li>`).join("");
}

function escapeHtmlRetour(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------
// SAUVEGARDE AUTOMATIQUE
// ------------------------------------------------------------
let heuresDebounceTimer = null;

$("inp-heures-reelles").addEventListener("input", () => {
  currentDay.heuresReelles = parseFloat($("inp-heures-reelles").value) || null;
  syncHeuresPresetActive();
  renderTopStats();
  clearTimeout(heuresDebounceTimer);
  heuresDebounceTimer = setTimeout(persistJournee, 600);
});

function syncHeuresPresetActive() {
  const val = parseFloat($("inp-heures-reelles").value);
  document.querySelectorAll(".heures-preset-chip").forEach(chip => {
    chip.classList.toggle("active", !isNaN(val) && parseFloat(chip.dataset.val) === val);
  });
}

$("btn-heures-moins").addEventListener("click", () => {
  const v = Math.max(0, (parseFloat($("inp-heures-reelles").value) || 0) - 0.25);
  $("inp-heures-reelles").value = v;
  $("inp-heures-reelles").dispatchEvent(new Event("input"));
});
$("btn-heures-plus").addEventListener("click", () => {
  const v = Math.min(24, (parseFloat($("inp-heures-reelles").value) || 0) + 0.25);
  $("inp-heures-reelles").value = v;
  $("inp-heures-reelles").dispatchEvent(new Event("input"));
});
document.querySelectorAll(".heures-preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $("inp-heures-reelles").value = chip.dataset.val;
    $("inp-heures-reelles").dispatchEvent(new Event("input"));
  });
});

async function persistJournee() {
  if (!currentUser || !currentDay.date) return;
  const totalTemps = currentDay.interventions.reduce((s, i) => s + i.tempsAlloue, 0);
  const totalPieces = currentDay.interventions.reduce((s, i) => s + i.nbPieces, 0);
  const totalInterventions = currentDay.interventions.length;
  const heuresReelles = currentDay.heuresReelles || 0;
  const efficience = calculEfficience(totalTemps, heuresReelles);

  const statusEl = $("save-status");
  try {
    const docId = `${currentUser.uid}_${currentDay.date}`;
    await db.collection("days").doc(docId).set({
      uid: currentUser.uid,
      technicienNom: currentUser.displayName,
      date: currentDay.date,
      heuresReelles,
      interventions: currentDay.interventions,
      totalTempsAlloue: totalTemps,
      totalPieces,
      totalInterventions,
      totalRetours: (currentDay.retoursDetails || []).length,
      retoursDetails: currentDay.retoursDetails || [],
      efficience,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[Efficience] Journée enregistrée → document Firestore "${docId}" — ${currentDay.interventions.length} intervention(s).`);
    statusEl.className = "save-status ok";
    statusEl.textContent = `Enregistré automatiquement à ${new Date().toLocaleTimeString("fr-FR")}`;
  } catch (err) {
    statusEl.className = "save-status error";
    statusEl.textContent = "Erreur d'enregistrement : " + err.message;
  }
}

// ------------------------------------------------------------
// RETOURS ATELIER (compteur indépendant de la journée)
// ------------------------------------------------------------
$("btn-retour-plus").addEventListener("click", () => {
  const errEl = $("retour-error");
  errEl.textContent = "";
  const dossier = $("inp-retour-dossier").value.trim();
  const commentaire = $("inp-retour-commentaire").value.trim();

  if (!dossier) {
    errEl.textContent = "Merci d'indiquer le n° de dossier concerné par le retour.";
    return;
  }

  if (!Array.isArray(currentDay.retoursDetails)) currentDay.retoursDetails = [];
  currentDay.retoursDetails.push({ dossier, commentaire });

  $("inp-retour-dossier").value = "";
  $("inp-retour-commentaire").value = "";
  renderRetourCount();
  persistJournee();
});

// Ajout via la touche Entrée dans les champs dossier / commentaire
["inp-retour-dossier", "inp-retour-commentaire"].forEach(id => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("btn-retour-plus").click(); }
  });
});

// Suppression d'un retour dans la liste
$("retour-liste").addEventListener("click", (e) => {
  const btn = e.target.closest(".retour-item-suppr");
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx, 10);
  if (isNaN(idx)) return;
  currentDay.retoursDetails.splice(idx, 1);
  renderRetourCount();
  persistJournee();
});

// ------------------------------------------------------------
// AJOUT / SUPPRESSION D'UNE INTERVENTION
// ------------------------------------------------------------
$("btn-add-intervention").addEventListener("click", () => {
  $("intervention-error").textContent = "";
  const fam = ssFamille.getValue();
  const marque = ssMarque.getValue() || "";
  const type = $("inp-type").value;
  const numero = $("inp-numero").value.trim();
  const nbPieces = parseInt($("inp-pieces").value, 10) || 0;

  if (!fam) {
    $("intervention-error").textContent = "Merci de sélectionner une famille de produit dans la liste proposée.";
    return;
  }
  const res = getTempsAlloue(fam, marque, type);
  if (!res) {
    $("intervention-error").textContent = "Aucun temps standard trouvé pour cette famille / marque. Vérifiez la saisie.";
    return;
  }

  currentDay.interventions.push({
    numero, fam, marque, type,
    tempsAlloue: res.temps,
    source: res.source,
    nbPieces
  });

  // reset du formulaire d'ajout
  ssFamille.reset();
  ssMarque.reset();
  $("inp-numero").value = "";
  $("inp-pieces").value = 0;
  updateTempsAllouePreview();

  renderInterventionsTable();
  renderTopStats();
  persistJournee();
});

function renderInterventionsTable() {
  const tbody = $("table-interventions-body");
  tbody.innerHTML = "";
  let totalTemps = 0, totalPieces = 0;

  currentDay.interventions.forEach((it, idx) => {
    totalTemps += it.tempsAlloue;
    totalPieces += it.nbPieces;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.numero || "—"}</td>
      <td>${it.fam}</td>
      <td>${it.marque || "—"}</td>
      <td>${it.type}</td>
      <td>${formatNombre(it.tempsAlloue)}</td>
      <td>${it.nbPieces}</td>
      <td><button class="btn-danger-sm" data-idx="${idx}" title="Supprimer">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentDay.interventions.splice(parseInt(btn.dataset.idx, 10), 1);
      renderInterventionsTable();
      renderTopStats();
      persistJournee();
    });
  });

  $("total-temps-alloue").innerHTML = `<strong>${formatNombre(totalTemps)}</strong>`;
  $("total-pieces").innerHTML = `<strong>${totalPieces}</strong>`;
}

// ------------------------------------------------------------
// DASHBOARD TECHNICIEN
// ------------------------------------------------------------
function moisRangeISO(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = `${yyyymm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yyyymm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Met à jour une jauge circulaire : couleur selon le niveau de perf + remplissage proportionnel */
function renderJauge(circleId, value, metricKey, maxEchelle, texteAffiche) {
  const el = $(circleId);
  if (!el) return;
  const niveau = getNiveauPerformance(metricKey, value);
  el.classList.remove("jauge-vert", "jauge-orange", "jauge-rouge", "jauge-neutre");
  el.classList.add(`jauge-${niveau}`);
  el.style.setProperty("--pct", pctEchelle(value, maxEchelle));
  el.querySelector(".jauge-value").textContent = texteAffiche;
}

async function renderTechnicianDashboard() {
  if (!$("inp-dash-month").value) {
    $("inp-dash-month").value = todayISO().slice(0, 7);
  }
  const moisChoisi = $("inp-dash-month").value;
  const { start, end } = moisRangeISO(moisChoisi);

  let snap;
  try {
    snap = await db.collection("days")
      .where("uid", "==", currentUser.uid)
      .where("date", ">=", start)
      .where("date", "<=", end)
      .orderBy("date", "desc")
      .get({ source: "server" });
  } catch (err) {
    console.error("[Efficience] Échec du chargement du dashboard :", err);
    $("historique-body").innerHTML = `<tr><td colspan="7">Erreur de chargement : ${err.message}</td></tr>`;
    return;
  }

  const jours = snap.docs.map(d => d.data());

  const totalTempsMois = jours.reduce((s, j) => s + (j.totalTempsAlloue || 0), 0);
  const totalHeuresMois = jours.reduce((s, j) => s + (j.heuresReelles || 0), 0);
  const totalPiecesMois = jours.reduce((s, j) => s + (j.totalPieces || 0), 0);
  const totalInterventionsMois = jours.reduce((s, j) => s + (j.totalInterventions || 0), 0);
  const totalRetoursMois = jours.reduce((s, j) => s + (j.totalRetours || 0), 0);
  const joursTravailles = jours.filter(j => (j.heuresReelles || 0) > 0).length;

  // Le dashboard ne montre plus qu'un récap MENSUEL (l'efficience du jour
  // se consulte déjà dans "Saisie du jour").
  const effMois = calculEfficience(totalTempsMois, totalHeuresMois);
  const consoMois = calculConsoPieces(totalPiecesMois, totalInterventionsMois);
  const tauxRetourMois = calculTauxRetour(totalRetoursMois, totalInterventionsMois);

  // ----- Jauges -----
  renderJauge("jauge-eff-mois", effMois, "efficience", 120, formatPct(effMois));
  renderJauge("jauge-conso-mois", consoMois, "consoPieces", 2, formatNombre(consoMois, 2));
  renderJauge("jauge-retour-mois", tauxRetourMois, "tauxRetour", 20, formatPct(tauxRetourMois));

  // ----- Résumé du mois -----
  const effsValides = jours.map(j => j.efficience).filter(e => e !== null && e !== undefined && !isNaN(e));
  const effMoyenneParJour = effsValides.length ? effsValides.reduce((a, b) => a + b, 0) / effsValides.length : null;
  const meilleurJour = jours.filter(j => j.efficience !== null && j.efficience !== undefined)
    .sort((a, b) => b.efficience - a.efficience)[0];

  $("stat-jours-travailles").textContent = joursTravailles;
  $("stat-heures-mois").textContent = formatHeures(totalHeuresMois);
  $("stat-nb-interventions").textContent = totalInterventionsMois;
  $("stat-pieces-total-mois").textContent = totalPiecesMois;
  $("stat-meilleur-jour").textContent = meilleurJour ? `${formatDateFr(meilleurJour.date)} (${formatPct(meilleurJour.efficience)})` : "—";
  $("stat-moy-jour").textContent = formatPct(effMoyenneParJour);

  // ----- Répartition TAR / TAN / ETC -----
  let nbTar = 0, nbTan = 0, nbEtc = 0;
  jours.forEach(j => {
    (j.interventions || []).forEach(it => {
      if (it.type === "TAR") nbTar++;
      else if (it.type === "TAN") nbTan++;
      else nbEtc++;
    });
  });
  const totalRep = nbTar + nbTan + nbEtc;
  const barEl = $("repartition-bar");
  barEl.innerHTML = "";
  if (totalRep > 0) {
    const segments = [
      { cls: "rep-tar", n: nbTar },
      { cls: "rep-tan", n: nbTan },
      { cls: "rep-etc", n: nbEtc }
    ];
    segments.forEach(seg => {
      if (seg.n <= 0) return;
      const pct = (seg.n / totalRep) * 100;
      const span = document.createElement("span");
      span.className = seg.cls;
      span.style.width = pct.toFixed(1) + "%";
      span.textContent = pct >= 8 ? Math.round(pct) + "%" : "";
      barEl.appendChild(span);
    });
  }
  $("rep-tar-txt").textContent = totalRep ? `${nbTar} (${formatNombre((nbTar / totalRep) * 100, 0)} %)` : "—";
  $("rep-tan-txt").textContent = totalRep ? `${nbTan} (${formatNombre((nbTan / totalRep) * 100, 0)} %)` : "—";
  $("rep-etc-txt").textContent = totalRep ? `${nbEtc} (${formatNombre((nbEtc / totalRep) * 100, 0)} %)` : "—";

  // ----- Historique coloré -----
  const tbody = $("historique-body");
  tbody.innerHTML = "";
  jours.slice(0, 31).forEach(j => {
    const tr = document.createElement("tr");
    tr.className = `row-${getNiveauPerformance("efficience", j.efficience)}`;
    tr.innerHTML = `
      <td>${formatDateFr(j.date)}</td>
      <td>${formatHeures(j.heuresReelles)}</td>
      <td>${formatNombre(j.totalTempsAlloue)}</td>
      <td>${formatPct(j.efficience)}</td>
      <td>${j.totalInterventions}</td>
      <td>${j.totalPieces}</td>
      <td>${j.totalRetours}</td>
    `;
    tbody.appendChild(tr);
  });
}

$("btn-dash-refresh").addEventListener("click", renderTechnicianDashboard);

// ------------------------------------------------------------
// DASHBOARD ADMIN — Statistiques Globales
// ------------------------------------------------------------
let chartEfficienceInstance = null;

// Période sélectionnée dans la vue admin : "jour" | "semaine" | "mois" | "tout"
let adminPeriode = "mois";
let adminPeriodeLabel = "";
let adminEffRows = []; // mémorisé pour l'export (efficience par technicien)

/** Renvoie la plage ISO [start, end] + un libellé pour une période donnée. */
function periodeRangeISO(periode) {
  const iso = d => d.toISOString().slice(0, 10);
  const now = new Date();
  if (periode === "jour") {
    const t = todayISO();
    return { start: t, end: t, label: "Aujourd'hui — " + formatDateFr(t) };
  }
  if (periode === "semaine") {
    const jour = (now.getDay() + 6) % 7; // lundi = 0
    const lundi = new Date(now); lundi.setDate(now.getDate() - jour);
    const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
    return { start: iso(lundi), end: iso(dim), label: "Semaine du " + formatDateFr(iso(lundi)) + " au " + formatDateFr(iso(dim)) };
  }
  if (periode === "tout") {
    return { start: "0000-01-01", end: "9999-12-31", label: "Tout l'historique" };
  }
  const ym = todayISO().slice(0, 7);
  const { start, end } = moisRangeISO(ym);
  return { start, end, label: "Mois en cours — " + ym };
}

// Sélecteur de période (boutons) de la vue admin
document.querySelectorAll("#admin-period-toggle .period-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    document.querySelectorAll("#admin-period-toggle .period-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    adminPeriode = btn.dataset.periode;
    renderAdminDashboard();
  });
});

async function renderAdminDashboard() {
  const { start, end, label } = periodeRangeISO(adminPeriode);
  adminPeriodeLabel = label;
  $("admin-periode-label").textContent = label;

  const [daysSnap, usersSnap] = await Promise.all([
    db.collection("days").where("date", ">=", start).where("date", "<=", end).get(),
    db.collection("users").get()
  ]);

  const nomParUid = {};
  usersSnap.forEach(d => { nomParUid[d.id] = d.data().displayName || d.data().email; });

  const parTechnicien = {};
  let totalTemps = 0, totalHeures = 0, totalPieces = 0, totalInterventions = 0, totalRetours = 0;

  daysSnap.forEach(d => {
    const j = d.data();
    const uid = j.uid;
    if (!parTechnicien[uid]) {
      parTechnicien[uid] = { nom: nomParUid[uid] || j.technicienNom || uid, temps: 0, heures: 0, pieces: 0, interventions: 0, retours: 0 };
    }
    const t = parTechnicien[uid];
    t.temps += j.totalTempsAlloue || 0;
    t.heures += j.heuresReelles || 0;
    t.pieces += j.totalPieces || 0;
    t.interventions += j.totalInterventions || 0;
    t.retours += j.totalRetours || 0;

    totalTemps += j.totalTempsAlloue || 0;
    totalHeures += j.heuresReelles || 0;
    totalPieces += j.totalPieces || 0;
    totalInterventions += j.totalInterventions || 0;
    totalRetours += j.totalRetours || 0;
  });

  $("admin-eff-moyenne").textContent = formatPct(calculEfficience(totalTemps, totalHeures));
  $("admin-pieces-moyenne").textContent = formatNombre(calculConsoPieces(totalPieces, totalInterventions), 2);
  $("admin-taux-retour").textContent = formatPct(calculTauxRetour(totalRetours, totalInterventions));
  $("admin-total-interventions").textContent = totalInterventions;

  const lignes = Object.values(parTechnicien).sort((a, b) => b.temps - a.temps);

  const tbody = $("admin-table-body");
  tbody.innerHTML = "";
  adminEffRows = []; // réinitialise le cache d'export
  lignes.forEach(t => {
    const eff = calculEfficience(t.temps, t.heures);
    const conso = calculConsoPieces(t.pieces, t.interventions);
    const taux = calculTauxRetour(t.retours, t.interventions);
    const tr = document.createElement("tr");
    tr.className = `row-${getNiveauPerformance("efficience", eff)}`;
    tr.innerHTML = `
      <td>${t.nom}</td>
      <td>${formatPct(eff)}</td>
      <td>${t.interventions}</td>
      <td>${formatNombre(conso, 2)}</td>
      <td>${formatPct(taux)}</td>
    `;
    tbody.appendChild(tr);
    adminEffRows.push({
      nom: t.nom,
      eff: eff === null ? null : Math.round(eff * 10) / 10,
      interventions: t.interventions,
      conso: conso === null ? null : Math.round(conso * 100) / 100,
      taux: taux === null ? null : Math.round(taux * 10) / 10
    });
  });

  // Graphique efficience par technicien
  const ctx = $("chart-efficience").getContext("2d");
  const labels = lignes.map(t => t.nom);
  const data = lignes.map(t => {
    const eff = calculEfficience(t.temps, t.heures);
    return eff === null ? 0 : Math.round(eff * 10) / 10;
  });
  if (chartEfficienceInstance) chartEfficienceInstance.destroy();
  chartEfficienceInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Efficience (%)", data, backgroundColor: "#E2001A" }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Section NPS, calculée sur la même période (date de réponse à l'enquête)
  const npsStart = adminPeriode === "tout" ? null : new Date(start + "T00:00:00");
  const npsEnd = adminPeriode === "tout" ? null : new Date(end + "T23:59:59");
  renderNPSAdmin(npsStart, npsEnd);
}

// ------------------------------------------------------------
// EXPORT — Efficience par technicien (Excel + PDF), période courante
// ------------------------------------------------------------
function exporterEfficienceExcel() {
  if (!adminEffRows.length) { alert("Aucune donnée à exporter pour cette période."); return; }
  const aoa = [
    ["Détail efficience par technicien"],
    ["Période", adminPeriodeLabel],
    ["Généré le", formatDateFr(todayISO())],
    [],
    ["Technicien", "Efficience moy. (%)", "Interventions", "Pièces / intervention", "Taux de retour (%)"]
  ];
  adminEffRows.forEach(r => aoa.push([
    r.nom,
    r.eff === null ? "—" : r.eff,
    r.interventions,
    r.conso === null ? "—" : r.conso,
    r.taux === null ? "—" : r.taux
  ]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Efficience");
  XLSX.writeFile(wb, `efficience-${adminPeriode}-${todayISO()}.xlsx`);
}

function exporterEfficiencePDF() {
  if (!adminEffRows.length) { alert("Aucune donnée à exporter pour cette période."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(15);
  doc.text("Efficience par technicien", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Période : " + adminPeriodeLabel, 14, 23);
  doc.text("Généré le " + formatDateFr(todayISO()), 14, 28);
  doc.autoTable({
    startY: 33,
    head: [["Technicien", "Efficience moy.", "Interventions", "Pièces / interv.", "Taux retour"]],
    body: adminEffRows.map(r => [
      r.nom,
      r.eff === null ? "—" : r.eff + " %",
      r.interventions,
      r.conso === null ? "—" : r.conso,
      r.taux === null ? "—" : r.taux + " %"
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [226, 0, 26] }
  });
  doc.save(`efficience-${adminPeriode}-${todayISO()}.pdf`);
}

$("btn-export-excel").addEventListener("click", exporterEfficienceExcel);
$("btn-export-pdf").addEventListener("click", exporterEfficiencePDF);

// ------------------------------------------------------------
// STATS EQUIPE — moyennes anonymisées, visibles par tous
// ------------------------------------------------------------
let equipePeriode = "mois"; // "jour" | "mois" — piloté par le toggle #eq-period-toggle
let equipeLiveUnsub = null; // fonction de désinscription du listener temps réel (mode "jour")

document.querySelectorAll("#eq-period-toggle .period-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    document.querySelectorAll("#eq-period-toggle .period-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    equipePeriode = btn.dataset.periode;
    $("eq-month-label").classList.toggle("hidden", equipePeriode === "jour");
    renderStatsEquipe();
  });
});

$("inp-equipe-month").addEventListener("change", () => {
  if (equipePeriode === "mois") renderStatsEquipe();
});

/** Coupe le listener temps réel Firestore (mode "jour") s'il est actif. */
function arreterStatsEquipeLive() {
  if (equipeLiveUnsub) {
    equipeLiveUnsub();
    equipeLiveUnsub = null;
  }
}

function renderStatsEquipe() {
  if (equipePeriode === "jour") {
    $("eq-hint").textContent = "⚡ Mis à jour en temps réel — moyennes de l'équipe pour aujourd'hui. Aucun nom n'est affiché ici.";
    $("eq-resume-title").textContent = "Résumé du jour — toute l'équipe";
    $("eq-total-interventions-label").textContent = "Interventions (jour)";
    demarrerStatsEquipeJourTempsReel();
  } else {
    arreterStatsEquipeLive();
    $("eq-hint").textContent = "Moyennes calculées sur l'ensemble des techniciens pour le mois choisi. Aucun nom n'est affiché ici.";
    $("eq-resume-title").textContent = "Résumé du mois — toute l'équipe";
    $("eq-total-interventions-label").textContent = "Interventions (mois)";
    chargerStatsEquipeMois();
  }
}

async function chargerStatsEquipeMois() {
  if (!$("inp-equipe-month").value) {
    $("inp-equipe-month").value = todayISO().slice(0, 7);
  }
  const moisChoisi = $("inp-equipe-month").value;
  const { start, end } = moisRangeISO(moisChoisi);

  try {
    const snap = await db.collection("days")
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get({ source: "server" });
    const jours = snap.docs.map(d => d.data()); // pas de champ "nom" utilisé ci-dessous : tout reste anonyme
    afficherStatsEquipe(jours);
  } catch (err) {
    console.error("[Efficience] Échec du chargement des stats équipe :", err);
    $("eq-familles-body").innerHTML = `<tr><td colspan="4">Erreur de chargement : ${err.message}</td></tr>`;
  }
}

/** Écoute en temps réel les journées du jour pour toute l'équipe (mode "Aujourd'hui"). */
function demarrerStatsEquipeJourTempsReel() {
  arreterStatsEquipeLive();
  const today = todayISO();
  equipeLiveUnsub = db.collection("days")
    .where("date", "==", today)
    .onSnapshot(
      snap => afficherStatsEquipe(snap.docs.map(d => d.data())), // pas de champ "nom" lu ci-dessous : tout reste anonyme
      err => {
        console.error("[Efficience] Échec du suivi temps réel des stats équipe :", err);
        $("eq-familles-body").innerHTML = `<tr><td colspan="4">Erreur de chargement : ${err.message}</td></tr>`;
      }
    );
}

function afficherStatsEquipe(jours) {
  let totalTemps = 0, totalHeures = 0, totalPieces = 0, totalInterventions = 0, totalRetours = 0;
  let nbTar = 0, nbTan = 0, nbEtc = 0;
  const techniciensActifs = new Set();
  const parFamille = {}; // { FAM: { count, temps, pieces } }

  jours.forEach(j => {
    totalTemps += j.totalTempsAlloue || 0;
    totalHeures += j.heuresReelles || 0;
    totalPieces += j.totalPieces || 0;
    totalInterventions += j.totalInterventions || 0;
    totalRetours += j.totalRetours || 0;
    if ((j.heuresReelles || 0) > 0 && j.uid) techniciensActifs.add(j.uid);

    (j.interventions || []).forEach(it => {
      if (it.type === "TAR") nbTar++;
      else if (it.type === "TAN") nbTan++;
      else nbEtc++;

      if (!parFamille[it.fam]) parFamille[it.fam] = { count: 0, temps: 0, pieces: 0 };
      const f = parFamille[it.fam];
      f.count++;
      f.temps += it.tempsAlloue || 0;
      f.pieces += it.nbPieces || 0;
    });
  });

  const effEquipe = calculEfficience(totalTemps, totalHeures);
  const consoEquipe = calculConsoPieces(totalPieces, totalInterventions);
  const tauxRetourEquipe = calculTauxRetour(totalRetours, totalInterventions);

  renderJauge("jauge-eq-eff", effEquipe, "efficience", 120, formatPct(effEquipe));
  renderJauge("jauge-eq-conso", consoEquipe, "consoPieces", 2, formatNombre(consoEquipe, 2));
  renderJauge("jauge-eq-retour", tauxRetourEquipe, "tauxRetour", 20, formatPct(tauxRetourEquipe));

  $("eq-nb-techniciens").textContent = techniciensActifs.size;
  $("eq-total-interventions").textContent = totalInterventions;
  $("eq-total-pieces").textContent = totalPieces;
  $("eq-total-heures").textContent = formatHeures(totalHeures);

  const totalRep = nbTar + nbTan + nbEtc;
  const barEl = $("eq-repartition-bar");
  barEl.innerHTML = "";
  if (totalRep > 0) {
    [
      { cls: "rep-tar", n: nbTar },
      { cls: "rep-tan", n: nbTan },
      { cls: "rep-etc", n: nbEtc }
    ].forEach(seg => {
      if (seg.n <= 0) return;
      const pct = (seg.n / totalRep) * 100;
      const span = document.createElement("span");
      span.className = seg.cls;
      span.style.width = pct.toFixed(1) + "%";
      span.textContent = pct >= 8 ? Math.round(pct) + "%" : "";
      barEl.appendChild(span);
    });
  }
  $("eq-rep-tar-txt").textContent = totalRep ? `${nbTar} (${formatNombre((nbTar / totalRep) * 100, 0)} %)` : "—";
  $("eq-rep-tan-txt").textContent = totalRep ? `${nbTan} (${formatNombre((nbTan / totalRep) * 100, 0)} %)` : "—";
  $("eq-rep-etc-txt").textContent = totalRep ? `${nbEtc} (${formatNombre((nbEtc / totalRep) * 100, 0)} %)` : "—";

  // Top 10 familles par nombre d'interventions
  const lignesFamilles = Object.entries(parFamille)
    .map(([fam, f]) => ({
      fam,
      count: f.count,
      tempsMoyen: f.count ? f.temps / f.count : 0,
      piecesParInter: f.count ? f.pieces / f.count : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const tbodyFam = $("eq-familles-body");
  tbodyFam.innerHTML = "";
  if (!lignesFamilles.length) {
    const msg = equipePeriode === "jour" ? "Aucune intervention aujourd'hui." : "Aucune intervention ce mois-ci.";
    tbodyFam.innerHTML = `<tr><td colspan="4">${msg}</td></tr>`;
  } else {
    lignesFamilles.forEach(f => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${f.fam}</td>
        <td>${f.count}</td>
        <td>${formatHeures(f.tempsMoyen)}</td>
        <td>${formatNombre(f.piecesParInter, 2)}</td>
      `;
      tbodyFam.appendChild(tr);
    });
  }
}
