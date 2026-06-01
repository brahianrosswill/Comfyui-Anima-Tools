import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";

app.registerExtension({
    name: "AnimaArtistTagSelector.extension",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AnimaArtistTagSelector" || nodeData.name === "AnimaArtistTagSelectorPlus") {
            const origOnCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                origOnCreated?.apply(this, arguments);

                // 找到 artist_tags widget
                const artistTagsWidget = this.widgets.find(w => w.name === "artist_tags");
                
                // 添加打开选择器的按钮
                const btnWidget = this.addWidget("button", t("Open Artist Selector"), null, () => {
                    if (!window.galleryData) {
                        alert(t("Anima artist database is loading, please wait a few seconds..."));
                        return;
                    }
                    openArtistSelectorModal(this, artistTagsWidget);
                });

                // 给按钮增加精致边框与微动画 (经典蓝科技感美学)
                if (btnWidget && btnWidget.el) {
                    btnWidget.el.style.cssText += `
                        border: 1px solid rgba(11, 140, 233, 0.4) !important;
                        background: linear-gradient(135deg, rgba(11, 140, 233, 0.1), rgba(2, 86, 145, 0.15)) !important;
                        color: #7dd3fc !important;
                        font-weight: 600 !important;
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    `;
                    btnWidget.el.onmouseover = () => {
                        btnWidget.el.style.boxShadow = "0 0 12px rgba(11, 140, 233, 0.35)";
                        btnWidget.el.style.background = "linear-gradient(135deg, rgba(11, 140, 233, 0.25), rgba(2, 86, 145, 0.3))";
                    };
                    btnWidget.el.onmouseout = () => {
                        btnWidget.el.style.boxShadow = "none";
                        btnWidget.el.style.background = "linear-gradient(135deg, rgba(11, 140, 233, 0.1), rgba(2, 86, 145, 0.15))";
                    };
                }
            };
        }
    }
});

