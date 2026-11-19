const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  stories: [],
  filtered: [],
  membershipActive: false,
  loggedIn: false,
  user: null,
  genreFilter: "all",
  genreMenuOpen: false,
  selectedStory: null,
  dialogReturnFocus: new Map(),
  dialogAfterClose: new Map(),
  historyClosing: new Set(),
  touchStart: null,
  suppressNextContentClick: false,
  pageScrollY: null,
  tabScrollY: { stories: null, posts: null, membership: null, chat: null },
  searchActive: false,
  searchRelated: false,
  lastSearchQuery: "",
  appearance: null,
  settings: { showSearch: true, showChat: true, showSupport: true },
  protectedPlayerEnabled: false,
  tiers: [],
  lifetimePurchaseMode: document.body?.dataset?.lifetimePurchase === "true",
  lifetimePurchases: []
};

const memberChatState = { messages: [], unread: 0, pollTimer: null, loaded: false, sending: false, lastBackgroundStatusAt: 0 };
const telegramBackupState = {
  loaded: false,
  loading: false,
  connection: null,
  configured: false,
  botUsername: "OXNovelsBackupBot",
  alertKey: "",
  externalWindow: null,

  // Telegram status now loads independently of the Chat tab.
  userKey: "",
  lastLoadedAt: 0
};
const postsState = { posts: [], loaded: false, loading: false, pollTimer: null, statusTimer: null, statusLoading: false, unread: 0 };

const els = {
  tabs: $$(".profile-tab"),
  panels: $$(".tab-panel"),
  topbar: $(".topbar"),
  headerSearch: $("#headerSearch"),
  contentShell: $(".content-shell"),
  tabsStickyShell: $(".tabs-sticky-shell"),
  tabsStickySentinel: $("#tabsStickySentinel"),
  storiesToolbar: $("#storiesToolbar"),
  storiesToolbarSentinel: $("#storiesToolbarSentinel"),
  membershipToolbar: $("#membershipToolbar"),
  membershipToolbarSentinel: $("#membershipToolbarSentinel"),
  creatorShell: $(".creator-shell"),
  accessStatusPill: $("#accessStatusPill"),
  postsTab: $("#postsTab"),
  postsTabUnread: $("#postsTabUnread"),
  postsList: $("#postsList"),
  postsLoading: $("#postsLoading"),
  postsEmpty: $("#postsEmpty"),
  postsError: $("#postsError"),
  retryPosts: $("#retryPosts"),
  membershipTab: $("#membershipTab"),
  chatTab: $("#chatTab"),
  chatTabUnread: $("#chatTabUnread"),
  telegramTabAlert: $("#telegramTabAlert"),
  telegramBackupReminder: $("#telegramBackupReminder"),
  telegramBackupTitle: $("#telegramBackupTitle"),
  telegramBackupText: $("#telegramBackupText"),
  telegramBackupAction: $("#telegramBackupAction"),
  telegramBackupAlert: $("#telegramBackupAlert"),
  telegramBackupAlertTitle: $("#telegramBackupAlertTitle"),
  telegramBackupAlertText: $("#telegramBackupAlertText"),
  telegramBackupAlertAction: $("#telegramBackupAlertAction"),
  telegramBackupAlertClose: $("#telegramBackupAlertClose"),
  telegramBackupAlertLater: $("#telegramBackupAlertLater"),
  galleryGrid: $("#galleryGrid"),
  purchasedStoriesSection: $("#purchasedStoriesSection"),
  purchasedStoriesGrid: $("#purchasedStoriesGrid"),
  purchasedStoriesTotal: $("#purchasedStoriesTotal"),
  storyTotal: $("#storyTotal"),
  allStoriesFilter: $("#allStoriesFilter"),
  genreFilterToggle: $("#genreFilterToggle"),
  genreMenu: $("#genreMenu"),
  storyLoadError: $("#storyLoadError"),
  retryStories: $("#retryStories"),
  emptyState: $("#emptyState"),
  searchInput: $("#storySearch"),
  searchToggle: $("#searchToggle"),
  searchClose: $("#searchClose"),
  storyDialog: $("#storyDialog"),
  storyDialogClose: $("#storyDialogClose"),
  dialogCoverWrap: $("#dialogCoverWrap"),
  dialogCover: $("#dialogCover"),
  dialogCategory: $("#dialogCategory"),
  dialogTitle: $("#dialogTitle"),
  dialogDescription: $("#dialogDescription"),
  dialogAction: $("#dialogAction"),
  dialogActionNote: $("#dialogActionNote"),
  dialogChoiceSeparator: $("#dialogChoiceSeparator"),
  dialogSecondaryAction: $("#dialogSecondaryAction"),
  dialogSecondaryNote: $("#dialogSecondaryNote"),
  dialogStatus: $("#dialogStatus"),
  dialogStatusText: $("#dialogStatusText"),
  loginButton: $("#loginButton"),
  contactButton: $("#contactButton"),
  siteMenuToggle: $("#siteMenuToggle"),
  siteMenuPopover: $("#siteMenuPopover"),
  siteMenuSummary: $("#siteMenuSummary"),
  loginDialog: $("#loginDialog"),
  loginDialogClose: $("#loginDialogClose"),
  authIntro: $("#authIntro"),
  authError: $("#authError"),
  accountDialog: $("#accountDialog"),
  accountDialogClose: $("#accountDialogClose"),
  accountDialogDone: $("#accountDialogDone"),
  accountLogout: $("#accountLogout"),
  accountName: $("#accountName"),
  accountEmail: $("#accountEmail"),
  accountMembership: $("#accountMembership"),
  accountPlan: $("#accountPlan"),
  accountBillingDateLabel: $("#accountBillingDateLabel"),
  accountExpiry: $("#accountExpiry"),
  accountAutoRenew: $("#accountAutoRenew"),
  accountSubscription: $("#accountSubscription"),
  accountAccessStatus: $("#accountAccessStatus"),
  accountLifetimeStories: $("#accountLifetimeStories"),
  accountChatAccess: $("#accountChatAccess"),
  accountRefreshPaypal: $("#accountRefreshPaypal"),
  accountProfileAvatar: $("#accountProfileAvatar"),
  accountProfileReplace: $("#accountProfileReplace"),
  accountProfileRemove: $("#accountProfileRemove"),
  accountProfileFile: $("#accountProfileFile"),
  membershipTiers: $("#membershipTiers"),
  membershipTrack: $("#membershipTrack"),
  membershipDots: $("#membershipDots"),
  supportButton: $("#supportButton"),
  creatorShare: $("#creatorShare"),
  toast: $("#toast")
};

let tabsStickyObserver = null;
let storiesToolbarObserver = null;
let membershipToolbarObserver = null;
let stickyResizeTimer = null;
let membershipCarouselCleanup = null;
const priorityImageUrls = new Set();

function prioritizeImage(url = "") {
  const clean = String(url || "").trim();
  if (!clean || priorityImageUrls.has(clean)) return;
  priorityImageUrls.add(clean);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = clean;
  link.setAttribute("fetchpriority", "high");
  document.head.appendChild(link);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `story-${Date.now()}`;
}


function siteInitials(name = "Your Site") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function applySiteConfig(payload = {}) {
  const appearance = payload.appearance || {};
  const settings = payload.settings || {};
  state.appearance = appearance;
  state.settings = { ...state.settings, ...settings };
  state.protectedPlayerEnabled = payload?.playerDelivery?.enabled === true;
  state.tiers = Array.isArray(payload.tiers) ? payload.tiers : [];

  // These are the first visual assets users see. Because they are applied as
  // CSS backgrounds after /api/site loads, explicitly raise their fetch
  // priority so the browser does not treat them like ordinary late CSS images.
  prioritizeImage(appearance.bannerImage);
  prioritizeImage(appearance.logo);
  prioritizeImage(appearance.profileImage);

  const siteName = String(appearance.name || "").trim() || "Site";
  const initials = siteInitials(siteName);
  document.title = state.lifetimePurchaseMode ? `${siteName} — Select a Story` : siteName;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && appearance.description) metaDescription.content = appearance.description;

  const accent = /^#[0-9a-fA-F]{6}$/.test(appearance.accent || "") ? appearance.accent : "#13c3b3";
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dark", `color-mix(in srgb, ${accent} 76%, #000)`);
  root.style.setProperty("--accent-light", `color-mix(in srgb, ${accent} 58%, #fff)`);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 12%, #fff)`);
  root.style.setProperty("--focus", `color-mix(in srgb, ${accent} 70%, #000)`);

  const brandName = $(".brand-name");
  const brandMark = $(".brand-mark");
  const avatar = $(".creator-avatar");
  const creatorTitle = $("#creatorTitle");
  const handle = $(".creator-identity .handle");
  const bio = $(".creator-bio");
  const siteWords = siteName.trim().split(/\s+/).filter(Boolean);
  const compactBrandName = siteWords.length > 1 && siteWords[0].toUpperCase() === initials
    ? siteWords.slice(1).join(" ")
    : siteName;
  if (brandName) brandName.textContent = compactBrandName;
  const applyIdentityImage=(element,url,{ hideWhenEmpty=true }={})=>{
    if(!element)return;
    const clean=String(url||"").trim();
    element.classList.toggle("has-custom-image",Boolean(clean));
    element.classList.toggle("is-empty-identity",!clean);
    element.style.backgroundImage=clean?`url("${clean.replaceAll('"','%22')}")`:"";
    element.textContent="";
    if(hideWhenEmpty) element.hidden=!clean;
  };
  applyIdentityImage(brandMark,appearance.logo);
  applyIdentityImage(avatar,appearance.profileImage || appearance.logo);
  $$(".mini-logo").forEach(element=>applyIdentityImage(element,appearance.logo));
  const creatorBanner=$(".creator-banner");
  if(creatorBanner){
    const banner=String(appearance.bannerImage||"").trim();
    creatorBanner.classList.toggle("has-custom-image",Boolean(banner));
    creatorBanner.classList.toggle("is-empty-banner",!banner);
    creatorBanner.style.backgroundImage=banner?`url("${banner.replaceAll('"','%22')}")`:"";
  }
  if (creatorTitle) creatorTitle.textContent = siteName;
  if (handle) handle.textContent = appearance.handle || "";
  if (bio) bio.textContent = appearance.description || "";
  const brandLink = $(".brand");
  const profileTabs = $(".profile-tabs");
  const loginTitle = $("#loginTitle");
  const accountTitle = $("#accountTitle");
  const chatCopy = $(".member-chat-subtitle");
  const chatAdminMark = $("#memberChatAdminMark");
  if (brandLink) brandLink.setAttribute("aria-label", `${siteName} home`);
  if (profileTabs) profileTabs.setAttribute("aria-label", `${siteName} sections`);
  if (loginTitle) loginTitle.textContent = `Continue to ${siteName}`;
  if (accountTitle) accountTitle.textContent = `${siteName} Account`;
  if (chatCopy) chatCopy.textContent = `Private conversation with the ${siteName} admin`;
  if (chatAdminMark) {
    const chatAvatar = String(appearance.profileImage || appearance.logo || "").trim();
    chatAdminMark.classList.toggle("has-custom-image", Boolean(chatAvatar));
    chatAdminMark.classList.toggle("is-empty-identity", !chatAvatar);
    chatAdminMark.style.backgroundImage = chatAvatar ? `url("${chatAvatar.replaceAll('"','%22')}")` : "";
    chatAdminMark.textContent = "";
    chatAdminMark.hidden = !chatAvatar;
  }
  if (els.supportButton) els.supportButton.textContent = state.settings.supportLabel || "Support";
  if (els.contactButton) {
    const contactEmail = String(state.settings.supportEmail || "").trim();
    const usableContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) && contactEmail.toLowerCase() !== "support@example.com";
    els.contactButton.hidden = !usableContact;
    els.contactButton.dataset.email = usableContact ? contactEmail : "";
  }

  syncStorySearchVisibility(getActivePanelName());
  renderMembershipTiers(siteName, initials, appearance.logo || appearance.profileImage || "");
}

