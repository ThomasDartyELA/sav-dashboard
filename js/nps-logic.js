// ============================================================
// NPS — Lecture de l'export Excel + calcul du Net Promoter Score
// ------------------------------------------------------------
// Le fichier Excel (export de l'enquête NPS) est hébergé dans le repo.
// Pour mettre à jour les données, il suffit de remplacer ce fichier
// par le nouvel export, en conservant EXACTEMENT le même nom :
//   -> nps-export.xlsx (à la racine du site)
//
// Colonnes utilisées (telles que dans l'export) :
//   I  (index 8)  : Intervenant 1   -> code technicien (ex. L11)
//   J  (index 9)  : ID Event        -> numéro de dossier
//   Q  (index 16) : note 0 à 10     -> note NPS de la carte
//   R  (index 17) : commentaire client
// ============================================================

const NPS_FILE = "nps-export.xlsx"; // <-- remplacer ce fichier pour mettre à jour les données

// Index de colonnes (0-based) — alignés sur l'export Qualtrics
//   A (0) : date de fin d'enquête  -> utilisée pour le filtre de période (admin)
const NPS_COL = { date: 0, tech: 8, dossier: 9, note: 16, commentaire: 17 };

// État en mémoire (chargé une seule fois par session)
let npsData = null;           // tableau de { tech, dossier, note, commentaire }
let npsLoading = null;        // promesse de chargement (anti double-chargement)
let npsSelectedTech = localStorage.getItem("npsSelectedTech") || "";

// ------------------------------------------------------------
// Classification NPS standard à partir de la note 0-10
//   Promoteur : 9-10   |   Passif : 7-8   |   Détracteur : 0-6
// ------------------------------------------------------------
function npsCategorie(note) {
  if (note >= 9) return "promoteur";
  if (note >= 7) return "passif";
  return "detracteur";
}

