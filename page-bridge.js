(function () {
  if (window.__stopotsHelperBridgeInstalled) return;
  window.__stopotsHelperBridgeInstalled = true;

  const SOURCE = "stopots-helper-bridge";
  const LETTER_RE = /^[A-Z\u00c7]$/i;
  const snapshot = {
    letter: "",
    themes: [],
    source: "",
    updatedAt: 0
  };

  function isLetter(value) {
    return LETTER_RE.test(String(value || "").trim());
  }

  function cleanLetter(value) {
    const text = String(value || "").trim().toUpperCase();
    return isLetter(text) ? text : "";
  }

  function themeToText(value) {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      const text = value.map(themeToText).find((item) => item && item.length > 1);
      return text || "";
    }
    if (value && typeof value === "object") {
      for (const key of ["name", "label", "title", "text", "theme", "category"]) {
        const text = themeToText(value[key]);
        if (text) return text;
      }
    }
    return "";
  }

  function cleanThemes(value) {
    if (!Array.isArray(value)) return [];
    const themes = [];

    for (const item of value) {
      const text = themeToText(item);
      if (!text || text.length > 50 || isLetter(text)) continue;
      if (!themes.includes(text)) themes.push(text);
      if (themes.length >= 12) break;
    }

    return themes;
  }

  function publish(partial) {
    let changed = false;

    if (partial.letter !== undefined) {
      const letter = cleanLetter(partial.letter);
      if (letter && letter !== snapshot.letter) {
        snapshot.letter = letter;
        changed = true;
      }
    }

    if (partial.themes !== undefined) {
      const themes = cleanThemes(partial.themes);
      if (themes.length && JSON.stringify(themes) !== JSON.stringify(snapshot.themes)) {
        snapshot.themes = themes;
        changed = true;
      }
    }

    if (!changed) return;

    snapshot.source = partial.source || snapshot.source || "jogo";
    snapshot.updatedAt = Date.now();

    const root = document.documentElement;
    root.dataset.stopotsHelperLetter = snapshot.letter;
    root.dataset.stopotsHelperThemes = JSON.stringify(snapshot.themes);
    root.dataset.stopotsHelperSource = snapshot.source;
    root.dataset.stopotsHelperUpdatedAt = String(snapshot.updatedAt);

    window.postMessage({ source: SOURCE, snapshot: { ...snapshot } }, "*");
  }

  function inspectArray(value, source) {
    if (!Array.isArray(value)) return;

    if (value.length >= 13 && isLetter(value[4]) && Array.isArray(value[6])) {
      publish({ letter: value[4], themes: value[6], source });
    }

    if (value.length >= 3 && isLetter(value[0]) && (typeof value[1] === "boolean" || typeof value[2] === "number")) {
      publish({ letter: value[0], source });
    }

    if (value.length === 1 && Array.isArray(value[0])) {
      const themes = cleanThemes(value[0]);
      if (themes.length >= 2) publish({ themes, source });
    }

    const directThemes = cleanThemes(value);
    if (directThemes.length >= 2 && directThemes.length === value.length) {
      publish({ themes: directThemes, source });
    }

    for (const item of value) {
      if (Array.isArray(item)) inspectArray(item, source);
    }
  }

  function parseSocketPayload(text, source) {
    if (typeof text !== "string" || !text) return;

    for (const packet of text.split("\u001e")) {
      const start = packet.indexOf("[");
      if (start < 0) continue;

      try {
        const data = JSON.parse(packet.slice(start));
        inspectArray(data, source);
      } catch (_) {
        // Ignore non JSON socket frames.
      }
    }
  }

  function watchWebSocket() {
    const NativeWebSocket = window.WebSocket;
    if (!NativeWebSocket || NativeWebSocket.__stopotsHelperWrapped) return;

    function WrappedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener("message", (event) => parseSocketPayload(event.data, "socket"));
      return socket;
    }

    WrappedWebSocket.prototype = NativeWebSocket.prototype;
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      Object.defineProperty(WrappedWebSocket, key, { value: NativeWebSocket[key] });
    }
    WrappedWebSocket.__stopotsHelperWrapped = true;

    window.WebSocket = WrappedWebSocket;
  }

  function watchFetch() {
    const nativeFetch = window.fetch;
    if (!nativeFetch || nativeFetch.__stopotsHelperWrapped) return;

    window.fetch = function (...args) {
      return nativeFetch.apply(this, args).then((response) => {
        try {
          const url = String(args[0]?.url || args[0] || "");
          if (url.includes("socket.io")) {
            response
              .clone()
              .text()
              .then((text) => parseSocketPayload(text, "polling"))
              .catch(() => {});
          }
        } catch (_) {
          // Keep the game's request path untouched.
        }

        return response;
      });
    };

    window.fetch.__stopotsHelperWrapped = true;
  }

  function watchXhr() {
    const NativeXhr = window.XMLHttpRequest;
    if (!NativeXhr || NativeXhr.__stopotsHelperWrapped) return;

    function WrappedXhr() {
      const xhr = new NativeXhr();
      xhr.addEventListener("load", () => {
        try {
          if (String(xhr.responseURL || "").includes("socket.io")) {
            parseSocketPayload(xhr.responseText, "polling");
          }
        } catch (_) {
          // Some responses are binary or inaccessible; ignore them.
        }
      });
      return xhr;
    }

    WrappedXhr.prototype = NativeXhr.prototype;
    for (const key of ["UNSENT", "OPENED", "HEADERS_RECEIVED", "LOADING", "DONE"]) {
      Object.defineProperty(WrappedXhr, key, { value: NativeXhr[key] });
    }
    WrappedXhr.__stopotsHelperWrapped = true;
    window.XMLHttpRequest = WrappedXhr;
  }

  watchWebSocket();
  watchFetch();
  watchXhr();
})();