function renderMembershipTiers(siteName = "Site", initials = "", siteLogo = "") {
  if (!els.membershipTrack) return;
  const tiers = state.tiers || [];
  membershipCarouselCleanup?.();
  membershipCarouselCleanup = null;
  els.membershipTrack.innerHTML = "";

  if (!tiers.length) {
    els.membershipTrack.innerHTML = '<div class="membership-empty">Membership options are being prepared.</div>';
    if (els.membershipDots) { els.membershipDots.innerHTML = ""; els.membershipDots.hidden = true; }
    return;
  }

  els.membershipTrack.innerHTML = tiers.map(tier => {
    const benefits = Array.isArray(tier.benefits) ? tier.benefits : [];
    return `<article class="membership-card" data-membership-tier data-tier-id="${escapeHtml(tier.id || "")}">
      <div class="tier-visual ${tier.cover ? "has-custom-image" : ""}" aria-hidden="true" ${tier.cover ? `style="background-image:url('${escapeHtml(tier.cover)}')"` : ""}>
        <span class="tier-pill">${escapeHtml(siteName.toUpperCase())}</span>
        <div class="tier-symbol ${siteLogo ? "has-site-logo" : ""}" ${siteLogo ? `style="background-image:url('${escapeHtml(siteLogo)}')"` : ""}></div>
        <p>Listen without limits</p>
      </div>
      <div class="tier-content">
        <div class="tier-title-row">
          <div><h3>${escapeHtml(tier.name || "Membership")}</h3><p class="tier-subtitle">${escapeHtml(String(tier.cycle || "/ month").includes("month") ? "Monthly membership" : "Membership access")}</p></div>
          <div class="tier-price"><strong>${escapeHtml(tier.price || "$0.00")}</strong><span>${escapeHtml(tier.cycle || "")}</span></div>
        </div>
        <p class="tier-description">${escapeHtml(tier.description || "")}</p>
        <ul class="benefit-list">${benefits.map(item => `<li><span aria-hidden="true">&#10003;</span> ${escapeHtml(item)}</li>`).join("")}</ul>
        <button class="primary-button wide membership-join-button" type="button" data-tier-id="${escapeHtml(tier.id || "")}">Join Membership</button>
      </div>
    </article>`;
  }).join("");
  setupMembershipCarousel();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function startPersistentToastCountdown(label, seconds = 10) {
  clearTimeout(showToast.timer);
  let remaining = Math.max(0, Number(seconds) || 0);
  const render = () => {
    els.toast.textContent = `${label} ${remaining}s`;
    els.toast.classList.add("show");
  };
  render();
  const timer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    render();
    if (remaining <= 0) clearInterval(timer);
  }, 1000);
  return {
    stop({ hide = false } = {}) {
      clearInterval(timer);
      if (hide) els.toast.classList.remove("show");
    },
    message(text) {
      clearInterval(timer);
      els.toast.textContent = String(text || "");
      els.toast.classList.add("show");
    }
  };
}

function startButtonCountdown(button, label, seconds = 10) {
  if (!button) return { stop() {} };
  let remaining = Math.max(0, Number(seconds) || 0);
  const render = () => { button.textContent = `${label} ${remaining}s`; };
  render();
  const timer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    render();
    if (remaining <= 0) clearInterval(timer);
  }, 1000);
  return { stop() { clearInterval(timer); } };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function syncStorySearchVisibility(tabName = getActivePanelName()) {
  const visible = tabName === "stories" && state.settings.showSearch !== false;

  // Search only belongs to Stories. Closing it here is immediate and does not
  // move the page or focus a hidden control when Chat/Membership is selected.
  if (!visible) {
    const hadSearch = Boolean(
      els.searchInput?.value ||
      state.lastSearchQuery ||
      state.searchActive ||
      document.body.classList.contains("search-ui-open")
    );
    if (els.searchInput) els.searchInput.value = "";
    state.lastSearchQuery = "";
    state.searchRelated = false;
    if (hadSearch) applyStoryFilters();

    els.searchInput?.blur();
    document.body.classList.remove("search-ui-open", "search-active");
    state.searchActive = false;
    els.searchToggle?.setAttribute("aria-expanded", "false");
    els.searchToggle?.setAttribute("aria-label", "Open story search");
    syncMobileSearchPin(false);
  }

  if (els.searchToggle) els.searchToggle.hidden = !visible;
  if (els.headerSearch) els.headerSearch.hidden = !visible;
  document.body.dataset.activeTab = tabName;
}

function getTabsDocumentTop() {
  if (!els.tabsStickySentinel) return 0;
  return Math.max(0, els.tabsStickySentinel.getBoundingClientRect().top + window.scrollY);
}

function switchTab(name, updateHash = true, alignContent = false) {
  if (state.lifetimePurchaseMode) name = "stories";
  if (name === "gallery") name = "stories";
  if (name === "posts" && !els.postsTab) name = "stories";
  if (name === "chat" && (!hasPaidChatAccess() || state.settings.showChat === false)) name = "stories";
  if (name === "membership" && state.membershipActive) name = "stories";

  const previousTab = getActivePanelName();
  const changingTabs = previousTab !== name;
  const tabsDocumentTop = getTabsDocumentTop();
  const tabsAreSticky = els.tabsStickyShell.classList.contains("is-stuck") ||
    els.tabsStickySentinel.getBoundingClientRect().top <= 0;

  // Each tab owns its own document scroll position. A deep Stories position is
  // never inherited by Membership/Chat. If the shared tab header is already
  // sticky, a tab with no saved position starts exactly at the sticky boundary.
  if (changingTabs) state.tabScrollY[previousTab] = window.scrollY;

  let targetScrollY = null;
  if (changingTabs) {
    const saved = state.tabScrollY[name];

    // When the shared tabs are already sticky, Chat should inherit only that
    // sticky state from Stories — never the deep Stories scroll position. Open
    // Chat exactly at the tabs' sticky boundary so its content starts below the
    // header. Above the sticky point, Chat keeps/restores its own page position.
    if (name === "chat") {
      targetScrollY = tabsAreSticky
        ? tabsDocumentTop + 1
        : (Number.isFinite(saved) ? Math.min(saved, tabsDocumentTop) : Math.min(window.scrollY, tabsDocumentTop));
    } else if (Number.isFinite(saved)) {
      targetScrollY = tabsAreSticky ? Math.max(tabsDocumentTop + 1, saved) : saved;
    } else if (tabsAreSticky) {
      targetScrollY = tabsDocumentTop + 1;
    } else {
      targetScrollY = Math.min(window.scrollY, tabsDocumentTop);
    }
  } else if (alignContent) {
    targetScrollY = name === "chat"
      ? (Number.isFinite(state.tabScrollY.chat) ? state.tabScrollY.chat : window.scrollY)
      : (tabsAreSticky ? tabsDocumentTop + 1 : window.scrollY);
  }

  els.tabs.forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  els.panels.forEach(panel => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  // Search exists only on Stories, so switching away also closes the mobile
  // keyboard/search pin before the destination tab is positioned.
  syncStorySearchVisibility(name);

  if (updateHash) {
    const hash = name === "posts" ? "#posts" : (name === "membership" ? "#membership" : (name === "chat" ? "#chat" : "#stories"));
    history.replaceState(history.state, "", hash);
  }

  if (Number.isFinite(targetScrollY)) {
    window.scrollTo({ top: Math.max(0, targetScrollY), left: 0, behavior: "auto" });
    state.tabScrollY[name] = window.scrollY;
  }

  setupStickyObservers();
  if (name === "membership") {
    // Membership artwork is intentionally not preloaded on the Stories screen.
    // Once the user opens Membership, prioritize the small number of visible
    // tier images so they appear promptly without competing with story covers.
    (state.tiers || []).slice(0, 3).forEach(tier => prioritizeImage(tier.cover));
    setupMembershipCarousel();
  }
  if (name === "posts") {
    updatePostsUnread(0);
    void markPostsSeen();
    void loadPosts({ silent: postsState.loaded }).catch(() => {});
    startPostsPolling();
  } else {
    stopPostsPolling();
  }
  if (name === "chat") {
    void loadMemberChat({ seen: true, forceBottom: !memberChatState.loaded }).catch(error => showToast(error.message || "Unable to load Chat."));
  }
}
function getStickyMetrics() {
  // The creator/main header scrolls away like Ko-fi. The tab/search strip becomes
  // the compact second header at the very top of the viewport.
  const headerHeight = 0;
  const searchHeight = 0;
  const tabsHeight = els.tabsStickyShell.getBoundingClientRect().height;
  const tabsTop = 0;
  const contentTop = tabsHeight;
  const toolbar = getActiveToolbar();
  const toolbarHeight = toolbar && toolbar.offsetParent !== null ? toolbar.getBoundingClientRect().height : 0;
  const snapContentTop = contentTop + toolbarHeight + 6;

  document.documentElement.style.setProperty("--tabs-sticky-top", `${tabsTop}px`);
  document.documentElement.style.setProperty("--content-sticky-top", `${contentTop}px`);
  // The root snapport itself begins below the complete live sticky stack.
  // This is more reliable than expanding every card with scroll-margin and
  // prevents a story/tier from settling partly underneath sticky chrome.
  document.documentElement.style.setProperty("--page-snap-padding-top", `${snapContentTop}px`);
  return { headerHeight, searchHeight, tabsHeight, toolbarHeight, tabsTop, contentTop, snapContentTop };
}


function isMobileViewport() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function syncMobileSearchPin(force = null) {
  if (!els.tabsStickyShell) return;
  const shouldPin = force === null
    ? (isMobileViewport() && document.activeElement === els.searchInput && !els.headerSearch.hidden)
    : Boolean(force);

  // Chrome Android is asked (via interactive-widget=resizes-content) to resize
  // the layout viewport for the keyboard. Keep the normal sticky header instead
  // of moving it with VisualViewport offsets, which caused the page to bounce
  // between the creator block and the results while typing.
  document.body.classList.toggle("mobile-search-focus", shouldPin);
  document.documentElement.style.removeProperty("--mobile-search-shell-height");
  document.documentElement.style.removeProperty("--mobile-search-visual-top");
}

function alignStoryGridStart() {
  if (getActivePanelName() !== "stories") return;
  const first = $(".gallery-item", els.galleryGrid);
  if (!first || !els.storiesToolbar || !els.tabsStickyShell) return;

  // Search and genre changes are content changes, not manual scrolling. Put the
  // first resulting card fully below BOTH sticky rows without reintroducing
  // page-level snapping.
  setupStickyObservers();
  const tabsHeight = Math.ceil(els.tabsStickyShell.getBoundingClientRect().height || 0);
  const toolbarHeight = Math.ceil(els.storiesToolbar.getBoundingClientRect().height || 0);
  const desiredTop = tabsHeight + toolbarHeight + 8;
  const currentTop = first.getBoundingClientRect().top;
  const delta = currentTop - desiredTop;

  if (Math.abs(delta) > 2) {
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
  }
  state.tabScrollY.stories = window.scrollY;
  requestAnimationFrame(setupStickyObservers);
}

// Compatibility name for older call sites in this file.
const anchorSearchResults = alignStoryGridStart;

function getActivePanelName() {
  return els.tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.dataset.tab || "stories";
}

function getActiveToolbar() {
  const panel = getActivePanelName();
  if (panel === "stories") return els.storiesToolbar;
  if (panel === "membership") return els.membershipToolbar;
  return null;
}


function setupStickyObservers() {
  tabsStickyObserver?.disconnect();
  storiesToolbarObserver?.disconnect();
  membershipToolbarObserver?.disconnect();

  const { tabsTop, contentTop } = getStickyMetrics();
  const tabsStuck = els.tabsStickySentinel.getBoundingClientRect().top < tabsTop;
  const storiesVisible = !$("#storiesPanel").hidden;
  const membershipVisible = !$("#membershipPanel").hidden;

  els.tabsStickyShell.classList.toggle("is-stuck", tabsStuck);
  els.storiesToolbar.classList.toggle(
    "is-stuck",
    storiesVisible && els.storiesToolbarSentinel.getBoundingClientRect().top < contentTop
  );
  els.membershipToolbar?.classList.toggle(
    "is-stuck",
    membershipVisible && els.membershipToolbarSentinel.getBoundingClientRect().top < contentTop
  );

  if (!("IntersectionObserver" in window)) return;

  tabsStickyObserver = new IntersectionObserver(([entry]) => {
    const stuck = !entry.isIntersecting && entry.boundingClientRect.top < tabsTop;
    els.tabsStickyShell.classList.toggle("is-stuck", stuck);
  }, {
    root: null,
    rootMargin: `-${tabsTop}px 0px 0px 0px`,
    threshold: 0
  });
  tabsStickyObserver.observe(els.tabsStickySentinel);

  if (storiesVisible) {
    storiesToolbarObserver = new IntersectionObserver(([entry]) => {
      const stuck = !entry.isIntersecting && entry.boundingClientRect.top < contentTop;
      els.storiesToolbar.classList.toggle("is-stuck", stuck);
    }, {
      root: null,
      rootMargin: `-${contentTop}px 0px 0px 0px`,
      threshold: 0
    });
    storiesToolbarObserver.observe(els.storiesToolbarSentinel);
  }

  if (membershipVisible && els.membershipToolbar && els.membershipToolbarSentinel) {
    membershipToolbarObserver = new IntersectionObserver(([entry]) => {
      const stuck = !entry.isIntersecting && entry.boundingClientRect.top < contentTop;
      els.membershipToolbar.classList.toggle("is-stuck", stuck);
    }, {
      root: null,
      rootMargin: `-${contentTop}px 0px 0px 0px`,
      threshold: 0
    });
    membershipToolbarObserver.observe(els.membershipToolbarSentinel);
  }
}

function getLocalAdminStories() {
  try {
    const raw = JSON.parse(localStorage.getItem("ox_admin_stories") || "[]");
    return Array.isArray(raw) ? raw.map(item => ({ ...item, source: "local" })) : [];
  } catch {
    return [];
  }
}

function normalizeStory(item) {
  return {
    id: item.id || slugify(item.title),
    title: item.title || "Untitled Story",
    description: item.description || "",
    category: item.category || "Audio Story",
    genre: item.genre || item.category || "Unverified",
    genreLastChecked: item.genreLastChecked || null,
    cover: item.cover || `/api/story-cover/${encodeURIComponent(item.id || slugify(item.title || "story"))}`,
    order: Number(item.order || 9999),
    visible: item.visible !== false,
    source: item.source || "code",
    driveUrl: item.driveUrl || ""
  };
}

function memberClientTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

async function syncMemberClientContext() {
  if (!state.loggedIn) return;
  const timezone = memberClientTimezone();
  if (!timezone) return;
  try {
    await fetch("/api/account/client-context", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone, locale: navigator.language || "" })
    });
  } catch {}
}

async function loadData() {
  if (!state.stories.length) renderSkeletons();
  els.storyLoadError.hidden = true;
  els.emptyState.hidden = true;
  els.storyTotal.textContent = "Loading...";

  try {
    const storiesUrl = state.lifetimePurchaseMode ? "/api/story-purchases/catalog" : "/api/stories";
    const [siteResponse, storiesResponse, sessionResponse] = await Promise.all([
      fetch("/api/site", { cache: "default" }),
      fetch(storiesUrl, { cache: state.lifetimePurchaseMode ? "no-store" : "default", credentials: "same-origin" }),
      fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
    ]);

    if (!siteResponse.ok || !storiesResponse.ok || !sessionResponse.ok) throw new Error("Unable to load public data.");

    const sitePayload = await siteResponse.json();
    const storyPayload = await storiesResponse.json();
    const sessionPayload = await sessionResponse.json();
    applySiteConfig(sitePayload);

    if (state.lifetimePurchaseMode) {
      state.stories = (storyPayload.stories || []).map((item, index) => ({
        ...normalizeStory({ ...item, order: index + 1 }),
        purchasable: item.purchasable !== false,
        lifetimePurchased: item.purchased === true
      }));
    } else {
      const serverStories = (storyPayload.stories || []).map(normalizeStory);
      state.stories = serverStories.filter(story => story.visible !== false).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    }
    state.filtered = [...state.stories];
    state.loggedIn = sessionPayload.loggedIn === true;
    state.user = sessionPayload.user || null;
    state.membershipActive = sessionPayload.membershipActive === true;
    void syncMemberClientContext();

    if (!state.lifetimePurchaseMode) await loadLifetimePurchasesForHome();
    renderGenreFilters();
    applyStoryFilters();
    renderAccessStatus();
    updateMemberExperience();
    updateLoginButton();
    void pollPostsStatus({ force: true });
    document.body.classList.remove("site-config-loading");
  } catch (error) {
    console.error(error);
    state.stories = [];
    state.filtered = [];
    els.storyTotal.textContent = "Unavailable";
    els.galleryGrid.innerHTML = "";
    els.galleryGrid.setAttribute("aria-busy", "false");
    els.emptyState.hidden = true;
    els.storyLoadError.hidden = false;
    document.body.classList.remove("site-config-loading");
    showToast(state.lifetimePurchaseMode ? "Could not load the lifetime story library." : "Could not load the story library.");
  }
}

function renderSkeletons() {
  els.galleryGrid.setAttribute("aria-busy", "true");
  els.galleryGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="story-skeleton" aria-hidden="true"></div>').join("");
}

function normalizedGenre(value = "") {
  const text = String(value || "").trim();
  return text && !["unknown", "unverified", "audio story"].includes(text.toLowerCase()) ? text : "Unverified";
}

function availableGenres() {
  const seen = new Map();
  for (const story of state.stories) {
    const genre = normalizedGenre(story.genre);
    if (genre === "Unverified") continue;
    const key = genre.toLowerCase();
    if (!seen.has(key)) seen.set(key, genre);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function renderGenreFilters() {
  if (!els.genreMenu || !els.genreFilterToggle || !els.allStoriesFilter) return;
  const genres = availableGenres();
  if (state.genreFilter !== "all" && !genres.some(g => g.toLowerCase() === String(state.genreFilter).toLowerCase())) state.genreFilter = "all";
  els.allStoriesFilter.classList.toggle("active", state.genreFilter === "all");
  els.allStoriesFilter.setAttribute("aria-pressed", String(state.genreFilter === "all"));
  const selected = state.genreFilter === "all" ? "Genres" : state.genreFilter;
  els.genreFilterToggle.innerHTML = `${escapeHtml(selected)} <span class="genre-chevron" aria-hidden="true"></span>`;
  els.genreFilterToggle.classList.toggle("active", state.genreFilter !== "all");
  els.genreFilterToggle.setAttribute("aria-expanded", String(state.genreMenuOpen));
  els.genreMenu.hidden = !state.genreMenuOpen;
  els.genreMenu.innerHTML = genres.map(genre => `<button type="button" class="genre-option${String(state.genreFilter).toLowerCase() === genre.toLowerCase() ? " active" : ""}" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</button>`).join("");
  $$(".genre-option", els.genreMenu).forEach(button => button.addEventListener("click", () => {
    state.genreFilter = button.dataset.genre || "all";
    state.genreMenuOpen = false;
    renderGenreFilters();
    applyStoryFilters();
    requestAnimationFrame(alignStoryGridStart);
  }));
}

function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinSimilarity(a, b) {
  a = normalizeSearchText(a);
  b = normalizeSearchText(b);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return 1 - (previous[b.length] / Math.max(a.length, b.length));
}

function bigramSimilarity(a, b) {
  a = normalizeSearchText(a).replace(/\s+/g, "");
  b = normalizeSearchText(b).replace(/\s+/g, "");
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a && b && (a.includes(b) || b.includes(a)) ? 0.75 : 0;
  const pairs = value => {
    const output = [];
    for (let index = 0; index < value.length - 1; index += 1) output.push(value.slice(index, index + 2));
    return output;
  };
  const left = pairs(a);
  const right = pairs(b);
  const counts = new Map();
  right.forEach(pair => counts.set(pair, (counts.get(pair) || 0) + 1));
  let matches = 0;
  left.forEach(pair => {
    const count = counts.get(pair) || 0;
    if (count > 0) { matches += 1; counts.set(pair, count - 1); }
  });
  return (2 * matches) / (left.length + right.length);
}

function fuzzyTitleScore(title, query) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  if (normalizedTitle.includes(normalizedQuery)) return 1;

  const titleTokens = normalizedTitle.split(" ").filter(Boolean);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (!queryTokens.length) return 0;

  const tokenScore = queryTokens.reduce((sum, queryToken) => {
    let best = 0;
    for (const titleToken of titleTokens) {
      if (titleToken === queryToken) { best = 1; break; }
      const prefix = titleToken.startsWith(queryToken) || queryToken.startsWith(titleToken) ? 0.84 : 0;
      best = Math.max(best, prefix, levenshteinSimilarity(queryToken, titleToken), bigramSimilarity(queryToken, titleToken));
    }
    return sum + best;
  }, 0) / queryTokens.length;

  const wholeScore = Math.max(
    levenshteinSimilarity(normalizedQuery, normalizedTitle),
    bigramSimilarity(normalizedQuery, normalizedTitle)
  );
  return tokenScore * 0.72 + wholeScore * 0.28;
}

function applyStoryFilters() {
  const query = normalizeSearchText(els.searchInput.value);
  const genreMatches = state.stories.filter(story => state.genreFilter === "all" || normalizedGenre(story.genre).toLowerCase() === String(state.genreFilter).toLowerCase());

  state.searchRelated = false;
  if (!query) {
    state.filtered = genreMatches;
  } else {
    // Search is intentionally title-first. Even a one-letter query finds every
    // title containing that letter. Genre/description do not dilute results.
    const direct = genreMatches.filter(story => normalizeSearchText(story.title).includes(query));
    if (direct.length) {
      state.filtered = direct;
    } else if (query.length >= 2) {
      // If there is no literal title match, return the closest title spellings.
      // This makes searches such as "wool of blaadd moon" find
      // "Wolves of Blood Moon" without requiring an exact spelling.
      const related = genreMatches
        .map(story => ({ story, score: fuzzyTitleScore(story.title, query) }))
        .filter(item => item.score >= 0.43)
        .sort((a, b) => b.score - a.score || Number(a.story.order || 9999) - Number(b.story.order || 9999))
        .slice(0, 6);
      state.filtered = related.map(item => item.story);
      state.searchRelated = state.filtered.length > 0;
    } else {
      state.filtered = [];
    }
  }
  renderGallery();
}

function lifetimeActivePurchaseRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(item =>
    String(item?.purchaseStatus || "").toLowerCase() === "completed" &&
    String(item?.entitlementStatus || "").toLowerCase() === "active"
  );
}

function hasActiveLifetimePurchase() {
  return lifetimeActivePurchaseRows(state.lifetimePurchases).length > 0;
}

function hasPaidChatAccess() {
  if (!state.loggedIn) return false;
  if (state.user?.testMode === true) return state.user?.testChatAccess === true;
  return state.user?.paidOnce === true;
}

function applyLifetimeOwnershipToStories() {
  const ownedIds = new Set(
    lifetimeActivePurchaseRows(state.lifetimePurchases)
      .map(item => String(item.currentStoryId || ""))
      .filter(Boolean)
  );
  state.stories.forEach(story => {
    story.lifetimePurchased = ownedIds.has(String(story.id || ""));
  });
}

function renderPurchasedStories() {
  if (!els.purchasedStoriesSection || !els.purchasedStoriesGrid) return;
  const purchases = lifetimeActivePurchaseRows(state.lifetimePurchases);
  const hideForTest = state.user?.testMode === true && state.user?.testShowPurchased === false;
  els.purchasedStoriesSection.hidden = hideForTest || purchases.length === 0;
  if (els.purchasedStoriesTotal) els.purchasedStoriesTotal.textContent = `${purchases.length} ${purchases.length === 1 ? "story" : "stories"}`;
  if (!purchases.length) { els.purchasedStoriesGrid.innerHTML = ""; return; }

  const siteInitial = escapeHtml(String(state.appearance?.name || "Story").trim().slice(0, 2).toUpperCase() || "ST");
  els.purchasedStoriesGrid.innerHTML = purchases.map((purchase, index) => {
    const story = state.stories.find(item => String(item.id) === String(purchase.currentStoryId || ""));
    const title = story?.title || purchase.currentTitle || purchase.originalTitle || "Purchased Story";
    const cover = story?.cover || purchase.currentCover || purchase.originalCover || "";
    const available = Boolean(story && purchase.currentAvailable !== false);
    return `<button class="gallery-item purchased-gallery-item${available ? "" : " is-unavailable"}" type="button"
      data-purchased-story-id="${escapeHtml(story?.id || "")}" aria-label="${available ? "Open" : "View"} ${escapeHtml(title)}" title="${escapeHtml(title)}">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(title)} cover" loading="${index < 4 ? "eager" : "lazy"}" decoding="async" fetchpriority="${index < 2 ? "high" : "auto"}" draggable="false">
      <span class="cover-fallback" aria-hidden="true"><strong>${siteInitial}</strong><span>Story Cover</span><small>${escapeHtml(title)}</small></span>
      <span class="purchased-story-badge">Lifetime ✓</span>
      ${available ? "" : '<span class="purchased-story-unavailable">Updating</span>'}
    </button>`;
  }).join("");

  $$(".purchased-gallery-item", els.purchasedStoriesGrid).forEach(button => {
    const image = $("img", button);
    const loaded = () => {
      button.classList.add("image-loaded");
      const coverUrl = image.currentSrc || image.src;
      if (coverUrl) button.style.setProperty("--cover-bg", `url(${JSON.stringify(coverUrl)})`);
    };
    const failed = () => { button.classList.remove("image-loaded"); button.classList.add("image-failed"); image.hidden = true; };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    button.addEventListener("click", () => {
      const storyId = String(button.dataset.purchasedStoryId || "");
      const story = state.stories.find(item => String(item.id) === storyId);
      if (story) openStoryDialog(story);
      else showToast("This purchased story is temporarily being updated.");
    });
  });
}

async function loadLifetimePurchasesForHome() {
  state.lifetimePurchases = [];
  if (state.lifetimePurchaseMode || !state.loggedIn) { renderPurchasedStories(); return; }
  try {
    const response = await fetch("/api/story-purchases/mine", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) { renderPurchasedStories(); return; }
    const payload = await response.json();
    state.lifetimePurchases = Array.isArray(payload.purchases) ? payload.purchases : [];
    applyLifetimeOwnershipToStories();
    renderPurchasedStories();
  } catch { renderPurchasedStories(); }
}

function renderGallery() {
  els.storyLoadError.hidden = true;
  els.storyTotal.textContent = `${state.filtered.length} ${state.searchRelated ? (state.filtered.length === 1 ? "related story" : "related stories") : (state.filtered.length === 1 ? "story" : "stories")}`;
  els.emptyState.hidden = state.filtered.length !== 0;
  els.galleryGrid.setAttribute("aria-busy", "false");

  els.galleryGrid.innerHTML = state.filtered.map((story, index) => `
    <button
      class="gallery-item${story.lifetimePurchased ? " is-lifetime-owned" : ""}"
      type="button"
      data-story-id="${escapeHtml(story.id)}"
      aria-label="Open ${escapeHtml(story.title)}"
      title="${escapeHtml(story.title)}"
    >
      <img
        src="${escapeHtml(story.cover)}"
        alt="${escapeHtml(story.title)} cover"
        loading="${index < 6 ? "eager" : "lazy"}"
        decoding="async"
        fetchpriority="${index < 4 ? "high" : "auto"}"
        draggable="false"
      >
      <span class="cover-fallback" aria-hidden="true">
        <strong>${escapeHtml(String(state.appearance?.name || "Story").trim().slice(0, 2).toUpperCase() || "ST")}</strong>
        <span>Story Cover</span>
        <small>${escapeHtml(story.title)}</small>
      </span>
      ${story.lifetimePurchased ? '<span class="purchased-story-badge">Purchased ✓</span>' : ''}
    </button>
  `).join("");

  $$(".gallery-item", els.galleryGrid).forEach(button => {
    const image = $("img", button);
    const showLoadedImage = () => {
      button.classList.add("image-loaded");
      const coverUrl = image.currentSrc || image.src;
      if (coverUrl) button.style.setProperty("--cover-bg", `url(${JSON.stringify(coverUrl)})`);
    };
    const showImageFallback = () => {
      button.classList.remove("image-loaded");
      button.classList.add("image-failed");
      image.hidden = true;
    };

    image.addEventListener("load", showLoadedImage, { once: true });
    image.addEventListener("error", showImageFallback, { once: true });
    if (image.complete) {
      if (image.naturalWidth > 0) showLoadedImage();
      else showImageFallback();
    }

    button.addEventListener("click", () => {
      const story = state.stories.find(item => item.id === button.dataset.storyId);
      if (story) openStoryDialog(story);
    });
  });
}

function formatAccountDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function membershipBillingInfo(user = {}) {
  const subscriptionStatus = String(user.subscriptionStatus || "").toUpperCase();
  if (subscriptionStatus === "ACTIVE" && user.nextBillingAt) return { label: "Next billing", value: user.nextBillingAt };
  if (subscriptionStatus === "CANCELLED" && user.membershipExpiresAt) return { label: "Access until", value: user.membershipExpiresAt };
  if (user.membershipExpiresAt) return { label: "Expires", value: user.membershipExpiresAt };
  return { label: subscriptionStatus === "ACTIVE" ? "Next billing" : "Expires", value: null };
}

function updateAccountDialog() {
  const user = state.user || {};
  if (els.accountName) els.accountName.textContent = user.name || "—";
  if (els.accountEmail) els.accountEmail.textContent = user.email || "—";
  if (els.accountMembership) {
    els.accountMembership.innerHTML = `${state.membershipActive ? '<span class="status-dot" aria-hidden="true"></span>' : ''}${escapeHtml(user.membershipStatus || "None")}`;
  }
  if (els.accountPlan) els.accountPlan.textContent = user.plan || "None";
  const billing = membershipBillingInfo(user);
  if (els.accountBillingDateLabel) els.accountBillingDateLabel.textContent = billing.label;
  if (els.accountExpiry) els.accountExpiry.textContent = formatAccountDate(billing.value);
  if (els.accountAutoRenew) els.accountAutoRenew.textContent = user.autoRenew === true ? "On" : user.autoRenew === false ? "Off" : "—";
  if (els.accountSubscription) els.accountSubscription.textContent = user.subscriptionStatus || "—";
  if (els.accountAccessStatus) {
    els.accountAccessStatus.textContent = String(els.accessStatusPill?.textContent || "Logged In").trim() || "Logged In";
  }
  if (els.accountLifetimeStories) {
    const lifetimeCount = activeLifetimeAccessCount();
    els.accountLifetimeStories.textContent = lifetimeCount === 1 ? "1 Story" : `${lifetimeCount} Stories`;
  }
  if (els.accountChatAccess) {
    els.accountChatAccess.textContent = state.user?.testMode === true
      ? (hasPaidChatAccess() ? "TEST · Enabled" : "TEST · Disabled")
      : (hasPaidChatAccess() ? "Enabled permanently" : "Locked until first real payment");
  }
  if (els.accountRefreshPaypal) {
    const canRefreshPaypal = state.loggedIn && String(user.billingProvider || "").toLowerCase() === "paypal" && Boolean(user.subscriptionId);
    els.accountRefreshPaypal.hidden = !canRefreshPaypal;
  }
  setMemberAvatar(els.accountProfileAvatar, user);
  if (els.accountProfileRemove) els.accountProfileRemove.hidden = !user.profileImage;
}

function updateLoginButton() {
  const user = state.user || {};
  if (els.siteMenuSummary) {
    if (state.loggedIn) {
      const membership = user.membershipStatus || (state.membershipActive ? "Active" : "None");
      const billing = membershipBillingInfo(user);
      const billingDate = formatAccountDate(billing.value);
      els.siteMenuSummary.innerHTML = `<strong>${escapeHtml(user.name || "Member")}</strong><span>${escapeHtml(membership)}${user.plan ? ` · ${escapeHtml(user.plan)}` : ""}</span>${billingDate !== "—" ? `<small>${escapeHtml(billing.label)}: ${escapeHtml(billingDate)}</small>` : ""}`;
      els.loginButton.textContent = "Account details";
    } else {
      els.siteMenuSummary.innerHTML = `<strong>Guest</strong><span>Log in to view your membership details.</span>`;
      els.loginButton.textContent = "Continue with Google";
    }
  }
  updateAccountDialog();
}


function activeLifetimeAccessCount() {
  if (state.lifetimePurchaseMode) {
    return state.stories.filter(story => story?.lifetimePurchased === true).length;
  }
  return state.lifetimePurchases.filter(item =>
    String(item?.purchaseStatus || "").toLowerCase() === "completed" &&
    String(item?.entitlementStatus || "").toLowerCase() === "active"
  ).length;
}

function shortAccessDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function membershipAccessDisplay() {
  const user = state.user || {};
  const raw = String(user.membershipStatus || "None").trim();
  const normalized = raw.toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  const subscriptionStatus = String(user.subscriptionStatus || "").trim().toUpperCase();

  if (!state.loggedIn) return { text: "Guest Mode", tone: "neutral", hasMembership: false };

  if (state.membershipActive) {
    if (raw === "Granted") return { text: "Membership Granted", tone: "member", hasMembership: true };

    if (subscriptionStatus === "CANCELLED") {
      const end = shortAccessDate(user.membershipExpiresAt || user.nextBillingAt);
      return { text: end ? `Active · Cancels ${end}` : "Active · Cancellation Scheduled", tone: "warning", hasMembership: true };
    }
    if (["PAST_DUE", "PAYMENT_FAILED", "SUSPENDED", "ON_HOLD"].includes(subscriptionStatus)) {
      return { text: "Payment Issue", tone: "warning", hasMembership: true };
    }
    return { text: "Membership Active", tone: "member", hasMembership: true };
  }

  if (["", "none", "inactive"].includes(normalized)) {
    return { text: "", tone: "neutral", hasMembership: false };
  }
  if (normalized === "expired") return { text: "Membership Expired", tone: "warning", hasMembership: false };
  if (["cancelled", "canceled"].includes(normalized)) return { text: "Membership Cancelled", tone: "warning", hasMembership: false };
  if (["past due", "payment failed", "failed"].includes(normalized)) return { text: "Payment Issue", tone: "danger", hasMembership: false };
  if (normalized === "paused") return { text: "Membership Paused", tone: "warning", hasMembership: false };
  if (normalized === "suspended") return { text: "Membership Suspended", tone: "danger", hasMembership: false };
  if (normalized === "on hold") return { text: "Membership On Hold", tone: "warning", hasMembership: false };
  if (["renew", "renewal pending", "pending"].includes(normalized)) return { text: "Renewal Pending", tone: "warning", hasMembership: false };
  if (raw === "Granted") return { text: "Membership Granted", tone: "member", hasMembership: true };

  return { text: `Membership ${raw}`, tone: "neutral", hasMembership: false };
}



const GUEST_POSTS_SEEN_KEY = "ox_posts_seen_at";

function getGuestPostsSeenAt() {
  try { return String(localStorage.getItem(GUEST_POSTS_SEEN_KEY) || ""); }
  catch { return ""; }
}
function setGuestPostsSeenAt(value) {
  const date = new Date(value || "");
  const normalized = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  try { localStorage.setItem(GUEST_POSTS_SEEN_KEY, normalized); } catch {}
  return normalized;
}
function updatePostsUnread(count) {
  const unread = Math.max(0, Number(count) || 0);
  postsState.unread = unread;
  if (!els.postsTabUnread) return;
  els.postsTabUnread.textContent = unread > 99 ? "99+" : String(unread);
  els.postsTabUnread.setAttribute("aria-label", `${unread} unread post${unread === 1 ? "" : "s"}`);
  els.postsTabUnread.hidden = unread === 0;
}
async function pollPostsStatus({ force = false } = {}) {
  if (!els.postsTab || state.lifetimePurchaseMode || postsState.statusLoading) return;
  if (!force && document.visibilityState === "hidden") return;

  // When the user is already looking at Posts, new posts are considered seen
  // as soon as that feed refreshes.
  if (getActivePanelName() === "posts") {
    updatePostsUnread(0);
    return;
  }

  postsState.statusLoading = true;
  try {
    const params = new URLSearchParams();
    const guestSeen = !state.loggedIn ? getGuestPostsSeenAt() : "";
    if (guestSeen) params.set("since", guestSeen);

    const response = await fetch(`/api/posts/status${params.size ? `?${params}` : ""}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return;

    // First visit from a logged-out browser: establish a baseline so old posts
    // do not suddenly appear as unread. Future published posts will notify.
    if (!state.loggedIn && !guestSeen) {
      setGuestPostsSeenAt(payload.latestPublishedAt || new Date().toISOString());
      updatePostsUnread(0);
      return;
    }

    updatePostsUnread(payload.unreadCount || 0);
  } catch (error) {
    console.warn("Posts notification check skipped", error);
  } finally {
    postsState.statusLoading = false;
  }
}
async function markPostsSeen() {
  updatePostsUnread(0);
  if (state.lifetimePurchaseMode) return;

  if (!state.loggedIn) {
    setGuestPostsSeenAt(new Date().toISOString());
    return;
  }

  try {
    const response = await fetch("/api/posts/seen", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.latestPublishedAt) {
      // Keeping the local browser baseline current also makes logout -> guest
      // behavior feel consistent on the same device.
      setGuestPostsSeenAt(payload.latestPublishedAt);
    }
  } catch {}
}
function startPostsStatusPolling() {
  if (postsState.statusTimer) clearInterval(postsState.statusTimer);
  if (!els.postsTab || state.lifetimePurchaseMode) {
    postsState.statusTimer = null;
    updatePostsUnread(0);
    return;
  }
  void pollPostsStatus({ force: true });
  // Background unread checks are deliberately slow. Opening/focusing OX and
  // switching tabs already refresh immediately, so a 10-minute safety check
  // avoids spending Worker/D1 quota while customers simply read or listen.
  postsState.statusTimer = setInterval(() => {
    if (document.visibilityState === "visible") void pollPostsStatus();
  }, 600000);
}