// Convertit la valeur de la colonne date en objet Date (ou null)
function parseDateNPS(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") { // numéro de série Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// Calcule le score NPS (-100 à +100) + détail d'un ensemble de notes
function calculerNPS(notes) {
  const total = notes.length;
  if (!total) return { score: null, promoteurs: 0, passifs: 0, detracteurs: 0, total: 0, moyenne: null };
  let promoteurs = 0, passifs = 0, detracteurs = 0, somme = 0;
  notes.forEach(n => {
    somme += n;
    const c = npsCategorie(n);
    if (c === "promoteur") promoteurs++;
    else if (c === "passif") passifs++;
    else detracteurs++;
  });
  const score = Math.round(((promoteurs - detracteurs) / total) * 100);
  const moyenne = somme / total;
  return { score, promoteurs, passifs, detracteurs, total, moyenne };
}

// ------------------------------------------------------------
// Chargement + parsing du fichier Excel (via SheetJS / XLSX)
// ------------------------------------------------------------
async function chargerDonneesNPS() {
  if (npsData) return npsData;
  if (npsLoading) return npsLoading;

  npsLoading = (async () => {
    const resp = await fetch(NPS_FILE, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Fichier NPS introuvable (${NPS_FILE}) — code ${resp.status}`);
    const buf = await resp.arrayBuffer();
    // cellDates:true => la colonne date est lue comme objet Date JS
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // header:1 => tableau de tableaux ; on saute la ligne d'en-têtes (index 0)
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const tech = (r[NPS_COL.tech] ?? "").toString().trim();
      const noteRaw = r[NPS_COL.note];
      const note = (noteRaw === null || noteRaw === "" || noteRaw === undefined) ? null : Number(noteRaw);
      if (!tech || note === null || Number.isNaN(note)) continue; // on ignore les lignes sans tech ou sans note
      data.push({
        tech,
        dossier: (r[NPS_COL.dossier] ?? "").toString().trim(),
        note,
        commentaire: (r[NPS_COL.commentaire] ?? "").toString().trim(),
        date: parseDateNPS(r[NPS_COL.date])
      });
    }
    npsData = data;
    return data;
  })();

  return npsLoading;
}

// ------------------------------------------------------------
// Rendu d'une jauge NPS (réutilise les classes .jauge-* existantes)
//   La note moyenne est passée à part pour l'affichage complémentaire.
// ------------------------------------------------------------
function couleurNPS(score) {
  if (score === null) return "jauge-neutre";
  if (score >= 50) return "jauge-vert";
  if (score >= 0) return "jauge-orange";
  return "jauge-rouge";
}

function majJaugeNPS(circleEl, valueEl, sousEl, res) {
  const circle = document.getElementById(circleEl);
  const value = document.getElementById(valueEl);
  const sous = sousEl ? document.getElementById(sousEl) : null;
  if (!circle) return;

  circle.className = "jauge-circle " + couleurNPS(res.score);
  // Mappe le NPS (-100..+100) sur le remplissage du cercle (0..100 %)
  const pct = res.score === null ? 0 : Math.round((res.score + 100) / 2);
  circle.style.setProperty("--pct", pct);
  value.textContent = res.score === null ? "—" : (res.score > 0 ? "+" + res.score : res.score);
  if (sous) {
    sous.textContent = res.total
      ? `Note moy. ${res.moyenne.toFixed(1)}/10 · ${res.total} réponse${res.total > 1 ? "s" : ""}`
      : "Aucune réponse";
  }
}

// ------------------------------------------------------------
// Rendu de la liste des cartes (dossiers) d'un technicien
// ------------------------------------------------------------
function categorieBadge(note) {
  const c = npsCategorie(note);
  const libelle = c === "promoteur" ? "Promoteur" : c === "passif" ? "Passif" : "Détracteur";
  return `<span class="nps-badge nps-badge-${c}">${libelle}</span>`;
}

function renderCartesTech(tech) {
  const cont = document.getElementById("nps-cartes");
  const titre = document.getElementById("nps-cartes-titre");

  let cartes = npsData.filter(d => d.tech === tech);
  const total = cartes.length;

  // Filtre par catégorie (tous / détracteur / passif / promoteur)
  if (npsFiltreCategorie !== "tous") {
    cartes = cartes.filter(c => npsCategorie(c.note) === npsFiltreCategorie);
  }
  // Filtre « avec commentaire uniquement »
  if (npsFiltreCommentaire) {
    cartes = cartes.filter(c => c.commentaire);
  }
  cartes.sort((a, b) => a.note - b.note); // détracteurs d'abord (plus utile à lire)

  const filtreActif = npsFiltreCategorie !== "tous" || npsFiltreCommentaire;
  titre.textContent = filtreActif
    ? `Cartes du technicien ${tech} — ${cartes.length} affichée${cartes.length > 1 ? "s" : ""} sur ${total}`
    : `Cartes du technicien ${tech} — ${total} réponse${total > 1 ? "s" : ""}`;

  if (!cartes.length) {
    cont.innerHTML = `<p class="hint">Aucune carte ne correspond à ce filtre.</p>`;
    return;
  }

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
    </div>
  `).join("");
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// ------------------------------------------------------------
// Rendu complet de la vue NPS (appelé par switchView dans app.js)
// ------------------------------------------------------------
let npsInitialise = false;
let npsFiltreCategorie = "tous";   // tous | detracteur | passif | promoteur
let npsFiltreCommentaire = false;  // n'afficher que les cartes avec commentaire

// Liste triée des codes techniciens disponibles
function npsCodesDisponibles() {
  return [...new Set(npsData.map(d => d.tech))].sort();
}
// Libellé affiché dans la recherche : "L78 (141)"
function npsLabelTech(code) {
  const n = npsData.filter(d => d.tech === code).length;
  return `${code} (${n})`;
}

async function renderNPS() {
  const statut = document.getElementById("nps-statut");

  try {
    if (!npsData) {
      statut.textContent = "Chargement des réponses NPS…";
      statut.classList.remove("hidden");
      await chargerDonneesNPS();
      statut.classList.add("hidden");
    }
  } catch (e) {
    statut.textContent = "❌ " + e.message;
    statut.classList.remove("hidden");
    return;
  }

  // Jauge globale atelier (toujours calculée sur l'ensemble des réponses)
  const globalRes = calculerNPS(npsData.map(d => d.note));
  majJaugeNPS("nps-jauge-global", "nps-jauge-global-val", "nps-jauge-global-sous", globalRes);

  // Initialise la barre de recherche + les filtres (une seule fois)
  if (!npsInitialise) {
    setupNpsTechSearch();
    setupNpsFiltres();
    npsInitialise = true;
  }

  // Restaure le choix mémorisé s'il existe encore dans les données
  if (npsSelectedTech && npsCodesDisponibles().includes(npsSelectedTech)) {
    document.getElementById("nps-tech-input").value = npsLabelTech(npsSelectedTech);
    majVueTech(npsSelectedTech);
  } else {
    majVueTech(null);
  }
}

// Barre de recherche du code technicien (champ texte + liste filtrée)
function setupNpsTechSearch() {
  const input = document.getElementById("nps-tech-input");
  const results = document.getElementById("nps-tech-results");

  const afficher = (liste) => {
    results.innerHTML = "";
    if (!liste.length) { results.classList.add("hidden"); return; }
    liste.forEach(code => {
      const div = document.createElement("div");
      div.textContent = npsLabelTech(code);
      // mousedown : se déclenche avant le blur du champ
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = npsLabelTech(code);
        results.classList.add("hidden");
        npsSelectedTech = code;
        localStorage.setItem("npsSelectedTech", code);
        majVueTech(code);
      });
      results.appendChild(div);
    });
    results.classList.remove("hidden");
  };

  const filtrer = (q) => {
    q = (q || "").toLowerCase().replace(/\s*\(\d+\)\s*$/, "").trim(); // ignore le "(nb)" éventuel
    const codes = npsCodesDisponibles();
    return q ? codes.filter(c => c.toLowerCase().includes(q)) : codes;
  };

  // Au focus : on sélectionne le texte et on montre tous les codes
  input.addEventListener("focus", () => { input.select(); afficher(npsCodesDisponibles()); });
  input.addEventListener("input", () => afficher(filtrer(input.value)));
  document.addEventListener("click", (e) => {
    if (e.target !== input && !results.contains(e.target)) results.classList.add("hidden");
  });
}

// Filtres des cartes : catégorie + commentaire
function setupNpsFiltres() {
  document.querySelectorAll("#nps-filtres .nps-filtre-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#nps-filtres .nps-filtre-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      npsFiltreCategorie = chip.dataset.filtre;
      if (npsSelectedTech) renderCartesTech(npsSelectedTech);
    });
  });
  const cb = document.getElementById("nps-filtre-comment");
  if (cb) cb.addEventListener("change", () => {
    npsFiltreCommentaire = cb.checked;
    if (npsSelectedTech) renderCartesTech(npsSelectedTech);
  });
}

