// ============================================================
// APPLICATION — Suivi Efficience Atelier
// ============================================================

let currentUser = null; // { uid, email, displayName, role }
let currentDay = { date: null, heuresReelles: null, interventions: [] };

const todayISO = () => new Date().toISOString().slice(0, 10);

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

  if (viewName === "dashboard") renderTechnicianDashboard();
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
    "auth/invalid-credential": "Email ou mot de passe incorrect."
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
// VUE SAISIE — initialisation des listes déroulantes
// ------------------------------------------------------------
function initSaisieView() {
  const dl = $("dl-famille");
  dl.innerHTML = "";
  getFamillesOptions().forEach(f => {
    const opt = document.createElement("option");
    opt.value = `${f.libelle} (${f.fam})`;
    dl.appendChild(opt);
  });

  const selMarque = $("inp-marque");
  selMarque.innerHTML = '<option value="">— Aucune / Autre —</option>';
  (window.MARQUES_LIST || []).forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selMarque.appendChild(opt);
  });

  $("inp-date").value = todayISO();
  loadDayForDate(todayISO());
}

$("inp-date").addEventListener("change", (e) => loadDayForDate(e.target.value));

["inp-famille", "inp-marque", "inp-type"].forEach(id => {
  $(id).addEventListener("input", updateTempsAllouePreview);
  $(id).addEventListener("change", updateTempsAllouePreview);
});

function updateTempsAllouePreview() {
  const fam = extraireCodeFamille($("inp-famille").value);
  const marque = $("inp-marque").value;
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
// GESTION DE LA JOURNEE EN COURS
// ------------------------------------------------------------
async function loadDayForDate(date) {
  currentDay = { date, heuresReelles: null, interventions: [] };
  $("inp-heures-reelles").value = "";
  $("save-day-success").textContent = "";

  const docId = `${currentUser.uid}_${date}`;
  const snap = await db.collection("days").doc(docId).get();
  if (snap.exists) {
    const data = snap.data();
    currentDay.heuresReelles = data.heuresReelles;
    currentDay.interventions = data.interventions || [];
    $("inp-heures-reelles").value = data.heuresReelles ?? "";
  }
  renderInterventionsTable();
}

$("inp-heures-reelles").addEventListener("input", () => {
  currentDay.heuresReelles = parseFloat($("inp-heures-reelles").value) || null;
  renderInterventionsTable();
});

$("btn-add-intervention").addEventListener("click", () => {
  $("intervention-error").textContent = "";
  const fam = extraireCodeFamille($("inp-famille").value);
  const marque = $("inp-marque").value;
  const type = $("inp-type").value;
  const nbPieces = parseInt($("inp-pieces").value, 10) || 0;
  const retour = $("inp-retour").checked;

  if (!fam) {
    $("intervention-error").textContent = "Merci de sélectionner une famille de produit.";
    return;
  }
  const res = getTempsAlloue(fam, marque, type);
  if (!res) {
    $("intervention-error").textContent = "Aucun temps standard trouvé pour cette famille / marque. Vérifiez la saisie.";
    return;
  }

  currentDay.interventions.push({
    fam, marque, type,
    tempsAlloue: res.temps,
    source: res.source,
    nbPieces, retour
  });

  // reset du formulaire d'ajout
  $("inp-famille").value = "";
  $("inp-marque").value = "";
  $("inp-pieces").value = 0;
  $("inp-retour").checked = false;
  updateTempsAllouePreview();

  renderInterventionsTable();
});

function renderInterventionsTable() {
  const tbody = $("table-interventions-body");
  tbody.innerHTML = "";
  let totalTemps = 0, totalPieces = 0, totalRetours = 0;

  currentDay.interventions.forEach((it, idx) => {
    totalTemps += it.tempsAlloue;
    totalPieces += it.nbPieces;
    if (it.retour) totalRetours += 1;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.fam}</td>
      <td>${it.marque || "—"}</td>
      <td>${it.type}</td>
      <td>${formatNombre(it.tempsAlloue)}</td>
      <td>${it.nbPieces}</td>
      <td>${it.retour ? "✅" : ""}</td>
      <td><button class="btn-danger-sm" data-idx="${idx}" title="Supprimer">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentDay.interventions.splice(parseInt(btn.dataset.idx, 10), 1);
      renderInterventionsTable();
    });
  });

  $("total-temps-alloue").innerHTML = `<strong>${formatNombre(totalTemps)}</strong>`;
  $("total-pieces").innerHTML = `<strong>${totalPieces}</strong>`;
  $("total-retours").innerHTML = `<strong>${totalRetours}</strong>`;

  const eff = calculEfficience(totalTemps, currentDay.heuresReelles);
  $("efficience-jour-live").textContent = formatPct(eff);
}

