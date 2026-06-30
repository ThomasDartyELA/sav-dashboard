// ============================================================
// tech2.js — Améliorations côté technicien (chargé uniquement par index2.html)
// ------------------------------------------------------------
// Vient PAR-DESSUS app.js / nps-logic.js sans les modifier :
//   1) bouton « ✎ Modifier » sur chaque intervention (en plus du « ✕ Supprimer ») ;
//   2) rang du technicien dans l'atelier affiché s'il est dans le top 5 (NPS).
// index.html ne charge PAS ce fichier : il reste inchangé.
// ============================================================

(function () {
  "use strict";

  const SEUIL_MIN_REPONSES = 5; // nb mini de réponses pour entrer dans le classement
  let editIndex = null;         // index de l'intervention en cours de modification

  // ----------------------------------------------------------
  // 1) Enrichit le composant de recherche pour exposer setValue()
  //    (pour repré-remplir Famille / Marque lors d'une modification).
  //    On remplace la fonction globale AVANT que app.js ne l'appelle (au login).
  // ----------------------------------------------------------
  if (typeof setupSearchableSelect === "function") {
    const _origine = setupSearchableSelect;
    // eslint-disable-next-line no-global-assign
    setupSearchableSelect = function (config) {
      const api = _origine(config);
      const _getValue = api.getValue;
      api.getValue = () => (api._forced != null ? api._forced : _getValue());
      api.setValue = (val, label) => {
        config.inputEl.value = (label != null ? label : (val != null ? val : ""));
        api._forced = (val != null ? val : null);
        config.resultsEl.classList.add("hidden");
        config.resultsEl.innerHTML = "";
      };
      // dès que l'utilisateur retape, on annule la valeur forcée
      config.inputEl.addEventListener("input", () => { api._forced = null; });
      const _reset = api.reset;
      api.reset = () => { api._forced = null; _reset(); };
      return api;
    };
  }

  // ----------------------------------------------------------
  // 2) Remplace renderInterventionsTable pour ajouter le bouton « Modifier »
  // ----------------------------------------------------------
  if (typeof renderInterventionsTable === "function") {
    // eslint-disable-next-line no-global-assign
    renderInterventionsTable = function () {
      const tbody = document.getElementById("table-interventions-body");
      if (!tbody) return;
      tbody.innerHTML = "";
      let totalTemps = 0, totalPieces = 0;

      currentDay.interventions.forEach((it, idx) => {
        totalTemps += it.tempsAlloue;
        totalPieces += it.nbPieces;
        const tr = document.createElement("tr");
        if (editIndex === idx) tr.classList.add("row-editing");
        tr.innerHTML = `
          <td>${it.numero || "—"}</td>
          <td>${it.fam}</td>
          <td>${it.marque || "—"}</td>
          <td>${it.type}</td>
          <td>${formatNombre(it.tempsAlloue)}</td>
          <td>${it.nbPieces}</td>
          <td class="actions-cell">
            <button class="btn-edit-sm" data-edit="${idx}" title="Modifier">✎</button>
            <button class="btn-danger-sm" data-idx="${idx}" title="Supprimer">✕</button>
          </td>`;
        tbody.appendChild(tr);
      });

      // Suppression (comportement d'origine)
      tbody.querySelectorAll("button[data-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = parseInt(btn.dataset.idx, 10);
          currentDay.interventions.splice(i, 1);
          if (editIndex === i) finEdition();      // on annule une modif en cours sur cette ligne
          else if (editIndex !== null && i < editIndex) editIndex--; // réindexe
          renderInterventionsTable();
          renderTopStats();
          persistJournee();
        });
      });

      // Modification : recharge l'intervention dans le formulaire (sans la retirer)
      tbody.querySelectorAll("button[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => demarrerEdition(parseInt(btn.dataset.edit, 10)));
      });

      const tt = document.getElementById("total-temps-alloue");
      const tp = document.getElementById("total-pieces");
      if (tt) tt.innerHTML = `<strong>${formatNombre(totalTemps)}</strong>`;
      if (tp) tp.innerHTML = `<strong>${totalPieces}</strong>`;
    };
  }

  function demarrerEdition(idx) {
    const it = currentDay.interventions[idx];
    if (!it) return;
    editIndex = idx;

    if (ssFamille && ssFamille.setValue) ssFamille.setValue(it.fam, it.fam);
    if (ssMarque && ssMarque.setValue) ssMarque.setValue(it.marque, it.marque);

    document.querySelectorAll("#type-select .type-chip").forEach(c => {
      c.classList.toggle("active", c.dataset.type === it.type);
    });
    const selType = document.getElementById("inp-type");
    if (selType) { selType.value = it.type; selType.dispatchEvent(new Event("change")); }

    document.getElementById("inp-numero").value = it.numero || "";
    document.getElementById("inp-pieces").value = it.nbPieces || 0;
    if (typeof updateTempsAllouePreview === "function") updateTempsAllouePreview();

    const btnAdd = document.getElementById("btn-add-intervention");
    if (btnAdd) { btnAdd.textContent = "💾 Enregistrer la modification"; btnAdd.classList.add("btn-edit-mode"); }
    const errEl = document.getElementById("intervention-error");
    if (errEl) { errEl.textContent = "Modifie les champs puis clique sur « Enregistrer la modification »."; errEl.classList.add("info-hint"); }

    renderInterventionsTable(); // pour surligner la ligne en cours d'édition
    document.querySelector(".card-add-inter")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function finEdition() {
    editIndex = null;
    const btnAdd = document.getElementById("btn-add-intervention");
    if (btnAdd) { btnAdd.textContent = "+ Ajouter l'intervention"; btnAdd.classList.remove("btn-edit-mode"); }
    const errEl = document.getElementById("intervention-error");
    if (errEl) errEl.classList.remove("info-hint");
  }

  // Interception du clic « Ajouter » EN PHASE DE CAPTURE : si on est en mode
  // modification, on REMPLACE l'intervention au lieu d'en ajouter une nouvelle,
  // puis on bloque le handler d'origine de app.js (pas de doublon).
  document.addEventListener("click", function (e) {
    const btn = e.target.closest ? e.target.closest("#btn-add-intervention") : null;
    if (!btn || editIndex === null) return; // hors mode édition : app.js gère normalement

    const errEl = document.getElementById("intervention-error");
    const fam = ssFamille.getValue();
    const marque = ssMarque.getValue() || "";
    const type = document.getElementById("inp-type").value;
    const numero = document.getElementById("inp-numero").value.trim();
    const nbPieces = parseInt(document.getElementById("inp-pieces").value, 10) || 0;

    if (!fam) {
      if (errEl) { errEl.textContent = "Merci de sélectionner une famille de produit dans la liste proposée."; errEl.classList.remove("info-hint"); }
      e.stopImmediatePropagation(); e.preventDefault(); return;
    }
    const res = getTempsAlloue(fam, marque, type);
    if (!res) {
      if (errEl) { errEl.textContent = "Aucun temps standard trouvé pour cette famille / marque. Vérifiez la saisie."; errEl.classList.remove("info-hint"); }
      e.stopImmediatePropagation(); e.preventDefault(); return;
    }

    currentDay.interventions[editIndex] = {
      numero, fam, marque, type,
      tempsAlloue: res.temps, source: res.source, nbPieces
    };

    ssFamille.reset();
    ssMarque.reset();
    document.getElementById("inp-numero").value = "";
    document.getElementById("inp-pieces").value = 0;
    if (typeof updateTempsAllouePreview === "function") updateTempsAllouePreview();
    if (errEl) errEl.textContent = "";

    finEdition();
    renderInterventionsTable();
    renderTopStats();
    persistJournee();

    e.stopImmediatePropagation(); // empêche app.js d'ajouter un doublon
    e.preventDefault();
  }, true); // true = phase de capture (s'exécute avant le handler de app.js)

  // ----------------------------------------------------------
  // 3) Rang du technicien dans l'atelier (affiché si 1er à 5e)
  //    On remplace majVueTech (nps-logic.js) pour ajouter l'affichage du rang.
  // ----------------------------------------------------------
  if (typeof majVueTech === "function") {
    // eslint-disable-next-line no-global-assign
    majVueTech = function (tech) {
      const blocs = document.querySelectorAll(".nps-bloc-tech");
      const rangEl = document.getElementById("nps-rang");

      if (!tech) {
        blocs.forEach(b => b.classList.add("hidden"));
        if (rangEl) { rangEl.textContent = ""; rangEl.classList.add("hidden"); }
        return;
      }
      blocs.forEach(b => b.classList.remove("hidden"));

      const res = calculerNPS(npsData.filter(d => d.tech === tech).map(d => d.note));
      majJaugeNPS("nps-jauge-tech", "nps-jauge-tech-val", "nps-jauge-tech-sous", res);
      majCompteursFiltres(tech);
      renderCartesTech(tech);
      afficherRangTech(tech, rangEl);
    };
  }

  // Classement NPS (techniciens ayant ≥ 5 réponses) ; affiche le rang seulement si 1er-5e.
  function afficherRangTech(tech, rangEl) {
    if (!rangEl) return;
    const parTech = {};
    npsData.forEach(d => { (parTech[d.tech] = parTech[d.tech] || []).push(d.note); });

    const classement = Object.keys(parTech)
      .map(t => ({ t, ...calculerNPS(parTech[t]) }))
      .filter(l => l.total >= SEUIL_MIN_REPONSES)
      .sort((a, b) => (b.score - a.score) || (b.total - a.total));

    const pos = classement.findIndex(l => l.t === tech) + 1; // 1-based ; 0 si absent

    if (pos >= 1 && pos <= 5) {
      const medaille = ["🥇", "🥈", "🥉", "🏅", "🏅"][pos - 1];
      rangEl.innerHTML = `${medaille} <strong>${pos}<sup>${pos === 1 ? "er" : "e"}</sup></strong> de l'atelier sur ${classement.length} techniciens classés (NPS)`;
      rangEl.classList.remove("hidden");
    } else {
      rangEl.textContent = "";
      rangEl.classList.add("hidden");
    }
  }
})();
