// ============================================================
// RETOURS ATELIER — lecture de l'export + taux de retour par technicien
// ------------------------------------------------------------
// Fichier hébergé dans le repo. Pour mettre à jour, remplacer le fichier
// par le nouvel export en gardant EXACTEMENT le même nom :
//   -> retours-export.xlsx  (à la racine du site)
//
// Le fichier liste TOUTES les interventions de l'atelier sur ~30 jours.
// Une intervention est un « retour » quand NB RETOUR ATL PERIODE >= 1
// (l'appareil était déjà passé à l'atelier et revient). Le retour est
// attribué au « TECHNICIEN RETOUR » (= technicien de la réparation d'origine).
// Règle métier : un retour ne compte PAS si la réparation d'origine était un TAN.
//
// Les techniciens sont identifiés par leur NOM (ex. « BIANCHI MATHIS »).
// ============================================================

const RETOURS_FILE = "retours-export.xlsx"; // <-- remplacer ce fichier pour mettre à jour

// Noms d'en-têtes attendus (repérés par nom => robuste si l'ordre des colonnes change)
const RET_COLS = {
  dossier: "NUM DOS NOMAD",
  nbRetour: "NB RETOUR ATL PERIODE",
  marque: "MARQUE",
  famille: "FAMILLE",
  dateActuelle: "DATE TERMINE ATELIER",
  techActuel: "NOM TECH AFN",
  resultActuel: "COPER TERM ATL",
  datePrec: "DATE TERMINE ATELIER PREC",
  techPrec: "NOM TECH AFN PREC",
  resultPrec: "COPER TERM ATL PREC",
  techRetour: "TECHNICIEN RETOUR"
};

let retoursData = null;        // tableau d'objets normalisés
let retoursLoading = null;
let retoursFileDate = null;
let retoursSelectedTech = localStorage.getItem("retoursSelectedTech") || "";
let retoursExclureTAN = (localStorage.getItem("retoursExclureTAN") !== "false"); // défaut: true
let retoursInitialise = false;

