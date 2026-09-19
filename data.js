/* Tables de Multiplication — données de l'app.
 *
 * Tout ce qu'on peut vouloir régler sans toucher à la logique (app.js).
 */
window.APP_DATA = {
  title: 'Tables de Multiplication',

  // Une « table de N » = N × 1, N × 2, ... N × 10.
  tables: { min: 1, max: 10, defaults: [2, 3, 4, 5] },
  terms: { min: 1, max: 10 },

  // Au-delà, une bonne réponse compte comme une hésitation (à revoir).
  slowMs: 5000,

  // Plus grand produit possible = 100 -> 3 chiffres.
  maxDigits: 3,

  // Une question ratée revient entre 1 et `requeueSpan` questions plus loin.
  requeueSpan: 4,

  mascots: ['🦊', '🐸', '🦁', '🐼', '🦄', '🐯', '🐧', '🦋'],

  // Du meilleur au moins bon ; {rate} = taux de réussite en %.
  tiers: [
    { min: 100, emoji: '🏆', title: 'Parfait !', sub: 'Tu as tout bon du premier coup, champion !' },
    { min: 80, emoji: '⭐', title: 'Excellent !', sub: '{rate}% de réussite, c\'est super !' },
    { min: 60, emoji: '👍', title: 'Bien joué !', sub: '{rate}% de réussite, continue à t\'entraîner !' },
    { min: 0, emoji: '💪', title: 'Courage !', sub: '{rate}% — pratique encore, tu vas y arriver !' },
  ],
};
