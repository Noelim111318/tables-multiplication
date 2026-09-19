/* Tables de Multiplication — logique de l'app.
 *
 * La coque PWA (service worker, bandeau installer, stockage, sons, série de
 * jours…) vient d'AppEngine (engine/engine.js). Ici : le jeu et le bilan.
 */
(function () {
  'use strict';

  const APP_VERSION = 'v1.4.0';
  const APP_ID = 'tables-multiplication';
  const E = window.AppEngine;
  const D = window.APP_DATA;
  const $ = E.$;

  /* ----------------------------------------- Reprise des anciennes données */
  // Avant le moteur, les clés étaient `tm_*` (sans préfixe). On les recopie une
  // fois vers le stockage du moteur, AVANT boot() : le badge de série et le
  // bandeau d'installation lisent le stockage dès le démarrage.
  const LEGACY_KEYS = {
    tm_prefs_v1: 'prefs',
    tm_error_history_v1: 'errors',
    tm_streak_v1: 'streak',
    tm_daily_v1: 'daily',
    tm_install_hidden: 'install-hidden',
  };
  E.store.ns(APP_ID);
  E.store.migrate({
    1: function () {
      Object.keys(LEGACY_KEYS).forEach((oldKey) => {
        const name = LEGACY_KEYS[oldKey];
        let raw = null;
        try { raw = localStorage.getItem(oldKey); } catch (e) { return; }
        if (raw === null) return;
        let done;
        try {
          if (!E.store.keys().includes(name)) {
            E.store.save(name, name === 'install-hidden' ? true : JSON.parse(raw));
          }
          done = E.store.keys().includes(name);   // save() avale les erreurs de quota
        } catch (e) {
          done = true;                            // valeur illisible : rien à sauver
        }
        if (done) {
          try { localStorage.removeItem(oldKey); } catch (e) { /* ignore */ }
        }
      });
    },
  });

  E.boot({
    id: APP_ID,
    version: APP_VERSION,
    autoReload: false,      // voir « Mises à jour » plus bas : jamais en pleine partie
    strings: {
      weekNotPlayed: 'pas joué',
      weekSummary: (seen, days, rate) =>
        `${seen} questions sur ${days} jour${days > 1 ? 's' : ''} — ${rate}% de réussite`,
      streak: (n) => `🔥 ${n} jour${n > 1 ? 's' : ''} d'affilée`,
      installIosHint: 'Sur iPhone/iPad : touche « Partager » (le carré avec une flèche vers le haut), '
        + 'puis « Sur l\'écran d\'accueil ».',
    },
  });

  /* ------------------------------------------------- Journal des ouvertures */
  // Diagnostic (voir diag.html) : garde les 30 dernières ouvertures (heure,
  // version, mode, clés de progression présentes) dans une clé hors espace de
  // l'appli, pour situer un éventuel effacement des données.
  (function logOpening() {
    try {
      const own = E.store.keys();
      const log = JSON.parse(localStorage.getItem('diag:log') || '[]');
      log.push({
        t: new Date().toISOString(), a: APP_ID, v: APP_VERSION,
        m: window.matchMedia('(display-mode: standalone)').matches ? 1 : 0,
        k: ['prefs', 'errors', 'streak', 'daily'].filter((k) => own.includes(k)).join(','),
      });
      localStorage.setItem('diag:log', JSON.stringify(log.slice(-30)));
    } catch (e) { /* ignore */ }
  })();

  /* ------------------------------------------------------------------ État */
  let selected = [];            // tables cochées
  let soundOn = true;

  let queue = [];               // questions restantes (la courante est sortie)
  let lastOps = [];             // questions de la dernière partie (pour « Recommencer »)
  let errorCounts = {};         // erreurs de la partie : clé -> nombre
  let slowSet = new Set();      // bonnes réponses trop lentes
  let opTimes = {};             // meilleur temps de bonne réponse : clé -> ms
  let tableStats = {};          // table -> { asked, correct }
  let correctCount = 0;
  let wrongCount = 0;
  let totalOps = 0;
  let current = null;           // [a, b]
  let answered = false;
  let answerStr = '';
  let startedAt = 0;
  let advanceTimer = null;
  let mascotIdx = 0;
  let committed = true;         // la partie en cours a-t-elle déjà été enregistrée ?
  let timedOn = false;          // option « Contre la montre » (préférence)
  let holesOn = false;          // option « Calcul à trous » (préférence)
  let gameTimed = false;        // la partie en cours est-elle chronométrée ?
  let recordKey = null;         // clé du record de cette partie (null : pas de record, ex. révision)
  let lastRecordKey = null;     // idem, pour « Recommencer »

  // Le séparateur reste « × » : c'est le format des historiques déjà enregistrés.
  const keyOf = (a, b) => `${a}×${b}`;
  const parseKey = (k) => k.split('×').map(Number);
  // Calcul à trous : la question cache le résultat ('r'), le 1er nombre ('a') ou le 2e ('b').
  const SHAPES = ['r', 'a', 'b'];
  const pickShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const allTables = range(D.tables.min, D.tables.max);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ------------------------------------------------------------ Préférences */
  function loadPrefs() {
    const p = E.store.load('prefs', {});
    const saved = Array.isArray(p.tables)
      ? p.tables.map(Number).filter((n) => allTables.includes(n))
      : [];
    selected = saved.length ? [...new Set(saved)] : D.tables.defaults.slice();
    soundOn = typeof p.sound === 'boolean' ? p.sound : true;
    timedOn = p.timed === true;
    holesOn = p.holes === true;
    if (!soundOn) E.sound.enable(false);   // enable(true) créerait l'AudioContext avant tout geste
  }
  function savePrefs() {
    E.store.save('prefs', { tables: selected.slice(), sound: soundOn, timed: timedOn, holes: holesOn });
  }

  function loadErrorHistory() {
    const h = E.store.load('errors', {});
    return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
  }

  /* --------------------------------------------------- Écran 1 : les tables */
  const grid = $('#tables-grid');
  const startBtn = $('#start-btn');

  function renderTableButtons() {
    grid.innerHTML = '';
    allTables.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-btn';
      btn.textContent = String(t);
      btn.dataset.table = String(t);
      btn.setAttribute('aria-label', `Table de ${t}`);
      grid.appendChild(btn);
    });
    syncTableButtons();
  }

  function syncTableButtons() {
    grid.querySelectorAll('.table-btn').forEach((btn) => {
      const on = selected.includes(Number(btn.dataset.table));
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    startBtn.disabled = selected.length === 0;
  }

  function toggleTable(t) {
    selected = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    syncTableButtons();
    savePrefs();
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.table-btn');
    if (btn) toggleTable(Number(btn.dataset.table));
  });
  $('#select-all-btn').addEventListener('click', () => {
    selected = allTables.slice();
    syncTableButtons();
    savePrefs();
  });
  $('#deselect-btn').addEventListener('click', () => {
    selected = [];
    syncTableButtons();
    savePrefs();
  });

  const soundToggle = $('#sound-toggle');
  soundToggle.addEventListener('change', () => {
    soundOn = soundToggle.checked;
    E.sound.enable(soundOn);
    savePrefs();
  });

  const timedToggle = $('#timed-toggle');
  if (timedToggle) {
    timedToggle.addEventListener('change', () => {
      timedOn = timedToggle.checked;
      savePrefs();
    });
  }

  const holesToggle = $('#holes-toggle');
  if (holesToggle) {
    holesToggle.addEventListener('change', () => {
      holesOn = holesToggle.checked;
      savePrefs();
    });
  }

  $('#reset-progress').addEventListener('click', () => {
    const ok = window.confirm(
      'Effacer toute la progression ?\n(historique des erreurs, série de jours et records)');
    if (!ok) return;
    ['errors', 'streak', 'daily', 'records'].forEach((k) => E.store.remove(k));
    window.location.reload();
  });

  /* ----------------------------------------------------- Écran 2 : la partie */
  const answerEl = $('#answer');
  const feedbackEl = $('#feedback');
  const nextBtn = $('#next-btn');
  const cardEl = $('#question-card');
  const mascotEl = $('#mascot');
  const submitBtn = $('#submit-btn');

  function buildOps() {
    const ops = [];
    selected.forEach((t) => {
      range(D.terms.min, D.terms.max).forEach((i) => ops.push([t, i]));
    });
    return ops;
  }

  // recordKeyArg : non fourni = partie normale (record par ensemble de tables) ; null = pas de record (révision).
  function startGame(ops, recordKeyArg) {
    const base = ops && ops.length ? ops : buildOps();
    if (!base.length) return;
    // Chaque question cache au hasard le résultat, le 1er ou le 2e nombre (si l'option est cochée).
    const list = base.map((o) => [o[0], o[1], holesOn ? pickShape() : 'r']);
    clearTimeout(advanceTimer);
    recordKey = recordKeyArg !== undefined ? recordKeyArg : (ops && ops.length ? null : tablesKey() + (holesOn ? '|trous' : ''));
    lastRecordKey = recordKey;
    gameTimed = timedOn;
    lastOps = list.map((o) => o.slice());
    queue = shuffle(list);
    errorCounts = {};
    slowSet = new Set();
    opTimes = {};
    tableStats = {};
    correctCount = 0;
    wrongCount = 0;
    totalOps = queue.length;
    mascotIdx = 0;
    committed = false;
    savePrefs();
    E.sound.resume();
    E.screens.show('screen-play');
    updateScore();
    startClock();
    nextQuestion();
  }

  function nextQuestion() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (!queue.length) {
      showResults();
      return;
    }
    current = queue.shift();
    answered = false;
    answerStr = '';
    window.scrollTo(0, 0);

    answerEl.textContent = '';
    answerEl.className = 'answer-input';
    submitBtn.disabled = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    nextBtn.classList.remove('visible');

    const q = $('#question-text');
    q.textContent = '';
    const shape = current[2] || 'r';
    q.append(shape === 'a' ? span('hole', '?') : String(current[0]));
    q.append(' ', span('op-symbol', '×'), ' ');
    q.append(shape === 'b' ? span('hole', '?') : String(current[1]));
    q.append(' ', span('equals', '='));
    if (shape !== 'r') q.append(' ', String(current[0] * current[1]));

    mascotEl.textContent = D.mascots[mascotIdx % D.mascots.length];
    mascotIdx++;
    startedAt = Date.now();
  }

  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function checkAnswer() {
    if (answered || answerStr === '' || !current) return;

    const [a, b, shape] = current;
    const product = a * b;
    const expected = shape === 'a' ? a : shape === 'b' ? b : product;   // le nombre à trouver
    const ok = parseInt(answerStr, 10) === expected;
    const key = keyOf(a, b);
    const elapsed = Date.now() - startedAt;
    if (clock.active) clock.final = clockMs();   // le temps s'arrête à la dernière réponse
    answered = true;
    submitBtn.disabled = true;

    const stat = tableStats[a] || (tableStats[a] = { asked: 0, correct: 0 });
    stat.asked++;
    E.sound.feedback(ok);

    if (ok) {
      correctCount++;
      stat.correct++;
      if (!(key in opTimes) || elapsed < opTimes[key]) opTimes[key] = elapsed;
      const slow = elapsed > D.slowMs;
      if (slow) slowSet.add(key); else slowSet.delete(key);
      answerEl.classList.add('correct-input');
      feedbackEl.textContent = `✅ Bravo ! ${a} × ${b} = ${product}${slow ? ' (un peu lent 🐢)' : ''}`;
      feedbackEl.className = 'feedback correct';
      mascotEl.textContent = '🎉';
      E.fx.burst(true);
      E.haptic('success');
      advanceTimer = setTimeout(nextQuestion, 850);
    } else {
      wrongCount++;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
      answerEl.classList.add('wrong-input');
      const strong = document.createElement('strong');
      strong.textContent = String(expected);
      feedbackEl.textContent = '❌ Pas tout à fait… La réponse était ';
      feedbackEl.appendChild(strong);
      if (shape !== 'r') feedbackEl.append(` (${a} × ${b} = ${product})`);
      feedbackEl.className = 'feedback wrong';
      mascotEl.textContent = '😬';
      cardEl.classList.add('shake');
      setTimeout(() => cardEl.classList.remove('shake'), 400);
      E.haptic('error');
      // La question ratée revient quelques questions plus loin.
      const pos = Math.floor(Math.random() * Math.min(D.requeueSpan, queue.length + 1)) + 1;
      queue.splice(pos, 0, current);
      nextBtn.classList.add('visible');
    }
    updateScore();
  }

  function updateScore() {
    const remaining = Math.max(totalOps - correctCount, 0);
    $('#score-correct').textContent = String(correctCount);
    $('#score-wrong').textContent = String(wrongCount);
    $('#score-remaining').textContent = String(remaining);
    $('#progress-text').textContent = `${correctCount} / ${totalOps}`;
    $('#progress-fill').style.width = `${totalOps ? Math.round((correctCount / totalOps) * 100) : 0}%`;
  }

  function numpadPress(k) {
    if (answered) return;
    if (k === 'clear') answerStr = '';
    else if (k === 'del') answerStr = answerStr.slice(0, -1);
    else if (answerStr.length < D.maxDigits) answerStr += k;
    else return;
    answerEl.textContent = answerStr;
    E.haptic('tap');
  }

  const numpad = $('#numpad');
  numpad.addEventListener('click', (e) => {
    const btn = e.target.closest('.numpad-btn');
    if (btn) numpadPress(btn.dataset.key);
  });
  // À la souris, cliquer une touche ne doit pas lui donner le focus : sinon
  // Entrée (pour valider) « re-taperait » la même touche.
  numpad.addEventListener('mousedown', (e) => e.preventDefault());
  submitBtn.addEventListener('click', checkAnswer);
  nextBtn.addEventListener('click', nextQuestion);
  $('#quit-btn').addEventListener('click', () => {
    clearTimeout(advanceTimer);
    stopClock();
    commitSession();
    E.screens.show('screen-home');
  });

  document.addEventListener('keydown', (e) => {
    if (E.screens.current() !== 'screen-play') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const button = e.target.closest && e.target.closest('button');
    const inFlow = button && button.closest('#numpad, #submit-btn, #next-btn');
    if (e.key === 'Enter') {
      // Un bouton hors du flux de jeu (« Changer les tables ») garde son propre
      // comportement. Pour les autres on prend la main et on annule le « clic »
      // que le navigateur enverrait en plus : sinon la question avance deux fois.
      if (button && !inFlow) return;
      e.preventDefault();
      if (answered) nextQuestion(); else checkAnswer();
    } else if (/^[0-9]$/.test(e.key)) {
      numpadPress(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      numpadPress('del');
    } else if (e.key.toLowerCase() === 'c') {
      numpadPress('clear');
    }
  });

  /* -------------------------------------------------------- Enregistrement */
  // Une partie est enregistrée une seule fois : à la fin, ou quand on la quitte
  // en cours de route (ce qui a été répondu compte quand même).
  function commitSession() {
    if (committed) return;
    committed = true;
    const seen = correctCount + wrongCount;
    if (!seen) return;
    const hist = loadErrorHistory();
    Object.keys(errorCounts).forEach((k) => { hist[k] = (hist[k] || 0) + errorCounts[k]; });
    E.store.save('errors', hist);
    E.history.bumpStreak();
    E.history.logDaily(seen, correctCount);
    E.history.renderStreak('#streak-badge');
    requestPersistence();
  }

  // Demande au navigateur de ne pas purger le stockage local (historique, série).
  // Chrome l'accorde d'office aux applis installées ; Firefox interroge
  // l'utilisateur, d'où un seul essai, après une première partie plutôt qu'au
  // démarrage. Sans effet là où l'API n'existe pas.
  let persistAsked = false;
  function requestPersistence() {
    if (persistAsked || !(navigator.storage && navigator.storage.persist)) return;
    persistAsked = true;
    navigator.storage.persisted()
      .then((yes) => yes || navigator.storage.persist())
      .catch(() => { /* ignore */ });
  }

  /* ------------------------------------------------------------ Chronomètre */
  // « Contre la montre » : on mesure le temps total de la partie (les questions ratées qui
  // reviennent comptent). Il s'arrête à la dernière réponse et se met en pause quand l'appli
  // n'est plus à l'écran. Le record est le meilleur temps pour le même ensemble de tables.
  const timerEl = $('#timer');
  const clock = { active: false, running: false, acc: 0, since: 0, tick: null, final: 0 };
  const tablesKey = () => selected.slice().sort((x, y) => x - y).join(',');
  const clockMs = () => clock.acc + (clock.running ? performance.now() - clock.since : 0);
  const fmtClock = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  function renderTimer() {
    if (timerEl) timerEl.textContent = `⏱ ${fmtClock(clockMs())}`;
  }
  function startClock() {
    clearInterval(clock.tick);
    clock.active = gameTimed;
    clock.running = gameTimed;
    clock.acc = 0;
    clock.final = 0;
    clock.since = performance.now();
    if (timerEl) timerEl.hidden = !gameTimed;
    if (gameTimed) {
      renderTimer();
      clock.tick = setInterval(renderTimer, 250);
    }
  }
  function stopClock() {           // partie abandonnée ou terminée
    clearInterval(clock.tick);
    clock.active = false;
    clock.running = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (!clock.active) return;
    if (document.hidden) {
      if (clock.running) { clock.acc += performance.now() - clock.since; clock.running = false; }
    } else if (!clock.running) {
      clock.since = performance.now();
      clock.running = true;
    }
  });

  // Affiche le temps et le record ; renvoie une phrase pour les lecteurs d'écran (ou '').
  function renderTimeResult() {
    const item = $('#time-item');
    const timed = clock.active;
    stopClock();
    if (item) item.hidden = !timed;
    if (!timed) return '';
    const ms = clock.final;
    let note = '';
    let isNew = false;
    if (recordKey) {
      const stored = E.store.load('records', {});
      const records = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      const prev = records[recordKey];
      if (!prev || typeof prev.ms !== 'number') {
        note = '🏅 Premier temps enregistré !';
        isNew = true;
      } else if (Math.floor(ms / 1000) < Math.floor(prev.ms / 1000)) {
        note = `🏅 Nouveau record ! (avant : ${fmtClock(prev.ms)})`;
        isNew = true;
      } else {
        note = `Record : ${fmtClock(prev.ms)}`;
      }
      if (isNew) {
        records[recordKey] = { ms: Math.round(ms), day: E.history.dayStr(Date.now()) };
        E.store.save('records', records);
      }
    }
    const t = $('#res-time');
    if (t) t.textContent = fmtClock(ms);
    const r = $('#res-record');
    if (r) {
      r.textContent = note;
      r.classList.toggle('is-new', isNew);
    }
    return `Temps : ${fmtClock(ms)}.${note ? ' ' + note.replace('🏅 ', '') : ''}`;
  }

  /* ---------------------------------------------------------- Écran 3 : bilan */
  const fmtTime = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const barColor = (pct) => (pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)');

  function showResults() {
    const total = correctCount + wrongCount;
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 100;
    const tier = D.tiers.find((t) => rate >= t.min) || D.tiers[D.tiers.length - 1];

    $('#res-correct').textContent = String(correctCount);
    $('#res-wrong').textContent = String(wrongCount);
    $('#res-rate').textContent = `${rate}%`;
    $('#result-emoji').textContent = tier.emoji;
    $('#result-title').textContent = tier.title;
    $('#result-subtitle').textContent = tier.sub.replace('{rate}', String(rate));
    const timeText = renderTimeResult();

    commitSession();
    E.history.renderWeek({ bars: '#week-bars', block: '#history-week', summary: '#week-summary' });
    renderTableSummary();
    renderErrorReport();
    $('#review-btn').disabled = Object.keys(errorCounts).length === 0 && slowSet.size === 0;

    E.screens.show('screen-done');
    E.fx.burst(rate >= 80);
    E.announce(`Partie terminée. ${tier.title} ${correctCount} bonnes réponses, ${wrongCount} erreurs.${timeText ? ' ' + timeText : ''}`);
  }

  function renderTableSummary() {
    const wrap = $('#table-summary-list');
    const block = $('#table-summary');
    wrap.innerHTML = '';
    const tables = Object.keys(tableStats).map(Number).sort((a, b) => a - b);
    block.hidden = tables.length === 0;

    tables.forEach((t) => {
      const { asked, correct } = tableStats[t];
      const pct = asked > 0 ? Math.round((correct / asked) * 100) : 100;
      const row = document.createElement('div');
      row.className = 'table-summary-row';
      const fill = span('tbar-fill', '');
      fill.style.width = `${pct}%`;
      fill.style.background = barColor(pct);
      const bar = span('tbar', '');
      bar.appendChild(fill);
      const pctEl = span('tpct', `${pct}%`);
      pctEl.style.color = barColor(pct);
      row.append(span('tname', `Table de ${t}`), bar, pctEl);
      wrap.appendChild(row);
    });
  }

  function renderErrorReport() {
    const list = $('#error-list');
    list.innerHTML = '';
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);
    if (keys.size === 0) {
      list.appendChild(span('no-errors', '🎉 Aucune erreur, bravo !'));
      return;
    }

    const history = loadErrorHistory();
    const entries = [...keys].sort((ka, kb) => {
      const diff = (errorCounts[kb] || 0) - (errorCounts[ka] || 0);
      return diff || (opTimes[kb] || 0) - (opTimes[ka] || 0);
    });

    entries.forEach((key) => {
      const [a, b] = parseKey(key);
      const count = errorCounts[key] || 0;
      const row = document.createElement('div');
      row.className = 'error-row';

      const op = span('op', `${a} `);
      op.append(span('x', '×'), ` ${b} = `, span('res', String(a * b)));
      if (key in opTimes) op.append(span('time', `⏱ ${fmtTime(opTimes[key])}`));

      const meta = span('error-row-meta', '');
      if (history[key]) meta.append(span('history', `total : ${history[key]}`));
      const badge = span('count', count > 1 ? `${count} erreurs` : '1 erreur');
      if (count === 0) {
        badge.textContent = '🐢 hésitation';
        badge.classList.add('error-badge--hesitant');
      }
      meta.append(badge);

      row.append(op, meta);
      list.appendChild(row);
    });
  }

  $('#review-btn').addEventListener('click', () => {
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);
    startGame([...keys].map(parseKey), null);
  });
  $('#print-btn').addEventListener('click', () => window.print());
  $('#again-btn').addEventListener('click', () => startGame(lastOps, lastRecordKey));
  $('#home-btn').addEventListener('click', () => E.screens.show('screen-home'));

  /* ------------------------------------------------------------ Mises à jour */
  // Une nouvelle version n'est appliquée que depuis l'accueil : jamais en plein
  // milieu d'une partie ni pendant la lecture du bilan. Le service worker prend
  // la main (apply), puis la page se recharge quand il contrôle réellement la page.
  E.on('sw:updateready', (update) => {
    let off = null;
    const applyIfHome = () => {
      if (E.screens.current() !== 'screen-home') return;
      if (off) off();
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      update.apply();
    };
    off = E.on('screen:show', applyIfHome);
    applyIfHome();
  });

  /* ---------------------------------------------------------------- Démarrage */
  loadPrefs();
  soundToggle.checked = soundOn;
  if (timedToggle) timedToggle.checked = timedOn;
  if (holesToggle) holesToggle.checked = holesOn;
  renderTableButtons();
  startBtn.addEventListener('click', () => startGame());
  E.screens.show('screen-home', { focus: false });
})();