function postsDateLabel(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderPosts() {
  if (!els.postsList) return;
  const list = Array.isArray(postsState.posts) ? postsState.posts : [];
  if (els.postsLoading) els.postsLoading.hidden = true;
  if (els.postsError) els.postsError.hidden = true;
  if (els.postsEmpty) els.postsEmpty.hidden = list.length > 0;

  els.postsList.innerHTML = list.map(post => {
    const body = escapeHtml(post.body || "").replace(/\n/g, "<br>");
    return `<article class="ox-post ${post.pinned ? "is-pinned" : ""}">
      <header class="ox-post-head">
        <div class="ox-post-head-copy">
          <h3>${escapeHtml(post.title || "Update")}</h3>
          <div class="ox-post-meta">${escapeHtml(postsDateLabel(post.publishedAt || post.updatedAt || post.createdAt))}</div>
        </div>
        ${post.pinned ? '<span class="ox-post-pin">Pinned</span>' : ""}
      </header>
      <div class="ox-post-body">${body}</div>
    </article>`;
  }).join("");
}

async function loadPosts({ silent = false } = {}) {
  if (!els.postsList || postsState.loading) return;
  postsState.loading = true;
  if (!silent && !postsState.loaded) {
    if (els.postsLoading) els.postsLoading.hidden = false;
    if (els.postsError) els.postsError.hidden = true;
    if (els.postsEmpty) els.postsEmpty.hidden = true;
  }
  try {
    const response = await fetch("/api/posts", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load posts.");
    postsState.posts = Array.isArray(payload.posts) ? payload.posts : [];
    postsState.loaded = true;
    renderPosts();
    if (getActivePanelName() === "posts") void markPostsSeen();
  } catch (error) {
    if (!silent) {
      if (els.postsLoading) els.postsLoading.hidden = true;
      if (els.postsError) els.postsError.hidden = false;
      if (els.postsEmpty) els.postsEmpty.hidden = true;
    }
    throw error;
  } finally {
    postsState.loading = false;
  }
}

function stopPostsPolling() {
  if (postsState.pollTimer) {
    clearInterval(postsState.pollTimer);
    postsState.pollTimer = null;
  }
}

function startPostsPolling() {
  stopPostsPolling();
  if (!els.postsTab) return;
  // Posts are not a real-time chat feed. Refresh once per minute only while
  // the Posts tab is actually open; entering/focusing the tab also refreshes.
  postsState.pollTimer = setInterval(() => {
    if (document.visibilityState === "visible" && getActivePanelName() === "posts") {
      void loadPosts({ silent: true }).catch(() => {});
    }
  }, 60000);
}

function setupPosts() {
  if (els.retryPosts) els.retryPosts.addEventListener("click", () => {
    void loadPosts({ silent: false }).catch(error => showToast(error.message || "Unable to load posts."));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (getActivePanelName() === "posts") {
      void loadPosts({ silent: true }).catch(() => {});
      void markPostsSeen();
    } else {
      void pollPostsStatus({ force: true });
    }
  });
  window.addEventListener("focus", () => {
    if (getActivePanelName() === "posts") {
      void loadPosts({ silent: true }).catch(() => {});
      void markPostsSeen();
    } else {
      void pollPostsStatus({ force: true });
    }
  });
  startPostsStatusPolling();
}

function renderAccessStatus() {
  const pill = els.accessStatusPill;
  if (!pill) return;

  const lifetimeCount = activeLifetimeAccessCount();
  const membership = membershipAccessDisplay();
  let text = membership.text;
  let tone = membership.tone;

  if (!state.loggedIn) {
    text = "Guest Mode";
    tone = "neutral";
  } else if (lifetimeCount > 0) {
    const lifetimeText = `${lifetimeCount} Lifetime${lifetimeCount === 1 ? "" : ""}`;
    if (text) {
      text = `${text} · ${lifetimeText}`;
    } else {
      text = lifetimeCount === 1 ? "1 Lifetime Story" : `${lifetimeCount} Lifetime Stories`;
      tone = "lifetime";
    }
  } else if (!text) {
    text = "Logged In";
    tone = "neutral";
  }

  pill.classList.remove("is-neutral", "is-member", "is-lifetime", "is-warning", "is-danger");
  pill.classList.add(`is-${tone}`);
  if (state.user?.testMode === true && state.loggedIn) text = `TEST · ${text}`;
  pill.textContent = text;
  pill.title = text;
  pill.hidden = false;
}

function updateMemberExperience() {
  if (state.lifetimePurchaseMode) {
    // /49 always keeps "Select a Story" visible. Membership is a shortcut back
    // to the normal Membership page for non-members; active members simply stay
    // on the story selector if they tap it.
    els.membershipTab.hidden = false;
    els.chatTab.hidden = true;
    els.supportButton.hidden = true;
    document.body.classList.toggle("member-active", state.membershipActive);
    switchTab("stories", false);
    setupStickyObservers();
    return;
  }

  const chatAccess = hasPaidChatAccess() && state.settings.showChat !== false;
  els.membershipTab.hidden = state.membershipActive;
  els.chatTab.hidden = !chatAccess;
  els.supportButton.hidden = !state.membershipActive || state.settings.showSupport === false;
  document.body.classList.toggle("member-active", state.membershipActive);
  setupStickyObservers();

  if (state.membershipActive) {
    const activeRoute = location.hash === "#posts"
      ? "posts"
      : (location.hash === "#chat" && state.settings.showChat !== false ? "chat" : "stories");
    switchTab(activeRoute, location.hash === "#membership" || (location.hash === "#chat" && activeRoute !== "chat"));
  } else if (location.hash === "#chat" && !chatAccess) {
    switchTab("stories");
  }
  startMemberChatPolling();

  // Telegram Backup status is account-level state, not Chat-tab state.
  // This lets the red ! and popup appear immediately after OX loads,
  // even if the customer stays on Stories or Posts.
  syncTelegramBackupForCurrentUser({ force: false });
}

function getDialogSurface(dialog) {
  return $("[role='dialog']", dialog);
}

function getFocusableElements(dialog) {
  return $$("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])", dialog)
    .filter(element => element.offsetParent !== null);
}

function getDialogHistoryName(dialog) {
  if (dialog === els.storyDialog) return "story";
  if (dialog === els.loginDialog) return "login";
  if (dialog === els.accountDialog) return "account";
  return "";
}

function openDialog(dialog, focusTarget, { fromHistory = false } = {}) {
  if (!hasOpenDialog()) {
    state.pageScrollY = window.scrollY;
    document.body.style.setProperty("--dialog-scroll-offset", `-${state.pageScrollY}px`);
  }
  state.dialogReturnFocus.set(dialog, document.activeElement);
  dialog.hidden = false;
  document.body.classList.add("dialog-open");
  if (!fromHistory) {
    history.pushState({ ...(history.state || {}), oxOverlay: getDialogHistoryName(dialog) }, "");
  }
  requestAnimationFrame(() => (focusTarget || getDialogSurface(dialog)).focus());
}

function setDialogActionNote(element, message = "") {
  if (!element) return;
  const text = String(message || "").trim();
  element.textContent = text;
  element.hidden = !text;
}

function configureDialogSecondaryAction({ text = "", note = "", action = "", disabled = false } = {}) {
  if (!els.dialogSecondaryAction) return;
  const visible = Boolean(String(text || "").trim());
  els.dialogSecondaryAction.hidden = !visible;
  els.dialogSecondaryAction.textContent = visible ? text : "";
  els.dialogSecondaryAction.disabled = Boolean(disabled);
  els.dialogSecondaryAction.dataset.action = visible ? action : "";
  els.dialogSecondaryAction.classList.toggle("is-lifetime-choice", visible && action === "purchase-lifetime");
  els.dialogSecondaryAction.classList.toggle("is-membership-choice", visible && action === "join-membership");
  if (els.dialogChoiceSeparator) els.dialogChoiceSeparator.hidden = !visible || Boolean(els.dialogAction?.disabled);
  setDialogActionNote(els.dialogSecondaryNote, visible ? note : "");
}

function openStoryDialog(story, options = {}) {
  state.selectedStory = story;
  els.dialogCoverWrap.classList.remove("image-failed");
  els.dialogCover.hidden = false;
  els.dialogCover.decoding = "async";
  els.dialogCover.fetchPriority = "high";
  els.dialogCover.src = story.cover;
  els.dialogCover.alt = `${story.title} cover`;
  els.dialogCategory.textContent = story.genre;
  els.dialogTitle.textContent = story.title;
  els.dialogDescription.textContent = story.description || (state.lifetimePurchaseMode ? "Select this story for lifetime access." : "Full audio story available to members.");

  setDialogActionNote(els.dialogActionNote, "");
  configureDialogSecondaryAction();

  if (state.lifetimePurchaseMode) {
    if (story.lifetimePurchased) {
      els.dialogStatus.classList.add("active");
      els.dialogStatusText.textContent = "Lifetime access active ✓";
      els.dialogAction.textContent = state.membershipActive ? "Play Story" : "Listen to Story";
      els.dialogAction.disabled = false;
      setDialogActionNote(els.dialogActionNote, "You already own permanent access to this story.");
      if (!state.membershipActive) {
        configureDialogSecondaryAction({
          text: "Join Membership",
          note: "Unlock every available story while your membership is active.",
          action: "join-membership"
        });
      }
    } else if (state.membershipActive) {
      els.dialogStatus.classList.add("active");
      els.dialogStatusText.textContent = "Membership active";
      els.dialogAction.textContent = "Play Story";
      els.dialogAction.disabled = false;
      if (story.purchasable !== false) {
        configureDialogSecondaryAction({
          text: "Purchase This Single Story — $65",
          note: "One-time payment. Keep this story even if your membership ends.",
          action: "purchase-lifetime"
        });
      }
    } else if (story.purchasable === false) {
      els.dialogStatus.classList.remove("active");
      els.dialogStatusText.textContent = "Lifetime purchase temporarily unavailable";
      els.dialogAction.textContent = "Unavailable";
      els.dialogAction.disabled = true;
      configureDialogSecondaryAction({
        text: "Join Membership",
        note: "Unlock every available story while your membership is active.",
        action: "join-membership"
      });
    } else {
      els.dialogStatus.classList.add("active");
      els.dialogStatusText.textContent = "$65 one-time · permanent access to this story";
      els.dialogAction.textContent = "Purchase This Single Story — $65";
      els.dialogAction.disabled = false;
      setDialogActionNote(els.dialogActionNote, "Pay once and keep permanent access to this story.");
      configureDialogSecondaryAction({
        text: "Join Membership",
        note: "Unlock every available story while your membership is active.",
        action: "join-membership"
      });
    }
  } else if (story.lifetimePurchased) {
    els.dialogStatus.classList.add("active");
    els.dialogStatusText.textContent = "Lifetime access active ✓";
    els.dialogAction.textContent = state.membershipActive ? "Play Story" : "Listen to Story";
    els.dialogAction.disabled = false;
  } else if (state.membershipActive) {
    els.dialogStatus.classList.add("active");
    els.dialogStatusText.textContent = "Membership active";
    els.dialogAction.textContent = "Play Story";
    els.dialogAction.disabled = false;
    configureDialogSecondaryAction({
      text: "Purchase This Single Story — $65",
      note: "One-time payment. Keep this story even if your membership ends.",
      action: "purchase-lifetime"
    });
  } else {
    els.dialogStatus.classList.remove("active");
    els.dialogStatusText.textContent = "Choose your access";
    els.dialogAction.textContent = "Join Membership";
    els.dialogAction.disabled = false;
    setDialogActionNote(els.dialogActionNote, "Unlock every available story while your membership is active.");
    if (story.purchasable !== false) {
      configureDialogSecondaryAction({
        text: "Purchase This Single Story — $65",
        note: "One-time payment. Keep permanent access to this story.",
        action: "purchase-lifetime"
      });
    }
  }

  openDialog(els.storyDialog, els.storyDialogClose, options);
}


let storyDialogSwipeStart = null;
let suppressStoryDialogClickUntil = 0;

function storySwipeList() {
  const filtered = Array.isArray(state.filtered) ? state.filtered : [];
  if (filtered.some(story => String(story.id) === String(state.selectedStory?.id))) return filtered;
  return Array.isArray(state.stories) ? state.stories : [];
}

function swipeStoryDialog(direction) {
  if (els.storyDialog.hidden || !state.selectedStory) return false;
  const stories = storySwipeList();
  if (stories.length < 2) return false;

  const currentIndex = stories.findIndex(story => String(story.id) === String(state.selectedStory.id));
  if (currentIndex < 0) return false;

  const nextIndex = direction === "left" ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= stories.length) return false;

  openStoryDialog(stories[nextIndex], { fromHistory: true });
  const surface = getDialogSurface(els.storyDialog);
  if (surface) surface.scrollTop = 0;
  return true;
}

const storySwipeSurface = getDialogSurface(els.storyDialog);

storySwipeSurface?.addEventListener("touchstart", event => {
  if (event.touches.length !== 1 || els.storyDialog.hidden) {
    storyDialogSwipeStart = null;
    return;
  }

  const touch = event.touches[0];
  storyDialogSwipeStart = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
}, { passive: true, capture: true });

storySwipeSurface?.addEventListener("touchend", event => {
  if (!storyDialogSwipeStart || event.changedTouches.length !== 1) return;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - storyDialogSwipeStart.x;
  const deltaY = touch.clientY - storyDialogSwipeStart.y;
  const duration = Date.now() - storyDialogSwipeStart.time;
  storyDialogSwipeStart = null;

  const isHorizontalSwipe =
    duration <= 1000 &&
    Math.abs(deltaX) >= 38 &&
    Math.abs(deltaX) >= Math.abs(deltaY) * 1.1;

  if (!isHorizontalSwipe) return;

  // If a swipe starts over Join / Purchase / Close, suppress the synthetic
  // click that some mobile browsers may fire after the gesture.
  suppressStoryDialogClickUntil = Date.now() + 500;
  swipeStoryDialog(deltaX < 0 ? "left" : "right");
}, { passive: true, capture: true });

storySwipeSurface?.addEventListener("touchcancel", () => {
  storyDialogSwipeStart = null;
}, { passive: true, capture: true });

storySwipeSurface?.addEventListener("click", event => {
  if (Date.now() >= suppressStoryDialogClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}, true);

function closeDialog(dialog) {
  if (dialog.hidden) return;
  dialog.hidden = true;
  if (els.storyDialog.hidden && els.loginDialog.hidden && els.accountDialog.hidden) {
    document.body.classList.remove("dialog-open");
    document.body.style.removeProperty("--dialog-scroll-offset");
    const scrollY = state.pageScrollY;
    state.pageScrollY = null;
    if (Number.isFinite(scrollY)) {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      requestAnimationFrame(() => { document.documentElement.style.scrollBehavior = previousBehavior; });
    }
  }

  const returnTarget = state.dialogReturnFocus.get(dialog);
  state.dialogReturnFocus.delete(dialog);
  if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));

  state.historyClosing.delete(dialog);
  const afterClose = state.dialogAfterClose.get(dialog);
  state.dialogAfterClose.delete(dialog);
  if (afterClose) {
    afterClose();
  } else if (!hasOpenDialog()) {
  }
}

