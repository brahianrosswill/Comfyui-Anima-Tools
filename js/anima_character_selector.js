import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";
import "./character_data.js";

app.registerExtension({
    name: "AnimaCharacterTagSelector.extension",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AnimaCharacterTagSelector" || nodeData.name === "AnimaCharacterTagSelectorPlus") {
            const origOnCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                origOnCreated?.apply(this, arguments);

                // 找到 character_tags widget
                const characterTagsWidget = this.widgets.find(w => w.name === "character_tags");
                
                // 添加打开选择器的按钮，并注入极致 premium 设计的霓虹粉发光样式
                const btnWidget = this.addWidget("button", t("Open Character Selector"), null, () => {
                    if (!window.characterData) {
                        alert(t("Anima character database is loading, please wait a few seconds..."));
                        return;
                    }
                    openCharacterSelectorModal(this, characterTagsWidget);
                });

                // 给按钮增加精致边框与微动画
                if (btnWidget && btnWidget.el) {
                    btnWidget.el.style.cssText += `
                        border: 1px solid rgba(219, 39, 119, 0.4) !important;
                        background: linear-gradient(135deg, rgba(219, 39, 119, 0.1), rgba(157, 23, 77, 0.15)) !important;
                        color: #f472b6 !important;
                        font-weight: 600 !important;
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    `;
                    btnWidget.el.onmouseover = () => {
                        btnWidget.el.style.boxShadow = "0 0 12px rgba(219, 39, 119, 0.35)";
                        btnWidget.el.style.background = "linear-gradient(135deg, rgba(219, 39, 119, 0.25), rgba(157, 23, 77, 0.3))";
                    };
                    btnWidget.el.onmouseout = () => {
                        btnWidget.el.style.boxShadow = "none";
                        btnWidget.el.style.background = "linear-gradient(135deg, rgba(219, 39, 119, 0.1), rgba(157, 23, 77, 0.15))";
                    };
                }
            };
        }
    }
});

