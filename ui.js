/**
 * ui.js — TimeScope
 * DOM の描画・更新を一元管理するモジュール。
 * アニメーション強化版：stagger遅延・Chart.jsイージング・プログレスバーアニメーション
 */

const UI = (() => {

  // ---------- Chart.js インスタンス管理 ----------
  const _charts = {};

  // ---------- Chart.js グローバルデフォルト ----------
  // 初回呼び出し時に一度だけ設定する
  function _setupChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.animation = {
      duration: 800,
      easing:   'easeOutQuart',
    };
    Chart.defaults.transitions = {
      active: { animation: { duration: 300 } },
    };
    Chart.defaults.font.family =
      "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
  }

  // ---------- テーマ対応チャートカラー ----------
  function _chartColors() {
    const isDark = document.documentElement.dataset.theme !== 'light';
    return {
      gridColor:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
      tickColor:    isDark ? '#6b7280' : '#9ca3af',
      tooltipBg:    isDark ? 'rgba(13,16,23,0.95)' : 'rgba(240,242,248,0.97)',
      tooltipBorder:isDark ? 'rgba(255,255,255,0.1)' : 'rgba(100,120,200,0.2)',
      legendColor:  isDark ? '#a0aec0' : '#6b7280',
    };
  }

  // ---------- Toast 通知 ----------
  let _toastTimer = null;

  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(_toastTimer);
    toast.textContent = message;
    toast.className   = `toast show${type === 'error' ? ' toast--error' : ''}`;
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ---------- ヘッダー ----------
  function renderHeader() {
    const dateEl = document.getElementById('today-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      });
    }
    const countEl = document.getElementById('streak-count');
    if (countEl) {
      const newVal = String(Storage.getStreak().count);
      // 値が変わったときだけパルスアニメーション
      if (countEl.textContent !== newVal) {
        countEl.style.animation = 'none';
        countEl.offsetHeight; // reflow
        countEl.style.animation = 'streak-pulse 0.4s var(--ease-spring) both';
        countEl.textContent = newVal;
      }
    }
  }

  // ---------- エントリーリスト ----------
  function renderEntryList() {
    const todayKey = Analytics.toDateKey(new Date());
    const entries  = Storage.getEntriesByDate(todayKey);
    const listEl   = document.getElementById('entry-list');
    const emptyEl  = document.getElementById('empty-state');
    const badge    = document.getElementById('entry-count-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (badge) badge.textContent = `${entries.length} 件`;

    if (entries.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const sorted = [...entries].sort(
      (a, b) => Analytics.timeToMinutes(a.start) - Analytics.timeToMinutes(b.start)
    );

    sorted.forEach((entry, i) => {
      const cat  = Analytics.getCategoryById(entry.category);
      const item = document.createElement('div');
      item.className    = 'entry-item';
      item.dataset.id   = entry.id;
      // stagger遅延用カスタムプロパティ
      item.style.setProperty('--i', i);

      item.innerHTML = `
        <span class="entry-cat-dot"
              style="background:${cat.color}; color:${cat.color}"></span>
        <div class="entry-info">
          <div class="entry-cat-name">${cat.icon} ${cat.label}</div>
          ${entry.memo
            ? `<div class="entry-memo">${_esc(entry.memo)}</div>`
            : ''}
        </div>
        <span class="entry-time-range">${entry.start} – ${entry.end}</span>
        <span class="entry-duration">${Analytics.formatDuration(entry.duration)}</span>
        <button class="entry-delete" data-id="${entry.id}"
                aria-label="削除" title="削除">✕</button>
      `;
      listEl.appendChild(item);
    });

    // 削除ボタン：削除アニメーション後に実際に消す
    listEl.querySelectorAll('.entry-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        const id     = e.currentTarget.dataset.id;
        const itemEl = listEl.querySelector(`[data-id="${id}"]`);
        if (itemEl) {
          itemEl.classList.add('removing');
          itemEl.addEventListener('animationend', () => {
            Storage.deleteEntry(todayKey, id);
            refresh();
            showToast('記録を削除しました');
          }, { once: true });
        }
      });
    });
  }

  // ---------- サマリーグリッド ----------
  function renderSummaryGrid() {
    const grid    = document.getElementById('summary-grid');
    if (!grid) return;
    const summary = Analytics.buildSummary(
      Analytics.sumByCategory(Storage.getEntriesByDate(Analytics.toDateKey(new Date())))
    );

    grid.innerHTML = '';
    if (summary.length === 0) {
      grid.innerHTML =
        '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">記録を追加するとここに表示されます</p>';
      return;
    }

    summary.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.style.setProperty('--i', i);
      card.style.setProperty('--cat-color', c.color);
      card.innerHTML = `
        <span class="summary-card-icon">${c.icon}</span>
        <span class="summary-card-label">${c.label}</span>
        <div><span class="summary-card-value">${Analytics.formatDuration(c.minutes)}</span></div>
      `;
      grid.appendChild(card);
    });
  }

  // ---------- 円グラフ ----------
  function renderPieChart() {
    const canvas  = document.getElementById('chart-pie');
    if (!canvas) return;
    if (_charts.pie) { _charts.pie.destroy(); delete _charts.pie; }

    const summary = Analytics.buildSummary(
      Analytics.sumByCategory(Storage.getEntriesByDate(Analytics.toDateKey(new Date())))
    );
    if (summary.length === 0) { _emptyCanvas(canvas, '記録がありません'); return; }

    const clr = _chartColors();

    _charts.pie = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels:   summary.map(c => `${c.icon} ${c.label}`),
        datasets: [{
          data:            summary.map(c => c.minutes),
          backgroundColor: summary.map(c => c.color + 'cc'),
          borderColor:     summary.map(c => c.color),
          borderWidth:     1.5,
          hoverOffset:     12,
          hoverBorderWidth: 2.5,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '62%',
        animation: {
          animateRotate: true,
          animateScale:  true,
          duration:      900,
          easing:        'easeOutQuart',
        },
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color:         clr.legendColor,
              font:          { size: 11 },
              boxWidth:      10,
              padding:       10,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${Analytics.formatDuration(ctx.raw)}` },
            backgroundColor: clr.tooltipBg,
            borderColor:     clr.tooltipBorder,
            borderWidth:     1,
            padding:         10,
            cornerRadius:    10,
            titleFont:       { size: 12 },
            bodyFont:        { size: 12 },
          },
        },
      },
    });
  }

  // ---------- 棒グラフ ----------
  function renderBarChart() {
    const canvas  = document.getElementById('chart-bar');
    if (!canvas) return;
    if (_charts.bar) { _charts.bar.destroy(); delete _charts.bar; }

    const summary = Analytics.buildSummary(
      Analytics.sumByCategory(Storage.getEntriesByDate(Analytics.toDateKey(new Date())))
    );
    if (summary.length === 0) { _emptyCanvas(canvas, '記録がありません'); return; }

    const clr = _chartColors();

    _charts.bar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   summary.map(c => `${c.icon} ${c.label}`),
        datasets: [{
          label:           '時間 (h)',
          data:            summary.map(c => parseFloat((c.minutes / 60).toFixed(2))),
          backgroundColor: summary.map(c => c.color + 'bb'),
          borderColor:     summary.map(c => c.color),
          borderWidth:     1.5,
          borderRadius:    8,
          borderSkipped:   false,
          hoverBackgroundColor: summary.map(c => c.color + 'ee'),
          hoverBorderWidth: 2,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: {
          duration: 800,
          easing:   'easeOutQuart',
          delay:    ctx => ctx.dataIndex * 60,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ${Analytics.formatDuration(ctx.raw * 60)}` },
            backgroundColor: clr.tooltipBg,
            borderColor:     clr.tooltipBorder,
            borderWidth:     1,
            padding:         10,
            cornerRadius:    10,
          },
        },
        scales: {
          x: {
            grid:  { color: clr.gridColor, drawTicks: false },
            ticks: { color: clr.tickColor, font: { size: 10 }, padding: 6 },
            border: { display: false },
          },
          y: {
            grid:        { color: clr.gridColor },
            ticks:       { color: clr.tickColor, font: { size: 10 }, padding: 6 },
            border:      { display: false },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ---------- 週間棒グラフ ----------
  function renderWeeklyChart() {
    const canvas = document.getElementById('chart-weekly');
    if (!canvas) return;
    if (_charts.weekly) { _charts.weekly.destroy(); delete _charts.weekly; }

    const dateKeys  = Analytics.getLastNDates(7);
    const chartData = Analytics.buildWeeklyChartData(dateKeys, Storage.getAllEntries());
    if (chartData.datasets.length === 0) {
      _emptyCanvas(canvas, '過去7日間に記録がありません'); return;
    }

    const clr = _chartColors();

    _charts.weekly = new Chart(canvas, {
      type: 'bar',
      data: chartData,
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing:   'easeOutQuart',
          delay:    ctx => ctx.dataIndex * 40,
        },
        plugins: {
          legend: {
            labels: {
              color:         clr.legendColor,
              font:          { size: 10 },
              boxWidth:      8,
              padding:       8,
              usePointStyle: true,
            },
          },
          tooltip: {
            mode:      'index',
            intersect: false,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${Analytics.formatDuration(ctx.raw * 60)}`,
            },
            backgroundColor: clr.tooltipBg,
            borderColor:     clr.tooltipBorder,
            borderWidth:     1,
            padding:         10,
            cornerRadius:    10,
          },
        },
        scales: {
          x: {
            stacked: true,
            grid:    { color: clr.gridColor, drawTicks: false },
            ticks:   { color: clr.tickColor, font: { size: 11 }, padding: 6 },
            border:  { display: false },
          },
          y: {
            stacked:     true,
            grid:        { color: clr.gridColor },
            ticks:       { color: clr.tickColor, font: { size: 11 }, padding: 6 },
            border:      { display: false },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ---------- 週間統計カード ----------
  function renderWeeklyStats() {
    const grid = document.getElementById('weekly-stats-grid');
    if (!grid) return;

    const dateKeys  = Analytics.getLastNDates(7);
    const weeklySum = Analytics.weeklyTotalByCategory(dateKeys, Storage.getAllEntries());

    grid.innerHTML = '';
    const items = Object.entries(weeklySum)
      .map(([id, min]) => ({ ...Analytics.getCategoryById(id), minutes: min }))
      .filter(c => c.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);

    if (items.length === 0) {
      grid.innerHTML =
        '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">過去7日間に記録がありません</p>';
      return;
    }

    items.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'weekly-stat-card';
      card.style.setProperty('--i', i);
      card.innerHTML = `
        <div class="weekly-stat-label">
          <span class="weekly-stat-dot" style="background:${c.color}"></span>
          ${c.icon} ${c.label}
        </div>
        <div class="weekly-stat-value">${Analytics.formatDuration(c.minutes)}</div>
        <div class="weekly-stat-sub">週合計 / 平均 ${Analytics.formatDuration(Math.round(c.minutes / 7))}/日</div>
      `;
      grid.appendChild(card);
    });
  }

  // ---------- 目標リスト ----------
  function renderGoalsList() {
    const list = document.getElementById('goals-list');
    if (!list) return;

    const goals = Storage.getGoals();
    list.innerHTML = '';

    Analytics.CATEGORIES.forEach((cat, i) => {
      const item = document.createElement('div');
      item.className = 'goal-item';
      item.style.setProperty('--i', i);
      item.innerHTML = `
        <span class="goal-cat-dot" style="background:${cat.color}"></span>
        <span class="goal-cat-icon">${cat.icon}</span>
        <span class="goal-cat-name">${cat.label}</span>
        <div class="goal-input-wrap">
          <input class="goal-input" type="number"
                 min="0" max="24" step="0.5"
                 placeholder="—"
                 value="${goals[cat.id] ?? ''}"
                 data-cat="${cat.id}"
                 aria-label="${cat.label} の理想時間（時間）" />
          <span class="goal-unit">h / 日</span>
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll('.goal-input').forEach(input => {
      input.addEventListener('change', e => {
        const val = parseFloat(e.target.value);
        const cat = e.target.dataset.cat;
        if (!isNaN(val) && val >= 0) {
          Storage.setGoal(cat, val);
          renderDiffList();
          showToast(`${Analytics.getCategoryById(cat).label} の目標を ${val}h に設定しました`);
        }
      });
    });
  }

  // ---------- 差分表示リスト ----------
  function renderDiffList() {
    const list = document.getElementById('diff-list');
    if (!list) return;

    const todayKey = Analytics.toDateKey(new Date());
    const diffData = Analytics.buildDiffData(
      Analytics.sumByCategory(Storage.getEntriesByDate(todayKey)),
      Storage.getGoals()
    );

    list.innerHTML = '';
    if (diffData.length === 0) {
      list.innerHTML =
        '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">目標を設定するとここに差分が表示されます</p>';
      return;
    }

    diffData.forEach((c, i) => {
      const maxMin   = Math.max(c.ideal, c.actual, 1);
      const barIdeal  = Math.min((c.ideal  / maxMin) * 100, 100);
      const barActual = Math.min((c.actual / maxMin) * 100, 100);

      let deltaClass = 'on-track', deltaText = '目標どおり';
      if      (c.delta > 0) { deltaClass = 'over';  deltaText = `+${Analytics.formatDuration(c.delta)} 超過`; }
      else if (c.delta < 0) { deltaClass = 'under'; deltaText = `${Analytics.formatDuration(Math.abs(c.delta))} 不足`; }

      const item = document.createElement('div');
      item.className = 'diff-item';
      item.style.setProperty('--i', i);

      // プログレスバーは width:0 から始めてCSSトランジションで伸ばす
      item.innerHTML = `
        <div class="diff-cat-info">
          <span class="diff-cat-dot" style="background:${c.color}; color:${c.color}"></span>
          <span class="diff-cat-name">${c.icon} ${c.label}</span>
        </div>
        <div class="diff-bar-wrap">
          <div class="diff-bar-ideal"  style="width:0%"  data-width="${barIdeal}"></div>
          <div class="diff-bar-actual" style="width:0%; background:${c.color}"
               data-width="${barActual}"></div>
        </div>
        <div class="diff-values">
          <span class="diff-actual">${Analytics.formatDuration(c.actual)}</span>
          <span class="diff-ideal">目標 ${Analytics.formatHoursDecimal(c.ideal)}</span>
          <div class="diff-delta ${deltaClass}">${deltaText}</div>
        </div>
      `;
      list.appendChild(item);
    });

    // DOM描画後にwidth=0→実値へ変更してCSSトランジションを起動
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        list.querySelectorAll('[data-width]').forEach(el => {
          el.style.width = el.dataset.width + '%';
        });
      });
    });
  }

  // ---------- タブ切り替え ----------
  function bindTabNav() {
    const btns   = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        btns.forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tabId);
          b.setAttribute('aria-selected', b.dataset.tab === tabId);
        });
        panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));
        _onTabChange(tabId);
      });
    });
  }

  function _onTabChange(tabId) {
    if      (tabId === 'dashboard') { renderSummaryGrid(); renderPieChart(); renderBarChart(); }
    else if (tabId === 'weekly')    { renderWeeklyChart(); renderWeeklyStats(); }
    else if (tabId === 'goals')     { renderGoalsList();   renderDiffList(); }
    else if (tabId === 'tracker')   { renderEntryList(); }
  }

  // ---------- 一括リフレッシュ ----------
  function refresh() {
    const active = document.querySelector('.tab-panel.active');
    const tabId  = active?.id?.replace('tab-', '') ?? 'tracker';
    renderHeader();
    _onTabChange(tabId);
  }

  // ---------- ユーティリティ ----------
  function _esc(s) {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function _emptyCanvas(canvas, text) {
    const isDark = document.documentElement.dataset.theme !== 'light';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.font         = '13px -apple-system, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  // ---------- 初期化時にChart.jsデフォルトをセット ----------
  _setupChartDefaults();

  // ---------- 公開 API ----------
  return {
    showToast,
    renderHeader,
    renderEntryList,
    renderSummaryGrid,
    renderPieChart,
    renderBarChart,
    renderWeeklyChart,
    renderWeeklyStats,
    renderGoalsList,
    renderDiffList,
    bindTabNav,
    refresh,
  };
})();
