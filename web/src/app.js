(() => {
  const MAX_COMMITS = 2000;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch { /* storage unavailable */ }
    },
  };

  const state = {
    lang: store.get('cc.lang') ?? (navigator.language?.startsWith('zh') ? 'zh' : 'en'),
    api: null,
    user: null,
    repos: [],
    weeks: [],
    drawing: store.get('cc.drawing', {}), // date -> level (1-4)
    history: [],
    level: 4,
    strength: store.get('cc.strength', null),
    busy: false,
  };

  // ---------- i18n ----------
  function t(key, vars = {}) {
    const text = window.CC_I18N[state.lang][key] ?? window.CC_I18N.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    $('lang').textContent = state.lang === 'zh' ? 'English' : '中文';
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    const pastYear = $('year').querySelector('option[value=""]');
    if (pastYear) pastYear.textContent = t('year.past');
    const noRepo = $('repo').querySelector('option[value=""]');
    if (noRepo) noRepo.textContent = t('repo.none');
    buildGraph();
    renderLast();
  }

  // ---------- status ----------
  function setStatus(text = '', kind = '') {
    const el = $('status');
    el.className = `status ${kind}`;
    el.textContent = text;
  }

  function setStatusLink(text, href, label) {
    setStatus(`${text} `, 'ok');
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    $('status').append(link);
  }

  function showError(error) {
    if (error?.status === 401) setStatus(t('error.token'), 'error');
    else if (error?.message === 'NO_PUSH') setStatus(t('error.noPush'), 'error');
    else setStatus(t('error.generic', { msg: error?.message ?? String(error) }), 'error');
  }

  // ---------- dates & grid ----------
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoLocal(new Date());

  // Empty past-year grid used before connecting.
  function offlineWeeks() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 52 * 7);
    const end = today();
    return Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
      const date = isoLocal(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
      return date > end ? null : { date, count: 0, level: 0 };
    }));
  }

  const paintable = (cell) => cell && cell.date <= today();

  function visibleDrawn() {
    const out = [];
    for (const week of state.weeks) {
      for (const cell of week) {
        if (paintable(cell) && state.drawing[cell.date]) out.push([cell.date, state.drawing[cell.date]]);
      }
    }
    return out;
  }

  const countFor = (level) => Math.max(1, Math.round((state.strength * level) / 4));

  function autoStrength() {
    const counts = state.weeks.flat().filter((c) => c?.count > 0).map((c) => c.count).sort((a, b) => a - b);
    const p90 = counts.length ? counts[Math.floor((counts.length - 1) * 0.9)] : 0;
    return Math.min(30, Math.max(4, p90));
  }

  function buildGraph() {
    const graph = $('graph');
    graph.replaceChildren();
    graph.style.setProperty('--cols', state.weeks.length);

    const monthFmt = new Intl.DateTimeFormat(state.lang === 'zh' ? 'zh-CN' : 'en', { month: 'short' });
    const dayFmt = new Intl.DateTimeFormat(state.lang === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' });

    graph.append(Object.assign(document.createElement('span'), { className: 'corner' }));
    const months = state.weeks.map((week) => week.find(Boolean)?.date.slice(0, 7));
    months.forEach((month, col) => {
      const label = document.createElement('span');
      label.className = 'month';
      label.style.gridColumn = col + 2;
      if (month && month !== months[col - 1]) {
        // Skip a leading partial month whose label would overlap the next one.
        const next = months.findIndex((m, i) => i > col && m !== month);
        if (!(col === 0 && next !== -1 && next < 3)) {
          const [y, m] = month.split('-').map(Number);
          label.textContent = monthFmt.format(new Date(y, m - 1, 1));
        }
      }
      graph.append(label);
    });

    for (let row = 0; row < 7; row += 1) {
      const day = document.createElement('span');
      day.className = 'weekday';
      day.style.gridRow = row + 2;
      if (row % 2 === 1) day.textContent = dayFmt.format(new Date(2024, 0, 7 + row));
      graph.append(day);
      state.weeks.forEach((week, col) => {
        const cell = week[row];
        const el = document.createElement('i');
        el.className = 'cell';
        el.style.gridColumn = col + 2;
        el.style.gridRow = row + 2;
        el.dataset.col = col;
        el.dataset.row = row;
        if (cell) {
          el.dataset.date = cell.date;
          el.title = cell.count ? `${cell.date} · ${cell.count}` : cell.date;
        }
        graph.append(el);
      });
    }
    renderCells();
    // On narrow screens start at the most recent weeks, like GitHub does.
    graph.parentElement.scrollLeft = graph.parentElement.scrollWidth;
  }

  function renderCells() {
    for (const el of $('graph').querySelectorAll('.cell')) {
      const cell = state.weeks[el.dataset.col][el.dataset.row];
      let cls = 'cell';
      if (!paintable(cell)) cls += ' off';
      else if (state.drawing[cell.date]) cls += ` l${state.drawing[cell.date]} drawn`;
      else if (cell.level) cls += ` l${cell.level} existing`;
      else cls += ' l0';
      el.className = cls;
    }
    renderSummary();
  }

  function renderSummary() {
    const drawn = visibleDrawn();
    const commits = drawn.reduce((sum, [, level]) => sum + countFor(level), 0);
    $('summary-commits').textContent = t('summary.commits', { n: commits });
    $('summary-pixels').textContent = t('summary.pixels', { n: drawn.length });
    $('paint').disabled = state.busy || commits === 0;
  }

  // ---------- drawing ----------
  function snapshot() {
    state.history.push(JSON.stringify(state.drawing));
    if (state.history.length > 100) state.history.shift();
  }

  function commit() {
    store.set('cc.drawing', state.drawing);
    renderCells();
  }

  function setCell(cell, level) {
    if (!paintable(cell)) return;
    if (level > 0) state.drawing[cell.date] = level;
    else delete state.drawing[cell.date];
  }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el?.classList.contains('cell') || !el.closest('#graph')) return null;
    return state.weeks[el.dataset.col]?.[el.dataset.row] ?? null;
  }

  let stroke = null;
  $('graph').addEventListener('pointerdown', (event) => {
    const cell = cellAt(event.clientX, event.clientY);
    if (!paintable(cell) || state.busy) return;
    event.preventDefault();
    $('graph').setPointerCapture(event.pointerId);
    snapshot();
    const current = state.drawing[cell.date] ?? 0;
    // Right-click, or clicking a square that already has this shade, erases.
    const level = event.button === 2 || (current === state.level && state.level > 0) ? 0 : state.level;
    stroke = { level };
    setCell(cell, level);
    renderCells();
  });
  $('graph').addEventListener('pointermove', (event) => {
    if (!stroke) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell) {
      setCell(cell, stroke.level);
      renderCells();
    }
  });
  const endStroke = () => {
    if (!stroke) return;
    stroke = null;
    commit();
  };
  $('graph').addEventListener('pointerup', endStroke);
  $('graph').addEventListener('pointercancel', endStroke);
  $('graph').addEventListener('contextmenu', (event) => event.preventDefault());

  function selectLevel(level) {
    state.level = level;
    for (const button of document.querySelectorAll('.swatch')) {
      button.setAttribute('aria-checked', String(Number(button.dataset.level) === level));
    }
  }
  for (const button of document.querySelectorAll('.swatch')) {
    button.addEventListener('click', () => selectLevel(Number(button.dataset.level)));
  }

  $('text-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const { pixels, width } = window.CC_renderText($('text').value);
    if (!pixels.length) return;
    snapshot();
    const start = Math.max(0, Math.floor((state.weeks.length - width) / 2));
    for (const [col, row] of pixels) setCell(state.weeks[start + col]?.[row], state.level || 4);
    commit();
  });

  function shift(delta) {
    snapshot();
    const moved = [];
    state.weeks.forEach((week, col) => week.forEach((cell, row) => {
      if (paintable(cell) && state.drawing[cell.date]) {
        moved.push([col + delta, row, state.drawing[cell.date]]);
        delete state.drawing[cell.date];
      }
    }));
    for (const [col, row, level] of moved) setCell(state.weeks[col]?.[row], level);
    commit();
  }
  $('shift-left').addEventListener('click', () => shift(-1));
  $('shift-right').addEventListener('click', () => shift(1));

  function undo() {
    if (!state.history.length) return;
    state.drawing = JSON.parse(state.history.pop());
    commit();
  }
  $('undo').addEventListener('click', undo);

  $('clear').addEventListener('click', () => {
    snapshot();
    for (const week of state.weeks) for (const cell of week) if (cell) delete state.drawing[cell.date];
    commit();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (/^[0-4]$/.test(event.key)) {
      selectLevel(Number(event.key));
    }
  });

  $('strength').addEventListener('input', () => {
    const value = Math.round(Number($('strength').value));
    if (value >= 1 && value <= 50) {
      state.strength = value;
      store.set('cc.strength', value);
      renderSummary();
    }
  });

  // ---------- GitHub ----------
  function savedToken() {
    try {
      const remembered = localStorage.getItem('cc.token');
      return remembered ? { token: remembered, remember: true } : { token: sessionStorage.getItem('cc.token'), remember: false };
    } catch {
      return { token: null, remember: false };
    }
  }

  async function connect(token, remember) {
    state.api = window.CC_GitHub.create(token, {
      onWait: (seconds) => setStatus(t('progress.wait', { s: seconds })),
    });
    setStatus('…');
    try {
      state.user = await state.api.user();
    } catch (error) {
      state.api = null;
      if (error.status === 401) forgetToken();
      showError(error);
      return;
    }
    try {
      if (remember) localStorage.setItem('cc.token', token);
      else sessionStorage.setItem('cc.token', token);
    } catch { /* storage unavailable */ }
    $('token').value = '';
    $('connect').hidden = true;
    $('setup').hidden = false;
    $('account').hidden = false;
    $('avatar').src = state.user.avatar;
    $('login').textContent = state.user.login;
    $('login').href = state.user.url;
    setStatus();
    await Promise.all([loadRepos(), loadCalendar()]);
  }

  function forgetToken() {
    try {
      localStorage.removeItem('cc.token');
      sessionStorage.removeItem('cc.token');
    } catch { /* storage unavailable */ }
  }

  function signOut() {
    forgetToken();
    state.api = null;
    state.user = null;
    $('connect').hidden = false;
    $('setup').hidden = true;
    $('account').hidden = true;
    $('last').hidden = true;
    state.weeks = offlineWeeks();
    buildGraph();
    setStatus();
  }

  async function loadRepos(created) {
    try {
      state.repos = await state.api.repos();
    } catch (error) {
      showError(error);
      return;
    }
    // A just-created repository may not be listed yet.
    if (created && !state.repos.some((r) => r.fullName === created.fullName)) state.repos.unshift(created);
    const current = created?.fullName ?? store.get('cc.repo');
    const el = $('repo');
    el.replaceChildren(new Option(t('repo.none'), ''));
    for (const repo of state.repos) {
      el.append(new Option(repo.private ? `${repo.fullName} 🔒` : repo.fullName, repo.fullName));
    }
    el.value = state.repos.some((r) => r.fullName === current) ? current : '';
    onRepoChange();
  }

  function onRepoChange() {
    const repo = state.repos.find((r) => r.fullName === $('repo').value);
    store.set('cc.repo', repo?.fullName ?? null);
    $('private-hint').hidden = !repo?.private;
    renderLast();
  }

  async function loadCalendar() {
    const year = $('year').value;
    try {
      const { weeks, years } = await state.api.calendar(year ? Number(year) : null);
      state.weeks = weeks;
      const el = $('year');
      const options = ['', ...years.map(String)];
      if (el.options.length !== options.length) {
        el.replaceChildren(...options.map((value) => new Option(value || t('year.past'), value)));
        el.value = year;
      }
    } catch (error) {
      showError(error);
      return;
    }
    if (store.get('cc.strength') === null) {
      state.strength = autoStrength();
      $('strength').value = state.strength;
    }
    buildGraph();
  }

  $('connect-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const token = $('token').value.trim();
    if (token) connect(token, $('remember').checked);
  });
  $('signout').addEventListener('click', signOut);
  $('repo').addEventListener('change', onRepoChange);
  $('year').addEventListener('change', loadCalendar);
  $('refresh').addEventListener('click', loadCalendar);

  $('repo-new').addEventListener('click', () => {
    $('new-repo').hidden = false;
    $('new-repo-name').focus();
  });
  $('new-repo-cancel').addEventListener('click', () => { $('new-repo').hidden = true; });
  $('new-repo').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const repo = await state.api.createRepo($('new-repo-name').value.trim(), $('new-repo-private').checked);
      $('new-repo').hidden = true;
      $('new-repo-name').value = '';
      await loadRepos(repo);
    } catch (error) {
      showError(error);
    }
  });

  // ---------- paint ----------
  function setBusy(busy) {
    state.busy = busy;
    for (const el of document.querySelectorAll('button, input, select')) {
      if (!el.closest('.top')) el.disabled = busy;
    }
    renderSummary();
  }

  function progress(done, total) {
    $('progress').hidden = total === 0;
    $('progress').firstElementChild.style.width = total ? `${(100 * done) / total}%` : '0';
  }

  // In-page confirmation dialog; resolves to true when confirmed.
  function ask(title, body, okLabel, note = '') {
    const dialog = $('confirm');
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    $('confirm-note').textContent = note;
    $('confirm-note').hidden = !note;
    $('confirm-ok').textContent = okLabel;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    });
  }

  $('paint').addEventListener('click', async () => {
    const repo = $('repo').value;
    if (!state.api || !repo) {
      setStatus(t('paint.needConnect'), 'error');
      return;
    }
    const drawn = visibleDrawn().sort(([a], [b]) => a.localeCompare(b));
    const dates = drawn.flatMap(([date, level]) => Array(countFor(level)).fill(date));
    if (dates.length > MAX_COMMITS) {
      setStatus(t('error.tooMany', { n: dates.length, max: MAX_COMMITS }), 'error');
      return;
    }

    const branch = state.repos.find((r) => r.fullName === repo)?.branch ?? 'main';
    const ok = await ask(
      t('confirm.title'),
      t('confirm.body', { commits: dates.length, days: drawn.length, repo, branch }),
      t('confirm.ok'),
      t('confirm.note'),
    );
    if (!ok) return;

    setBusy(true);
    setStatus(t('progress.prepare'));
    progress(0, dates.length);
    try {
      const result = await state.api.paint(repo, dates, state.user, (done, total, phase) => {
        progress(done, total);
        setStatus(phase === 'push' ? t('progress.push') : t('progress.commits', { done, total }));
      });
      snapshot();
      const painted = Object.fromEntries(drawn);
      for (const [date] of drawn) delete state.drawing[date];
      store.set('cc.drawing', state.drawing);
      store.set('cc.last', { ...result, drawing: painted });
      setStatusLink(t('done.body', { n: result.count, repo }), state.user.url, t('done.view'));
    } catch (error) {
      showError(error);
    } finally {
      progress(0, 0);
      setBusy(false);
      renderLast();
    }
    await loadCalendar();
  });

  function renderLast() {
    const last = store.get('cc.last');
    const show = Boolean(state.api && last);
    $('last').hidden = !show;
    if (show) $('last-text').textContent = t('last.title', { n: last.count, repo: last.fullName });
  }

  $('last-undo').addEventListener('click', async () => {
    const last = store.get('cc.last');
    if (!last) return;
    const ok = await ask(t('last.undo'), t('undoPaint.confirm', { repo: last.fullName, branch: last.branch }), t('last.undo'));
    if (!ok) return;
    setBusy(true);
    try {
      await state.api.undoPaint(last);
      store.set('cc.last', null);
      snapshot();
      Object.assign(state.drawing, last.drawing ?? {});
      store.set('cc.drawing', state.drawing);
      setStatus(t('undoPaint.done'), 'ok');
    } catch (error) {
      if (error.message === 'MOVED') setStatus(t('undoPaint.moved'), 'error');
      else showError(error);
    } finally {
      setBusy(false);
      renderLast();
    }
    await loadCalendar();
  });

  $('lang').addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    store.set('cc.lang', state.lang);
    applyLanguage();
  });

  // ---------- desktop app ----------
  // Inside the Tauri desktop app, open external links in the system browser.
  const desktop = window.__TAURI__;
  if (desktop) {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="http"]');
      if (!link) return;
      event.preventDefault();
      desktop.opener.openUrl(link.href).catch(() => window.open(link.href, '_blank'));
    });
  }

  // ---------- start ----------
  state.weeks = offlineWeeks();
  state.strength ??= 4;
  $('strength').value = state.strength;
  selectLevel(4);
  applyLanguage();
  const saved = savedToken();
  // The desktop app keeps its own storage, so remember the token by default there.
  $('remember').checked = saved.token ? saved.remember : Boolean(desktop);
  if (saved.token) connect(saved.token, saved.remember);
})();
