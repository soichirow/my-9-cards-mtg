(function () {
  "use strict";

  var MAX_CARDS = 9;
  var MAX_RESULTS = 30;
  var API_BASE = "https://api.scryfall.com";

  // ── State ──
  var selected = new Array(MAX_CARDS).fill(null);
  var activeSlotIndex = -1;

  // URL params を renderGrid→updateUrl が消す前に退避
  var initialSearch = location.search;

  // ── DOM refs ──
  var gridEl = document.getElementById("grid");
  var countLabel = document.getElementById("countLabel");
  var clearBtn = document.getElementById("clearBtn");
  var copyBtn = document.getElementById("copyBtn");
  var openBtn = document.getElementById("openBtn");
  var saveImgBtn = document.getElementById("saveImgBtn");
  var warnEl = document.getElementById("warn");
  var restoreStatusEl = document.getElementById("restoreStatus");

  var modalOverlay = document.getElementById("modalOverlay");
  var modalTitle = document.getElementById("modalTitle");
  var modalClose = document.getElementById("modalClose");
  var searchInput = document.getElementById("searchInput");
  var searchBtn = document.getElementById("searchBtn");
  var allLangCheck = document.getElementById("allLangCheck");
  var statusEl = document.getElementById("status");
  var resultsEl = document.getElementById("results");

  // ════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════

  function getImageUrl(card) {
    if (card.image_uris && card.image_uris.normal) return card.image_uris.normal;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
      return card.card_faces[0].image_uris.normal;
    }
    return null;
  }

  function getDisplayName(card) {
    if (card.printed_name) return card.printed_name;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].printed_name) {
      return card.card_faces[0].printed_name;
    }
    return card.name;
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = "modal-status" + (isError ? " error" : "");
  }

  function setRestoreStatus(msg, isError) {
    restoreStatusEl.textContent = msg;
    restoreStatusEl.className = "restore-status" + (isError ? " error" : "");
  }

  function filledCount() {
    return selected.filter(Boolean).length;
  }

  // ════════════════════════════════════════
  //  URL / Share
  // ════════════════════════════════════════

  function buildShareUrl() {
    var url = new URL(location.href.split("?")[0]);
    var ids = selected.filter(Boolean).map(function (c) { return c.id; });
    if (ids.length > 0) {
      url.searchParams.set("ids", ids.join(","));
    }
    return url.toString();
  }

  var STORAGE_KEY = "my9cards_ids";

  function updateUrl() {
    history.replaceState(null, "", buildShareUrl());
    // localStorageにも保存
    var ids = selected.filter(Boolean).map(function (c) { return c.id; });
    try {
      if (ids.length > 0) {
        localStorage.setItem(STORAGE_KEY, ids.join(","));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) { /* storage unavailable */ }
  }

  // ════════════════════════════════════════
  //  Modal
  // ════════════════════════════════════════

  function openModal(index) {
    activeSlotIndex = index;
    var card = selected[index];
    if (card) {
      modalTitle.textContent = "スロット " + (index + 1) + " を変更";
    } else {
      modalTitle.textContent = "スロット " + (index + 1) + " にカードを追加";
    }
    modalOverlay.classList.add("open");
    searchInput.value = "";
    statusEl.textContent = "";
    resultsEl.innerHTML = "";
    searchInput.focus();
  }

  function closeModal() {
    activeSlotIndex = -1;
    modalOverlay.classList.remove("open");
  }

  async function openVersionModal(index) {
    var card = selected[index];
    if (!card || !card.prints_search_uri) return;

    activeSlotIndex = index;
    modalTitle.textContent = getDisplayName(card) + " のバージョン";
    modalOverlay.classList.add("open");
    searchInput.value = "";
    statusEl.textContent = "";
    resultsEl.innerHTML = '<div class="loading"><span class="spinner"></span>バージョンを取得中...</div>';

    try {
      var resp = await fetch(card.prints_search_uri + "&include_multilingual=true");
      if (!resp.ok) {
        setStatus("取得エラー", true);
        resultsEl.innerHTML = "";
        return;
      }
      var data = await resp.json();
      var versions = data.data || [];
      if (!allLangCheck.checked) {
        versions = versions.filter(function (v) { return v.lang === "ja" || v.lang === "en"; });
      }
      setStatus(versions.length + "件のバージョン");
      renderResults(versions);
    } catch (err) {
      setStatus("通信エラー: " + err.message, true);
      resultsEl.innerHTML = "";
    }
  }

  // ════════════════════════════════════════
  //  3×3 Grid
  // ════════════════════════════════════════

  var dragSourceIndex = -1;
  var didDrag = false;

  function renderGrid() {
    gridEl.innerHTML = "";

    for (var i = 0; i < MAX_CARDS; i++) {
      var slot = document.createElement("div");
      slot.className = "grid-slot";

      if (selected[i]) {
        renderFilledSlot(slot, i);
      } else {
        renderEmptySlot(slot, i);
      }
      gridEl.appendChild(slot);
    }

    // UI state
    var count = filledCount();
    countLabel.textContent = count;
    clearBtn.disabled = count === 0;
    copyBtn.disabled = count === 0;
    openBtn.disabled = count === 0;
    saveImgBtn.disabled = count === 0;

    if (count > 0 && count < MAX_CARDS) {
      warnEl.textContent = "あと" + (MAX_CARDS - count) + "枚選べます（" + count + "枚でもシェア可能）";
    } else if (count === MAX_CARDS) {
      warnEl.textContent = "9枚揃いました！";
    } else {
      warnEl.textContent = "";
    }

    updateUrl();
  }

  function renderEmptySlot(slot, index) {
    slot.className += " empty";

    var numBadge = document.createElement("div");
    numBadge.className = "slot-number";
    numBadge.textContent = index + 1;
    slot.appendChild(numBadge);

    var label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = "選択";
    slot.appendChild(label);

    slot.addEventListener("click", function () {
      openModal(index);
    });
  }

  function renderFilledSlot(slot, index) {
    var card = selected[index];
    var imgUrl = getImageUrl(card);

    slot.className += " filled";
    slot.draggable = true;
    slot.dataset.index = index;

    if (imgUrl) {
      var img = document.createElement("img");
      img.src = imgUrl;
      img.alt = getDisplayName(card);
      img.loading = "lazy";
      slot.appendChild(img);
    } else {
      var placeholder = document.createElement("div");
      placeholder.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:0.7rem;padding:8px;text-align:center;color:#64748b;";
      placeholder.textContent = getDisplayName(card);
      slot.appendChild(placeholder);
    }

    // Number badge
    var numBadge = document.createElement("div");
    numBadge.className = "slot-number";
    numBadge.textContent = index + 1;
    slot.appendChild(numBadge);

    // Hover overlay
    var overlay = document.createElement("div");
    overlay.className = "card-hover";

    var changeBtn = document.createElement("button");
    changeBtn.className = "card-hover-btn change";
    changeBtn.textContent = "変更";
    changeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openModal(index);
    });

    var verBtn = document.createElement("button");
    verBtn.className = "card-hover-btn version";
    verBtn.textContent = "他Ver";
    verBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openVersionModal(index);
    });

    var removeBtn = document.createElement("button");
    removeBtn.className = "card-hover-btn remove";
    removeBtn.textContent = "解除";
    removeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      removeCard(index);
    });

    overlay.appendChild(changeBtn);
    overlay.appendChild(verBtn);
    overlay.appendChild(removeBtn);
    slot.appendChild(overlay);

    // Touch: tap to show/hide overlay on mobile
    slot.addEventListener("click", function (e) {
      if (didDrag) { didDrag = false; return; }
      // Toggle overlay on touch devices
      var allOverlays = gridEl.querySelectorAll(".card-hover.active");
      allOverlays.forEach(function (o) {
        if (o !== overlay) o.classList.remove("active");
      });
      overlay.classList.toggle("active");
    });

    attachDragEvents(slot, index);
  }

  function attachDragEvents(slot, index) {
    slot.addEventListener("dragstart", function (e) {
      dragSourceIndex = index;
      didDrag = false;
      this.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    slot.addEventListener("dragend", function () {
      this.classList.remove("dragging");
      dragSourceIndex = -1;
    });

    slot.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragSourceIndex !== -1 && dragSourceIndex !== index) {
        this.classList.add("drag-over");
      }
    });

    slot.addEventListener("dragleave", function () {
      this.classList.remove("drag-over");
    });

    slot.addEventListener("drop", function (e) {
      e.preventDefault();
      this.classList.remove("drag-over");
      if (dragSourceIndex !== -1 && dragSourceIndex !== index) {
        var temp = selected[dragSourceIndex];
        selected[dragSourceIndex] = selected[index];
        selected[index] = temp;
        didDrag = true;
        renderGrid();
      }
    });
  }

  // Touch drag support for mobile
  var touchSourceIndex = -1;
  var touchClone = null;
  var touchStartX = 0;
  var touchStartY = 0;
  var touchMoved = false;

  gridEl.addEventListener("touchstart", function (e) {
    var slot = e.target.closest(".grid-slot.filled");
    if (!slot) return;
    touchSourceIndex = parseInt(slot.dataset.index);
    touchMoved = false;
    var touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  gridEl.addEventListener("touchmove", function (e) {
    if (touchSourceIndex === -1) return;
    var touch = e.touches[0];
    var dx = touch.clientX - touchStartX;
    var dy = touch.clientY - touchStartY;

    if (!touchMoved && Math.abs(dx) + Math.abs(dy) > 10) {
      touchMoved = true;
      // Create drag clone
      var sourceSlot = gridEl.children[touchSourceIndex];
      touchClone = sourceSlot.cloneNode(true);
      touchClone.style.cssText = "position:fixed;pointer-events:none;opacity:0.7;z-index:200;width:" + sourceSlot.offsetWidth + "px;height:" + sourceSlot.offsetHeight + "px;";
      document.body.appendChild(touchClone);
      sourceSlot.classList.add("dragging");
    }

    if (touchMoved && touchClone) {
      e.preventDefault();
      touchClone.style.left = (touch.clientX - touchClone.offsetWidth / 2) + "px";
      touchClone.style.top = (touch.clientY - touchClone.offsetHeight / 2) + "px";

      // Highlight drop target
      Array.from(gridEl.children).forEach(function (s) { s.classList.remove("drag-over"); });
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      var targetSlot = target && target.closest(".grid-slot");
      if (targetSlot && targetSlot.parentNode === gridEl) {
        var targetIndex = Array.from(gridEl.children).indexOf(targetSlot);
        if (targetIndex !== touchSourceIndex) {
          targetSlot.classList.add("drag-over");
        }
      }
    }
  }, { passive: false });

  gridEl.addEventListener("touchend", function (e) {
    if (touchSourceIndex === -1) return;

    Array.from(gridEl.children).forEach(function (s) {
      s.classList.remove("dragging");
      s.classList.remove("drag-over");
    });

    if (touchMoved) {
      // Find drop target
      var touch = e.changedTouches[0];
      if (touchClone) {
        touchClone.style.display = "none";
      }
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (touchClone) {
        document.body.removeChild(touchClone);
        touchClone = null;
      }
      var targetSlot = target && target.closest(".grid-slot");
      if (targetSlot && targetSlot.parentNode === gridEl) {
        var targetIndex = Array.from(gridEl.children).indexOf(targetSlot);
        if (targetIndex !== touchSourceIndex) {
          var temp = selected[touchSourceIndex];
          selected[touchSourceIndex] = selected[targetIndex];
          selected[targetIndex] = temp;
          renderGrid();
        }
      }
    }

    touchSourceIndex = -1;
    touchMoved = false;
  });

  // ════════════════════════════════════════
  //  Add / Remove
  // ════════════════════════════════════════

  function selectCard(card) {
    if (activeSlotIndex < 0 || activeSlotIndex >= MAX_CARDS) return;
    selected[activeSlotIndex] = card;
    closeModal();
    renderGrid();
  }

  function removeCard(index) {
    if (index < 0 || index >= MAX_CARDS) return;
    selected[index] = null;
    // Compact: shift cards left to fill gaps
    var cards = selected.filter(Boolean);
    selected = new Array(MAX_CARDS).fill(null);
    cards.forEach(function (c, i) { selected[i] = c; });
    renderGrid();
  }

  function clearAll() {
    if (!confirm("すべてのカードをクリアしますか？")) return;
    selected = new Array(MAX_CARDS).fill(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* */ }
    renderGrid();
  }

  // ════════════════════════════════════════
  //  Search & Results
  // ════════════════════════════════════════

  function renderResults(cards, clearFirst) {
    if (clearFirst !== false) resultsEl.innerHTML = "";
    if (cards.length === 0 && currentShownCards === 0) {
      setStatus("検索結果がありません");
      return;
    }

    cards.forEach(function (card) {
      var el = document.createElement("div");
      el.className = "result-card";
      el.dataset.cardId = card.id;

      // Image
      var imgUrl = getImageUrl(card);
      if (imgUrl) {
        var img = document.createElement("img");
        img.className = "result-img";
        img.src = imgUrl;
        img.alt = getDisplayName(card);
        img.loading = "lazy";
        el.appendChild(img);
      } else {
        var noImg = document.createElement("div");
        noImg.className = "no-image";
        noImg.textContent = "No Image";
        el.appendChild(noImg);
      }

      // Info
      var info = document.createElement("div");
      info.className = "result-info";

      var nameEl = document.createElement("div");
      nameEl.className = "result-name";
      nameEl.textContent = getDisplayName(card);
      info.appendChild(nameEl);

      var meta = document.createElement("div");
      meta.className = "result-meta";
      meta.textContent = (card.set || "").toUpperCase() + " #" + (card.collector_number || "?");
      if (card.type_line) meta.textContent += " · " + card.type_line.split("—")[0].trim();
      info.appendChild(meta);

      el.appendChild(info);

      // Action buttons
      var actions = document.createElement("div");
      actions.className = "result-actions";

      var addBtn = document.createElement("button");
      addBtn.className = "result-add-btn";
      addBtn.textContent = "追加";
      (function (c) {
        addBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          selectCard(c);
        });
      })(card);
      actions.appendChild(addBtn);

      // Version button
      if (card.prints_search_uri) {
        var verBtn = createVersionButton(card, el);
        actions.appendChild(verBtn);
      }

      el.appendChild(actions);
      resultsEl.appendChild(el);
    });
  }

  function createVersionButton(card, parentEl) {
    var verBtn = document.createElement("button");
    verBtn.className = "result-ver-btn";
    verBtn.textContent = "▼ 他Ver";

    var versionsRow = null;

    verBtn.addEventListener("click", function (e) {
      e.stopPropagation();

      if (versionsRow) {
        var visible = versionsRow.style.display !== "none";
        versionsRow.style.display = visible ? "none" : "flex";
        verBtn.textContent = visible ? "▼ 他Ver" : "▲ 他Ver";
        verBtn.classList.toggle("open", !visible);
        return;
      }

      // Create row and fetch
      versionsRow = document.createElement("div");
      versionsRow.className = "versions-row";
      versionsRow.innerHTML = '<div class="ver-loading"><span class="spinner"></span>読込中</div>';
      // Insert after the result-card
      parentEl.parentNode.insertBefore(versionsRow, parentEl.nextSibling);
      verBtn.textContent = "▲ 他Ver";
      verBtn.classList.add("open");

      fetch(card.prints_search_uri + "&include_multilingual=true")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          versionsRow.innerHTML = "";
          var vers = (data && data.data) ? data.data : [];
          if (!allLangCheck.checked) {
            vers = vers.filter(function (v) { return v.lang === "ja" || v.lang === "en"; });
          }
          if (vers.length === 0) {
            versionsRow.innerHTML = '<div class="ver-loading">バージョンなし</div>';
            return;
          }
          vers.forEach(function (ver) {
            versionsRow.appendChild(createVersionItem(ver));
          });
        })
        .catch(function () {
          versionsRow.innerHTML = '<div class="ver-loading">取得エラー</div>';
        });
    });

    return verBtn;
  }

  function createVersionItem(ver) {
    var item = document.createElement("div");
    item.className = "ver-item";
    item.title = getDisplayName(ver) + " (" + (ver.set_name || ver.set) + ")";

    var vImg = getImageUrl(ver);
    if (vImg) {
      var imgEl = document.createElement("img");
      imgEl.src = vImg;
      imgEl.alt = getDisplayName(ver);
      imgEl.loading = "lazy";
      item.appendChild(imgEl);
    }

    var label = document.createElement("div");
    label.className = "ver-label";
    label.textContent = (ver.set || "").toUpperCase() + " " + (ver.lang || "").toUpperCase();
    item.appendChild(label);

    item.addEventListener("click", function () { selectCard(ver); });
    return item;
  }

  var currentTotalCards = 0;
  var currentShownCards = 0;

  async function doSearch() {
    var query = searchInput.value.trim();
    if (!query) { setStatus("検索クエリを入力してください"); return; }

    searchBtn.disabled = true;
    setStatus("検索中...");
    resultsEl.innerHTML = '<div class="loading"><span class="spinner"></span>検索中...</div>';
    currentTotalCards = 0;
    currentShownCards = 0;

    try {
      var fullQuery = allLangCheck.checked ? query : "(lang:ja OR lang:en) " + query;
      var url = API_BASE + "/cards/search?q=" + encodeURIComponent(fullQuery) + "&include_multilingual=true";
      await fetchAndAppendResults(url, true);
    } catch (err) {
      setStatus("通信エラー: " + err.message, true);
      resultsEl.innerHTML = "";
    } finally {
      searchBtn.disabled = false;
    }
  }

  async function fetchAndAppendResults(url, isFirstPage) {
    if (isFirstPage) {
      resultsEl.innerHTML = '<div class="loading"><span class="spinner"></span>検索中...</div>';
    }

    var resp = await fetch(url);
    if (!resp.ok) {
      var errBody = null;
      try { errBody = await resp.json(); } catch (e) { /* ignore */ }
      var errMsg = (errBody && errBody.details) ? errBody.details : "HTTP " + resp.status;
      setStatus("検索エラー: " + errMsg, true);
      if (isFirstPage) resultsEl.innerHTML = "";
      return;
    }

    var data = await resp.json();
    var cards = data.data || [];

    if (isFirstPage) {
      currentTotalCards = data.total_cards || 0;
      currentShownCards = 0;
      resultsEl.innerHTML = "";
    }

    // Remove existing "load more" button
    var existingMore = resultsEl.querySelector(".load-more-btn");
    if (existingMore) existingMore.remove();

    currentShownCards += cards.length;
    setStatus(currentTotalCards + "件中 " + currentShownCards + "件を表示");
    renderResults(cards, false);

    // Add "load more" button if there are more pages
    if (data.has_more && data.next_page) {
      var moreBtn = document.createElement("button");
      moreBtn.className = "load-more-btn";
      moreBtn.textContent = "さらに表示（" + currentShownCards + " / " + currentTotalCards + "）";
      (function (nextUrl) {
        moreBtn.addEventListener("click", async function () {
          moreBtn.disabled = true;
          moreBtn.textContent = "読み込み中...";
          try {
            await fetchAndAppendResults(nextUrl, false);
          } catch (err) {
            moreBtn.textContent = "読み込みエラー。タップで再試行";
            moreBtn.disabled = false;
          }
        });
      })(data.next_page);
      resultsEl.appendChild(moreBtn);
    }
  }

  // ════════════════════════════════════════
  //  Restore from URL
  // ════════════════════════════════════════

  async function restoreCards() {
    // URLパラメータ優先、なければlocalStorageから復元
    var params = new URLSearchParams(initialSearch);
    var idsParam = params.get("ids");
    var source = "リンク";

    if (!idsParam) {
      try {
        idsParam = localStorage.getItem(STORAGE_KEY);
        source = "前回の作業";
      } catch (e) { /* storage unavailable */ }
    }
    if (!idsParam) return;

    var ids = idsParam.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, MAX_CARDS);
    if (ids.length === 0) return;

    setRestoreStatus(source + "からカードを復元中...");

    try {
      var promises = ids.map(function (id) {
        return fetch(API_BASE + "/cards/" + encodeURIComponent(id))
          .then(function (resp) { return resp.ok ? resp.json() : null; })
          .catch(function () { return null; });
      });
      var results = await Promise.all(promises);

      var notFound = 0;
      results.forEach(function (card, i) {
        if (card) {
          selected[i] = card;
        } else {
          notFound++;
        }
      });

      renderGrid();

      var restored = filledCount();
      if (notFound > 0) {
        setRestoreStatus(restored + "枚を復元（" + notFound + "枚は取得できませんでした）", true);
      } else {
        setRestoreStatus(restored + "枚を復元しました");
      }
    } catch (err) {
      setRestoreStatus("復元通信エラー: " + err.message, true);
    }
  }

  // ════════════════════════════════════════
  //  Clipboard
  // ════════════════════════════════════════

  async function copyShareLink() {
    var url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      warnEl.textContent = "リンクをコピーしました！";
    } catch (e) {
      try {
        var ta = document.createElement("textarea");
        ta.value = url;
        ta.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        warnEl.textContent = "リンクをコピーしました！";
      } catch (e2) {
        warnEl.textContent = "コピーに失敗しました。URLを手動でコピーしてください。";
      }
    }
  }

  function openShareLink() {
    window.open(buildShareUrl(), "_blank");
  }

  // ════════════════════════════════════════
  //  Save as Image
  // ════════════════════════════════════════

  function loadImage(url) {
    // wsrv.nl 画像プロキシ経由でCORSを回避
    var proxyUrl = "https://wsrv.nl/?url=" + encodeURIComponent(url);
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        console.error("Image load failed:", proxyUrl);
        resolve(null);
      };
      img.src = proxyUrl;
    });
  }

  async function saveAsImage() {
    if (filledCount() === 0) return;

    var userName = prompt("画像に表示する名前（空欄でスキップ）", "");
    if (userName === null) return; // cancelled
    userName = userName.trim();

    saveImgBtn.disabled = true;
    saveImgBtn.textContent = "生成中...";

    try {
      var CARD_W = 200;
      var CARD_H = 279;
      var GAP = 8;
      var COLS = 3;
      var PADDING = 20;
      var HEADER_H = 56;
      var FOOTER_H = userName ? 36 : 16;

      var gridW = COLS * CARD_W + (COLS - 1) * GAP;
      var rows = Math.ceil(filledCount() / COLS) || 1;
      // Always use 3 rows for 9-slot grid
      rows = 3;
      var gridH = rows * CARD_H + (rows - 1) * GAP;

      var canvasW = gridW + PADDING * 2;
      var canvasH = HEADER_H + gridH + FOOTER_H + PADDING;

      var canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      var ctx = canvas.getContext("2d");

      // Background
      ctx.fillStyle = "#f3f6fb";
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Title
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 18px 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("私を構成する9枚のカード", canvasW / 2, PADDING + 20);

      // Subtitle
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px 'Noto Sans JP', sans-serif";
      ctx.fillText("MTGカードを選んで、あなたを表す9枚を共有しよう", canvasW / 2, PADDING + 38);

      // Load and draw card images
      var imagePromises = selected.map(function (card, idx) {
        if (!card) return Promise.resolve(null);
        var url = getImageUrl(card);
        if (!url) {
          console.warn("Slot " + idx + ": no image URL", card.name);
          return Promise.resolve(null);
        }
        console.log("Slot " + idx + ": loading", url);
        return loadImage(url).then(function (img) {
          console.log("Slot " + idx + ":", img ? "OK" : "FAILED");
          return img;
        });
      });

      var images = await Promise.all(imagePromises);
      var loaded = images.filter(Boolean).length;
      console.log("Images loaded: " + loaded + " / " + filledCount());

      for (var i = 0; i < MAX_CARDS; i++) {
        var col = i % COLS;
        var row = Math.floor(i / COLS);
        var x = PADDING + col * (CARD_W + GAP);
        var y = HEADER_H + row * (CARD_H + GAP);

        if (images[i]) {
          // Round corners via clipping
          var r = 8;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + CARD_W - r, y);
          ctx.quadraticCurveTo(x + CARD_W, y, x + CARD_W, y + r);
          ctx.lineTo(x + CARD_W, y + CARD_H - r);
          ctx.quadraticCurveTo(x + CARD_W, y + CARD_H, x + CARD_W - r, y + CARD_H);
          ctx.lineTo(x + r, y + CARD_H);
          ctx.quadraticCurveTo(x, y + CARD_H, x, y + CARD_H - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(images[i], x, y, CARD_W, CARD_H);
          ctx.restore();
        } else {
          // Empty slot placeholder
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, CARD_W, CARD_H);
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          ctx.strokeRect(x + 1.5, y + 1.5, CARD_W - 3, CARD_H - 3);
          ctx.setLineDash([]);
        }
      }

      // Creator name (optional)
      if (userName) {
        ctx.fillStyle = "#64748b";
        ctx.font = "11px 'Noto Sans JP', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("by " + userName, canvasW / 2, canvasH - 10);
      }

      // Download
      var link = document.createElement("a");
      link.download = "my-9-cards.png";
      link.href = canvas.toDataURL("image/png");
      link.click();

      warnEl.textContent = "画像を保存しました！";
    } catch (err) {
      warnEl.textContent = "画像の生成に失敗しました: " + err.message;
    } finally {
      saveImgBtn.disabled = false;
      saveImgBtn.textContent = "画像で保存";
    }
  }

  // ════════════════════════════════════════
  //  Events & Init
  // ════════════════════════════════════════

  // Modal events
  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) closeModal();
  });

  // Search
  searchBtn.addEventListener("click", doSearch);
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") doSearch();
  });

  // Actions
  clearBtn.addEventListener("click", clearAll);
  copyBtn.addEventListener("click", copyShareLink);
  openBtn.addEventListener("click", openShareLink);
  saveImgBtn.addEventListener("click", saveAsImage);

  // Dismiss active overlays on outside click
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".grid-slot.filled")) {
      gridEl.querySelectorAll(".card-hover.active").forEach(function (o) {
        o.classList.remove("active");
      });
    }
  });

  // Init
  renderGrid();
  restoreCards();
})();
