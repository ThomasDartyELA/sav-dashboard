// ============================================================
// LOGIQUE METIER — Recherche des temps alloués & calculs
// Données sources : js/data-temps.js (généré depuis le fichier
// BDD Excel — onglets "détail 2" et "détail 3")
// ============================================================

const TYPES_INTERVENTION = ["TAR", "TAN", "ETC"]; // ECC est traité comme synonyme d'ETC

function normalise(str) {
  return (str || "").trim().toUpperCase();
}

/**
 * Construit un index { "FAM|MARQUE": {tar,tan,etc} } pour détail 2
 * et { "FAM": {tar,tan,etc, libelle} } pour détail 3, pour des lookups O(1).
 */
const INDEX_DETAIL2 = {};
(window.TEMPS_DETAIL2 || []).forEach(d => {
  INDEX_DETAIL2[`${d.fam}|${d.marque}`] = d;
});

const INDEX_DETAIL3 = {};
(window.TEMPS_DETAIL3 || []).forEach(d => {
  INDEX_DETAIL3[d.fam] = d;
});

/**
 * Recherche le temps alloué (en heures) pour une intervention donnée.
 * Priorité :
 *   1. Couple [Famille + Marque] (détail 2)
 *   2. Famille seule (détail 3)
 * @returns {{temps:number, source:string}|null}
 */
function getTempsAlloue(fam, marque, type) {
  fam = normalise(fam);
  marque = normalise(marque);
  const typeKey = type === "ECC" ? "etc" : type.toLowerCase();

  if (marque) {
    const d2 = INDEX_DETAIL2[`${fam}|${marque}`];
    if (d2 && typeof d2[typeKey] === "number") {
      return { temps: d2[typeKey], source: "Famille + Marque" };
    }
  }
  const d3 = INDEX_DETAIL3[fam];
  if (d3 && typeof d3[typeKey] === "number") {
    return { temps: d3[typeKey], source: "Famille (générique)" };
  }
  return null;
}

/** Liste triée des familles pour le datalist (juste le code, ex: "CAFEN") */
function getFamillesOptions() {
  return (window.TEMPS_DETAIL3 || [])
    .map(d => ({ fam: d.fam, libelle: d.libelle || d.fam }))
    .sort((a, b) => a.fam.localeCompare(b.fam, "fr"));
}

/** Extrait le code FAMPROD à partir du texte affiché "Libellé (FAM)" */
function extraireCodeFamille(texteAffiche) {
  const match = /\(([^)]+)\)\s*$/.exec(texteAffiche || "");
  return match ? match[1].trim().toUpperCase() : normalise(texteAffiche);
}

/** Efficience = (somme temps alloués / temps de travail réel) * 100 */
function calculEfficience(totalTempsAlloue, heuresReelles) {
  if (!heuresReelles || heuresReelles <= 0) return null;
  return (totalTempsAlloue / heuresReelles) * 100;
}

/** Consommation moyenne de pièces = nb pièces total / nb interventions total */
function calculConsoPieces(totalPieces, totalInterventions) {
  if (!totalInterventions) return null;
  return totalPieces / totalInterventions;
}

/** Taux de retour = (nb appareils revenus / nb total appareils traités) * 100 */
function calculTauxRetour(totalRetours, totalInterventions) {
  if (!totalInterventions) return null;
  return (totalRetours / totalInterventions) * 100;
}

function formatPct(value) {
  return value === null || value === undefined || isNaN(value) ? "—" : value.toFixed(1) + " %";
}

function formatHeures(value) {
  return value === null || value === undefined || isNaN(value) ? "—" : value.toFixed(2) + " h";
}

function formatNombre(value, decimals = 2) {
  return value === null || value === undefined || isNaN(value) ? "—" : value.toFixed(decimals);
}

// ------------------------------------------------------------
// CODE COULEUR DE PERFORMANCE
// Seuils inspirés de la grille de prime variable technicien
// fournie par l'utilisateur (bandes Max / à / à / à / Min) :
//   - Efficience      : Max 100% … Min 70%   (plus haut = mieux)
//   - Taux de retour  : Max 4%   … Min 8%    (plus bas = mieux)
//   - Conso pièces    : Max 1.10 … Min 1.70  (plus bas = mieux)
// Simplifiés ici en 3 niveaux (vert / orange / rouge) pour l'affichage.
// ------------------------------------------------------------
const SEUILS_PERFORMANCE = {
  efficience: { sens: "haut", bon: 93, moyen: 78 },
  tauxRetour: { sens: "bas", bon: 5, moyen: 7 },
  consoPieces: { sens: "bas", bon: 1.10, moyen: 1.40 }
};

/** Retourne "vert" | "orange" | "rouge" | "neutre" pour colorer une statistique */
function getNiveauPerformance(metric, value) {
  if (value === null || value === undefined || isNaN(value)) return "neutre";
  const s = SEUILS_PERFORMANCE[metric];
  if (!s) return "neutre";
  if (s.sens === "haut") {
    if (value >= s.bon) return "vert";
    if (value >= s.moyen) return "orange";
    return "rouge";
  }
  if (value <= s.bon) return "vert";
  if (value <= s.moyen) return "orange";
  return "rouge";
}

/** Convertit une valeur en pourcentage de remplissage (0-100) pour une jauge, selon une échelle max */
function pctEchelle(value, max) {
  if (value === null || value === undefined || isNaN(value) || value < 0) return 0;
  return Math.min(100, (value / max) * 100);
}