// Met à jour les compteurs affichés sur les chips de filtre
function majCompteursFiltres(tech) {
  const cartes = npsData.filter(d => d.tech === tech);
  const n = { tous: cartes.length, detracteur: 0, passif: 0, promoteur: 0 };
  cartes.forEach(c => n[npsCategorie(c.note)]++);
  document.querySelectorAll("#nps-filtres .nps-filtre-chip").forEach(chip => {
    const span = chip.querySelector(".chip-count");
    if (span) span.textContent = n[chip.dataset.filtre];
  });
}

function majVueTech(tech) {
  const blocs = document.querySelectorAll(".nps-bloc-tech");

  if (!tech) {
    blocs.forEach(b => b.classList.add("hidden"));
    return;
  }
  blocs.forEach(b => b.classList.remove("hidden"));

  const res = calculerNPS(npsData.filter(d => d.tech === tech).map(d => d.note));
  majJaugeNPS("nps-jauge-tech", "nps-jauge-tech-val", "nps-jauge-tech-sous", res);
  majCompteursFiltres(tech);
  renderCartesTech(tech);
}

// ============================================================
// VUE ADMIN — classement NPS par technicien + détail, filtré période
// ============================================================
// Filtre les réponses NPS sur une plage de dates [start, end] (objets Date).
// Si start/end sont null => aucune borne (tout l'historique).
function npsDansPeriode(start, end) {
  if (!start && !end) return npsData.slice();
  return npsData.filter(d => {
    if (!d.date) return false; // pas de date => exclu des périodes bornées
    if (start && d.date < start) return false;
    if (end && d.date > end) return false;
    return true;
  });
}

