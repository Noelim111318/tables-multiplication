# ⭐ Tables de Multiplication (PWA)

Appli web pour s'entraîner aux tables de multiplication. On choisit les tables à
travailler, l'appli pose les multiplications dans le désordre, et à la fin elle
donne un **rapport d'erreurs** et un **bilan par table**.

Installable (PWA), fonctionne **100 % hors-ligne**, pavé numérique intégré
(le clavier du téléphone reste fermé), retour visuel + vibrations + petits sons,
série de jours et historique des 7 derniers jours.

**Lien** : https://noelim111318.github.io/tables-multiplication/

## Fonctionnalités

- **Choix des tables** : coche les tables de 1 à 10 (« Tout sélectionner » /
  « Tout décocher »). Une partie = chaque `table × 1…10` une fois, mélangées.
- **Pavé numérique intégré** : le champ réponse est en lecture seule, on tape sur
  les touches à l'écran (ou le clavier physique sur ordinateur). Pas de clavier
  système qui saute.
- **Réponse immédiate** : bonne réponse → 🎉 confettis, mauvaise → la carte tremble
  et la bonne réponse s'affiche. Vibration courte (si le téléphone la gère) et,
  en option, un petit son.
- **Les erreurs reviennent** : une multiplication ratée est **replacée quelques
  questions plus loin** dans la même partie, jusqu'à ce qu'elle soit sue.
- **Barre de progression** + score en direct (✅ succès / ❌ erreurs / 🔵 restantes).
- **Écran de bilan** :
  - emoji + phrase selon le taux de réussite ;
  - **📅 7 derniers jours** : mini-graphique + taux de réussite cumulé ;
  - **📊 bilan par table** : une barre de réussite par table travaillée ;
  - **📋 multiplications à revoir** : triées par nombre d'erreurs, avec le temps
    de réponse, le **total cumulé d'erreurs** (« total : N », gardé d'une partie
    à l'autre) et un badge **🐢 hésitation** pour les bonnes réponses trop lentes
    (> 5 s) ;
  - **🔁 Réviser mes erreurs** : relance une partie avec **seulement** les
    multiplications ratées ou hésitantes ;
  - **🖨️ Imprimer le rapport** : version propre en noir sur blanc.
- **🔥 Série de jours** : un badge s'affiche en haut quand on joue plusieurs
  jours de suite.
- **Hors-ligne complet** : au premier chargement, tout est mis en cache (HTML,
  CSS, JS, police, icônes). Ensuite l'appli marche sans réseau.

## Comment jouer

1. **Écran d'accueil** — coche les tables, règle les options, puis
   **🚀 C'est parti !**
2. **Écran de jeu** — tape la réponse au pavé numérique, **OK ✓** (ou `Entrée`)
   pour valider. Après une bonne réponse on enchaîne tout seul ; après une erreur,
   **Question suivante →** (le bouton reste collé en bas de l'écran).
3. **Écran de bilan** — résultats, graphiques, rapport d'erreurs. De là :
   **Réviser mes erreurs**, **Recommencer**, ou **Choisir d'autres tables**.

Raccourcis clavier (ordinateur) : chiffres `0`–`9`, `Retour arrière` pour effacer,
`C` pour tout effacer, `Entrée` pour valider / passer à la suite.

## Options (écran d'accueil)

| Option | Effet | Défaut |
|---|---|---|
| 🔔 **Petits sons quand on répond** | Un « ding » / « boop » court à chaque réponse (son de synthèse, aucun fichier). | activé |

Les **tables cochées** et le choix « petits sons » sont mémorisés dans le
navigateur pour la prochaine fois.

Le lien **« Réinitialiser la progression »** efface l'historique cumulé des
erreurs et la série de jours (il **garde** les tables cochées et les options).

## Ce que l'appli garde en mémoire (dans le navigateur, jamais envoyé ailleurs)

| Donnée | Clé `localStorage` |
|---|---|
| Tables cochées + option « petits sons » | `tm_prefs_v1` |
| Total cumulé d'erreurs par multiplication | `tm_error_history_v1` |
| Série de jours d'affilée | `tm_streak_v1` |
| Questions par jour (60 jours, pour le graphique 7 j) | `tm_daily_v1` |
| Bandeau « Installer » masqué | `tm_install_hidden` |

Vider les données du site (ou le lien « Réinitialiser la progression » pour une
partie) remet tout à zéro.

## Démarrage local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Un simple double-clic sur `index.html` empêche le Service Worker de se charger
(et donc le mode hors-ligne) : passe par un petit serveur local comme ci-dessus.

## Déployer sur GitHub Pages

1. Pousse tous ces fichiers à la racine du dépôt.
2. **Settings → Pages → Build and deployment → Source : _Deploy from a branch_**,
   branche `main`, dossier `/ (root)`.
3. Attends une minute : le site est publié sur
   `https://<compte>.github.io/<dépôt>/`.
4. Reporte ce lien dans ce README et, si besoin, dans `manifest.json`.

À chaque déploiement, pense à monter le numéro de version (voir plus bas) pour
que les appareils déjà installés récupèrent la nouvelle version.

## Installer sur mobile

Quand l'appli est installable et pas encore installée, un bandeau
**📲 Installer l'appli** apparaît tout seul en haut de l'écran d'accueil :

- **Android / Chrome / Edge** : le bouton lance la vraie fenêtre d'installation
  du navigateur (événement `beforeinstallprompt`).
- **iOS / Safari** : le bouton affiche la marche à suivre (Partager → « Sur
  l'écran d'accueil »), car iOS n'installe pas par un bouton.
- Le lien **« Masquer »** fait disparaître le bandeau définitivement ; il
  disparaît aussi tout seul une fois l'appli installée.

Installation manuelle si besoin : menu ⋮ → « Installer l'application » (Android),
ou Partager → « Sur l'écran d'accueil » (iOS).

## Icônes

L'icône (un gros **×** sur une tuile jaune, posée sur le ciel violet étoilé de
l'appli) est générée par [`tools/make-icon.py`](tools/make-icon.py) :

```bash
pip install pillow
python3 tools/make-icon.py
```

Modifie les constantes de couleur / la géométrie en haut du script, puis
relance-le. Il écrit `icons/icon-192.png`, `icons/icon-512.png`,
`icons/icon-512-maskable.png` (avec la marge de sécurité), `icons/apple-touch-icon.png`
(180×180, sans transparence) et `favicon.ico`. Pour une icône complètement
différente, remplace directement ces fichiers en gardant les mêmes noms et tailles.

## Mettre à jour la version

Le numéro apparaît à 3 endroits, à garder synchronisés :

- `APP_VERSION` en haut de `app.js` ;
- `CACHE_NAME` dans `service-worker.js` ;
- le badge `id="app-version"` dans `index.html`.

Changer `CACHE_NAME` force les appareils déjà installés à recharger l'app shell.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 3 écrans (réglages / jeu / bilan) |
| `app.css` | Styles |
| `app.js` | Logique du jeu |
| `manifest.json` | Config PWA (nom, couleurs, icônes) |
| `service-worker.js` | Cache hors-ligne (app shell + réseau d'abord pour le HTML) |
| `fonts/` | Police Nunito auto-hébergée (fonctionne hors-ligne) |
| `icons/` | Icônes de l'appli |
| `favicon.ico` | Icône d'onglet |
| `tools/make-icon.py` | Génération des icônes (facultatif, nécessite Pillow) |

## Idées d'évolution

- Multiplications « à l'envers » (`? × 7 = 63`) ou divisions associées.
- Mode chronométré / défi.
- Choix du nombre de questions par partie.
