# Tables de Multiplication (PWA)

Appli web pour s'entraîner aux tables de multiplication. On choisit les tables à
travailler, l'appli pose les multiplications dans le désordre, et à la fin elle
donne un **rapport d'erreurs** et un **bilan par table**.

Installable (PWA), fonctionne **100 % hors-ligne**, pavé numérique intégré (le
clavier du téléphone reste fermé), retour visuel + vibrations + petits sons,
série de jours et historique des 7 derniers jours.

**Lien** : https://noelim111318.github.io/tables-multiplication/

Construite sur `pwa-engine` (dossier `engine/` : service worker, bandeau
d'installation, stockage, sons, série de jours). Même esprit que l'appli des
tables d'addition.

## Fonctionnalités

- **Choix des tables** : coche les tables de 1 à 10 (« Tout sélectionner » /
  « Tout décocher »). Une partie = chaque `table × 1…10` une fois, mélangées.
  Le bouton **C'est parti** est grisé tant qu'aucune table n'est cochée.
- **Pavé numérique intégré** : la réponse s'affiche dans un cadre (pas de champ
  de saisie), on tape sur les touches à l'écran — ou au clavier sur ordinateur.
  Les produits vont jusqu'à 100 : 3 chiffres maximum.
- **Réponse immédiate** : bonne réponse → 🎉 confettis, mauvaise → la carte tremble
  et la bonne réponse s'affiche. Vibration courte (si le téléphone la gère) et,
  en option, un petit son.
- **Les erreurs reviennent** : une multiplication ratée est **replacée quelques
  questions plus loin** dans la même partie, jusqu'à ce qu'elle soit sue.