function dismissDialog(dialog, afterClose) {
  if (dialog.hidden || state.historyClosing.has(dialog)) return;
  if (afterClose) state.dialogAfterClose.set(dialog, afterClose);

  if (history.state?.oxOverlay === getDialogHistoryName(dialog)) {
    state.historyClosing.add(dialog);
    history.back();
  } else {
    closeDialog(dialog);
  }
}

async function openSelectedStory() {
  const story = state.selectedStory;
  if (!story) return;

  if (state.lifetimePurchaseMode && !story.lifetimePurchased && !state.membershipActive) {
    if (story.purchasable === false) return;
    if (!state.loggedIn) {
      dismissDialog(els.storyDialog, () => requestAnimationFrame(openGoogleLogin));
      return;
    }
    await beginLifetimeStoryPayment(story, els.dialogAction);
    return;
  }

  if (!state.membershipActive && !story.lifetimePurchased) {
    dismissDialog(els.storyDialog, () => {
      // The story dialog freezes the document while it is open. Wait one frame
      // for its saved Stories scroll position to be restored before using the
      // same tab-switch positioning that already works from the sticky tabs.
      requestAnimationFrame(() => {
        switchTab("membership", true, true);
        showToast("Join the membership to unlock this story.");
        requestAnimationFrame(() => $(".membership-join-button", els.membershipTrack)?.focus({ preventScroll: true }));
      });
    });
    return;
  }

  // B9 protected-player switch. OFF deliberately preserves the proven direct
  // Google Drive fallback. ON creates the existing encrypted Player handoff.
  if (!state.protectedPlayerEnabled) {
    let driveWindow = null;
    try {
      driveWindow = window.open("about:blank", "_blank");
      if (driveWindow) driveWindow.opener = null;
    } catch {}
    try {
      const response = await fetch(`/api/story/${encodeURIComponent(story.id)}/open`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        try { driveWindow?.close(); } catch {}
        showToast(payload.error || "Unable to open this story right now.");
        return;
      }
      if (driveWindow) driveWindow.location.replace(payload.url);
      else location.href = payload.url;
    } catch {
      try { driveWindow?.close(); } catch {}
      showToast("Unable to open Google Drive right now.");
    }
    return;
  }

  const targetName = `oxPlayerHandoff_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let playerWindow = null;
  try {
    playerWindow = window.open("about:blank", targetName);
    if (playerWindow) playerWindow.opener = null;
  } catch {}

  try {
    const response = await fetch(`/api/story/${encodeURIComponent(story.id)}/player-handoff`, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.playerUrl || !payload.token) {
      try { playerWindow?.close(); } catch {}
      showToast(payload.error || "Unable to create the secure Listen connection.");
      return;
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = payload.playerUrl;
    form.target = playerWindow ? targetName : "_self";
    form.rel = "noopener noreferrer";
    form.hidden = true;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "token";
    input.value = payload.token;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  } catch {
    try { playerWindow?.close(); } catch {}
    showToast("Unable to open the secure OX Player right now.");
  }

}



function memberInitials(user = state.user) {
  const name = String(user?.name || "").trim();
  if (!name) return "ME";
  return name.split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase();
}
function setMemberAvatar(element, user = state.user) {
  if (!element) return;
  const url = String(user?.profileImage || "").trim();
  element.classList.toggle("has-custom-image", Boolean(url));
  element.style.backgroundImage = url ? `url("${url.replaceAll('"','%22')}?v=${Date.now()}")` : "";
  element.textContent = url ? "" : memberInitials(user);
}
async function prepareMemberProfileImage(file) {
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .86));
  if (!blob) throw new Error("Unable to prepare that image.");
  return blob;
}
async function uploadMemberProfileImage(file) {
  const blob = await prepareMemberProfileImage(file);
  const response = await fetch("/api/account/profile-image", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": blob.type || "image/webp" }, body: blob
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to save profile picture.");
  await refreshMemberSession();
  updateAccountDialog();
}
async function removeMemberProfileImage() {
  const response = await fetch("/api/account/profile-image", { method: "DELETE", credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to remove profile picture.");
  await refreshMemberSession();
  updateAccountDialog();
}

function memberChatReceipt(stateValue = "") {
  const value = String(stateValue || "sent").toLowerCase();
  const stateClass = value === "seen" ? "is-seen" : (value === "delivered" ? "is-delivered" : "is-sent");
  const label = value === "seen" ? "Seen" : (value === "delivered" ? "Delivered" : "Sent");
  const ticks = value === "sent" ? "✓" : "✓✓";
  return `<span class="member-chat-receipt ${stateClass}" aria-label="${label}" title="${label}">${ticks}</span>`;
}
function memberChatClock(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function memberChatIsNearBottom(messages) {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 84;
}
function updateMemberChatUnread(count) {
  const unread = Math.max(0, Number(count) || 0);
  memberChatState.unread = unread;
  if (!els.chatTabUnread) return;
  els.chatTabUnread.textContent = unread > 99 ? "99+" : String(unread);
  els.chatTabUnread.setAttribute("aria-label", `${unread} unread message${unread === 1 ? "" : "s"}`);
  els.chatTabUnread.hidden = unread === 0;
}

function updateTelegramTabAlert() {
  const badge = els.telegramTabAlert;
  if (!badge) return;

  const connection = telegramBackupState.connection || {};
  const joined =
    connection.joined === true ||
    String(connection.status || "") === "joined";

  const needsAttention =
    hasPaidChatAccess() &&
    state.settings.showChat !== false &&
    telegramBackupState.loaded === true &&
    telegramBackupState.configured === true &&
    !joined;

  badge.hidden = !needsAttention;

  if (!needsAttention) return;

  const stage = telegramBackupStage(connection);

  let label = "Telegram Backup needs setup";

  if (stage === "linked") {
    label = "Finish joining OX Novels Backup";
  }

  if (stage === "left") {
    label = "Rejoin OX Novels Backup";
  }

  badge.textContent = "!";
  badge.setAttribute("aria-label", label);
  badge.title = label;
}

function telegramBackupStage(connection = {}) {
  if (!connection.connected) return "not_connected";
  if (String(connection.status || "") === "left") return "left";
  return "linked";
}

function closeTelegramBackupAlert() {
  if (!els.telegramBackupAlert) return;
  els.telegramBackupAlert.hidden = true;
  document.body.classList.remove("telegram-alert-open");
}

function maybeShowTelegramBackupAlert(connection = {}) {
  const layer = els.telegramBackupAlert;
  if (!layer || !telegramBackupState.loaded || !telegramBackupState.configured) return;
  if (!hasPaidChatAccess() || state.settings.showChat === false) return;

  const joined = connection.joined === true || connection.status === "joined";
  if (joined) {
    telegramBackupState.alertKey = "joined";
    closeTelegramBackupAlert();
    return;
  }

  const stage = telegramBackupStage(connection);
  const eventStamp = stage === "left"
    ? (connection.leftAt || "left")
    : (connection.linkedAt || stage);

  const key = `${stage}:${eventStamp}`;

  // Show one popup for each meaningful Telegram state during this page visit.
  // The small Chat banner stays visible until the user actually joins.
  if (telegramBackupState.alertKey === key) return;
  telegramBackupState.alertKey = key;

  let title = "Connect Telegram Backup";
  let text = "Your OX access includes the private Telegram Backup channel. Connect Telegram to finish setting up your backup access.";
  let action = "Connect Telegram";

  if (stage === "linked") {
    title = "Finish Telegram Backup Setup";
    text = connection.username
      ? `Telegram @${connection.username} is connected to your OX account. Join the private backup channel to complete setup.`
      : "Your Telegram account is connected to OX. Join the private backup channel to complete setup.";
    action = "Finish Joining";
  }

  if (stage === "left") {
    title = "Telegram Backup Disconnected";
    text = "You are no longer inside the private OX Novels Backup channel. Rejoin to restore your backup access.";
    action = "Rejoin Backup";
  }

  if (els.telegramBackupAlertTitle) {
    els.telegramBackupAlertTitle.textContent = title;
  }

  if (els.telegramBackupAlertText) {
    els.telegramBackupAlertText.textContent = text;
  }

  if (els.telegramBackupAlertAction) {
    els.telegramBackupAlertAction.textContent = action;
    els.telegramBackupAlertAction.disabled = false;
  }

  layer.dataset.telegramState = stage;
  layer.hidden = false;
  document.body.classList.add("telegram-alert-open");
}

function renderTelegramBackupReminder() {
  const box = els.telegramBackupReminder;
  const button = els.telegramBackupAction;
  updateTelegramTabAlert();
  if (!box || !button) return;

  if (!hasPaidChatAccess() || state.settings.showChat === false) {
    box.hidden = true;
    closeTelegramBackupAlert();
    return;
  }

  const connection = telegramBackupState.connection || {};
  const joined = connection.joined === true || connection.status === "joined";

  if (joined) {
    box.hidden = true;
    telegramBackupState.alertKey = "joined";
    closeTelegramBackupAlert();
    return;
  }

  box.hidden = false;

  if (!telegramBackupState.configured) {
    box.dataset.telegramState = "unavailable";
    els.telegramBackupTitle.textContent = "Telegram Backup";
    els.telegramBackupText.textContent = "Telegram Backup is being configured. Your OX Chat access is unaffected.";
    button.hidden = true;
    closeTelegramBackupAlert();
    return;
  }

  button.hidden = false;

  const stage = telegramBackupStage(connection);
  box.dataset.telegramState = stage;

  if (stage === "left") {
    els.telegramBackupTitle.textContent = "Telegram Backup disconnected";
    els.telegramBackupText.textContent = "You left the private backup channel. Rejoin whenever you're ready.";
    button.textContent = "Rejoin Backup";
  } else if (stage === "linked") {
    els.telegramBackupTitle.textContent = "Finish Telegram Backup setup";
    els.telegramBackupText.textContent = connection.username
      ? `@${connection.username} is linked. Join the private channel to finish.`
      : "Telegram is linked. Join the private channel to finish.";
    button.textContent = "Finish Joining";
  } else {
    els.telegramBackupTitle.textContent = "Join OX Novels Backup";
    els.telegramBackupText.textContent = "Connect Telegram for secure private backup access.";
    button.textContent = "Connect Telegram";
  }

  maybeShowTelegramBackupAlert(connection);
}

async function loadTelegramBackupStatus({ silent = true, force = false } = {}) {
  const currentUserKey = String(
    state.user?.id ||
    state.user?.email ||
    ""
  );

  // Never let Telegram state from a previous login leak into
  // another account in the same browser tab.
  if (telegramBackupState.userKey !== currentUserKey) {
    telegramBackupState.userKey = currentUserKey;
    telegramBackupState.loaded = false;
    telegramBackupState.loading = false;
    telegramBackupState.connection = null;
    telegramBackupState.configured = false;
    telegramBackupState.alertKey = "";
    telegramBackupState.lastLoadedAt = 0;
    updateTelegramTabAlert();
    closeTelegramBackupAlert();
  }

  if (
    !hasPaidChatAccess() ||
    state.settings.showChat === false ||
    telegramBackupState.loading
  ) {
    renderTelegramBackupReminder();
    return;
  }

  // Chat polls frequently for messages. Telegram membership does
  // not need another HTTP/D1 request every six seconds.
  // Returning from Telegram still uses force:true and bypasses this.
  const now = Date.now();

  if (
    !force &&
    telegramBackupState.loaded &&
    telegramBackupState.lastLoadedAt &&
    now - telegramBackupState.lastLoadedAt < 300000
  ) {
    renderTelegramBackupReminder();
    return;
  }

  telegramBackupState.loading = true;

  try {
    const endpoint = force
      ? "/api/telegram/status?force=1"
      : "/api/telegram/status";

    const response = await fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin"
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error || "Unable to check Telegram Backup."
      );
    }

    telegramBackupState.loaded = true;
    telegramBackupState.configured = payload.configured === true;
    telegramBackupState.botUsername =
      payload.botUsername || "OXNovelsBackupBot";
    telegramBackupState.connection = payload.connection || null;
    telegramBackupState.lastLoadedAt = Date.now();
  } catch (error) {
    if (!silent) {
      showToast(
        error.message || "Unable to check Telegram Backup."
      );
    }
  } finally {
    telegramBackupState.loading = false;
    renderTelegramBackupReminder();
  }
}

function syncTelegramBackupForCurrentUser({ force = false } = {}) {
  // /49 does not need Telegram Backup UI.
  if (state.lifetimePurchaseMode) return;

  const eligible =
    hasPaidChatAccess() &&
    state.settings.showChat !== false;

  if (!eligible) {
    telegramBackupState.userKey = String(
      state.user?.id ||
      state.user?.email ||
      ""
    );

    telegramBackupState.loaded = false;
    telegramBackupState.loading = false;
    telegramBackupState.connection = null;
    telegramBackupState.configured = false;
    telegramBackupState.alertKey = "";
    telegramBackupState.lastLoadedAt = 0;

    updateTelegramTabAlert();

    if (els.telegramBackupReminder) {
      els.telegramBackupReminder.hidden = true;
    }

    closeTelegramBackupAlert();
    return;
  }

  void loadTelegramBackupStatus({
    silent: true,
    force
  });
}

function prepareTelegramExternalWindow() {
  try {
    const external = window.open("about:blank", "_blank");

    if (!external) return null;

    try {
      external.opener = null;
      external.document.open();
      external.document.write(`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preparing Telegram</title>
</head>
<body style="
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:24px;
  box-sizing:border-box;
  background:#f7f9fa;
  color:#253238;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
">
  <main style="
    width:min(420px,100%);
    padding:32px 24px;
    box-sizing:border-box;
    border:1px solid #dce5e8;
    border-radius:20px;
    background:#fff;
    text-align:center;
    box-shadow:0 18px 55px rgba(25,45,49,.12);
  ">
    <div style="
      width:58px;
      height:58px;
      margin:0 auto 16px;
      display:grid;
      place-items:center;
      border-radius:50%;
      background:#2aabee;
      color:#fff;
      font-size:27px;
    ">✈</div>

    <h1 style="margin:0 0 9px;font-size:22px;">
      Preparing Telegram…
    </h1>

    <p style="margin:0;color:#68767c;font-size:14px;line-height:1.5;">
      Creating your secure OX Novels Backup link.
    </p>
  </main>
</body>
</html>`);
      external.document.close();
    } catch {}

    return external;
  } catch {
    return null;
  }
}

function showTelegramExternalHandoff(external, target, mode = "connect") {
  if (!external || !target) return;

  let title = "Opening Telegram";
  let instruction =
    "Telegram may take a few seconds to open. Press Start once if Telegram asks.";

  if (mode === "finish_joining") {
    title = "Opening OX Novels Backup";
    instruction =
      "Telegram may take a few seconds to open. Tap Request to Join Channel to finish setup.";
  }

  if (mode === "rejoin") {
    title = "Reopening OX Novels Backup";
    instruction =
      "Telegram may take a few seconds to open. Tap Request to Join Channel to restore access.";
  }

  const safeTarget = String(target)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  try {
    external.document.open();
    external.document.write(`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>

<body style="
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:22px;
  box-sizing:border-box;
  background:#f7f9fa;
  color:#253238;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
">

  <main style="
    width:min(430px,100%);
    padding:30px 22px;
    box-sizing:border-box;
    border:1px solid #dce5e8;
    border-radius:20px;
    background:#fff;
    text-align:center;
    box-shadow:0 18px 55px rgba(25,45,49,.12);
  ">

    <div style="
      width:60px;
      height:60px;
      margin:0 auto 15px;
      display:grid;
      place-items:center;
      border-radius:50%;
      background:#2aabee;
      color:white;
      font-size:28px;
    ">✈</div>

    <div style="
      margin-bottom:6px;
      color:#158fc9;
      font-size:11px;
      font-weight:800;
      letter-spacing:1.1px;
    ">
      OX NOVELS BACKUP
    </div>

    <h1 style="
      margin:0 0 10px;
      font-size:23px;
      line-height:1.2;
    ">
      ${title}
    </h1>

    <p id="telegramHandoffStatus" style="
      margin:0 auto 20px;
      max-width:340px;
      color:#68767c;
      font-size:14px;
      line-height:1.55;
    ">
      ${instruction}
    </p>

    <a href="${safeTarget}" style="
      min-height:50px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:13px;
      background:#13c3b3;
      color:#fff;
      font-size:15px;
      font-weight:800;
      text-decoration:none;
    ">
      Open Telegram
    </a>

    <p style="
      margin:15px 0 0;
      color:#89969b;
      font-size:11px;
      line-height:1.5;
    ">
      OX Novels is still open in your original browser tab.
      You can close this tab after Telegram opens.
    </p>

  </main>

<script>
setTimeout(function () {
  var status = document.getElementById("telegramHandoffStatus");
  if (status) {
    status.textContent =
      "If Telegram did not open automatically, tap Open Telegram below.";
  }
}, 4000);
<\/script>

</body>
</html>`);

    external.document.close();
  } catch {}
}

async function connectTelegramBackup() {
  if (!hasPaidChatAccess()) return;

  const button = els.telegramBackupAction;
  const alertButton = els.telegramBackupAlertAction;

  // Open the new browser tab immediately while the click still counts as a
  // trusted user gesture. This prevents Telegram from replacing the OX tab.
  const externalWindow = prepareTelegramExternalWindow();

  if (!externalWindow) {
    showToast("Your browser blocked the Telegram tab. Allow pop-ups for OX Novels and try again.");
    return;
  }

  telegramBackupState.externalWindow = externalWindow;

  if (button) {
    button.disabled = true;
    button.textContent = "Preparing…";
  }

  if (alertButton) {
    alertButton.disabled = true;
    alertButton.textContent = "Preparing…";
  }

  try {
    const response = await fetch("/api/telegram/link", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error || "Unable to connect Telegram Backup."
      );
    }

    if (payload.alreadyJoined) {
      try { externalWindow.close(); } catch {}

      telegramBackupState.connection =
        payload.connection ||
        { connected: true, joined: true, status: "joined" };

      renderTelegramBackupReminder();
      showToast("Telegram Backup is already joined.");
      return;
    }

    const target = String(
      payload.joinLink || payload.deepLink || ""
    ).trim();

    if (!target) {
      throw new Error("Telegram connection link was not returned.");
    }

    if (payload.connection) {
      telegramBackupState.connection = payload.connection;
    }

    closeTelegramBackupAlert();

    // Keep OX open in the original tab.
    // The separate handoff page explains the short Android/Telegram delay and
    // includes a manual fallback button.
    showTelegramExternalHandoff(
      externalWindow,
      target,
      payload.mode || "connect"
    );

    setTimeout(() => {
      try {
        externalWindow.location.href = target;
      } catch {}
    }, 650);

    if (payload.mode === "rejoin") {
      showToast("Telegram is opening separately. It may take a few seconds — request access to rejoin.");
    } else if (payload.mode === "finish_joining") {
      showToast("Telegram is opening separately. It may take a few seconds — finish joining the private channel.");
    } else {
      showToast("Telegram is opening separately. It may take a few seconds — press Start once if Telegram asks.");
    }

    // If the customer quickly returns without Telegram firing the webhook,
    // this gives us another early opportunity to synchronize.
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        void loadTelegramBackupStatus({
          silent: true,
          force: true
        });
      }
    }, 1800);

  } catch (error) {
    try { externalWindow.close(); } catch {}

    showToast(
      error.message || "Unable to connect Telegram Backup."
    );
  } finally {
    if (button) button.disabled = false;
    if (alertButton) alertButton.disabled = false;
    renderTelegramBackupReminder();
  }
}

