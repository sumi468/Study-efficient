/**
 * storage.js — TimeScope
 * localStorage の読み書きを一元管理するモジュール。
 * キー名を定数で管理し、外部から直接 localStorage を触らせない設計。
 */

const Storage = (() => {
  // ---------- ストレージキー定数 ----------
  const KEYS = {
    ENTRIES:   'ts_entries',    // 全エントリー（日付ごとにネスト）
    GOALS:     'ts_goals',      // カテゴリ別理想時間
    STREAK:    'ts_streak',     // ストリーク情報
    LAST_DATE: 'ts_last_date',  // 最後に記録した日付
  };

  // ---------- 汎用 helpers ----------

  /**
   * JSON をパースして返す。パース失敗時は fallback を返す。
   * @param {string} key
   * @param {*} fallback
   */
  function _get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * 値を JSON として保存する。
   * @param {string} key
   * @param {*} value
   */
  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('[Storage] write failed:', e);
    }
  }

  // ---------- エントリー ----------

  /**
   * 全エントリーを返す。構造: { "YYYY-MM-DD": [entry, ...] }
   */
  function getAllEntries() {
    return _get(KEYS.ENTRIES, {});
  }

  /**
   * 指定日のエントリー配列を返す。
   * @param {string} dateKey  'YYYY-MM-DD'
   */
  function getEntriesByDate(dateKey) {
    const all = getAllEntries();
    return all[dateKey] ?? [];
  }

  /**
   * 1件追加して保存する。
   * @param {string} dateKey
   * @param {Object} entry  { id, category, start, end, memo, duration }
   */
  function addEntry(dateKey, entry) {
    const all = getAllEntries();
    if (!all[dateKey]) all[dateKey] = [];
    all[dateKey].push(entry);
    _set(KEYS.ENTRIES, all);
  }

  /**
   * 指定 id のエントリーを削除して保存する。
   * @param {string} dateKey
   * @param {string} entryId
   */
  function deleteEntry(dateKey, entryId) {
    const all = getAllEntries();
    if (!all[dateKey]) return;
    all[dateKey] = all[dateKey].filter(e => e.id !== entryId);
    _set(KEYS.ENTRIES, all);
  }

  // ---------- 目標時間 ----------

  /**
   * カテゴリ別理想時間を返す。構造: { [category]: hours (number) }
   */
  function getGoals() {
    return _get(KEYS.GOALS, {});
  }

  /**
   * カテゴリの理想時間を更新する。
   * @param {string} category
   * @param {number} hours
   */
  function setGoal(category, hours) {
    const goals = getGoals();
    goals[category] = hours;
    _set(KEYS.GOALS, goals);
  }

  // ---------- ストリーク ----------

  /**
   * ストリーク情報を返す。構造: { count: number }
   */
  function getStreak() {
    return _get(KEYS.STREAK, { count: 0 });
  }

  /**
   * ストリーク情報を保存する。
   * @param {{ count: number }} streak
   */
  function setStreak(streak) {
    _set(KEYS.STREAK, streak);
  }

  /**
   * 最後に記録した日付文字列を返す ('YYYY-MM-DD')。
   */
  function getLastDate() {
    return _get(KEYS.LAST_DATE, null);
  }

  /**
   * 最後に記録した日付を保存する。
   * @param {string} dateKey
   */
  function setLastDate(dateKey) {
    _set(KEYS.LAST_DATE, dateKey);
  }

  // ---------- 公開 API ----------
  return {
    getAllEntries,
    getEntriesByDate,
    addEntry,
    deleteEntry,
    getGoals,
    setGoal,
    getStreak,
    setStreak,
    getLastDate,
    setLastDate,
  };
})();