// Rend le bloc NPS de la vue admin pour une période donnée.
// Renvoie aussi les lignes de classement (utile pour un éventuel export).
async function renderNPSAdmin(start, end) {
  const statut = document.getElementById("admin-nps-statut");
  const tbody = document.getElementById("admin-nps-table-body");
  try {
    if (!npsData) {
      if (statut) { statut.textContent = "Chargement des réponses NPS…"; statut.classList.remove("hidden"); }
      await chargerDonneesNPS();
      if (statut) statut.classList.add("hidden");
    }
  } catch (e) {
    if (statut) { statut.textContent = "❌ " + e.message; statut.classList.remove("hidden"); }
    return [];
  }

  const periode = npsDansPeriode(start, end);

  // NPS global atelier sur la période
  const globalRes = calculerNPS(periode.map(d => d.note));
  majJaugeNPS("admin-nps-jauge-global", "admin-nps-jauge-global-val", "admin-nps-jauge-global-sous", globalRes);

  // Regroupe par code technicien
  const parTech = {};
  periode.forEach(d => {
    (parTech[d.tech] = parTech[d.tech] || []).push(d);
  });

  const lignes = Object.keys(parTech).map(tech => {
    const res = calculerNPS(parTech[tech].map(d => d.note));
    return { tech, ...res, cartes: parTech[tech] };
  }).sort((a, b) => (b.score ?? -999) - (a.score ?? -999));

  tbody.innerHTML = "";
  if (!lignes.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="hint">Aucune réponse NPS sur cette période.</td></tr>`;
    return [];
  }

  lignes.forEach(l => {
    const tr = document.createElement("tr");
    tr.className = "admin-nps-row";
    tr.innerHTML = `
      <td><strong>${l.tech}</strong> <span class="admin-nps-toggle">▸ détail</span></td>
      <td><span class="nps-score-pill ${couleurNPS(l.score).replace('jauge-', 'pill-')}">${l.score > 0 ? "+" + l.score : l.score}</span></td>
      <td>${l.moyenne.toFixed(1)}</td>
      <td>${l.total}</td>
      <td>${l.promoteurs}</td>
      <td>${l.passifs}</td>
      <td>${l.detracteurs}</td>
    `;
    // ligne de détail (cachée par défaut)
    const trDetail = document.createElement("tr");
    trDetail.className = "admin-nps-detail hidden";
    const td = document.createElement("td");
    td.colSpan = 7;
    td.innerHTML = `<div class="nps-cartes">` + l.cartes
      .slice().sort((a, b) => a.note - b.note)
      .map(c => `
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
        </div>`).join("") + `</div>`;
    trDetail.appendChild(td);

    tr.addEventListener("click", () => {
      trDetail.classList.toggle("hidden");
      const tg = tr.querySelector(".admin-nps-toggle");
      tg.textContent = trDetail.classList.contains("hidden") ? "▸ détail" : "▾ masquer";
    });

    tbody.appendChild(tr);
    tbody.appendChild(trDetail);
  });

  return lignes;
}
