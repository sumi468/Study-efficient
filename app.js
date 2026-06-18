/**
 * app.js — TimeScope
 * アプリケーションのエントリーポイント。
 * Auth.init() のコールバックとして呼ばれる。
 *
 * 依存ロード順:
 *   firebase-app-compat → firebase-auth-compat
 *   → auth.js → storage.js → analytics.js → tracker.js → ui.js → app.js
 */

const App = (() => {

  /**
   * アプリを初期化する。Auth.init() のコールバックから呼ばれる。
   * @param {Object} user  Firebase User オブジェクト
   */
  function init(user) {
    // 1. テーマ初期化（チラつき防止のため最初に）
    _initTheme();

    // 2. スプラッシュを非表示
    _dismissSplash();

    // 3. カテゴリグリッドを描画
    Tracker.renderCategoryGrid();

    // 4. フォームにデフォルト時刻をセット
    Tracker.setDefaultTimes();

    // 5. フォームイベントをバインド
    Tracker.bindEvents();

    // 6. タブナビをバインド
    UI.bindTabNav();

    // 7. 初期描画
    UI.renderHeader();
    UI.renderEntryList();

    // 8. ストリーク確認
    _checkStreak();

    // 9. 時計を毎分更新
    _startClock();

    console.info('[TimeScope] initialized ✓', user?.email ?? 'anonymous');
  }

  // ---------- テーマ管理 ----------

  function _initTheme() {
    const saved       = localStorage.getItem('ts_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme       = saved ?? (prefersDark ? 'dark' : 'light');
    _applyTheme(theme);

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme ?? 'dark';
      _applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // OSのテーマ変更を検知（手動設定がない場合のみ）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('ts_theme')) {
        _applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  function _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ts_theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ---------- スプラッシュ ----------

  function _dismissSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 650);
    }, 900);
  }

  // ---------- ストリーク確認 ----------

  function _checkStreak() {
    const todayKey = Analytics.toDateKey(new Date());
    const lastDate = Storage.getLastDate();
    if (!lastDate) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = Analytics.toDateKey(yesterday);

    if (lastDate !== todayKey && lastDate !== yesterdayKey) {
      Storage.setStreak({ count: 0 });
      UI.renderHeader();
    }
  }

  // ---------- 時計 ----------

  function _startClock() {
    let lastDay = new Date().toDateString();
    setInterval(() => {
      const currentDay = new Date().toDateString();
      if (currentDay !== lastDay) {
        lastDay = currentDay;
        UI.refresh();
      } else {
        UI.renderHeader();
      }
    }, 60_000);
  }

  // ---------- グローバルエラーハンドラ ----------
  window.addEventListener('error', e => console.error('[TimeScope] error:', e.error));

  return { init };

})();

// ---------- 起動 ----------
document.addEventListener('DOMContentLoaded', () => {
  Auth.init((user) => App.init(user));
});
