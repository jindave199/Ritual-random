const rawDapps = Array.isArray(window.RITUAL_DAPPS) ? window.RITUAL_DAPPS : [];

const rarityBands = [
  { key: "common", label: "Common", limit: 44 },
  { key: "rare", label: "Rare", limit: 69 },
  { key: "epic", label: "Epic", limit: 86 },
  { key: "legendary", label: "Legendary", limit: 96 },
  { key: "mythic", label: "Mythic", limit: 100 },
];

const trackEl = document.getElementById("reelTrack");
const spinButton = document.getElementById("spinButton");
const caseStageEl = document.querySelector(".case-stage");
const totalCountEl = document.getElementById("totalCount");
const ownerCountEl = document.getElementById("ownerCount");
const lastDropLabelEl = document.getElementById("lastDropLabel");
const spinCounterEl = document.getElementById("spinCounter");
const historyListEl = document.getElementById("historyList");
const detailStateEl = document.getElementById("detailState");
const bgAudioEl = document.getElementById("bgAudio");
const spinAudioEl = document.getElementById("spinAudio");
const fireflyLayerEl = document.getElementById("fireflyLayer");
const resultCardEl = document.getElementById("resultCard");
const rarityBadgeEl = document.getElementById("rarityBadge");
const categoryBadgeEl = document.getElementById("categoryBadge");
const dappMonogramEl = document.getElementById("dappMonogram");
const dappTitleEl = document.getElementById("dappTitle");
const dappDomainEl = document.getElementById("dappDomain");
const dappFunctionEl = document.getElementById("dappFunction");
const dappOwnerEl = document.getElementById("dappOwner");
const dappHandleEl = document.getElementById("dappHandle");
const dappUrlLabelEl = document.getElementById("dappUrlLabel");
const dappNotesEl = document.getElementById("dappNotes");
const ownerAvatarEl = document.getElementById("ownerAvatar");
const ownerDisplayEl = document.getElementById("ownerDisplay");
const ownerRoleEl = document.getElementById("ownerRole");
const visitDappLinkEl = document.getElementById("visitDappLink");
const visitXLinkEl = document.getElementById("visitXLink");

const state = {
  spinCount: 0,
  spinning: false,
  history: [],
  spinTimeout: null,
  spinSequence: null,
  winnerIndex: null,
  assetsReady: false,
  bgAudioStarted: false,
};

const dapps = rawDapps.map(
  (
    {
      siteUrl,
      title,
      owner,
      ownerDisplayName,
      xHandle,
      xUrl,
      xAvatarUrl,
      ownerRole,
      functionLabel,
      notes,
    },
    index
  ) => {
  const normalizedUrl = normalizeUrl(siteUrl);
  const category = detectCategory(title);
  const rarity = detectRarity(title + owner + index);
  const normalizedHandle = sanitizeHandle(xHandle || owner);

  return {
    id: index + 1,
    title: title.trim(),
    functionLabel: (functionLabel || title).trim(),
    siteUrl: normalizedUrl,
    owner: owner.trim(),
    ownerDisplayName: (ownerDisplayName || owner).trim(),
    xHandle: normalizedHandle,
    xUrl: (xUrl || `https://x.com/${encodeURIComponent(normalizedHandle)}`).trim(),
    xAvatarUrl: (xAvatarUrl || "").trim(),
    ownerRole: (ownerRole || "Community builder").trim(),
    notes: (notes || "Placeholder owner and X data").trim(),
    hostname: safeHostname(normalizedUrl),
    category,
    rarity,
  };
}
);

spinButton.disabled = true;
spinButton.textContent = "Preparing assets...";

renderMeta();
renderHistory();
renderResult(null);
renderFireflies();
prepareApp();

spinButton.addEventListener("click", startSpin);

function startSpin() {
  if (state.spinning || !state.assetsReady) {
    return;
  }

  startBackgroundAudio();
  if (caseStageEl) {
    caseStageEl.classList.remove("result-locked");
  }
  state.spinning = true;
  state.spinCount += 1;
  spinCounterEl.textContent = String(state.spinCount);
  spinButton.disabled = true;
  spinButton.textContent = "Rolling...";

  const winningEntry = pickRandom(dapps);
  const winnerIndex = 42;
  const totalItems = 58;
  const sequence = Array.from({ length: totalItems }, (_, index) => {
    if (index === winnerIndex) {
      return winningEntry;
    }
    return pickRandom(dapps);
  });

  renderTrack(sequence);

  const spinDurationMs = getSpinDurationMs();
  state.spinSequence = sequence;
  state.winnerIndex = winnerIndex;

  trackEl.style.transition = "none";
  trackEl.style.transform = "translateX(0px)";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const targetOffset = getTargetOffset(winnerIndex);
      trackEl.style.transition = `transform ${spinDurationMs}ms cubic-bezier(0.12, 0.84, 0.18, 1)`;
      trackEl.style.transform = `translateX(-${targetOffset}px)`;
    });
  });

  playSpinAudio();
  window.clearTimeout(state.spinTimeout);
  state.spinTimeout = window.setTimeout(() => {
    finalizeSpin();
  }, spinDurationMs + 120);
}