$("btn-save-day").addEventListener("click", async () => {
  $("save-day-success").textContent = "";
  const date = $("inp-date").value;
  const heuresReelles = parseFloat($("inp-heures-reelles").value) || 0;
  if (!heuresReelles) {
    $("save-day-success").style.color = "#dc2626";
    $("save-day-success").textContent = "Merci de saisir le temps de travail réel avant d'enregistrer.";
    return;
  }
  const totalTemps = currentDay.interventions.reduce((s, i) => s + i.tempsAlloue, 0);
  const totalPieces = currentDay.interventions.reduce((s, i) => s + i.nbPieces, 0);
  const totalRetours = currentDay.interventions.filter(i => i.retour).length;
  const efficience = calculEfficience(totalTemps, heuresReelles);

  const docId = `${currentUser.uid}_${date}`;
  await db.collection("days").doc(docId).set({
    uid: currentUser.uid,
    technicienNom: currentUser.displayName,
    date,
    heuresReelles,
    interventions: currentDay.interventions,
    totalTempsAlloue: totalTemps,
    totalPieces,
    totalRetours,
    totalInterventions: currentDay.interventions.length,
    efficience: efficience,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  $("save-day-success").style.color = "#16a34a";
  $("save-day-success").textContent = "Journée enregistrée ✅";
});

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

async function renderTechnicianDashboard() {
  const today = todayISO();
  const moisActuel = today.slice(0, 7);
  const { start, end } = moisRangeISO(moisActuel);

  const snap = await db.collection("days")
    .where("uid", "==", currentUser.uid)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .orderBy("date", "desc")
    .get();

  const jours = snap.docs.map(d => d.data());
  const jourActuel = jours.find(j => j.date === today);

  const totalTempsMois = jours.reduce((s, j) => s + (j.totalTempsAlloue || 0), 0);
  const totalHeuresMois = jours.reduce((s, j) => s + (j.heuresReelles || 0), 0);
  const totalPiecesMois = jours.reduce((s, j) => s + (j.totalPieces || 0), 0);
  const totalInterventionsMois = jours.reduce((s, j) => s + (j.totalInterventions || 0), 0);
  const totalRetoursMois = jours.reduce((s, j) => s + (j.totalRetours || 0), 0);
  const nbJoursMois = jours.length || 1;

  $("stat-eff-jour").textContent = jourActuel ? formatPct(jourActuel.efficience) : "—";
  $("stat-eff-mois").textContent = formatPct(calculEfficience(totalTempsMois, totalHeuresMois));
  $("stat-pieces-jour").textContent = jourActuel ? formatNombre(jourActuel.totalPieces, 1) : "—";
  $("stat-pieces-mois").textContent = formatNombre(totalPiecesMois / nbJoursMois, 1) + " /jour";
  $("stat-taux-retour").textContent = formatPct(calculTauxRetour(totalRetoursMois, totalInterventionsMois));
  $("stat-nb-interventions").textContent = totalInterventionsMois;

  const tbody = $("historique-body");
  tbody.innerHTML = "";
  jours.slice(0, 31).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${j.date}</td>
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

// ------------------------------------------------------------
// DASHBOARD ADMIN — Statistiques Globales
// ------------------------------------------------------------
let chartEfficienceInstance = null;

$("btn-admin-refresh").addEventListener("click", renderAdminDashboard);

async function renderAdminDashboard() {
  if (!$("inp-admin-month").value) {
    $("inp-admin-month").value = todayISO().slice(0, 7);
  }
  const moisChoisi = $("inp-admin-month").value;
  const { start, end } = moisRangeISO(moisChoisi);

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
  lignes.forEach(t => {
    const eff = calculEfficience(t.temps, t.heures);
    const conso = calculConsoPieces(t.pieces, t.interventions);
    const taux = calculTauxRetour(t.retours, t.interventions);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.nom}</td>
      <td>${formatPct(eff)}</td>
      <td>${t.interventions}</td>
      <td>${formatNombre(conso, 2)}</td>
      <td>${formatPct(taux)}</td>
    `;
    tbody.appendChild(tr);
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
      datasets: [{ label: "Efficience (%)", data, backgroundColor: "#2563eb" }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}
