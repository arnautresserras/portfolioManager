/* github-sync.js — commit portfolio.json to GitHub via the Contents API.
   The token is a fine-grained PAT (Contents: read/write on this repo only),
   kept in localStorage. It is NEVER written into portfolio.json or any commit.
   No other network calls are made by the app. */
(function (global) {
  "use strict";

  var CFG_KEY = "portfolioManager.gh.config.v1";
  var TOKEN_KEY = "portfolioManager.gh.token.v1";
  var API = "https://api.github.com";

  /* ---- config / token storage ---- */

  function getConfig() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) {}
    return {
      owner: cfg.owner || "",
      repo: cfg.repo || "",
      branch: cfg.branch || "main",
      path: cfg.path || "portfolio.json",
      message: cfg.message || ""
    };
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function clearToken() { setToken(""); }

  function isConfigured() {
    var c = getConfig();
    return !!(getToken() && c.owner && c.repo && c.path);
  }

  /* Best-effort auto-detect owner/repo from a GitHub Pages URL. */
  function detect() {
    var host = global.location.hostname || "";
    var m = host.match(/^([^.]+)\.github\.io$/i);
    var out = { owner: "", repo: "" };
    if (m) {
      out.owner = m[1];
      var seg = (global.location.pathname || "/").split("/").filter(Boolean);
      out.repo = seg.length ? seg[0] : (m[1] + ".github.io");
    }
    return out;
  }

  /* ---- helpers ---- */

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function headers() {
    return {
      "Authorization": "Bearer " + getToken(),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function contentsUrl(c) {
    return API + "/repos/" + encodeURIComponent(c.owner) + "/" +
      encodeURIComponent(c.repo) + "/contents/" +
      c.path.split("/").map(encodeURIComponent).join("/");
  }

  function friendlyError(status, body) {
    if (status === 401) return "Token rejected (401). Check the token is valid and not expired.";
    if (status === 403) return "Forbidden (403). The token may lack Contents: write on this repo, or you hit a rate limit.";
    if (status === 404) return "Not found (404). Check owner, repo, branch, and path — and that the token can access this repo.";
    if (status === 409) return "Conflict (409). The file changed on GitHub since last load.";
    if (status === 422) return "Unprocessable (422). " + ((body && body.message) || "");
    return "GitHub API error " + status + ((body && body.message) ? (": " + body.message) : "");
  }

  function parseBody(res) {
    return res.text().then(function (t) {
      try { return JSON.parse(t); } catch (e) { return { message: t }; }
    });
  }

  /* ---- API operations ---- */

  // Verify token + repo reachability. Resolves with { ok, defaultBranch }.
  function test() {
    var c = getConfig();
    if (!getToken()) return Promise.reject(new Error("No token saved."));
    if (!c.owner || !c.repo) return Promise.reject(new Error("Owner and repo are required."));
    return fetch(API + "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo),
      { headers: headers() })
      .then(function (res) {
        return parseBody(res).then(function (body) {
          if (!res.ok) throw new Error(friendlyError(res.status, body));
          return { ok: true, defaultBranch: body.default_branch };
        });
      });
  }

  // GET the file's current sha on the branch. Resolves with sha string, or null if the file doesn't exist yet.
  function getSha(c) {
    var url = contentsUrl(c) + "?ref=" + encodeURIComponent(c.branch);
    return fetch(url, { headers: headers() }).then(function (res) {
      if (res.status === 404) return null;
      return parseBody(res).then(function (body) {
        if (!res.ok) throw new Error(friendlyError(res.status, body));
        return body.sha || null;
      });
    });
  }

  // Commit new content. jsonString = full file text. Resolves with { commitUrl, sha, created }.
  function commit(jsonString, message) {
    var c = getConfig();
    if (!isConfigured()) {
      return Promise.reject(new Error("GitHub sync is not configured. Open GitHub sync settings first."));
    }
    return getSha(c).then(function (sha) {
      var payload = {
        message: message || defaultMessage(),
        content: utf8ToBase64(jsonString),
        branch: c.branch
      };
      if (sha) payload.sha = sha;
      return fetch(contentsUrl(c), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers()),
        body: JSON.stringify(payload)
      }).then(function (res) {
        return parseBody(res).then(function (body) {
          if (!res.ok) throw new Error(friendlyError(res.status, body));
          return {
            created: !sha,
            sha: body.content && body.content.sha,
            commitUrl: body.commit && body.commit.html_url
          };
        });
      });
    });
  }

  function defaultMessage() {
    return "Update portfolio.json";
  }

  global.GitHubSync = {
    getConfig: getConfig,
    saveConfig: saveConfig,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isConfigured: isConfigured,
    detect: detect,
    test: test,
    commit: commit
  };
})(window);
