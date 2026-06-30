// ============================================================
// identite.js — « Qui es-tu ? » (chargé uniquement par index2.html)
// ------------------------------------------------------------
// À la connexion, demande au technicien son identité (son nom), la mémorise
// sur son COMPTE Firebase (users/{uid}.bilanCode), et pré-sélectionne son
// bilan (NPS + retours). Indicateur « Vous : NOM (changer) » dans la barre
// du haut pour changer à tout moment.
// N'altère ni app.js ni index.html.
// ============================================================

let monIdentiteCode = null;   // code technicien de l'utilisateur connecté
let monIdentiteNom = null;

(function () {
  "use strict";

  // --- À la connexion : lire l'identité du compte, ou la demander ---
  if (typeof auth !== "undefined" && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) { monIdentiteCode = null; monIdentiteNom = null; return; }
      let code = null;
      try {
        const doc = await db.collection("users").doc(user.uid).get();
        code = doc.exists ? (doc.data().bilanCode || null) : null;
      } catch (e) { /* ignore */ }

      if (code) {
        appliquerIdentite(code, false);
      } else {
        majBadge();
        setTimeout(ouvrirModalIdentite, 700); // laisse l'app s'afficher d'abord
      }
    });
  }

  // Applique une identité (code technicien, ou "MANAGER" = pas d'identité)
  function appliquerIdentite(code, rerender) {
    if (!code || code === "MANAGER") {
      monIdentiteCode = null; monIdentiteNom = null;
    } else {
      const t = (typeof techParCode === "function") ? techParCode(code) : null;
      monIdentiteCode = t ? t.code : null;
      monIdentiteNom = t ? t.nom : null;
      // Pré-sélectionne le bilan sur cette personne
      if (monIdentiteCode && typeof bilanSelectedCode !== "undefined") {
        bilanSelectedCode = monIdentiteCode;
      }
    }
    majBadge();
    if (rerender) rerenderBilanSiVisible();
  }

  function rerenderBilanSiVisible() {
    const v = document.getElementById("view-bilan");
    if (v && !v.classList.contains("hidden") && typeof renderBilan === "function") renderBilan();
  }

  // --- Sauvegarde sur le compte ---
  async function sauverIdentite(code) {
    try {
      const u = auth.currentUser;
      if (u) await db.collection("users").doc(u.uid).set({ bilanCode: code }, { merge: true });
    } catch (e) { /* ignore */ }
    appliquerIdentite(code, true);
    fermerModalIdentite();
  }

  // --- Badge dans la barre du haut ---
  function majBadge() {
    const b = document.getElementById("identite-badge");
    if (!b) return;
    b.innerHTML = monIdentiteNom
      ? `Vous : <strong>${monIdentiteNom}</strong> <a href="#" class="identite-changer">(changer)</a>`
      : `<a href="#" class="identite-changer">Définir qui je suis</a>`;
    const lien = b.querySelector(".identite-changer");
    if (lien) lien.addEventListener("click", (e) => { e.preventDefault(); ouvrirModalIdentite(); });
  }

  // --- Modal ---
  let modalInit = false;
  function ouvrirModalIdentite() {
    const m = document.getElementById("modal-identite");
    if (!m) return;
    if (!modalInit) { setupModalRecherche(); modalInit = true; }
    const input = document.getElementById("identite-input");
    if (input) input.value = monIdentiteNom || "";
    m.classList.remove("hidden");
    if (input) setTimeout(() => input.focus(), 50);
  }
  function fermerModalIdentite() {
    const m = document.getElementById("modal-identite");
    if (m) m.classList.add("hidden");
  }

  function setupModalRecherche() {
    const input = document.getElementById("identite-input");
    const results = document.getElementById("identite-results");
    const btnManager = document.getElementById("identite-manager");
    if (btnManager) btnManager.addEventListener("click", () => sauverIdentite("MANAGER"));
    if (!input || !results || typeof techniciensTries !== "function") return;

    const liste = techniciensTries();
    const afficher = (arr) => {
      results.innerHTML = "";
      if (!arr.length) { results.classList.add("hidden"); return; }
      arr.forEach(t => {
        const div = document.createElement("div");
        div.textContent = `${t.nom} (${t.code})`;
        div.addEventListener("mousedown", (e) => { e.preventDefault(); sauverIdentite(t.code); });
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
  }

  // Fermer le modal en cliquant sur le fond
  document.addEventListener("click", (e) => {
    const m = document.getElementById("modal-identite");
    if (m && e.target === m && monIdentiteNom) m.classList.add("hidden"); // ferme seulement si une identité existe déjà
  });
})();
