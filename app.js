/**
 * app.js — TimeScope
 * アプリケーションのエントリーポイント。
 * 各モジュールの初期化・連携・全体制御を担当する。
 *
 * 依存ロード順:
 *   storage.js → analytics.js → tracker.js → ui.js → app.js
 */

const App = (() => {

  // ---------- 初期化 ----------

  /**
   * アプリを初期化する。
   * DOM 読み込み完了後に呼ばれる。
   */
  function init() {
    // 0. テーマ初期化（チラつき防止のため最初に実行）
    _initTheme();

    // 1. スプラッシュを一定時間後に非表示
    _dismissSplash();

    // 2. カテゴリグリッドを描画
    Tracker.renderCategoryGrid();

    // 3. フォームにデフォルト時刻をセット
    Tracker.setDefaultTimes();

    // 4. フォームイベントをバインド
    Tracker.bindEvents();

    // 5. タブナビをバインド
    UI.bindTabNav();

    // 6. 初期描画（記録タブ）
    UI.renderHeader();
    UI.renderEntryList();

    // 7. ストリーク確認（アプリ起動時）
    _checkStreak();

    // 8. 時計を毎分更新
    _startClock();

    console.info('[TimeScope] initialized ✓');
  }

  // ---------- テーマ管理 ----------

  /**
   * 保存済みテーマ or OSのカラースキームを読み取り、初期テーマを適用する。
   * テーマ切替ボタンのイベントもここでバインドする。
   */
  function _initTheme() {
    const saved       = localStorage.getItem('ts_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme       = saved ?? (prefersDark ? 'dark' : 'light');
    _applyTheme(theme);

    // 切替ボタン
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme ?? 'dark';
      _applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // OSのテーマ変更を検知（手動設定がない場合のみ追従）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('ts_theme')) {
        _applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * テーマを適用する。html[data-theme] を切り替え、ボタンアイコンも更新する。
   * @param {'dark'|'light'} theme
   */
  function _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ts_theme', theme);

    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ---------- スプラッシュ ----------

  /**
   * スプラッシュ画面を非表示にする。
   * 最低 900ms 表示してブランドを印象付ける。
   */
  function _dismissSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 650);
    }, 900);
  }

  // ---------- ストリーク確認 ----------

  /**
   * 起動時にストリークを確認し、途切れていればリセットする。
   */
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

  /**
   * 毎分ヘッダーの日付表示を更新する。
   * 日付が変わったタイミングで全体リフレッシュも行う。
   */
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
  window.addEventListener('error', e => {
    console.error('[TimeScope] unhandled error:', e.error);
  });

  // ---------- 公開 API ----------
  return { init };

})();

// ---------- DOMContentLoaded で起動 ----------
document.addEventListener('DOMContentLoaded', () => App.init());
