/**
 * Apps Script API 封裝
 */
(function () {
  const TOKEN_KEY = 'practice_token';

  function makeError(code, message) {
    const err = new Error(message || '發生錯誤');
    err.code = code || 'ERROR';
    return err;
  }

  const API = {
    mode: (window.CONFIG && window.CONFIG.API_MODE === 'jsonp') ? 'jsonp' : 'post',

    getToken: function () {
      try {
        return localStorage.getItem(TOKEN_KEY) || '';
      } catch (err) {
        return '';
      }
    },

    setToken: function (token) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch (err) {
        // 忽略無法寫入 localStorage 的情況
      }
    },

    clearToken: function () {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (err) {
        // 忽略
      }
    },

    call: function (action, payload) {
      const body = Object.assign({}, payload || {});
      body.action = action;

      const token = this.getToken();
      if (token) body.token = token;

      if (this.mode === 'jsonp') {
        return this.callJsonp(body);
      }
      return this.callPost(body);
    },

    callPost: function (body) {
      return fetch(window.CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      }).catch(function () {
        throw makeError('NETWORK', '無法連線到伺服器，請確認網路或 API_URL 設定。');
      }).then(function (response) {
        return response.text().then(function (text) {
          let json;
          try {
            json = JSON.parse(text);
          } catch (err) {
            throw makeError('BAD_RESPONSE', '伺服器回應格式錯誤。若持續發生，請將 config.js 的 API_MODE 改為 jsonp。');
          }
          if (!json.ok) {
            throw makeError(json.code, json.message);
          }
          return json.data;
        });
      });
    },

    callJsonp: function (body) {
      return new Promise(function (resolve, reject) {
        const callbackName = '__practice_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        const script = document.createElement('script');
        let finished = false;

        function cleanup() {
          if (script.parentNode) script.parentNode.removeChild(script);
          try {
            delete window[callbackName];
          } catch (err) {
            window[callbackName] = undefined;
          }
        }

        const timer = setTimeout(function () {
          if (finished) return;
          finished = true;
          cleanup();
          reject(makeError('TIMEOUT', '伺服器回應逾時，請稍後再試。'));
        }, 25000);

        window[callbackName] = function (json) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          cleanup();
          if (!json || !json.ok) {
            reject(makeError(json && json.code, json && json.message));
          } else {
            resolve(json.data);
          }
        };

        const url = window.CONFIG.API_URL +
          '?action=' + encodeURIComponent(body.action) +
          '&payload=' + encodeURIComponent(JSON.stringify(body)) +
          '&callback=' + callbackName;

        if (url.length > 7000) {
          clearTimeout(timer);
          finished = true;
          cleanup();
          reject(makeError('PAYLOAD_TOO_LARGE', '資料量過大，無法使用 JSONP 模式。'));
          return;
        }

        script.src = url;
        script.onerror = function () {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          cleanup();
          reject(makeError('NETWORK', '無法連線到伺服器。'));
        };

        document.body.appendChild(script);
      });
    }
  };

  window.API = API;
})();
