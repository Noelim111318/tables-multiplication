(() => {
  const APP_VERSION = 'v2026.09.01-3';

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
  const mascots = ['🦊', '🐸', '🦁', '🐼', '🦄', '🐯', '🐧', '🦋'];
  let mascotIdx = 0;

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

  function initTables() {
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
    setTimeout(() => btn.blur(), 0);
  }

  function selectAll() {
    selectedTables = Array.from({ length: 10 }, (_, i) => i + 1);
    document.querySelectorAll('.table-btn').forEach(b => b.classList.add('active'));
  }

  function deselectAll() {
    selectedTables = [selectedTables[0] || 2];
    document.querySelectorAll('.table-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.table) === selectedTables[0]);
    });
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
      setTimeout(() => nextQuestion(), 1100);
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
      setTimeout(() => document.getElementById('question-card').classList.remove('shake'), 400);
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
    document.getElementById('progress-text').textContent = `${done} / ${total}`;
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

  initTables();
  lockAnswerInput();

  document.querySelectorAll('.numpad-btn').forEach(button => {
    button.addEventListener('click', () => numpadPress(button.dataset.key));
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
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
              window.location.reload();
            }
          });
        });
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }
})();
