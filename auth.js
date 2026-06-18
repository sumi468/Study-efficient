/**
 * auth.js — TimeScope
 * Firebase Authentication 管理モジュール。
 * メール/パスワード認証 + Google OAuth に対応。
 * ログイン状態に応じて #login-screen / #app の表示を切り替える。
 *
 * 依存: Firebase SDK (compat v10 CDN)
 * 読み込み順: firebase-app → firebase-auth → auth.js → storage.js → ... → app.js
 */

const Auth = (() => {

  // ---------- 内部状態 ----------
  let _onAuthReady = null;   // App.init へのコールバック
  let _isNewUser   = false;  // サインアップ直後フラグ

  // ---------- 初期化 ----------

  /**
   * Firebase Auth を初期化し、認証状態の監視を開始する。
   * @param {Function} onSignedIn  サインイン完了時に呼ぶコールバック
   */
  function init(onSignedIn) {
    _onAuthReady = onSignedIn;
    _bindEvents();

    // 認証状態の変化を監視
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        _onSignedIn(user);
      } else {
        _showLoginScreen();
      }
    });
  }

  // ---------- 画面切り替え ----------

  /**
   * ログイン画面を表示する。
   */
  function _showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const app         = document.getElementById('app');
    if (loginScreen) {
      loginScreen.style.display = 'flex';
      // 次フレームで登場アニメーション開始
      requestAnimationFrame(() => {
        requestAnimationFrame(() => loginScreen.classList.add('visible'));
      });
    }
    if (app) app.style.display = 'none';
    _clearError();
  }

  /**
   * ログイン完了後にアプリを表示する。
   * @param {Object} user  Firebase User オブジェクト
   */
  function _onSignedIn(user) {
    const loginScreen = document.getElementById('login-screen');
    const app         = document.getElementById('app');

    if (loginScreen) {
      loginScreen.classList.add('exit');
      setTimeout(() => {
        loginScreen.style.display = 'none';
        loginScreen.classList.remove('visible', 'exit');
      }, 500);
    }

    if (app) {
      app.style.display = '';
      app.classList.add('app-enter');
      setTimeout(() => app.classList.remove('app-enter'), 700);
    }

    // ユーザー情報をヘッダーに反映
    _renderUserBadge(user);

    // アプリ本体の初期化（初回のみ）
    if (_onAuthReady) {
      _onAuthReady(user);
      _onAuthReady = null;
    }
  }

  // ---------- 認証メソッド ----------

  /**
   * メール / パスワードでサインイン。
   */
  async function _signInWithEmail(email, password) {
    _setLoading(true);
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
      _showError(_friendlyError(err.code));
      _setLoading(false);
    }
  }

  /**
   * メール / パスワードで新規登録。
   */
  async function _signUpWithEmail(email, password) {
    _setLoading(true);
    try {
      _isNewUser = true;
      await firebase.auth().createUserWithEmailAndPassword(email, password);
    } catch (err) {
      _showError(_friendlyError(err.code));
      _isNewUser = false;
      _setLoading(false);
    }
  }

  /**
   * Google でサインイン。
   */
  async function _signInWithGoogle() {
    _setLoading(true);
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        _showError(_friendlyError(err.code));
      }
      _setLoading(false);
    }
  }

  /**
   * サインアウト。
   */
  async function signOut() {
    try {
      await firebase.auth().signOut();
    } catch (err) {
      console.error('[Auth] signOut failed:', err);
    }
  }

  /**
   * 現在のユーザーを返す。未ログインは null。
   */
  function currentUser() {
    return firebase.auth().currentUser;
  }

  // ---------- UI ヘルパー ----------

  /**
   * ログインフォームのイベントをバインドする。
   */
  function _bindEvents() {
    // タブ切り替え（サインイン ↔ サインアップ）
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        document.querySelectorAll('.auth-form-panel').forEach(p =>
          p.classList.toggle('active', p.dataset.mode === mode)
        );
        _clearError();
      });
    });

    // サインイン送信
    document.getElementById('btn-signin')?.addEventListener('click', () => {
      const email    = document.getElementById('signin-email')?.value.trim() ?? '';
      const password = document.getElementById('signin-password')?.value ?? '';
      if (!_validateFields(email, password)) return;
      _signInWithEmail(email, password);
    });

    // サインアップ送信
    document.getElementById('btn-signup')?.addEventListener('click', () => {
      const email    = document.getElementById('signup-email')?.value.trim() ?? '';
      const password = document.getElementById('signup-password')?.value ?? '';
      const confirm  = document.getElementById('signup-confirm')?.value ?? '';
      if (!_validateFields(email, password)) return;
      if (password !== confirm) { _showError('パスワードが一致しません'); return; }
      if (password.length < 6)  { _showError('パスワードは6文字以上にしてください'); return; }
      _signUpWithEmail(email, password);
    });

    // Google サインイン
    document.querySelectorAll('.btn-google').forEach(btn =>
      btn.addEventListener('click', _signInWithGoogle)
    );

    // Enter キー送信
    document.querySelectorAll('.auth-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const activePanel = document.querySelector('.auth-form-panel.active');
        activePanel?.querySelector('.btn-auth-primary')?.click();
      });
    });

    // サインアウトボタン（ヘッダー内）
    document.getElementById('btn-signout')?.addEventListener('click', signOut);

    // パスワードリセット
    document.getElementById('btn-forgot')?.addEventListener('click', async () => {
      const email = document.getElementById('signin-email')?.value.trim();
      if (!email) { _showError('メールアドレスを入力してください'); return; }
      try {
        await firebase.auth().sendPasswordResetEmail(email);
        _showError('リセットメールを送信しました', 'success');
      } catch (err) {
        _showError(_friendlyError(err.code));
      }
    });
  }

  /**
   * ヘッダーにユーザーバッジを描画する。
   * @param {Object} user
   */
  function _renderUserBadge(user) {
    const meta = document.querySelector('.header-meta');
    if (!meta) return;

    // 既存バッジを削除
    meta.querySelector('.user-badge')?.remove();

    const badge   = document.createElement('div');
    badge.className = 'user-badge';

    const initial = (user.displayName ?? user.email ?? '?')[0].toUpperCase();
    const photoURL = user.photoURL;

    badge.innerHTML = photoURL
      ? `<img src="${photoURL}" alt="${initial}" class="user-avatar" />`
      : `<span class="user-avatar user-avatar--text">${initial}</span>`;

    badge.title = user.displayName ?? user.email ?? '';

    // クリックでサインアウト確認
    badge.addEventListener('click', () => {
      if (confirm(`${user.email ?? user.displayName} からサインアウトしますか？`)) {
        signOut();
      }
    });

    // テーマ切替ボタンの前に挿入
    const themeToggle = meta.querySelector('.theme-toggle');
    meta.insertBefore(badge, themeToggle);
  }

  /**
   * バリデーション。
   */
  function _validateFields(email, password) {
    if (!email)    { _showError('メールアドレスを入力してください'); return false; }
    if (!password) { _showError('パスワードを入力してください');     return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      _showError('正しいメールアドレスを入力してください'); return false;
    }
    return true;
  }

  /**
   * エラーメッセージを表示する。
   */
  function _showError(message, type = 'error') {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = message;
    el.className   = `auth-error ${type} show`;
  }

  function _clearError() {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  }

  /**
   * ローディング状態を切り替える。
   */
  function _setLoading(on) {
    document.querySelectorAll('.btn-auth-primary, .btn-google').forEach(btn => {
      btn.disabled = on;
      btn.classList.toggle('loading', on);
    });
  }

  /**
   * Firebase エラーコードを日本語メッセージに変換する。
   */
  function _friendlyError(code) {
    const map = {
      'auth/user-not-found':       'このメールアドレスは登録されていません',
      'auth/wrong-password':       'パスワードが正しくありません',
      'auth/invalid-email':        'メールアドレスの形式が正しくありません',
      'auth/email-already-in-use': 'このメールアドレスはすでに使用されています',
      'auth/weak-password':        'パスワードは6文字以上にしてください',
      'auth/too-many-requests':    'しばらく時間をおいてから再試行してください',
      'auth/network-request-failed': 'ネットワークエラーが発生しました',
      'auth/invalid-credential':   'メールアドレスまたはパスワードが正しくありません',
      'auth/popup-blocked':        'ポップアップがブロックされました。許可してください',
    };
    return map[code] ?? `認証エラーが発生しました (${code})`;
  }

  // ---------- 公開 API ----------
  return { init, signOut, currentUser };

})();