function lockWinner(sequence, winnerIndex) {
  const cards = [...trackEl.querySelectorAll(".reel-card")];
  cards.forEach((card) => card.classList.remove("selected"));

  const winningCard = cards[winnerIndex];
  if (winningCard) {
    snapWinnerToCenter(winningCard);
    winningCard.classList.add("selected");
  }
  if (caseStageEl) {
    caseStageEl.classList.add("result-locked");
  }

  const winner = sequence[winnerIndex];
  state.history.unshift(winner);
  state.history = state.history.slice(0, 6);

  renderHistory();
  renderResult(winner);

  lastDropLabelEl.textContent = winner.title;
  detailStateEl.textContent = "Drop locked";

  state.spinning = false;
  spinButton.disabled = false;
  spinButton.textContent = "Open Again";
}

function finalizeSpin() {
  if (!state.spinning || !state.spinSequence || state.winnerIndex === null) {
    return;
  }

  lockWinner(state.spinSequence, state.winnerIndex);
  state.spinSequence = null;
  state.winnerIndex = null;
}

function renderIdleTrack() {
  const preview = dapps.slice(0, 12);
  renderTrack(preview);
  renderResult(null);
}

function renderTrack(entries) {
  trackEl.innerHTML = entries.map(renderCardMarkup).join("");
  hydrateTrackImages();
}

function renderCardMarkup(entry) {
  const initials = monogram(entry.title);
  const avatarSrc = entry.xAvatarUrl || avatarDataUrl(entry.xHandle);
  return `
    <article class="reel-card">
      <div class="reel-card-inner">
        <div class="reel-card-topline">
          <span class="reel-label-badge">Ritual Testnet</span>
        </div>
        <div class="reel-media-row">
          <div class="reel-icon-wrap reel-avatar-wrap">
            <img
              src="${avatarSrc}"
              alt="${escapeHtml(entry.ownerDisplayName || entry.owner)} avatar"
              loading="lazy"
              data-fallback="${initials}"
            />
            <span class="reel-fallback">${initials}</span>
          </div>
          <div class="reel-site-badge" aria-hidden="true">
            <img
              src="${faviconUrl(entry.hostname)}"
              alt=""
              loading="lazy"
            />
          </div>
        </div>
        <div class="reel-title">${escapeHtml(entry.title)}</div>
        <div class="reel-domain">${escapeHtml(entry.hostname)}</div>
        <div class="reel-owner-row">
          <div class="reel-owner-name">${escapeHtml(entry.ownerDisplayName || entry.owner)}</div>
          <div class="reel-owner">@${escapeHtml(entry.xHandle)}</div>
        </div>
      </div>
    </article>
  `;
}

function hydrateTrackImages() {
  const images = trackEl.querySelectorAll(".reel-icon-wrap img, .reel-site-badge img");
  images.forEach((imageEl) => {
    imageEl.addEventListener("error", () => {
      imageEl.style.display = "none";
      const fallback = imageEl.nextElementSibling;
      if (fallback && fallback.classList.contains("reel-fallback")) {
        fallback.style.display = "grid";
      }
    });
  });
}

