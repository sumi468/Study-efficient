/**
 * tracker.js — TimeScope
 * 時間記録フォームの制御・バリデーション・エントリー追加を担当する。
 */

const Tracker = (() => {

  // ---------- 内部状態 ----------
  let selectedCategory = null;  // 現在選択中のカテゴリ id

  // ---------- カテゴリグリッドの描画 ----------

  /**
   * カテゴリ選択グリッドを DOM に描画する。
   * 初期化時に一度だけ呼ぶ。
   */
  function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    if (!grid) return;

    grid.innerHTML = '';
    Analytics.CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className   = 'cat-btn';
      btn.dataset.id  = cat.id;
      btn.type        = 'button';
      btn.style.color = cat.color;  // カテゴリカラーをカスタムCSSで継承
      btn.setAttribute('aria-label', cat.label);

      btn.innerHTML = `
        <span class="cat-icon">${cat.icon}</span>
        <span>${cat.label}</span>
      `;

      btn.addEventListener('click', () => selectCategory(cat.id));
      grid.appendChild(btn);
    });
  }

  /**
   * カテゴリを選択状態にする。
   * @param {string} catId
   */
  function selectCategory(catId) {
    selectedCategory = catId;
    document
      .querySelectorAll('#category-grid .cat-btn')
      .forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.id === catId);
      });
  }

  // ---------- 現在時刻のデフォルトセット ----------

  /**
   * 入力フォームの時刻フィールドに現在時刻をデフォルト値として設定する。
   */
  function setDefaultTimes() {
    const now    = new Date();
    const hh     = String(now.getHours()).padStart(2, '0');
    const mm     = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    const startEl = document.getElementById('input-start');
    const endEl   = document.getElementById('input-end');

    if (startEl && !startEl.value) startEl.value = timeStr;
    if (endEl   && !endEl.value)   endEl.value   = timeStr;
  }

  // ---------- バリデーション ----------

  /**
   * フォーム入力をバリデーションして { ok, message } を返す。
   * @param {string} start
   * @param {string} end
   * @param {string|null} category
   * @returns {{ ok: boolean, message: string }}
   */
  function validate(start, end, category) {
    if (!start || !end) {
      return { ok: false, message: '開始・終了時間を入力してください' };
    }
    if (!category) {
      return { ok: false, message: 'カテゴリを選択してください' };
    }
    const duration = Analytics.calcDuration(start, end);
    if (duration <= 0) {
      return { ok: false, message: '終了時間は開始時間より後に設定してください' };
    }
    if (duration > 24 * 60) {
      return { ok: false, message: '記録できるのは24時間以内です' };
    }
    return { ok: true, message: '' };
  }

  // ---------- エントリー追加 ----------

  /**
   * フォームの値を取得し、バリデーション後にエントリーを保存する。
   * 成功時は ui.js のリフレッシュを呼ぶ。
   */
  function addEntry() {
    const start    = document.getElementById('input-start')?.value ?? '';
    const end      = document.getElementById('input-end')?.value ?? '';
    const memo     = (document.getElementById('input-memo')?.value ?? '').trim();
    const category = selectedCategory;

    // バリデーション
    const { ok, message } = validate(start, end, category);
    if (!ok) {
      UI.showToast(message, 'error');
      return;
    }

    const duration = Analytics.calcDuration(start, end);
    const todayKey = Analytics.toDateKey(new Date());

    // エントリーオブジェクト
    const entry = {
      id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category,
      start,
      end,
      memo,
      duration,   // 分数
      createdAt:  Date.now(),
    };

    Storage.addEntry(todayKey, entry);

    // ストリーク更新
    const todayEntries = Storage.getEntriesByDate(todayKey);
    Analytics.updateStreak(todayKey, todayEntries);

    // UI 更新
    UI.refresh();
    UI.showToast(`${Analytics.getCategoryById(category).label} を記録しました ✓`);

    // フォームリセット
    _resetForm();
  }

  /**
   * フォームをリセットする（時刻は現在時刻に戻す）。
   */
  function _resetForm() {
    const memoEl = document.getElementById('input-memo');
    if (memoEl) memoEl.value = '';

    // カテゴリ選択解除
    selectedCategory = null;
    document
      .querySelectorAll('#category-grid .cat-btn')
      .forEach(btn => btn.classList.remove('selected'));

    setDefaultTimes();
  }

  // ---------- イベントバインド ----------

  /**
   * フォーム関連のイベントリスナーをまとめてバインドする。
   * app.js の init() から一度だけ呼ぶ。
   */
  function bindEvents() {
    const btn = document.getElementById('btn-add-entry');
    if (btn) {
      btn.addEventListener('click', addEntry);
    }

    // Enter キーでも追加できるようにする
    document.getElementById('input-memo')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') addEntry();
    });
  }

  // ---------- 公開 API ----------
  return {
    renderCategoryGrid,
    setDefaultTimes,
    bindEvents,
  };
})();