// ------------------------------------------------------------
// Chargement + parsing
// ------------------------------------------------------------
async function chargerDonneesRetours() {
  if (retoursData) return retoursData;
  if (retoursLoading) return retoursLoading;

  retoursLoading = (async () => {
    const resp = await fetch(RETOURS_FILE, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Fichier retours introuvable (${RETOURS_FILE}) — code ${resp.status}`);
    retoursFileDate = resp.headers.get("Last-Modified");
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Repère la ligne d'en-têtes (celle qui contient "NB RETOUR ATL PERIODE")
    const hr = rows.findIndex(r => Array.isArray(r) && r.some(c => c === RET_COLS.nbRetour));
    if (hr === -1) throw new Error("En-têtes du fichier retours introuvables.");
    const H = {};
    rows[hr].forEach((h, i) => { if (h != null) H[String(h).trim()] = i; });
    const idx = (key) => H[RET_COLS[key]];

    const data = [];
    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const techActuel = txt(r[idx("techActuel")]);
      const nbRetour = Number(r[idx("nbRetour")]) || 0;
      const dossier = txt(r[idx("dossier")]);
      if (!dossier && !techActuel && !nbRetour) continue; // ligne vide
      data.push({
        dossier,
        nbRetour,
        marque: txt(r[idx("marque")]),
        famille: txt(r[idx("famille")]),
        dateActuelle: r[idx("dateActuelle")] instanceof Date ? r[idx("dateActuelle")] : null,
        techActuel,
        resultActuel: txt(r[idx("resultActuel")]),
        datePrec: r[idx("datePrec")] instanceof Date ? r[idx("datePrec")] : null,
        techPrec: txt(r[idx("techPrec")]),
        resultPrec: txt(r[idx("resultPrec")]),
        techRetour: txt(r[idx("techRetour")])
      });
    }
    retoursData = data;
    return data;
  })();

  return retoursLoading;
}

function txt(v) { return (v == null ? "" : String(v)).trim(); }

// ------------------------------------------------------------
// Logique métier
// ------------------------------------------------------------
function estRetour(rec) { return rec.nbRetour >= 1; }

// Un retour est « compté » s'il est un retour et (si on exclut les TAN) que la
// réparation d'origine n'était pas un TAN.
function retourCompte(rec) {
  if (!estRetour(rec)) return false;
  if (retoursExclureTAN && rec.resultPrec === "TAN") return false;
  return true;
}

// Taux de retour d'un technicien = retours qui lui sont attribués / interventions réalisées
function calculTauxRetourTech(tech) {
  const interventions = retoursData.filter(r => r.techActuel === tech).length;
  const retours = retoursData.filter(r => r.techRetour === tech && retourCompte(r)).length;
  const taux = interventions ? (retours / interventions) * 100 : null;
  return { interventions, retours, taux };
}

function calculTauxRetourGlobal() {
  const interventions = retoursData.length;
  const retours = retoursData.filter(retourCompte).length;
  const taux = interventions ? (retours / interventions) * 100 : null;
  return { interventions, retours, taux };
}

// Liste triée des techniciens (ceux qui ont réalisé des interventions)
function retoursTechniciens() {
  return [...new Set(retoursData.map(r => r.techActuel).filter(Boolean))].sort();
}

// ------------------------------------------------------------
// Jauge taux de retour (plus c'est bas, mieux c'est)
// ------------------------------------------------------------
function couleurRetour(taux) {
  if (taux === null) return "jauge-neutre";
  if (taux <= 3) return "jauge-vert";
  if (taux <= 6) return "jauge-orange";
  return "jauge-rouge";
}

function majJaugeRetour(circleId, valId, sousId, res) {
  const circle = document.getElementById(circleId);
  const val = document.getElementById(valId);
  const sous = sousId ? document.getElementById(sousId) : null;
  if (!circle) return;
  circle.className = "jauge-circle " + couleurRetour(res.taux);
  const pct = res.taux === null ? 0 : Math.min(res.taux * 6, 100); // échelle visuelle
  circle.style.setProperty("--pct", pct);
  if (val) val.textContent = res.taux === null ? "—" : res.taux.toFixed(1) + "%";
  if (sous) sous.textContent = res.interventions
    ? `${res.retours} retour${res.retours > 1 ? "s" : ""} / ${res.interventions} interv.`
    : "Aucune intervention";
}

// ------------------------------------------------------------
// Rendu de la vue Retours
// ------------------------------------------------------------
async function renderRetours() {
  const statut = document.getElementById("retours-statut");
  try {
    if (!retoursData) {
      if (statut) { statut.textContent = "Chargement des retours…"; statut.classList.remove("hidden"); }
      await chargerDonneesRetours();
      if (statut) statut.classList.add("hidden");
    }
  } catch (e) {
    if (statut) { statut.textContent = "❌ " + e.message; statut.classList.remove("hidden"); }
    return;
  }

  afficherDateFichierRetours("retours-date");
  majJaugeRetour("retours-jauge-global", "retours-jauge-global-val", "retours-jauge-global-sous", calculTauxRetourGlobal());

  if (!retoursInitialise) {
    setupRetoursTechSearch();
    const cb = document.getElementById("retours-exclure-tan");
    if (cb) {
      cb.checked = retoursExclureTAN;
      cb.addEventListener("change", () => {
        retoursExclureTAN = cb.checked;
        localStorage.setItem("retoursExclureTAN", retoursExclureTAN);
        majJaugeRetour("retours-jauge-global", "retours-jauge-global-val", "retours-jauge-global-sous", calculTauxRetourGlobal());
        if (retoursSelectedTech) majVueRetourTech(retoursSelectedTech);
      });
    }
    retoursInitialise = true;
  }

  if (retoursSelectedTech && retoursTechniciens().includes(retoursSelectedTech)) {
    document.getElementById("retours-tech-input").value = retoursSelectedTech;
    majVueRetourTech(retoursSelectedTech);
  } else {
    majVueRetourTech(null);
  }
}

function setupRetoursTechSearch() {
  const input = document.getElementById("retours-tech-input");
  const results = document.getElementById("retours-tech-results");
  if (!input || !results) return;

  const afficher = (liste) => {
    results.innerHTML = "";
    if (!liste.length) { results.classList.add("hidden"); return; }
    liste.forEach(nom => {
      const div = document.createElement("div");
      div.textContent = nom;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = nom;
        results.classList.add("hidden");
        retoursSelectedTech = nom;
        localStorage.setItem("retoursSelectedTech", nom);
        majVueRetourTech(nom);
      });
      results.appendChild(div);
    });
    results.classList.remove("hidden");
  };
  const filtrer = (q) => {
    q = (q || "").toLowerCase().trim();
    const noms = retoursTechniciens();
    return q ? noms.filter(n => n.toLowerCase().includes(q)) : noms;
  };
  input.addEventListener("focus", () => { input.select(); afficher(retoursTechniciens()); });
  input.addEventListener("input", () => afficher(filtrer(input.value)));
  document.addEventListener("click", (e) => {
    if (e.target !== input && !results.contains(e.target)) results.classList.add("hidden");
  });
}

function majVueRetourTech(tech) {
  const blocs = document.querySelectorAll(".retours-bloc-tech");
  if (!tech) { blocs.forEach(b => b.classList.add("hidden")); return; }
  blocs.forEach(b => b.classList.remove("hidden"));
  majJaugeRetour("retours-jauge-tech", "retours-jauge-tech-val", "retours-jauge-tech-sous", calculTauxRetourTech(tech));
  renderListeRetoursTech(tech);
}

function renderListeRetoursTech(tech) {
  const cont = document.getElementById("retours-liste");
  const titre = document.getElementById("retours-liste-titre");
  if (!cont) return;

  const liste = retoursData
    .filter(r => r.techRetour === tech && retourCompte(r))
    .sort((a, b) => (b.dateActuelle?.getTime() || 0) - (a.dateActuelle?.getTime() || 0));

  if (titre) titre.textContent = `Appareils revenus attribués à ${tech} — ${liste.length}`;

  if (!liste.length) {
    cont.innerHTML = `<p class="hint">Aucun retour attribué à ce technicien sur la période${retoursExclureTAN ? " (hors réparations TAN)" : ""}.</p>`;
    return;
  }

  cont.innerHTML = liste.map(r => `
    <div class="retour-carte">
      <div class="retour-carte-head">
        <span class="retour-topage retour-topage-${(r.resultPrec || "na").toLowerCase()}">${r.resultPrec || "—"}</span>
        <span class="retour-appareil">${escapeRet(r.marque)} · ${escapeRet(r.famille)}</span>
        <span class="retour-dossier">Dossier&nbsp;: ${r.dossier || "—"}</span>
      </div>
      <p class="retour-carte-sub">
        Réparé le ${dateFr(r.datePrec)} → revenu le ${dateFr(r.dateActuelle)}
        ${r.resultActuel ? ` · re-traitement : <strong>${r.resultActuel}</strong>` : ""}
      </p>
    </div>`).join("");
}

function afficherDateFichierRetours(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!retoursFileDate) { el.textContent = ""; return; }
  const d = new Date(retoursFileDate);
  if (isNaN(d)) { el.textContent = ""; return; }
  el.textContent = "📄 Données à jour au " + d.toLocaleDateString("fr-FR") +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dateFr(d) {
  return (d instanceof Date && !isNaN(d)) ? d.toLocaleDateString("fr-FR") : "—";
}
function escapeRet(s) {
  return (s || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ------------------------------------------------------------
// Branche la vue Retours dans la navigation SANS modifier app.js :
// on enveloppe switchView (fonction globale) pour appeler renderRetours().
// ------------------------------------------------------------
if (typeof switchView === "function") {
  const _switchViewOrig = switchView;
  // eslint-disable-next-line no-global-assign
  switchView = function (viewName) {
    _switchViewOrig(viewName);
    if (viewName === "retours") renderRetours();
  };
}
