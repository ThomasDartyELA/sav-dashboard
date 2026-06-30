// ============================================================
// bilan.js — Fiche technicien unifiée (NPS + Retours) + Scorecard manager
// ------------------------------------------------------------
// Croise les données NPS (par code) et Retours (par nom) grâce à la table
// de correspondance techniciens.js. Chargé uniquement par index2.html ;
// s'enveloppe autour de switchView SANS modifier app.js.
// ============================================================

let bilanInitialise = false;
let bilanSelectedCode = localStorage.getItem("bilanSelectedCode") || "";

// Retrouve le nom tel qu'écrit dans le fichier Retours pour une entrée technicien
function retourNomDe(entry) {
  if (!entry || typeof retoursTechniciens !== "function" || !retoursData) return null;
  const cible = entry._mots || techNormMots(entry.nom);
  return retoursTechniciens().find(n => techNormMots(n) === cible) || null;
}

// NPS d'un technicien (par code)
function npsDeTech(entry) {
  if (!npsData) return null;
  return calculerNPS(npsData.filter(d => d.tech === entry.code).map(d => d.note));
}

// ------------------------------------------------------------
// VUE BILAN (fiche d'un technicien)
// ------------------------------------------------------------
async function renderBilan() {
  const statut = document.getElementById("bilan-statut");
  try {
    if (!npsData || !retoursData) {
      if (statut) { statut.textContent = "Chargement des données…"; statut.classList.remove("hidden"); }
      await Promise.all([chargerDonneesNPS(), chargerDonneesRetours()]);
      if (statut) statut.classList.add("hidden");
    }
  } catch (e) {
    if (statut) { statut.textContent = "❌ " + e.message; statut.classList.remove("hidden"); }
    return;
  }

  if (!bilanInitialise) {
    setupBilanSearch();
    bilanInitialise = true;
  }

  const entry = bilanSelectedCode ? techParCode(bilanSelectedCode) : null;
  if (entry) {
    document.getElementById("bilan-tech-input").value = entry.nom;
    majFicheBilan(entry);
  } else {
    majFicheBilan(null);
  }
}

function setupBilanSearch() {
  const input = document.getElementById("bilan-tech-input");
  const results = document.getElementById("bilan-tech-results");
  if (!input || !results) return;
  const liste = techniciensTries();

  const afficher = (arr) => {
    results.innerHTML = "";
    if (!arr.length) { results.classList.add("hidden"); return; }
    arr.forEach(t => {
      const div = document.createElement("div");
      div.textContent = `${t.nom} (${t.code})`;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = t.nom;
        results.classList.add("hidden");
        bilanSelectedCode = t.code;
        localStorage.setItem("bilanSelectedCode", t.code);
        majFicheBilan(t);
      });
      results.appendChild(div);
    });
    results.classList.remove("hidden");
  };
  const filtrer = (q) => {
    q = (q || "").toLowerCase().trim();
    return q ? liste.filter(t => t.nom.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) : liste;
  };
  input.addEventListener("focus", () => { input.select(); afficher(liste); });
  input.addEventListener("input", () => afficher(filtrer(input.value)));
  document.addEventListener("click", (e) => {
    if (e.target !== input && !results.contains(e.target)) results.classList.add("hidden");
  });
}

function majFicheBilan(entry) {
  const bloc = document.getElementById("bilan-fiche");
  if (!entry) { if (bloc) bloc.classList.add("hidden"); return; }
  if (bloc) bloc.classList.remove("hidden");

  document.getElementById("bilan-nom").textContent = entry.nom;
  document.getElementById("bilan-code").textContent = "Code NPS : " + entry.code;

  // NPS
  const npsRes = npsDeTech(entry);
  majJaugeNPS("bilan-nps-jauge", "bilan-nps-val", "bilan-nps-sous", npsRes || { score: null, total: 0, moyenne: null });

  // Retours
  const retNom = retourNomDe(entry);
  const retRes = retNom ? calculTauxRetourTech(retNom) : { interventions: 0, retours: 0, taux: null };
  majJaugeRetour("bilan-retour-jauge", "bilan-retour-val", "bilan-retour-sous", retRes);

  // Note d'absence de données
  const note = document.getElementById("bilan-note");
  const manques = [];
  if (!npsRes || !npsRes.total) manques.push("aucune réponse NPS");
  if (!retNom) manques.push("non trouvé dans le fichier Retours");
  note.textContent = manques.length ? "ℹ️ " + manques.join(" · ") + " pour ce technicien sur la période." : "";
  note.classList.toggle("hidden", !manques.length);
}

// ------------------------------------------------------------
// SCORECARD MANAGER (tableau combiné, dans la vue admin)
// ------------------------------------------------------------
async function renderScorecard() {
  const tbody = document.getElementById("scorecard-body");
  if (!tbody) return;
  try {
    if (!npsData || !retoursData) await Promise.all([chargerDonneesNPS(), chargerDonneesRetours()]);
  } catch (e) { return; }

  const lignes = TECHNICIENS.map(t => {
    const nps = npsDeTech(t);
    const retNom = retourNomDe(t);
    const ret = retNom ? calculTauxRetourTech(retNom) : { interventions: 0, retours: 0, taux: null };
    return {
      nom: t.nom, code: t.code,
      npsScore: nps && nps.total ? nps.score : null,
      npsMoy: nps && nps.total ? nps.moyenne : null,
      npsN: nps ? nps.total : 0,
      taux: ret.taux, retours: ret.retours, interventions: ret.interventions
    };
  }).filter(l => l.npsN > 0 || l.interventions > 0) // on masque les comptes sans aucune donnée
    .sort((a, b) => (b.npsScore ?? -999) - (a.npsScore ?? -999));

  tbody.innerHTML = lignes.map(l => `
    <tr>
      <td><strong>${l.nom}</strong></td>
      <td>${l.code}</td>
      <td>${l.npsScore === null ? "—" : `<span class="nps-score-pill ${pillNPS(l.npsScore)}">${l.npsScore > 0 ? "+" + l.npsScore : l.npsScore}</span>`}</td>
      <td>${l.npsMoy === null ? "—" : l.npsMoy.toFixed(1)}</td>
      <td>${l.npsN || "—"}</td>
      <td>${l.taux === null ? "—" : `<span class="nps-score-pill ${pillRetour(l.taux)}">${l.taux.toFixed(1)}%</span>`}</td>
      <td>${l.interventions ? `${l.retours}/${l.interventions}` : "—"}</td>
    </tr>`).join("");
}

function pillNPS(score) {
  if (score === null) return "pill-neutre";
  if (score >= 50) return "pill-vert";
  if (score >= 0) return "pill-orange";
  return "pill-rouge";
}
function pillRetour(taux) {
  if (taux === null) return "pill-neutre";
  if (taux <= 3) return "pill-vert";
  if (taux <= 6) return "pill-orange";
  return "pill-rouge";
}

// ------------------------------------------------------------
// Branche les vues SANS modifier app.js (enveloppe switchView)
// ------------------------------------------------------------
if (typeof switchView === "function") {
  const _svBilan = switchView;
  // eslint-disable-next-line no-global-assign
  switchView = function (viewName) {
    _svBilan(viewName);
    if (viewName === "bilan") renderBilan();
    if (viewName === "admin") renderScorecard();
  };
}
