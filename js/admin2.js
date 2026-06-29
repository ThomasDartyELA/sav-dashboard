// ============================================================
// admin2.js — Extensions du MODE ADMIN (chargé uniquement par index2.html)
// ------------------------------------------------------------
// Ce fichier vient PAR-DESSUS app.js sans le modifier :
//   1) pour les comptes admin, masque les onglets « Saisie du jour » et
//      « Mon Dashboard » et ouvre directement la vue admin ;
//   2) ajoute des fonctionnalités admin (date du fichier NPS, Top/Flop
//      techniciens, liste « à surveiller ») calculées sur la période choisie.
// index.html ne charge PAS ce fichier : il reste donc inchangé.
// ============================================================

(function () {
  "use strict";

  const SEUIL_MIN_REPONSES = 5; // nb minimum de réponses pour figurer dans Top/Flop

  // ----------------------------------------------------------
  // 1) Adapter l'interface selon le rôle (après que app.js ait géré le login)
  // ----------------------------------------------------------
  if (typeof auth !== "undefined" && auth.onAuthStateChanged) {
    auth.onAuthStateChanged((user) => {
      if (!user) return;
      // Laisse app.js terminer son traitement (il fait switchView("saisie"))
      setTimeout(appliquerSelonRole, 300);
    });
  }

  async function appliquerSelonRole() {
    let role = (typeof currentUser !== "undefined" && currentUser) ? currentUser.role : null;
    if (!role && typeof auth !== "undefined" && auth.currentUser) {
      try {
        const d = await db.collection("users").doc(auth.currentUser.uid).get();
        role = d.exists ? (d.data().role || "technician") : "technician";
      } catch (e) { role = "technician"; }
    }
    const estAdmin = role === "admin";
    basculerOngletsTechnicien(!estAdmin);
    if (estAdmin && typeof switchView === "function") {
      switchView("admin");
      setTimeout(renderAdminExtras, 150);
    }
  }

  // Affiche/masque les onglets réservés aux techniciens
  function basculerOngletsTechnicien(visible) {
    ["saisie", "dashboard"].forEach(v => {
      const b = document.querySelector(`.tab-btn[data-view="${v}"]`);
      if (b) b.classList.toggle("hidden", !visible);
    });
  }

  // ----------------------------------------------------------
  // 2) Re-calcul des extras quand on ouvre l'admin ou qu'on change de période
  // ----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", brancherEvenements);
  if (document.readyState !== "loading") brancherEvenements();

  function brancherEvenements() {
    const tabAdmin = document.querySelector('.tab-btn[data-view="admin"]');
    if (tabAdmin) tabAdmin.addEventListener("click", () => setTimeout(renderAdminExtras, 120));
    document.querySelectorAll("#admin-period-toggle .period-btn").forEach(btn => {
      btn.addEventListener("click", () => setTimeout(renderAdminExtras, 120));
    });
  }

  // ----------------------------------------------------------
  // 3) Rendu des fonctionnalités admin (basées sur les données NPS)
  // ----------------------------------------------------------
  async function renderAdminExtras() {
    if (typeof chargerDonneesNPS !== "function") return;
    try { await chargerDonneesNPS(); } catch (e) { return; }

    // Date de dernière modification du fichier
    if (typeof afficherDateFichierNPS === "function") afficherDateFichierNPS("admin-nps-date");

    // Bornes de la période courante (réutilise les globals de app.js)
    const periode = (typeof adminPeriode !== "undefined") ? adminPeriode : "mois";
    let start = null, end = null;
    if (periode !== "tout" && typeof periodeRangeISO === "function") {
      const r = periodeRangeISO(periode);
      start = new Date(r.start + "T00:00:00");
      end = new Date(r.end + "T23:59:59");
    }
    const data = (typeof npsDansPeriode === "function") ? npsDansPeriode(start, end) : [];

    // Regroupe par technicien et calcule le NPS
    const parTech = {};
    data.forEach(d => { (parTech[d.tech] = parTech[d.tech] || []).push(d); });
    const lignes = Object.keys(parTech).map(tech => {
      const res = calculerNPS(parTech[tech].map(d => d.note));
      return { tech, ...res };
    });

    renderTopFlop(lignes);
    renderASurveiller(lignes);
  }

  // Top 3 / Flop 3 par NPS (avec un minimum de réponses pour être pertinent)
  function renderTopFlop(lignes) {
    const eligibles = lignes
      .filter(l => l.total >= SEUIL_MIN_REPONSES)
      .sort((a, b) => b.score - a.score);

    const top = eligibles.slice(0, 3);
    const flop = eligibles.slice(-3).reverse();

    majClassement("admin-top-techs", top, "Pas assez de réponses sur la période.");
    majClassement("admin-flop-techs", flop, "Pas assez de réponses sur la période.");
  }

  function majClassement(elId, liste, messageVide) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!liste.length) { el.innerHTML = `<p class="hint">${messageVide}</p>`; return; }
    el.innerHTML = liste.map((l, i) => `
      <div class="tf-ligne">
        <span class="tf-rang">${i + 1}</span>
        <span class="tf-tech">${l.tech}</span>
        <span class="nps-score-pill ${pillClasse(l.score)}">${l.score > 0 ? "+" + l.score : l.score}</span>
        <span class="tf-detail">${l.total} rép. · moy ${l.moyenne.toFixed(1)}/10</span>
      </div>`).join("");
  }

  // Liste des techniciens à surveiller : NPS négatif sur la période
  function renderASurveiller(lignes) {
    const el = document.getElementById("admin-surveiller");
    if (!el) return;
    const aRisque = lignes
      .filter(l => l.total >= 1 && l.score < 0)
      .sort((a, b) => a.score - b.score);
    if (!aRisque.length) {
      el.innerHTML = `<p class="hint">✅ Aucun technicien en NPS négatif sur cette période.</p>`;
      return;
    }
    el.innerHTML = aRisque.map(l => `
      <div class="tf-ligne tf-ligne-alerte">
        <span class="tf-tech">${l.tech}</span>
        <span class="nps-score-pill pill-rouge">${l.score}</span>
        <span class="tf-detail">${l.detracteurs} détracteur${l.detracteurs > 1 ? "s" : ""} sur ${l.total} réponse${l.total > 1 ? "s" : ""}</span>
      </div>`).join("");
  }

  function pillClasse(score) {
    if (score === null) return "pill-neutre";
    if (score >= 50) return "pill-vert";
    if (score >= 0) return "pill-orange";
    return "pill-rouge";
  }
})();