function setupTelegramBackupAlert() {
  const layer = els.telegramBackupAlert;
  if (!layer || layer.dataset.telegramReady === "true") return;

  layer.dataset.telegramReady = "true";

  els.telegramBackupAlertAction?.addEventListener(
    "click",
    () => void connectTelegramBackup()
  );

  els.telegramBackupAlertClose?.addEventListener(
    "click",
    closeTelegramBackupAlert
  );

  els.telegramBackupAlertLater?.addEventListener(
    "click",
    closeTelegramBackupAlert
  );

  layer.querySelector("[data-telegram-alert-scrim]")?.addEventListener(
    "click",
    closeTelegramBackupAlert
  );

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      els.telegramBackupAlert &&
      !els.telegramBackupAlert.hidden
    ) {
      closeTelegramBackupAlert();
    }
  });
}

function renderMemberChatMessages({ forceBottom = false } = {}) {
  const messages = $("#memberChatPreviewMessages");
  if (!messages) return;
  const nearBottom = memberChatIsNearBottom(messages);
  if (!memberChatState.messages.length) {
    messages.innerHTML = '<div class="member-chat-empty-state"><strong>No messages yet</strong><span>Send a message to start your private conversation with the site admin.</span></div>';
  } else {
    messages.innerHTML = memberChatState.messages.map(message => {
      const outgoing = message.sender === "member";
      const meta = outgoing
        ? `<div class="member-chat-meta"><time>${escapeHtml(memberChatClock(message.createdAt))}</time>${memberChatReceipt(message.state)}</div>`
        : `<time>${escapeHtml(memberChatClock(message.createdAt))}</time>`;
      return `<div class="member-chat-message ${outgoing ? "outgoing" : "incoming"}" data-chat-message-id="${Number(message.id) || 0}"><div class="member-chat-bubble">${escapeHtml(message.body || "")}</div>${meta}</div>`;
    }).join("");
  }
  if (forceBottom || nearBottom) requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; messages.dispatchEvent(new Event("scroll")); });
}
async function loadMemberChat({ seen = false, forceBottom = false } = {}) {
  if (!hasPaidChatAccess()) return;
  const response = await fetch(`/api/chat/messages${seen ? "?seen=1" : ""}`, { cache: "no-store", credentials: "same-origin" });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload.error || "Unable to load Chat.");
  memberChatState.messages = Array.isArray(payload.messages) ? payload.messages : [];
  memberChatState.loaded = true;
  updateMemberChatUnread(payload.unread || 0);
  renderMemberChatMessages({ forceBottom });
  void loadTelegramBackupStatus({ silent: true });
}
async function pollMemberChat() {
  if (!hasPaidChatAccess() || state.settings.showChat === false) {
    updateMemberChatUnread(0);
    return;
  }
  const chatOpen = getActivePanelName() === "chat" && !document.hidden;
  try {
    if (chatOpen) {
      // Chat remains responsive only while the customer is actually looking at it.
      await loadMemberChat({ seen: true, forceBottom: false });
    } else {
      // When Chat is closed, a 10-minute unread safety check is enough.
      // Focus/tab-entry paths still refresh immediately.
      const now = Date.now();
      if (memberChatState.lastBackgroundStatusAt && now - memberChatState.lastBackgroundStatusAt < 600000) return;
      memberChatState.lastBackgroundStatusAt = now;
      const response = await fetch("/api/chat/status", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) updateMemberChatUnread(payload.unread || 0);
    }
  } catch {}
}
function startMemberChatPolling() {
  if (memberChatState.pollTimer) clearInterval(memberChatState.pollTimer);
  if (!hasPaidChatAccess() || state.settings.showChat === false) {
    memberChatState.pollTimer = null;
    updateMemberChatUnread(0);
    return;
  }
  void pollMemberChat();
  // Ten-second ticks are client-side only when Chat is closed; the function
  // above suppresses background network calls for ten minutes at a time.
  memberChatState.pollTimer = setInterval(pollMemberChat, 10000);
}
function setupMemberChat() {
  const form = $("#memberChatPreviewForm");
  const input = $("#memberChatPreviewInput");
  const messages = $("#memberChatPreviewMessages");
  if (!form || !input || !messages || form.dataset.chatReady === "true") return;
  form.dataset.chatReady = "true";
  if (els.telegramBackupAction) els.telegramBackupAction.addEventListener("click", () => void connectTelegramBackup());
  void loadTelegramBackupStatus({ silent: true });

  const shell = messages.closest(".member-chat-shell");
  let jumpLatest = shell?.querySelector(".member-chat-jump-latest");
  if (shell && !jumpLatest) {
    jumpLatest = document.createElement("button");
    jumpLatest.type = "button";
    jumpLatest.className = "member-chat-jump-latest";
    jumpLatest.hidden = true;
    jumpLatest.setAttribute("aria-label", "Jump to newest messages");
    jumpLatest.setAttribute("title", "Jump to newest messages");
    jumpLatest.innerHTML = '<span aria-hidden="true">↓</span>';
    shell.append(jumpLatest);
  }

  const updateJumpLatest = () => {
    if (!jumpLatest) return;
    jumpLatest.hidden = memberChatIsNearBottom(messages) || !memberChatState.messages.length;
  };
  jumpLatest?.addEventListener("click", () => {
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(updateJumpLatest);
  });
  messages.addEventListener("scroll", updateJumpLatest, { passive: true });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || memberChatState.sending) return;
    memberChatState.sending = true;
    const sendButton = form.querySelector("button[type='submit']");
    if (sendButton) sendButton.disabled = true;
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to send message.");
      input.value = "";
      await loadMemberChat({ seen: true, forceBottom: true });
    } catch (error) {
      showToast(error.message || "Unable to send message.");
    } finally {
      memberChatState.sending = false;
      if (sendButton) sendButton.disabled = false;
      input.focus({ preventScroll: true });
    }
  });
}

