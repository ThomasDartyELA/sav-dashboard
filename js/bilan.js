// ============================================================
// bilan.js — Page UNIQUE « Bilan technicien » : NPS + Retours réunis en détail
//            + Scorecard manager. Chargé uniquement par index2.html ;
//            s'enveloppe autour de switchView SANS modifier app.js.
// Réutilise les fonctions « pures » de nps-logic.js et retours-logic.js.
// ============================================================

let bilanInitialise = false;
let bilanSelectedCode = localStorage.getItem("bilanSelectedCode") || "";
let bilanFiltreCat = "tous";       // tous | detracteur | passif | promoteur
let bilanFiltreComment = false;

// --- helpers de croisement -------------------------------------------------
function retourNomDe(entry) {
  if (!entry || typeof retoursTechniciens !== "function" || !retoursData) return null;
  const cible = entry._mots || techNormMots(entry.nom);
  return retoursTechniciens().find(n => techNormMots(n) === cible) || null;
}
function npsDeTech(entry) {
  if (!npsData) return null;
  return calculerNPS(npsData.filter(d => d.tech === entry.code).map(d => d.note));
}

// --- Efficience mensuelle (depuis Firestore "days", agrégée par NOM) --------
let efficienceMois = null;     // { motsTriés -> { nom, temps, heures, interventions, eff } }
let monEfficienceMois = null;  // efficience du COMPTE connecté (jamais celle d'un autre)
function estManager() { return (typeof currentUser !== "undefined" && currentUser && currentUser.role === "admin"); }

async function chargerEfficienceMois() {
  if (efficienceMois) return efficienceMois;
  const ym = (typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10)).slice(0, 7);
  const { start, end } = moisRangeISO(ym);
  const monUid = (typeof currentUser !== "undefined" && currentUser) ? currentUser.uid : null;
  const parNom = {};
  let mt = 0, mh = 0, mi = 0; // agrégat du compte connecté
  try {
    const snap = await db.collection("days").where("date", ">=", start).where("date", "<=", end).get();
    snap.forEach(doc => {
      const j = doc.data();
      const key = techNormMots(j.technicienNom || "");
      if (key) {
        const e = parNom[key] || (parNom[key] = { nom: j.technicienNom, temps: 0, heures: 0, interventions: 0 });
        e.temps += j.totalTempsAlloue || 0;
        e.heures += j.heuresReelles || 0;
        e.interventions += j.totalInterventions || 0;
      }
      if (monUid && j.uid === monUid) { mt += j.totalTempsAlloue || 0; mh += j.heuresReelles || 0; mi += j.totalInterventions || 0; }
    });
  } catch (e) { /* lecture impossible -> efficience indisponible */ }
  Object.values(parNom).forEach(e => { e.eff = calculEfficience(e.temps, e.heures); });
  efficienceMois = parNom;
  monEfficienceMois = { temps: mt, heures: mh, interventions: mi, eff: calculEfficience(mt, mh) };
  return parNom;
}

// Rang d'une valeur d'efficience donnée parmi tous les techniciens (sans dévoiler les valeurs)
function rangEffValeur(eff) {
  if (eff === null || eff === undefined || !efficienceMois) return { pos: 0, total: 0 };
  const cl = Object.values(efficienceMois).filter(e => e.heures > 0 && e.eff !== null);
  const meilleurs = cl.filter(e => e.eff > eff).length;
  return { pos: meilleurs + 1, total: cl.length };
}

function couleurEff(eff) {
  if (eff === null || eff === undefined) return "jauge-neutre";
  if (eff >= 100) return "jauge-vert";
  if (eff >= 85) return "jauge-orange";
  return "jauge-rouge";
}
function majJaugeEff(circleId, valId, sousId, eff, sousText) {
  const c = document.getElementById(circleId);
  if (!c) return;
  c.className = "jauge-circle " + couleurEff(eff);
  c.style.setProperty("--pct", (eff === null || eff === undefined) ? 0 : Math.min(eff, 100));
  const v = document.getElementById(valId);
  if (v) v.textContent = (eff === null || eff === undefined) ? "—" : Math.round(eff) + "%";
  const s = sousId ? document.getElementById(sousId) : null;
  if (s) s.textContent = sousText || "";
}

