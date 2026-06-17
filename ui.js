/**
 * ui.js — TimeScope
 * DOM の描画・更新を一元管理するモジュール。
 * ロジックは analytics.js / tracker.js に委譲し、
 * このファイルは「表示する」責務のみを持つ。
 */

const UI = (() => {

  // ---------- Chart.js インスタンス管理 ----------
  // 再描画時に既存グラフを destroy してリークを防ぐ
  const _charts = {};

  // ---------- Toast 通知 ----------

  let _toastTimer = null;

  /**
   * トースト通知を表示する。
   * @param {string} message
   * @param {'info'|'error'} type
   */
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    clearTimeout(_toastTimer);
    toast.textContent = message;
    toast.className   = `toast show ${type === 'error' ? 'toast--error' : ''}`;

    _toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // ---------- ヘッダー ----------

  /**
   * ヘッダーの日付とストリークを更新する。
   */
  function renderHeader() {
    const dateEl = document.getElementById('today-date');
    if (dateEl) {
      const now  = new Date();
      const opts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
      dateEl.textContent = now.toLocaleDateString('ja-JP', opts);
    }

    const streak     = Storage.getStreak();
    const countEl    = document.getElementById('streak-count');
    if (countEl) countEl.textContent = streak.count;
  }

  // ---------- エントリーリスト（記録タブ） ----------

  /**
   * 今日のエントリーリストを描画する。
   */
  function renderEntryList() {
    const todayKey    = Analytics.toDateKey(new Date());
    const entries     = Storage.getEntriesByDate(todayKey);
    const listEl      = document.getElementById('entry-list');
    const emptyEl     = document.getElementById('empty-state');
    const countBadge  = document.getElementById('entry-count-badge');

    if (!listEl) return;

    listEl.innerHTML = '';

    if (countBadge) countBadge.textContent = `${entries.length} 件`;

    if (entries.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    // 開始時刻順にソート（表示のみ、保存順は変えない）
    const sorted = [...entries].sort((a, b) =>
      Analytics.timeToMinutes(a.start) - Analytics.timeToMinutes(b.start)
    );

    sorted.forEach(entry => {
      const cat  = Analytics.getCategoryById(entry.category);
      const item = document.createElement('div');
      item.className = 'entry-item';
      item.dataset.id = entry.id;

      item.innerHTML = `
        <span class="entry-cat-dot"
              style="background:${cat.color}; color:${cat.color}"></span>
        <div class="entry-info">
          <div class="entry-cat-name">${cat.icon} ${cat.label}</div>
          ${entry.memo
            ? `<div class="entry-memo">${_escapeHtml(entry.memo)}</div>`
            : ''}
        </div>
        <span class="entry-time-range">${entry.start} – ${entry.end}</span>
        <span class="entry-duration">${Analytics.formatDuration(entry.duration)}</span>
        <button class="entry-delete" data-id="${entry.id}"
                aria-label="削除" title="削除">✕</button>
      `;

      listEl.appendChild(item);
    });

    // 削除ボタン イベント委譲
    listEl.querySelectorAll('.entry-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        _deleteEntry(todayKey, id);
      });
    });
  }

  /**
   * エントリー削除して再描画。
   */
  function _deleteEntry(dateKey, entryId) {
    Storage.deleteEntry(dateKey, entryId);
    refresh();
    showToast('記録を削除しました');
  }

  // ---------- ダッシュボードタブ ----------

  /**
   * サマリーカードを描画する。
   */
  function renderSummaryGrid() {
    const todayKey = Analytics.toDateKey(new Date());
    const entries  = Storage.getEntriesByDate(todayKey);
    const sumMap   = Analytics.sumByCategory(entries);
    const summary  = Analytics.buildSummary(sumMap);
    const grid     = document.getElementById('summary-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (summary.length === 0) {
      grid.innerHTML = '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">記録を追加するとここに表示されます</p>';
      return;
    }

    summary.forEach(c => {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.style.setProperty('--cat-color', c.color);

      card.innerHTML = `
        <span class="summary-card-icon">${c.icon}</span>
        <span class="summary-card-label">${c.label}</span>
        <div>
          <span class="summary-card-value">${Analytics.formatDuration(c.minutes)}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  /**
   * 円グラフ（時間配分）を描画する。
   */
  function renderPieChart() {
    const todayKey = Analytics.toDateKey(new Date());
    const entries  = Storage.getEntriesByDate(todayKey);
    const sumMap   = Analytics.sumByCategory(entries);
    const summary  = Analytics.buildSummary(sumMap);
    const canvas   = document.getElementById('chart-pie');
    if (!canvas) return;

    if (_charts.pie) { _charts.pie.destroy(); delete _charts.pie; }

    if (summary.length === 0) {
      _drawEmptyState(canvas, '記録がありません');
      return;
    }

    _charts.pie = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels:   summary.map(c => `${c.icon} ${c.label}`),
        datasets: [{
          data:            summary.map(c => c.minutes),
          backgroundColor: summary.map(c => c.color + 'cc'),
          borderColor:     summary.map(c => c.color),
          borderWidth:     1.5,
          hoverOffset:     8,
        }],
      },
      options: {
        responsive:         true,
        maintainAspectRatio: false,
        cutout:             '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color:      '#a0aec0',
              font:       { size: 11 },
              boxWidth:   10,
              padding:    10,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${Analytics.formatDuration(ctx.raw)}`,
            },
            backgroundColor: 'rgba(13,16,23,0.95)',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
          },
        },
      },
    });
  }

  /**
   * 棒グラフ（カテゴリ別合計）を描画する。
   */
  function renderBarChart() {
    const todayKey = Analytics.toDateKey(new Date());
    const entries  = Storage.getEntriesByDate(todayKey);
    const sumMap   = Analytics.sumByCategory(entries);
    const summary  = Analytics.buildSummary(sumMap);
    const canvas   = document.getElementById('chart-bar');
    if (!canvas) return;

    if (_charts.bar) { _charts.bar.destroy(); delete _charts.bar; }

    if (summary.length === 0) {
      _drawEmptyState(canvas, '記録がありません');
      return;
    }

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
          borderRadius:    6,
          borderSkipped:   false,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${Analytics.formatDuration(ctx.raw * 60)}`,
            },
            backgroundColor: 'rgba(13,16,23,0.95)',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#6b7280', font: { size: 10 } },
          },
          y: {
            grid:      { color: 'rgba(255,255,255,0.04)' },
            ticks:     { color: '#6b7280', font: { size: 10 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ---------- 週間タブ ----------

  /**
   * 週間棒グラフを描画する。
   */
  function renderWeeklyChart() {
    const canvas = document.getElementById('chart-weekly');
    if (!canvas) return;

    if (_charts.weekly) { _charts.weekly.destroy(); delete _charts.weekly; }

    const dateKeys   = Analytics.getLastNDates(7);
    const allEntries = Storage.getAllEntries();
    const chartData  = Analytics.buildWeeklyChartData(dateKeys, allEntries);

    if (chartData.datasets.length === 0) {
      _drawEmptyState(canvas, '過去7日間に記録がありません');
      return;
    }

    _charts.weekly = new Chart(canvas, {
      type: 'bar',
      data: chartData,
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color:    '#a0aec0',
              font:     { size: 10 },
              boxWidth: 8,
              padding:  8,
              usePointStyle: true,
            },
          },
          tooltip: {
            mode:      'index',
            intersect: false,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${Analytics.formatDuration(ctx.raw * 60)}`,
            },
            backgroundColor: 'rgba(13,16,23,0.95)',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
          },
        },
        scales: {
          x: {
            stacked: true,
            grid:    { color: 'rgba(255,255,255,0.04)' },
            ticks:   { color: '#6b7280', font: { size: 11 } },
          },
          y: {
            stacked:     true,
            grid:        { color: 'rgba(255,255,255,0.04)' },
            ticks:       { color: '#6b7280', font: { size: 11 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  /**
   * 週間統計カードを描画する。
   */
  function renderWeeklyStats() {
    const statsGrid = document.getElementById('weekly-stats-grid');
    if (!statsGrid) return;

    const dateKeys   = Analytics.getLastNDates(7);
    const allEntries = Storage.getAllEntries();
    const weeklySum  = Analytics.weeklyTotalByCategory(dateKeys, allEntries);

    statsGrid.innerHTML = '';

    const entries = Object.entries(weeklySum)
      .map(([id, minutes]) => ({ ...Analytics.getCategoryById(id), minutes }))
      .filter(c => c.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);

    if (entries.length === 0) {
      statsGrid.innerHTML = '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">過去7日間に記録がありません</p>';
      return;
    }

    entries.forEach(c => {
      const card = document.createElement('div');
      card.className = 'weekly-stat-card';

      card.innerHTML = `
        <div class="weekly-stat-label">
          <span class="weekly-stat-dot" style="background:${c.color}"></span>
          ${c.icon} ${c.label}
        </div>
        <div class="weekly-stat-value">${Analytics.formatDuration(c.minutes)}</div>
        <div class="weekly-stat-sub">週合計 / 平均 ${Analytics.formatDuration(Math.round(c.minutes / 7))}/日</div>
      `;
      statsGrid.appendChild(card);
    });
  }

  // ---------- 目標タブ ----------

  /**
   * 目標設定リストを描画する。
   */
  function renderGoalsList() {
    const goalsList = document.getElementById('goals-list');
    if (!goalsList) return;

    const goals = Storage.getGoals();
    goalsList.innerHTML = '';

    Analytics.CATEGORIES.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'goal-item';

      const currentVal = goals[cat.id] ?? '';

      item.innerHTML = `
        <span class="goal-cat-dot" style="background:${cat.color}"></span>
        <span class="goal-cat-icon">${cat.icon}</span>
        <span class="goal-cat-name">${cat.label}</span>
        <div class="goal-input-wrap">
          <input class="goal-input"
                 type="number"
                 min="0" max="24" step="0.5"
                 placeholder="—"
                 value="${currentVal}"
                 data-cat="${cat.id}"
                 aria-label="${cat.label} の理想時間（時間）" />
          <span class="goal-unit">h / 日</span>
        </div>
      `;
      goalsList.appendChild(item);
    });

    // 入力変更時に保存
    goalsList.querySelectorAll('.goal-input').forEach(input => {
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

  /**
   * 差分表示リストを描画する。
   */
  function renderDiffList() {
    const diffList = document.getElementById('diff-list');
    if (!diffList) return;

    const todayKey = Analytics.toDateKey(new Date());
    const entries  = Storage.getEntriesByDate(todayKey);
    const sumMap   = Analytics.sumByCategory(entries);
    const goals    = Storage.getGoals();
    const diffData = Analytics.buildDiffData(sumMap, goals);

    diffList.innerHTML = '';

    if (diffData.length === 0) {
      diffList.innerHTML = '<p style="color:var(--clr-text-3);font-size:.85rem;padding:.5rem 0">目標を設定するとここに差分が表示されます</p>';
      return;
    }

    diffData.forEach(c => {
      // プログレスバーの幅（%）: ideal を 100% として actual を表示
      const maxMin  = Math.max(c.ideal, c.actual, 1);
      const barIdeal  = Math.min((c.ideal / maxMin) * 100, 100);
      const barActual = Math.min((c.actual / maxMin) * 100, 100);

      // 差分テキスト
      let deltaClass = 'on-track';
      let deltaText  = '目標どおり';
      if (c.delta > 0) {
        deltaClass = 'over';
        deltaText  = `+${Analytics.formatDuration(c.delta)} 超過`;
      } else if (c.delta < 0) {
        deltaClass = 'under';
        deltaText  = `${Analytics.formatDuration(Math.abs(c.delta))} 不足`;
      }

      const item = document.createElement('div');
      item.className = 'diff-item';

      item.innerHTML = `
        <div class="diff-cat-info">
          <span class="diff-cat-dot" style="background:${c.color}"></span>
          <span class="diff-cat-name">${c.icon} ${c.label}</span>
        </div>
        <div class="diff-bar-wrap">
          <div class="diff-bar-ideal"  style="width:${barIdeal}%"></div>
          <div class="diff-bar-actual" style="width:${barActual}%; background:${c.color}"></div>
        </div>
        <div class="diff-values">
          <span class="diff-actual">${Analytics.formatDuration(c.actual)}</span>
          <span class="diff-ideal">目標 ${Analytics.formatHoursDecimal(c.ideal)}</span>
          <div class="diff-delta ${deltaClass}">${deltaText}</div>
        </div>
      `;
      diffList.appendChild(item);
    });
  }

  // ---------- タブ切り替え ----------

  /**
   * タブナビゲーションのイベントをバインドする。
   */
  function bindTabNav() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;

        // ボタン状態
        tabBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tabId);
          b.setAttribute('aria-selected', b.dataset.tab === tabId);
        });

        // パネル表示
        tabPanels.forEach(panel => {
          const isTarget = panel.id === `tab-${tabId}`;
          panel.classList.toggle('active', isTarget);
        });

        // タブに応じて再描画
        _onTabChange(tabId);
      });
    });
  }

  /**
   * タブ変更時に必要な描画を実行する。
   * @param {string} tabId
   */
  function _onTabChange(tabId) {
    if (tabId === 'dashboard') {
      renderSummaryGrid();
      renderPieChart();
      renderBarChart();
    } else if (tabId === 'weekly') {
      renderWeeklyChart();
      renderWeeklyStats();
    } else if (tabId === 'goals') {
      renderGoalsList();
      renderDiffList();
    } else if (tabId === 'tracker') {
      renderEntryList();
    }
  }

  // ---------- 一括リフレッシュ ----------

  /**
   * 現在表示中のタブを再描画する。
   * エントリー追加・削除後に呼ぶ。
   */
  function refresh() {
    const activePanel = document.querySelector('.tab-panel.active');
    const tabId = activePanel?.id?.replace('tab-', '') ?? 'tracker';
    renderHeader();
    _onTabChange(tabId);
  }

  // ---------- ユーティリティ ----------

  /**
   * HTML エスケープ（XSS 対策）。
   * @param {string} str
   * @returns {string}
   */
  function _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * キャンバスに「データなし」メッセージを描く。
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   */
  function _drawEmptyState(canvas, text) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = 'rgba(255,255,255,0.2)';
    ctx.font         = '13px -apple-system, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

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
