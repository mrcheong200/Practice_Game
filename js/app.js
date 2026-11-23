/**
 * 學生練習系統前端
 */
(function () {
  const state = {
    profile: null,
    recent: [],
    subjects: [],
    quiz: null,
    result: null,
    history: [],
    historyTotal: 0,
    achievements: [],
    busy: false
  };

  let loginMessage = '';
  let toastTimer = null;

  /* ---------- DOM helpers ---------- */

  function h(tag, attrs) {
    const node = document.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;

        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key === 'dataset') {
          Object.keys(value).forEach(function (dataKey) {
            node.dataset[dataKey] = value[dataKey];
          });
        } else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, value);
        }
      });
    }

    const children = Array.prototype.slice.call(arguments, 2);
    children.forEach(function (child) {
      appendContent(node, child);
    });

    return node;
  }

  function appendContent(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) { appendContent(node, item); });
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function avatarEl(assetKey, size) {
    const avatars = window.AVATARS || {};
    const avatar = avatars[assetKey] || avatars.default || {
      name: '頭像',
      emoji: '🙂',
      bg: 'linear-gradient(135deg, #e5e7eb, #d1d5db)'
    };

    const node = h('div', {
      class: 'avatar avatar-' + (size || 'md'),
      title: avatar.name
    });
    node.style.background = avatar.bg;
    node.textContent = avatar.emoji;
    return node;
  }

  function emptyState(text) {
    return h('div', { class: 'empty' },
      h('span', { class: 'empty-icon', text: '🌱' }),
      h('p', { text: text })
    );
  }

  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.hidden = false;
    node.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('show');
      node.hidden = true;
    }, 3200);
  }

  function confirmModal(title, message, confirmText) {
    return new Promise(function (resolve) {
      const root = document.getElementById('modal-root');
      clearNode(root);

      function close(result) {
        clearNode(root);
        resolve(result);
      }

      const overlay = h('div', {
        class: 'modal-overlay',
        onclick: function (event) {
          if (event.target === overlay) close(false);
        }
      },
        h('div', { class: 'modal' },
          h('h3', { text: title }),
          h('p', { class: 'modal-msg', text: message }),
          h('div', { class: 'modal-actions' },
            h('button', { class: 'btn ghost', onclick: function () { close(false); } }, '取消'),
            h('button', { class: 'btn primary', onclick: function () { close(true); } }, confirmText || '確定')
          )
        )
      );

      root.appendChild(overlay);
    });
  }

  /* ---------- API ---------- */

  async function api(action, payload) {
    try {
      return await window.API.call(action, payload);
    } catch (err) {
      if (err.code === 'UNAUTHORIZED' || err.code === 'DISABLED') {
        const wasLoggedIn = !!state.profile;
        window.API.clearToken();
        state.profile = null;
        state.quiz = null;
        state.result = null;
        loginMessage = err.message;
        if (wasLoggedIn) {
          renderLogin(err.message);
        }
      }
      throw err;
    }
  }

  async function loadMe() {
    const data = await api('me');
    state.profile = data.profile;
    state.recent = data.recent || [];
    state.subjects = data.subjects || [];
    state.achievements = data.achievements || [];
  }

  /* ---------- Init / routing ---------- */

  async function boot() {
    window.API.mode = (window.CONFIG && window.CONFIG.API_MODE === 'jsonp') ? 'jsonp' : 'post';

    if (!window.CONFIG || !window.CONFIG.API_URL || window.CONFIG.API_URL.indexOf('PASTE_') === 0) {
      renderLogin('尚未設定 API_URL，請編輯 docs/js/config.js。');
      return;
    }

    if (window.API.getToken()) {
      try {
        await loadMe();
        route();
        return;
      } catch (err) {
        window.API.clearToken();
        state.profile = null;
        loginMessage = '登入已過期，請重新登入。';
      }
    }

    renderLogin(loginMessage);
  }

  function navigate(hash) {
    if (location.hash === hash) {
      route();
    } else {
      location.hash = hash;
    }
  }

  function route() {
    if (!state.profile) {
      renderLogin(loginMessage);
      return;
    }

    const hash = location.hash || '#/home';

    if (hash === '#/practice') {
      renderPracticeSetup();
    } else if (hash === '#/quiz') {
      if (!state.quiz) {
        navigate('#/practice');
        return;
      }
      renderQuiz();
    } else if (hash === '#/result') {
      if (!state.result) {
        navigate('#/home');
        return;
      }
      renderResult();
    } else if (hash === '#/leaderboard') {
      renderLeaderboard();
    } else if (hash === '#/shop') {
      renderShop();
    } else if (hash === '#/history') {
      renderHistory();
    } else {
      renderHome();
    }
  }

  function logout() {
    window.Auth.disableAutoSelect();
    window.API.clearToken();
    state.profile = null;
    state.quiz = null;
    state.result = null;
    state.recent = [];
    state.subjects = [];

    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (err) {
      // 忽略
    }

    renderLogin('已登出。');
  }

  /* ---------- Login ---------- */

  function renderLogin(message) {
    const app = document.getElementById('app');
    clearNode(app);

    const buttonWrap = h('div', { class: 'google-btn' });
    const messageEl = h('p', { class: 'login-msg', id: 'login-msg', text: message || '' });

    const card = h('div', { class: 'login-card' },
      h('div', { class: 'login-brand' },
        h('span', { class: 'login-logo', text: '📚' }),
        h('h1', { text: (window.CONFIG && window.CONFIG.SITE_NAME) || '學生練習系統' })
      ),
      h('p', { class: 'login-sub', text: '用 Google 帳號登入，開始練習並賺取積分兌換頭像。' }),
      buttonWrap,
      messageEl,
      h('p', { class: 'login-note', text: '僅限老師已開通的帳號。若無法登入，請聯絡老師。' })
    );

    app.appendChild(h('div', { class: 'login-page' }, card));

    window.Auth.mountLoginButton(buttonWrap, onGoogleCredential, function (text) {
      messageEl.textContent = text;
    });
  }

  async function onGoogleCredential(response) {
    const messageEl = document.getElementById('login-msg');
    if (messageEl) messageEl.textContent = '登入中，請稍候…';

    try {
      const data = await window.API.call('login', { credential: response.credential });
      window.API.setToken(data.token);
      loginMessage = '';
      await loadMe();
      if (messageEl) messageEl.textContent = '';
      navigate('#/home');
    } catch (err) {
      window.API.clearToken();
      if (messageEl) messageEl.textContent = err.message;
    }
  }

  /* ---------- Shell ---------- */

  function renderShell(content, active) {
    const profile = state.profile;
    const navItems = [
      { key: 'home', label: '首頁', hash: '#/home' },
      { key: 'practice', label: '練習', hash: '#/practice' },
      { key: 'leaderboard', label: '排行', hash: '#/leaderboard' },
      { key: 'shop', label: '商店', hash: '#/shop' },
      { key: 'history', label: '紀錄', hash: '#/history' }
    ];

    const nav = h('nav', { class: 'nav' });
    navItems.forEach(function (item) {
      nav.appendChild(h('button', {
        class: 'nav-btn' + (active === item.key ? ' active' : ''),
        onclick: function () { navigate(item.hash); }
      }, item.label));
    });

    const header = h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('button', { class: 'brand', onclick: function () { navigate('#/home'); } },
          h('span', { class: 'brand-mark', text: '📚' }),
          h('span', { class: 'brand-text', text: (window.CONFIG && window.CONFIG.SITE_NAME) || '學生練習系統' })
        ),
        nav,
        h('div', { class: 'user-chip' },
          avatarEl(profile.avatar_id, 'sm'),
          h('div', { class: 'user-meta' },
            h('span', { class: 'user-name', text: profile.name || profile.email }),
            h('span', { class: 'user-points', text: '⭐ ' + profile.points_balance + ' 積分' })
          ),
          h('button', { class: 'btn tiny ghost', onclick: logout }, '登出')
        )
      )
    );

    const app = document.getElementById('app');
    clearNode(app);
    app.appendChild(header);
    app.appendChild(h('main', { class: 'container' }, content));
    window.scrollTo(0, 0);
  }

  /* ---------- Home ---------- */

  function renderHome() {
    const profile = state.profile;
    const unlockedCount = state.achievements.filter(function (badge) {
      return badge.unlocked;
    }).length;

    const content = h('div', { class: 'page' },
      h('section', { class: 'hero-card' },
        avatarEl(profile.avatar_id, 'lg'),
        h('div', { class: 'hero-info' },
          h('h1', { text: '嗨，' + (profile.name || '同學') + '！' }),
          h('p', { class: 'muted', text: profile['class'] || '準備好開始今天的練習了嗎？' }),
          h('div', { class: 'points-pill', text: '⭐ ' + profile.points_balance + ' 積分' })
        ),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn primary', onclick: function () { navigate('#/practice'); } }, '開始練習'),
          h('button', { class: 'btn ghost', onclick: function () { navigate('#/shop'); } }, '兌換頭像')
        )
      ),
      h('section', { class: 'card' },
        h('div', { class: 'section-head' },
          h('h2', { text: '最近成績' }),
          h('button', { class: 'link', onclick: function () { navigate('#/history'); } }, '查看全部')
        ),
        state.recent.length
          ? h('div', { class: 'attempt-list' }, state.recent.map(attemptRow))
          : emptyState('還沒有練習紀錄，開始第一次練習吧！')
      ),
      state.achievements.length
        ? h('section', { class: 'card' },
          h('div', { class: 'section-head' },
            h('h2', { text: '我的成就' }),
            h('span', { class: 'muted', text: unlockedCount + ' / ' + state.achievements.length + ' 已解鎖' })
          ),
          h('div', { class: 'badge-grid' }, state.achievements.map(badgeCard))
        )
        : null
    );

    renderShell(content, 'home');
  }

  function badgeCard(badge) {
    return h('div', {
      class: 'badge-card' + (badge.unlocked ? ' unlocked' : ' locked'),
      title: badge.desc
    },
      h('span', { class: 'badge-icon', text: badge.unlocked ? badge.icon : '🔒' }),
      h('span', { class: 'badge-name', text: badge.name }),
      h('span', { class: 'badge-desc', text: badge.desc })
    );
  }

  function attemptRow(attempt) {
    const score = Number(attempt.score || 0);
    const scoreClass = score >= 80 ? 'good' : (score >= 60 ? 'mid' : 'low');

    return h('div', { class: 'attempt-row' },
      h('div', { class: 'attempt-main' },
        h('span', { class: 'attempt-subject', text: attempt.subject || '練習' }),
        h('span', { class: 'attempt-date', text: formatDate(attempt.submitted_at) })
      ),
      h('div', { class: 'attempt-metrics' },
        h('span', { class: 'score-badge ' + scoreClass, text: score + ' 分' }),
        h('span', { class: 'attempt-points', text: '+' + Number(attempt.points_earned || 0) + ' 積分' }),
        h('span', { class: 'attempt-count', text: Number(attempt.correct_count || 0) + '/' + Number(attempt.question_count || 0) })
      )
    );
  }

  /* ---------- Practice setup ---------- */

  function renderPracticeSetup() {
    const select = h('select', { class: 'select' });
    select.appendChild(h('option', { value: '', text: '全部科目' }));
    state.subjects.forEach(function (subject) {
      select.appendChild(h('option', { value: subject, text: subject }));
    });

    let count = 10;
    const countGroup = h('div', { class: 'choice-group' });

    [5, 10, 20].forEach(function (n) {
      const button = h('button', {
        class: 'chip' + (n === count ? ' active' : ''),
        type: 'button',
        onclick: function () {
          count = n;
          Array.prototype.forEach.call(countGroup.children, function (child) {
            child.classList.remove('active');
          });
          button.classList.add('active');
        }
      }, n + ' 題');
      countGroup.appendChild(button);
    });

    const startButton = h('button', {
      class: 'btn primary big',
      onclick: async function () {
        startButton.disabled = true;
        startButton.textContent = '準備題目中…';
        try {
          const data = await api('quiz/start', { subject: select.value, count: count });
          state.result = null;
          state.quiz = {
            attemptId: data.attempt_id,
            questions: data.questions || [],
            answers: {},
            answerResults: {},
            battleMessage: BATTLE_INTRO,
            index: 0,
            combo: 0,
            maxCombo: 0
          };
          navigate('#/quiz');
        } catch (err) {
          toast(err.message);
          startButton.disabled = false;
          startButton.textContent = '開始練習';
        }
      }
    }, '開始練習');

    const content = h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: '開始練習' }),
        h('p', { class: 'muted', text: '選擇科目與題數，完成後可獲得積分。' })
      ),
      h('section', { class: 'card' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label', text: '科目' }),
          select
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label', text: '題數' }),
          countGroup
        )
      ),
      startButton
    );

    renderShell(content, 'practice');
  }

  /* ---------- Quiz ---------- */

  const BATTLE_INTRO = '你能答對我出的所有題目嗎？';
  const BATTLE_PRAISE = [
    '想不到你如此聰明！',
    '答得太漂亮了！',
    '你真是個答題高手！',
    '了不起，繼續保持！'
  ];
  const BATTLE_ENCOURAGE = [
    '失敗乃兵家常事，再來！',
    '別灰心，下一題扳回一城！',
    '再接再厲，你可以的！',
    '差一點點，繼續努力！'
  ];

  function pickBattleLine(lines) {
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function battleSprite(species) {
    const sprites = {
      oak: '<path fill="#2d2a32" d="M20 4h23v4h5v7h4v18h-5v6h5v21h-6v4H17v-4h-6V40h5v-7h-5V18h4V9h5z"/><path fill="#d7dde2" d="M20 8h23v4h5v8h-5v-5h-5v-4H22v4h-5v8h-4V14h3V9h4z"/><path fill="#f0bd91" d="M19 18h25v16h-5v5H23v-4h-4z"/><path fill="#f0bd91" d="M14 23h5v8h-5zm30 0h5v8h-5z"/><path fill="#2d2a32" d="M22 23h6v3h-6zm12 0h6v3h-6zm-9 8h12v3H25z"/><path fill="#fff" d="M15 38h33v22H15z"/><path fill="#dce5ea" d="M15 38h8v22h-8zm26 0h7v22h-7z"/><path fill="#c84c45" d="M26 39h11v17H26z"/><path fill="#2d2a32" d="M25 38h14v4H25zm-4 18h7v8h-9v-4h2zm15 0h7v4h2v4h-9z"/><path fill="#f0bd91" d="M9 40h6v13H9zm40 0h6v13h-6z"/><path fill="#fff" d="M20 40h5v13h-5zm19 0h5v13h-5z"/>',
      pikachu: '<path fill="#2d2a32" d="M19 5h6v7h5v5h5v7h5v9h-5v5H15v-5h-5V19h5v-7h4z"/><path fill="#f8d647" d="M18 9h5v7h5v4h5v8h5v5h-5v4H15v-4h-4V20h5v-5h2z"/><path fill="#f8d647" d="M16 33h20v5h5v20h-5v6H13v-6H8V43h5v-6h3z"/><path fill="#fff3a6" d="M15 38h17v14H15z"/><path fill="#2d2a32" d="M13 28h5v5h-5zm16 0h5v5h-5z"/><path fill="#ef5b5b" d="M7 34h7v7H7zm28 0h7v7h-7z"/><path fill="#2d2a32" d="M20 35h5v4h-5zm-3 5h11v3H17z"/><path fill="#b47732" d="M8 55h8v9H8zm21 0h8v9h-8z"/><path fill="#f8d647" d="M40 44h7v-8h5v-8h5v18h-5v9h-7v9h-8V54h3z"/>',
      bulbasaur: '<path fill="#2d2a32" d="M18 18h7v-7h15v7h7v7h5v29h-5v8H12v-8H7V34h5v-9h6z"/><path fill="#73cfa2" d="M14 29h33v27H12v-7H9V37h5z"/><path fill="#73cfa2" d="M18 19h6v10h-6zm21-1h7v12h-7z"/><path fill="#4a9e70" d="M24 12h16v7h5v12H19V19h5z"/><path fill="#77bd59" d="M27 7h11v6h5v12H21V13h6z"/><path fill="#2d2a32" d="M16 34h6v7h-6zm21 0h6v7h-6z"/><path fill="#ef7d81" d="M17 34h4v5h-4zm21 0h4v5h-4z"/><path fill="#2d2a32" d="M26 44h9v4h-9zm-13 12h10v8H13zm23 0h10v8H36z"/><path fill="#4a9e70" d="M13 44h6v5h-6zm27 3h6v5h-6z"/>',
      charmander: '<path fill="#2d2a32" d="M16 9h22v5h6v25h-5v7h5v13h-6v5H14v-5H9V45h5V20h2z"/><path fill="#f39a4a" d="M17 12h19v5h5v20h-6v6H15V22h2z"/><path fill="#f39a4a" d="M15 40h23v17h-5v5H15v-5h-3V46h3z"/><path fill="#ffe0a3" d="M18 43h15v16H18z"/><path fill="#2d2a32" d="M20 23h5v7h-5zm13 0h5v7h-5z"/><path fill="#fff" d="M21 23h3v3h-3zm13 0h3v3h-3z"/><path fill="#2d2a32" d="M24 34h10v3H24z"/><path fill="#f39a4a" d="M40 47h8v-8h5v-7h5v18h-5v8h-8v6h-7V54h2z"/><path fill="#ef5350" d="M50 29h5v-8h5v18h-5v5h-5z"/><path fill="#ffd34e" d="M53 22h5v-8h4v17h-5v5h-4z"/>',
      squirtle: '<path fill="#2d2a32" d="M17 8h23v5h6v25h-5v8h6v13h-7v5H12v-5H7V43h5V20h5z"/><path fill="#77c8e8" d="M18 11h20v5h5v20h-6v7H15V22h3z"/><path fill="#77c8e8" d="M14 41h10v18h-7v3h-7V46h4z"/><path fill="#9a653e" d="M22 39h20v5h5v15h-7v4H21v-6h-4V44h5z"/><path fill="#f6dfa0" d="M19 43h17v16H19z"/><path fill="#2d2a32" d="M20 22h5v8h-5zm14 0h5v8h-5z"/><path fill="#fff" d="M21 22h3v4h-3zm14 0h3v4h-3z"/><path fill="#2d2a32" d="M24 34h11v3H24z"/><path fill="#77c8e8" d="M42 46h7v-6h5v-7h5v17h-5v7h-7v7h-7v-7h2z"/>',
      eevee: '<path fill="#2d2a32" d="M13 5h9v8h16V5h9v23h-4v9h6v22h-7v5H12v-5H7V39h5V22h1z"/><path fill="#b97b4f" d="M15 9h5v13H15zm25 0h5v13h-5z"/><path fill="#b97b4f" d="M17 20h24v5h4v13h-6v6H17v-5h-4V26h4z"/><path fill="#f4dfb5" d="M14 39h30v6h5v10h-8v7H17v-6H9V46h5z"/><path fill="#b97b4f" d="M20 45h18v17H17v-5h-3V49h6z"/><path fill="#2d2a32" d="M18 27h5v7h-5zm16 0h5v7h-5z"/><path fill="#fff" d="M19 27h3v3h-3zm16 0h3v3h-3z"/><path fill="#2d2a32" d="M25 35h6v4h-6zm-12 22h9v7h-9zm22 0h9v7h-9z"/><path fill="#b97b4f" d="M43 43h7v-8h5v16h-5v7h-8v-7h1z"/>',
      gengar: '<path fill="#2d2a32" d="M15 9h8v7h14V9h8v10h6v7h5v29h-5v9H11v-9H6V31h5v-9h4z"/><path fill="#8b72bd" d="M16 17h7v6h14v-6h7v9h5v5h4v22h-5v7H13v-6H9V34h5v-8h2z"/><path fill="#8b72bd" d="M15 50h27v12H15z"/><path fill="#f5f0ff" d="M16 29h10v6H16zm18 0h10v6H34z"/><path fill="#d64c69" d="M19 30h6v4h-6zm18 0h6v4h-6z"/><path fill="#2d2a32" d="M17 41h27v8H17z"/><path fill="#fff" d="M19 41h5v5h-5zm8 0h5v7h-5zm8 0h5v5h-5z"/><path fill="#8b72bd" d="M8 38H3v13h8zm43 0h8v13h-8z"/>'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'battle-sprite-svg');
    svg.innerHTML = sprites[species] || sprites.gengar;
    return svg;
  }

  function createBattleScene(quiz, question, answerArea) {
    const config = (window.CONFIG && window.CONFIG.BATTLE) || {};
    const profile = state.profile || {};
    const enemyName = config.ENEMY_NAME || '大木博士';
    const enemySprite = config.ENEMY_SPRITE || 'oak';
    const playerName = config.PLAYER_NAME || profile.name || profile.email || '同學';
    const playerAvatarKey = config.PLAYER_AVATAR || profile.avatar_id || 'default';
    const playerAvatar = avatarEl(playerAvatarKey, 'battle');
    const total = quiz.questions.length;
    const current = quiz.index;
    const results = quiz.answerResults || {};
    const correctCount = quiz.questions.filter(function (item) {
      return results[item.qid] === true;
    }).length;
    const enemyHp = Math.max(0, total - correctCount);
    const enemyHpPercent = total ? Math.round((enemyHp / total) * 100) : 0;
    const graded = results[question.qid] !== undefined;
    const combo = Number(quiz.combo || 0);
    const dialogText = quiz.battleMessage || BATTLE_INTRO;
    const team = h('div', { class: 'battle-team-list', role: 'list', 'aria-label': '各題作答結果' });

    const confirmButton = h('button', {
      class: 'btn primary',
      id: 'battle-confirm',
      disabled: graded,
      onclick: confirmAnswer
    }, '確認答案');

    playerAvatar.classList.add('battle-player-avatar');

    quiz.questions.forEach(function (item, index) {
      const result = results[item.qid];
      const statusText = result === true ? '回答正確' : (result === false ? '回答錯誤' : '尚未批改');
      team.appendChild(h('div', {
        class: 'battle-team-member' +
          (index === current ? ' current' : '') +
          (result === true ? ' correct' : '') +
          (result === false ? ' wrong' : ''),
        role: 'listitem',
        title: '第 ' + (index + 1) + ' 題：' + statusText + (index === current ? '（目前題目）' : ''),
        'aria-label': '第 ' + (index + 1) + ' 題，' + statusText
      },
        h('span', { class: 'battle-team-number', text: String(index + 1) }),
        result === undefined ? null : h('span', {
          class: 'battle-result-icon',
          text: result ? '✓' : '×',
          'aria-hidden': 'true'
        })
      ));
    });

    return h('section', { class: 'battle-card', 'aria-label': '答題對戰畫面' },
      h('div', { class: 'battle-heading' },
        h('div', {},
          h('span', { class: 'battle-eyebrow', text: 'QUIZ BATTLE' }),
          h('h2', { text: '知識對決' })
        ),
        h('div', { class: 'battle-heading-right' },
          combo >= 2
            ? h('span', { class: 'battle-combo', text: '🔥 ' + combo + ' 連擊' })
            : null,
          h('div', { class: 'battle-remaining' },
            h('span', { class: 'battle-remaining-dot' }),
            h('span', { text: '挑戰數量 ' + (current + 1) + ' / ' + total + ' 題' })
          )
        )
      ),
      h('div', { class: 'battle-team' }, team),
      h('div', { class: 'battle-arena' },
        h('div', { class: 'battle-cloud cloud-one' }),
        h('div', { class: 'battle-cloud cloud-two' }),
        h('div', { class: 'battle-hill hill-one' }),
        h('div', { class: 'battle-hill hill-two' }),
        h('div', { class: 'battle-grass grass-one' }),
        h('div', { class: 'battle-grass grass-two' }),
        h('div', { class: 'battle-status enemy-status' },
          h('div', { class: 'battle-name-row' },
            h('strong', { text: enemyName, title: enemyName }),
            h('span', { text: '博士' })
          ),
          h('div', { class: 'battle-hp-row' },
            h('span', { class: 'battle-hp-label', text: 'HP' }),
            h('div', { class: 'battle-hp-track' },
              h('div', {
                class: 'battle-hp-fill',
                style: 'width: ' + enemyHpPercent + '%'
              })
            )
          ),
          h('div', { class: 'battle-hp-numbers', text: enemyHp + ' / ' + total }),
          h('span', { class: 'battle-type', text: '寶可夢研究者' })
        ),
        h('div', { class: 'battle-enemy-unit' },
          h('div', { class: 'battle-monster enemy-monster' }, battleSprite(enemySprite)),
          h('div', { class: 'battle-platform enemy-platform' })
        ),
        h('div', { class: 'battle-player-unit' },
          h('div', { class: 'battle-monster player-monster' }, playerAvatar),
          h('div', { class: 'battle-platform player-platform' })
        ),
        h('div', { class: 'battle-status player-status' },
          h('div', { class: 'battle-name-row' },
            h('strong', { text: playerName, title: playerName }),
            h('span', { text: '挑戰者' })
          ),
          h('div', { class: 'battle-hp-row' },
            h('span', { class: 'battle-hp-label', text: 'HP' }),
            h('div', { class: 'battle-hp-track' }, h('div', { class: 'battle-hp-fill' }))
          ),
          h('div', { class: 'battle-hp-numbers', text: '48 / 48' })
        )
      ),
      h('div', { class: 'battle-dialog', role: 'status', 'aria-live': 'polite' },
        h('span', { class: 'battle-dialog-name', text: enemyName }),
        h('p', { class: 'battle-dialog-text', text: dialogText })
      ),
      h('div', { class: 'battle-command battle-question-panel' },
        h('div', { class: 'battle-question-content' },
          h('div', { class: 'q-meta' },
            h('span', { class: 'tag', text: question.subject || '練習' }),
            h('span', { class: 'tag type-tag', text: typeLabel(question.type) })
          ),
          h('h2', { class: 'q-title', text: question.question }),
          answerArea
        )
      ),
      h('div', { class: 'battle-confirm-row' }, confirmButton)
    );
  }

  function setQuizAnswer(quiz, qid, answer) {
    quiz.answers[qid] = answer;
    if (!quiz.answerResults || quiz.answerResults[qid] === undefined) return;

    delete quiz.answerResults[qid];
    const marker = document.querySelectorAll('.battle-team-member')[quiz.index];
    if (marker) {
      marker.classList.remove('correct', 'wrong');
      const icon = marker.querySelector('.battle-result-icon');
      if (icon) icon.remove();
      marker.title = '第 ' + (quiz.index + 1) + ' 題：尚未批改（目前題目）';
      marker.setAttribute('aria-label', '第 ' + (quiz.index + 1) + ' 題，尚未批改');
    }
  }

  function renderQuiz() {
    const quiz = state.quiz;
    if (!quiz) {
      navigate('#/practice');
      return;
    }

    const question = quiz.questions[quiz.index];
    const currentAnswer = quiz.answers[question.qid] || '';
    const graded = quiz.answerResults && quiz.answerResults[question.qid] !== undefined;

    const answerArea = h('div', { class: 'answer-area' });

    if (question.type === 'choice' || question.type === 'truefalse') {
      question.options.forEach(function (option) {
        const optionButton = h('button', {
          class: 'option-btn' + (question.type === 'truefalse' ? ' truefalse' : '') +
            (currentAnswer === option.key ? ' selected' : ''),
          type: 'button',
          disabled: graded,
          onclick: function () {
            setQuizAnswer(quiz, question.qid, option.key);
            Array.prototype.forEach.call(answerArea.children, function (child) {
              child.classList.remove('selected');
            });
            optionButton.classList.add('selected');
          }
        },
          h('span', { class: 'option-key', text: option.key }),
          h('span', { class: 'option-text', text: option.text })
        );
        answerArea.appendChild(optionButton);
      });
    } else {
      const input = h('input', {
        class: 'text-input',
        type: 'text',
        placeholder: '輸入答案',
        value: currentAnswer,
        autocomplete: 'off',
        disabled: graded
      });
      input.addEventListener('input', function () {
        setQuizAnswer(quiz, question.qid, input.value);
      });
      answerArea.appendChild(input);
    }

    const content = h('div', { class: 'page quiz-page' },
      createBattleScene(quiz, question, answerArea)
    );

    renderShell(content, 'practice');
  }

  async function confirmAnswer() {
    const quiz = state.quiz;
    if (!quiz || state.busy) return;

    const question = quiz.questions[quiz.index];
    const rawAnswer = quiz.answers[question.qid];
    const answer = String(rawAnswer === null || rawAnswer === undefined ? '' : rawAnswer);

    if (!answer.trim()) {
      toast('請先作答，再按「確認答案」。');
      return;
    }

    state.busy = true;
    const confirmButton = document.getElementById('battle-confirm');
    const controls = document.querySelectorAll(
      '.battle-question-panel button, .battle-question-panel input, #battle-confirm'
    );
    Array.prototype.forEach.call(controls, function (control) { control.disabled = true; });
    if (confirmButton) confirmButton.textContent = '批改中…';

    let isCorrect;
    try {
      const data = await api('quiz/check', {
        attempt_id: quiz.attemptId,
        qid: question.qid,
        answer: answer
      });
      isCorrect = !!data.is_correct;
    } catch (err) {
      toast(err.message);
      Array.prototype.forEach.call(controls, function (control) { control.disabled = false; });
      if (confirmButton) confirmButton.textContent = '確認答案';
      state.busy = false;
      return;
    }

    quiz.answerResults = quiz.answerResults || {};
    quiz.answerResults[question.qid] = isCorrect;

    if (isCorrect) {
      quiz.combo = Number(quiz.combo || 0) + 1;
      quiz.maxCombo = Math.max(Number(quiz.maxCombo || 0), quiz.combo);
      const praise = pickBattleLine(BATTLE_PRAISE);
      quiz.battleMessage = quiz.combo >= 2
        ? '第 ' + quiz.combo + ' 連擊！' + praise
        : praise;
    } else {
      quiz.combo = 0;
      quiz.battleMessage = pickBattleLine(BATTLE_ENCOURAGE);
    }

    state.busy = false;

    if (quiz.index >= quiz.questions.length - 1) {
      submitQuiz();
    } else {
      quiz.index += 1;
      renderQuiz();
    }
  }

  async function submitQuiz() {
    const quiz = state.quiz;
    if (!quiz || state.busy) return;

    const unanswered = quiz.questions.filter(function (question) {
      const answer = quiz.answers[question.qid];
      return !String(answer === null || answer === undefined ? '' : answer).trim();
    }).length;

    if (unanswered > 0) {
      const confirmed = await confirmModal(
        '還有題目未作答',
        '有 ' + unanswered + ' 題尚未作答，確定要送出嗎？',
        '確定送出'
      );
      if (!confirmed) return;
    }

    state.busy = true;
    try {
      const answers = quiz.questions.map(function (question) {
        return {
          qid: question.qid,
          answer: quiz.answers[question.qid] || ''
        };
      });

      const data = await api('quiz/submit', {
        attempt_id: quiz.attemptId,
        answers: answers
      });

      state.result = data;
      state.quiz = null;
      try {
        await loadMe();
      } catch (err) {
        // 成績已送出，即使個人資料更新失敗仍要顯示結果
      }

      const perfect = Number(data.question_count) > 0 &&
        Number(data.correct_count) === Number(data.question_count);
      if (perfect) {
        showVictoryOverlay(function () { navigate('#/result'); });
      } else {
        navigate('#/result');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      state.busy = false;
    }
  }

  function showVictoryOverlay(done) {
    const config = (window.CONFIG && window.CONFIG.BATTLE) || {};
    const enemyName = config.ENEMY_NAME || '大木博士';
    const root = document.getElementById('modal-root');
    clearNode(root);

    let finished = false;
    let timer = null;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearNode(root);
      done();
    }

    const overlay = h('div', { class: 'victory-overlay', onclick: finish },
      h('div', { class: 'victory-sprite' }, battleSprite(config.ENEMY_SPRITE || 'oak')),
      h('div', { class: 'victory-text' },
        h('span', { class: 'victory-eyebrow', text: 'PERFECT!' }),
        h('h2', { text: enemyName + '認輸了！' }),
        h('p', { text: '全部答對，太厲害了！點一下繼續。' })
      )
    );

    root.appendChild(overlay);
    timer = setTimeout(finish, 2800);
  }

  /* ---------- Result ---------- */

  function renderResult() {
    const result = state.result;
    if (!result) {
      navigate('#/home');
      return;
    }

    const score = Math.max(0, Math.min(100, Number(result.score || 0)));
    const maxCombo = Number(result.max_combo || 0);
    const comboBonus = Number(result.combo_bonus || 0);

    const ring = h('div', { class: 'score-ring' });
    ring.style.background = 'conic-gradient(var(--primary) ' + score + '%, #e5e7eb 0)';
    ring.appendChild(h('div', { class: 'score-inner' },
      h('span', { class: 'score-num', text: String(score) }),
      h('span', { class: 'score-unit', text: '分' })
    ));

    const content = h('div', { class: 'page result-page' },
      h('section', { class: 'card result-card' },
        h('h1', { text: score >= 80 ? '太棒了！' : (score >= 60 ? '做得不錯！' : '再試一次會更好！') }),
        ring,
        score >= 100
          ? h('p', { class: 'perfect-line', text: '🏆 完美全對' })
          : null,
        h('div', { class: 'result-stats' },
          statBox('答對題數', Number(result.correct_count || 0) + ' / ' + Number(result.question_count || 0)),
          statBox('本次積分', '+' + Number(result.points_earned || 0)),
          maxCombo >= 2
            ? statBox('最高連擊', '🔥 x' + maxCombo)
            : null,
          comboBonus > 0
            ? statBox('連擊獎勵', '+' + comboBonus + ' 分')
            : null
        ),
        result.points_capped
          ? h('p', { class: 'notice', text: '今日積分已達上限，這次練習的部分積分未發放。' })
          : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: function () { navigate('#/practice'); } }, '再練一次'),
          h('button', { class: 'btn ghost', onclick: function () { navigate('#/home'); } }, '回首頁')
        )
      ),
      h('section', { class: 'card' },
        h('h2', { text: '逐題檢討' }),
        h('div', { class: 'review-list' },
          (result.details || []).map(reviewRow)
        )
      )
    );

    renderShell(content, 'practice');
  }

  function statBox(label, value) {
    return h('div', { class: 'stat' },
      h('span', { class: 'stat-label', text: label }),
      h('span', { class: 'stat-value', text: value })
    );
  }

  function reviewRow(detail) {
    return h('div', { class: 'review-row ' + (detail.is_correct ? 'correct' : 'wrong') },
      h('div', { class: 'review-head' },
        h('span', { class: 'review-icon', text: detail.is_correct ? '✅' : '❌' }),
        h('span', { class: 'review-q', text: detail.question })
      ),
      h('div', { class: 'review-answers' },
        h('span', { text: '你的答案：' + (detail.student_answer || '（未作答）') }),
        h('span', { text: '正確答案：' + detail.correct_answer })
      ),
      detail.explanation
        ? h('p', { class: 'review-explanation', text: '解析：' + detail.explanation })
        : null
    );
  }

  /* ---------- Shop ---------- */

  async function renderShop() {
    renderShell(h('div', { class: 'page' },
      h('p', { class: 'muted', text: '載入商店…' })
    ), 'shop');

    try {
      const data = await api('shop/list');
      renderShopView(data);
    } catch (err) {
      toast(err.message);
    }
  }

  function renderShopView(data) {
    state.profile.points_balance = data.balance;

    const items = data.items || [];
    const grid = h('div', { class: 'shop-grid' });

    items.forEach(function (item) {
      grid.appendChild(shopCard(item));
    });

    const content = h('div', { class: 'page' },
      h('div', { class: 'page-head row' },
        h('div', {},
          h('h1', { text: '頭像商店' }),
          h('p', { class: 'muted', text: '用練習累積的積分兌換新頭像。' })
        ),
        h('div', { class: 'points-pill', text: '⭐ ' + data.balance + ' 積分' })
      ),
      grid
    );

    renderShell(content, 'shop');
  }

  function shopCard(item) {
    let actionButton;

    if (item.equipped) {
      actionButton = h('button', { class: 'btn ghost', disabled: true }, '使用中');
    } else if (item.owned) {
      actionButton = h('button', {
        class: 'btn secondary',
        onclick: function () { equipItem(item); }
      }, '裝備');
    } else {
      actionButton = h('button', {
        class: 'btn primary',
        onclick: function () { buyItem(item); }
      }, '兌換 ' + item.price + ' 積分');
    }

    return h('div', { class: 'shop-card' + (item.equipped ? ' equipped' : '') },
      avatarEl(item.asset_key, 'lg'),
      h('h3', { text: item.name }),
      h('p', { class: 'muted', text: item.description }),
      h('div', { class: 'shop-footer' },
        item.owned
          ? h('span', { class: 'owned-tag', text: item.equipped ? '使用中' : '已擁有' })
          : h('span', { class: 'price-tag', text: '⭐ ' + item.price }),
        actionButton
      )
    );
  }

  async function buyItem(item) {
    const confirmed = await confirmModal(
      '兌換頭像',
      '確定花費 ' + item.price + ' 積分兌換「' + item.name + '」嗎？',
      '確定兌換'
    );
    if (!confirmed) return;

    try {
      const data = await api('shop/buy', { item_id: item.item_id });
      state.profile.points_balance = data.balance;
      toast('兌換成功！');
      try {
        await loadMe();
      } catch (err) {
        // 兌換已成功，個人資料稍後重新整理即可
      }
      renderShop();
    } catch (err) {
      toast(err.message);
    }
  }

  async function equipItem(item) {
    try {
      await api('shop/equip', { item_id: item.item_id });
      toast('已裝備「' + item.name + '」');
      try {
        await loadMe();
      } catch (err) {
        // 裝備已成功，個人資料稍後重新整理即可
      }
      renderShop();
    } catch (err) {
      toast(err.message);
    }
  }

  /* ---------- History ---------- */

  async function renderHistory() {
    renderShell(h('div', { class: 'page' },
      h('p', { class: 'muted', text: '載入紀錄…' })
    ), 'history');

    try {
      const data = await api('history/list', { limit: 50, offset: 0 });
      state.history = data.items || [];
      state.historyTotal = Number(data.total || 0);
      renderHistoryView();
    } catch (err) {
      toast(err.message);
    }
  }

  function renderHistoryView() {
    const content = h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: '練習紀錄' }),
        h('p', { class: 'muted', text: '共 ' + state.historyTotal + ' 次完成練習' })
      ),
      state.history.length
        ? h('div', { class: 'card attempt-table' }, state.history.map(attemptRow))
        : emptyState('還沒有完成任何練習。')
    );

    renderShell(content, 'history');
  }

  /* ---------- Leaderboard ---------- */

  let leaderboardScope = 'all';

  async function renderLeaderboard() {
    renderShell(h('div', { class: 'page' },
      h('p', { class: 'muted', text: '載入排行榜…' })
    ), 'leaderboard');

    try {
      const data = await api('leaderboard', { scope: leaderboardScope });
      renderLeaderboardView(data);
    } catch (err) {
      toast(err.message);
    }
  }

  function renderLeaderboardView(data) {
    const rows = data.rows || [];
    const me = data.me;

    const tabs = h('div', { class: 'choice-group' });
    [
      { key: 'all', label: '總積分' },
      { key: 'week', label: '本週' }
    ].forEach(function (tab) {
      tabs.appendChild(h('button', {
        class: 'chip' + (leaderboardScope === tab.key ? ' active' : ''),
        type: 'button',
        onclick: function () {
          if (leaderboardScope === tab.key) return;
          leaderboardScope = tab.key;
          renderLeaderboard();
        }
      }, tab.label));
    });

    const content = h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: '排行榜' }),
        h('p', {
          class: 'muted',
          text: leaderboardScope === 'week'
            ? '本週（星期一至今）累積的練習積分'
            : '依累積總積分排名'
        })
      ),
      tabs,
      me
        ? h('div', { class: 'my-rank' },
          h('span', { class: 'my-rank-label', text: '我的名次' }),
          h('strong', { class: 'my-rank-value', text: '第 ' + me.rank + ' 名' }),
          h('span', { class: 'muted', text: '⭐ ' + me.points + ' 積分' })
        )
        : null,
      rows.length
        ? h('div', { class: 'card rank-card' }, rows.map(rankRow))
        : emptyState('目前還沒有人上榜，開始練習搶第一！')
    );

    renderShell(content, 'leaderboard');
  }

  function rankRow(row) {
    const medal = row.rank === 1 ? '🥇' : (row.rank === 2 ? '🥈' : (row.rank === 3 ? '🥉' : String(row.rank)));

    return h('div', { class: 'rank-row' + (row.is_me ? ' me' : '') },
      h('span', { class: 'rank-no', text: medal }),
      avatarEl(row.avatar_id, 'sm'),
      h('div', { class: 'rank-main' },
        h('span', { class: 'rank-name', text: row.name || '同學' }),
        h('span', { class: 'rank-class', text: row['class'] || '' })
      ),
      h('span', { class: 'rank-points', text: '⭐ ' + row.points })
    );
  }

  /* ---------- Utils ---------- */

  function typeLabel(type) {
    if (type === 'choice') return '選擇題';
    if (type === 'truefalse') return '是非題';
    return '填空題';
  }

  function formatDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /* ---------- Start ---------- */

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', boot);
})();