// --- Classements (affichés si dans le top 15) -------------------------------
function rangBadge(pos, total) {
  if (!pos || pos < 1 || pos > 15) return "";
  const m = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "🏅";
  return `${m} <strong>${pos}<sup>${pos === 1 ? "er" : "e"}</sup></strong> / ${total}`;
}
function setRang(elId, pos, total) {
  const el = document.getElementById(elId);
  if (!el) return;
  const b = rangBadge(pos, total);
  el.innerHTML = b;
  el.classList.toggle("hidden", !b);
}
// NPS : score décroissant, techniciens ayant ≥ 5 réponses
function rangNPS(code) {
  const parCode = {};
  npsData.forEach(d => (parCode[d.tech] = parCode[d.tech] || []).push(d.note));
  const cl = Object.keys(parCode).map(c => ({ c, ...calculerNPS(parCode[c]) }))
    .filter(l => l.total >= 5).sort((a, b) => (b.score - a.score) || (b.total - a.total));
  return { pos: cl.findIndex(l => l.c === code) + 1, total: cl.length };
}
// Retour : taux croissant (le plus bas = meilleur), ≥ 10 interventions
function rangRetour(retNom) {
  if (!retNom) return { pos: 0, total: 0 };
  const parTech = {};
  retoursData.forEach(r => {
    if (r.techActuel) { const e = parTech[r.techActuel] || (parTech[r.techActuel] = { interv: 0, ret: 0 }); e.interv++; }
  });
  retoursData.forEach(r => {
    if (retourCompte(r) && parTech[r.techRetour]) parTech[r.techRetour].ret++;
  });
  const cl = Object.keys(parTech).map(t => ({ t, interv: parTech[t].interv, taux: parTech[t].interv ? parTech[t].ret / parTech[t].interv * 100 : null }))
    .filter(l => l.interv >= 10 && l.taux !== null).sort((a, b) => a.taux - b.taux);
  return { pos: cl.findIndex(l => l.t === retNom) + 1, total: cl.length };
}
// Efficience : efficience décroissante, techniciens ayant des heures ce mois
function rangEff(entry) {
  if (!efficienceMois) return { pos: 0, total: 0 };
  const cl = Object.values(efficienceMois).filter(e => e.heures > 0 && e.eff !== null).sort((a, b) => b.eff - a.eff);
  const key = entry._mots || techNormMots(entry.nom);
  return { pos: cl.findIndex(e => techNormMots(e.nom) === key) + 1, total: cl.length };
}

// ============================================================
// VUE BILAN
// ============================================================
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

  // Dates des fichiers
  const dEl = document.getElementById("bilan-dates");
  if (dEl) {
    const f = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
    dEl.textContent = `📄 NPS au ${f(typeof npsFileDate !== "undefined" ? npsFileDate : null)} · Retours au ${f(typeof retoursFileDate !== "undefined" ? retoursFileDate : null)}`;
  }

  // Efficience du mois (Firestore) — chargée une fois, mise en cache
  await chargerEfficienceMois();

  // Repères atelier (toujours visibles)
  majJaugeNPS("bilan-glob-nps-jauge", "bilan-glob-nps-val", "bilan-glob-nps-sous", calculerNPS(npsData.map(d => d.note)));
  majJaugeRetour("bilan-glob-retour-jauge", "bilan-glob-retour-val", "bilan-glob-retour-sous", calculTauxRetourGlobal());
  if (estManager()) {
    let gt = 0, gh = 0;
    if (efficienceMois) Object.values(efficienceMois).forEach(e => { gt += e.temps; gh += e.heures; });
    majJaugeEff("bilan-glob-eff-jauge", "bilan-glob-eff-val", "bilan-glob-eff-sous", calculEfficience(gt, gh), "Moyenne équipe (mois)");
  } else {
    majJaugeEff("bilan-glob-eff-jauge", "bilan-glob-eff-val", "bilan-glob-eff-sous", null, "🔒 Réservé manager");
  }

  if (!bilanInitialise) {
    setupBilanSearch();
    setupBilanFiltres();
    setupBilanScroll();
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

function setupBilanFiltres() {
  document.querySelectorAll("#bilan-nps-filtres .nps-filtre-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#bilan-nps-filtres .nps-filtre-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      bilanFiltreCat = chip.dataset.filtre;
      const e = bilanSelectedCode ? techParCode(bilanSelectedCode) : null;
      if (e) renderBilanNpsCartes(e);
    });
  });
  const cbComment = document.getElementById("bilan-nps-comment");
  if (cbComment) cbComment.addEventListener("change", () => {
    bilanFiltreComment = cbComment.checked;
    const e = bilanSelectedCode ? techParCode(bilanSelectedCode) : null;
    if (e) renderBilanNpsCartes(e);
  });
  const cbTan = document.getElementById("bilan-exclure-tan");
  if (cbTan) cbTan.checked = retoursExclureTAN; // synchronise avec l'état mémorisé
  if (cbTan) cbTan.addEventListener("change", () => {
    retoursExclureTAN = cbTan.checked; // variable globale de retours-logic.js
    localStorage.setItem("retoursExclureTAN", retoursExclureTAN);
    majJaugeRetour("bilan-glob-retour-jauge", "bilan-glob-retour-val", "bilan-glob-retour-sous", calculTauxRetourGlobal());
    const e = bilanSelectedCode ? techParCode(bilanSelectedCode) : null;
    if (e) {
      majJaugeRetourTech(e); renderBilanRetours(e);
      const rR = rangRetour(retourNomDe(e)); setRang("bilan-retour-rang", rR.pos, rR.total);
    }
  });
}