function renderResult(entry) {
  if (!entry) {
    resultCardEl.classList.add("result-card-empty");
    rarityBadgeEl.className = "rarity-badge reel-label-badge";
    rarityBadgeEl.textContent = "Ritual Testnet";
    categoryBadgeEl.textContent = "";
    categoryBadgeEl.style.display = "none";
    dappMonogramEl.textContent = "RR";
    dappMonogramEl.style.background = "rgba(255, 255, 255, 0.04)";
    dappTitleEl.textContent = "Waiting for a roll";
    dappDomainEl.textContent = "No domain locked yet";
    dappFunctionEl.textContent = "Pending";
    dappOwnerEl.textContent = "Pending";
    dappHandleEl.textContent = "Pending";
    dappUrlLabelEl.textContent = "Pending";
    dappNotesEl.textContent = "Placeholder owner and X data";
    ownerAvatarEl.src = avatarDataUrl("ritual random");
    ownerAvatarEl.alt = "Placeholder avatar";
    ownerDisplayEl.textContent = "Pending owner";
    ownerRoleEl.textContent = "Community builder";
    visitDappLinkEl.href = "#";
    visitXLinkEl.href = "#";
    return;
  }

  resultCardEl.classList.remove("result-card-empty");
  rarityBadgeEl.className = "rarity-badge reel-label-badge";
  rarityBadgeEl.textContent = "Ritual Testnet";
  categoryBadgeEl.textContent = "";
  categoryBadgeEl.style.display = "none";
  dappMonogramEl.textContent = monogram(entry.title);
  dappMonogramEl.style.background = monogramBackground(entry.title);
  dappTitleEl.textContent = entry.title;
  dappDomainEl.textContent = entry.hostname;
  dappFunctionEl.textContent = entry.functionLabel;
  dappOwnerEl.textContent = entry.owner;
  dappHandleEl.textContent = `@${entry.xHandle}`;
  dappUrlLabelEl.textContent = entry.siteUrl;
  dappNotesEl.textContent = entry.notes;
  ownerAvatarEl.src = entry.xAvatarUrl || avatarDataUrl(entry.xHandle);
  ownerAvatarEl.alt = `${entry.xHandle} avatar`;
  ownerDisplayEl.textContent = entry.ownerDisplayName;
  ownerRoleEl.textContent = entry.ownerRole;
  visitDappLinkEl.href = entry.siteUrl;
  visitXLinkEl.href = entry.xUrl;
}

function renderMeta() {
  totalCountEl.textContent = String(dapps.length);
  ownerCountEl.textContent = String(new Set(dapps.map((entry) => entry.owner.toLowerCase())).size);
}

function renderHistory() {
  if (!state.history.length) {
    historyListEl.innerHTML = `
      <article class="history-item">
        <strong>Stand by</strong>
        <span class="muted-line">No drop yet</span>
      </article>
    `;
    return;
  }

  historyListEl.innerHTML = state.history
    .map(
      (entry, index) => `
        <article class="history-item">
          <strong>${escapeHtml(entry.title)}</strong>
          <span class="muted-line">#${state.spinCount - index}</span>
          <span class="muted-line">@${escapeHtml(entry.xHandle)}</span>
        </article>
      `
    )
    .join("");
}

function normalizeUrl(value) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function sanitizeHandle(owner) {
  return owner.replace(/^@/, "").replace(/`/g, "").trim();
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_error) {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function detectCategory(title) {
  const value = title.toLowerCase();

  if (/(game|arcade|play|spin|shooter|survival|flip|arena|tamagotchi|miner|pixelverse|paws|guess|strike|striker|casino)/.test(value)) {
    return "Game";
  }

  if (/(identity|profile|card|mint|name|nft)/.test(value)) {
    return "Identity";
  }

  if (/(analytics|analyzer|stats|score|tracker|console)/.test(value)) {
    return "Analytics";
  }

  if (/(staking|finance|predict|market|oracle)/.test(value)) {
    return "Finance";
  }

  if (/(teacher|learn|academy)/.test(value)) {
    return "Education";
  }

  if (/(discord|wall|tip|sender|bounty|mission)/.test(value)) {
    return "Social";
  }

  return "Utility";
}

function detectRarity(seed) {
  const score = hashString(seed) % 100;
  return rarityBands.find((band) => score < band.limit) || rarityBands[0];
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function monogram(value) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0].toUpperCase())
    .join("");

  return cleaned || "RR";
}

function monogramBackground(seed) {
  const hueA = hashString(seed) % 360;
  const hueB = (hueA + 42) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 55% 42%), hsl(${hueB} 65% 34%))`;
}

function avatarDataUrl(seed) {
  const initials = monogram(seed);
  const hueA = hashString(seed) % 360;
  const hueB = (hueA + 52) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hueA} 60% 54%)" />
          <stop offset="100%" stop-color="hsl(${hueB} 60% 38%)" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <circle cx="48" cy="32" r="16" fill="rgba(255,255,255,0.18)" />
      <path d="M20 84c4-18 19-27 28-27s24 9 28 27" fill="rgba(255,255,255,0.16)" />
      <text x="48" y="54" fill="#fff" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" text-anchor="middle">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function faviconUrl(hostname) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getSpinDurationMs() {
  if (spinAudioEl && Number.isFinite(spinAudioEl.duration) && spinAudioEl.duration > 0) {
    return Math.max(3000, Math.round(spinAudioEl.duration * 1000));
  }

  return 5200;
}

