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
    busy: false,
    isTeacher: false
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

  /* ---------- Rich text（Markdown + LaTeX） ---------- */

  // $$...$$ / \[...\] 為區塊公式；$...$ / \(...\) 為行內公式
  const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\$)([^\n$]+?)\$(?!\$)/g;

  function escapeHtml(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMathHtml(tex, displayMode) {
    if (window.katex) {
      try {
        return window.katex.renderToString(String(tex).trim(), {
          displayMode: !!displayMode,
          throwOnError: false,
          strict: 'ignore'
        });
      } catch (err) {
        // 渲染失敗時退回原文
      }
    }
    return '<code class="math-raw">' + escapeHtml(tex) + '</code>';
  }

  function renderMarkdown(text) {
    const safe = escapeHtml(text);
    if (window.marked && typeof window.marked.parseInline === 'function') {
      try {
        return window.marked.parseInline(safe, { gfm: true, breaks: true });
      } catch (err) {
        // 退回純文字換行
      }
    }
    return safe.replace(/\n/g, '<br>');
  }

  function renderRichText(text) {
    const source = String(text === null || text === undefined ? '' : text);
    let html = '';
    let last = 0;
    let match;

    MATH_PATTERN.lastIndex = 0;
    while ((match = MATH_PATTERN.exec(source)) !== null) {
      html += renderMarkdown(source.slice(last, match.index));

      const tex = match[1] !== undefined ? match[1]
        : (match[2] !== undefined ? match[2]
          : (match[3] !== undefined ? match[3] : match[4]));
      const display = match[1] !== undefined || match[2] !== undefined;

      html += renderMathHtml(tex, display);
      last = MATH_PATTERN.lastIndex;
    }

    html += renderMarkdown(source.slice(last));
    return html;
  }

  function richNode(tag, attrs, text) {
    const node = h(tag, attrs);
    node.innerHTML = renderRichText(text);
    return node;
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
    state.isTeacher = !!(data.is_teacher || (data.profile && data.profile.is_teacher));
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
    stopWorld();

    if (!state.profile) {
      renderLogin(loginMessage);
      return;
    }

    const hash = location.hash || '#/home';

    if (hash === '#/world') {
      renderWorld();
    } else if (hash === '#/practice') {
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
    } else if (hash === '#/teacher') {
      if (!state.isTeacher) {
        navigate('#/home');
        return;
      }
      renderTeacher();
    } else {
      renderHome();
    }
  }

  function logout() {
    stopWorld();
    window.Auth.disableAutoSelect();
    window.API.clearToken();
    state.profile = null;
    state.quiz = null;
    state.result = null;
    state.recent = [];
    state.subjects = [];
    state.isTeacher = false;

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

    const testBlock = (window.CONFIG && window.CONFIG.TEST_LOGIN)
      ? h('div', { class: 'login-test' },
        h('div', { class: 'login-divider' }, h('span', { text: '或使用測試帳號' })),
        h('form', {
          class: 'login-form',
          onsubmit: function (event) {
            event.preventDefault();
            submitAccountLogin(event.currentTarget, messageEl);
          }
        },
          h('input', {
            class: 'text-input',
            name: 'email',
            type: 'text',
            placeholder: '測試帳號（Email）',
            autocomplete: 'username'
          }),
          h('input', {
            class: 'text-input',
            name: 'password',
            type: 'password',
            placeholder: '密碼',
            autocomplete: 'current-password'
          }),
          h('button', { class: 'btn primary', type: 'submit' }, '帳號登入')
        ),
        h('p', { class: 'login-test-note', text: '測試用帳號由老師在 Google Sheet 的 Accounts 工作表建立。' })
      )
      : null;

    const card = h('div', { class: 'login-card' },
      h('div', { class: 'login-brand' },
        h('span', { class: 'login-logo', text: '📚' }),
        h('h1', { text: (window.CONFIG && window.CONFIG.SITE_NAME) || '學生練習系統' })
      ),
      h('p', { class: 'login-sub', text: '用 Google 帳號登入，開始練習並賺取積分兌換頭像。' }),
      buttonWrap,
      testBlock,
      messageEl,
      h('p', { class: 'login-note', text: '僅限老師已開通的帳號。若無法登入，請聯絡老師。' })
    );

    app.appendChild(h('div', { class: 'login-page' }, card));

    window.Auth.mountLoginButton(buttonWrap, onGoogleCredential, function (text) {
      messageEl.textContent = text;
    });
  }

  async function submitAccountLogin(form, messageEl) {
    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      messageEl.textContent = '請輸入帳號與密碼。';
      return;
    }

    if (submitButton) submitButton.disabled = true;
    messageEl.textContent = '登入中，請稍候…';

    try {
      const data = await window.API.call('login/account', { email: email, password: password });
      window.API.setToken(data.token);
      loginMessage = '';
      await loadMe();
      messageEl.textContent = '';
      navigate('#/home');
    } catch (err) {
      messageEl.textContent = err.message;
      if (submitButton) submitButton.disabled = false;
    }
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
      { key: 'world', label: '練習', hash: '#/world' },
      { key: 'leaderboard', label: '排行', hash: '#/leaderboard' },
      { key: 'shop', label: '商店', hash: '#/shop' },
      { key: 'history', label: '紀錄', hash: '#/history' }
    ];

    if (state.isTeacher) {
      navItems.push({ key: 'teacher', label: '教師後台', hash: '#/teacher' });
    }

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
          h('button', { class: 'btn primary', onclick: function () { navigate('#/world'); } }, '開始練習'),
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

  /* ---------- Chapter / Section 對照表（顯示用，代號對應標題） ---------- */

  const CHAPTER_TITLES = {
    '1': '第一章',
    '2': '第二章',
    '3': '第三章：整式的加減',
    '4': '第四章',
    '5': '第五章'
  };

  const SECTION_TITLES = {
    '3.1': '整式',
    '3.2': '同類項',
    '3.3': '去括號與添括號',
    '3.4': '整式的加減'
  };

  function chapterLabel(ch) {
    return CHAPTER_TITLES[ch] || ('第 ' + ch + ' 章');
  }

  function sectionLabel(sec) {
    return sec + (SECTION_TITLES[sec] ? ' ' + SECTION_TITLES[sec] : '');
  }

  /**
   * 章節選擇器元件
   * 用法：
   *   const picker = buildChapterPicker();
   *   containerEl.appendChild(picker.el);
   *   await picker.load('数学');        // 科目改變時重新載入
   *   const sel = picker.getSelection(); // { chapter: '3', sections: [] } 或 { chapter:'', sections:['3.1','3.2'] }
   *
   * 勾選規則：
   * - 預設全不勾 = 全部範圍（chapter='' sections=[]）
   * - 勾整章 = 該章全部（chapter='3' sections=[]），此時忽略單節勾選
   * - 只勾單節 = 那些節（chapter='' sections=[...]）
   */
  function buildChapterPicker() {
    const container = h('div', { class: 'chapter-picker' });
    let outline = null;

    function clear() {
      while (container.firstChild) container.removeChild(container.firstChild);
      outline = null;
    }

    async function load(subject) {
      clear();
      if (!subject) return; // 全部科目時不顯示章節選擇

      container.appendChild(h('p', { class: 'muted tiny', text: '載入章節中…' }));
      let data;
      try {
        data = await api('quiz/outline', { subject: subject });
      } catch (err) {
        clear();
        container.appendChild(h('p', { class: 'muted tiny', text: '章節載入失敗：' + err.message }));
        return;
      }
      clear();
      outline = data;

      if (!data.chapters || !data.chapters.length) {
        const hint = data.uncategorized > 0
          ? '（共 ' + data.uncategorized + ' 題未標註章節）'
          : '';
        container.appendChild(h('p', { class: 'muted tiny',
          text: '此科目尚未設定章節' + hint + '，將從全部題目抽題。' }));
        return;
      }

      container.appendChild(h('p', { class: 'field-label', text: '選擇範圍（不勾 = 全部）' }));

      data.chapters.forEach(function (ch) {
        const chapterBox = h('input', { type: 'checkbox', class: 'chapter-check', 'data-chapter': ch.chapter });
        const chapterRow = h('label', { class: 'chapter-row' },
          chapterBox,
          h('span', { class: 'chapter-title', text: chapterLabel(ch.chapter) })
        );

        const sectionWrap = h('div', { class: 'section-wrap' });
        ch.sections.forEach(function (sec) {
          const secBox = h('input', {
            type: 'checkbox',
            class: 'section-check',
            'data-section': sec.section,
            'data-chapter': ch.chapter
          });
          sectionWrap.appendChild(h('label', { class: 'section-row' },
            secBox,
            h('span', { text: sectionLabel(sec.section) + '（' + sec.count + ' 題）' })
          ));

          // 勾任何一節 → 取消該章的整章勾選
          secBox.addEventListener('change', function () {
            if (secBox.checked) chapterBox.checked = false;
          });
        });

        // 勾整章 → 取消所有單節
        chapterBox.addEventListener('change', function () {
          if (chapterBox.checked) {
            Array.prototype.forEach.call(sectionWrap.querySelectorAll('.section-check'), function (cb) {
              cb.checked = false;
            });
          }
        });

        container.appendChild(chapterRow);
        container.appendChild(sectionWrap);
      });

      if (data.uncategorized > 0) {
        container.appendChild(h('p', { class: 'muted tiny',
          text: '（另有 ' + data.uncategorized + ' 題未分類題目，僅在「全部範圍」時會被抽到）' }));
      }
    }

    function getSelection() {
      if (!outline || !outline.chapters || !outline.chapters.length) {
        return { chapter: '', sections: [] };
      }

      // 1) 有勾整章 → 用整章
      const chapterChecked = container.querySelector('.chapter-check:checked');
      if (chapterChecked) {
        return { chapter: chapterChecked.getAttribute('data-chapter'), sections: [] };
      }

      // 2) 有勾單節 → 用單節清單
      const secs = [];
      Array.prototype.forEach.call(container.querySelectorAll('.section-check:checked'), function (cb) {
        secs.push(cb.getAttribute('data-section'));
      });
      if (secs.length) {
        return { chapter: '', sections: secs };
      }

      // 3) 都沒勾 → 全部
      return { chapter: '', sections: [] };
    }

    return { el: container, load: load, getSelection: getSelection };
  }

  /* ---------- Practice setup ---------- */

  function renderPracticeSetup() {
    const select = h('select', { class: 'select' });
    select.appendChild(h('option', { value: '', text: '全部科目' }));
    state.subjects.forEach(function (subject) {
      select.appendChild(h('option', { value: subject, text: subject }));
    });

    const picker = buildChapterPicker();
    select.addEventListener('change', function () {
      picker.load(select.value);
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
          const sel = picker.getSelection();
          await beginQuiz(select.value, count, sel);
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
        h('p', { class: 'muted', text: '選擇科目、章節與題數，完成後可獲得積分。' })
      ),
      h('section', { class: 'card' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label', text: '科目' }),
          select
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label', text: '章節範圍' }),
          picker.el
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label', text: '題數' }),
          countGroup
        )
      ),
      startButton
    );

    renderShell(content, 'world');

    // 預設載入第一個科目的章節（如果有的話）
    if (select.value) picker.load(select.value);
  }

  /* ---------- Quiz start (shared) ---------- */

  async function beginQuiz(subject, count, options) {
    const opts = options || {};
    const payload = { subject: subject || '', count: count };
    if (opts.chapter) payload.chapter = opts.chapter;
    if (opts.sections && opts.sections.length) payload.sections = opts.sections;

    const data = await api('quiz/start', payload);
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
  }

  /* ---------- World ---------- */

  const WORLD_TILE = 20;
  const WORLD_SCALE = 2; // 畫布內部放大倍率（等比例放大且保持像素清晰）
  const WORLD_STEP_MS = 130; // 走一格所需時間（毫秒），數字越大移動越慢

  /* 主地圖：2 個傳送門（章節入口） */
  const MAIN_MAP = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '####################'
  ];

  const MAIN_PORTALS = [
    { id: 'math-ch3', name: '第三章:整式的加減', col: 4, row: 5,
      locked: false, target: 'chapter3', spawnCol: 17, spawnRow: 11 },
    { id: 'future-ch', name: '章節 4：敬請期待', col: 15, row: 5,
      locked: true, target: null, spawnCol: 15, spawnRow: 6 }
  ];

  /* 章節地圖（代數第三章）：4 個 NPC + 出口傳送門 */
  const CHAPTER3_MAP = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..T...........T...#',
    '#.......====.......#',
    '#.......====.......#',
    '#..................#',
    '#....~~~~..........#',
    '#....~~~~..........#',
    '#..................#',
    '#..................#',
    '####################'
  ];

  const CHAPTER3_NPCS = [
    { id: 'math-rookie', name: '數學小弟', subject: '數學', col: 3, row: 2,
      color: '#fbbf24', letter: '弟', count: 5, available: true,
      line: '我只出 5 題，先熱身一下吧！' },
    { id: 'math-brother', name: '數學大哥', subject: '數學', col: 7, row: 2,
      color: '#f97316', letter: '哥', count: 10, available: true,
      line: '跟我做 10 題，看看你的實力！' },
    { id: 'math-gym', name: '數學館主', subject: '數學', col: 10, row: 2,
      color: '#dc2626', letter: '主', count: 20, available: true,
      line: '想挑戰 20 題嗎？通過就是數學高手！' },
    { id: 'trainer', name: '訓練員', subject: '', col: 14, row: 2,
      color: '#64748b', letter: '訓', available: false,
      line: '我還在學習中……' }
  ];

  const CHAPTER3_PORTALS = [
    { id: 'exit-main', name: '主地圖', col: 17, row: 10,
      locked: false, target: 'main', spawnCol: 4, spawnRow: 6 }
  ];

  const SCENES = {
    main: { title: '主地圖', map: MAIN_MAP,
      portals: MAIN_PORTALS, npcs: [],
      startCol: 10, startRow: 10 },
    chapter3: { title: '地圖_代數第三章', map: CHAPTER3_MAP,
      portals: CHAPTER3_PORTALS, npcs: CHAPTER3_NPCS,
      startCol: 17, startRow: 11 }
  };

  // 傳送門動畫幀計數（全局）
  let PORTAL_FRAME = 0;

  const WORLD_CHALLENGE_COUNT = 5;

  const WORLD_KEY_MAP = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right'
  };

  const world = {
    active: false,
    raf: 0,
    ctx: null,
    canvas: null,
    lastTime: 0,
    keys: {},
    dialogNpc: null,
    moveQueue: [],
    avatarKey: 'default',
    currentScene: 'main',
    player: {
      col: 10,
      row: 10,
      x: 0,
      y: 0,
      dir: 'up',
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      moving: false,
      elapsed: 0
    }
  };

  function getScene() { return SCENES[world.currentScene]; }
  function getSceneCols() { return getScene().map[0].length; }
  function getSceneRows() { return getScene().map.length; }
  function getSceneNpcs() { return getScene().npcs; }
  function getScenePortals() { return getScene().portals; }

  function tileAt(col, row) {
    const scene = getScene();
    if (row < 0 || row >= getSceneRows() || col < 0 || col >= getSceneCols()) return '#';
    return scene.map[row].charAt(col);
  }

  function portalAt(col, row) {
    const portals = getScenePortals();
    for (let i = 0; i < portals.length; i++) {
      if (portals[i].col === col && portals[i].row === row) return portals[i];
    }
    return null;
  }

  function isWalkable(col, row) {
    const tile = tileAt(col, row);
    if (tile === '#' || tile === 'T' || tile === '~') return false;

    // 傳送門那格可以走（踩到會自動傳送）
    // NPC 佔用格不可走
    const npcs = getSceneNpcs();
    for (let i = 0; i < npcs.length; i++) {
      if (npcs[i].col === col && npcs[i].row === row) return false;
    }
    return true;
  }

  /**
   * BFS 尋路：fromCol/fromRow → toCol/toRow
   * 回傳格子路徑陣列 [{col, row}, ...]（不含起點），找不到回傳 null
   */
  function findPath(fromCol, fromRow, toCol, toRow) {
    if (fromCol === toCol && fromRow === toRow) return [];
    // 目標本身不可走（例如 NPC 所在格），檢查其四周
    if (!isWalkable(toCol, toRow)) {
      // 找目標四相鄰可走格
      const neighbors = [
        [toCol + 1, toRow], [toCol - 1, toRow],
        [toCol, toRow + 1], [toCol, toRow - 1]
      ];
      let bestPath = null;
      for (let k = 0; k < neighbors.length; k++) {
        const nc = neighbors[k][0], nr = neighbors[k][1];
        if (!isWalkable(nc, nr)) continue;
        const p = findPath(fromCol, fromRow, nc, nr);
        if (p && (bestPath === null || p.length < bestPath.length)) bestPath = p;
      }
      return bestPath; // null 代表完全沒路
    }

    const visited = new Set();
    visited.add(fromCol + ',' + fromRow);
    const queue = [[fromCol, fromRow, []]];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (queue.length > 0) {
      const node = queue.shift();
      const col = node[0], row = node[1], path = node[2];

      for (let d = 0; d < dirs.length; d++) {
        const nc = col + dirs[d][0];
        const nr = row + dirs[d][1];
        const key = nc + ',' + nr;
        if (visited.has(key)) continue;
        if (!isWalkable(nc, nr)) continue;

        visited.add(key);
        const newPath = path.concat([{ col: nc, row: nr }]);

        if (nc === toCol && nr === toRow) return newPath;
        queue.push([nc, nr, newPath]);
      }
    }
    return null;
  }

  function renderWorld() {
    // 先清掉上一次的 animation frame & canvas 監聽，避免 transitionToScene
    // 連續呼叫 renderWorld 時殘留多個 worldFrame 迴圈造成速度倍增
    stopWorld();

    world.keys = {};
    world.dialogNpc = null;
    world.moveQueue = [];
    world.avatarKey = (state.profile && state.profile.avatar_id) || 'default';

    const scene = getScene();

    const canvas = h('canvas', {
      class: 'world-canvas',
      width: getSceneCols() * WORLD_TILE * WORLD_SCALE,
      height: getSceneRows() * WORLD_TILE * WORLD_SCALE
    });

    const dialog = h('div', { class: 'world-dialog', id: 'world-dialog', hidden: true });

    const content = h('div', { class: 'page world-page' },
      h('div', { class: 'page-head row' },
        h('div', {},
          h('h1', { text: scene.title }),
          h('p', { class: 'muted', text: scene.title === '主地圖'
            ? '走到傳送門上自動進入章節。'
            : '走到角色旁邊，按 K 或點擊互動。' })
        ),
        h('button', {
          class: 'btn ghost tiny',
          onclick: function () { navigate('#/practice'); }
        }, '直接練習')
      ),
      h('div', { class: 'world-stage' }, canvas, dialog),
      h('p', { class: 'world-hint', text: '點地圖移動／桌面方向鍵 WASD，K 確認／J 取消' }),
      h('div', { class: 'world-controls' }, buildWorldDpad(), h('button', {
        class: 'world-action',
        type: 'button',
        onclick: function () { tryInteract(); }
      }, 'A'))
    );

    renderShell(content, 'world');

    world.canvas = canvas;
    world.ctx = canvas.getContext('2d');
    world.active = true;
    world.lastTime = 0;

    // 玩家位置：若尚未設定（初始進入），用場景起點
    const player = world.player;
    if (!player._placed) {
      placePlayerAt(scene.startCol, scene.startRow);
      player._placed = true;
    } else {
      // 重新計算像素座標
      player.x = player.col * WORLD_TILE + WORLD_TILE / 2;
      player.y = player.row * WORLD_TILE + WORLD_TILE / 2;
      player.moving = false;
      player.elapsed = 0;
    }

    canvas.addEventListener('click', onWorldCanvasClick);

    // 世代編號 +1：任何舊迴圈看到 gen 不符就會自行結束
    world.frameGen = (world.frameGen || 0) + 1;
    const gen = world.frameGen;
    world.raf = requestAnimationFrame(function (t) { worldFrame(t, gen); });
  }

  function placePlayerAt(col, row) {
    const player = world.player;
    player.col = col;
    player.row = row;
    player.x = col * WORLD_TILE + WORLD_TILE / 2;
    player.y = row * WORLD_TILE + WORLD_TILE / 2;
    player.moving = false;
    player.elapsed = 0;
  }

  function transitionToScene(sceneKey, playerCol, playerRow) {
    world.currentScene = sceneKey;
    world.dialogNpc = null;
    world.moveQueue = [];
    placePlayerAt(playerCol, playerRow);
    world.player._placed = true;
    // 重建畫布與場景（renderWorld 會呼叫 stopWorld 內部處理）
    renderWorld();
  }

  function buildWorldDpad() {
    const dpad = h('div', { class: 'world-dpad' });

    [['up', '▲'], ['left', '◀'], ['down', '▼'], ['right', '▶']].forEach(function (pair) {
      const button = h('button', {
        class: 'dpad-btn dpad-' + pair[0],
        type: 'button',
        'aria-label': pair[0]
      }, pair[1]);

      button.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        world.keys[pair[0]] = true;
        world.moveQueue = []; // 人工 dpad=介入自動移動
        if (button.setPointerCapture) {
          try { button.setPointerCapture(event.pointerId); } catch (err) { /* 忽略 */ }
        }
      });

      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
        button.addEventListener(name, function () {
          world.keys[pair[0]] = false;
        });
      });

      dpad.appendChild(button);
    });

    return dpad;
  }

  function stopWorld() {
    if (world.raf) cancelAnimationFrame(world.raf);
    world.raf = 0;
    world.active = false;
    world.dialogNpc = null;
    world.keys = {};
    world.moveQueue = [];

    if (world.canvas) {
      world.canvas.removeEventListener('click', onWorldCanvasClick);
      world.canvas = null;
    }
    world.ctx = null;
  }

  /**
   * 遊戲主迴圈。
   * gen 是「世代編號」：切換場景時 renderWorld() 會 +1 並啟動新迴圈，
   * 舊迴圈在 updateWorld 之後發現 gen 不符就自動停止，避免多個迴圈並存
   * 導致角色移動與傳送門動畫速度倍增。
   */
  function worldFrame(ts, gen) {
    if (!world.active || gen !== world.frameGen) return;

    const dt = world.lastTime ? Math.min(60, ts - world.lastTime) : 16;
    world.lastTime = ts;
    updateWorld(dt);

    // updateWorld 內可能已切換場景（gen 改變），此時交棒給新迴圈
    if (!world.active || gen !== world.frameGen) return;

    drawWorld();
    world.raf = requestAnimationFrame(function (t) { worldFrame(t, gen); });
  }

  function updateWorld(dt) {
    PORTAL_FRAME++; // 傳送門動畫幀（不管是否有對話框都要動）

    const player = world.player;

    if (player.moving) {
      player.elapsed += dt;
      const ratio = Math.min(1, player.elapsed / WORLD_STEP_MS);
      player.x = player.fromX + (player.toX - player.fromX) * ratio;
      player.y = player.fromY + (player.toY - player.fromY) * ratio;

      // 這一步還沒走完就直接結束這一幀，不可以再排下一步，
      // 否則每幀都會重設起點終點而令角色越走越快（有傳送門後的速度 bug）。
      if (ratio < 1) return;

      player.moving = false;
      player.elapsed = 0;
      player.x = player.toX;
      player.y = player.toY;

      // 剛好停下時觸發待處理的傳送門
      if (player._pendingPortal && !world.dialogNpc) {
        const pt = player._pendingPortal;
        player._pendingPortal = null;
        transitionToScene(pt.target, pt.spawnCol, pt.spawnRow);
        return;
      }
    }

    if (world.dialogNpc) return;

    // 優先消化 moveQueue（點擊自動移動）
    if (world.moveQueue.length > 0) {
      if (['up', 'down', 'left', 'right'].some(function (k) { return world.keys[k]; })) {
        world.moveQueue = [];
      } else {
        const next = world.moveQueue.shift();
        stepPlayerTo(next.col, next.row);
        return;
      }
    }

    const dir = ['up', 'down', 'left', 'right'].filter(function (key) {
      return world.keys[key];
    })[0];
    if (!dir) return;

    const delta = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0]
    }[dir];

    const nextCol = player.col + delta[0];
    const nextRow = player.row + delta[1];
    if (!isWalkable(nextCol, nextRow)) return;

    stepPlayerTo(nextCol, nextRow, dir);
  }

  /** 將玩家移動一格到 nextCol/nextRow，設定動畫起點終點 */
  function stepPlayerTo(nextCol, nextRow, dir) {
    const player = world.player;
    if (!dir) {
      const dc = nextCol - player.col;
      const dr = nextRow - player.row;
      dir = dc > 0 ? 'right' : dc < 0 ? 'left' : dr > 0 ? 'down' : 'up';
    }
    player.dir = dir;
    player.col = nextCol;
    player.row = nextRow;
    player.fromX = player.x;
    player.fromY = player.y;
    player.toX = nextCol * WORLD_TILE + WORLD_TILE / 2;
    player.toY = nextRow * WORLD_TILE + WORLD_TILE / 2;
    player.moving = true;
    player.elapsed = 0;

    // 踩到傳送門：自動觸發
    const portal = portalAt(nextCol, nextRow);
    if (portal) {
      if (portal.locked) {
        toast('這裡還沒開放，敬請期待。');
      } else if (portal.target && SCENES[portal.target]) {
        // 等移動動畫結束再切場景（在 worldFrame 處理）
        player._pendingPortal = portal;
      }
    } else {
      player._pendingPortal = null;
    }
  }

  function drawWorld() {
    const ctx = world.ctx;
    if (!ctx) return;

    ctx.setTransform(WORLD_SCALE, 0, 0, WORLD_SCALE, 0, 0);

    // 1) 地磚
    for (let row = 0; row < getSceneRows(); row++) {
      for (let col = 0; col < getSceneCols(); col++) {
        drawWorldTile(ctx, col, row, tileAt(col, row));
      }
    }

    // 2) 傳送門（草地之上、NPC 之下）
    getScenePortals().forEach(function (p) {
      drawPortal(ctx, p);
    });

    // 2.5) 傳送門名稱標籤（在門上方）
    getScenePortals().forEach(function (p) {
      const cx = p.col * WORLD_TILE + WORLD_TILE / 2;
      const cy = p.row * WORLD_TILE - 24;
      ctx.font = 'bold 9px "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const name = (p.locked ? '🔒 ' : '') + (p.name || '');
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = ctx.measureText(name).width + 6;
      ctx.fillRect(cx - tw / 2, cy - 10, tw, 11);
      ctx.fillStyle = p.locked ? '#cbd5e1' : '#7dd3fc';
      ctx.fillText(name, cx, cy);
    });

    // 3) NPC
    getSceneNpcs().forEach(function (npc) {
      drawWorldNpc(ctx, npc);
    });

    // 4) 玩家
    drawWorldPlayer(ctx);
  }

  /**
   * 科幻傳送門（參考使用者 door.html），每格一個，動畫由 PORTAL_FRAME 推動
   * 以 tile 中心 (cx,cy) 為原點，視覺尺寸約 56×78（邏輯像素）
   */
  function drawPortal(ctx, p) {
    const cx = p.col * WORLD_TILE + WORLD_TILE / 2;
    const cy = p.row * WORLD_TILE + WORLD_TILE / 2;
    const frame = PORTAL_FRAME;

    if (p.locked) {
      // 鎖住的傳送門：灰色暫停版本
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 14, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(71,85,105,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', cx, cy);
      return;
    }

    // 地面陰影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 基座（小方塊）
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(cx - 16, cy + 10, 32, 6);
    ctx.fillStyle = '#3e465d';
    ctx.fillRect(cx - 13, cy + 8, 26, 3);

    // 外框立柱（簡化：左右兩側細柱）
    ctx.fillStyle = '#5d6984';
    ctx.fillRect(cx - 20, cy - 14, 4, 28);
    ctx.fillRect(cx + 16, cy - 14, 4, 28);

    // 藍色內圈光暈
    const glowAlpha = 0.45 + Math.sin(frame * 0.08) * 0.15;
    ctx.strokeStyle = 'rgba(120, 220, 255,' + glowAlpha + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();

    // 紫色外圈
    ctx.strokeStyle = 'rgba(180, 120, 255,' + (0.45 + Math.cos(frame * 0.06) * 0.12) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();

    // 能量核心（徑向漸層）
    const pulse = 9 + Math.sin(frame * 0.12) * 1.5;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, pulse);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, '#b9fbff');
    grad.addColorStop(0.55, '#64c8ff');
    grad.addColorStop(0.85, '#5d6bff');
    grad.addColorStop(1, 'rgba(70, 90, 200, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();

    // 旋轉碎片（8 個）
    for (let i = 0; i < 8; i++) {
      const angle = frame * 0.05 + i * (Math.PI * 2 / 8);
      const rx = cx + Math.cos(angle) * 13;
      const ry = cy + Math.sin(angle) * 13;
      ctx.fillStyle = i % 2 === 0 ? '#9bf7ff' : '#c18cff';
      ctx.fillRect(rx - 1, ry - 1, 2, 2);
    }

    // 中心光點
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 外框線（矩形）
    ctx.strokeStyle = '#141a26';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 22, cy - 14, 44, 30);
  }

  function drawWorldTile(ctx, col, row, tile) {
    const x = col * WORLD_TILE;
    const y = row * WORLD_TILE;

    if (tile === '~') {
      ctx.fillStyle = '#4f9fe0';
      ctx.fillRect(x, y, WORLD_TILE, WORLD_TILE);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(x + 3, y + 6, 8, 2);
      ctx.fillRect(x + 11, y + 13, 6, 2);
      return;
    }

    if (tile === '=') {
      ctx.fillStyle = '#e3cf9a';
      ctx.fillRect(x, y, WORLD_TILE, WORLD_TILE);
      ctx.fillStyle = 'rgba(180, 140, 80, 0.18)';
      ctx.fillRect(x + 4, y + 5, 3, 3);
      ctx.fillRect(x + 13, y + 14, 3, 3);
      return;
    }

    ctx.fillStyle = ((col + row) % 2 === 0) ? '#7ec850' : '#77bf4a';
    ctx.fillRect(x, y, WORLD_TILE, WORLD_TILE);

    if (tile === '#' || tile === 'T') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.beginPath();
      ctx.ellipse(x + WORLD_TILE / 2, y + WORLD_TILE - 4, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2f7d32';
      ctx.beginPath();
      ctx.arc(x + WORLD_TILE / 2, y + 10, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4c9a4c';
      ctx.beginPath();
      ctx.arc(x + WORLD_TILE / 2 - 2, y + 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWorldNpc(ctx, npc) {
    const x = npc.col * WORLD_TILE + WORLD_TILE / 2;
    const y = npc.row * WORLD_TILE + WORLD_TILE / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(npc.letter, x, y + 1);

    if (isAdjacentToPlayer(npc)) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y - 14, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('!', x, y - 13);
    }
  }

  function drawWorldPlayer(ctx) {
    const player = world.player;
    const x = player.x;
    const y = player.y;

    // 影子
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 玩家頭像（取自學生目前裝備的頭像）
    const avatars = window.AVATARS || {};
    const avatar = avatars[world.avatarKey] || avatars.default;

    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fffdf2';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();

    if (avatar && avatar.emoji) {
      ctx.font = '12px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatar.emoji, x, y + 1);
    }

    // 面向指示（小箭頭）
    const dir = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0]
    }[player.dir] || [0, -1];

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(x + dir[0] * 12, y + dir[1] * 12);
    ctx.lineTo(x + dir[0] * 8 - dir[1] * 2.5, y + dir[1] * 8 + dir[0] * 2.5);
    ctx.lineTo(x + dir[0] * 8 + dir[1] * 2.5, y + dir[1] * 8 - dir[0] * 2.5);
    ctx.closePath();
    ctx.fill();
  }

  function isAdjacentToPlayer(npc) {
    return Math.abs(npc.col - world.player.col) +
      Math.abs(npc.row - world.player.row) === 1;
  }

  function adjacentNpc() {
    const npcs = getSceneNpcs();
    for (let i = 0; i < npcs.length; i++) {
      if (isAdjacentToPlayer(npcs[i])) return npcs[i];
    }
    return null;
  }

  function tryInteract() {
    if (!world.active || world.dialogNpc) return;

    // 傳送門已在 stepPlayerTo 自動處理，這裡只處理 NPC 對話
    const npc = adjacentNpc();
    if (npc) {
      openWorldDialog(npc);
    } else {
      toast('再走近一點，才能互動。');
    }
  }

  /**
   * 兩階段對話框：
   *   mode='ask'  → 顯示 NPC 台詞 + 「是，開始挑戰」/「否，先逛逛」
   *   mode='pick' → 顯示章節選擇器 + 「開始」/「返回」
   * K 鍵在 ask 模式 = 進入 pick；在 pick 模式 = 開始挑戰。
   * J 鍵在 ask 模式 = 關閉；在 pick 模式 = 回到 ask。
   */
  function openWorldDialog(npc, mode) {
    const box = document.getElementById('world-dialog');
    if (!box) return;

    world.dialogNpc = npc;
    world.dialogMode = mode || 'ask';
    world.keys = {};
    clearNode(box);

    box.appendChild(h('span', { class: 'world-dialog-name', text: npc.name }));

    if (world.dialogMode === 'ask') {
      box.appendChild(h('p', { class: 'world-dialog-text', text: npc.line }));

      if (npc.available === false) {
        // 尚未開放挑戰的 NPC（例如訓練員）
        box.appendChild(h('div', { class: 'world-dialog-actions' },
          h('button', {
            class: 'btn ghost tiny',
            type: 'button',
            onclick: closeWorldDialog
          }, '關閉')
        ));
        box.appendChild(h('span', { class: 'world-dialog-shortcuts' },
          h('kbd', { text: 'K' }), ' 關閉 ',
          h('kbd', { text: 'J' }), ' 關閉'
        ));
      } else {
        box.appendChild(h('div', { class: 'world-dialog-actions' },
          h('button', {
            class: 'btn primary tiny',
            type: 'button',
            onclick: function () { openWorldDialog(npc, 'pick'); }
          }, '是，開始挑戰'),
          h('button', {
            class: 'btn ghost tiny',
            type: 'button',
            onclick: closeWorldDialog
          }, '否，先逛逛')
        ));
        box.appendChild(h('span', { class: 'world-dialog-shortcuts' },
          h('kbd', { text: 'K' }), ' 確認 ',
          h('kbd', { text: 'J' }), ' 取消'
        ));
      }
    } else {
      // pick 模式：載入章節選擇器
      box.appendChild(h('p', { class: 'world-dialog-text', text: '想練哪一課呢？' }));

      const picker = buildChapterPicker();
      world.dialogPicker = picker;
      box.appendChild(picker.el);
      picker.load(npc.subject);

      box.appendChild(h('div', { class: 'world-dialog-actions' },
        h('button', {
          class: 'btn primary tiny',
          type: 'button',
          onclick: function () { confirmWorldChallenge(); }
        }, '開始挑戰'),
        h('button', {
          class: 'btn ghost tiny',
          type: 'button',
          onclick: function () { openWorldDialog(npc, 'ask'); }
        }, '返回')
      ));
      box.appendChild(h('span', { class: 'world-dialog-shortcuts' },
        h('kbd', { text: 'K' }), ' 開始 ',
        h('kbd', { text: 'J' }), ' 返回'
      ));
    }

    box.hidden = false;
  }

  function closeWorldDialog() {
    world.dialogNpc = null;
    world.dialogMode = null;
    world.dialogPicker = null;
    const box = document.getElementById('world-dialog');
    if (!box) return;
    box.hidden = true;
    clearNode(box);
  }

  /** 在 pick 模式按 K 或「開始挑戰」時觸發：拿 picker 的選擇，帶入 beginQuiz */
  async function confirmWorldChallenge() {
    const npc = world.dialogNpc;
    const picker = world.dialogPicker;
    if (!npc) return;
    const sel = picker ? picker.getSelection() : { chapter: '', sections: [] };
    closeWorldDialog();
    await startWorldChallenge(npc, sel);
  }

  async function startWorldChallenge(npc, selection) {
    if (state.busy) return;
    state.busy = true;

    try {
      await beginQuiz(npc.subject, npc.count || WORLD_CHALLENGE_COUNT, selection);
    } catch (err) {
      toast(err.message);
    } finally {
      state.busy = false;
    }
  }

  function onWorldCanvasClick(event) {
    if (!world.active || !world.canvas) return;

    const rect = world.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (world.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (world.canvas.height / rect.height);
    const col = Math.floor(x / (WORLD_TILE * WORLD_SCALE));
    const row = Math.floor(y / (WORLD_TILE * WORLD_SCALE));

    // 1) NPC 命中 → 自動走到旁邊（旁邊就直接對話）
    const npcs = getSceneNpcs();
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc.col !== col || npc.row !== row) continue;

      if (world.dialogNpc) return;
      if (isAdjacentToPlayer(npc)) {
        openWorldDialog(npc);
      } else {
        const path = findPath(world.player.col, world.player.row, npc.col, npc.row);
        if (path && path.length > 0) world.moveQueue = path;
        else toast('無法走到' + npc.name + '旁邊。');
      }
      return;
    }

    // 2) 傳送門命中 → 自動走到門上（踩到會自動傳送）
    const portal = portalAt(col, row);
    if (portal) {
      if (world.dialogNpc) return;
      const path = findPath(world.player.col, world.player.row, col, row);
      if (path && path.length > 0) world.moveQueue = path;
      else if (world.player.col === col && world.player.row === row) {
        // 已在門上但還沒傳送（例如鎖住的門剛好站上去）
        if (portal.locked) toast('這裡還沒開放，敬請期待。');
      } else {
        toast('無法走到傳送門上。');
      }
      return;
    }

    // 3) 對話框開啟時，點地圖=嘗試關閉
    if (world.dialogNpc) {
      closeWorldDialog();
      return;
    }

    // 3) 檢查點到的格是否可行走
    const tile = tileAt(col, row);
    if (tile === '#') { toast('那裡是邊界。'); return; }
    if (tile === 'T') { toast('樹擋住了去路。'); return; }
    if (tile === '~') { toast('水太深，過不去。'); return; }

    if (col === world.player.col && row === world.player.row) return;

    const path = findPath(world.player.col, world.player.row, col, row);
    if (path === null) {
      toast('那裡走不過去。');
      return;
    }
    if (path.length === 0) return;

    world.moveQueue = path;
  }

  document.addEventListener('keydown', function (event) {
    if (!world.active) return;

    const dir = WORLD_KEY_MAP[event.key];
    if (dir) {
      world.keys[dir] = true;
      world.moveQueue = []; // 人工方向鍵=介入自動移動
      event.preventDefault();
      return;
    }

    // K / k — 確認（對話框 ask 模式=進入 pick；pick 模式=開始挑戰；否則=互動 NPC）
    if (event.key === 'k' || event.key === 'K') {
      if (world.dialogNpc) {
        if (world.dialogMode === 'pick') {
          if (!event.repeat) confirmWorldChallenge();
        } else if (world.dialogNpc.available === false) {
          closeWorldDialog(); // 尚未開放的 NPC，K 直接關閉
        } else {
          openWorldDialog(world.dialogNpc, 'pick');
        }
      } else {
        if (!event.repeat) tryInteract();
      }
      event.preventDefault();
      return;
    }

    // J / j — 取消（ask 模式=關閉；pick 模式=返回 ask）
    if (event.key === 'j' || event.key === 'J') {
      if (world.dialogNpc) {
        if (world.dialogMode === 'pick') {
          openWorldDialog(world.dialogNpc, 'ask');
        } else {
          closeWorldDialog();
        }
      }
      event.preventDefault();
      return;
    }

    // 保留 A / Space / Enter / Z 作為互動備用鍵
    if (event.key === 'a' || event.key === 'A' ||
        event.key === ' ' || event.key === 'Enter' ||
        event.key === 'z' || event.key === 'Z') {
      if (world.dialogNpc) return;
      if (!event.repeat) tryInteract();
      event.preventDefault();
    }
  });

  document.addEventListener('keyup', function (event) {
    if (!world.active) return;

    const dir = WORLD_KEY_MAP[event.key];
    if (dir) {
      world.keys[dir] = false;
      event.preventDefault();
    }
  });

  window.addEventListener('blur', function () {
    world.keys = {};
  });

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
          richNode('h2', { class: 'q-title' }, question.question),
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
          richNode('span', { class: 'option-text' }, option.text)
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

    renderShell(content, 'world');
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
          h('button', { class: 'btn ghost', onclick: function () { navigate('#/world'); } }, '回到地圖'),
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

    renderShell(content, 'world');
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
        richNode('span', { class: 'review-q' }, detail.question)
      ),
      h('div', { class: 'review-answers' },
        richNode('span', null, '你的答案：' + (detail.student_answer || '（未作答）')),
        richNode('span', null, '正確答案：' + detail.correct_answer)
      ),
      detail.explanation
        ? richNode('p', { class: 'review-explanation' }, '解析：' + detail.explanation)
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

  /* ---------- Teacher dashboard ---------- */

  const teacherFilters = { 'class': '', subject: '', from: '', to: '' };
  let teacherRows = [];
  let teacherClassOptions = [];
  let teacherSubjectOptions = [];
  let teacherLoading = false;

  async function renderTeacher() {
    teacherLoading = true;
    renderShell(teacherPage(), 'teacher');
    await refreshTeacherSummary();
  }

  async function refreshTeacherSummary() {
    teacherLoading = true;
    try {
      const data = await api('teacher/summary', teacherFilters);
      teacherRows = data.students || [];
      teacherClassOptions = data.classes || [];
      teacherSubjectOptions = data.subjects || [];
    } catch (err) {
      toast(err.message);
    }
    teacherLoading = false;
    renderShell(teacherPage(), 'teacher');
  }

  function teacherPage() {
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('h1', { text: '教師後台' }),
        h('p', { class: 'muted', text: '每位學生一列，查看練習次數、平均分數、最高分數與最後練習時間。' })
      ),
      h('section', { class: 'card' },
        teacherFilterBar(),
        h('div', { class: 'teacher-actions' },
          h('span', { class: 'muted', text: teacherLoading ? '載入中…' : '共 ' + teacherRows.length + ' 位學生' }),
          h('div', { class: 'teacher-action-btns' },
            h('button', {
              class: 'btn tiny ghost',
              onclick: function () { refreshTeacherSummary(); }
            }, '重新整理'),
            h('button', {
              class: 'btn tiny ghost',
              onclick: downloadTeacherCsv
            }, '下載 CSV'),
            h('button', {
              class: 'btn tiny primary',
              onclick: copyTeacherTable
            }, '複製到 Excel')
          )
        ),
        teacherRows.length
          ? teacherTable()
          : emptyState('沒有符合條件的學生。')
      )
    );
  }

  function teacherFilterBar() {
    const classSelect = h('select', { class: 'teacher-select' },
      h('option', { value: '' }, '全部班別')
    );
    teacherClassOptions.forEach(function (item) {
      classSelect.appendChild(h('option', { value: item }, item));
    });
    classSelect.value = teacherFilters['class'];
    classSelect.addEventListener('change', function () {
      teacherFilters['class'] = classSelect.value;
      refreshTeacherSummary();
    });

    const subjectSelect = h('select', { class: 'teacher-select' },
      h('option', { value: '' }, '全部科目')
    );
    teacherSubjectOptions.forEach(function (item) {
      subjectSelect.appendChild(h('option', { value: item }, item));
    });
    subjectSelect.value = teacherFilters.subject;
    subjectSelect.addEventListener('change', function () {
      teacherFilters.subject = subjectSelect.value;
      refreshTeacherSummary();
    });

    const fromInput = h('input', { class: 'teacher-input', type: 'date' });
    fromInput.value = teacherFilters.from;
    fromInput.addEventListener('change', function () {
      teacherFilters.from = fromInput.value;
      refreshTeacherSummary();
    });

    const toInput = h('input', { class: 'teacher-input', type: 'date' });
    toInput.value = teacherFilters.to;
    toInput.addEventListener('change', function () {
      teacherFilters.to = toInput.value;
      refreshTeacherSummary();
    });

    return h('div', { class: 'teacher-filters' },
      h('label', { class: 'teacher-field' }, h('span', { text: '班別' }), classSelect),
      h('label', { class: 'teacher-field' }, h('span', { text: '科目' }), subjectSelect),
      h('label', { class: 'teacher-field' }, h('span', { text: '開始日期' }), fromInput),
      h('label', { class: 'teacher-field' }, h('span', { text: '結束日期' }), toInput),
      h('button', {
        class: 'btn tiny ghost teacher-reset',
        onclick: resetTeacherFilters
      }, '重設')
    );
  }

  function teacherTable() {
    const tbody = h('tbody');

    teacherRows.forEach(function (row) {
      tbody.appendChild(h('tr', null,
        h('td', null,
          h('span', { class: 'teacher-name', text: row.name || row.email }),
          h('span', { class: 'teacher-email', text: row.email })
        ),
        h('td', { text: row['class'] || '—' }),
        h('td', { class: 'num', text: row.attempts }),
        h('td', { class: 'num', text: row.attempts ? row.avg_score : '—' }),
        h('td', { class: 'num', text: row.attempts ? row.best_score : '—' }),
        h('td', { text: formatTeacherDate(row.last_practice) })
      ));
    });

    return h('div', { class: 'teacher-table-wrap' },
      h('table', { class: 'teacher-table' },
        h('thead', null,
          h('tr', null,
            h('th', { text: '學生' }),
            h('th', { text: '班別' }),
            h('th', { class: 'num', text: '練習次數' }),
            h('th', { class: 'num', text: '平均分數' }),
            h('th', { class: 'num', text: '最高分數' }),
            h('th', { text: '最後練習' })
          )
        ),
        tbody
      )
    );
  }

  function teacherTableMatrix() {
    const matrix = [['學生', '班別', '電郵', '練習次數', '平均分數', '最高分數', '最後練習']];

    teacherRows.forEach(function (row) {
      matrix.push([
        row.name || '',
        row['class'] || '',
        row.email || '',
        row.attempts,
        row.attempts ? row.avg_score : '',
        row.attempts ? row.best_score : '',
        formatTeacherDate(row.last_practice)
      ]);
    });

    return matrix;
  }

  function copyTeacherTable() {
    if (!teacherRows.length) {
      toast('目前沒有資料可複製。');
      return;
    }

    const text = teacherTableMatrix().map(function (row) {
      return row.join('\t');
    }).join('\n');

    function done() {
      toast('已複製，可直接貼到 Excel。');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        if (fallbackCopy(text)) done();
        else toast('複製失敗，請改用「下載 CSV」。');
      });
      return;
    }

    if (fallbackCopy(text)) done();
    else toast('複製失敗，請改用「下載 CSV」。');
  }

  function fallbackCopy(text) {
    const area = h('textarea', { class: 'copy-area' });
    area.value = text;
    document.body.appendChild(area);
    area.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }

    document.body.removeChild(area);
    return ok;
  }

  function downloadTeacherCsv() {
    if (!teacherRows.length) {
      toast('目前沒有資料可下載。');
      return;
    }

    const lines = teacherTableMatrix().map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');

    const blob = new Blob(['\ufeff' + lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '學生練習彙總_' + teacherStamp() + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function teacherStamp() {
    const now = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
  }

  function formatTeacherDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function resetTeacherFilters() {
    teacherFilters['class'] = '';
    teacherFilters.subject = '';
    teacherFilters.from = '';
    teacherFilters.to = '';
    refreshTeacherSummary();
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