// Jauges individuelles cliquables → défilement vers la section correspondante
function setupBilanScroll() {
  document.querySelectorAll("#view-bilan .jauge-clickable").forEach(el => {
    el.addEventListener("click", () => {
      const t = document.getElementById(el.dataset.scroll);
      if (t) {
        t.scrollIntoView({ behavior: "smooth", block: "start" });
        t.classList.add("section-flash");
        setTimeout(() => t.classList.remove("section-flash"), 1200);
      }
    });
  });
}

function majFicheBilan(entry) {
  const blocs = document.querySelectorAll(".bilan-bloc-tech");
  if (!entry) { blocs.forEach(b => b.classList.add("hidden")); return; }
  blocs.forEach(b => b.classList.remove("hidden"));

  document.getElementById("bilan-nom").textContent = entry.nom;
  document.getElementById("bilan-code").textContent = "Code NPS : " + entry.code;

  // Jauges NPS / Retour / Efficience
  const npsRes = npsDeTech(entry) || { score: null, total: 0, moyenne: null };
  majJaugeNPS("bilan-nps-jauge", "bilan-nps-val", "bilan-nps-sous", npsRes);
  majJaugeRetourTech(entry);
  // Efficience : confidentielle. Le manager voit celle du technicien affiché ;
  // un technicien ne voit QUE la sienne (liée à son compte connecté), jamais
  // celle d'un autre — même en changeant « qui es-tu ».
  const estMonIdentite = (typeof monIdentiteCode !== "undefined" && monIdentiteCode && entry.code === monIdentiteCode);
  if (estManager()) {
    const effE = efficienceMois ? efficienceMois[entry._mots || techNormMots(entry.nom)] : null;
    majJaugeEff("bilan-eff-jauge", "bilan-eff-val", "bilan-eff-sous",
      effE ? effE.eff : null, effE ? `${effE.interventions} interv. ce mois` : "Pas de données ce mois");
    const rE = rangEff(entry); setRang("bilan-eff-rang", rE.pos, rE.total);
  } else if (estMonIdentite && monEfficienceMois) {
    majJaugeEff("bilan-eff-jauge", "bilan-eff-val", "bilan-eff-sous", monEfficienceMois.eff,
      monEfficienceMois.heures ? `${monEfficienceMois.interventions} interv. ce mois` : "Pas de données ce mois");
    const rE = rangEffValeur(monEfficienceMois.eff); setRang("bilan-eff-rang", rE.pos, rE.total);
  } else {
    majJaugeEff("bilan-eff-jauge", "bilan-eff-val", "bilan-eff-sous", null, "🔒 Efficience privée");
    setRang("bilan-eff-rang", 0, 0);
  }

  // Classements NPS / Retour (affichés si dans le top 15)
  const rN = rangNPS(entry.code); setRang("bilan-nps-rang", rN.pos, rN.total);
  const rR = rangRetour(retourNomDe(entry)); setRang("bilan-retour-rang", rR.pos, rR.total);

  // Note d'absence éventuelle
  const retNom = retourNomDe(entry);
  const note = document.getElementById("bilan-note");
  const manques = [];
  if (!npsRes.total) manques.push("aucune réponse NPS");
  if (!retNom) manques.push("non trouvé dans le fichier Retours");
  if (note) {
    note.textContent = manques.length ? "ℹ️ " + manques.join(" · ") + " pour ce technicien." : "";
    note.classList.toggle("hidden", !manques.length);
  }

  // Détails
  renderBilanNpsCartes(entry);
  renderBilanRetours(entry);
}

function majJaugeRetourTech(entry) {
  const retNom = retourNomDe(entry);
  const retRes = retNom ? calculTauxRetourTech(retNom) : { interventions: 0, retours: 0, taux: null };
  majJaugeRetour("bilan-retour-jauge", "bilan-retour-val", "bilan-retour-sous", retRes);
}