- **⏱️ Contre la montre** (option) : on chronomètre le temps total de la partie (les questions
  ratées qui reviennent comptent ; le chrono se met en pause quand l'appli n'est plus à l'écran)
  et on garde le **meilleur temps** pour chaque ensemble de tables. Le bilan affiche le temps et
  le record (« Nouveau record ! »). Pas de record pour une partie de révision.
- **🕳️ Calcul à trous** (option) : chaque question cache au hasard le résultat, le premier ou le
  deuxième nombre (`? × 7 = 63`), et il faut trouver le nombre manquant. Après une erreur, la
  réponse s'affiche avec l'opération complète. Le record du mode « contre la montre » est séparé.
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
- **Hors-ligne complet** : au premier chargement, tout est mis en cache.
- **Mises à jour sans surprise** : une nouvelle version n'est appliquée que
  depuis l'écran d'accueil, jamais en pleine partie ni pendant la lecture du bilan.

## Comment jouer

1. **Accueil** — coche les tables, règle l'option son, puis **🚀 C'est parti !**
2. **Partie** — tape la réponse au pavé numérique, **OK ✓** (ou `Entrée`) pour
   valider. Après une bonne réponse on enchaîne tout seul ; après une erreur,
   **Question suivante →** (le bouton reste collé en bas de l'écran).
3. **Bilan** — résultats, graphiques, rapport d'erreurs. De là :
   **Réviser mes erreurs**, **Recommencer** (rejoue les mêmes multiplications) ou
   **Choisir d'autres tables**.

Quitter une partie en cours (« Changer les tables ») enregistre quand même ce
qui a été répondu.

Raccourcis clavier (ordinateur) : chiffres `0`–`9`, `Retour arrière` pour
effacer, `C` pour tout effacer, `Entrée` pour valider / passer à la suite.

## Ce qu'on peut régler

Tout est dans [`data.js`](data.js) : bornes des tables et des termes, tables
cochées par défaut, seuil d'hésitation (`slowMs`, 5 s), nombre de chiffres,
mascottes, phrases du bilan. Aucun réglage n'exige de toucher à `app.js`.

## Ce que l'appli garde en mémoire (dans le navigateur, jamais envoyé ailleurs)

Clés `localStorage`, préfixées par `tables-multiplication:` :

| Donnée | Clé |
|---|---|
| Tables cochées + options « petits sons », « contre la montre » et « calcul à trous » | `prefs` |
| Total cumulé d'erreurs par multiplication (`a×b`) | `errors` |
| Série de jours d'affilée | `streak` |
| Questions par jour (60 jours, pour le graphique 7 j) | `daily` |
| Meilleur temps par ensemble de tables, avec ou sans « calcul à trous » (mode « contre la montre ») | `records` |
| Bandeau « Installer » masqué | `install-hidden` |
| Version du schéma de stockage | `__schema` |

Le lien **« Réinitialiser la progression »** efface `errors`, `streak`, `daily` et `records`
(il **garde** les tables cochées et l'option son).

**Reprise des anciennes données.** Avant la v1.2.0, les clés s'appelaient
`tm_prefs_v1`, `tm_error_history_v1`, `tm_streak_v1`, `tm_daily_v1` et
`tm_install_hidden`. Au premier lancement, `store.migrate` (étape 1, tout en haut
de `app.js`) les recopie vers les clés ci-dessus puis supprime les anciennes :
personne ne perd sa série ni son historique.

## Diagnostic

En bas de l'écran d'accueil, à côté de « Réinitialiser la progression », le lien
**Diagnostic** ouvre [`diag.html`](diag.html) : ce que l'appli a en mémoire sur l'appareil (clés
`tables-*`, espace utilisé, service worker, caches) et un **journal des 30
dernières ouvertures** (clé `diag:log`, hors espace de l'appli) qui permet de
situer un éventuel effacement des données. Boutons **Copier** et **Partager**.
Lecture seule, rien n'est envoyé.

## Démarrage local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Un double-clic sur `index.html` empêche le service worker de se charger (donc
le mode hors-ligne) : passe par un petit serveur local.

## Déployer sur GitHub Pages

1. Pousse tous ces fichiers à la racine du dépôt (branche `main`).
2. **Settings → Pages → Build and deployment → Source : _Deploy from a branch_**,
   branche `main`, dossier `/ (root)`.
3. Attends une minute : le site est publié sur
   `https://noelim111318.github.io/tables-multiplication/`.

Le `manifest.json` déclare `"id": "/tables-multiplication/index.html"` : c'est
l'identité que les navigateurs déduisaient déjà de `start_url`, donc les
installations existantes restent la même appli. Ne le change pas.

## Installer sur mobile

Quand l'appli est installable et pas encore installée, un bandeau
**📲 Installer l'appli** apparaît tout seul en haut de l'écran d'accueil :

- **Android / Chrome / Edge** : le bouton lance la vraie fenêtre d'installation
  du navigateur (événement `beforeinstallprompt`).
- **iOS / Safari** : le bouton affiche la marche à suivre (Partager → « Sur
  l'écran d'accueil »), car iOS n'installe pas par un bouton.
- Le lien **« Masquer »** fait disparaître le bandeau définitivement ; il
  disparaît aussi tout seul une fois l'appli installée.

## Livrer une nouvelle version

1. `./tools/bump-version.sh vX.Y.Z` — bumpe la version dans `index.html`,
   `app.js`, `service-worker.js` et `manifest.json` d'un coup.
2. Ajoute tout nouveau fichier statique à `APP_SHELL` dans `service-worker.js`.
3. Déploie : les appareils déjà installés se mettent à jour tout seuls (au
   prochain passage par l'accueil).

## Mettre à jour le moteur

`engine/` est une **copie** de `toolbox/pwa-engine/engine/` : ne la modifie pas
ici. Depuis `toolbox/pwa-engine/` :

```bash
./tools/sync-engine.sh <chemin>/tables-multiplication
```

puis `./tools/bump-version.sh vX.Y.Z` ici (le cache du service worker inclut
`engine/*`). `engine/.version` indique la version du moteur embarquée. API du
moteur : [`engine/README.md`](engine/README.md).

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

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 3 écrans (accueil / partie / bilan) |
| `data.js` | Réglages et contenu (`window.APP_DATA`) |
| `diag.html` | Page de diagnostic (lecture seule) : clés enregistrées, journal des ouvertures, caches |
| `app.js` | Logique du jeu et du bilan |
| `app.css` | Styles (importe `engine/engine.css`) |
| `manifest.json` | Config PWA (nom, couleurs, icônes) |
| `service-worker.js` | Identité du cache + liste des fichiers ; logique dans `engine/sw-core.js` |
| `engine/` | Le moteur PWA (copie de `toolbox/pwa-engine`), avec la police Nunito |
| `icons/`, `favicon.ico` | Icônes de l'appli |
| `tools/` | `make-icon.py` (icônes), `bump-version.sh` (version) |

## Idées d'évolution

- Divisions associées.
- Défi 60 secondes (compte à rebours).
- Choix du nombre de questions par partie.
