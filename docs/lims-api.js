/**
 * lims-api.js — replaces google.script.run.
 *
 * The portals called:   run('clientHome')            → google.script.run.api(TOKEN,'clientHome',[])
 * They now call:        run('clientHome')            → POST {token, fn, args} to /exec
 *
 * Because the global run() keeps the same signature and still returns a promise,
 * the page code from Index.html and ClientPortal.html is otherwise untouched.
 */
window.LIMS = (function () {
  'use strict';

  var API_URL = window.LIMS_CONFIG.apiUrl;
  var STORE_KEY = 'lims.session';
  var LOGIN_PAGE = 'login.html';

  function session() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(STORE_KEY); }
  function token() { var s = session(); return s ? s.token : ''; }
  function homeFor(portal) { return portal === 'Client' ? 'portal.html' : 'staff.html'; }

  function send(payload) {
    return fetch(API_URL, {
      method: 'POST',
      // Must stay text/plain — anything else triggers a CORS preflight that
      // Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      var out;
      try {
        out = JSON.parse(text);
      } catch (e) {
        throw new Error('The laboratory API returned an unexpected response. Check that the deployment is published to "Anyone" and that config.js points at the current /exec URL.');
      }
      if (!out.ok) {
        var err = new Error(out.error || 'The request could not be completed.');
        err.expired = !!out.expired;
        throw err;
      }
      return out.data;
    }, function () {
      throw new Error('Could not reach the laboratory API. Check your connection.');
    });
  }

  /** Authenticated call. Mirrors api(token, fn, args) on the server. */
  function call(fn, args) {
    return send({ fn: fn, args: args || [], token: token() }).catch(function (err) {
      if (err.expired) {
        clearSession();
        if (typeof window.toast === 'function') window.toast('Session expired — sign in again', true);
        setTimeout(function () { location.replace(LOGIN_PAGE + '?expired=1'); }, 1200);
      }
      throw err;
    });
  }

  /** Unauthenticated call: bootstrap, login, register, publicClients, verify. */
  function publicCall(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return send({ fn: fn, args: args });
  }

  /** Guard for the portal pages. Sends anyone without a session to login. */
  function requireSession(expected) {
    var s = session();
    if (!s || !s.token) { location.replace(LOGIN_PAGE); return null; }
    if (expected === 'Client' && s.portal !== 'Client') { location.replace(homeFor(s.portal)); return null; }
    if (expected === 'Staff' && s.portal === 'Client') { location.replace('portal.html'); return null; }
    return s;
  }

  /** Fills every [data-lab-name] element, and the tab title. */
  function applyLabName(name) {
    var value = name || window.LIMS_CONFIG.labName;
    Array.prototype.forEach.call(document.querySelectorAll('[data-lab-name]'), function (el) {
      el.textContent = value;
    });
    document.title = value + ' — LIMS';
  }

  function loadLabName() {
    return publicCall('bootstrap').then(function (b) {
      applyLabName(b.labName);
      return b;
    }).catch(function () {
      applyLabName(null);
      return null;
    });
  }

  return {
    call: call, public: publicCall, session: session, setSession: setSession,
    clearSession: clearSession, requireSession: requireSession,
    homeFor: homeFor, applyLabName: applyLabName, loadLabName: loadLabName,
    loginPage: LOGIN_PAGE
  };
}());

// Globals the original portal code expects.
window.run = function (fn) { return window.LIMS.call(fn, Array.prototype.slice.call(arguments, 1)); };
window.APP = window.LIMS.loginPage;   // old code does window.top.location.href = APP on sign-out
window.VERIFY_URL = 'verify.html';
