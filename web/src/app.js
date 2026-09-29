(() => {
  const MAX_COMMITS = 2000;
  const MANY_COMMITS = 200;
  // OAuth App client ID for "Sign in with GitHub" (device flow, desktop app only).
  const OAUTH_CLIENT_ID = '';

  const $ = (id) => document.getElementById(id);
  const desktop = window.__TAURI__ ?? null;
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
    total: null,
    drawing: store.get('cc.drawing', {}), // date -> level (1-4)
    undo: [],
    redo: [],
    level: 4,
    strength: store.get('cc.strength', null) ?? 4,
    avoid: store.get('cc.avoid', true),
    preview: false,
    pan: false,
    cursor: { col: 0, row: 0 },
    busy: false,
    device: null,
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
    const past = $('range').querySelector('option[value=""]');
    if (past) past.textContent = t('range.past');
    const none = $('repo').querySelector('option[value=""]');
    if (none) none.textContent = t('repo.none');
    buildGraph();
    renderAccount();
    renderRepoHint();
    renderLast();
  }

  // ---------- status ----------
  function setStatus(text = '', kind = '') {
    $('status').className = `status ${kind}`;
    $('status').textContent = text;
  }

  function setStatusLink(text, href, label) {
    setStatus(`${text} `, 'ok');
    const link = Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener', textContent: label });
    $('status').append(link);
  }

  function errorText(error) {
    if (error?.status === 401) return t('error.token');
    if (error?.status === 0) return t('error.network');
    if (error?.message === 'NO_PUSH') return t('error.noPush');
    return t('error.generic', { msg: error?.message ?? String(error) });
  }

  // ---------- dates & grid ----------
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoLocal(new Date());
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Empty past-year grid used before signing in.
  function offlineWeeks() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 52 * 7);
    const end = today();
    return Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
      const date = isoLocal(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
      return date > end ? null : { date, count: 0, level: 0 };
    }));
  }

  const paintable = (cell) => Boolean(cell) && cell.date <= today();
  const cellAtPos = (col, row) => state.weeks[col]?.[row] ?? null;
  const countFor = (level) => Math.max(1, Math.round((state.strength * level) / 4));

  // Planned cells in the current view: {date, level, blocked}.
  function planned() {
    const out = [];
    for (const week of state.weeks) {
      for (const cell of week) {
        const level = paintable(cell) ? state.drawing[cell.date] : 0;
        if (level) out.push({ date: cell.date, level, blocked: state.avoid && cell.count > 0 });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  function planDates() {
    return planned().filter((p) => !p.blocked).flatMap((p) => Array(countFor(p.level)).fill(p.date));
  }

  function autoStrength() {
    const counts = state.weeks.flat().filter((c) => c?.count > 0).map((c) => c.count).sort((a, b) => a - b);
    const p90 = counts.length ? counts[Math.floor((counts.length - 1) * 0.9)] : 0;
    return Math.min(30, Math.max(4, p90));
  }

  // Estimated levels after sending, using quartiles like GitHub does.
  function previewLevels() {
    const added = new Map(planned().filter((p) => !p.blocked).map((p) => [p.date, countFor(p.level)]));
    const totals = new Map();
    for (const cell of state.weeks.flat()) if (cell) totals.set(cell.date, cell.count + (added.get(cell.date) ?? 0));
    const nonZero = [...totals.values()].filter((n) => n > 0).sort((a, b) => a - b);
    const q = (p) => nonZero[Math.floor((nonZero.length - 1) * p)] ?? 0;
    const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
    const levels = new Map();
    for (const [date, n] of totals) levels.set(date, n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);
    return levels;
  }

  function buildGraph() {
    const graph = $('graph');
    graph.replaceChildren();
    graph.style.setProperty('--cols', state.weeks.length);
    const locale = state.lang === 'zh' ? 'zh-CN' : 'en';
    const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
    const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });

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
        const el = document.createElement('i');
        el.style.gridColumn = col + 2;
        el.style.gridRow = row + 2;
        el.dataset.col = col;
        el.dataset.row = row;
        graph.append(el);
      });
    }
    renderCells();
    // Start at the most recent weeks on narrow screens, like GitHub does.
    graph.parentElement.scrollLeft = graph.parentElement.scrollWidth;
  }

  function renderCells() {
    const preview = state.preview ? previewLevels() : null;
    for (const el of $('graph').querySelectorAll('i[data-col]')) {
      const cell = cellAtPos(el.dataset.col, el.dataset.row);
      let cls = 'cell';
      let title = '';
      if (!paintable(cell)) {
        cls += ' off';
      } else {
        const drawn = state.drawing[cell.date];
        title = cell.count ? `${cell.date} · ${cell.count}` : cell.date;
        if (preview) cls += ` l${preview.get(cell.date) ?? 0}`;
        else if (drawn) cls += ` l${drawn} drawn${state.avoid && cell.count ? ' blocked' : ''}`;
        else cls += ` l${cell.level} existing`;
        if (drawn) title += ` → +${countFor(drawn)}`;
      }
      if (Number(el.dataset.col) === state.cursor.col && Number(el.dataset.row) === state.cursor.row) cls += ' cursor';
      el.className = cls;
      el.title = title;
    }
    renderSummary();
  }

  function renderSummary() {
    const items = planned();
    const active = items.filter((p) => !p.blocked);
    const commits = active.reduce((sum, p) => sum + countFor(p.level), 0);
    $('sum-commits').textContent = commits;
    $('sum-days').textContent = active.length;
    $('sum-range').textContent = active.length ? `${active[0].date} – ${active.at(-1).date}` : '—';
    const skipped = items.length - active.length;
    $('sum-skipped').hidden = skipped === 0;
    $('sum-skipped').textContent = t('summary.skipped', { n: skipped });
    $('legend-blocked').hidden = !state.avoid;
    $('paint').disabled = state.busy || commits === 0;
    $('undo').disabled = state.busy || !state.undo.length;
    $('redo').disabled = state.busy || !state.redo.length;
    for (const brush of document.querySelectorAll('.brush[data-level]')) {
      const level = Number(brush.dataset.level);
      if (level > 0) brush.querySelector('small').textContent = t('tool.commits', { n: countFor(level) });
    }
    renderSteps();
  }

  function renderSteps() {
    $('step-connect').classList.toggle('done', Boolean(state.user));
    $('step-repo').classList.toggle('done', Boolean($('repo').value));
    $('step-draw').classList.toggle('done', planned().some((p) => !p.blocked));
  }

  // ---------- history ----------
  function remember() {
    state.undo.push(JSON.stringify(state.drawing));
    if (state.undo.length > 100) state.undo.shift();
    state.redo = [];
  }

  function save() {
    store.set('cc.drawing', state.drawing);
    renderCells();
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(JSON.stringify(state.drawing));
    state.drawing = JSON.parse(state.undo.pop());
    save();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(JSON.stringify(state.drawing));
    state.drawing = JSON.parse(state.redo.pop());
    save();
  }

  // ---------- drawing ----------
  function setCell(cell, level) {
    if (!paintable(cell)) return;
    if (level > 0) state.drawing[cell.date] = level;
    else delete state.drawing[cell.date];
  }

  // Clicking a square that already has the selected shade erases it.
  const strokeLevel = (cell, erase) => (erase || (state.level > 0 && state.drawing[cell.date] === state.level) ? 0 : state.level);

  function leavePreview() {
    if (!state.preview) return;
    state.preview = false;
    renderMode();
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el?.dataset?.col || !el.closest('#graph')) return null;
    return { col: Number(el.dataset.col), row: Number(el.dataset.row), cell: cellAtPos(el.dataset.col, el.dataset.row) };
  }

  let stroke = null;
  $('graph').addEventListener('pointerdown', (event) => {
    if (state.busy || state.pan) return;
    const hit = cellFromPoint(event.clientX, event.clientY);
    if (!hit || !paintable(hit.cell)) return;
    event.preventDefault();
    leavePreview();
    $('graph').setPointerCapture(event.pointerId);
    remember();
    stroke = { level: strokeLevel(hit.cell, event.button === 2) };
    state.cursor = { col: hit.col, row: hit.row };
    setCell(hit.cell, stroke.level);
    renderCells();
  });
  $('graph').addEventListener('pointermove', (event) => {
    if (!stroke) return;
    const hit = cellFromPoint(event.clientX, event.clientY);
    if (hit?.cell) {
      setCell(hit.cell, stroke.level);
      renderCells();
    }
  });
  const endStroke = () => {
    if (!stroke) return;
    stroke = null;
    save();
  };
  $('graph').addEventListener('pointerup', endStroke);
  $('graph').addEventListener('pointercancel', endStroke);
  $('graph').addEventListener('contextmenu', (event) => event.preventDefault());

  // Keyboard drawing: arrows move, Space/Enter paints, Home/End jump.
  $('graph').addEventListener('keydown', (event) => {
    const { col, row } = state.cursor;
    const last = state.weeks.length - 1;
    const moves = {
      ArrowLeft: [Math.max(0, col - 1), row],
      ArrowRight: [Math.min(last, col + 1), row],
      ArrowUp: [col, Math.max(0, row - 1)],
      ArrowDown: [col, Math.min(6, row + 1)],
      Home: [0, row],
      End: [last, row],
      PageUp: [Math.max(0, col - 4), row],
      PageDown: [Math.min(last, col + 4), row],
    };
    if (moves[event.key]) {
      event.preventDefault();
      state.cursor = { col: moves[event.key][0], row: moves[event.key][1] };
      renderCells();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const cell = cellAtPos(col, row);
      if (!paintable(cell) || state.busy) return;
      leavePreview();
      remember();
      setCell(cell, strokeLevel(cell, false));
      save();
    }
  });

  function selectLevel(level) {
    state.level = level;
    for (const brush of document.querySelectorAll('.brush')) {
      brush.setAttribute('aria-checked', String(Number(brush.dataset.level) === level));
    }
  }
  for (const brush of document.querySelectorAll('.brush')) {
    brush.addEventListener('click', () => selectLevel(Number(brush.dataset.level)));
  }

  // Paints [col, row] pixels starting at the column that centers them.
  function stamp(pixels, width, level) {
    const start = Math.max(0, Math.floor((state.weeks.length - width) / 2));
    for (const [col, row, own] of pixels) setCell(cellAtPos(start + col, row), own ?? level);
  }

  function clearView() {
    for (const week of state.weeks) for (const cell of week) if (cell) delete state.drawing[cell.date];
  }

  $('text-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const { pixels, width } = window.CC_renderText($('text').value);
    if (!pixels.length) return;
    leavePreview();
    remember();
    stamp(pixels, width, state.level || 4);
    save();
  });

  const TEMPLATES = {
    heart: () => window.CC_renderText('♥'),
    hello: () => window.CC_renderText('HELLO'),
    wave() {
      const width = state.weeks.length;
      const pixels = [];
      for (let col = 0; col < width; col += 1) {
        const y = 3 - 2.6 * Math.sin((col / 12) * 2 * Math.PI);
        for (let row = 0; row < 7; row += 1) {
          const d = Math.abs(row - y);
          if (d < 0.6) pixels.push([col, row, 4]);
          else if (d < 1.4) pixels.push([col, row, 2]);
        }
      }
      return { pixels, width };
    },
    stars() {
      const width = state.weeks.length;
      const pixels = [];
      for (let col = 3, i = 0; col < width - 1; col += 7, i += 1) {
        const row = i % 2 ? 4 : 2;
        pixels.push([col, row, 4], [col - 1, row, 2], [col + 1, row, 2], [col, row - 1, 2], [col, row + 1, 2]);
        pixels.push([col + 3, i % 2 ? 1 : 5, 1]);
      }
      return { pixels, width };
    },
  };

  for (const button of document.querySelectorAll('[data-template]')) {
    button.addEventListener('click', async () => {
      if (planned().length && !(await ask(t('template.label'), t('template.replace'), t('confirm.ok')))) return;
      const { pixels, width } = TEMPLATES[button.dataset.template]();
      leavePreview();
      remember();
      clearView();
      stamp(pixels, width, state.level || 4);
      save();
    });
  }

  function shift(delta) {
    leavePreview();
    remember();
    const moved = [];
    state.weeks.forEach((week, col) => week.forEach((cell, row) => {
      if (paintable(cell) && state.drawing[cell.date]) {
        moved.push([col + delta, row, state.drawing[cell.date]]);
        delete state.drawing[cell.date];
      }
    }));
    for (const [col, row, level] of moved) setCell(cellAtPos(col, row), level);
    save();
  }
  $('shift-left').addEventListener('click', () => shift(-1));
  $('shift-right').addEventListener('click', () => shift(1));
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('clear').addEventListener('click', () => {
    leavePreview();
    remember();
    clearView();
    save();
  });

  $('zoom').addEventListener('click', () => {
    const on = !$('graph').classList.contains('zoomed');
    $('graph').classList.toggle('zoomed', on);
    $('zoom').setAttribute('aria-pressed', String(on));
    store.set('cc.zoom', on);
  });
  $('pan').addEventListener('click', () => {
    state.pan = !state.pan;
    $('graph').classList.toggle('panning', state.pan);
    $('pan').setAttribute('aria-pressed', String(state.pan));
  });

  function renderMode() {
    $('mode-edit').setAttribute('aria-pressed', String(!state.preview));
    $('mode-preview').setAttribute('aria-pressed', String(state.preview));
    $('legend-edit').hidden = state.preview;
    $('legend-preview').hidden = !state.preview;
    renderCells();
  }
  $('mode-edit').addEventListener('click', () => { state.preview = false; renderMode(); });
  $('mode-preview').addEventListener('click', () => { state.preview = true; renderMode(); });

  $('avoid').addEventListener('change', () => {
    state.avoid = $('avoid').checked;
    store.set('cc.avoid', state.avoid);
    renderCells();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea, dialog')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      redo();
    } else if (/^[0-4]$/.test(event.key)) {
      selectLevel(Number(event.key));
    }
  });

  $('strength').addEventListener('input', () => {
    const value = Math.round(Number($('strength').value));
    if (value >= 1 && value <= 50) {
      state.strength = value;
      store.set('cc.strength', value);
      renderCells();
    }
  });

  // ---------- dialog ----------
  // In-page confirmation; resolves to true when confirmed.
  function ask(title, body, okLabel, { details = [], check = '', note = '' } = {}) {
    const dialog = $('confirm');
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    $('confirm-details').replaceChildren(...details.flatMap(([k, v]) => [
      Object.assign(document.createElement('dt'), { textContent: k }),
      Object.assign(document.createElement('dd'), { textContent: v }),
    ]));
    $('confirm-details').hidden = !details.length;
    $('confirm-check-wrap').hidden = !check;
    $('confirm-check').checked = false;
    $('confirm-check-text').textContent = check;
    $('confirm-note').textContent = note;
    $('confirm-note').hidden = !note;
    $('confirm-ok').textContent = okLabel;
    $('confirm-ok').disabled = Boolean(check);
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    });
  }
  $('confirm-check').addEventListener('change', () => { $('confirm-ok').disabled = !$('confirm-check').checked; });

  // ---------- files ----------
  async function saveFile(name, text) {
    if (desktop) {
      const path = await desktop.dialog.save({ defaultPath: name });
      if (!path) return false;
      await desktop.core.invoke('write_text', { path, contents: text });
      return true;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  $('design-save').addEventListener('click', async () => {
    const design = { kind: 'commit-canvas-design', version: 2, strength: state.strength, drawing: state.drawing };
    try {
      if (await saveFile('commit-canvas-design.json', `${JSON.stringify(design, null, 2)}\n`)) setStatus(t('design.saved'), 'ok');
    } catch (error) {
      setStatus(errorText(error), 'error');
    }
  });

  $('design-open').addEventListener('click', () => $('design-file').click());
  $('design-file').addEventListener('change', async () => {
    const file = $('design-file').files[0];
    $('design-file').value = '';
    if (!file) return;
    const drawing = parseDesign(await file.text().catch(() => ''));
    if (!drawing) {
      setStatus(t('design.invalid'), 'error');
      return;
    }
    leavePreview();
    remember();
    state.drawing = drawing.drawing;
    if (drawing.strength) {
      state.strength = drawing.strength;
      $('strength').value = drawing.strength;
      store.set('cc.strength', drawing.strength);
    }
    save();
    setStatus(t('design.loaded'), 'ok');
  });

  // Accepts this version's designs and the original 53×7 design files.
  function parseDesign(text) {
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    if (!data || typeof data !== 'object') return null;
    const drawing = {};
    const okLevel = (l) => Number.isInteger(l) && l >= 1 && l <= 4;
    if (data.kind === 'commit-canvas-design' && data.drawing && typeof data.drawing === 'object') {
      for (const [date, level] of Object.entries(data.drawing)) {
        if (DATE_RE.test(date) && okLevel(level)) drawing[date] = level;
      }
      const strength = Number.isInteger(data.strength) && data.strength >= 1 && data.strength <= 50 ? data.strength : null;
      return { drawing, strength };
    }
    if (data.version === 1 && DATE_RE.test(data.endDate ?? '') && Array.isArray(data.levels) && data.levels.length === 371) {
      const [y, m, d] = data.endDate.split('-').map(Number);
      const end = new Date(Date.UTC(y, m - 1, d));
      const first = new Date(end);
      first.setUTCDate(end.getUTCDate() - end.getUTCDay() - 52 * 7);
      data.levels.forEach((level, index) => {
        if (!okLevel(level)) return;
        const day = new Date(first);
        day.setUTCDate(first.getUTCDate() + index);
        drawing[day.toISOString().slice(0, 10)] = level;
      });
      return { drawing, strength: null };
    }
    return null;
  }

  function scriptFor(kind, email) {
    const dates = planDates();
    const perDay = new Map();
    const commits = dates.map((date) => {
      const n = (perDay.get(date) ?? 0) + 1;
      perDay.set(date, n);
      return [window.CC_GitHub.noonOn(date, n), `Commit Canvas ${date} #${n}`];
    });
    if (kind === 'bash') {
      return [
        '#!/usr/bin/env bash',
        `# Commit Canvas: creates ${commits.length} empty commits in the current Git repository.`,
        'set -euo pipefail',
        'git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Run this inside a Git repository folder."; exit 1; }',
        `read -r -p "Create ${commits.length} empty commits in $(pwd)? [y/N] " answer`,
        '[[ "$answer" == [yY]* ]] || exit 1',
        `export GIT_AUTHOR_EMAIL='${email}' GIT_COMMITTER_EMAIL='${email}'`,
        'c() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit --allow-empty -q -m "$2"; }',
        ...commits.map(([date, message]) => `c '${date}' '${message}'`),
        'echo "Done. Now run: git push"',
        '',
      ].join('\n');
    }
    return [
      `# Commit Canvas: creates ${commits.length} empty commits in the current Git repository.`,
      "$ErrorActionPreference = 'Stop'",
      'git rev-parse --is-inside-work-tree *> $null',
      "if ($LASTEXITCODE -ne 0) { throw 'Run this inside a Git repository folder.' }",
      `$answer = Read-Host "Create ${commits.length} empty commits in $(Get-Location)? [y/N]"`,
      "if ($answer -notmatch '^[yY]') { exit 1 }",
      `$env:GIT_AUTHOR_EMAIL = '${email}'; $env:GIT_COMMITTER_EMAIL = '${email}'`,
      'function c($d, $m) { $env:GIT_AUTHOR_DATE = $d; $env:GIT_COMMITTER_DATE = $d; git commit --allow-empty -q -m $m; if ($LASTEXITCODE -ne 0) { throw "git commit failed" } }',
      ...commits.map(([date, message]) => `c '${date}' '${message}'`),
      "Remove-Item Env:GIT_AUTHOR_DATE, Env:GIT_COMMITTER_DATE, Env:GIT_AUTHOR_EMAIL, Env:GIT_COMMITTER_EMAIL",
      "Write-Host 'Done. Now run: git push'",
      '',
    ].join('\r\n');
  }

  async function exportScript(kind) {
    const email = $('script-email').value.trim();
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      setStatus(t('script.badEmail'), 'error');
      $('script-email').focus();
      return;
    }
    if (!planDates().length) {
      setStatus(t('paint.empty'), 'error');
      return;
    }
    try {
      const name = kind === 'bash' ? 'commit-canvas.sh' : 'commit-canvas.ps1';
      if (await saveFile(name, scriptFor(kind, email))) setStatus(t('script.saved'), 'ok');
    } catch (error) {
      setStatus(errorText(error), 'error');
    }
  }
  $('script-bash').addEventListener('click', () => exportScript('bash'));
  $('script-ps').addEventListener('click', () => exportScript('powershell'));

  // ---------- sign in ----------
  function savedToken() {
    try {
      const remembered = localStorage.getItem('cc.token');
      return remembered ? { token: remembered, remember: true } : { token: sessionStorage.getItem('cc.token'), remember: false };
    } catch {
      return { token: null, remember: false };
    }
  }

  function forgetToken() {
    try {
      localStorage.removeItem('cc.token');
      sessionStorage.removeItem('cc.token');
    } catch { /* storage unavailable */ }
  }

  async function connect(token, rememberToken) {
    state.api = window.CC_GitHub.create(token, {
      onWait: (seconds) => setStatus(t('progress.wait', { s: seconds })),
    });
    try {
      state.user = await state.api.user();
    } catch (error) {
      state.api = null;
      if (error.status === 401) forgetToken();
      setConnectError(errorText(error));
      return;
    }
    try {
      if (rememberToken) localStorage.setItem('cc.token', token);
      else sessionStorage.setItem('cc.token', token);
    } catch { /* storage unavailable */ }
    $('token').value = '';
    setConnectError('');
    if (!$('script-email').value) $('script-email').value = state.user.email;
    renderAccount();
    await Promise.all([loadRepos(), loadCalendar()]);
  }

  function setConnectError(text) {
    let el = $('connect-error');
    if (!el) {
      el = Object.assign(document.createElement('p'), { id: 'connect-error', className: 'status error' });
      $('connect-body').append(el);
    }
    el.textContent = text;
  }

  function renderAccount() {
    const user = state.user;
    $('account').hidden = !user;
    $('connect-body').hidden = Boolean(user);
    $('connect-done').hidden = !user;
    $('repo').disabled = !user;
    $('repo-new').disabled = !user;
    $('refresh').hidden = !user;
    if (!user) {
      $('total').textContent = '';
      return;
    }
    $('avatar').src = user.avatar;
    $('login').textContent = user.login;
    $('login').href = user.url;
    $('connect-done').textContent = `✓ ${user.name} (@${user.login})`;
    $('total').textContent = state.total === null ? '' : t('account.total', { n: state.total });
    renderSteps();
  }

  function signOut() {
    forgetToken();
    stopDevice();
    Object.assign(state, { api: null, user: null, repos: [], total: null });
    $('repo').replaceChildren(new Option(t('repo.none'), ''));
    $('range').replaceChildren(new Option(t('range.past'), ''));
    $('new-repo').hidden = true;
    state.weeks = offlineWeeks();
    renderAccount();
    renderRepoHint();
    renderLast();
    buildGraph();
    setStatus();
  }

  $('connect-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const token = $('token').value.trim();
    if (token) connect(token, $('remember').checked);
  });
  $('signout').addEventListener('click', signOut);

  // Desktop app: reuse an existing GitHub CLI login.
  $('gh-login').addEventListener('click', async () => {
    try {
      const token = await desktop.core.invoke('gh_token');
      await connect(token, true);
    } catch {
      setConnectError(t('gh.missing'));
    }
  });

  // Desktop app: OAuth device flow ("Sign in with GitHub").
  function stopDevice() {
    if (state.device) clearTimeout(state.device.timer);
    state.device = null;
    $('device').hidden = true;
    $('quick-login').hidden = !desktop;
  }

  $('device-login').addEventListener('click', async () => {
    setConnectError('');
    let start;
    try {
      start = JSON.parse(await desktop.core.invoke('device_start', { clientId: OAUTH_CLIENT_ID }));
      if (!start.device_code) throw new Error(start.error_description || start.error || 'device flow failed');
    } catch (error) {
      setConnectError(errorText(error));
      return;
    }
    state.device = { ...start, interval: start.interval || 5 };
    $('device-code').textContent = start.user_code;
    $('device').hidden = false;
    $('quick-login').hidden = true;
    navigator.clipboard?.writeText(start.user_code).catch(() => {});
    openExternal(start.verification_uri);
    const poll = async () => {
      if (!state.device) return;
      let result;
      try {
        result = JSON.parse(await desktop.core.invoke('device_poll', { clientId: OAUTH_CLIENT_ID, deviceCode: start.device_code }));
      } catch {
        result = { error: 'authorization_pending' };
      }
      if (!state.device) return;
      if (result.access_token) {
        stopDevice();
        await connect(result.access_token, true);
      } else if (result.error === 'authorization_pending' || result.error === 'slow_down') {
        if (result.error === 'slow_down') state.device.interval += 5;
        state.device.timer = setTimeout(poll, state.device.interval * 1000);
      } else {
        stopDevice();
        setConnectError(t(result.error === 'access_denied' ? 'device.denied' : 'device.expired'));
      }
    };
    state.device.timer = setTimeout(poll, state.device.interval * 1000);
  });
  $('device-open').addEventListener('click', () => state.device && openExternal(state.device.verification_uri));
  $('device-cancel').addEventListener('click', stopDevice);

  // ---------- repositories ----------
  async function loadRepos(created) {
    try {
      state.repos = await state.api.repos();
    } catch (error) {
      setStatus(errorText(error), 'error');
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
    store.set('cc.repo', $('repo').value || null);
    renderRepoHint();
    renderLast();
    renderSteps();
  }

  function renderRepoHint() {
    const repo = state.repos.find((r) => r.fullName === $('repo').value);
    let hint = '';
    if (state.user && !repo) hint = t('repo.suggest');
    else if (repo?.private) hint = t('repo.privateHint');
    else if (repo && !/canvas|art|draw|paint|graffiti/i.test(repo.fullName)) hint = t('repo.realHint');
    $('repo-hint').textContent = hint;
    $('repo-hint').hidden = !hint;
    $('repo-new').classList.toggle('primary', Boolean(state.user && !repo));
  }

  function suggestName() {
    const taken = new Set(state.repos.map((r) => r.fullName.split('/')[1].toLowerCase()));
    let name = 'commit-canvas-art';
    for (let i = 2; taken.has(name); i += 1) name = `commit-canvas-art-${i}`;
    return name;
  }

  $('repo').addEventListener('change', onRepoChange);
  $('repo-new').addEventListener('click', () => {
    $('new-repo').hidden = false;
    $('new-repo-name').value = suggestName();
    $('new-repo-name').select();
  });
  $('new-repo-cancel').addEventListener('click', () => { $('new-repo').hidden = true; });
  $('new-repo').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const repo = await state.api.createRepo($('new-repo-name').value.trim(), $('new-repo-private').checked);
      $('new-repo').hidden = true;
      await loadRepos(repo);
    } catch (error) {
      setStatus(errorText(error), 'error');
    }
  });

  // ---------- contributions ----------
  async function loadCalendar() {
    const year = $('range').value;
    try {
      const { weeks, years, total } = await state.api.calendar(year ? Number(year) : null);
      state.weeks = weeks;
      state.total = total;
      const options = ['', ...years.map(String)];
      if ($('range').options.length !== options.length) {
        $('range').replaceChildren(...options.map((value) => new Option(value || t('range.past'), value)));
        $('range').value = year;
      }
    } catch (error) {
      setStatus(errorText(error), 'error');
      return;
    }
    if (store.get('cc.strength') === null) {
      state.strength = autoStrength();
      $('strength').value = state.strength;
    }
    state.cursor = { col: state.weeks.length - 1, row: 0 };
    renderAccount();
    buildGraph();
  }
  $('range').addEventListener('change', loadCalendar);
  $('refresh').addEventListener('click', loadCalendar);

  // ---------- send ----------
  function setBusy(busy) {
    state.busy = busy;
    for (const el of document.querySelectorAll('main button, main input, main select')) {
      if (!el.closest('#step-connect')) el.disabled = busy;
    }
    if (!busy) renderAccount();
    renderSummary();
  }

  function progress(done, total) {
    $('progress').hidden = total === 0;
    $('progress').firstElementChild.style.width = total ? `${(100 * done) / total}%` : '0';
  }

  $('paint').addEventListener('click', async () => {
    const repo = $('repo').value;
    if (!state.api || !repo) {
      setStatus(t('paint.needConnect'), 'error');
      return;
    }
    const items = planned().filter((p) => !p.blocked);
    const dates = planDates();
    if (!dates.length) {
      setStatus(t('paint.empty'), 'error');
      return;
    }
    if (dates.length > MAX_COMMITS) {
      setStatus(t('error.tooMany', { n: dates.length, max: MAX_COMMITS }), 'error');
      return;
    }
    const branch = state.repos.find((r) => r.fullName === repo)?.branch ?? 'main';
    const ok = await ask(t('confirm.title'), t('confirm.body'), t('confirm.ok'), {
      details: [
        [t('confirm.account'), state.user.login],
        [t('confirm.repo'), repo],
        [t('confirm.branch'), branch],
        [t('confirm.commits'), String(dates.length)],
        [t('confirm.dates'), `${items[0].date} – ${items.at(-1).date}`],
      ],
      check: dates.length >= MANY_COMMITS ? t('confirm.many') : '',
      note: t('confirm.note'),
    });
    if (!ok) return;

    setBusy(true);
    setStatus(t('progress.prepare'));
    progress(0, dates.length);
    try {
      const result = await state.api.paint(repo, dates, state.user, (done, total, phase) => {
        progress(done, total);
        setStatus(phase === 'push' ? t('progress.push') : t('progress.commits', { done, total }));
      });
      remember();
      const sent = Object.fromEntries(items.map((p) => [p.date, p.level]));
      for (const p of items) delete state.drawing[p.date];
      store.set('cc.drawing', state.drawing);
      store.set('cc.last', { ...result, drawing: sent });
      setStatusLink(t('done.body', { n: result.count, repo }), state.user.url, t('done.view'));
    } catch (error) {
      setStatus(errorText(error), 'error');
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
      remember();
      Object.assign(state.drawing, last.drawing ?? {});
      store.set('cc.drawing', state.drawing);
      setStatus(t('undoPaint.done'), 'ok');
    } catch (error) {
      setStatus(error.message === 'MOVED' ? t('undoPaint.moved') : errorText(error), 'error');
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
  function openExternal(url) {
    if (desktop) desktop.opener.openUrl(url).catch(() => window.open(url, '_blank'));
    else window.open(url, '_blank', 'noopener');
  }

  if (desktop) {
    // Open external links in the system browser instead of the app window.
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="http"]');
      if (!link) return;
      event.preventDefault();
      openExternal(link.href);
    });
    $('quick-login').hidden = false;
    $('device-login').hidden = !OAUTH_CLIENT_ID;
    $('gh-login').hidden = false;
    $('or-token').hidden = false;
  }

  // ---------- start ----------
  state.weeks = offlineWeeks();
  state.cursor = { col: state.weeks.length - 1, row: 0 };
  $('repo').replaceChildren(new Option(t('repo.none'), ''));
  $('range').replaceChildren(new Option(t('range.past'), ''));
  $('strength').value = state.strength;
  $('avoid').checked = state.avoid;
  if (store.get('cc.zoom')) $('zoom').click();
  selectLevel(4);
  applyLanguage();
  renderMode();
  const saved = savedToken();
  // The desktop app keeps its own storage, so remember the token by default there.
  $('remember').checked = saved.token ? saved.remember : Boolean(desktop);
  if (saved.token) connect(saved.token, saved.remember);
})();
