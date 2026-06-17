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
    // 1. カテゴリグリッドを描画
    Tracker.renderCategoryGrid();

    // 2. フォームにデフォルト時刻をセット
    Tracker.setDefaultTimes();

    // 3. フォームイベントをバインド
    Tracker.bindEvents();

    // 4. タブナビをバインド
    UI.bindTabNav();

    // 5. 初期描画（記録タブ）
    UI.renderHeader();
    UI.renderEntryList();

    // 6. ストリーク確認（アプリ起動時）
    _checkStreak();

    // 7. 時計を毎分更新
    _startClock();

    console.info('[TimeScope] initialized ✓');
  }

  // ---------- ストリーク確認 ----------

  /**
   * 起動時にストリークを確認し、表示を更新する。
   * 昨日以前から途切れている場合はリセット。
   */
  function _checkStreak() {
    const todayKey = Analytics.toDateKey(new Date());
    const lastDate = Storage.getLastDate();

    if (!lastDate) return; // 初回起動

    // 昨日
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = Analytics.toDateKey(yesterday);

    // 2日以上前なら途切れたとみなしてリセット
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
        // 日付が変わった
        lastDay = currentDay;
        UI.refresh();
      } else {
        UI.renderHeader();
      }
    }, 60_000); // 60秒ごと
  }

  // ---------- グローバルエラーハンドラ ----------

  window.addEventListener('error', e => {
    console.error('[TimeScope] unhandled error:', e.error);
  });

  // ---------- 公開 API ----------
  return { init };

})();

// ---------- DOMContentLoaded で起動 ----------
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
