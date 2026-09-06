(() => {
  const APP_VERSION = 'v1.1.0';

  const starsWrap = document.getElementById('stars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2.5 + 0.5;
    s.style.width = `${sz}px`;
    s.style.height = `${sz}px`;
    s.style.top = `${Math.random() * 100}%`;
    s.style.left = `${Math.random() * 100}%`;
    s.style.setProperty('--d', `${(Math.random() * 3 + 2).toFixed(1)}s`);
    s.style.setProperty('--delay', `${(Math.random() * 4).toFixed(1)}s`);
    s.style.setProperty('--op', `${(Math.random() * 0.6 + 0.2).toFixed(2)}`);
    starsWrap.appendChild(s);
  }

  let selectedTables = [2, 3, 4, 5];
  let queue = [];
  let wrongSet = new Set();
  let errorCounts = {};
  let slowSet = new Set();
  let opTimes = {};
  let tableStats = {};
  let scoreCorrect = 0;
  let scoreWrong = 0;
  let totalOps = 0;
  let currentOp = null;
  let answered = false;
  let questionStart = 0;

  const SLOW_MS = 5000;
  const HISTORY_KEY = 'tm_error_history_v1';
  const PREFS_KEY = 'tm_prefs_v1';
  const STREAK_KEY = 'tm_streak_v1';
  const DAILY_KEY = 'tm_daily_v1';
  const mascots = ['🦊', '🐸', '🦁', '🐼', '🦄', '🐯', '🐧', '🦋'];
  let mascotIdx = 0;
  let soundOn = true;
  let refreshInstall = function () {};

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveHistory(hist) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    } catch (e) {
      // ignore storage errors
    }
  }

  function persistSessionErrors() {
    const hist = loadHistory();
    for (const [key, count] of Object.entries(errorCounts)) {
      hist[key] = (hist[key] || 0) + count;
    }
    saveHistory(hist);
  }

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return (v && typeof v === 'object') ? v : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function loadPrefs() { return loadJSON(PREFS_KEY, {}); }
  function savePrefs() {
    saveJSON(PREFS_KEY, { tables: selectedTables.slice(), sound: soundOn });
  }

  /* ------------------------------------------------------------- Petits sons */
  let audioCtx = null;
  function ensureAudio() {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function tone(freq, startAt, dur, type, peak) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + startAt;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function playFeedbackSound(ok) {
    if (!soundOn) return;
    ensureAudio();
    if (ok) { tone(660, 0, 0.12, 'sine', 0.22); tone(988, 0.1, 0.16, 'sine', 0.2); }
    else { tone(311, 0, 0.16, 'square', 0.12); tone(233, 0.12, 0.22, 'square', 0.12); }
  }

  /* ------------------------------------------- Série de jours + historique 7 j */
  function dayStr(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function bumpStreak() {
    const today = dayStr(Date.now());
    const yest = dayStr(Date.now() - 864e5);
    const s = loadJSON(STREAK_KEY, { count: 0, lastDay: '' });
    if (s.lastDay === today) return;
    s.count = (s.lastDay === yest) ? (s.count + 1) : 1;
    s.lastDay = today;
    saveJSON(STREAK_KEY, s);
  }
  function renderStreak() {
    const el = document.getElementById('streak-badge');
    if (!el) return;
    const s = loadJSON(STREAK_KEY, { count: 0, lastDay: '' });
    const today = dayStr(Date.now());
    const yest = dayStr(Date.now() - 864e5);
    const alive = s.count > 0 && (s.lastDay === today || s.lastDay === yest);
    el.hidden = !alive;
    if (alive) el.textContent = `🔥 ${s.count} jour${s.count > 1 ? 's' : ''} d'affilée`;
  }
  function logDaily(seen, correct) {
    if (!seen) return;
    const log = loadJSON(DAILY_KEY, {});
    const k = dayStr(Date.now());
    const e = log[k] || { seen: 0, correct: 0 };
    e.seen += seen;
    e.correct += correct;
    log[k] = e;
    const cutoff = dayStr(Date.now() - 60 * 864e5);
    Object.keys(log).forEach(d => { if (d < cutoff) delete log[d]; });
    saveJSON(DAILY_KEY, log);
  }
  function renderWeek() {
    const wrap = document.getElementById('week-bars');
    const block = document.getElementById('history-week');
    const sum = document.getElementById('week-summary');
    if (!wrap || !block) return;
    const log = loadJSON(DAILY_KEY, {});
    const labels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    wrap.innerHTML = '';
    let tSeen = 0, tCorrect = 0, days = 0;
    for (let i = 6; i >= 0; i--) {
      const ms = Date.now() - i * 864e5;
      const e = log[dayStr(ms)];
      const has = !!(e && e.seen);
      const pct = has ? Math.round((e.correct / e.seen) * 100) : 0;
      if (has) { tSeen += e.seen; tCorrect += e.correct; days += 1; }
      const col = document.createElement('div');
      col.className = 'week-col';
      const bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = has ? `${Math.max(8, pct)}%` : '3px';
      if (has) bar.style.background = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
      bar.title = has ? `${e.correct}/${e.seen} — ${pct}%` : 'pas joué';
      const lab = document.createElement('span');
      lab.className = 'week-lab';
      lab.textContent = labels[new Date(ms).getDay()];
      col.append(bar, lab);
      wrap.appendChild(col);
    }
    if (tSeen === 0) { block.hidden = true; return; }
    block.hidden = false;
    const rate = Math.round((tCorrect / tSeen) * 100);
    sum.textContent = `${tSeen} questions sur ${days} jour${days > 1 ? 's' : ''} — ${rate}% de réussite`;
  }

  function initTables() {
    const prefs = loadPrefs();
    if (Array.isArray(prefs.tables)) {
      const saved = prefs.tables
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 1 && n <= 10);
      if (saved.length) selectedTables = [...new Set(saved)];
    }
    if (typeof prefs.sound === 'boolean') soundOn = prefs.sound;

    const grid = document.getElementById('tables-grid');
    for (let i = 1; i <= 10; i++) {
      const btn = document.createElement('button');
      btn.className = 'table-btn' + (selectedTables.includes(i) ? ' active' : '');
      btn.textContent = i;
      btn.dataset.table = String(i);
      btn.addEventListener('click', () => toggleTable(i, btn));
      grid.appendChild(btn);
    }
  }

  function toggleTable(n, btn) {
    if (selectedTables.includes(n)) {
      if (selectedTables.length === 1) return;
      selectedTables = selectedTables.filter(x => x !== n);
      btn.classList.remove('active');
    } else {
      selectedTables.push(n);
      btn.classList.add('active');
    }
    savePrefs();
    setTimeout(() => btn.blur(), 0);
  }

  function selectAll() {
    selectedTables = Array.from({ length: 10 }, (_, i) => i + 1);
    document.querySelectorAll('.table-btn').forEach(b => b.classList.add('active'));
    savePrefs();
  }

  function deselectAll() {
    selectedTables = [selectedTables[0] || 2];
    document.querySelectorAll('.table-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.table) === selectedTables[0]);
    });
    savePrefs();
  }

  function buildQueue() {
    const ops = [];
    for (const t of selectedTables) {
      for (let i = 1; i <= 10; i++) {
        ops.push([t, i]);
      }
    }
    return shuffle(ops);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.body.classList.toggle('results-active', id === 'screen-results');
    document.body.classList.toggle('settings-active', id === 'screen-settings');
    document.body.classList.toggle('game-active', id === 'screen-game');
    window.scrollTo(0, 0);
    refreshInstall();
  }

  function startGame(customQueue) {
    if (!customQueue && selectedTables.length === 0) return;
    queue = customQueue ? shuffle(customQueue) : buildQueue();
    wrongSet = new Set();
    errorCounts = {};
    slowSet = new Set();
    opTimes = {};
    tableStats = {};
    scoreCorrect = 0;
    scoreWrong = 0;
    totalOps = queue.length;
    mascotIdx = 0;
    savePrefs();
    bumpStreak();
    renderStreak();
    ensureAudio();
    updateScoreDisplay();
    showScreen('screen-game');
    nextQuestion();
  }

  function goHome() {
    showScreen('screen-settings');
  }

  function restartGame() {
    startGame();
  }

  function reviewErrors() {
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);
    const ops = [...keys].map(k => k.split('×').map(Number));
    if (ops.length === 0) return;
    startGame(ops);
  }

  function nextQuestion() {
    if (queue.length === 0) {
      showResults();
      return;
    }
    answered = false;
    currentOp = queue.shift();
    window.scrollTo(0, 0);   // chaque question repart en haut de l'écran

    const input = document.getElementById('answer-input');
    input.value = '';
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.className = 'answer-input';
    input.disabled = false;
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('next-btn').classList.remove('visible');

    const numpadButtons = document.querySelectorAll('.numpad-btn');
    numpadButtons.forEach(btn => {
      btn.setAttribute('aria-label', `Touche ${btn.dataset.key}`);
    });

    document.getElementById('question-text').innerHTML =
      `${currentOp[0]} <span class="op-symbol">×</span> ${currentOp[1]} <span class="equals">=</span>`;

    document.getElementById('mascot').textContent = mascots[mascotIdx % mascots.length];
    mascotIdx++;

    questionStart = Date.now();
    updateProgress();
    input.blur();
  }

  function checkAnswer() {
    if (answered) return;
    const input = document.getElementById('answer-input');
    const val = input.value.trim();
    if (val === '') return;

    const userAnswer = parseInt(val, 10);
    const correctAnswer = currentOp[0] * currentOp[1];
    const key = `${currentOp[0]}×${currentOp[1]}`;
    const elapsed = Date.now() - questionStart;
    const table = currentOp[0];
    answered = true;
    input.disabled = true;
    document.getElementById('submit-btn').disabled = true;

    if (!tableStats[table]) tableStats[table] = { asked: 0, correct: 0 };
    tableStats[table].asked++;

    playFeedbackSound(userAnswer === correctAnswer);

    if (userAnswer === correctAnswer) {
      scoreCorrect++;
      wrongSet.delete(key);
      tableStats[table].correct++;
      if (!(key in opTimes) || elapsed < opTimes[key]) opTimes[key] = elapsed;
      if (elapsed > SLOW_MS) slowSet.add(key); else slowSet.delete(key);
      input.classList.add('correct-input');
      const slowNote = elapsed > SLOW_MS ? ' (un peu lent 🐢)' : '';
      const feedback = document.getElementById('feedback');
      feedback.textContent = `✅ Bravo ! ${currentOp[0]} × ${currentOp[1]} = ${correctAnswer}${slowNote}`;
      feedback.className = 'feedback correct';
      document.getElementById('mascot').textContent = '🎉';
      triggerBurst(true);
      triggerHaptic('success');
      setTimeout(() => nextQuestion(), 850);
    } else {
      scoreWrong++;
      wrongSet.add(key);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
      input.classList.add('wrong-input');

      const feedback = document.getElementById('feedback');
      const strong = document.createElement('strong');
      strong.textContent = String(correctAnswer);
      feedback.textContent = '❌ Pas tout à fait… La réponse était ';
      feedback.appendChild(strong);
      feedback.className = 'feedback wrong';
      document.getElementById('mascot').textContent = '😬';
      document.getElementById('question-card').classList.add('shake');
      triggerHaptic('error');
      setTimeout(() => document.getElementById('question-card').classList.remove('shake'), 260);
      const pos = Math.floor(Math.random() * Math.min(4, queue.length + 1)) + 1;
      queue.splice(pos, 0, currentOp);
    }

    updateScoreDisplay();
    document.getElementById('next-btn').classList.add('visible');
  }

  function updateProgress() {
    const done = totalOps + wrongSet.size - queue.length;
    const total = totalOps + wrongSet.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const remaining = Math.max(total - done, 0);
    document.getElementById('progress-text').textContent = `${done} / ${total} • ${remaining} restantes`;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('score-remaining').textContent = String(queue.length);
  }

  function updateScoreDisplay() {
    document.getElementById('score-correct').textContent = String(scoreCorrect);
    document.getElementById('score-wrong').textContent = String(scoreWrong);
    document.getElementById('score-remaining').textContent = String(queue.length);
    updateProgress();
  }

  function showResults() {
    const total = scoreCorrect + scoreWrong;
    const rate = total > 0 ? Math.round((scoreCorrect / total) * 100) : 100;
    document.getElementById('res-correct').textContent = String(scoreCorrect);
    document.getElementById('res-wrong').textContent = String(scoreWrong);
    document.getElementById('res-rate').textContent = `${rate}%`;

    let emoji, title, sub;
    if (rate === 100) { emoji = '🏆'; title = 'Parfait !'; sub = 'Tu as tout bon du premier coup, champion !'; }
    else if (rate >= 80) { emoji = '⭐'; title = 'Excellent !'; sub = `${rate}% de réussite, c'est super !`; }
    else if (rate >= 60) { emoji = '👍'; title = 'Bien joué !'; sub = `${rate}% de réussite, continue à t'entraîner !`; }
    else { emoji = '💪'; title = 'Courage !'; sub = `${rate}% — pratique encore, tu vas y arriver !`; }

    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = sub;

    persistSessionErrors();
    logDaily(total, scoreCorrect);
    renderWeek();
    renderTableSummary();
    renderErrorReport();

    const hasMisses = Object.keys(errorCounts).length > 0 || slowSet.size > 0;
    document.getElementById('review-btn').disabled = !hasMisses;

    showScreen('screen-results');
    triggerBurst(rate >= 80);
  }

  function renderTableSummary() {
    const wrap = document.getElementById('table-summary-list');
    const summaryBlock = document.getElementById('table-summary');
    wrap.innerHTML = '';

    const tables = Object.keys(tableStats).map(Number).sort((a, b) => a - b);
    if (tables.length === 0) {
      summaryBlock.style.display = 'none';
      return;
    }
    summaryBlock.style.display = '';

    for (const t of tables) {
      const { asked, correct } = tableStats[t];
      const pct = asked > 0 ? Math.round((correct / asked) * 100) : 100;
      const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
      const row = document.createElement('div');
      row.className = 'table-summary-row';

      const tName = document.createElement('span');
      tName.className = 'tname';
      tName.textContent = `Table de ${t}`;

      const tBar = document.createElement('span');
      tBar.className = 'tbar';
      const tBarFill = document.createElement('span');
      tBarFill.className = 'tbar-fill';
      tBarFill.style.width = `${pct}%`;
      tBarFill.style.background = color;
      tBar.appendChild(tBarFill);

      const tPct = document.createElement('span');
      tPct.className = 'tpct';
      tPct.textContent = `${pct}%`;
      tPct.style.color = color;

      row.append(tName, tBar, tPct);
      wrap.appendChild(row);
    }
  }

  function fmtTime(ms) {
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }

  function renderErrorReport() {
    const listEl = document.getElementById('error-list');
    listEl.innerHTML = '';

    const history = loadHistory();
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);

    if (keys.size === 0) {
      listEl.innerHTML = '<div class="no-errors">🎉 Aucune erreur, bravo !</div>';
      return;
    }

    const entries = [...keys].sort((ka, kb) => {
      const ea = errorCounts[ka] || 0, eb = errorCounts[kb] || 0;
      if (eb !== ea) return eb - ea;
      return (opTimes[kb] || 0) - (opTimes[ka] || 0);
    });

    for (const key of entries) {
      const [a, b] = key.split('×').map(Number);
      const result = a * b;
      const count = errorCounts[key] || 0;
      const row = document.createElement('div');
      row.className = 'error-row';

      const op = document.createElement('span');
      op.className = 'op';
      op.innerHTML = `${a} <span class="x">×</span> ${b} = <span class="res">${result}</span>`;

      const timeNote = key in opTimes ? document.createElement('span') : null;
      if (timeNote) {
        timeNote.className = 'time';
        timeNote.textContent = `⏱ ${fmtTime(opTimes[key])}`;
        op.appendChild(timeNote);
      }

      const meta = document.createElement('span');
      meta.className = 'error-row-meta';

      const histNote = history[key] ? document.createElement('span') : null;
      if (histNote) {
        histNote.className = 'history';
        histNote.textContent = `total : ${history[key]}`;
        meta.appendChild(histNote);
      }

      const badge = document.createElement('span');
      badge.className = 'count';
      if (count > 0) {
        badge.textContent = count > 1 ? `${count} erreurs` : '1 erreur';
      } else {
        badge.textContent = '🐢 hésitation';
        badge.classList.add('error-badge--hesitant');
      }
      meta.appendChild(badge);

      row.append(op, meta);
      listEl.appendChild(row);
    }
  }

  function triggerHaptic(type = 'tap') {
    if (!('vibrate' in navigator)) return;
    if (type === 'success') navigator.vibrate([20, 35, 25]);
    else if (type === 'error') navigator.vibrate([30, 25, 60]);
    else navigator.vibrate(10);
  }

  function updateViewportScale() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const scale = Math.min(1, Math.max(0.75, vh / 820));
    document.documentElement.style.setProperty('--app-scale', scale.toFixed(3));
  }

  function lockAnswerInput() {
    const input = document.getElementById('answer-input');
    input.readOnly = true;
    input.tabIndex = -1;
    input.setAttribute('inputmode', 'none');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');

    input.addEventListener('focus', () => {
      setTimeout(() => input.blur(), 0);
    });

    input.addEventListener('keydown', e => e.preventDefault());
    input.addEventListener('beforeinput', e => e.preventDefault());
    input.addEventListener('touchstart', e => {
      e.preventDefault();
      input.blur();
    }, { passive: false });
  }

  function numpadPress(k) {
    if (answered) return;
    const input = document.getElementById('answer-input');
    if (k === 'clear') {
      input.value = '';
      input.blur();
      triggerHaptic();
      return;
    }
    if (k === 'del') {
      input.value = input.value.slice(0, -1);
    } else {
      if (input.value.length >= 3) return;
      input.value += k;
    }
    input.blur();
    triggerHaptic();
  }

  function triggerBurst(positive) {
    const wrap = document.getElementById('burst');
    wrap.innerHTML = '';
    const colors = positive
      ? ['#FFD60A', '#4ADE80', '#60A5FA', '#F472B6', '#FBBF24']
      : ['#FF6B6B', '#F87171', '#FCA5A5'];
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const n = positive ? 28 : 12;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'burst-particle';
      const angle = (i / n) * 360;
      const dist = positive ? (80 + Math.random() * 160) : (40 + Math.random() * 80);
      const rad = angle * Math.PI / 180;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.background = colors[i % colors.length];
      p.style.width = `${positive ? 10 : 7}px`;
      p.style.height = `${positive ? 10 : 7}px`;
      p.style.setProperty('--dx', `${Math.cos(rad) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(rad) * dist}px`);
      p.style.animationDuration = positive ? '0.9s' : '0.6s';
      wrap.appendChild(p);
    }
    setTimeout(() => { wrap.innerHTML = ''; }, 1000);
  }

  document.getElementById('app-version').textContent = APP_VERSION;

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (answered) nextQuestion();
      else checkAnswer();
    }
    if (e.key >= '0' && e.key <= '9' && !answered) {
      numpadPress(e.key);
    }
    if (e.key === 'Backspace' && !answered) {
      numpadPress('del');
    }
    if (e.key.toLowerCase() === 'c' && !answered) {
      numpadPress('clear');
    }
  });

  document.getElementById('select-all-btn').addEventListener('click', selectAll);
  document.getElementById('deselect-btn').addEventListener('click', deselectAll);
  document.getElementById('start-btn').addEventListener('click', () => startGame());
  document.getElementById('go-home-game').addEventListener('click', goHome);
  document.getElementById('go-home-results').addEventListener('click', goHome);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('submit-btn').addEventListener('click', checkAnswer);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('review-btn').addEventListener('click', reviewErrors);

  const printBtn = document.getElementById('print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  // initTables() charge les préférences (tables cochées + son), donc avant le
  // câblage de la case "son" pour que la case reflète le choix mémorisé.
  initTables();
  lockAnswerInput();

  const soundToggle = document.getElementById('sound-toggle');
  if (soundToggle) {
    soundToggle.checked = soundOn;
    soundToggle.addEventListener('change', () => {
      soundOn = soundToggle.checked;
      if (soundOn) ensureAudio();
      savePrefs();
    });
  }

  const resetBtn = document.getElementById('reset-progress');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const ok = window.confirm(
        'Effacer toute la progression ?\n'
        + '(historique des erreurs et série de jours)');
      if (!ok) return;
      [HISTORY_KEY, STREAK_KEY, DAILY_KEY].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
      location.reload();
    });
  }

  /* ----------------------------------- Bandeau "Installer l'appli" (en haut) */
  (function setupInstall() {
    const row = document.getElementById('install-row');
    const btn = document.getElementById('install-btn');
    const dismiss = document.getElementById('install-dismiss');
    const hint = document.getElementById('install-hint');
    if (!row || !btn) return;

    const HIDE_KEY = 'tm_install_hidden';
    let deferred = null;
    let mode = null;               // null | 'prompt' | 'ios'
    let hiddenByUser = false;
    try { hiddenByUser = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { /* ignore */ }

    function isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true
        || document.referrer.indexOf('android-app://') === 0;
    }
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const iOSSafari = iOS && /safari/i.test(navigator.userAgent)
      && !/crios|fxios|edgios|opios|android/i.test(navigator.userAgent);

    // affiché seulement sur l'écran d'accueil, et seulement si l'appli est installable
    refreshInstall = function () {
      const onHome = document.getElementById('screen-settings').classList.contains('active');
      const show = !!mode && !hiddenByUser && !isStandalone() && onHome;
      row.hidden = !show;
      if (!show) hint.hidden = true;
      if (show) row.dataset.mode = mode;
    };
    function forget() {
      hiddenByUser = true;
      try { localStorage.setItem(HIDE_KEY, '1'); } catch (e) { /* ignore */ }
      refreshInstall();
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferred = e;
      mode = 'prompt';
      refreshInstall();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      mode = null;
      forget();
    });

    btn.addEventListener('click', async () => {
      if (mode === 'ios') {
        hint.hidden = !hint.hidden;
        hint.textContent = "Sur iPhone/iPad : touche « Partager » (le carré avec une flèche vers le haut), "
          + "puis « Sur l'écran d'accueil ».";
        return;
      }
      if (!deferred) return;
      btn.disabled = true;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null;
      mode = null;
      btn.disabled = false;
      refreshInstall();
    });
    if (dismiss) dismiss.addEventListener('click', forget);

    // iOS Safari ne déclenche jamais beforeinstallprompt : on propose la marche à suivre.
    if (iOSSafari) mode = 'ios';
    refreshInstall();
  })();

  renderStreak();
  showScreen('screen-settings');
  updateViewportScale();
  window.addEventListener('resize', updateViewportScale);

  document.querySelectorAll('.numpad-btn').forEach(button => {
    button.addEventListener('click', () => numpadPress(button.dataset.key));
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reloadKey = `sw-reload:${APP_VERSION}`;
        const registration = await navigator.serviceWorker.register(`service-worker.js?v=${APP_VERSION}`);
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, '1');
                window.location.reload();
              }
            }
          });
        });
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }
})();
