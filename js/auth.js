/**
 * Google Identity Services 登入
 */
(function () {
  function waitForGoogle(callback, triesLeft, onFail) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      callback();
      return;
    }
    if (triesLeft <= 0) {
      if (onFail) onFail();
      return;
    }
    setTimeout(function () {
      waitForGoogle(callback, triesLeft - 1, onFail);
    }, 100);
  }

  const Auth = {
    mountLoginButton: function (container, onCredential, onUnavailable) {
      const clientId = window.CONFIG ? window.CONFIG.CLIENT_ID : '';

      if (!clientId || clientId.indexOf('PASTE_') === 0) {
        onUnavailable('尚未設定 Google Client ID，請編輯 docs/js/config.js。');
        return;
      }

      waitForGoogle(function () {
        try {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: onCredential,
            auto_select: false,
            cancel_on_tap_outside: true
          });
          container.innerHTML = '';
          google.accounts.id.renderButton(container, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            locale: 'zh-TW',
            width: 280
          });
        } catch (err) {
          onUnavailable('Google 登入載入失敗：' + err.message);
        }
      }, 80, function () {
        onUnavailable('無法載入 Google 登入服務，請檢查網路。');
      });
    },

    disableAutoSelect: function () {
      try {
        if (window.google && google.accounts && google.accounts.id) {
          google.accounts.id.disableAutoSelect();
        }
      } catch (err) {
        // 忽略
      }
    }
  };

  window.Auth = Auth;
})();