function filterStories(query) {
  applyStoryFilters();
  const activeTab = els.tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.dataset.tab;
  if (activeTab !== "stories") switchTab("stories", true, true);


}

function getVisibleTabs() {
  return els.tabs.filter(tab => !tab.hidden);
}

function activateProfileTab(tab) {
  if (state.lifetimePurchaseMode && tab?.dataset?.tab === "membership") {
    if (!state.membershipActive) location.assign("/#membership");
    return;
  }
  switchTab(tab.dataset.tab, true, true);
}

els.tabs.forEach(tab => {
  tab.addEventListener("click", () => activateProfileTab(tab));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const visibleTabs = getVisibleTabs();
    const index = visibleTabs.indexOf(tab);
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % visibleTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = visibleTabs.length - 1;
    activateProfileTab(visibleTabs[nextIndex]);
    visibleTabs[nextIndex].focus();
  });
});

function setupMembershipCarousel() {
  membershipCarouselCleanup?.();
  membershipCarouselCleanup = null;
  const track = els.membershipTrack;
  const container = els.membershipTiers;
  const dots = els.membershipDots;
  if (!track || !container || !dots) return;
  $$('[data-carousel-clone="true"]', track).forEach(clone => clone.remove());
  container.classList.remove('has-multiple-tiers');
  dots.innerHTML = '';
  dots.hidden = true;
  track.scrollLeft = 0;
  $$('[data-membership-tier]', track).forEach(card => {
    card.removeAttribute('aria-hidden');
    card.removeAttribute('data-tier-index');
  });
}

function clearSearch({ refocus = true } = {}) {
  els.searchInput.value = "";
  state.lastSearchQuery = "";
  filterStories("");
  if (refocus) els.searchInput.focus({ preventScroll: true });
}

function updateSearchMode() {
  const mobileSearchOpen = document.body.classList.contains("search-ui-open");
  const queryActive = Boolean(els.searchInput.value.trim());
  const inputFocused = document.activeElement === els.searchInput;
  state.searchActive = mobileSearchOpen || queryActive || inputFocused;
  document.body.classList.toggle("search-active", state.searchActive);
}

function closeMobileSearch({ restoreFocus = true } = {}) {
  // Close is always also Clear, regardless of whether Close, the magnifier, a
  // tab change, or Escape closed the UI. This prevents stale search results.
  els.searchInput.value = "";
  state.lastSearchQuery = "";
  state.searchRelated = false;
  applyStoryFilters();

  els.searchInput.blur();
  document.body.classList.remove("search-ui-open");
  syncMobileSearchPin(false);
  els.searchToggle.setAttribute("aria-expanded", "false");
  els.searchToggle.setAttribute("aria-label", "Open story search");
  updateSearchMode();
  requestAnimationFrame(setupStickyObservers);
  if (restoreFocus && els.searchToggle.offsetParent !== null) els.searchToggle.focus({ preventScroll: true });
}

els.searchToggle.addEventListener("click", () => {
  const opening = !document.body.classList.contains("search-ui-open");

  // The magnifier is also a true close control once search is open.
  if (!opening) {
    closeMobileSearch({ restoreFocus: false });
    return;
  }

  document.body.classList.add("search-ui-open");
  els.searchToggle.setAttribute("aria-expanded", "true");
  els.searchToggle.setAttribute("aria-label", "Close story search");
  updateSearchMode();

  requestAnimationFrame(() => {
    setupStickyObservers();
    els.searchInput.focus({ preventScroll: true });
    syncMobileSearchPin();
  });
});

els.searchClose.addEventListener("click", () => closeMobileSearch());
els.headerSearch.addEventListener("submit", event => {
  event.preventDefault();
  filterStories(els.searchInput.value);
  state.lastSearchQuery = normalizeSearchText(els.searchInput.value);
  requestAnimationFrame(anchorSearchResults);
  els.searchInput.blur();
  setupStickyObservers();
});
els.searchInput.addEventListener("input", () => {
  const nextQuery = normalizeSearchText(els.searchInput.value);
  const startingSearch = Boolean(nextQuery) && !state.lastSearchQuery;
  filterStories(els.searchInput.value);
  state.lastSearchQuery = nextQuery;
  updateSearchMode();
  if (startingSearch) requestAnimationFrame(anchorSearchResults);
  if (document.activeElement === els.searchInput) syncMobileSearchPin();
});
els.searchInput.addEventListener("focus", () => {
  updateSearchMode();
  syncMobileSearchPin();
});
els.searchInput.addEventListener("blur", () => requestAnimationFrame(() => {
  updateSearchMode();
  syncMobileSearchPin(false);
}));
els.searchInput.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  if (document.body.classList.contains("search-ui-open")) closeMobileSearch();
  else clearSearch();
});
els.allStoriesFilter?.addEventListener("click", () => {
  state.genreFilter = "all";
  state.genreMenuOpen = false;
  renderGenreFilters();
  applyStoryFilters();
  requestAnimationFrame(alignStoryGridStart);
});
els.genreFilterToggle?.addEventListener("click", () => {
  state.genreMenuOpen = !state.genreMenuOpen;
  renderGenreFilters();
  requestAnimationFrame(setupStickyObservers);
});
document.addEventListener("click", event => {
  if (!state.genreMenuOpen) return;
  if (els.genreMenu?.contains(event.target) || els.genreFilterToggle?.contains(event.target)) return;
  state.genreMenuOpen = false;
  renderGenreFilters();
});

els.retryStories.addEventListener("click", loadData);
els.dialogCover.addEventListener("load", () => els.dialogCoverWrap.classList.remove("image-failed"));
els.dialogCover.addEventListener("error", () => els.dialogCoverWrap.classList.add("image-failed"));

els.storyDialogClose.addEventListener("click", () => dismissDialog(els.storyDialog));
els.loginDialogClose.addEventListener("click", () => dismissDialog(els.loginDialog));
els.accountDialogClose.addEventListener("click", () => dismissDialog(els.accountDialog));
els.accountDialogDone.addEventListener("click", () => dismissDialog(els.accountDialog));
els.accountRefreshPaypal?.addEventListener("click", refreshPaypalMembershipStatus);

[els.storyDialog, els.loginDialog, els.accountDialog].forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dismissDialog(dialog);
  });
});