// Cartes NPS (commentaires) du technicien, avec filtres
function renderBilanNpsCartes(entry) {
  const cont = document.getElementById("bilan-nps-cartes");
  const titre = document.getElementById("bilan-nps-titre");
  if (!cont) return;
  let cartes = npsData.filter(d => d.tech === entry.code);
  const total = cartes.length;

  // compteurs sur les chips
  const n = { tous: total, detracteur: 0, passif: 0, promoteur: 0 };
  cartes.forEach(c => n[npsCategorie(c.note)]++);
  document.querySelectorAll("#bilan-nps-filtres .nps-filtre-chip").forEach(chip => {
    const span = chip.querySelector(".chip-count");
    if (span) span.textContent = n[chip.dataset.filtre];
  });

  if (bilanFiltreCat !== "tous") cartes = cartes.filter(c => npsCategorie(c.note) === bilanFiltreCat);
  if (bilanFiltreComment) cartes = cartes.filter(c => c.commentaire);
  cartes.sort((a, b) => a.note - b.note);

  if (titre) titre.textContent = `Satisfaction client — ${total ? cartes.length + " / " + total + " réponse(s)" : "aucune réponse"}`;

  if (!total) { cont.innerHTML = `<p class="hint">Aucune réponse NPS pour ce technicien.</p>`; return; }
  if (!cartes.length) { cont.innerHTML = `<p class="hint">Aucune carte ne correspond à ce filtre.</p>`; return; }

  cont.innerHTML = cartes.map(c => `
    <div class="nps-carte nps-carte-${npsCategorie(c.note)}">
      <div class="nps-carte-head">
        <span class="nps-carte-note">${c.note}<small>/10</small></span>
        <div class="nps-carte-meta">
          ${categorieBadge(c.note)}
          <span class="nps-carte-dossier">Dossier&nbsp;: ${c.dossier || "—"}</span>
        </div>
      </div>
      ${c.commentaire
        ? `<p class="nps-carte-comment">${escapeHtml(c.commentaire)}</p>`
        : `<p class="nps-carte-comment nps-carte-comment-vide">Pas de commentaire</p>`}
    </div>`).join("");
}

// Liste des appareils revenus attribués au technicien
function renderBilanRetours(entry) {
  const cont = document.getElementById("bilan-retour-liste");
  const titre = document.getElementById("bilan-retour-titre");
  if (!cont) return;
  const retNom = retourNomDe(entry);
  const liste = retNom
    ? retoursData.filter(r => r.techRetour === retNom && retourCompte(r))
        .sort((a, b) => (b.dateActuelle ? b.dateActuelle.getTime() : 0) - (a.dateActuelle ? a.dateActuelle.getTime() : 0))
    : [];

  if (titre) titre.textContent = `Appareils revenus — ${liste.length}`;

  if (!retNom) { cont.innerHTML = `<p class="hint">Ce technicien n'est pas présent dans le fichier Retours.</p>`; return; }
  if (!liste.length) { cont.innerHTML = `<p class="hint">Aucun retour attribué à ce technicien${retoursExclureTAN ? " (hors réparations TAN)" : ""}.</p>`; return; }

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

// Rang NPS du technicien dans l'atelier (affiché si 1er à 5e ; ≥5 réponses)
function afficherRangBilan(entry) {
  const rangEl = document.getElementById("bilan-rang");
  if (!rangEl) return;
  const parCode = {};
  npsData.forEach(d => { (parCode[d.tech] = parCode[d.tech] || []).push(d.note); });
  const classement = Object.keys(parCode)
    .map(code => ({ code, ...calculerNPS(parCode[code]) }))
    .filter(l => l.total >= 5)
    .sort((a, b) => (b.score - a.score) || (b.total - a.total));
  const pos = classement.findIndex(l => l.code === entry.code) + 1;
  if (pos >= 1 && pos <= 5) {
    const medaille = ["🥇", "🥈", "🥉", "🏅", "🏅"][pos - 1];
    rangEl.innerHTML = `${medaille} <strong>${pos}<sup>${pos === 1 ? "er" : "e"}</sup></strong> de l'atelier sur ${classement.length} techniciens classés (NPS)`;
    rangEl.classList.remove("hidden");
  } else {
    rangEl.textContent = "";
    rangEl.classList.add("hidden");
  }
}

// ============================================================
// SCORECARD MANAGER (tableau combiné, dans la vue admin)
// ============================================================
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
  }).filter(l => l.npsN > 0 || l.interventions > 0)
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