function openArtistSelectorModal(node, tagsWidget) {
    // 1. 解析当前节点中已经选中的 tags，兼容 @ 前缀和 by 前缀
    const currentTagsText = tagsWidget.value || "";
    const selectedArtists = new Set(
        currentTagsText.split(",")
            .map(t => {
                let clean = t.trim();
                if (clean.startsWith("@")) {
                    clean = clean.substring(1).trim();
                } else if (clean.toLowerCase().startsWith("by ")) {
                    clean = clean.substring(3).trim();
                }
                return clean;
            })
            .filter(t => t.length > 0)
    );

    // CDN 镜像源配置 (保存在本地，下次自动读取)
    const CDN_STORAGE_KEY = "anima-selector-active-cdn";
    let activeCdn = localStorage.getItem(CDN_STORAGE_KEY) || "jsdelivr";

    // 记忆排序、页数和滚动位置配置 (本地持久化读取)
    const SORT_STORAGE_KEY = "anima-selector-active-sort";
    const PAGE_STORAGE_KEY = "anima-selector-active-page";
    const SCROLL_STORAGE_KEY = "anima-selector-active-scroll";
    
    // 收藏持久化
    const FAVORITES_STORAGE_KEY = "anima-artist-favorites-list";
    let favoriteSet = new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || []);

    function saveFavorites() {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoriteSet)));
    }

    const SIDEBAR_STORAGE_KEY = "anima-artist-active-sidebar-category";
    const SIDEBAR_SCROLL_STORAGE_KEY = "anima-artist-sidebar-scroll";

    let activeSort = localStorage.getItem(SORT_STORAGE_KEY) || "works-desc";
    let activeCategory = localStorage.getItem(SIDEBAR_STORAGE_KEY) || "all";
    let lastScrollTop = parseInt(localStorage.getItem(SCROLL_STORAGE_KEY)) || 0;
    let lastSidebarScrollTop = parseInt(localStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY)) || 0;
    let isFirstRender = true;

    function getImgUrl(partition, id) {
        if (activeCdn === "jsdelivr") {
            return `https://fastly.jsdelivr.net/gh/ThetaCursed/Anima-Assets@main/images/${partition}/${id}.webp`;
        } else if (activeCdn === "github") {
            return `https://raw.githubusercontent.com/ThetaCursed/Anima-Assets/main/images/${partition}/${id}.webp`;
        } else {
            return `https://cdn.statically.io/gh/ThetaCursed/Anima-Assets/main/images/${partition}/${id}.webp`;
        }
    }

    // 2. 创建 Modal DOM
    const modalOverlay = document.createElement("div");
    modalOverlay.id = "anima-selector-overlay";
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(10, 10, 15, 0.75);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    `;

    const modalContainer = document.createElement("div");
    modalContainer.id = "anima-selector-container";
    modalContainer.style.cssText = `
        width: 92%;
        max-width: 1320px;
        height: 90%;
        background: #171718 !important;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: animaFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;

    // 点击弹窗遮罩层（弹窗外侧）执行“确认应用并关闭”
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
            applySelectionAndClose();
        }
    };

    // 注入动画样式及 ComfyUI 原生经典蓝 #0b8ce9 强调色样式
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        @keyframes animaFadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes animaShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .anima-shimmer {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: linear-gradient(90deg, rgba(20, 20, 30, 0.8) 25%, rgba(11, 140, 233, 0.12) 50%, rgba(20, 20, 30, 0.8) 75%) !important;
            background-size: 200% 100% !important;
            animation: animaShimmer 1.5s infinite linear !important;
            z-index: 2 !important;
            border-radius: 14px !important;
            pointer-events: none !important;
        }
        @keyframes animaSpin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .anima-spinner {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            width: 26px !important;
            height: 26px !important;
            border: 2.5px solid rgba(11, 140, 233, 0.15) !important;
            border-top: 2.5px solid #0b8ce9 !important;
            border-radius: 50% !important;
            animation: animaSpin 0.85s infinite linear !important;
            z-index: 3 !important;
        }
        /* Custom Scrollbar */
        .anima-scrollbar::-webkit-scrollbar {
            width: 6px;
        }
        .anima-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .anima-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
        .anima-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.25);
        }
        /* Buttons */
        .anima-btn {
            padding: 9px 18px;
            border-radius: 14px;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(255, 255, 255, 0.05);
            color: #e5e7eb;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            user-select: none;
        }
        .anima-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.12);
            color: white;
            border-color: rgba(255, 255, 255, 0.15);
        }
        .anima-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        .anima-btn-primary {
            background: linear-gradient(135deg, #0b8ce9, #0572bf);
            color: white;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(11, 140, 233, 0.3);
            border-color: rgba(11, 140, 233, 0.25);
        }
        .anima-btn-primary:hover:not(:disabled) {
            background: linear-gradient(135deg, #0284c7, #025691);
            box-shadow: 0 6px 16px rgba(11, 140, 233, 0.45);
        }
        .anima-btn-danger {
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: #f87171;
        }
        .anima-btn-danger:hover:not(:disabled) {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.35);
            color: white;
        }
        .anima-btn-active {
            background: rgba(11, 140, 233, 0.2) !important;
            border-color: rgba(11, 140, 233, 0.4) !important;
            color: #7dd3fc !important;
        }
        /* Pagination Bar */
        .anima-pagination {
            padding: 12px 24px;
            background: rgba(20, 20, 30, 0.35);
            border-top: 1px solid rgba(255, 255, 255, 0.04);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
        }
        .anima-page-btn {
            padding: 7px 14px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            color: #a1a1aa;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .anima-page-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
            color: white;
            border-color: rgba(255, 255, 255, 0.12);
        }
        .anima-page-btn:disabled {
            opacity: 0.25;
            cursor: not-allowed;
        }
        .anima-page-input {
            width: 48px;
            padding: 6px 8px;
            background: rgba(10, 10, 15, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: white;
            font-size: 13px;
            text-align: center;
            outline: none;
        }
        .anima-page-input:focus {
            border-color: #0b8ce9;
        }

        /* 侧边栏按钮高级样式 */
        .sidebar-item {
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 13.5px;
            font-weight: 500;
            color: #a1a1aa;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: space-between;
            border: 1px solid transparent;
            margin-bottom: 4px;
            user-select: none;
        }
        .sidebar-item:hover {
            background: rgba(255, 255, 255, 0.04);
            color: #e4e4e7;
        }
        .sidebar-item.active {
            background: linear-gradient(135deg, rgba(11, 140, 233, 0.15), rgba(2, 86, 145, 0.15)) !important;
            border-color: rgba(11, 140, 233, 0.3) !important;
            color: #7dd3fc !important;
            font-weight: 700 !important;
        }
    `;
    document.head.appendChild(styleSheet);

    // 3. 构建 Header
    const header = document.createElement("div");
    header.style.cssText = `
        padding: 22px 28px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(18, 18, 24, 0.6);
    `;
    
    const titleContainer = document.createElement("div");
    titleContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
    `;
    const title = document.createElement("h2");
    title.innerText = t("Anima Artist Style Selector");
    title.style.cssText = "margin: 0; font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #7dd3fc, #0b8ce9, #0284c7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.5px;";
    
    const subtitle = document.createElement("span");
    subtitle.innerText = t("Browse and select your favorite artist styles, with 3:4 clear preview cards and precise pagination.");
    subtitle.style.cssText = "font-size: 12.5px; color: #9ca3af; font-weight: 500;";
    titleContainer.appendChild(title);
    titleContainer.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;
    closeBtn.style.cssText = "background: none; border: none; color: #9ca3af; cursor: pointer; transition: all 0.25s ease; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 50%; background: rgba(255,255,255,0.03);";
    closeBtn.onclick = () => closeModal();
    closeBtn.onmouseover = () => {
        closeBtn.style.color = "#ffffff";
        closeBtn.style.background = "rgba(239, 68, 68, 0.2)";
        closeBtn.style.transform = "rotate(90deg)";
    };
    closeBtn.onmouseout = () => {
        closeBtn.style.color = "#9ca3af";
        closeBtn.style.background = "rgba(255,255,255,0.03)";
        closeBtn.style.transform = "rotate(0deg)";
    };

    header.appendChild(titleContainer);
    header.appendChild(closeBtn);
    modalContainer.appendChild(header);

    // 4. 构建 Toolbar / 控制区
    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
        padding: 16px 28px;
        background: rgba(25, 25, 35, 0.15);
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
    `;

    // 左侧：搜索和筛选控制
    const filterControls = document.createElement("div");
    filterControls.style.cssText = "display: flex; gap: 14px; align-items: center; flex: 1; min-width: 300px;";

    const searchInputWrapper = document.createElement("div");
    searchInputWrapper.style.cssText = "position: relative; flex: 1; max-width: 300px;";
    
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = t("Search artist name...");
    searchInput.style.cssText = `
        width: 100%;
        padding: 11px 18px;
        padding-right: 42px;
        background: rgba(10, 10, 15, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        outline: none;
        transition: all 0.25s ease;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    `;
    searchInput.onfocus = () => {
        searchInput.style.borderColor = "#0b8ce9";
        searchInput.style.boxShadow = "0 0 14px rgba(11, 140, 233, 0.25), inset 0 2px 4px rgba(0,0,0,0.2)";
    };
    searchInput.onblur = () => {
        searchInput.style.borderColor = "rgba(255, 255, 255, 0.08)";
        searchInput.style.boxShadow = "none";
    };

    const clearSearchBtn = document.createElement("span");
    clearSearchBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;
    clearSearchBtn.style.cssText = `
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: #71717a;
        cursor: pointer;
        display: none;
        line-height: 1;
        transition: color 0.15s ease;
    `;
    clearSearchBtn.onmouseover = () => clearSearchBtn.style.color = "#ffffff";
    clearSearchBtn.onmouseout = () => clearSearchBtn.style.color = "#71717a";
    clearSearchBtn.onclick = () => {
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
        currentPage = 1;
        localStorage.setItem(PAGE_STORAGE_KEY, 1);
        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);
        triggerFilter();
    };

    searchInput.oninput = () => {
        clearSearchBtn.style.display = searchInput.value ? "block" : "none";
        currentPage = 1; 
        localStorage.setItem(PAGE_STORAGE_KEY, 1);
        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);
        triggerFilter();
    };

    searchInputWrapper.appendChild(searchInput);
    searchInputWrapper.appendChild(clearSearchBtn);
    filterControls.appendChild(searchInputWrapper);

    // 排序下拉菜单
    const sortSelect = document.createElement("select");
    sortSelect.style.cssText = `
        padding: 11px 18px;
        background: rgba(10, 10, 15, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        color: #d1d5db;
        font-size: 14px;
        font-weight: 600;
        outline: none;
        cursor: pointer;
        transition: all 0.25s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    `;
    sortSelect.innerHTML = `
        <option value="works-desc">${t("Works Count ⬇")}</option>
        <option value="works-asc">${t("Works Count ⬆")}</option>
        <option value="unique-desc">${t("Uniqueness Score ⬇")}</option>
        <option value="unique-asc">${t("Uniqueness Score ⬆")}</option>
        <option value="name-asc">${t("Name A-Z")}</option>
        <option value="name-desc">${t("Name Z-A")}</option>
    `;
    sortSelect.value = activeSort; 
    sortSelect.onchange = () => {
        currentPage = 1; 
        localStorage.setItem(PAGE_STORAGE_KEY, 1);
        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);
        localStorage.setItem(SORT_STORAGE_KEY, sortSelect.value); 
        triggerFilter();
    };
    filterControls.appendChild(sortSelect);

    // 镜像源切换下拉菜单
    const cdnSelect = document.createElement("select");
    cdnSelect.style.cssText = `
        padding: 11px 18px;
        background: rgba(10, 10, 15, 0.7);
        border: 1px solid rgba(11, 140, 233, 0.2);
        border-radius: 14px;
        color: #7dd3fc;
        font-size: 14px;
        font-weight: 600;
        outline: none;
        cursor: pointer;
        transition: all 0.25s ease;
    `;
    cdnSelect.innerHTML = `
        <option value="jsdelivr" ${activeCdn === "jsdelivr" ? "selected" : ""}>${t("CDN: JsDelivr (Recommended)")}</option>
        <option value="github" ${activeCdn === "github" ? "selected" : ""}>${t("CDN: GitHub Raw (Proxy)")}</option>
        <option value="statically" ${activeCdn === "statically" ? "selected" : ""}>${t("CDN: Statically")}</option>
    `;
    cdnSelect.onchange = () => {
        activeCdn = cdnSelect.value;
        localStorage.setItem(CDN_STORAGE_KEY, activeCdn);
        renderCurrentPage(); 
    };
    filterControls.appendChild(cdnSelect);

    // 右侧：功能按钮
    const actionControls = document.createElement("div");
    actionControls.style.cssText = "display: flex; gap: 12px; align-items: center;";

    // 新加“复制已选”按钮
    const copySelectedBtn = document.createElement("button");
    copySelectedBtn.className = "anima-btn";
    copySelectedBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        ${t("Copy Selected")}
    `;
    copySelectedBtn.onclick = () => {
        if (selectedArtists.size === 0) {
            alert(t("Please select at least one artist first."));
            return;
        }
        const textToCopy = Array.from(selectedArtists).map(name => `@${name}`).join(", ") + ", ";
        
        const performCopy = () => {
            showTemporaryToast(t("Copied Successfully"));
        };
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(performCopy).catch(() => {
                fallbackCopy(textToCopy, performCopy);
            });
        } else {
            fallbackCopy(textToCopy, performCopy);
        }
    };
    actionControls.appendChild(copySelectedBtn);

    const showSelectedOnlyBtn = document.createElement("button");
    showSelectedOnlyBtn.className = "anima-btn";
    showSelectedOnlyBtn.innerHTML = t("Show Selected");
    let showSelectedOnly = false;
    showSelectedOnlyBtn.onclick = () => {
        showSelectedOnly = !showSelectedOnly;
        if (showSelectedOnly) {
            showSelectedOnlyBtn.classList.add("anima-btn-active");
            showSelectedOnlyBtn.style.cssText += `
                background: rgba(11, 140, 233, 0.2) !important;
                border-color: rgba(11, 140, 233, 0.4) !important;
                color: #7dd3fc !important;
            `;
        } else {
            showSelectedOnlyBtn.classList.remove("anima-btn-active");
            showSelectedOnlyBtn.style.cssText = "";
        }
        currentPage = 1;
        triggerFilter();
    };
    actionControls.appendChild(showSelectedOnlyBtn);

    const clearAllBtn = document.createElement("button");
    clearAllBtn.className = "anima-btn anima-btn-danger";
    clearAllBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        ${t("Clear Selected")}
    `;
    clearAllBtn.onclick = () => {
        if (selectedArtists.size === 0) return;
        if (confirm(t("Are you sure you want to clear all selected artists?"))) {
            selectedArtists.clear();
            updateCountLabel();
            renderCurrentPage();
        }
    };
    actionControls.appendChild(clearAllBtn);

    toolbar.appendChild(filterControls);
    toolbar.appendChild(actionControls);
    modalContainer.appendChild(toolbar);

    // 5. 构建主展示区：水平分栏 (左侧侧边栏 + 右侧卡片网格与分页)
    const mainSection = document.createElement("div");
    mainSection.style.cssText = "display: flex; flex: 1; overflow: hidden; background: rgba(10, 10, 15, 0.1);";

    // 5A. 左侧侧边栏 - 分类与收藏
    const sidebar = document.createElement("div");
    sidebar.className = "anima-scrollbar";
    sidebar.style.cssText = `
        width: 250px;
        background: rgba(18, 18, 24, 0.4);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        scrollbar-gutter: stable;
        padding: 20px 12px 20px 16px;
        box-sizing: border-box;
    `;
    sidebar.onscroll = () => {
        localStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, sidebar.scrollTop);
    };

    // 侧边栏主标题
    const sidebarTitle = document.createElement("div");
    sidebarTitle.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#0b8ce9;">
            <rect x="3" y="3" width="7" height="9"></rect>
            <rect x="14" y="3" width="7" height="5"></rect>
            <rect x="14" y="12" width="7" height="9"></rect>
            <rect x="3" y="16" width="7" height="5"></rect>
        </svg>
        <span>${t("Browse Categories")}</span>
    `;
    sidebarTitle.style.cssText = "font-size: 12px; font-weight: 800; color: #71717a; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-left: 8px;";
    sidebar.appendChild(sidebarTitle);

    const sidebarList = document.createElement("div");
    sidebarList.style.cssText = "display: flex; flex-direction: column;";
    sidebar.appendChild(sidebarList);

    mainSection.appendChild(sidebar);

    // 5B. 右侧展示区 (网格列表 + 分页控制)
    const gridArea = document.createElement("div");
    gridArea.style.cssText = "flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;";

    // 画师卡片网格列表
    const listContainer = document.createElement("div");
    listContainer.className = "anima-scrollbar";
    listContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 24px 28px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 20px;
        align-content: start;
        background: rgba(15, 15, 20, 0.2);
    `;
    listContainer.onscroll = () => {
        localStorage.setItem(SCROLL_STORAGE_KEY, listContainer.scrollTop);
    };
    gridArea.appendChild(listContainer);

    // 6. 构建分页控制栏 (Pagination Bar - 嵌入在网格区底部)
    const paginationBar = document.createElement("div");
    paginationBar.className = "anima-pagination";
    paginationBar.style.cssText += " background: rgba(18, 18, 24, 0.35);";
    
    const pageStats = document.createElement("div");
    pageStats.style.cssText = "font-size: 13px; color: #9ca3af; font-weight: 500;";
    pageStats.innerText = t("Total {total} artists | Showing {start}-{end}", { total: 0, start: 0, end: 0 });

    const pageControls = document.createElement("div");
    pageControls.style.cssText = "display: flex; gap: 8px; align-items: center;";

    const firstPageBtn = document.createElement("button");
    firstPageBtn.className = "anima-page-btn";
    firstPageBtn.innerText = t("First");
    firstPageBtn.onclick = () => goToPage(1);

    const prevPageBtn = document.createElement("button");
    prevPageBtn.className = "anima-page-btn";
    prevPageBtn.innerText = t("Prev");
    prevPageBtn.onclick = () => goToPage(currentPage - 1);

    const pageNumContainer = document.createElement("div");
    pageNumContainer.style.cssText = "font-size: 13px; color: #d1d5db; display: flex; align-items: center; gap: 6px;";
    
    const pageInput = document.createElement("input");
    pageInput.className = "anima-page-input";
    pageInput.style.cssText = `
        width: 48px;
        padding: 6px 8px;
        background: rgba(10, 10, 15, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: white;
        font-size: 13px;
        text-align: center;
        outline: none;
    `;
    pageInput.type = "text";
    pageInput.value = "1";
    pageInput.onkeydown = (e) => {
        if (e.key === "Enter") {
            const val = parseInt(pageInput.value);
            if (!isNaN(val) && val >= 1 && val <= totalPages) {
                goToPage(val);
            } else {
                pageInput.value = currentPage;
            }
        }
    };

    const totalPagesLabel = document.createElement("span");
    totalPagesLabel.innerText = "/ 1 页";
    
    pageNumContainer.appendChild(pageInput);
    pageNumContainer.appendChild(totalPagesLabel);

    const nextPageBtn = document.createElement("button");
    nextPageBtn.className = "anima-page-btn";
    nextPageBtn.innerText = t("Next");
    nextPageBtn.onclick = () => goToPage(currentPage + 1);

    const lastPageBtn = document.createElement("button");
    lastPageBtn.className = "anima-page-btn";
    lastPageBtn.innerText = t("Last");
    lastPageBtn.onclick = () => goToPage(totalPages);

    pageControls.appendChild(firstPageBtn);
    pageControls.appendChild(prevPageBtn);
    pageControls.appendChild(pageNumContainer);
    pageControls.appendChild(nextPageBtn);
    pageControls.appendChild(lastPageBtn);

    paginationBar.appendChild(pageStats);
    paginationBar.appendChild(pageControls);
    gridArea.appendChild(paginationBar);

    mainSection.appendChild(gridArea);
    modalContainer.appendChild(mainSection);

    // 7. 构建 Footer / 底部操作栏
    const footer = document.createElement("div");
    footer.style.cssText = `
        padding: 20px 28px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(18, 18, 24, 0.6);
    `;

    const countLabel = document.createElement("div");
    countLabel.style.cssText = "font-size: 14.5px; color: #7dd3fc; font-weight: 700; display: flex; align-items: center; gap: 6px;";
    
    function updateCountLabel() {
        countLabel.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#0b8ce9;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>${t("Selected: {count} artist styles", { count: selectedArtists.size })}</span>
        `;
    }
    updateCountLabel();

    const footerButtons = document.createElement("div");
    footerButtons.style.cssText = "display: flex; gap: 12px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "anima-btn";
    cancelBtn.innerText = t("Cancel");
    cancelBtn.onclick = () => closeModal();

    const applyBtn = document.createElement("button");
    applyBtn.className = "anima-btn anima-btn-primary";
    applyBtn.innerText = t("Confirm & Apply");
    applyBtn.onclick = () => {
        applySelectionAndClose();
    };

    // 确认应用并关闭弹窗
    function applySelectionAndClose() {
        let resultString = Array.from(selectedArtists).map(name => `@${name}`).join(", ");
        if (resultString) {
            resultString += ", ";
        }
        tagsWidget.value = resultString;
        
        if (tagsWidget.inputEl) {
            tagsWidget.inputEl.value = resultString;
            tagsWidget.inputEl.dispatchEvent(new Event("input"));
        }
        
        if (tagsWidget.callback) {
            tagsWidget.callback(resultString);
        }
        
        node.triggerSlot?(0):null;
        closeModal();
    }

    footerButtons.appendChild(cancelBtn);
    footerButtons.appendChild(applyBtn);
    footer.appendChild(countLabel);
    footer.appendChild(footerButtons);
    modalContainer.appendChild(footer);

    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // --- 数据筛选、分页与侧边栏渲染的实现 ---
    
    let filteredData = []; 
    let currentPage = parseInt(localStorage.getItem(PAGE_STORAGE_KEY)) || 1;   
    const pageSize = 60;   
    let totalPages = 1;    

    // 渲染侧边栏菜单
    function renderSidebar() {
        sidebarList.innerHTML = "";

        // 全部画师
        const allItem = document.createElement("div");
        allItem.className = `sidebar-item ${activeCategory === "all" ? "active" : ""}`;
        allItem.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:15px;">✦</span>
                <span>${t("All Artists")}</span>
            </div>
            <span style="font-size:11px;opacity:0.6;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:20px;">${(window.galleryData || []).length}</span>
        `;
        allItem.onclick = () => switchCategory("all");
        sidebarList.appendChild(allItem);

        // 我的收藏
        const favItem = document.createElement("div");
        favItem.className = `sidebar-item ${activeCategory === "favorites" ? "active" : ""}`;
        favItem.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;color:#0b8ce9;">
                <span style="font-size:15px;">❤️</span>
                <span>${t("My Favorites")}</span>
            </div>
            <span style="font-size:11px;opacity:0.8;background:rgba(11,140,233,0.15);color:#7dd3fc;padding:2px 6px;border-radius:20px;font-weight:700;">${favoriteSet.size}</span>
        `;
        favItem.onclick = () => switchCategory("favorites");
        sidebarList.appendChild(favItem);
    }

    // 切换分类侧边栏
    function switchCategory(category) {
        activeCategory = category;
        localStorage.setItem(SIDEBAR_STORAGE_KEY, category);
        
        currentPage = 1;
        localStorage.setItem(PAGE_STORAGE_KEY, 1);
        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);

        renderSidebar();
        triggerFilter();
        listContainer.scrollTop = 0;
    }

    // 执行数据筛选与排序
    function triggerFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const sortVal = sortSelect.value;

        // A. 基础分类过滤
        let items = window.galleryData || [];
        if (activeCategory === "favorites") {
            items = items.filter(item => favoriteSet.has(item.name));
        }

        // B. 搜索关键词过滤
        if (query) {
            items = items.filter(item => item.name && item.name.toLowerCase().includes(query));
        }
        if (showSelectedOnly) {
            items = items.filter(item => selectedArtists.has(item.name));
        }

        // C. 排序数据
        if (sortVal === "works-desc") {
            items.sort((a, b) => b.post_count - a.post_count);
        } else if (sortVal === "works-asc") {
            items.sort((a, b) => a.post_count - b.post_count);
        } else if (sortVal === "unique-desc") {
            items.sort((a, b) => b.uniqueness_score - a.uniqueness_score);
        } else if (sortVal === "unique-asc") {
            items.sort((a, b) => a.uniqueness_score - b.uniqueness_score);
        } else if (sortVal === "name-asc") {
            items.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortVal === "name-desc") {
            items.sort((a, b) => b.name.localeCompare(a.name));
        }

        filteredData = items;
        
        totalPages = Math.ceil(filteredData.length / pageSize);
        if (totalPages === 0) totalPages = 1;
        
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        updatePaginationBar();
        renderCurrentPage();
    }

    // 更新分页栏的交互状态
    function updatePaginationBar() {
        const totalItems = filteredData.length;
        const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const endIdx = Math.min(currentPage * pageSize, totalItems);
        
        pageStats.innerText = t("Total {total} artists | Showing {start}-{end}", { total: totalItems, start: startIdx, end: endIdx });
        
        pageInput.value = currentPage;
        totalPagesLabel.innerText = `/ ${totalPages} 页`;
        
        firstPageBtn.disabled = (currentPage === 1);
        prevPageBtn.disabled = (currentPage === 1);
        nextPageBtn.disabled = (currentPage === totalPages);
        lastPageBtn.disabled = (currentPage === totalPages);
    }

    // 翻页操作
    function goToPage(pageNum) {
        if (pageNum < 1 || pageNum > totalPages) return;
        currentPage = pageNum;
        localStorage.setItem(PAGE_STORAGE_KEY, currentPage); 

        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);

        updatePaginationBar();
        renderCurrentPage();
        listContainer.scrollTop = 0; 
    }

    // 复制通知提示框
    function showTemporaryToast(msg) {
        const toast = document.createElement("div");
        toast.className = "anima-toast-inline";
        toast.innerText = msg;
        toast.style.cssText = `
            position: fixed !important;
            bottom: 30px !important;
            right: 30px !important;
            background: rgba(16, 16, 24, 0.92) !important;
            border: 1px solid rgba(11, 140, 233, 0.45) !important;
            color: #ffffff !important;
            padding: 10px 20px !important;
            border-radius: 12px !important;
            font-size: 13px !important;
            z-index: 100000 !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
            pointer-events: none !important;
            animation: animaFadeIn 0.2s ease forwards !important;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = "opacity 0.3s ease";
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    }

    // 备用文本复制
    function fallbackCopy(text, callback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed"; 
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand("copy");
            callback();
        } catch (err) {
            console.error("Fallback copy failed", err);
        }
        textArea.remove();
    }

    // 渲染当前页的画师卡片
    function renderCurrentPage() {
        listContainer.innerHTML = "";
        
        if (filteredData.length === 0) {
            const noResult = document.createElement("div");
            noResult.style.cssText = "grid-column: 1 / -1; padding: 60px; text-align: center; color: #9ca3af; font-size: 16px; font-weight: 500;";
            noResult.innerText = t("No matching artist styles found");
            listContainer.appendChild(noResult);
            return;
        }

        const currentPageData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        const fragment = document.createDocumentFragment();
        
        currentPageData.forEach(item => {
            const isSelected = selectedArtists.has(item.name);
            const isFavorite = favoriteSet.has(item.name);
            
            const card = document.createElement("div");
            card.dataset.name = item.name;
            
            card.style.cssText = `
                background: rgba(22, 22, 32, 0.7) !important;
                border: ${isSelected ? '2.5px solid #0b8ce9' : '2.5px solid rgba(255, 255, 255, 0.04)'} !important;
                border-radius: 20px !important;
                overflow: hidden !important;
                display: block !important;
                width: 100% !important;
                height: 0 !important;
                padding-bottom: 133.33% !important; 
                cursor: pointer !important;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important; 
                position: relative !important;
                user-select: none !important;
                box-sizing: border-box !important;
                box-shadow: ${isSelected ? '0 10px 25px rgba(11, 140, 233, 0.35)' : '0 4px 12px rgba(0,0,0,0.15)'} !important;
            `;
            
            // Checkbox overlay (放在左上角)
            const checkbox = document.createElement("div");
            checkbox.style.cssText = `
                position: absolute !important;
                top: 12px !important;
                left: 12px !important;
                width: 22px !important;
                height: 22px !important;
                border-radius: 50% !important;
                background: ${isSelected ? '#0b8ce9' : 'rgba(10, 10, 15, 0.5)'} !important;
                border: 1.5px solid ${isSelected ? '#0b8ce9' : 'rgba(255, 255, 255, 0.35)'} !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 10 !important;
                transition: all 0.2s ease !important;
                box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            `;
            checkbox.innerHTML = isSelected ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            ` : '';
            card.appendChild(checkbox);

            // ❤️ 收藏爱心图标 (放在右上角)
            const favIcon = document.createElement("div");
            favIcon.style.cssText = `
                position: absolute !important;
                top: 10px !important;
                right: 10px !important;
                padding: 6px !important;
                z-index: 10 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease !important;
                cursor: pointer !important;
                border-radius: 50% !important;
                background: rgba(10, 10, 15, 0.4) !important;
                backdrop-filter: blur(5px) !important;
                -webkit-backdrop-filter: blur(5px) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
            `;
            favIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFavorite ? '#0b8ce9' : 'none'}" stroke="${isFavorite ? '#0b8ce9' : '#d1d5db'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            `;
            favIcon.onmouseover = (e) => {
                e.stopPropagation();
                favIcon.style.transform = "scale(1.15)";
                favIcon.style.background = "rgba(10, 10, 15, 0.7)";
                const svg = favIcon.querySelector('svg');
                if (!isFavorite) svg.setAttribute('stroke', '#0b8ce9');
            };
            favIcon.onmouseout = (e) => {
                e.stopPropagation();
                favIcon.style.transform = "scale(1)";
                favIcon.style.background = "rgba(10, 10, 15, 0.4)";
                const svg = favIcon.querySelector('svg');
                if (!isFavorite) svg.setAttribute('stroke', '#d1d5db');
            };
            favIcon.onclick = (e) => {
                e.stopPropagation();
                if (favoriteSet.has(item.name)) {
                    favoriteSet.delete(item.name);
                    const svg = favIcon.querySelector('svg');
                    svg.setAttribute('fill', 'none');
                    svg.setAttribute('stroke', '#d1d5db');
                } else {
                    favoriteSet.add(item.name);
                    const svg = favIcon.querySelector('svg');
                    svg.setAttribute('fill', '#0b8ce9');
                    svg.setAttribute('stroke', '#0b8ce9');
                    favIcon.style.transform = "scale(1.3) rotate(-10deg)";
                    setTimeout(() => favIcon.style.transform = "scale(1)", 200);
                }
                saveFavorites();
                renderSidebar(); 
                if (activeCategory === "favorites") {
                    triggerFilter();
                }
            };
            card.appendChild(favIcon);

            // Image Element
            const placeholder = document.createElement("div");
            placeholder.className = "anima-card-placeholder";
            
            let firstChar = "A";
            if (item.name) {
                const cleanName = item.name.replace(/[^a-zA-Z]/g, "");
                firstChar = cleanName.length > 0 ? cleanName[0].toUpperCase() : item.name[0].toUpperCase();
            }
            
            let hash = 0;
            for (let i = 0; i < item.name.length; i++) {
                hash = item.name.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash % 360);
            
            placeholder.style.cssText = `
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 56px !important;
                font-weight: 900 !important;
                color: rgba(255,255,255,0.7) !important;
                background: linear-gradient(135deg, hsl(${hue}, 45%, 32%), hsl(${(hue + 45) % 360}, 50%, 18%)) !important;
                z-index: 1 !important;
                opacity: 0 !important;
                transition: opacity 0.25s ease !important;
                text-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            `;
            placeholder.innerText = firstChar;
            card.appendChild(placeholder);

            const img = document.createElement("img");
            img.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                z-index: 2;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            img.loading = "lazy";
            
            const partition = item.p || 1;
            img.src = getImgUrl(partition, item.id);
            
            let loader = null;
            if (img.complete && img.naturalWidth !== 0) {
                img.style.opacity = "1";
            } else {
                loader = document.createElement("div");
                loader.className = "anima-shimmer";
                const spinner = document.createElement("div");
                spinner.className = "anima-spinner";
                loader.appendChild(spinner);
                card.appendChild(loader);
            }
            
            img.onload = () => {
                img.style.opacity = "1";
                loader?.remove();
            };
            img.onerror = () => {
                img.style.display = "none";
                loader?.remove();
                placeholder.style.opacity = "1"; 
            };
            card.appendChild(img);

            const mask = document.createElement("div");
            mask.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(to top, rgba(14, 14, 18, 0.98) 0%, rgba(14, 14, 18, 0.55) 45%, rgba(0, 0, 0, 0) 100%);
                z-index: 3;
            `;
            card.appendChild(mask);

            // Info Section
            const infoPanel = document.createElement("div");
            infoPanel.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                padding: 16px 14px;
                box-sizing: border-box;
                z-index: 4;
                display: flex;
                flex-direction: column;
                gap: 5px;
            `;
            
            const nameEl = document.createElement("div");
            nameEl.innerText = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            nameEl.style.cssText = "font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 4px rgba(0,0,0,0.6);";
            
            const statsContainer = document.createElement("div");
            statsContainer.style.cssText = "display: flex; align-items: center; justify-content: space-between; width: 100%; overflow: hidden; gap: 8px;";
            
            const worksEl = document.createElement("span");
            worksEl.innerText = `${item.post_count} w`;
            worksEl.style.cssText = `
                font-size: 10px;
                font-weight: 700;
                color: #38bdf8;
                background: rgba(11, 140, 233, 0.15);
                border: 1px solid rgba(11, 140, 233, 0.25);
                padding: 2.5px 8px;
                border-radius: 9999px;
                white-space: nowrap;
            `;
            
            const uniqueEl = document.createElement("span");
            uniqueEl.innerText = `${t("Uniqueness ")}${item.uniqueness_score.toFixed(1)}`;
            uniqueEl.style.cssText = `
                font-size: 10.5px;
                color: #fbbf24;
                font-weight: 700;
                white-space: nowrap;
                background: rgba(251, 191, 36, 0.08);
                border: 1px solid rgba(251, 191, 36, 0.15);
                padding: 2px 6px;
                border-radius: 6px;
            `;
            
            statsContainer.appendChild(worksEl);
            statsContainer.appendChild(uniqueEl);
            infoPanel.appendChild(nameEl);
            infoPanel.appendChild(statsContainer);
            card.appendChild(infoPanel);

            // 点击卡片选择
            card.onclick = () => {
                const name = card.dataset.name;
                if (selectedArtists.has(name)) {
                    selectedArtists.delete(name);
                    card.style.borderColor = "rgba(255, 255, 255, 0.04)";
                    card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                    checkbox.style.background = "rgba(10, 10, 15, 0.5)";
                    checkbox.style.borderColor = "rgba(255, 255, 255, 0.35)";
                    checkbox.innerHTML = "";
                } else {
                    selectedArtists.add(name);
                    card.style.borderColor = "#0b8ce9";
                    card.style.boxShadow = "0 10px 25px rgba(11, 140, 233, 0.35)";
                    checkbox.style.background = "#0b8ce9";
                    checkbox.style.borderColor = "#0b8ce9";
                    checkbox.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;
                }
                updateCountLabel();
            };

            card.onmouseenter = () => {
                if (!isSelected) {
                    card.style.borderColor = "rgba(11, 140, 233, 0.4)";
                    card.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.4), 0 0 15px rgba(11, 140, 233, 0.15)";
                }
                img.style.transform = "scale(1.08)";
            };
            card.onmouseleave = () => {
                if (!isSelected) {
                    card.style.borderColor = "rgba(255, 255, 255, 0.04)";
                    card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                } else {
                    card.style.boxShadow = "0 10px 25px rgba(11, 140, 233, 0.35)";
                }
                img.style.transform = "none";
            };

            fragment.appendChild(card);
        });

        listContainer.appendChild(fragment);

        // 首次加载复原大图滚动高度
        if (isFirstRender && lastScrollTop > 0) {
            listContainer.scrollTop = lastScrollTop;
            setTimeout(() => {
                listContainer.scrollTop = lastScrollTop;
            }, 30);
            setTimeout(() => {
                listContainer.scrollTop = lastScrollTop;
            }, 100);
            setTimeout(() => {
                listContainer.scrollTop = lastScrollTop;
            }, 250);
        }
    }

    // 关闭弹窗
    function closeModal() {
        modalOverlay.remove();
        styleSheet.remove();
    }

    // 首次初始化渲染侧边栏和数据流
    renderSidebar();
    triggerFilter();

    // 恢复侧边栏滚动高度
    if (lastSidebarScrollTop > 0) {
        sidebar.scrollTop = lastSidebarScrollTop;
        setTimeout(() => {
            sidebar.scrollTop = lastSidebarScrollTop;
        }, 50);
        setTimeout(() => {
            sidebar.scrollTop = lastSidebarScrollTop;
        }, 150);
    }

    // 标记首次渲染结束
    isFirstRender = false;
}
