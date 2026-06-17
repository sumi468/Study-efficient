/**
 * analytics.js — TimeScope
 * 時間計算・カテゴリ分析・理想時間比較のロジック。
 * DOM 操作は一切行わず、純粋なデータ計算のみ担当する。
 */

const Analytics = (() => {

  // ---------- カテゴリ定義 ----------
  // アプリ全体で参照できる単一の正規ソース
  const CATEGORIES = [
    { id: 'study',     label: '勉強',   icon: '📚', color: '#60a5fa' },
    { id: 'work',      label: '仕事',   icon: '💼', color: '#a78bfa' },
    { id: 'sleep',     label: '睡眠',   icon: '🌙', color: '#34d399' },
    { id: 'sns',       label: 'SNS',    icon: '📱', color: '#f472b6' },
    { id: 'exercise',  label: '運動',   icon: '🏃', color: '#fb923c' },
    { id: 'hobby',     label: '趣味',   icon: '🎮', color: '#facc15' },
    { id: 'transport', label: '移動',   icon: '🚃', color: '#94a3b8' },
    { id: 'meal',      label: '食事',   icon: '🍽', color: '#4ade80' },
    { id: 'other',     label: 'その他', icon: '⊹',  color: '#64748b' },
  ];

  /**
   * カテゴリ id からカテゴリ定義オブジェクトを返す。
   * @param {string} id
   * @returns {Object}
   */
  function getCategoryById(id) {
    return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
  }

  // ---------- 時間計算ユーティリティ ----------

  /**
   * "HH:MM" 文字列を分（number）に変換する。
   * @param {string} timeStr
   * @returns {number}
   */
  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * 分数を "Xh Ym" の文字列にフォーマットする。
   * @param {number} minutes
   * @returns {string}
   */
  function formatDuration(minutes) {
    if (minutes < 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  /**
   * 分数を小数点付き時間文字列にフォーマットする（例: 1.5h）。
   * @param {number} minutes
   * @returns {string}
   */
  function formatHoursDecimal(minutes) {
    return (minutes / 60).toFixed(1) + 'h';
  }

  /**
   * start / end 文字列から経過分数を計算する。
   * 日をまたぐ場合 (end < start) は翌日として計算する。
   * @param {string} start  "HH:MM"
   * @param {string} end    "HH:MM"
   * @returns {number} minutes
   */
  function calcDuration(start, end) {
    let startMin = timeToMinutes(start);
    let endMin   = timeToMinutes(end);
    if (endMin < startMin) endMin += 24 * 60; // 日またぎ
    return endMin - startMin;
  }

  // ---------- カテゴリ別集計 ----------

  /**
   * エントリー配列をカテゴリ別合計時間（分）にまとめる。
   * @param {Array} entries
   * @returns {Object}  { [categoryId]: totalMinutes }
   */
  function sumByCategory(entries) {
    const result = {};
    CATEGORIES.forEach(c => { result[c.id] = 0; });
    entries.forEach(e => {
      if (result[e.category] !== undefined) {
        result[e.category] += e.duration;
      }
    });
    return result;
  }

  /**
   * 分を持つカテゴリのみ抽出したサマリー配列を返す。
   * @param {Object} sumMap  sumByCategory の結果
   * @returns {Array}  [{ category, label, icon, color, minutes }, ...]
   */
  function buildSummary(sumMap) {
    return CATEGORIES
      .map(c => ({ ...c, minutes: sumMap[c.id] ?? 0 }))
      .filter(c => c.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }

  // ---------- 週間分析 ----------

  /**
   * 今日から遡って days 日分の日付キー配列を返す。
   * @param {number} days
   * @returns {string[]}  ['YYYY-MM-DD', ...]  古い順
   */
  function getLastNDates(days) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      result.push(toDateKey(d));
    }
    return result;
  }

  /**
   * Date オブジェクトを 'YYYY-MM-DD' に変換する。
   * @param {Date} date
   * @returns {string}
   */
  function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 日付キーを "M/D" の表示文字列にフォーマットする。
   * @param {string} dateKey  'YYYY-MM-DD'
   * @returns {string}
   */
  function formatDateLabel(dateKey) {
    const [, m, d] = dateKey.split('-');
    return `${parseInt(m)}/${parseInt(d)}`;
  }

  /**
   * 週間データを Chart.js 用データセットに変換する。
   * @param {string[]}  dateKeys   7日分の日付キー
   * @param {Object}    allEntries Storage.getAllEntries() の結果
   * @returns {{ labels: string[], datasets: Object[] }}
   */
  function buildWeeklyChartData(dateKeys, allEntries) {
    const labels = dateKeys.map(formatDateLabel);

    const datasets = CATEGORIES.map(cat => ({
      label:           cat.label,
      data:            dateKeys.map(dk => {
        const entries = allEntries[dk] ?? [];
        const sum = entries
          .filter(e => e.category === cat.id)
          .reduce((acc, e) => acc + e.duration, 0);
        return parseFloat((sum / 60).toFixed(2));
      }),
      backgroundColor: cat.color + 'cc',
      borderColor:     cat.color,
      borderWidth:     1.5,
      borderRadius:    4,
    }));

    // データが全て 0 のカテゴリは除外
    const activeDatasets = datasets.filter(ds => ds.data.some(v => v > 0));

    return { labels, datasets: activeDatasets };
  }

  /**
   * 週間のカテゴリ別合計時間を返す。
   * @param {string[]} dateKeys
   * @param {Object}   allEntries
   * @returns {Object}  { [catId]: minutes }
   */
  function weeklyTotalByCategory(dateKeys, allEntries) {
    const result = {};
    CATEGORIES.forEach(c => { result[c.id] = 0; });
    dateKeys.forEach(dk => {
      const entries = allEntries[dk] ?? [];
      entries.forEach(e => {
        if (result[e.category] !== undefined) {
          result[e.category] += e.duration;
        }
      });
    });
    return result;
  }

  // ---------- 理想時間差分 ----------

  /**
   * 理想時間と実績の差分データを返す。
   * @param {Object} sumMap    sumByCategory の結果（分）
   * @param {Object} goals     Storage.getGoals() の結果（時間）
   * @returns {Array}  [{ category, label, icon, color, actual, ideal, delta }, ...]
   */
  function buildDiffData(sumMap, goals) {
    return CATEGORIES
      .filter(c => goals[c.id] != null && goals[c.id] > 0)
      .map(c => {
        const actualMin = sumMap[c.id] ?? 0;
        const idealMin  = (goals[c.id] ?? 0) * 60;
        return {
          ...c,
          actual:  actualMin,
          ideal:   idealMin,
          delta:   actualMin - idealMin,
        };
      });
  }

  // ---------- ストリーク計算 ----------

  /**
   * 今日記録があるかどうかに基づいてストリークを更新する。
   * @param {string} todayKey  'YYYY-MM-DD'
   * @param {Array}  todayEntries
   */
  function updateStreak(todayKey, todayEntries) {
    const streak   = Storage.getStreak();
    const lastDate = Storage.getLastDate();

    if (todayEntries.length === 0) return;

    if (lastDate === todayKey) {
      // 今日はもう更新済み
      return;
    }

    // 昨日かどうかチェック
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toDateKey(yesterday);

    if (lastDate === yesterdayKey) {
      streak.count += 1;
    } else if (lastDate !== todayKey) {
      // 途切れた
      streak.count = 1;
    }

    Storage.setStreak(streak);
    Storage.setLastDate(todayKey);
  }

  // ---------- 公開 API ----------
  return {
    CATEGORIES,
    getCategoryById,
    timeToMinutes,
    formatDuration,
    formatHoursDecimal,
    calcDuration,
    sumByCategory,
    buildSummary,
    getLastNDates,
    toDateKey,
    formatDateLabel,
    buildWeeklyChartData,
    weeklyTotalByCategory,
    buildDiffData,
    updateStreak,
  };
})();
