// ============================================================
// techniciens.js — Table de correspondance des techniciens
// ------------------------------------------------------------
// Relie le CODE NPS (utilisé dans nps-export.xlsx) au NOM du technicien
// (utilisé dans retours-export.xlsx). Permet de croiser NPS et Retours.
//
// Le NOM est saisi en « PRENOM NOM ». Le fichier Retours l'écrit en
// « NOM PRENOM » : le rapprochement se fait par ensemble de mots
// (insensible à l'ordre et aux accents/casse), donc l'ordre n'importe pas.
//
// Pour ajouter / modifier un technicien : éditer la liste ci-dessous.
// ============================================================

const TECHNICIENS = [
  { code: "L71", nom: "LOUKAS NICOSIA" },
  { code: "L78", nom: "MAUDE NADE" },
  { code: "L07", nom: "REMI PRINTEMPS" },
  { code: "L22", nom: "LUCAS SUAREZ" },
  { code: "L03", nom: "PIERRE AL GAIFFIER" },
  { code: "L23", nom: "MYKERI DARIUS" },
  { code: "L38", nom: "THOMAS CRASTRES" },
  { code: "L47", nom: "CEDRIC RAYDELET" },
  { code: "L24", nom: "STEPHANE VENET" },
  { code: "L25", nom: "SEBASTIEN DUCHASSIN" },
  { code: "L50", nom: "EMERIK CHEVALLIER" },
  { code: "L91", nom: "YASSINE BACHIRI" },
  { code: "L27", nom: "FABRICE THOMASSON" },
  { code: "L81", nom: "CATHY GERLAND" },
  { code: "L04", nom: "PHLIPPE TRONEL" },
  { code: "L35", nom: "EDITH BURON" },
  { code: "L32", nom: "CHRISTOPH LAROCHE" },
  { code: "L84", nom: "FREDERIC JOZEAU" },
  { code: "L82", nom: "LUDOVIC GOIN" },
  { code: "OBE", nom: "BE OPERATION" },
  { code: "L19", nom: "LOIC JACOMINO" },
  { code: "L72", nom: "XAVIER KIRMSER" },
  { code: "L74", nom: "LUCAS FENEON" },
  { code: "VD1", nom: "VERO-TEST DELHOME" },
  { code: "L76", nom: "PIERRE LANFRAY" },
  { code: "L05", nom: "PHILIPPE FLORIT" },
  { code: "L15", nom: "BENOIT CHEVROT" },
  { code: "L17", nom: "ALAIN MONNET" },
  { code: "L51", nom: "GERARD GIRE" },
  { code: "L87", nom: "LOYD FARLEY" },
  { code: "331", nom: "GILLES DENOYEL" },
  { code: "L44", nom: "DAMIEN CHAGNON" },
  { code: "L28", nom: "LUCAS ANTON" },
  { code: "L46", nom: "CHLOE CASTILLO" },
  { code: "L75", nom: "LYDIE COURLE" },
  { code: "L79", nom: "PHILIPPE MOLARD" },
  { code: "L06", nom: "HUGO FESTAZ" },
  { code: "L09", nom: "PIERRE DUMONT" },
  { code: "L16", nom: "JONATHAN LYONNET" },
  { code: "L65", nom: "HAIDAR ABDALLAHUSSEIN" },
  { code: "L26", nom: "GEORGES CALDERON" },
  { code: "L31", nom: "PIERRE STURM" },
  { code: "L69", nom: "MATHIS BIANCHI" },
  { code: "L88", nom: "NATHAN PRINTZ" },
  { code: "L08", nom: "CHRISTIAN REYNIER" },
  { code: "L14", nom: "SYLVAIN GOUJON" },
  { code: "L43", nom: "HOUSSAM BOUTERRA" },
  { code: "L41", nom: "ALEXANDRE SILES" },
  { code: "L77", nom: "GUILLAUME MOINET" },
  { code: "L70", nom: "RAPHAEL CEGERRA" },
  { code: "L80", nom: "RICARDO SOUSA" },
  { code: "L48", nom: "EMMANUEL DUCHESNE" },
  { code: "L10", nom: "JJ RIVAL" },
  { code: "L11", nom: "JOSE GARCIA" }
];

// Normalise un nom en « ensemble de mots trié » (sans accents, casse, ordre)
function techNormMots(s) {
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // enlève les accents
    .toUpperCase()
    .replace(/[-']/g, " ")
    .split(/\s+/).filter(Boolean)
    .sort().join(" ");
}

// Index pour accès rapide
const _techParCode = {};
const _techParMots = {};
TECHNICIENS.forEach(t => {
  t._mots = techNormMots(t.nom);
  _techParCode[t.code] = t;
  _techParMots[t._mots] = t;
});

function techParCode(code) { return _techParCode[code] || null; }
function techNomParCode(code) { const t = _techParCode[code]; return t ? t.nom : null; }
// Retrouve l'entrée correspondant à un nom (quel que soit l'ordre des mots)
function techParNom(nom) { return _techParMots[techNormMots(nom)] || null; }
// Liste triée par nom
function techniciensTries() { return TECHNICIENS.slice().sort((a, b) => a.nom.localeCompare(b.nom)); }
