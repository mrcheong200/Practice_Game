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
    timer: null,
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
    clearTimer();

    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (err) {
      // 忽略
    }

    renderLogin('已登出。');
  }

  /* ---------- Login ---------- */

  function renderLogin(message) {
    clearTimer();

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
    clearTimer();

    const profile = state.profile;
    const navItems = [
      { key: 'home', label: '首頁', hash: '#/home' },
      { key: 'practice', label: '練習', hash: '#/practice' },
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
      )
    );

    renderShell(content, 'home');
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
            index: 0,
            startedAt: Date.now()
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

  function renderQuiz() {
    clearTimer();

    const quiz = state.quiz;
    if (!quiz) {
      navigate('#/practice');
      return;
    }

    const total = quiz.questions.length;
    const question = quiz.questions[quiz.index];
    const currentAnswer = quiz.answers[question.qid] || '';

    const progressFill = h('div', { class: 'progress-fill' });
    progressFill.style.width = Math.round(((quiz.index + 1) / total) * 100) + '%';

    const answerArea = h('div', { class: 'answer-area' });

    if (question.type === 'choice' || question.type === 'truefalse') {
      question.options.forEach(function (option) {
        const optionButton = h('button', {
          class: 'option-btn' + (question.type === 'truefalse' ? ' truefalse' : '') +
            (currentAnswer === option.key ? ' selected' : ''),
          type: 'button',
          onclick: function () {
            quiz.answers[question.qid] = option.key;
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
        autocomplete: 'off'
      });
      input.addEventListener('input', function () {
        quiz.answers[question.qid] = input.value;
      });
      answerArea.appendChild(input);
    }

    const timerEl = h('span', { class: 'timer', text: '00:00' });

    const prevButton = h('button', {
      class: 'btn ghost',
      disabled: quiz.index === 0,
      onclick: function () {
        if (quiz.index > 0) {
          quiz.index--;
          renderQuiz();
        }
      }
    }, '上一題');

    const nextButton = quiz.index < total - 1
      ? h('button', {
        class: 'btn primary',
        onclick: function () {
          quiz.index++;
          renderQuiz();
        }
      }, '下一題')
      : h('button', { class: 'btn primary', onclick: submitQuiz }, '送出答案');

    const content = h('div', { class: 'page quiz-page' },
      h('div', { class: 'quiz-top' },
        h('div', { class: 'quiz-progress-text', text: '第 ' + (quiz.index + 1) + ' / ' + total + ' 題' }),
        timerEl
      ),
      h('div', { class: 'progress' }, progressFill),
      h('section', { class: 'card question-card' },
        h('div', { class: 'q-meta' },
          h('span', { class: 'tag', text: question.subject || '練習' }),
          h('span', { class: 'tag type-tag', text: typeLabel(question.type) })
        ),
        h('h2', { class: 'q-title', text: question.question }),
        answerArea
      ),
      h('div', { class: 'quiz-actions' }, prevButton, nextButton)
    );

    renderShell(content, 'practice');
    startTimer(timerEl, quiz.startedAt);
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
      navigate('#/result');
    } catch (err) {
      toast(err.message);
    } finally {
      state.busy = false;
    }
  }

  function startTimer(element, startedAt) {
    clearTimer();

    function tick() {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      element.textContent = formatDuration(seconds);
    }

    tick();
    state.timer = setInterval(tick, 1000);
  }

  function clearTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  /* ---------- Result ---------- */

  function renderResult() {
    const result = state.result;
    if (!result) {
      navigate('#/home');
      return;
    }

    const score = Math.max(0, Math.min(100, Number(result.score || 0)));

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
        h('div', { class: 'result-stats' },
          statBox('答對題數', Number(result.correct_count || 0) + ' / ' + Number(result.question_count || 0)),
          statBox('本次積分', '+' + Number(result.points_earned || 0))
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

  /* ---------- Utils ---------- */

  function typeLabel(type) {
    if (type === 'choice') return '選擇題';
    if (type === 'truefalse') return '是非題';
    return '填空題';
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(remain).padStart(2, '0');
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