// 打开视觉选择器 Modal 弹窗
function openCharacterSelectorModal(node, tagsWidget) {
    // 1. 解析当前节点中已经选中的 tags
    const currentTagsText = tagsWidget.value || "";
    const selectedCharacters = new Set(
        currentTagsText.split(",")
            .map(t => t.trim())
            .filter(t => t.length > 0)
    );

    // 2. 收藏功能本地持久化读取
    const FAVORITES_STORAGE_KEY = "anima-character-favorites-list";
    let favoriteSet = new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || []);

    // 记忆排序、页数、侧边栏分类和滚动位置配置
    const SORT_STORAGE_KEY = "anima-char-selector-active-sort";
    const PAGE_STORAGE_KEY = "anima-char-selector-active-page";
    const SCROLL_STORAGE_KEY = "anima-char-selector-active-scroll";
    const SIDEBAR_STORAGE_KEY = "anima-char-selector-active-sidebar-category";
    const SIDEBAR_SCROLL_STORAGE_KEY = "anima-char-selector-sidebar-scroll";

    let activeSort = localStorage.getItem(SORT_STORAGE_KEY) || "works-desc";
    // 多维联合分类过滤器对象，存储各个维度的当前选中值
    let activeFilters = {
        type: "all",      // all, favorites
        gender: null,     // female, male
        hair: null,       // black, blonde, silver, brown, blue, pink, red, purple, green
        eye: null,        // blue, red, brown, green, yellow, purple, pink
        series: null      // copyright 作品系列
    };

    try {
        const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (saved) {
            if (saved.startsWith("{")) {
                activeFilters = JSON.parse(saved);
            } else {
                // 向上兼容旧版单一值
                const oldVal = saved;
                if (oldVal === "favorites") {
                    activeFilters.type = "favorites";
                } else if (oldVal.startsWith("gender:")) {
                    activeFilters.gender = oldVal.split(":")[1];
                } else if (oldVal.startsWith("hair:")) {
                    activeFilters.hair = oldVal.split(":")[1];
                } else if (oldVal.startsWith("eye:")) {
                    activeFilters.eye = oldVal.split(":")[1];
                } else if (oldVal !== "all") {
                    activeFilters.series = oldVal;
                }
            }
        }
    } catch (e) {
        console.error("Failed to load active filters", e);
    }
    let lastScrollTop = parseInt(localStorage.getItem(SCROLL_STORAGE_KEY)) || 0;
    let lastSidebarScrollTop = parseInt(localStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY)) || 0;
    let isFirstRender = true;

    // 自动统计所有数据中最热门的作品分类 (前 50 个)
    function getPopularCopyrights() {
        const counts = {};
        (window.characterData || []).forEach(item => {
            if (item.copyright) {
                counts[item.copyright] = (counts[item.copyright] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(entry => ({ name: entry[0], count: entry[1] }));
    }
    const popularCopyrights = getPopularCopyrights();

    // 拼接 Animadex.net 官方 thumbs 图片 URL
    function getImgUrl(name, copyright) {
        const rawName = copyright ? `${name}, ${copyright}` : name;
        return `https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(rawName)}.webp`;
    }

    // 保存收藏列表到本地
    function saveFavorites() {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoriteSet)));
    }

    // 3. 创建 Modal DOM
    const modalOverlay = document.createElement("div");
    modalOverlay.id = "anima-char-selector-overlay";
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(8, 8, 12, 0.8);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const modalContainer = document.createElement("div");
    modalContainer.id = "anima-char-selector-container";
    modalContainer.style.cssText = `
        width: 92%;
        max-width: 1320px;
        height: 90%;
        background: #111112 !important;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 28px;
        box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(219, 39, 119, 0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: animaFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;

    // 点击弹窗遮罩层（弹窗外侧）执行“确认应用并关闭”
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
            applySelectionAndClose();
        }
    };

    // 4. 构建 Header (更精致美观的渐变色)
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
    titleContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px;";
    const title = document.createElement("h2");
    title.innerText = t("Anima Character Tag Selector");
    title.style.cssText = "margin: 0; font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #f472b6, #ec4899, #db2777); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.5px;";
    
    const subtitle = document.createElement("span");
    subtitle.innerText = t("Browse and select your favorite character tags, with 3:4 clear preview cards and precise pagination.");
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

    // 5. 注入动画样式及极致 UI 美化样式
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        @keyframes animaFadeIn {
            from { opacity: 0; transform: scale(0.96) translateY(12px); }
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
            background: linear-gradient(90deg, rgba(20, 20, 30, 0.8) 25%, rgba(219, 39, 119, 0.12) 50%, rgba(20, 20, 30, 0.8) 75%) !important;
            background-size: 200% 100% !important;
            animation: animaShimmer 1.5s infinite linear !important;
            z-index: 2 !important;
            border-radius: 20px !important;
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
            border: 2.5px solid rgba(219, 39, 119, 0.15) !important;
            border-top: 2.5px solid #db2777 !important;
            border-radius: 50% !important;
            animation: animaSpin 0.85s infinite linear !important;
            z-index: 3 !important;
        }
        .anima-scrollbar::-webkit-scrollbar {
            width: 6px;
        }
        .anima-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .anima-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.08);
            border-radius: 10px;
        }
        .anima-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        /* 极致奢华的按钮与微动效 */
        .anima-btn {
            padding: 9px 18px;
            border-radius: 14px;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(255, 255, 255, 0.05);
            color: #d1d5db;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            user-select: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .anima-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border-color: rgba(255, 255, 255, 0.15);
        }
        .anima-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
        .anima-btn-primary {
            background: linear-gradient(135deg, #db2777, #9d174d);
            border-color: rgba(219, 39, 119, 0.3);
            color: white;
            box-shadow: 0 4px 14px rgba(219, 39, 119, 0.3);
        }
        .anima-btn-primary:hover:not(:disabled) {
            background: linear-gradient(135deg, #ec4899, #be185d);
            box-shadow: 0 6px 20px rgba(219, 39, 119, 0.45);
            border-color: rgba(219, 39, 119, 0.4);
        }
        .anima-btn-danger {
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: #f87171;
        }
        .anima-btn-danger:hover:not(:disabled) {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.35);
            color: #fee2e2;
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
        }
        .sidebar-item:hover {
            background: rgba(255, 255, 255, 0.04);
            color: #e4e4e7;
        }
        .sidebar-item.active {
            background: linear-gradient(135deg, rgba(219, 39, 119, 0.15), rgba(157, 23, 77, 0.15)) !important;
            border-color: rgba(219, 39, 119, 0.3) !important;
            color: #f472b6 !important;
            font-weight: 700 !important;
        }
        
        /* 分页器按钮样式 */
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
        
        /* 折叠过渡动画样式 */
        .sidebar-section-content {
            transition: max-height 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.18s ease-out;
            overflow: hidden;
        }
        .sidebar-section-header {
            cursor: pointer;
            user-select: none;
            transition: color 0.2s ease;
        }
        .sidebar-section-header:hover {
            color: #db2777 !important;
        }
        .sidebar-section-arrow {
            margin-left: auto;
            transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); /* 具有轻度弹性回弹的动画 */
        }
        .sidebar-section-arrow.collapsed {
            transform: rotate(-90deg);
        }
    `;
    document.head.appendChild(styleSheet);

    // 6. 构建 Toolbar / 检索控制区 (更宽敞、更 premium)
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
    searchInputWrapper.style.cssText = "position: relative; flex: 1; max-width: 320px;";
    
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = t("Search character name...");
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
        searchInput.style.borderColor = "#db2777";
        searchInput.style.boxShadow = "0 0 14px rgba(219, 39, 119, 0.25), inset 0 2px 4px rgba(0,0,0,0.2)";
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
        <option value="works-desc">${t("Illustrations Count ⬇")}</option>
        <option value="works-asc">${t("Illustrations Count ⬆")}</option>
        <option value="fav-first">${t("Favorites First ★")}</option>
        <option value="name-asc">${t("Name A-Z")}</option>
        <option value="name-desc">${t("Name Z-A")}</option>
        <option value="copyright-asc">${t("Series A-Z")}</option>
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

    // 右侧：功能按钮
    const actionControls = document.createElement("div");
    actionControls.style.cssText = "display: flex; gap: 12px; align-items: center;";

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
        if (selectedCharacters.size === 0) {
            alert(t("Please select at least one character first."));
            return;
        }
        const textToCopy = Array.from(selectedCharacters).join(", ") + ", ";
        
        const performCopy = () => {
            const toast = document.createElement("div");
            toast.style.cssText = `
                position: fixed !important;
                bottom: 30px !important;
                right: 30px !important;
                background: rgba(16, 16, 24, 0.92) !important;
                border: 1px solid rgba(219, 39, 119, 0.45) !important;
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
            toast.innerText = t("Copied Successfully");
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.transition = "opacity 0.3s ease";
                toast.style.opacity = "0";
                setTimeout(() => toast.remove(), 300);
            }, 1500);
        };
        
        const fallbackCopyChar = (text, cb) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; 
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand("copy");
                cb();
            } catch (err) {
                console.error("Fallback copy failed", err);
            }
            textArea.remove();
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(performCopy).catch(() => {
                fallbackCopyChar(textToCopy, performCopy);
            });
        } else {
            fallbackCopyChar(textToCopy, performCopy);
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
                background: rgba(219, 39, 119, 0.2) !important;
                border-color: rgba(219, 39, 119, 0.4) !important;
                color: #f472b6 !important;
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
        if (selectedCharacters.size === 0) return;
        if (confirm(t("Are you sure you want to clear all selected characters?"))) {
            selectedCharacters.clear();
            updateCountLabel();
            renderCurrentPage();
        }
    };
    actionControls.appendChild(clearAllBtn);

    toolbar.appendChild(filterControls);
    toolbar.appendChild(actionControls);
    modalContainer.appendChild(toolbar);

    // 7. 构建主展示区：水平分栏 (左侧侧边栏 + 右侧卡片网格与分页)
    const mainSection = document.createElement("div");
    mainSection.style.cssText = "display: flex; flex: 1; overflow: hidden; background: rgba(10, 10, 15, 0.1);";

    // 7A. 左侧侧边栏 - 分类与收藏
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#db2777;">
            <rect x="3" y="3" width="7" height="9"></rect>
            <rect x="14" y="3" width="7" height="5"></rect>
            <rect x="14" y="12" width="7" height="9"></rect>
            <rect x="3" y="16" width="7" height="5"></rect>
        </svg>
        <span>${t("Browse Categories")}</span>
    `;
    sidebarTitle.style.cssText = "font-size: 12px; font-weight: 800; color: #71717a; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-left: 8px;";
    sidebar.appendChild(sidebarTitle);

    // 侧边栏列表容器
    const sidebarList = document.createElement("div");
    sidebarList.style.cssText = "display: flex; flex-direction: column;";
    sidebar.appendChild(sidebarList);

    mainSection.appendChild(sidebar);

    // 7B. 右侧展示区 (网格列表 + 分页控制)
    const gridArea = document.createElement("div");
    gridArea.style.cssText = "flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;";

    // 卡片网格容器
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
    `;
    listContainer.onscroll = () => {
        localStorage.setItem(SCROLL_STORAGE_KEY, listContainer.scrollTop);
    };
    gridArea.appendChild(listContainer);

    // 分页控制栏 (Pagination Bar - 嵌入在网格区底部)
    const paginationBar = document.createElement("div");
    paginationBar.className = "anima-pagination";
    paginationBar.style.cssText += " background: rgba(18, 18, 24, 0.35);";
    
    const pageStats = document.createElement("div");
    pageStats.style.cssText = "font-size: 13px; color: #9ca3af; font-weight: 500;";
    pageStats.innerText = t("Total {total} characters | Showing {start}-{end}", { total: 0, start: 0, end: 0 });

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

    // 8. 构建 Footer / 底部操作栏
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
    countLabel.style.cssText = "font-size: 14.5px; color: #f472b6; font-weight: 700; display: flex; align-items: center; gap: 6px;";
    
    function updateCountLabel() {
        countLabel.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#db2777;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>${t("Selected: {count} characters", { count: selectedCharacters.size })}</span>
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
        let resultString = Array.from(selectedCharacters).join(", ");
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

    // 渲染侧边栏菜单 (包含性别、发色、瞳色、热门系列等多维特征过滤)
    function renderSidebar() {
        sidebarList.innerHTML = "";

        // 1. 获取各个分组的折叠状态 (默认全部折叠，localStorage 记录的 "false" 代表展开)
        const foldStates = {
            gender: localStorage.getItem("anima-char-fold-gender") !== "false",
            hair: localStorage.getItem("anima-char-fold-hair") !== "false",
            eye: localStorage.getItem("anima-char-fold-eye") !== "false",
            series: localStorage.getItem("anima-char-fold-series") !== "false"
        };

        // 🌟 智能展开锁定：只有在首次打开弹窗渲染时，才会因为有选中项而强行展开该分类。
        // 这完美保证了用户在后续手动点击合拢时，该分类可以顺利合拢，不会再因为选中项而反复弹开。
        if (isFirstRender) {
            if (activeFilters.gender) {
                foldStates.gender = false;
                localStorage.setItem("anima-char-fold-gender", "false");
            }
            if (activeFilters.hair) {
                foldStates.hair = false;
                localStorage.setItem("anima-char-fold-hair", "false");
            }
            if (activeFilters.eye) {
                foldStates.eye = false;
                localStorage.setItem("anima-char-fold-eye", "false");
            }
            if (activeFilters.series) {
                foldStates.series = false;
                localStorage.setItem("anima-char-fold-series", "false");
            }
        }

        // 静态统计发色、瞳色、性别等数据的数量 (提升运行效率)
        const counts = {
            "gender:1girl": 0,
            "gender:1boy": 0,
            "hair:black": 0,
            "hair:blonde": 0,
            "hair:white": 0,
            "hair:brown": 0,
            "hair:blue": 0,
            "hair:pink": 0,
            "hair:red": 0,
            "hair:purple": 0,
            "hair:green": 0,
            "eye:blue": 0,
            "eye:red": 0,
            "eye:brown": 0,
            "eye:green": 0,
            "eye:yellow": 0,
            "eye:purple": 0,
            "eye:pink": 0,
        };
        (window.characterData || []).forEach(item => {
            if (item.gender === "1girl") counts["gender:1girl"]++;
            else if (item.gender === "1boy") counts["gender:1boy"]++;
            
            if (item.hair) counts[`hair:${item.hair}`]++;
            if (item.eye) counts[`eye:${item.eye}`]++;
        });

        // 1. 全部角色与我的收藏 (General)
        const isAllActive = activeFilters.type === "all" && 
                            !activeFilters.gender && 
                            !activeFilters.hair && 
                            !activeFilters.eye && 
                            !activeFilters.series;
        const isFavActive = activeFilters.type === "favorites";

        const allItem = document.createElement("div");
        allItem.className = `sidebar-item ${isAllActive ? "active" : ""}`;
        allItem.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:15px;">✦</span>
                <span>${t("All Characters")}</span>
            </div>
            <span style="font-size:11px;opacity:0.6;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:20px;">${(window.characterData || []).length}</span>
        `;
        allItem.onclick = () => switchCategory("all");
        sidebarList.appendChild(allItem);

        const favItem = document.createElement("div");
        favItem.className = `sidebar-item ${isFavActive ? "active" : ""}`;
        favItem.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;color:#f472b6;">
                <span style="font-size:15px;">❤️</span>
                <span>${t("My Favorites")}</span>
            </div>
            <span style="font-size:11px;opacity:0.8;background:rgba(219,39,119,0.15);color:#f472b6;padding:2px 6px;border-radius:20px;font-weight:700;">${favoriteSet.size}</span>
        `;
        favItem.onclick = () => switchCategory("favorites");
        sidebarList.appendChild(favItem);

        // 多维分类配置列表 (Gender, Hair Color, Eye Color)
        const sectionsConfig = [
            {
                id: "gender",
                title: t("Gender"),
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#f472b6;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
                items: [
                    { id: "gender:1girl", name: t("Female (1girl)"), count: counts["gender:1girl"] },
                    { id: "gender:1boy", name: t("Male (1boy)"), count: counts["gender:1boy"] }
                ]
            },
            {
                id: "hair",
                title: t("Hair Color"),
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fb7185;"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
                items: [
                    { id: "hair:black", name: t("Black Hair"), count: counts["hair:black"] },
                    { id: "hair:blonde", name: t("Blonde Hair"), count: counts["hair:blonde"] },
                    { id: "hair:white", name: t("White/Silver"), count: counts["hair:white"] },
                    { id: "hair:brown", name: t("Brown Hair"), count: counts["hair:brown"] },
                    { id: "hair:blue", name: t("Blue/Aqua"), count: counts["hair:blue"] },
                    { id: "hair:pink", name: t("Pink Hair"), count: counts["hair:pink"] },
                    { id: "hair:red", name: t("Red Hair"), count: counts["hair:red"] },
                    { id: "hair:purple", name: t("Purple Hair"), count: counts["hair:purple"] },
                    { id: "hair:green", name: t("Green Hair"), count: counts["hair:green"] }
                ]
            },
            {
                id: "eye",
                title: t("Eye Color"),
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#60a5fa;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`,
                items: [
                    { id: "eye:blue", name: t("Blue Eyes"), count: counts["eye:blue"] },
                    { id: "eye:red", name: t("Red Eyes"), count: counts["eye:red"] },
                    { id: "eye:brown", name: t("Brown Eyes"), count: counts["eye:brown"] },
                    { id: "eye:green", name: t("Green Eyes"), count: counts["eye:green"] },
                    { id: "eye:yellow", name: t("Yellow/Gold"), count: counts["eye:yellow"] },
                    { id: "eye:purple", name: t("Purple Eyes"), count: counts["eye:purple"] },
                    { id: "eye:pink", name: t("Pink Eyes"), count: counts["eye:pink"] }
                ]
            }
        ];

        // 渲染性别、发色、瞳色分节 (支持折叠交互与流畅 CSS 过渡动画)
        sectionsConfig.forEach(section => {
            const sectionKey = section.id;
            const isCollapsed = foldStates[sectionKey];

            const sectionContainer = document.createElement("div");
            sectionContainer.style.cssText = "display: flex; flex-direction: column; margin-bottom: 6px;";

            const headerEl = document.createElement("div");
            headerEl.className = "sidebar-section-header";
            headerEl.style.cssText = "font-size: 13.5px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 6px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; transition: color 0.2s ease;";
            
            const titleSpan = document.createElement("span");
            titleSpan.innerText = section.title;

            const arrowEl = document.createElement("div");
            arrowEl.className = `sidebar-section-arrow ${isCollapsed ? 'collapsed' : ''}`;
            arrowEl.style.cssText = `margin-left: auto; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); display: flex; align-items: center; justify-content: center; ${isCollapsed ? 'transform: rotate(-90deg);' : 'transform: rotate(0deg);'}`;
            arrowEl.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;

            headerEl.innerHTML = section.icon;
            headerEl.appendChild(titleSpan);
            headerEl.appendChild(arrowEl);
            sectionContainer.appendChild(headerEl);

            const contentEl = document.createElement("div");
            contentEl.className = `sidebar-section-content ${isCollapsed ? 'collapsed' : ''}`;
            
            const targetMaxHeight = (sectionKey === "gender") ? "120px" :
                                    (sectionKey === "hair") ? "450px" :
                                    (sectionKey === "eye") ? "380px" : "1200px";

            contentEl.style.cssText = `
                transition: max-height 0.25s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out;
                overflow: hidden;
                ${isCollapsed ? 'max-height: 0px; opacity: 0; pointer-events: none;' : `max-height: ${targetMaxHeight}; opacity: 1; pointer-events: auto;`}
            `;
            
            // 直接通过切换 DOM 类名和样式来控制折叠展开，绝不重新清空渲染，从而完美触发 transition 展开过渡动画！
            headerEl.onclick = () => {
                const isCurrentlyCollapsed = contentEl.classList.contains("collapsed");
                const nextState = !isCurrentlyCollapsed;
                
                localStorage.setItem(`anima-char-fold-${sectionKey}`, nextState.toString());
                
                if (nextState) {
                    contentEl.classList.add("collapsed");
                    contentEl.style.maxHeight = "0px";
                    contentEl.style.opacity = "0";
                    contentEl.style.pointerEvents = "none";
                    arrowEl.style.transform = "rotate(-90deg)";
                } else {
                    contentEl.classList.remove("collapsed");
                    contentEl.style.maxHeight = targetMaxHeight;
                    contentEl.style.opacity = "1";
                    contentEl.style.pointerEvents = "auto";
                    arrowEl.style.transform = "rotate(0deg)";
                }
            };

            section.items.forEach(sub => {
                if (sub.count === 0) return; // 隐藏无数据的分类
                const subItem = document.createElement("div");
                
                let isSubActive = false;
                if (sub.id.startsWith("gender:")) {
                    isSubActive = (activeFilters.gender === sub.id.split(":")[1]);
                } else if (sub.id.startsWith("hair:")) {
                    isSubActive = (activeFilters.hair === sub.id.split(":")[1]);
                } else if (sub.id.startsWith("eye:")) {
                    isSubActive = (activeFilters.eye === sub.id.split(":")[1]);
                }
                
                subItem.className = `sidebar-item ${isSubActive ? "active" : ""}`;
                subItem.style.padding = "8px 12px";
                subItem.innerHTML = `
                    <span style="font-size:12.5px;">${sub.name}</span>
                    <span style="font-size:11px;opacity:0.6;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:20px;">${sub.count}</span>
                `;
                subItem.onclick = () => switchCategory(sub.id);
                contentEl.appendChild(subItem);
            });

            sectionContainer.appendChild(contentEl);
            sidebarList.appendChild(sectionContainer);
        });

        // 渲染热门作品分节 (支持折叠交互与流畅 CSS 过渡动画)
        const isSeriesCollapsed = foldStates.series;

        const seriesContainer = document.createElement("div");
        seriesContainer.style.cssText = "display: flex; flex-direction: column; margin-bottom: 6px;";

        const seriesHeader = document.createElement("div");
        seriesHeader.className = "sidebar-section-header";
        seriesHeader.style.cssText = "font-size: 13.5px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 6px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; transition: color 0.2s ease;";
        
        const seriesTitleSpan = document.createElement("span");
        seriesTitleSpan.innerText = t("Hot Series");

        const seriesArrowEl = document.createElement("div");
        seriesArrowEl.className = `sidebar-section-arrow ${isSeriesCollapsed ? 'collapsed' : ''}`;
        seriesArrowEl.style.cssText = `margin-left: auto; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); display: flex; align-items: center; justify-content: center; ${isSeriesCollapsed ? 'transform: rotate(-90deg);' : 'transform: rotate(0deg);'}`;
        seriesArrowEl.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;

        seriesHeader.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#a855f7;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
        seriesHeader.appendChild(seriesTitleSpan);
        seriesHeader.appendChild(seriesArrowEl);
        seriesContainer.appendChild(seriesHeader);

        const seriesContentEl = document.createElement("div");
        seriesContentEl.className = `sidebar-section-content ${isSeriesCollapsed ? 'collapsed' : ''}`;
        
        const seriesMaxHeight = "1200px";
        seriesContentEl.style.cssText = `
            transition: max-height 0.25s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease-out;
            overflow: hidden;
            ${isSeriesCollapsed ? 'max-height: 0px; opacity: 0; pointer-events: none;' : `max-height: ${seriesMaxHeight}; opacity: 1; pointer-events: auto;`}
        `;

        // 直接通过切换 DOM 类名和样式来控制折叠展开，绝不重新清空渲染，从而完美触发 transition 展开过渡动画！
        seriesHeader.onclick = () => {
            const isCurrentlyCollapsed = seriesContentEl.classList.contains("collapsed");
            const nextState = !isCurrentlyCollapsed;
            
            localStorage.setItem("anima-char-fold-series", nextState.toString());
            
            if (nextState) {
                seriesContentEl.classList.add("collapsed");
                seriesContentEl.style.maxHeight = "0px";
                seriesContentEl.style.opacity = "0";
                seriesContentEl.style.pointerEvents = "none";
                seriesArrowEl.style.transform = "rotate(-90deg)";
            } else {
                seriesContentEl.classList.remove("collapsed");
                seriesContentEl.style.maxHeight = seriesMaxHeight;
                seriesContentEl.style.opacity = "1";
                seriesContentEl.style.pointerEvents = "auto";
                seriesArrowEl.style.transform = "rotate(0deg)";
            }
        };

        // 渲染热门版权作品列表 (统计扩充到前 30 个最热门作品系列，让筛选体验极为完美)
        const top30Copyrights = popularCopyrights.slice(0, 30);
        top30Copyrights.forEach(c => {
            const copyItem = document.createElement("div");
            const isSeriesActive = (activeFilters.series === c.name);
            copyItem.className = `sidebar-item ${isSeriesActive ? "active" : ""}`;
            copyItem.style.padding = "8px 12px";
            
            const displayName = c.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            copyItem.innerHTML = `
                <span style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;display:inline-block;">${displayName}</span>
                <span style="font-size:11px;opacity:0.6;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:20px;">${c.count}</span>
            `;
            copyItem.onclick = () => switchCategory(c.name);
            seriesContentEl.appendChild(copyItem);
        });

        seriesContainer.appendChild(seriesContentEl);
        sidebarList.appendChild(seriesContainer);
    }

    // 切换分类侧边栏 (支持联合多维过滤)
    function switchCategory(category) {
        if (category === "all") {
            activeFilters = {
                type: "all",
                gender: null,
                hair: null,
                eye: null,
                series: null
            };
        } else if (category === "favorites") {
            activeFilters.type = activeFilters.type === "favorites" ? "all" : "favorites";
        } else if (category.startsWith("gender:")) {
            const val = category.split(":")[1];
            activeFilters.gender = activeFilters.gender === val ? null : val;
        } else if (category.startsWith("hair:")) {
            const val = category.split(":")[1];
            activeFilters.hair = activeFilters.hair === val ? null : val;
        } else if (category.startsWith("eye:")) {
            const val = category.split(":")[1];
            activeFilters.eye = activeFilters.eye === val ? null : val;
        } else {
            activeFilters.series = activeFilters.series === category ? null : category;
        }

        localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(activeFilters));
        
        currentPage = 1;
        localStorage.setItem(PAGE_STORAGE_KEY, 1);
        lastScrollTop = 0;
        localStorage.setItem(SCROLL_STORAGE_KEY, 0);

        renderSidebar();
        triggerFilter();
        listContainer.scrollTop = 0;
    }

    // 执行数据筛选与排序 (联合多维分类过滤)
    function triggerFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const sortVal = sortSelect.value;

        // A. 联合多维分类过滤
        let items = window.characterData || [];
        
        if (activeFilters.type === "favorites") {
            items = items.filter(item => favoriteSet.has(item.name));
        }
        if (activeFilters.gender) {
            const val = activeFilters.gender;
            items = items.filter(item => item.gender === val);
        }
        if (activeFilters.hair) {
            const val = activeFilters.hair;
            items = items.filter(item => item.hair === val);
        }
        if (activeFilters.eye) {
            const val = activeFilters.eye;
            items = items.filter(item => item.eye === val);
        }
        if (activeFilters.series) {
            items = items.filter(item => item.copyright === activeFilters.series);
        }

        // B. 搜索关键词过滤
        if (query) {
            items = items.filter(item => 
                (item.name && item.name.toLowerCase().includes(query)) || 
                (item.copyright && item.copyright.toLowerCase().includes(query))
            );
        }
        if (showSelectedOnly) {
            items = items.filter(item => selectedCharacters.has(item.name));
        }

        // C. 排序数据
        if (sortVal === "works-desc") {
            items.sort((a, b) => b.post_count - a.post_count);
        } else if (sortVal === "works-asc") {
            items.sort((a, b) => a.post_count - b.post_count);
        } else if (sortVal === "fav-first") {
            // 收藏优先：已收藏的角色排在前面，若都收藏或都未收藏，则按 post_count 降序排列
            items.sort((a, b) => {
                const aFav = favoriteSet.has(a.name) ? 1 : 0;
                const bFav = favoriteSet.has(b.name) ? 1 : 0;
                if (aFav !== bFav) return bFav - aFav;
                return b.post_count - a.post_count;
            });
        } else if (sortVal === "name-asc") {
            items.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortVal === "name-desc") {
            items.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sortVal === "copyright-asc") {
            // 按动漫系列排序 A-Z (同一系列的角色按同人插画总数降序)
            items.sort((a, b) => {
                const aCopy = a.copyright || "";
                const bCopy = b.copyright || "";
                if (aCopy !== bCopy) return aCopy.localeCompare(bCopy);
                return b.post_count - a.post_count;
            });
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
        
        pageStats.innerText = t("Total {total} characters | Showing {start}-{end}", { total: totalItems, start: startIdx, end: endIdx });
        
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

    // 基于角色名字 Hash 计算独一无二的 HSL 柔和渐变背景
    function getPlaceholderGradient(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h1 = Math.abs(hash % 360);
        const h2 = (h1 + 45) % 360; 
        return `linear-gradient(135deg, hsl(${h1}, 65%, 42%), hsl(${h2}, 60%, 26%))`;
    }

    // 渲染当前页的角色卡片 (极品 UI 优化版)
    function renderCurrentPage() {
        listContainer.innerHTML = "";
        
        if (filteredData.length === 0) {
            const noResult = document.createElement("div");
            noResult.style.cssText = "grid-column: 1 / -1; padding: 60px; text-align: center; color: #9ca3af; font-size: 16px; font-weight: 500;";
            noResult.innerText = t("No matching characters found");
            listContainer.appendChild(noResult);
            return;
        }

        const currentPageData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        const fragment = document.createDocumentFragment();
        
        currentPageData.forEach(item => {
            const isSelected = selectedCharacters.has(item.name);
            const isFavorite = favoriteSet.has(item.name);
            
            const card = document.createElement("div");
            card.dataset.name = item.name;
            
            // 极致视觉卡片 (无缝过度，ComfyUI 粉色边框高亮与阴影发光)
            card.style.cssText = `
                background: rgba(22, 22, 32, 0.7) !important;
                border: ${isSelected ? '2.5px solid #db2777' : '2.5px solid rgba(255, 255, 255, 0.04)'} !important;
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
                box-shadow: ${isSelected ? '0 10px 25px rgba(219, 39, 119, 0.35)' : '0 4px 12px rgba(0,0,0,0.15)'} !important;
            `;

            // Hover 升起与发光交互
            card.onmouseenter = () => {
                if (!isSelected) {
                    card.style.borderColor = "rgba(219, 39, 119, 0.4)";
                    card.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.4), 0 0 15px rgba(219, 39, 119, 0.15)";
                }
                img.style.transform = "scale(1.08)";
            };
            card.onmouseleave = () => {
                if (!isSelected) {
                    card.style.borderColor = "rgba(255, 255, 255, 0.04)";
                    card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                } else {
                    card.style.boxShadow = "0 10px 25px rgba(219, 39, 119, 0.35)";
                }
                img.style.transform = "none";
            };
            
            // 勾选图标 (左上角，轻量，ComfyUI 粉色)
            const checkbox = document.createElement("div");
            checkbox.style.cssText = `
                position: absolute;
                top: 12px;
                left: 12px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: ${isSelected ? '#db2777' : 'rgba(10, 10, 15, 0.5)'};
                border: 1.5px solid ${isSelected ? '#db2777' : 'rgba(255, 255, 255, 0.35)'};
                z-index: 5;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            `;
            checkbox.innerHTML = isSelected ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            ` : '';
            card.appendChild(checkbox);

            // ❤️ 收藏爱心图标 (右上角)
            const favIcon = document.createElement("div");
            favIcon.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 6px;
                z-index: 6;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                cursor: pointer;
                border-radius: 50%;
                background: rgba(10, 10, 15, 0.4);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: 1px solid rgba(255,255,255,0.1);
            `;
            favIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFavorite ? '#db2777' : 'none'}" stroke="${isFavorite ? '#db2777' : '#d1d5db'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            `;
            
            // 爱心 hover 特效
            favIcon.onmouseover = (e) => {
                e.stopPropagation();
                favIcon.style.transform = "scale(1.15)";
                favIcon.style.background = "rgba(10, 10, 15, 0.7)";
                const svg = favIcon.querySelector('svg');
                if (!isFavorite) svg.setAttribute('stroke', '#db2777');
            };
            favIcon.onmouseout = (e) => {
                e.stopPropagation();
                favIcon.style.transform = "scale(1)";
                favIcon.style.background = "rgba(10, 10, 15, 0.4)";
                const svg = favIcon.querySelector('svg');
                if (!isFavorite) svg.setAttribute('stroke', '#d1d5db');
            };

            // 点击爱心单独处理收藏，不触发卡片勾选
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
                    svg.setAttribute('fill', '#db2777');
                    svg.setAttribute('stroke', '#db2777');
                    
                    // 收藏成功时的精美微动效
                    favIcon.style.transform = "scale(1.3) rotate(-10deg)";
                    setTimeout(() => favIcon.style.transform = "scale(1)", 200);
                }
                saveFavorites();
                renderSidebar(); // 自动刷新侧边栏收藏统计数字
                
                // 如果当前正好在收藏夹分类，取消收藏时立刻移除卡片
                if (activeFilters.type === "favorites") {
                    triggerFilter();
                }
            };
            card.appendChild(favIcon);

            // 背景占位炫彩渐变层 (HSL 算法，默认隐藏，仅在 onerror 时显示以兜底)
            const placeholder = document.createElement("div");
            placeholder.className = "anima-card-placeholder";
            placeholder.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: ${getPlaceholderGradient(item.name)};
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1;
                opacity: 0;
                transition: opacity 0.25s ease;
            `;
            
            const initialLetter = document.createElement("span");
            initialLetter.innerText = item.name ? item.name.charAt(0).toUpperCase() : '?';
            initialLetter.style.cssText = "font-size: 56px; font-weight: 900; color: rgba(255,255,255,0.7); text-shadow: 0 4px 12px rgba(0,0,0,0.3);";
            placeholder.appendChild(initialLetter);
            card.appendChild(placeholder);

            // 真实的图片渲染层
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
            img.src = getImgUrl(item.name, item.copyright);
            
            let loader = null;
            // 🌟 智能判断：如果图片已被浏览器缓存过并且能瞬间同步完成，直接将其 opacity 设为 1，完全跳过创建 loading 动画！
            if (img.complete && img.naturalWidth !== 0) {
                img.style.opacity = "1";
            } else {
                // 如果没有缓存，属于真正需要网络请求的图，则立刻创建 Shimmer 流光屏 + Spinner 旋转进度环
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
                placeholder.style.opacity = "1"; // 图片加载失败，退避展示高颜值 HSL 渐变占位
            };
            card.appendChild(img);

            // 玻璃防尘及渐变阴影遮罩 (更暗更沉稳的黑金阴影遮罩)
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

            // 文字介绍面板 (名字 + 精致版权胶囊背景 + 作品数)
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
            // 将下划线/空格分隔的名字转换为优雅的首字母大写
            const nameFormatted = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            nameEl.innerText = nameFormatted;
            nameEl.style.cssText = "font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 4px rgba(0,0,0,0.6);";
            
            // 极其高级的作品名胶囊标签与数字同一行 (Pill Tag + Post Count Flex Layout)
            const copyrightContainer = document.createElement("div");
            copyrightContainer.style.cssText = "display: flex; align-items: center; justify-content: space-between; width: 100%; overflow: hidden; gap: 8px;";
            
            const copyrightEl = document.createElement("span");
            const copyrightFormatted = item.copyright ? item.copyright.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'ORIGINAL';
            copyrightEl.innerText = copyrightFormatted;
            copyrightEl.style.cssText = `
                font-size: 10px;
                font-weight: 700;
                color: #f472b6;
                background: rgba(219, 39, 119, 0.15);
                border: 1px solid rgba(219, 39, 119, 0.25);
                padding: 2.5px 8px;
                border-radius: 9999px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 68%;
            `;
            copyrightContainer.appendChild(copyrightEl);

            // 右侧紧凑显示的插画总数 (同人热度数字，K 缩写，低调高端)
            const numEl = document.createElement("span");
            const postCountFormatted = item.post_count >= 1000 
                ? (item.post_count / 1000).toFixed(1).replace(/\.0$/, '') + 'k' 
                : item.post_count;
            numEl.innerText = postCountFormatted;
            numEl.style.cssText = `
                font-size: 10.5px;
                color: #9ca3af;
                font-weight: 700;
                opacity: 0.9;
                white-space: nowrap;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.05);
                padding: 2px 6px;
                border-radius: 6px;
            `;
            copyrightContainer.appendChild(numEl);

            infoPanel.appendChild(nameEl);
            infoPanel.appendChild(copyrightContainer);
            card.appendChild(infoPanel);

            // 点击选择角色并更新勾选高亮
            card.onclick = () => {
                if (selectedCharacters.has(item.name)) {
                    selectedCharacters.delete(item.name);
                    card.style.borderColor = "rgba(255, 255, 255, 0.04)";
                    card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                    checkbox.style.background = "rgba(10, 10, 15, 0.5)";
                    checkbox.style.borderColor = "rgba(255, 255, 255, 0.35)";
                    checkbox.innerHTML = "";
                } else {
                    selectedCharacters.add(item.name);
                    card.style.borderColor = "#db2777";
                    card.style.boxShadow = "0 10px 25px rgba(219, 39, 119, 0.35)";
                    checkbox.style.background = "#db2777";
                    checkbox.style.borderColor = "#db2777";
                    checkbox.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;
                }
                updateCountLabel();
            };

            fragment.appendChild(card);
        });

        listContainer.appendChild(fragment);

        // 🌟 智能极速恢复滚动高度：在大图渲染完毕后，如果是弹窗首次渲染，强制恢复上次大图滚动条高度
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

    // 隐藏/关闭弹窗
    function closeModal() {
        modalOverlay.remove();
    }

    // 初始化渲染侧边栏和数据流
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
