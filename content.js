(function () {
  if (window.__matheusAurudoContentInstalled) {
    window.dispatchEvent(new CustomEvent("matheus-aurudo-show-panel"));
    return;
  }

  const helperData = window.StopotsHelperData;
  if (!helperData?.DATA || !helperData?.ALIASES) return;

  window.__matheusAurudoContentInstalled = true;

  const { DATA, ALIASES } = helperData;
  const LETTER_RE = /^[A-Z\u00c7]$/;
  const ANSWER_SELECTOR = "input[type='text'], input:not([type]), textarea";
  const BRIDGE_SOURCE = "stopots-helper-bridge";
  const PANEL_POSITION_KEY = "matheusAurudoPanelPosition";
  const LEARNED_ANSWERS_KEY = "matheusAurudoLearnedAnswers";
  const FALLBACK_ENDPOINT_KEY = "matheusAurudoFallbackEndpoint";
  const state = {
    letter: "",
    letterSource: "jogo",
    collapsed: false,
    categories: [],
    lastInjection: ""
  };
  let refreshQueued = false;
  let bridgeSnapshot = { letter: "", themes: [], source: "", updatedAt: 0 };

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const titleCase = (value) =>
    String(value || "").replace(/\b\p{L}/gu, (char) => char.toLocaleUpperCase("pt-BR"));

  function isVisible(element) {
    if (!element || element.closest("#stopots-helper")) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  function onDomReady(callback) {
    if (document.body) {
      callback();
      return;
    }

    window.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function readSavedPanelPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || "null");
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
    } catch (_) {
      // Ignore invalid saved positions.
    }
    return null;
  }

  function clampPanelPosition(panel, x, y) {
    const rect = panel.getBoundingClientRect();
    const width = rect.width || 330;
    const height = rect.height || 360;
    const padding = 8;
    const maxX = Math.max(padding, window.innerWidth - width - padding);
    const maxY = Math.max(padding, window.innerHeight - height - padding);

    return {
      x: Math.min(Math.max(padding, x), maxX),
      y: Math.min(Math.max(padding, y), maxY)
    };
  }

  function applyPanelPosition(panel, position) {
    const next = clampPanelPosition(panel, position.x, position.y);
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function savePanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    try {
      localStorage.setItem(
        PANEL_POSITION_KEY,
        JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) })
      );
    } catch (_) {
      // Local storage can be unavailable in some browser modes.
    }
  }

  function keepPanelOnScreen(panel) {
    const rect = panel.getBoundingClientRect();
    applyPanelPosition(panel, { x: rect.left, y: rect.top });
    savePanelPosition(panel);
  }

  function restorePanelPosition(panel) {
    const saved = readSavedPanelPosition();
    if (saved) applyPanelPosition(panel, saved);
  }

  function makePanelDraggable(panel) {
    const dragSurface = panel;
    let drag = null;

    dragSurface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button, input, select, textarea, a")) return;

      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.left,
        originY: rect.top
      };

      dragSurface.setPointerCapture?.(event.pointerId);
      panel.classList.add("is-dragging");
      event.preventDefault();
    });

    dragSurface.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      applyPanelPosition(panel, {
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY
      });
    });

    dragSurface.addEventListener("pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      panel.classList.remove("is-dragging");
      savePanelPosition(panel);
      dragSurface.releasePointerCapture?.(event.pointerId);
    });

    dragSurface.addEventListener("pointercancel", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      panel.classList.remove("is-dragging");
      keepPanelOnScreen(panel);
    });

    window.addEventListener("resize", () => keepPanelOnScreen(panel));
  }

  function readBridgeSnapshot() {
    const dataset = document.documentElement.dataset;
    let themes = [];

    try {
      themes = JSON.parse(dataset.stopotsHelperThemes || "[]");
    } catch (_) {
      themes = [];
    }

    bridgeSnapshot = {
      letter: String(dataset.stopotsHelperLetter || bridgeSnapshot.letter || "").toUpperCase(),
      themes: Array.isArray(themes) ? themes : bridgeSnapshot.themes,
      source: dataset.stopotsHelperSource || bridgeSnapshot.source || "",
      updatedAt: Number(dataset.stopotsHelperUpdatedAt || bridgeSnapshot.updatedAt || 0)
    };

    return bridgeSnapshot;
  }

  function uniqueWords(value) {
    return new Set(normalize(value).split(" ").filter(Boolean));
  }

  function findCategoryMatch(label) {
    const clean = normalize(label);
    if (!clean) return null;

    const words = uniqueWords(clean);
    let best = null;

    for (const [key, aliases] of Object.entries(ALIASES)) {
      let score = 0;

      for (const alias of aliases) {
        const cleanAlias = normalize(alias);
        if (!cleanAlias) continue;
        const aliasWords = cleanAlias.split(" ");

        if (clean === cleanAlias) score += 12;
        if (words.has(cleanAlias)) score += 9;
        if (clean.includes(cleanAlias) && cleanAlias.length >= 4) score += 5;
        if (aliasWords.length > 1 && aliasWords.every((word) => words.has(word))) score += 7;
      }

      if (!best || score > best.score) best = { key, score };
    }

    return best && best.score >= 5 ? best : null;
  }

  function getSuggestions(categoryKey, letter) {
    const cleanLetter = normalize(letter).charAt(0);
    const source = DATA[categoryKey] || [];
    if (!categoryKey || !source.length || !cleanLetter) return [];
    return source.filter((item) => normalize(item).startsWith(cleanLetter)).slice(0, 12);
  }

  function cleanAnswer(value) {
    return normalize(value).replace(/\s+-\s+/g, " ").trim();
  }

  function readLearnedAnswers() {
    try {
      const value = JSON.parse(localStorage.getItem(LEARNED_ANSWERS_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeLearnedAnswers(value) {
    try {
      localStorage.setItem(LEARNED_ANSWERS_KEY, JSON.stringify(value));
    } catch (_) {
      // Ignore storage quota/privacy mode issues.
    }
  }

  function isValidAnswerForLetter(value, letter) {
    const answer = cleanAnswer(value);
    const cleanLetter = normalize(letter).charAt(0);
    return answer.length >= 2 && cleanLetter && answer.startsWith(cleanLetter);
  }

  function rememberAnswer(categoryKey, letter, value) {
    const answer = cleanAnswer(value);
    const cleanLetter = normalize(letter).charAt(0);
    if (!categoryKey || !isValidAnswerForLetter(answer, cleanLetter)) return false;

    const learned = readLearnedAnswers();
    learned[categoryKey] ||= {};
    learned[categoryKey][cleanLetter] ||= [];

    const list = learned[categoryKey][cleanLetter];
    if (list.includes(answer)) return false;

    list.unshift(answer);
    learned[categoryKey][cleanLetter] = list.slice(0, 40);
    writeLearnedAnswers(learned);
    return true;
  }

  function getLearnedSuggestions(categoryKey, letter) {
    const cleanLetter = normalize(letter).charAt(0);
    const learned = readLearnedAnswers();
    const list = learned?.[categoryKey]?.[cleanLetter];
    return Array.isArray(list) ? list.slice(0, 12) : [];
  }

  function learnFromCurrentInputs() {
    if (!state.letter || !state.categories.length) return 0;

    let learned = 0;
    for (const category of state.categories) {
      const value = category.input?.value;
      if (value && rememberAnswer(category.key, state.letter, value)) learned += 1;
    }

    return learned;
  }

  function readFallbackEndpoint() {
    try {
      const endpoint = String(localStorage.getItem(FALLBACK_ENDPOINT_KEY) || "").trim();
      if (!endpoint) return "";
      const url = new URL(endpoint);
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) return "";
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function askBackgroundForFallback(endpoint, category, letter) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve("");
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "MATHEUS_AURUDO_FETCH_FALLBACK",
          endpoint,
          category: category.key,
          label: category.label,
          letter
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve("");
            return;
          }

          const answers = Array.isArray(response?.answers)
            ? response.answers
            : response?.answer
              ? [response.answer]
              : [];
          const answer = answers.find((item) => isValidAnswerForLetter(item, letter));
          resolve(answer ? cleanAnswer(answer) : "");
        }
      );
    });
  }

  async function getAnswerForCategory(category, letter) {
    const local = getSuggestions(category.key, letter)[0];
    if (local) return { answer: local, source: "banco" };

    const learned = getLearnedSuggestions(category.key, letter)[0];
    if (learned) return { answer: learned, source: "aprendido" };

    const endpoint = readFallbackEndpoint();
    if (!endpoint) return { answer: "", source: "" };

    const online = await askBackgroundForFallback(endpoint, category, letter);
    if (online) {
      rememberAnswer(category.key, letter, online);
      return { answer: online, source: "api" };
    }

    return { answer: "", source: "" };
  }

  function setFieldValue(field, value) {
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    const formatted = titleCase(value);

    field.focus({ preventScroll: true });

    if (setter) setter.call(field, formatted);
    else field.value = formatted;

    field.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: formatted,
          inputType: "insertText"
        })
      );
    } catch (_) {
      // Older browsers can reject synthetic InputEvent options.
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: formatted.slice(-1) || " " }));
  }

  async function injectAllAnswers() {
    refresh();
    learnFromCurrentInputs();

    if (!state.letter) {
      state.lastInjection = "Nao injetei: ainda nao detectei a letra.";
      render();
      return;
    }

    if (!state.categories.length) {
      state.lastInjection = "Nao injetei: ainda nao detectei as categorias.";
      render();
      return;
    }

    let injected = 0;
    let missing = 0;
    const sources = { aprendido: 0, banco: 0, api: 0 };

    for (const category of state.categories) {
      const result = await getAnswerForCategory(category, state.letter);
      const answer = result.answer;

      if (!answer || !category.input) {
        missing += 1;
        continue;
      }

      setFieldValue(category.input, answer);
      rememberAnswer(category.key, state.letter, answer);
      if (result.source && sources[result.source] !== undefined) sources[result.source] += 1;
      injected += 1;
    }

    const sourceText = Object.entries(sources)
      .filter(([, count]) => count)
      .map(([source, count]) => `${source}: ${count}`)
      .join(", ");
    state.lastInjection = injected
      ? `Injetado: ${injected}. ${sourceText ? `${sourceText}. ` : ""}Sem resposta/campo: ${missing}.`
      : "Nao encontrei respostas locais para essa rodada.";
    render();
  }

  function detectLetterFromBridge() {
    const snapshot = readBridgeSnapshot();
    if (LETTER_RE.test(snapshot.letter)) {
      return { value: snapshot.letter, source: snapshot.source || "jogo" };
    }
    return { value: "", source: "" };
  }

  function letterFromText(text) {
    const cleanText = String(text || "").trim();
    const patterns = [
      /(?:letra|letter)\s*(?:sorteada|da rodada|atual|escolhida)?\s*[:\-]?\s*([A-Z\u00c7])/i,
      /(?:com|with)\s+a?\s*(?:letra|letter)\s+([A-Z\u00c7])/i,
      /(?:round|rodada).*?\b([A-Z\u00c7])\b/i
    ];

    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) return match[1].toUpperCase();
    }

    return LETTER_RE.test(cleanText) ? cleanText.toUpperCase() : "";
  }

  function detectLetterFromPage() {
    const bridgeLetter = detectLetterFromBridge();
    if (bridgeLetter.value) return bridgeLetter;

    const selectorHits = Array.from(
      document.querySelectorAll(
        "[data-letter], [data-letra], [class*='letter'], [class*='letra'], [id*='letter'], [id*='letra']"
      )
    )
      .filter(isVisible)
      .map((element) => letterFromText(element.getAttribute("data-letter") || element.getAttribute("data-letra") || element.textContent))
      .filter(Boolean);

    if (selectorHits[0]) return { value: selectorHits[0], source: "elemento da letra" };

    const bodyLetter = letterFromText(document.body.innerText || "");
    if (bodyLetter) return { value: bodyLetter, source: "texto da pagina" };

    const randomLetter = detectRandomLetter();
    if (randomLetter) return { value: randomLetter, source: "animacao da letra" };

    const singleLetterCandidates = Array.from(document.querySelectorAll("div, span, strong, b, p"))
      .filter(isVisible)
      .map((element) => {
        const text = element.textContent.trim();
        const rect = element.getBoundingClientRect();
        const fontSize = Number.parseFloat(window.getComputedStyle(element).fontSize) || 0;
        return { text, fontSize, area: rect.width * rect.height };
      })
      .filter((item) => LETTER_RE.test(item.text) && item.fontSize >= 20)
      .sort((a, b) => b.fontSize + b.area / 1000 - (a.fontSize + a.area / 1000));

    if (singleLetterCandidates[0]) {
      return { value: singleLetterCandidates[0].text.toUpperCase(), source: "letra destacada" };
    }

    return { value: "", source: "" };
  }

  function detectRandomLetter() {
    const masks = Array.from(document.querySelectorAll(".randomLetter .mask"));

    for (const mask of masks) {
      if (!isVisible(mask)) continue;
      const maskRect = mask.getBoundingClientRect();
      const centerX = maskRect.left + maskRect.width / 2;
      const letters = Array.from(mask.querySelectorAll(".letter"))
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = element.textContent.trim();
          return {
            text,
            distance: Math.abs(rect.left + rect.width / 2 - centerX)
          };
        })
        .filter((item) => LETTER_RE.test(item.text))
        .sort((a, b) => a.distance - b.distance);

      if (letters[0]) return letters[0].text.toUpperCase();
    }

    return "";
  }

  function textWithoutControls(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("input, textarea, button, select, option, #stopots-helper").forEach((node) => node.remove());
    return clone.textContent.trim();
  }

  function labelForInput(input) {
    const direct = input.getAttribute("aria-label") || input.getAttribute("placeholder") || input.getAttribute("name");
    if (direct) return direct;

    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label && isVisible(label)) return label.textContent.trim();
    }

    const labelledBy = input.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
      if (text) return text;
    }

    const previous = input.previousElementSibling;
    if (previous && isVisible(previous)) {
      const previousText = textWithoutControls(previous);
      if (previousText) return previousText;
    }

    const row = input.closest(
      "label, li, tr, fieldset, [role='row'], [class*='category'], [class*='categoria'], [class*='answer'], [class*='resposta'], [class*='input']"
    );
    const rowText = textWithoutControls(row);
    if (rowText) return rowText;

    const parentText = textWithoutControls(input.parentElement);
    return parentText;
  }

  function inputId(input, index) {
    return input ? input.id || input.name || `input-${index}` : `bridge-${index}`;
  }

  function isLikelyAnswerInput(input) {
    if (!isVisible(input) || input.disabled || input.readOnly) return false;
    if (input.getAttribute("aria-disabled") === "true") return false;

    const type = normalize(input.getAttribute("type") || "text");
    if (["password", "email", "search", "hidden", "submit", "button"].includes(type)) return false;

    const meta = normalize(
      [
        input.id,
        input.name,
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.closest("form")?.className,
        input.closest("[class]")?.className
      ].join(" ")
    );

    const blocked = [
      "chat",
      "mensagem",
      "message",
      "senha",
      "password",
      "nick",
      "nickname",
      "nome de usuario",
      "search",
      "busca",
      "pesquisa"
    ];

    return !blocked.some((word) => meta.includes(word));
  }

  function candidateAnswerInputs() {
    return Array.from(document.querySelectorAll(ANSWER_SELECTOR))
      .filter(isLikelyAnswerInput)
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      });
  }

  function detectCategoriesFromBridge(inputs) {
    const snapshot = readBridgeSnapshot();
    if (!snapshot.themes.length) return [];

    const detected = [];

    snapshot.themes.forEach((theme, index) => {
      const match = findCategoryMatch(theme);
      if (!match || !DATA[match.key]) return;

      detected.push({
        id: `bridge-${index}-${match.key}`,
        key: match.key,
        label: theme,
        confidence: match.score + 20,
        input: inputs[index] || null
      });
    });

    return detected;
  }

  function detectCategoriesFromPage() {
    const inputs = candidateAnswerInputs();
    const bridgeDetected = detectCategoriesFromBridge(inputs);

    if (bridgeDetected.length) {
      return { detected: bridgeDetected, unknown: [], inputCount: inputs.length };
    }

    const seenKeys = new Set();
    const detected = [];
    const unknown = [];

    inputs.forEach((input, index) => {
      const label = labelForInput(input);
      const match = findCategoryMatch(label);
      const id = inputId(input, index);

      if (match && DATA[match.key] && !seenKeys.has(match.key)) {
        seenKeys.add(match.key);
        detected.push({
          id,
          key: match.key,
          label: label || match.key,
          confidence: match.score,
          input
        });
        return;
      }

      if (label) {
        unknown.push({ id, key: "", label, confidence: 0, input });
      }
    });

    return { detected, unknown, inputCount: inputs.length };
  }

  function copyOrInsert(value, categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    const active = document.activeElement;
    const focusedInput =
      active && active.matches(ANSWER_SELECTOR) && !active.closest("#stopots-helper") ? active : null;
    const target = category?.input || focusedInput;

    if (target) {
      target.focus();
      setFieldValue(target, value);
      return;
    }

    navigator.clipboard?.writeText(titleCase(value)).catch(() => {});
  }

  function createPanel() {
    const existing = document.getElementById("stopots-helper");
    if (existing) return existing;

    const panel = document.createElement("aside");
    panel.id = "stopots-helper";
    panel.innerHTML = `
      <div class="sh-header" title="Arraste para mover">
        <strong class="sh-title">MATHEUS AURUDO</strong>
        <button class="sh-collapse" type="button" title="Minimizar">-</button>
      </div>
      <div class="sh-body">
        <div class="sh-status"></div>
        <button class="sh-inject" type="button">INJETAR TUDO</button>
        <p class="sh-hint">Detecta a rodada e preenche todos os campos encontrados.</p>
      </div>
    `;
    document.documentElement.appendChild(panel);
    restorePanelPosition(panel);
    makePanelDraggable(panel);

    ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"].forEach((eventName) => {
      panel.addEventListener(eventName, (event) => event.stopPropagation());
    });

    panel.querySelector(".sh-collapse").addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      panel.classList.toggle("is-collapsed", state.collapsed);
      panel.querySelector(".sh-collapse").textContent = state.collapsed ? "+" : "-";
    });

    panel.querySelector(".sh-inject").addEventListener("click", () => {
      injectAllAnswers();
    });
    return panel;
  }

  function showPanel() {
    const panel = document.getElementById("stopots-helper") || createPanel();
    state.collapsed = false;
    panel.classList.remove("is-collapsed");
    panel.classList.add("is-highlighted");
    panel.style.display = "";
    panel.querySelector(".sh-collapse").textContent = "-";
    keepPanelOnScreen(panel);
    refresh();

    window.setTimeout(() => panel.classList.remove("is-highlighted"), 700);
  }

  function renderStatus(panel) {
    const status = panel.querySelector(".sh-status");
    const categoryCount = state.categories.length;
    const letterText = state.letter
      ? `Letra ${state.letter} (${state.letterSource})`
      : "Letra ainda nao detectada";
    const categoryText = categoryCount
      ? `${categoryCount} categoria${categoryCount === 1 ? "" : "s"} reconhecida${categoryCount === 1 ? "" : "s"}`
      : "Nenhuma categoria reconhecida";

    const injectText = state.lastInjection ? ` - ${state.lastInjection}` : "";
    status.textContent = `${letterText} - ${categoryText}${injectText}`;
  }

  function render() {
    const panel = document.getElementById("stopots-helper");
    if (!panel) return;

    renderStatus(panel);
  }

  function refresh() {
    const detectedLetter = detectLetterFromPage();
    if (detectedLetter.value) {
      state.letter = detectedLetter.value;
      state.letterSource = detectedLetter.source;
    }

    const { detected } = detectCategoriesFromPage();
    state.categories = detected;

    render();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== BRIDGE_SOURCE) return;
    bridgeSnapshot = event.data.snapshot || bridgeSnapshot;
    queueRefresh();
  });

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "MATHEUS_AURUDO_INJECT_ALL") {
        injectAllAnswers().then(() => {
          sendResponse({ message: state.lastInjection || "Comando executado." });
        });
        return true;
      }

      if (message?.type === "MATHEUS_AURUDO_SHOW_PANEL") {
        showPanel();
        sendResponse({ ok: true, message: "Painel fixado no site." });
        return true;
      }

      return false;
    });
  }

  window.addEventListener("matheus-aurudo-show-panel", showPanel);

  onDomReady(() => {
    createPanel();
    refresh();
    document.addEventListener(
      "input",
      (event) => {
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
        if (event.target.closest("#stopots-helper")) return;
        window.setTimeout(() => {
          refresh();
          learnFromCurrentInputs();
          render();
        }, 0);
      },
      true
    );
    new MutationObserver((mutations) => {
      const hasPageMutation = mutations.some((mutation) => {
        const target = mutation.target;
        return target instanceof Element ? !target.closest("#stopots-helper") : true;
      });
      if (hasPageMutation) queueRefresh();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label", "placeholder", "value"]
    });
    setInterval(refresh, 2000);
  });
})();
