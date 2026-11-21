/**
 * 前端設定
 *
 * 部署前請填入以下兩個值：
 * 1. API_URL：Apps Script Web App 的 /exec 網址
 * 2. CLIENT_ID：Google Cloud Console 建立的 OAuth 用戶端 ID
 *
 * 若 GitHub Pages 呼叫 Apps Script 時發生 POST 失敗（回應格式錯誤），
 * 可將 API_MODE 改為 'jsonp'。
 */
window.CONFIG = {
  API_URL: 'https://script.google.com/a/macros/g.puiching.edu.mo/s/AKfycbwGaEnubDSDl3P-YbZRrT1iP-yqpLf0AwAswUhSiCOwQIaja3ucEoZQeXwNjp4_7hiz_Q/exec',
  CLIENT_ID: '916608657966-8h1b301locbp9v7d8klavmdmq6umrgan.apps.googleusercontent.com',
  API_MODE: 'post',
  SITE_NAME: '學生練習系統'
};
