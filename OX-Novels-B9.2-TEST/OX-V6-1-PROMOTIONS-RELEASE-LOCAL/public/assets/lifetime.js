(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    site: null,
    session: { loggedIn: false, user: null },
    stories: [],
    filtered: [],
    selectedStory: null,
    genreFilter: "all",
    genreMenuOpen: false,
    busy: false,
    googleClientId: ""
  };

  const els = {
    brandName: $(".brand-name"), brandMark: $(".brand-mark"), miniLogo: $(".mini-logo"),
    headerSearch: $("#headerSearch"), searchInput: $("#storySearch"), searchToggle: $("#searchToggle"), searchClose: $("#searchClose"),
    siteMenuToggle: $("#siteMenuToggle"), siteMenuPopover: $("#siteMenuPopover"), siteMenuSummary: $("#siteMenuSummary"), loginButton: $("#loginButton"),
    storyTotal: $("#storyTotal"), allStoriesFilter: $("#allStoriesFilter"), genreFilterToggle: $("#genreFilterToggle"), genreMenu: $("#genreMenu"),
    storyLoadError: $("#storyLoadError"), retryStories: $("#retryStories"), emptyState: $("#emptyState"), galleryGrid: $("#galleryGrid"),
    storyDialog: $("#storyDialog"), storyDialogClose: $("#storyDialogClose"), dialogCoverWrap: $("#dialogCoverWrap"), dialogCover: $("#dialogCover"),
    dialogCategory: $("#dialogCategory"), dialogTitle: $("#dialogTitle"), dialogDescription: $("#dialogDescription"), dialogStatus: $("#dialogStatus"),
    dialogStatusText: $("#dialogStatusText"), dialogAction: $("#dialogAction"), dialogNote: $("#lifetimeDialogNote"),
    loginDialog: $("#loginDialog"), loginDialogClose: $("#loginDialogClose"), loginTitle: $("#loginTitle"), googleButton: $("#googleSignInButton"), authError: $("#authError"),
    toast: $("#toast")
  };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed (${response.status}).`);
      error.code = payload.code || "";
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3000);
  }

  function setDialogNote(message = "", type = "") {
    els.dialogNote.textContent = message;
    els.dialogNote.classList.toggle("is-good", type === "good");
    els.dialogNote.classList.toggle("is-error", type === "error");
  }

  function applySite(site = {}) {
    state.site = site;
    const appearance = site.appearance || {};
    const siteName = String(appearance.name || "OX Novels").trim() || "OX Novels";
    const words = siteName.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase() : siteName.slice(0, 2).toUpperCase();
    const compact = words.length > 1 && words[0].toUpperCase() === initials ? words.slice(1).join(" ") : siteName;
    document.title = `${siteName} — Lifetime Story Access`;
    els.brandName.textContent = compact;
    const accent = /^#[0-9a-fA-F]{6}$/.test(appearance.accent || "") ? appearance.accent : "#13c3b3";
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-dark", `color-mix(in srgb, ${accent} 76%, #000)`);
    root.style.setProperty("--accent-light", `color-mix(in srgb, ${accent} 58%, #fff)`);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 12%, #fff)`);
    root.style.setProperty("--focus", `color-mix(in srgb, ${accent} 70%, #000)`);
    const logo = String(appearance.logo || "").trim();
    for (const element of [els.brandMark, els.miniLogo]) {
      if (!element) continue;
      element.hidden = !logo;
      element.classList.toggle("has-custom-image", Boolean(logo));
      element.style.backgroundImage = logo ? `url("${logo.replaceAll('"', '%22')}")` : "";
      element.textContent = "";
    }
    if (els.loginTitle) els.loginTitle.textContent = `Continue to ${siteName}`;
  }

  function updateAccountMenu() {
    const user = state.session.user || {};
    if (state.session.loggedIn) {
      els.siteMenuSummary.innerHTML = `<strong>${escapeHtml(user.name || "Member")}</strong><span>${escapeHtml(user.email || "Signed in")}</span>`;
      els.loginButton.textContent = "Back to Stories";
    } else {
      els.siteMenuSummary.innerHTML = "<strong>Guest</strong><span>Sign in after selecting a story.</span>";
      els.loginButton.textContent = "Continue with Google";
    }
  }

  function normalizeSearchText(value = "") {
    return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function normalizedGenre(value = "") {
    const text = String(value || "").trim();
    return text && !["unknown", "unverified", "audio story"].includes(text.toLowerCase()) ? text : "Unverified";
  }

  function availableGenres() {
    const seen = new Map();
    state.stories.forEach(story => {
      const genre = normalizedGenre(story.genre);
      if (genre === "Unverified") return;
      const key = genre.toLowerCase();
      if (!seen.has(key)) seen.set(key, genre);
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function renderGenreFilters() {
    const genres = availableGenres();
    if (state.genreFilter !== "all" && !genres.some(item => item.toLowerCase() === state.genreFilter.toLowerCase())) state.genreFilter = "all";
    els.allStoriesFilter.classList.toggle("active", state.genreFilter === "all");
    els.allStoriesFilter.setAttribute("aria-pressed", String(state.genreFilter === "all"));
    const selected = state.genreFilter === "all" ? "Genres" : state.genreFilter;
    els.genreFilterToggle.innerHTML = `${escapeHtml(selected)} <span class="genre-chevron" aria-hidden="true"></span>`;
    els.genreFilterToggle.classList.toggle("active", state.genreFilter !== "all");
    els.genreFilterToggle.setAttribute("aria-expanded", String(state.genreMenuOpen));
    els.genreMenu.hidden = !state.genreMenuOpen;
    els.genreMenu.innerHTML = genres.map(genre => `<button type="button" class="genre-option${state.genreFilter.toLowerCase() === genre.toLowerCase() ? " active" : ""}" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</button>`).join("");
  }

  function applyStoryFilters() {
    const query = normalizeSearchText(els.searchInput.value || "");
    state.filtered = state.stories.filter(story => {
      const genreMatch = state.genreFilter === "all" || normalizedGenre(story.genre).toLowerCase() === state.genreFilter.toLowerCase();
      return genreMatch && (!query || normalizeSearchText(story.title).includes(query));
    });
    renderGallery();
  }

  function renderSkeletons() {
    els.galleryGrid.setAttribute("aria-busy", "true");
    els.galleryGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="story-skeleton" aria-hidden="true"></div>').join("");
  }

  function renderGallery() {
    els.storyTotal.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "story" : "stories"}`;
    els.emptyState.hidden = state.filtered.length !== 0;
    els.galleryGrid.setAttribute("aria-busy", "false");
    els.galleryGrid.innerHTML = state.filtered.map((story, index) => `
      <button class="gallery-item${story.purchased ? " is-owned" : ""}" type="button" data-story-id="${escapeHtml(story.id)}" aria-label="Open ${escapeHtml(story.title)}" title="${escapeHtml(story.title)}">
        <img src="${escapeHtml(story.cover || "")}" alt="${escapeHtml(story.title)} cover" ${index < 8 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false">
        <span class="cover-fallback" aria-hidden="true"><strong>OX</strong><span>Story Cover</span><small>${escapeHtml(story.title)}</small></span>
      </button>`).join("");

    $$(".gallery-item", els.galleryGrid).forEach(button => {
      const image = $("img", button);
      const loaded = () => button.classList.add("image-loaded");
      const failed = () => { button.classList.add("image-failed"); image.hidden = true; };
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", failed, { once: true });
      if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    });
  }

  function updateStoryUrl(storyId = "") {
    const url = new URL(location.href);
    if (storyId) url.searchParams.set("story", storyId); else url.searchParams.delete("story");
    url.searchParams.delete("paypal"); url.searchParams.delete("token"); url.searchParams.delete("PayerID");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function openDialog(dialog) {
    dialog.hidden = false;
    document.body.classList.add("dialog-open");
    requestAnimationFrame(() => $("[role='dialog']", dialog)?.focus());
  }

  function closeDialog(dialog) {
    dialog.hidden = true;
    if (els.storyDialog.hidden && els.loginDialog.hidden) document.body.classList.remove("dialog-open");
  }

  function refreshStoryDialog() {
    const story = state.selectedStory;
    if (!story) return;
    els.dialogCoverWrap.classList.remove("image-failed");
    els.dialogCover.hidden = false;
    els.dialogCover.src = story.cover || "";
    els.dialogCover.alt = `${story.title} cover`;
    els.dialogCover.onerror = () => { els.dialogCoverWrap.classList.add("image-failed"); };
    els.dialogCategory.textContent = normalizedGenre(story.genre);
    els.dialogTitle.textContent = story.title;
    els.dialogDescription.textContent = story.description || "Full audio story available for lifetime access.";
    els.dialogAction.disabled = false;
    setDialogNote("");

    if (story.purchased) {
      els.dialogStatus.classList.add("active");
      els.dialogStatusText.textContent = "Lifetime access active ✓";
      els.dialogAction.textContent = "Listen to Story";
      els.dialogAction.dataset.action = "listen";
    } else if (!story.purchasable) {
      els.dialogStatus.classList.remove("active");
      els.dialogStatusText.textContent = "Lifetime purchase temporarily unavailable";
      els.dialogAction.textContent = "Unavailable";
      els.dialogAction.dataset.action = "none";
      els.dialogAction.disabled = true;
    } else if (!state.session.loggedIn) {
      els.dialogStatus.classList.remove("active");
      els.dialogStatusText.textContent = "Sign in before purchasing this story";
      els.dialogAction.textContent = "Continue with Google";
      els.dialogAction.dataset.action = "login";
    } else {
      els.dialogStatus.classList.add("active");
      els.dialogStatusText.textContent = "$49 one-time · permanent access to this story";
      els.dialogAction.textContent = "Purchase This Story — $49";
      els.dialogAction.dataset.action = "pay";
    }
  }

  function selectStory(storyId, { open = true } = {}) {
    const story = state.stories.find(item => item.id === storyId);
    if (!story) return;
    state.selectedStory = story;
    updateStoryUrl(story.id);
    refreshStoryDialog();
    if (open) openDialog(els.storyDialog);
  }

  let googleLoadPromise = null;
  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google);
    if (googleLoadPromise) return googleLoadPromise;
    googleLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true; script.defer = true;
      script.onload = () => window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google sign-in did not initialize."));
      script.onerror = () => reject(new Error("Unable to load Google sign-in."));
      document.head.appendChild(script);
    });
    return googleLoadPromise;
  }

  async function finishGoogle(response) {
    const credential = String(response?.credential || "");
    if (!credential) return;
    els.authError.hidden = true;
    els.googleButton.classList.add("is-processing");
    els.googleButton.textContent = "Signing you in…";
    try {
      await fetchJson("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
      await refreshSessionAndCatalog();
      closeDialog(els.loginDialog);
      refreshStoryDialog();
      showToast("Signed in. Your selected story is ready.");
    } catch (error) {
      els.authError.textContent = error.message || "Unable to continue with Google.";
      els.authError.hidden = false;
      await renderGoogleButton(true);
    } finally {
      els.googleButton.classList.remove("is-processing");
    }
  }

  async function renderGoogleButton(keepError = false) {
    if (!keepError) els.authError.hidden = true;
    els.googleButton.textContent = "Loading Google sign-in…";
    try {
      const [config] = await Promise.all([fetchJson("/api/auth/google/config"), loadGoogle()]);
      if (!config.enabled || !config.clientId) throw new Error("Google sign-in is not configured yet.");
      if (state.googleClientId !== config.clientId) {
        window.google.accounts.id.initialize({ client_id: config.clientId, callback: finishGoogle, ux_mode: "popup" });
        state.googleClientId = config.clientId;
      }
      els.googleButton.innerHTML = "";
      const width = Math.max(240, Math.min(360, Math.round(els.googleButton.getBoundingClientRect().width || 300)));
      window.google.accounts.id.renderButton(els.googleButton, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", logo_alignment: "left", width });
    } catch (error) {
      els.googleButton.innerHTML = "";
      els.authError.textContent = error.message || "Google sign-in is unavailable.";
      els.authError.hidden = false;
    }
  }

  function openLogin() {
    if (state.session.loggedIn) return;
    openDialog(els.loginDialog);
    void renderGoogleButton();
  }

  async function refreshSessionAndCatalog() {
    const [session, catalog] = await Promise.all([fetchJson("/api/session"), fetchJson("/api/story-purchases/catalog")]);
    const selectedId = state.selectedStory?.id || new URL(location.href).searchParams.get("story") || "";
    state.session = session;
    state.stories = Array.isArray(catalog.stories) ? catalog.stories : [];
    state.selectedStory = state.stories.find(item => item.id === selectedId) || null;
    state.filtered = [...state.stories];
    updateAccountMenu();
    renderGenreFilters();
    applyStoryFilters();
  }

  async function beginPayment() {
    const story = state.selectedStory;
    if (!story || state.busy) return;
    state.busy = true;
    els.dialogAction.disabled = true;
    const originalText = els.dialogAction.textContent;
    els.dialogAction.textContent = "Preparing secure PayPal checkout…";
    setDialogNote("");
    try {
      const result = await fetchJson("/api/story-purchases/create-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId: story.id }) });
      if (result.alreadyPurchased) {
        await refreshSessionAndCatalog();
        refreshStoryDialog();
        setDialogNote("Already Purchased ✓", "good");
        return;
      }
      if (!result.approveUrl) throw new Error("PayPal approval link was not returned.");
      location.href = result.approveUrl;
    } catch (error) {
      if (error.code === "LOCAL_LIVE_PAYPAL_BLOCKED") {
        setDialogNote(error.message, "good");
        showToast("Local safety check passed — no real $49 charge was created.");
      } else {
        setDialogNote(error.message || "Unable to start PayPal checkout.", "error");
      }
    } finally {
      state.busy = false;
      els.dialogAction.disabled = false;
      if (els.dialogAction.textContent === "Preparing secure PayPal checkout…") els.dialogAction.textContent = originalText;
    }
  }

  async function listenPurchased() {
    const story = state.selectedStory;
    if (!story || state.busy) return;
    state.busy = true;
    els.dialogAction.disabled = true;
    setDialogNote("Opening your purchased story…");
    try {
      const result = await fetchJson(`/api/story/${encodeURIComponent(story.id)}/open`);
      if (!result.url) throw new Error("The story link is temporarily unavailable.");
      window.open(result.url, "_blank", "noopener,noreferrer");
      setDialogNote("Story opened.", "good");
    } catch (error) {
      setDialogNote(error.message || "Unable to open this story.", "error");
    } finally {
      state.busy = false;
      els.dialogAction.disabled = false;
    }
  }

  async function finishPaypalReturn() {
    const url = new URL(location.href);
    if (url.searchParams.get("paypal") !== "return") return;
    const orderId = String(url.searchParams.get("token") || "").trim();
    if (!orderId) { showToast("PayPal returned without an order ID."); return; }
    try {
      const result = await fetchJson("/api/story-purchases/capture-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) });
      url.searchParams.delete("paypal"); url.searchParams.delete("token"); url.searchParams.delete("PayerID");
      history.replaceState({}, "", `${url.pathname}${url.search}`);
      await refreshSessionAndCatalog();
      if (state.selectedStory) { refreshStoryDialog(); openDialog(els.storyDialog); setDialogNote(`Payment verified. ${result.title || "Your story"} is unlocked for life.`, "good"); }
      showToast("Lifetime story access unlocked ✓");
    } catch (error) {
      showToast(error.message || "Unable to verify PayPal payment.");
    }
  }

  function handlePaypalCancel() {
    const url = new URL(location.href);
    if (url.searchParams.get("paypal") !== "cancel") return;
    url.searchParams.delete("paypal"); url.searchParams.delete("token"); url.searchParams.delete("PayerID");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
    showToast("Payment cancelled. No lifetime access was changed.");
  }

  async function loadData() {
    renderSkeletons();
    els.storyLoadError.hidden = true;
    try {
      const [site, session, catalog] = await Promise.all([fetchJson("/api/site"), fetchJson("/api/session"), fetchJson("/api/story-purchases/catalog")]);
      applySite(site);
      state.session = session;
      state.stories = Array.isArray(catalog.stories) ? catalog.stories : [];
      state.filtered = [...state.stories];
      updateAccountMenu();
      renderGenreFilters();
      applyStoryFilters();
      const requested = String(new URL(location.href).searchParams.get("story") || "");
      if (requested) state.selectedStory = state.stories.find(item => item.id === requested) || null;
      document.body.classList.remove("site-config-loading");
      handlePaypalCancel();
      await finishPaypalReturn();
    } catch (error) {
      console.error(error);
      els.galleryGrid.innerHTML = "";
      els.galleryGrid.setAttribute("aria-busy", "false");
      els.storyTotal.textContent = "Unavailable";
      els.storyLoadError.hidden = false;
      document.body.classList.remove("site-config-loading");
      showToast(error.message || "Could not load the lifetime story library.");
    }
  }

  els.galleryGrid.addEventListener("click", event => {
    const button = event.target.closest(".gallery-item[data-story-id]");
    if (button) selectStory(button.dataset.storyId);
  });
  els.searchInput.addEventListener("input", applyStoryFilters);
  els.headerSearch.addEventListener("submit", event => event.preventDefault());
  els.searchToggle.addEventListener("click", () => {
    const opening = !document.querySelector(".topbar").classList.contains("search-open");
    document.querySelector(".topbar").classList.toggle("search-open", opening);
    els.searchToggle.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => els.searchInput.focus());
  });
  els.searchClose.addEventListener("click", () => {
    document.querySelector(".topbar").classList.remove("search-open");
    els.searchToggle.setAttribute("aria-expanded", "false");
    els.searchInput.blur();
  });
  els.allStoriesFilter.addEventListener("click", () => { state.genreFilter = "all"; state.genreMenuOpen = false; renderGenreFilters(); applyStoryFilters(); });
  els.genreFilterToggle.addEventListener("click", () => { state.genreMenuOpen = !state.genreMenuOpen; renderGenreFilters(); });
  els.genreMenu.addEventListener("click", event => {
    const button = event.target.closest(".genre-option[data-genre]");
    if (!button) return;
    state.genreFilter = button.dataset.genre || "all";
    state.genreMenuOpen = false;
    renderGenreFilters(); applyStoryFilters();
  });
  els.storyDialogClose.addEventListener("click", () => closeDialog(els.storyDialog));
  els.loginDialogClose.addEventListener("click", () => closeDialog(els.loginDialog));
  [els.storyDialog, els.loginDialog].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));
  document.addEventListener("keydown", event => { if (event.key === "Escape") { if (!els.loginDialog.hidden) closeDialog(els.loginDialog); else if (!els.storyDialog.hidden) closeDialog(els.storyDialog); } });
  els.dialogAction.addEventListener("click", () => {
    const action = els.dialogAction.dataset.action;
    if (action === "login") openLogin();
    if (action === "pay") void beginPayment();
    if (action === "listen") void listenPurchased();
  });
  els.siteMenuToggle.addEventListener("click", () => {
    const opening = els.siteMenuPopover.hidden;
    els.siteMenuPopover.hidden = !opening;
    els.siteMenuToggle.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", event => {
    if (els.siteMenuPopover.hidden || els.siteMenuPopover.contains(event.target) || els.siteMenuToggle.contains(event.target)) return;
    els.siteMenuPopover.hidden = true; els.siteMenuToggle.setAttribute("aria-expanded", "false");
  });
  els.loginButton.addEventListener("click", () => {
    els.siteMenuPopover.hidden = true; els.siteMenuToggle.setAttribute("aria-expanded", "false");
    if (state.session.loggedIn) location.href = "/"; else openLogin();
  });
  els.retryStories.addEventListener("click", () => void loadData());

  void loadData();
})();