function playSpinAudio() {
  if (!spinAudioEl) {
    return;
  }

  spinAudioEl.pause();
  spinAudioEl.currentTime = 0;
  spinAudioEl.play().catch(() => {});
}

async function prepareApp() {
  const preview = dapps.slice(0, 12);
  const preloadTargets = buildPreloadTargets(preview);

  try {
    await Promise.race([
      preloadAssets(preloadTargets),
      wait(4500),
    ]);
  } catch (_error) {
    // Keep startup resilient. Missing remote assets should not block the app forever.
  }

  renderTrack(preview);
  state.assetsReady = true;
  spinButton.disabled = false;
  spinButton.textContent = "Open Ritual Case";
}

function buildPreloadTargets(entries) {
  const targets = new Set();

  entries.forEach((entry) => {
    if (entry.xAvatarUrl) {
      targets.add(entry.xAvatarUrl);
    }
    targets.add(faviconUrl(entry.hostname));
  });

  return [...targets];
}

async function preloadAssets(urls) {
  const tasks = urls.map((url) => preloadImage(url));
  if (spinAudioEl) {
    tasks.push(preloadAudioMetadata(spinAudioEl));
  }
  if (bgAudioEl) {
    tasks.push(preloadAudioMetadata(bgAudioEl));
  }
  await Promise.allSettled(tasks);
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => resolve(url);
    image.decoding = "async";
    image.src = url;
  });
}

function preloadAudioMetadata(audioEl) {
  return new Promise((resolve) => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      resolve(audioEl.duration);
      return;
    }

    const complete = () => {
      audioEl.removeEventListener("loadedmetadata", complete);
      audioEl.removeEventListener("error", complete);
      resolve(audioEl.duration || 0);
    };

    audioEl.addEventListener("loadedmetadata", complete, { once: true });
    audioEl.addEventListener("error", complete, { once: true });
    audioEl.load();
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function startBackgroundAudio() {
  if (!bgAudioEl || state.bgAudioStarted) {
    return;
  }

  state.bgAudioStarted = true;
  bgAudioEl.volume = 0.18;
  bgAudioEl.play().catch(() => {
    state.bgAudioStarted = false;
  });
}

function renderFireflies() {
  if (!fireflyLayerEl) {
    return;
  }

  const count = 22;
  fireflyLayerEl.innerHTML = Array.from({ length: count }, (_, index) => {
    const left = ((index * 37) % 100) + Math.random() * 6;
    const size = 4 + (index % 4);
    const duration = 8 + (index % 7) * 1.35;
    const delay = (index % 9) * -1.2;
    const drift = ((index % 5) - 2) * 18;

    return `
      <span
        class="firefly"
        style="
          left:${left}%;
          width:${size}px;
          height:${size}px;
          --fly-duration:${duration}s;
          --fly-delay:${delay}s;
          --fly-drift:${drift}px;
        "
      ></span>
    `;
  }).join("");
}

function getTargetOffset(winnerIndex) {
  const cards = [...trackEl.querySelectorAll(".reel-card")];
  const winningCard = cards[winnerIndex];
  const windowEl = trackEl.parentElement;

  if (!winningCard || !windowEl) {
    const cardWidth = getCardWidth();
    const gap = getTileGap();
    const viewportWidth = trackEl.parentElement.clientWidth;
    return winnerIndex * (cardWidth + gap) - (viewportWidth / 2 - cardWidth / 2) + 24;
  }

  const cardCenter =
    winningCard.offsetLeft + winningCard.offsetWidth / 2;
  const windowCenter = windowEl.clientWidth / 2;

  return cardCenter - windowCenter;
}

function snapWinnerToCenter(winningCard) {
  const windowEl = trackEl.parentElement;
  if (!winningCard || !windowEl) {
    return;
  }

  const cardCenter = winningCard.offsetLeft + winningCard.offsetWidth / 2;
  const windowCenter = windowEl.clientWidth / 2;
  const targetOffset = cardCenter - windowCenter;

  trackEl.style.transition = "transform 240ms ease-out";
  trackEl.style.transform = `translateX(-${targetOffset}px)`;
}

function getCardWidth() {
  const width = getComputedStyle(document.documentElement).getPropertyValue("--tile-width");
  return Number.parseFloat(width) || 186;
}

function getTileGap() {
  const gap = getComputedStyle(document.documentElement).getPropertyValue("--tile-gap");
  return Number.parseFloat(gap) || 16;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