document.addEventListener("keydown", event => {
  const openDialogElement = !els.accountDialog.hidden
    ? els.accountDialog
    : (!els.loginDialog.hidden ? els.loginDialog : (!els.storyDialog.hidden ? els.storyDialog : null));
  if (!openDialogElement) return;

  if (event.key === "Escape") {
    event.preventDefault();
    dismissDialog(openDialogElement);
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(openDialogElement);
  if (!focusable.length) {
    event.preventDefault();
    getDialogSurface(openDialogElement).focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

els.dialogAction.addEventListener("click", openSelectedStory);
els.dialogSecondaryAction?.addEventListener("click", async () => {
  const action = els.dialogSecondaryAction.dataset.action || "";
  if (action === "join-membership") {
    dismissDialog(els.storyDialog, () => {
      if (state.lifetimePurchaseMode) location.assign("/#membership");
      else switchTab("membership", true, true);
    });
    return;
  }
  if (action === "purchase-lifetime") {
    const story = state.selectedStory;
    if (!story) return;
    if (!state.loggedIn) {
      dismissDialog(els.storyDialog, () => requestAnimationFrame(openGoogleLogin));
      return;
    }
    await beginLifetimeStoryPayment(story, els.dialogSecondaryAction);
  }
});

let lifetimeReturnProgress = null;
let lifetimeReturnLock = null;

function lockLifetimeReturnInteraction() {
  if (!state.lifetimePurchaseMode || lifetimeReturnLock) return;
  const blocker = document.createElement("div");
  blocker.id = "lifetimeReturnInteractionLock";
  blocker.setAttribute("aria-hidden", "true");
  blocker.style.position = "fixed";
  blocker.style.inset = "0";
  blocker.style.zIndex = "2147483000";
  blocker.style.cursor = "progress";
  blocker.style.background = "rgba(255,255,255,.04)";
  blocker.style.backdropFilter = "blur(.6px)";
  blocker.style.webkitBackdropFilter = "blur(.6px)";
  blocker.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); }, true);
  blocker.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); }, true);
  blocker.addEventListener("pointerdown", event => { event.preventDefault(); event.stopPropagation(); }, true);
  document.body.appendChild(blocker);
  document.documentElement.setAttribute("aria-busy", "true");
  const keyBlocker = event => {
    if (["Tab", "Enter", " ", "Escape", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener("keydown", keyBlocker, true);
  lifetimeReturnLock = { blocker, keyBlocker };
}

function unlockLifetimeReturnInteraction() {
  if (!lifetimeReturnLock) return;
  document.removeEventListener("keydown", lifetimeReturnLock.keyBlocker, true);
  lifetimeReturnLock.blocker?.remove();
  lifetimeReturnLock = null;
  document.documentElement.removeAttribute("aria-busy");
}

function dodoLifetimeTestModeEnabled() {
  try {
    const params = new URL(location.href).searchParams;
    return state.lifetimePurchaseMode && params.get("dodo_test") === "1";
  } catch {
    return false;
  }
}

async function beginDodoLifetimeStoryPayment(story, actionButton) {
  const originalText = actionButton.textContent;
  const startedAt = Date.now();
  let leavingForDodo = false;
  actionButton.disabled = true;
  const countdown = startButtonCountdown(actionButton, "Preparing secure Dodo test checkout…", 10);
  try {
    const response = await fetch("/api/story-purchases/dodo-test-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: story.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === "LOGIN_REQUIRED") { openGoogleLogin(); return; }
      throw new Error(payload.error || "Unable to start Dodo Lifetime Story test checkout.");
    }
    if (payload.alreadyPurchased) {
      story.lifetimePurchased = true;
      renderAccessStatus();
      openStoryDialog(story);
      showToast("Already Purchased ✓");
      return;
    }
    if (!payload.checkoutUrl) throw new Error("Dodo checkout link was not returned.");

    const remainingDelay = 1600 - (Date.now() - startedAt);
    if (remainingDelay > 0) await wait(remainingDelay);
    leavingForDodo = true;
    location.assign(payload.checkoutUrl);
  } catch (error) {
    showToast(error.message || "Unable to start Dodo Lifetime Story test checkout.");
  } finally {
    countdown.stop();
    if (!leavingForDodo) {
      actionButton.disabled = false;
      actionButton.textContent = originalText;
    }
  }
}

async function beginDodoLifetimeLiveStoryPayment(story, actionButton) {
  const originalText = actionButton.textContent;
  const startedAt = Date.now();
  let leavingForDodo = false;
  actionButton.disabled = true;
  const countdown = startButtonCountdown(actionButton, "Preparing secure Dodo live checkout…", 10);
  try {
    const response = await fetch("/api/story-purchases/dodo-live-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: story.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === "LOGIN_REQUIRED") { openGoogleLogin(); return; }
      throw new Error(payload.error || "Unable to start Dodo Lifetime Story live checkout.");
    }
    if (payload.alreadyPurchased) {
      story.lifetimePurchased = true;
      renderAccessStatus();
      openStoryDialog(story);
      showToast("Already Purchased ✓");
      return;
    }
    if (!payload.checkoutUrl) throw new Error("Dodo checkout link was not returned.");

    const remainingDelay = 1600 - (Date.now() - startedAt);
    if (remainingDelay > 0) await wait(remainingDelay);
    leavingForDodo = true;
    location.assign(payload.checkoutUrl);
  } catch (error) {
    showToast(error.message || "Unable to start Dodo Lifetime Story live checkout.");
  } finally {
    countdown.stop();
    if (!leavingForDodo) {
      actionButton.disabled = false;
      actionButton.textContent = originalText;
    }
  }
}

async function beginLifetimeStoryPayment(story = state.selectedStory, actionButton = els.dialogAction) {
  if (!story || !actionButton) return;
  if (dodoLifetimeTestModeEnabled()) {
    await beginDodoLifetimeStoryPayment(story, actionButton);
    return;
  }
  await beginDodoLifetimeLiveStoryPayment(story, actionButton);
  return; // Legacy PayPal checkout retained below for rollback/reference, not used for NEW purchases.
  const originalText = actionButton.textContent;
  const startedAt = Date.now();
  let leavingForPaypal = false;
  actionButton.disabled = true;
  const countdown = startButtonCountdown(actionButton, "Preparing secure PayPal checkout…", 10);
  try {
    const response = await fetch("/api/story-purchases/create-order", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ storyId: story.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === "LOCAL_LIVE_PAYPAL_BLOCKED") {
        showToast("Local safety check passed — no real $65 charge was created.");
        return;
      }
      if (payload.code === "LOGIN_REQUIRED") { openGoogleLogin(); return; }
      throw new Error(payload.error || "Unable to start PayPal checkout.");
    }
    if (payload.alreadyPurchased) {
      story.lifetimePurchased = true;
      renderAccessStatus();
      openStoryDialog(story);
      showToast("Already Purchased ✓");
      return;
    }
    if (!payload.approveUrl) throw new Error("PayPal approval link was not returned.");

    // Keep a stable loading state instead of flashing the Purchase button again.
    // A minimum two-second preparation state reassures the user that the click was accepted.
    const minimumPreparingMs = 2000;
    const remainingDelay = minimumPreparingMs - (Date.now() - startedAt);
    if (remainingDelay > 0) await wait(remainingDelay);
    leavingForPaypal = true;
    location.assign(payload.approveUrl);
  } catch (error) {
    showToast(error.message || "Unable to start PayPal checkout.");
  } finally {
    countdown.stop();
    if (!leavingForPaypal) {
      actionButton.disabled = false;
      actionButton.textContent = originalText;
    }
  }
}

async function handleLifetimeDodoTestReturn() {
  if (!state.lifetimePurchaseMode) return;
  const url = new URL(location.href);
  if (url.searchParams.get("dodo_test") !== "1") return;

  const resultType = String(url.searchParams.get("dodo_lifetime") || "");
  if (resultType === "cancelled") {
    unlockLifetimeReturnInteraction();
    lifetimeReturnProgress?.stop({ hide: true });
    lifetimeReturnProgress = null;
    url.searchParams.delete("dodo_lifetime");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
    showToast("Dodo test payment cancelled. No lifetime access was changed.");
    return;
  }
  if (resultType !== "return") return;

  const storyId = String(url.searchParams.get("story") || state.selectedStory?.id || "").trim();
  lockLifetimeReturnInteraction();
  const progress = lifetimeReturnProgress || startPersistentToastCountdown("Dodo test payment received — verifying lifetime access…", 12);
  lifetimeReturnProgress = progress;

  for (let attempt = 0; attempt < 18; attempt++) {
    try {
      const response = await fetch("/api/story-purchases/mine", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      const purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
      const owned = purchases.some(item =>
        item?.purchaseStatus === "Completed" &&
        item?.entitlementStatus === "Active" &&
        (String(item?.currentStoryId || "") === storyId || String(item?.originalStoryId || "") === storyId)
      );
      if (response.ok && owned) {
        progress.message("Dodo test payment verified ✓ Opening your purchased stories…");
        await wait(650);
        location.replace(`/?purchase=lifetime${storyId ? `&story=${encodeURIComponent(storyId)}` : ""}`);
        return;
      }
    } catch {}
    await wait(1000);
  }

  unlockLifetimeReturnInteraction();
  progress.stop({ hide: true });
  lifetimeReturnProgress = null;
  showToast("Dodo test payment completed, but lifetime access is still processing. Refresh in a moment.");
}

async function handleLifetimeDodoLiveReturn() {
  if (!state.lifetimePurchaseMode) return;
  const url = new URL(location.href);
  if (url.searchParams.get("dodo_live") !== "1") return;

  const resultType = String(url.searchParams.get("dodo_lifetime") || "");
  if (resultType === "cancelled") {
    unlockLifetimeReturnInteraction();
    lifetimeReturnProgress?.stop({ hide: true });
    lifetimeReturnProgress = null;
    url.searchParams.delete("dodo_lifetime");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
    showToast("Dodo payment cancelled. No lifetime access was changed.");
    return;
  }
  if (resultType !== "return") return;

  const storyId = String(url.searchParams.get("story") || state.selectedStory?.id || "").trim();
  lockLifetimeReturnInteraction();
  const progress = lifetimeReturnProgress || startPersistentToastCountdown("Dodo payment received — verifying lifetime access…", 12);
  lifetimeReturnProgress = progress;

  for (let attempt = 0; attempt < 18; attempt++) {
    try {
      const response = await fetch("/api/story-purchases/mine", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      const purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
      const owned = purchases.some(item =>
        item?.purchaseStatus === "Completed" &&
        item?.entitlementStatus === "Active" &&
        (String(item?.currentStoryId || "") === storyId || String(item?.originalStoryId || "") === storyId)
      );
      if (response.ok && owned) {
        progress.message("Dodo payment verified ✓ Opening your purchased stories…");
        await wait(650);
        location.replace(`/?purchase=lifetime${storyId ? `&story=${encodeURIComponent(storyId)}` : ""}`);
        return;
      }
    } catch {}
    await wait(1000);
  }

  unlockLifetimeReturnInteraction();
  progress.stop({ hide: true });
  lifetimeReturnProgress = null;
  showToast("Dodo payment completed, but lifetime access is still processing. Refresh in a moment.");
}

async function handleLifetimePaypalReturn() {
  if (!state.lifetimePurchaseMode) return;
  const url = new URL(location.href);
  const resultType = String(url.searchParams.get("paypal") || "");
  if (resultType === "cancel") {
    unlockLifetimeReturnInteraction();
    lifetimeReturnProgress?.stop({ hide: true });
    lifetimeReturnProgress = null;
    url.searchParams.delete("paypal"); url.searchParams.delete("token"); url.searchParams.delete("PayerID");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
    showToast("Payment cancelled. No lifetime access was changed.");
    return;
  }
  if (resultType !== "return") return;
  const orderId = String(url.searchParams.get("token") || "").trim();
  if (!orderId) {
    unlockLifetimeReturnInteraction();
    lifetimeReturnProgress?.stop({ hide: true });
    lifetimeReturnProgress = null;
    showToast("PayPal returned without an order ID.");
    return;
  }
  lockLifetimeReturnInteraction();
  const progress = lifetimeReturnProgress || startPersistentToastCountdown("Payment approved — verifying secure access…", 10);
  lifetimeReturnProgress = progress;
  try {
    const response = await fetch("/api/story-purchases/capture-order", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to verify PayPal payment.");
    const storyId = String(payload.storyId || state.selectedStory?.id || "");
    progress.message("Payment verified ✓ Opening your purchased stories…");
    await wait(650);
    location.replace(`/?purchase=lifetime${storyId ? `&story=${encodeURIComponent(storyId)}` : ""}`);
  } catch (error) {
    unlockLifetimeReturnInteraction();
    progress.stop({ hide: true });
    lifetimeReturnProgress = null;
    showToast(error.message || "Unable to verify PayPal payment.");
  }
}

function handleLifetimeHomeArrival() {
  if (state.lifetimePurchaseMode) return;
  const url = new URL(location.href);
  if (url.searchParams.get("purchase") !== "lifetime") return;
  url.searchParams.delete("purchase");
  url.searchParams.delete("story");
  history.replaceState(history.state || {}, "", `${url.pathname}${url.search}${url.hash}`);
  showToast("Lifetime story access unlocked ✓");
}

let paypalSdkPromise = null;
let paypalSdkClientId = "";

function closePaymentCheckout() {
  const layer = document.getElementById("paymentCheckoutLayer");
  if (layer) layer.remove();
  document.body.classList.remove("payment-checkout-open");
}

function paymentCheckoutShell(context) {
  closePaymentCheckout();
  const layer = document.createElement("div");
  layer.id = "paymentCheckoutLayer";
  layer.className = "payment-checkout-layer";
  layer.innerHTML = `<div class="payment-checkout-card" role="dialog" aria-modal="true" aria-label="Join ${escapeHtml(context.tier?.name || "membership")}">
    <div class="payment-checkout-head"><div><span>Secure membership checkout</span><h2>${escapeHtml(context.tier?.name || "Membership")}</h2><p>${escapeHtml(context.tier?.price || "")} ${escapeHtml(context.tier?.cycle || "")}</p></div><button type="button" class="payment-checkout-close" aria-label="Close checkout">×</button></div>
    <div class="payment-checkout-body"><div class="payment-checkout-note">Your membership activates only after this site verifies the PayPal subscription.</div><div id="paypalButtons" class="paypal-buttons"><div class="payment-loading">Loading PayPal…</div></div><p class="payment-checkout-foot">Recurring billing is managed through PayPal. You can cancel the PayPal subscription later from PayPal.</p></div>
  </div>`;
  document.body.appendChild(layer);
  document.body.classList.add("payment-checkout-open");
  layer.querySelector(".payment-checkout-close").onclick = closePaymentCheckout;
  layer.addEventListener("click", event => { if (event.target === layer) closePaymentCheckout(); });
  return layer;
}

function loadPaypalSdk(clientId) {
  const clean = String(clientId || "").trim();
  if (!clean) return Promise.reject(new Error("PayPal Client ID is missing."));
  if (window.paypal && paypalSdkClientId === clean) return Promise.resolve(window.paypal);
  if (paypalSdkPromise && paypalSdkClientId === clean) return paypalSdkPromise;
  document.querySelectorAll('script[data-ox-paypal-sdk]').forEach(node => node.remove());
  paypalSdkClientId = clean;
  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.oxPaypalSdk = "1";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clean)}&components=buttons&vault=true&intent=subscription`;
    script.onload = () => window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK did not initialize."));
    script.onerror = () => reject(new Error("Unable to load PayPal checkout."));
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
}

function dodoTestCheckoutEnabled() {
  try { return new URL(location.href).searchParams.get("dodo_test") === "1"; }
  catch { return false; }
}

async function openDodoTestMembershipCheckout(tierId) {
  if (!state.loggedIn) {
    openGoogleLogin();
    showToast("Log in first, then choose Join Membership again.");
    return;
  }
  if (state.membershipActive) { showToast("Your membership is already active."); return; }

  try {
    showToast("Preparing Dodo test checkout…");
    const response = await fetch("/api/payments/dodo/test-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tierId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Dodo test checkout is not ready.");
    const checkoutUrl = String(payload.checkoutUrl || "").trim();
    if (!checkoutUrl) throw new Error("Dodo did not return a checkout URL.");
    window.location.assign(checkoutUrl);
  } catch (error) {
    showToast(error.message || "Dodo test checkout is not ready.");
  }
}

async function openDodoLiveMembershipCheckout(tierId) {
  if (!state.loggedIn) {
    openGoogleLogin();
    showToast("Log in first, then choose Join Membership again.");
    return;
  }
  if (state.membershipActive) { showToast("Your membership is already active."); return; }

  try {
    showToast("Preparing Dodo live checkout…");
    const response = await fetch("/api/payments/dodo/live-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tierId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Dodo live checkout is not ready.");
    const checkoutUrl = String(payload.checkoutUrl || "").trim();
    if (!checkoutUrl) throw new Error("Dodo did not return a checkout URL.");
    window.location.assign(checkoutUrl);
  } catch (error) {
    showToast(error.message || "Dodo live checkout is not ready.");
  }
}

async function openPaypalMembershipCheckout(tierId) {
  if (!state.loggedIn) {
    openGoogleLogin();
    showToast("Log in first, then choose Join Membership again.");
    return;
  }
  if (state.membershipActive) { showToast("Your membership is already active."); return; }
  let context;
  try {
    const response = await fetch("/api/payments/paypal/checkout-context", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ tierId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Membership checkout is not ready.");
    context = payload;
  } catch (error) {
    showToast(error.message || "Membership checkout is not ready.");
    return;
  }

  const layer = paymentCheckoutShell(context);
  const container = layer.querySelector("#paypalButtons");
  try {
    const paypal = await loadPaypalSdk(context.clientId);
    container.innerHTML = "";
    await paypal.Buttons({
      fundingSource: paypal.FUNDING.PAYPAL,
      style: { layout: "vertical", shape: "rect", label: "subscribe" },
      createSubscription(data, actions) {
        return actions.subscription.create({ plan_id: context.planId, custom_id: context.customId });
      },
      async onApprove(data) {
        container.innerHTML = '<div class="payment-loading">Verifying your subscription…</div>';
        try {
          const response = await fetch("/api/payments/paypal/confirm", {
            method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscriptionId: data.subscriptionID })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Unable to verify subscription.");
          closePaymentCheckout();
          if (payload.active) {
            showToast("Membership activated successfully.");
            await loadData();
            switchTab("stories", true, false);
          } else {
            showToast("PayPal approved the subscription. Activation is still processing.");
          }
        } catch (error) {
          container.innerHTML = `<div class="payment-checkout-error">${escapeHtml(error.message || "Unable to verify subscription.")}</div>`;
        }
      },
      onCancel() { showToast("PayPal checkout was cancelled."); },
      onError(error) { console.error("PayPal checkout error", error); container.innerHTML = '<div class="payment-checkout-error">PayPal checkout could not be completed. Please try again.</div>'; }
    }).render(container);
  } catch (error) {
    container.innerHTML = `<div class="payment-checkout-error">${escapeHtml(error.message || "Unable to load PayPal checkout.")}</div>`;
  }
}

$("[data-choose-story]")?.addEventListener("click", event => {
  event.preventDefault();
  switchTab("stories", true, true);
  showToast("Choose the story you want, then select the $65 single-story option.");
});

els.membershipTrack?.addEventListener("click", event => {
  const button = event.target.closest(".membership-join-button");
  if (!button) return;
  const tierId = button.dataset.tierId || button.closest("[data-tier-id]")?.dataset.tierId || "";
  if (dodoTestCheckoutEnabled()) openDodoTestMembershipCheckout(tierId);
  else openDodoLiveMembershipCheckout(tierId); // Existing PayPal subscriptions still renew on their provider.
});

els.contactButton?.addEventListener("click", () => {
  const email = String(els.contactButton?.dataset.email || "").trim();
  if (!email) return;
  if (els.siteMenuPopover) els.siteMenuPopover.hidden = true;
  els.siteMenuToggle?.setAttribute("aria-expanded", "false");
  window.location.href = `mailto:${email}`;
});

els.siteMenuToggle?.addEventListener("click", () => {
  const opening = els.siteMenuPopover?.hidden !== false;
  if (els.siteMenuPopover) els.siteMenuPopover.hidden = !opening;
  els.siteMenuToggle.setAttribute("aria-expanded", String(opening));
});

document.addEventListener("click", event => {
  if (!els.siteMenuPopover || els.siteMenuPopover.hidden) return;
  if (els.siteMenuPopover.contains(event.target) || els.siteMenuToggle?.contains(event.target)) return;
  els.siteMenuPopover.hidden = true;
  els.siteMenuToggle?.setAttribute("aria-expanded", "false");
});

els.creatorShare?.addEventListener("click", async () => {
  const siteName = state.appearance?.name || document.title || "Site";
  const shareUrl = `${location.origin}${location.pathname}`;
  const shareData = { title: siteName, text: state.appearance?.description || `Explore ${siteName}`, url: shareUrl };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Website link copied.");
      return;
    }
    window.prompt("Copy this website link:", shareUrl);
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Unable to share this link.");
  }
});

function ensureSupportPaymentDialog() {
  let layer = document.querySelector(".support-payment-layer");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.className = "support-payment-layer";
  layer.hidden = true;
  layer.innerHTML = `
    <div class="support-payment-scrim" data-support-close></div>
    <section class="support-payment-card" role="dialog" aria-modal="true" aria-labelledby="supportPaymentTitle">
      <button class="support-payment-close" type="button" data-support-close aria-label="Close">×</button>
      <span class="support-payment-kicker">SUPPORT</span>
      <h2 id="supportPaymentTitle">Send one-time support</h2>
      <p>Enter a whole-dollar amount. The minimum Support payment is <strong id="supportMinimumText">$9 USD</strong>.</p>
      <label class="support-amount-field">
        <span>Amount</span>
        <div class="support-amount-input"><b>$</b><input id="supportAmountInput" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="5" placeholder="9" aria-describedby="supportAmountHint"></div>
        <small id="supportAmountHint">Numbers only · minimum $9</small>
      </label>
      <div class="support-payment-error" id="supportPaymentError" hidden></div>
      <div class="support-payment-actions">
        <button class="secondary-support-action" type="button" data-support-close>Cancel</button>
        <button class="primary-support-action" id="supportPaymentContinue" type="button" disabled>Continue to PayPal</button>
      </div>
    </section>`;
  document.body.append(layer);
  const close = () => { layer.hidden = true; document.body.classList.remove("support-payment-open"); };
  layer.querySelectorAll("[data-support-close]").forEach(btn => btn.addEventListener("click", close));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !layer.hidden) close(); });
  const input = layer.querySelector("#supportAmountInput");
  const next = layer.querySelector("#supportPaymentContinue");
  const error = layer.querySelector("#supportPaymentError");
  const minimumText = layer.querySelector("#supportMinimumText");
  const hint = layer.querySelector("#supportAmountHint");
  layer._supportMinimum = 9;
  const sync = () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 5);
    const amount = Number(input.value || 0);
    next.disabled = !Number.isInteger(amount) || amount < layer._supportMinimum;
    error.hidden = true;
  };
  input.addEventListener("beforeinput", event => { if (event.data && /\D/.test(event.data)) event.preventDefault(); });
  input.addEventListener("input", sync);
  input.addEventListener("paste", () => requestAnimationFrame(sync));
  next.addEventListener("click", async () => {
    const amount = Number(input.value || 0);
    if (!Number.isInteger(amount) || amount < layer._supportMinimum) {
      error.textContent = `Enter a Support amount of at least $${layer._supportMinimum}.`;
      error.hidden = false;
      return;
    }
    next.disabled = true; next.textContent = "Opening PayPal…"; error.hidden = true;
    try {
      const response = await fetch("/api/payments/paypal/support/create", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: String(amount) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to start Support checkout.");
      location.href = payload.approveUrl;
    } catch (err) {
      error.textContent = err.message || "Unable to start Support checkout."; error.hidden = false;
      next.disabled = false; next.textContent = "Continue to PayPal";
    }
  });
  layer._openSupport = (minimum = 9) => {
    const parsedMinimum = Number(minimum);
    layer._supportMinimum = Number.isInteger(parsedMinimum) && parsedMinimum >= 1 && parsedMinimum <= 10000 ? parsedMinimum : 9;
    input.placeholder = String(layer._supportMinimum);
    if (minimumText) minimumText.textContent = `$${layer._supportMinimum} USD`;
    if (hint) hint.textContent = `Numbers only · minimum $${layer._supportMinimum}`;
    input.value = ""; next.disabled = true; next.textContent = "Continue to PayPal"; error.hidden = true;
    layer.hidden = false; document.body.classList.add("support-payment-open");
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  };
  return layer;
}

async function openSupportPayment() {
  if (!state.loggedIn) {
    openGoogleLogin(); showToast("Sign in with Google first to send Support."); return;
  }
  if (!state.membershipActive) { showToast("Support is available to active members only."); return; }
  try {
    const response = await fetch("/api/payments/paypal/support-context", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Support payments are not ready yet.");
    ensureSupportPaymentDialog()._openSupport(payload.minimum);
  } catch (error) { showToast(error.message || "Support payments are not ready yet."); }
}

function clearSupportReturnParams() {
  const url = new URL(location.href);
  ["paypal_support", "token", "PayerID"].forEach(key => url.searchParams.delete(key));
  history.replaceState(history.state || {}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handlePaypalSupportReturn() {
  const params = new URLSearchParams(location.search);
  const mode = params.get("paypal_support");
  if (!mode) return;
  if (mode === "cancel") { clearSupportReturnParams(); showToast("Support payment was cancelled."); return; }
  if (mode !== "return") { clearSupportReturnParams(); return; }
  const orderId = params.get("token") || "";
  if (!orderId) { clearSupportReturnParams(); showToast("PayPal returned without a Support order ID."); return; }
  try {
    const response = await fetch("/api/payments/paypal/support/capture", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to complete Support payment.");
    clearSupportReturnParams();
    showToast(`Thank you for supporting ${state.appearance?.name || "this site"} with $${Number(payload.amount || 0).toFixed(2)}.`);
  } catch (error) {
    clearSupportReturnParams(); showToast(error.message || "Unable to complete Support payment.");
  }
}

els.supportButton.addEventListener("click", openSupportPayment);

let googleIdentityPromise = null;
let googleIdentityClientId = "";

// OX_LOGIN_IMMEDIATE_REFRESH_FIX_V1
// Google popup focus can fire while the sign-in POST is still completing.
// Track an auth revision so an older /api/session response can never overwrite
// the freshly authenticated UI with a stale logged-out snapshot.
let memberAuthInFlight = false;
let memberSessionRevision = 0;

async function googleAuthConfig() {
  const response = await fetch("/api/auth/google/config", { cache: "default" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load Google sign-in configuration.");
  return payload;
}

function loadGoogleIdentityLibrary() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener("load", () => window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google sign-in did not initialize.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Google sign-in.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "1";
    script.onload = () => window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google sign-in did not initialize."));
    script.onerror = () => reject(new Error("Unable to load Google sign-in."));
    document.head.appendChild(script);
  });
  return googleIdentityPromise;
}

async function finishGoogleCredential(response) {
  const credential = String(response?.credential || "");
  if (!credential) return;
  memberAuthInFlight = true;
  memberSessionRevision += 1;
  if (els.authError) { els.authError.hidden = true; els.authError.textContent = ""; }
  const holder = $("#googleSignInButton");
  holder?.classList.add("is-busy", "is-processing");
  if (holder) {
    holder.innerHTML = `
      <div class="google-auth-processing" role="status" aria-live="polite">
        <span class="google-auth-processing-spinner" aria-hidden="true"></span>
        <span class="google-auth-processing-copy">
          <strong>Signing you in…</strong>
          <small>Google verified your account. Setting up your session.</small>
        </span>
      </div>`;
  }
  if (els.authIntro) els.authIntro.textContent = "Your Google account is verified. Please wait while this website finishes signing you in.";
  try {
    const authResponse = await fetch("/api/auth/google", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential })
    });
    const raw = await authResponse.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch {}
    if (!authResponse.ok) {
      const message = result.error || `Google completed, but this website could not finish sign-in (server ${authResponse.status}).`;
      throw new Error(message);
    }
    state.loggedIn = result.loggedIn === true;
    state.membershipActive = result.membershipActive === true;
    state.user = result.user || null;
    void syncMemberClientContext();
    renderAccessStatus();
    updateMemberExperience();
    updateLoginButton();
    void pollPostsStatus({ force: true });
    dismissDialog(els.loginDialog);
    if (!state.lifetimePurchaseMode) {
      await loadLifetimePurchasesForHome();
      renderAccessStatus();
      updateMemberExperience();
      applyStoryFilters();
    }
    if (state.lifetimePurchaseMode && state.selectedStory) {
      try {
        const selectedId = String(state.selectedStory.id || "");
        const catalogResponse = await fetch("/api/story-purchases/catalog", { cache: "no-store", credentials: "same-origin" });
        if (catalogResponse.ok) {
          const catalog = await catalogResponse.json();
          state.stories = (catalog.stories || []).map((item, index) => ({
            ...normalizeStory({ ...item, order: index + 1 }),
            purchasable: item.purchasable !== false,
            lifetimePurchased: item.purchased === true
          }));
          state.selectedStory = state.stories.find(item => String(item.id) === selectedId) || state.selectedStory;
          renderGenreFilters();
          applyStoryFilters();
        }
      } catch {}
      requestAnimationFrame(() => openStoryDialog(state.selectedStory));
    }
    showToast(result.created ? "Account created with Google." : "Signed in with Google.");
  } catch (error) {
    if (els.authIntro) els.authIntro.textContent = "Use your Google account to continue. New members are created automatically.";
    holder?.classList.remove("is-processing");
    await renderGoogleSignIn({ keepError: true });
    if (els.authError) { els.authError.textContent = error.message || "Unable to continue with Google."; els.authError.hidden = false; }
  } finally {
    memberAuthInFlight = false;
    holder?.classList.remove("is-busy", "is-processing");
  }
}

async function renderGoogleSignIn(options = {}) {
  const holder = $("#googleSignInButton");
  if (!holder) return;
  const keepError = options.keepError === true;
  holder.innerHTML = '<span class="google-auth-loading">Loading Google sign-in…</span>';
  if (!keepError && els.authError) { els.authError.hidden = true; els.authError.textContent = ""; }
  try {
    const [config] = await Promise.all([googleAuthConfig(), loadGoogleIdentityLibrary()]);
    if (!config.enabled || !config.clientId) throw new Error("Google sign-in is not configured for this website yet.");
    if (googleIdentityClientId !== config.clientId) {
      window.google.accounts.id.initialize({ client_id: config.clientId, callback: finishGoogleCredential, ux_mode: "popup" });
      googleIdentityClientId = config.clientId;
    }
    holder.innerHTML = "";
    const width = Math.max(240, Math.min(360, Math.round(holder.getBoundingClientRect().width || 320)));
    window.google.accounts.id.renderButton(holder, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", logo_alignment: "left", width });
  } catch (error) {
    holder.innerHTML = "";
    if (!keepError && els.authError) { els.authError.textContent = error.message || "Google sign-in is unavailable."; els.authError.hidden = false; }
  }
}

function openGoogleLogin() {
  const siteName = state.appearance?.name || "this site";
  const loginTitle = $("#loginTitle");
  if (loginTitle) loginTitle.textContent = `Continue to ${siteName}`;
  if (els.authIntro) els.authIntro.textContent = "Use your Google account to continue. New members are created automatically.";
  openDialog(els.loginDialog, els.loginDialogClose);
  requestAnimationFrame(() => void renderGoogleSignIn());
}

async function refreshMemberSession() {
  const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to refresh your account.");
  const payload = await response.json();
  state.loggedIn = payload.loggedIn === true;
  state.membershipActive = payload.membershipActive === true;
  state.user = payload.user || null;
  void syncMemberClientContext();
  if (!state.lifetimePurchaseMode) await loadLifetimePurchasesForHome();
  renderAccessStatus();
  updateMemberExperience();
  updateLoginButton();
  void pollPostsStatus({ force: true });
  return payload;
}


let accessStatusSyncPromise = null;
let lastAccessStatusSyncAt = 0;

async function syncAccessStatusFromServer({ force = false } = {}) {
  if (memberAuthInFlight) return null;
  if (accessStatusSyncPromise) return accessStatusSyncPromise;
  const syncRevision = memberSessionRevision;
  const now = Date.now();
  if (!force && now - lastAccessStatusSyncAt < 2500) return null;

  lastAccessStatusSyncAt = now;
  accessStatusSyncPromise = (async () => {
    try {
      const response = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) return;

      const payload = await response.json();
      // Ignore a session response that started before/during a Google auth change.
      // The auth POST result is newer and must win.
      if (memberAuthInFlight || syncRevision !== memberSessionRevision) return;
      const wasLoggedIn = state.loggedIn;
      const wasMembershipActive = state.membershipActive;
      const previousMembershipStatus = String(state.user?.membershipStatus || "");
      const previousSubscriptionStatus = String(state.user?.subscriptionStatus || "");

      state.loggedIn = payload.loggedIn === true;
      state.membershipActive = payload.membershipActive === true;
      state.user = payload.user || null;

      // Lifetime ownership can change independently of monthly membership,
      // so refresh it whenever a logged-in home-page user is being synced.
      if (!state.lifetimePurchaseMode) {
        if (state.loggedIn) await loadLifetimePurchasesForHome();
        else {
          state.lifetimePurchases = [];
          state.stories.forEach(story => { story.lifetimePurchased = false; });
          renderPurchasedStories();
        }
      }

      renderAccessStatus();
      updateMemberExperience();
      updateLoginButton();

      const changed =
        wasLoggedIn !== state.loggedIn ||
        wasMembershipActive !== state.membershipActive ||
        previousMembershipStatus !== String(state.user?.membershipStatus || "") ||
        previousSubscriptionStatus !== String(state.user?.subscriptionStatus || "");

      if (changed) {
        applyStoryFilters();
        void pollPostsStatus({ force: true });
      }
    } catch (error) {
      console.warn("Access status sync skipped", error);
    } finally {
      accessStatusSyncPromise = null;
    }
  })();

  return accessStatusSyncPromise;
}

function requestAccessStatusSync(force = false) {
  if (memberAuthInFlight) return;
  if (document.visibilityState === "hidden") return;
  void syncAccessStatusFromServer({ force });
}

window.addEventListener("pageshow", () => requestAccessStatusSync(true));
window.addEventListener("focus", () => requestAccessStatusSync(true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestAccessStatusSync(true);
});

// Keep a long-open OX tab eventually accurate without turning an idle tab
// into a Worker/D1 polling loop. Page load, pageshow, focus and visibility
// already refresh immediately; this is only a 10-minute safety refresh.
setInterval(() => {
  if (document.visibilityState === "visible") requestAccessStatusSync(false);
}, 600000);

async function refreshPaypalMembershipStatus() {
  if (!els.accountRefreshPaypal || !state.user?.subscriptionId) return;
  const originalText = els.accountRefreshPaypal.textContent;
  els.accountRefreshPaypal.disabled = true;
  els.accountRefreshPaypal.textContent = "Checking PayPal…";
  try {
    const response = await fetch("/api/payments/paypal/refresh-status", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" }
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok) throw new Error(result.error || "Unable to refresh PayPal status.");
    await refreshMemberSession();
    updateAccountDialog();
    showToast(`PayPal status refreshed: ${result.status || state.user?.subscriptionStatus || "updated"}.`);
  } catch (error) {
    showToast(error.message || "Unable to refresh PayPal status.");
  } finally {
    els.accountRefreshPaypal.disabled = false;
    els.accountRefreshPaypal.textContent = originalText;
  }
}

async function logoutMember() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {}
  state.loggedIn = false;
  state.membershipActive = false;
  state.user = null;
  state.lifetimePurchases = [];
  state.stories.forEach(story => { story.lifetimePurchased = false; });
  memberChatState.messages = [];
  memberChatState.loaded = false;
  updateMemberChatUnread(0);

  telegramBackupState.userKey = "";
  telegramBackupState.loaded = false;
  telegramBackupState.loading = false;
  telegramBackupState.connection = null;
  telegramBackupState.configured = false;
  telegramBackupState.alertKey = "";
  telegramBackupState.lastLoadedAt = 0;

  updateTelegramTabAlert();
  closeTelegramBackupAlert();

  renderAccessStatus();
  updateMemberExperience();
  updateLoginButton();
  void pollPostsStatus({ force: true });
  renderPurchasedStories();
  applyStoryFilters();
  try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
  dismissDialog(els.accountDialog);
  showToast("Logged out.");
}

els.loginButton.addEventListener("click", () => {
  if (els.siteMenuPopover) els.siteMenuPopover.hidden = true;
  els.siteMenuToggle?.setAttribute("aria-expanded", "false");
  if (state.loggedIn) {
    updateAccountDialog();
    openDialog(els.accountDialog, els.accountDialogClose);
    return;
  }
  openGoogleLogin();
});

els.accessStatusPill?.addEventListener("click", () => {
  if (els.siteMenuPopover) els.siteMenuPopover.hidden = true;
  els.siteMenuToggle?.setAttribute("aria-expanded", "false");
  if (state.loggedIn) {
    updateAccountDialog();
    openDialog(els.accountDialog, els.accountDialogClose);
    return;
  }
  openGoogleLogin();
});

els.accountProfileReplace?.addEventListener("click", () => els.accountProfileFile?.click());
els.accountProfileFile?.addEventListener("change", async () => {
  const file = els.accountProfileFile.files?.[0];
  if (!file) return;
  els.accountProfileReplace.disabled = true;
  try { await uploadMemberProfileImage(file); showToast("Profile picture updated."); }
  catch (error) { showToast(error.message || "Unable to update profile picture."); }
  finally { els.accountProfileReplace.disabled = false; els.accountProfileFile.value = ""; }
});
els.accountProfileRemove?.addEventListener("click", async () => {
  try { await removeMemberProfileImage(); showToast("Profile picture removed."); }
  catch (error) { showToast(error.message || "Unable to remove profile picture."); }
});
els.accountLogout?.addEventListener("click", logoutMember);

function reconcileOverlayHistory(overlay) {
  if (overlay === "story") {
    if (!els.loginDialog.hidden) closeDialog(els.loginDialog);
    if (!els.accountDialog.hidden) closeDialog(els.accountDialog);
    if (els.storyDialog.hidden && state.selectedStory) openStoryDialog(state.selectedStory, { fromHistory: true });
    return;
  }

  if (!els.storyDialog.hidden) closeDialog(els.storyDialog);

  if (overlay === "login") {
    if (!els.accountDialog.hidden) closeDialog(els.accountDialog);
    if (els.loginDialog.hidden) openDialog(els.loginDialog, els.loginDialogClose, { fromHistory: true });
    return;
  }

  if (!els.loginDialog.hidden) closeDialog(els.loginDialog);

  if (overlay === "account") {
    if (els.accountDialog.hidden && state.loggedIn) {
      updateAccountDialog();
      openDialog(els.accountDialog, els.accountDialogClose, { fromHistory: true });
    }
    return;
  }

  if (!els.accountDialog.hidden) closeDialog(els.accountDialog);
}

function hasOpenDialog() {
  return !els.storyDialog.hidden || !els.loginDialog.hidden || !els.accountDialog.hidden;
}

function isTypingTarget(target) {
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function swipeToAdjacentVisibleTab(direction) {
  const visibleTabs = getVisibleTabs();
  if (visibleTabs.length < 2) return false;

  const currentIndex = visibleTabs.findIndex(tab => tab.getAttribute("aria-selected") === "true");
  if (currentIndex < 0) return false;

  const nextIndex = direction === "left" ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= visibleTabs.length) return false;

  activateProfileTab(visibleTabs[nextIndex]);
  return true;
}

els.contentShell.addEventListener("touchstart", event => {
  if (event.touches.length !== 1 || hasOpenDialog() || getVisibleTabs().length < 2) {
    state.touchStart = null;
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  // Inputs/selects need normal finger interaction. Buttons, cards, links and
  // Membership content are intentionally allowed so swipe works across the page.
  if (target?.closest("input, textarea, select, [contenteditable='true']")) {
    state.touchStart = null;
    return;
  }

  const touch = event.touches[0];
  // Leave the extreme browser edges alone for Android/iOS back gestures.
  if (touch.clientX < 18 || touch.clientX > window.innerWidth - 18) {
    state.touchStart = null;
    return;
  }

  state.touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
}, { passive: true, capture: true });

els.contentShell.addEventListener("touchend", event => {
  if (!state.touchStart || event.changedTouches.length !== 1) return;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - state.touchStart.x;
  const deltaY = touch.clientY - state.touchStart.y;
  const duration = Date.now() - state.touchStart.time;
  state.touchStart = null;

  const horizontalEnough = Math.abs(deltaX) >= 44;
  const mostlyHorizontal = Math.abs(deltaX) >= Math.abs(deltaY) * 1.15;
  if (duration > 1000 || !horizontalEnough || !mostlyHorizontal) return;

  const switched = swipeToAdjacentVisibleTab(deltaX < 0 ? "left" : "right");
  if (!switched) return;

  // Prevent a button/card underneath the completed swipe from also activating.
  state.suppressNextContentClick = true;
  setTimeout(() => { state.suppressNextContentClick = false; }, 500);
}, { passive: true, capture: true });

els.contentShell.addEventListener("touchcancel", () => {
  state.touchStart = null;
}, { passive: true, capture: true });
els.contentShell.addEventListener("click", event => {
  if (!state.suppressNextContentClick) return;
  state.suppressNextContentClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);

["copy", "cut", "selectstart"].forEach(eventName => {
  document.addEventListener(eventName, event => {
    if (!isTypingTarget(event.target)) event.preventDefault();
  });
});

document.addEventListener("contextmenu", event => {
  if (!isTypingTarget(event.target)) event.preventDefault();
});

document.addEventListener("dragstart", event => {
  if (event.target instanceof HTMLImageElement) event.preventDefault();
});

// Manual page scrolling intentionally has no JavaScript correction.
// CSS scroll-snap boundaries handle the final resting position natively.

window.addEventListener("resize", () => {
  if (document.activeElement === els.searchInput) syncMobileSearchPin();
  clearTimeout(stickyResizeTimer);
  stickyResizeTimer = setTimeout(() => {
    setupStickyObservers();
    setupMembershipCarousel();
  }, 120);
});

if (window.visualViewport) {
  // With interactive-widget=resizes-content the layout viewport follows the
  // keyboard. Recompute sticky geometry on resize only; never chase
  // VisualViewport scroll/offset changes, because that created search jumps.
  window.visualViewport.addEventListener("resize", () => {
    if (document.activeElement === els.searchInput) requestAnimationFrame(setupStickyObservers);
  });
}

window.addEventListener("popstate", event => {
  const route = location.hash === "#posts" ? "posts" : (location.hash === "#membership" ? "membership" : (location.hash === "#chat" ? "chat" : "stories"));
  switchTab(route, false);
  reconcileOverlayHistory(event.state?.oxOverlay || null);
});


async function handleDodoTestReturn() {
  let params;
  try { params = new URL(location.href).searchParams; } catch { return; }
  if (params.get("dodo_test") !== "1") return;

  if (params.get("dodo") === "cancelled") {
    setTimeout(() => showToast("Dodo test checkout was cancelled."), 500);
    return;
  }
  if (params.get("dodo") !== "return") return;

  showToast("Dodo test payment returned — verifying membership activation…");
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.membershipActive) {
        await loadData();
        showToast("Dodo test membership activated successfully.");
        switchTab("stories", true, false);
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  showToast("Dodo test payment completed, but activation is still processing. Refresh in a moment.");
}

async function handleDodoLiveReturn() {
  let params;
  try { params = new URL(location.href).searchParams; } catch { return; }
  if (params.get("dodo_live") !== "1") return;

  if (params.get("dodo") === "cancelled") {
    setTimeout(() => showToast("Dodo checkout was cancelled."), 500);
    return;
  }
  if (params.get("dodo") !== "return") return;

  showToast("Dodo payment returned — verifying membership activation…");
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.membershipActive) {
        await loadData();
        showToast("Dodo membership activated successfully.");
        switchTab("stories", true, false);
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  showToast("Dodo payment completed, but activation is still processing. Refresh in a moment.");
}

window.addEventListener("hashchange", () => {
  const route = location.hash === "#posts" ? "posts" : (location.hash === "#membership" ? "membership" : (location.hash === "#chat" ? "chat" : "stories"));
  switchTab(route, false);
});

if (location.hash === "#posts") switchTab("posts", false);
else if (location.hash === "#membership") switchTab("membership", false);
else if (location.hash === "#chat") switchTab("chat", false);
else switchTab("stories");
history.replaceState({ ...(history.state || {}), oxOverlay: null }, "", location.href);

setupStickyObservers();
setupMembershipCarousel();
setupMemberChat();
setupTelegramBackupAlert();
setupPosts();

window.addEventListener("pageshow", () => {
  if (hasPaidChatAccess()) {
    void loadTelegramBackupStatus({ silent: true, force: true });
  }
});

window.addEventListener("focus", () => {
  if (hasPaidChatAccess()) {
    void loadTelegramBackupStatus({ silent: true, force: true });
  }
});

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    hasPaidChatAccess()
  ) {
    void loadTelegramBackupStatus({ silent: true, force: true });
  }
});

// PayPal returns to /49 before OX verifies the capture. Show an immediate,
// persistent progress message while the normal page/session data finishes loading
// so the customer never sees a silent 1–2 second pause.
if (state.lifetimePurchaseMode) {
  const initialUrl = new URL(location.href);
  const initialPaypalResult = String(initialUrl.searchParams.get("paypal") || "");
  const initialDodoLifetimeResult = String(initialUrl.searchParams.get("dodo_lifetime") || "");
  if (initialPaypalResult === "return") {
    lockLifetimeReturnInteraction();
    lifetimeReturnProgress = startPersistentToastCountdown("Payment approved — verifying secure access…", 10);
  } else if (initialUrl.searchParams.get("dodo_live") === "1" && initialDodoLifetimeResult === "return") {
    lockLifetimeReturnInteraction();
    lifetimeReturnProgress = startPersistentToastCountdown("Dodo payment returned — verifying lifetime access…", 12);
  } else if (initialUrl.searchParams.get("dodo_test") === "1" && initialDodoLifetimeResult === "return") {
    lockLifetimeReturnInteraction();
    lifetimeReturnProgress = startPersistentToastCountdown("Dodo test payment received — verifying lifetime access…", 12);
  }
}

loadData().then(async () => {
  if (state.lifetimePurchaseMode) {
    await handleLifetimeDodoTestReturn();
    await handleLifetimeDodoLiveReturn();
    await handleLifetimePaypalReturn();
  } else {
    handleLifetimeHomeArrival();
    await handlePaypalSupportReturn();
  }
  await handleDodoTestReturn();
  await handleDodoLiveReturn();
});
