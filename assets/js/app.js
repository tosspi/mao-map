/*!
 * 毛泽东生平地理轨迹可视化 - 主脚本文件
 * Author: sansan0
 * GitHub: https://github.com/sansan0/mao-map
 */

// ==================== 全局变量 ====================
let map = null;
let regionsData = null;
let trajectoryData = null;
let currentEventIndex = 0;
let previousEventIndex = 0;
let isPlaying = false;
let playInterval = null;
let eventMarkers = [];
let pathLayers = [];
let coordinateMap = new Map();
let locationGroups = new Map();
let locationMarkers = new Map();
let statsHoverTimeout = null;
let currentPlaySpeed = 1000;
let isPanelVisible = true;
let isFeedbackModalVisible = false;
let isCameraFollowEnabled = true;
let isDragging = false;

let isPoetryAnimationPlaying = false;
let poetryAnimationTimeout = null;

let isMusicModalVisible = false;
let currentMusicIndex = 0;
let isMusicPlaying = false;
let musicAudio = null;
let musicProgressInterval = null;
let musicVolume = 0.5;

// 添加音频状态管理变量
let audioLoadingPromise = null;
let isAutoPlayPending = false;
let currentAudioEventListeners = new Set();

let highlightedPaths = [];
let highlightTimeout = null;
let currentHighlightedEventIndex = -1;

let animationConfig = {
  pathDuration: 5000, // 控制路径绘制速度
  timelineDuration: 1500, // 时间轴动画时长
  cameraFollowDuration: 2000, // 镜头跟随动画时长
  cameraPanDuration: 1500, //镜头平移动画时长
  isAnimating: false,
  motionOptions: {
    auto: false, // 手动控制动画
    easing: L.Motion.Ease.easeInOutQuart,
  },
};

// 镜头速度档位配置
const CAMERA_SPEED_LEVELS = [
  {
    name: "极快",
    cameraFollowDuration: 600,
    cameraPanDuration: 400,
  },
  {
    name: "正常",
    cameraFollowDuration: 2000,
    cameraPanDuration: 1500,
  },
  {
    name: "慢速",
    cameraFollowDuration: 3500,
    cameraPanDuration: 2800,
  },
  {
    name: "极慢",
    cameraFollowDuration: 5000,
    cameraPanDuration: 4000,
  },
];

let motionPaths = new Map();
let animationQueue = [];
let isAnimationInProgress = false;

// ==================== 全局常量 ====================
const INTERNATIONAL_COORDINATES = {
  "俄罗斯 莫斯科": [37.6176, 55.7558],
};

/**
 * 检测是否为移动设备
 */
function isMobileDevice() {
  return window.innerWidth <= 768;
}

// ==================== 移动端交互 ====================
/**
 * 切换控制面板显示/隐藏状态
 */
function toggleControlPanel() {
  const panel = document.getElementById("timeline-control");
  const toggleBtn = document.getElementById("toggle-panel-btn");
  const mapEl = document.getElementById("map");

  if (isPanelVisible) {
    panel.classList.add("hidden");
    toggleBtn.textContent = "⬆";
    mapEl.classList.remove("panel-visible");
    mapEl.classList.add("panel-hidden");
    isPanelVisible = false;
  } else {
    panel.classList.remove("hidden");
    toggleBtn.textContent = "⚙";
    mapEl.classList.remove("panel-hidden");
    mapEl.classList.add("panel-visible");
    isPanelVisible = true;
  }

  setTimeout(() => {
    if (map && map.invalidateSize) {
      map.invalidateSize({
        animate: true,
        pan: false,
      });
    }
  }, 350);
}

/**
 * 获取控制面板高度
 */
function getControlPanelHeight() {
  const panel = document.getElementById("timeline-control");
  if (!panel || panel.classList.contains("hidden")) {
    return 0;
  }

  const rect = panel.getBoundingClientRect();
  return rect.height;
}

/**
 * 初始化移动端交互功能
 */
function initMobileInteractions() {
  const toggleBtn = document.getElementById("toggle-panel-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleControlPanel);
  }

  if (map && isMobileDevice()) {
    map.on("dblclick", (e) => {
      e.originalEvent.preventDefault();
      toggleControlPanel();
    });
  }

  initPanelDragClose();
}

/**
 * 初始化详细面板拖拽关闭功能（移动端）
 */
function initPanelDragClose() {
  if (!isMobileDevice()) return;

  const panel = document.getElementById("location-detail-panel");
  const panelHeader = panel?.querySelector(".panel-header");
  const backdrop = document.getElementById("panel-backdrop");

  if (!panel || !panelHeader) return;

  let touchState = {
    startY: 0,
    currentY: 0,
    deltaY: 0,
    startTime: 0,
    isDragging: false,
    hasMoved: false,
    isProcessing: false,
  };

  function resetAllStates(isClosing = false) {
    touchState = {
      startY: 0,
      currentY: 0,
      deltaY: 0,
      startTime: 0,
      isDragging: false,
      hasMoved: false,
      isProcessing: false,
    };

    panel.classList.remove("dragging");
    panelHeader.classList.remove("dragging");

    if (!isClosing) {
      panel.style.transform = "translateY(0)";
      panel.style.transition =
        "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

      if (backdrop) {
        backdrop.style.opacity = "0.3";
        backdrop.style.transition = "opacity 0.3s ease";
      }

      if (!panel.classList.contains("visible")) {
        panel.classList.add("visible");
      }

      setTimeout(() => {
        if (panel.style.transition.includes("transform")) {
          panel.style.transition = "";
        }
        if (backdrop && backdrop.style.transition.includes("opacity")) {
          backdrop.style.transition = "";
        }
      }, 350);
    }
  }

  function safeClosePanel() {
    touchState.isProcessing = true;

    panel.style.transform = "translateY(100%)";
    panel.style.transition =
      "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

    if (backdrop) {
      backdrop.style.opacity = "0";
      backdrop.style.transition = "opacity 0.3s ease";
    }

    setTimeout(() => {
      try {
        hideDetailPanel();
      } catch (error) {
        console.error("关闭面板时出错:", error);
      }

      setTimeout(() => {
        resetAllStates(true);
      }, 100);
    }, 300);
  }

  function handleTouchStart(e) {
    if (touchState.isProcessing) {
      return;
    }

    if (
      e.target.closest(".panel-close") ||
      e.target.closest(".panel-content")
    ) {
      return;
    }

    const touch = e.touches[0];
    touchState.startY = touch.clientY;
    touchState.currentY = touch.clientY;
    touchState.startTime = Date.now();
    touchState.isDragging = true;
    touchState.hasMoved = false;
    touchState.deltaY = 0;

    panel.classList.add("dragging");
    panelHeader.classList.add("dragging");

    panel.style.transition = "none";
    if (backdrop) {
      backdrop.style.transition = "none";
    }

    e.preventDefault();
  }

  function handleTouchMove(e) {
    if (!touchState.isDragging || touchState.isProcessing) {
      return;
    }

    const touch = e.touches[0];
    touchState.currentY = touch.clientY;
    touchState.deltaY = touchState.currentY - touchState.startY;

    if (!touchState.hasMoved && Math.abs(touchState.deltaY) > 3) {
      touchState.hasMoved = true;
    }

    if (touchState.deltaY > 0) {
      const maxDrag = 250;
      const dampingFactor = Math.max(
        0.3,
        1 - (touchState.deltaY / maxDrag) * 0.7
      );
      const transformValue = Math.min(
        touchState.deltaY * dampingFactor,
        maxDrag
      );

      panel.style.transform = `translateY(${transformValue}px)`;

      if (backdrop) {
        const maxOpacity = 0.3;
        const opacityReduction = (touchState.deltaY / 200) * maxOpacity;
        const newOpacity = Math.max(0.05, maxOpacity - opacityReduction);
        backdrop.style.opacity = newOpacity.toString();
      }
    } else {
      panel.style.transform = "translateY(0)";
      if (backdrop) {
        backdrop.style.opacity = "0.3";
      }
    }

    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (!touchState.isDragging) {
      return;
    }

    const duration = Date.now() - touchState.startTime;
    const velocity = duration > 0 ? Math.abs(touchState.deltaY) / duration : 0;

    panel.classList.remove("dragging");
    panelHeader.classList.remove("dragging");

    panel.style.transition =
      "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    if (backdrop) {
      backdrop.style.transition = "opacity 0.3s ease";
    }

    const shouldClose =
      touchState.hasMoved &&
      (touchState.deltaY > 40 ||
        (touchState.deltaY > 20 && velocity > 0.2) ||
        (touchState.deltaY > 10 && velocity > 0.5));

    if (shouldClose) {
      safeClosePanel();
    } else {
      resetAllStates(false);
    }
  }

  function handleTouchCancel(e) {
    if (touchState.isDragging && !touchState.isProcessing) {
      resetAllStates();
    }
  }

  function cleanupEventListeners() {
    panelHeader.removeEventListener("touchstart", handleTouchStart);
    panelHeader.removeEventListener("touchmove", handleTouchMove);
    panelHeader.removeEventListener("touchend", handleTouchEnd);
    panelHeader.removeEventListener("touchcancel", handleTouchCancel);
  }

  function bindEventListeners() {
    panelHeader.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });

    panelHeader.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });

    panelHeader.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });

    panelHeader.addEventListener("touchcancel", handleTouchCancel, {
      passive: false,
    });
  }

  cleanupEventListeners();
  bindEventListeners();

  const panelContent = panel.querySelector(".panel-content");
  if (panelContent) {
    panelContent.addEventListener(
      "touchstart",
      (e) => {
        e.stopPropagation();
      },
      { passive: true }
    );

    panelContent.addEventListener(
      "touchmove",
      (e) => {
        e.stopPropagation();
      },
      { passive: true }
    );
  }

  const closeBtn = panel.querySelector(".panel-close");
  if (closeBtn) {
    closeBtn.addEventListener(
      "touchstart",
      (e) => {
        e.stopPropagation();
      },
      { passive: true }
    );

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideDetailPanel();
    });
  }

  window.cleanupDragListeners = cleanupEventListeners;
}

/**
 * 初始化Leaflet地图
 */
function initMap() {
  map = L.map("map", {
    center: [35.8617, 104.1954],
    zoom: 5,
    minZoom: 4,
    maxZoom: 10,
    zoomControl: true,
    attributionControl: false,
    tap: true,
    tapTolerance: 15,
  });

  L.tileLayer(
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    {
      subdomains: "1234",
      attribution: "© 高德地图",
      maxZoom: 18,
    }
  ).addTo(map);

  console.log("地图初始化完成");
}

// ==================== 统计面板控制 ====================
/**
 * 初始化PC端统计面板悬停交互
 */
function initStatsHover() {
  const statsPanel = document.getElementById("stats-panel");
  const hoverArea = document.getElementById("stats-hover-area");

  if (!statsPanel || !hoverArea || isMobileDevice()) return;

  function showStatsPanel() {
    if (statsHoverTimeout) {
      clearTimeout(statsHoverTimeout);
      statsHoverTimeout = null;
    }
    statsPanel.classList.add("visible");
  }

  function hideStatsPanel() {
    statsHoverTimeout = setTimeout(() => {
      statsPanel.classList.remove("visible");
    }, 150);
  }

  hoverArea.addEventListener("mouseenter", showStatsPanel);
  hoverArea.addEventListener("mouseleave", hideStatsPanel);
  statsPanel.addEventListener("mouseenter", showStatsPanel);
  statsPanel.addEventListener("mouseleave", hideStatsPanel);
}

// ==================== 详细信息面板控制 ====================
/**
 * 初始化详细信息面板交互
 */
function initDetailPanel() {
  const panel = document.getElementById("location-detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  const closeBtn = document.getElementById("panel-close-btn");

  if (closeBtn) {
    closeBtn.addEventListener("click", hideDetailPanel);
  }

  if (backdrop) {
    backdrop.addEventListener("click", hideDetailPanel);
  }

  if (panel) {
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (!isMobileDevice()) {
    document.addEventListener("click", (e) => {
      if (panel && panel.classList.contains("visible")) {
        const isClickInsidePanel = panel.contains(e.target);
        const isClickOnMarker = e.target.closest(".leaflet-marker-icon");

        if (!isClickInsidePanel && !isClickOnMarker) {
          hideDetailPanel();
        }
      }
    });
  }
}

/**
 * 显示地点详细信息面板
 */
function showDetailPanel(locationGroup) {
  const panel = document.getElementById("location-detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  const titleEl = document.getElementById("panel-location-title");
  const summaryEl = document.getElementById("panel-visit-summary");
  const contentEl = document.getElementById("panel-content");

  if (!panel || !titleEl || !summaryEl || !contentEl) return;

  const { location, events } = locationGroup;
  const visitCount = events.length;
  const transitCount = events.filter((e) => e.visitType === "途径").length;
  const destCount = events.filter((e) => e.visitType === "目的地").length;
  const startCount = events.filter((e) => e.visitType === "起点").length;
  const activityCount = events.filter((e) => e.visitType === "活动").length;
  const birthCount = events.filter((e) => e.visitType === "出生").length;

  titleEl.textContent = `📍 ${location}`;

  let summaryText = `截止当前时间点共 <span class="visit-count-highlight">${visitCount}</span> 次相关记录`;

  let descParts = [];
  if (birthCount > 0) descParts.push(`${birthCount}次出生`);
  if (destCount > 0) descParts.push(`${destCount}次到达`);
  if (startCount > 0) descParts.push(`${startCount}次出发`);
  if (transitCount > 0) descParts.push(`${transitCount}次途径`);
  if (activityCount > 0) descParts.push(`${activityCount}次活动`);

  if (descParts.length > 0) {
    summaryText += ` (${descParts.join("，")})`;
  }

  summaryEl.innerHTML = summaryText;

  const sortedEvents = [...events].sort((a, b) => a.index - b.index);

  const eventListHtml = sortedEvents
    .map((event, index) => {
      const isCurrentEvent = event.index === currentEventIndex;
      const itemClass = isCurrentEvent
        ? "event-item current-event"
        : "event-item";

      let visitTypeClass = "";
      let visitTypeLabel = "";
      let visitOrderClass = "";

      const orderNumber = `第${index + 1}次`;

      switch (event.visitType) {
        case "出生":
          visitTypeClass = "birth-event";
          visitTypeLabel = "出生";
          visitOrderClass = "birth-order";
          break;
        case "起点":
          visitTypeClass = "start-event";
          visitTypeLabel = "出发";
          visitOrderClass = "start-order";
          break;
        case "目的地":
          visitTypeLabel = "到达";
          visitOrderClass = "";
          break;
        case "途径":
          visitTypeClass = "transit-event";
          visitTypeLabel = "途径";
          visitOrderClass = "transit-order";
          break;
        case "活动":
          visitTypeClass = "activity-event";
          visitTypeLabel = "活动";
          visitOrderClass = "activity-order";
          break;
      }

      return `
      <div class="${itemClass} ${visitTypeClass}" data-event-index="${
        event.index
      }">
        <div class="event-header">
          <span class="visit-order-number">${orderNumber}</span>
          <span class="event-date-item">${event.date}</span>
          <span class="visit-order ${visitOrderClass}">${visitTypeLabel}</span>
        </div>
        <div class="event-description">${
          event.originalEvent || event.event
        }</div>
        ${event.age ? `<div class="event-age">年龄: ${event.age}岁</div>` : ""}
      </div>
    `;
    })
    .join("");

  contentEl.innerHTML = eventListHtml;

  const eventItems = contentEl.querySelectorAll(".event-item");
  eventItems.forEach((item) => {
    const eventIndex = parseInt(item.dataset.eventIndex);

    item.addEventListener("click", (e) => {
      e.stopPropagation();

      if (currentHighlightedEventIndex === eventIndex) {
        clearPathHighlight();
        return;
      }

      if (currentHighlightedEventIndex !== -1) {
        quickClearPathHighlight();
      }

      highlightEventPath(eventIndex);

      item.classList.add("event-item-clicked");
      setTimeout(() => {
        item.classList.remove("event-item-clicked");
      }, 300);
    });

    item.addEventListener("mouseenter", (e) => {
      if (currentHighlightedEventIndex !== eventIndex) {
        item.style.cursor = "pointer";
        item.style.transform = "translateX(2px)";
      }
    });

    item.addEventListener("mouseleave", (e) => {
      item.style.transform = "";
    });
  });

  if (backdrop && isMobileDevice()) {
    backdrop.classList.add("visible");
  }

  panel.classList.add("visible");

  if (isMobileDevice()) {
    setTimeout(() => {
      initPanelDragClose();
    }, 100);
  }
}

/**
 * 隐藏详细信息面板
 */
function hideDetailPanel() {
  const panel = document.getElementById("location-detail-panel");
  const backdrop = document.getElementById("panel-backdrop");

  if (panel) {
    panel.classList.remove("visible", "dragging");
    panel.style.transform = "";
    panel.style.transition = "";
  }

  if (backdrop) {
    backdrop.classList.remove("visible", "dragging");
    backdrop.style.opacity = "";
    backdrop.style.transition = "";
  }

  if (window.cleanupDragListeners) {
    try {
      window.cleanupDragListeners();
    } catch (error) {
      console.warn("清理拖拽监听器时出错:", error);
    }
  }
}

// ==================== 反馈功能控制 ====================
/**
 * 初始化反馈功能
 */
function initFeedbackModal() {
  const feedbackBtn = document.getElementById("feedback-btn");
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");
  const feedbackClose = document.getElementById("feedback-modal-close");

  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", showFeedbackModal);
  }

  if (feedbackClose) {
    feedbackClose.addEventListener("click", hideFeedbackModal);
  }

  if (feedbackBackdrop) {
    feedbackBackdrop.addEventListener("click", hideFeedbackModal);
  }

  if (feedbackModal) {
    feedbackModal.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  const issuesItem = document.getElementById("feedback-issues");
  const projectItem = document.getElementById("feedback-project");
  const wechatItem = document.getElementById("feedback-wechat");

  if (issuesItem) {
    issuesItem.addEventListener("click", () => {
      openGitHubIssues();
      hideFeedbackModal();
    });
  }

  if (projectItem) {
    projectItem.addEventListener("click", () => {
      openGitHubProject();
      hideFeedbackModal();
    });
  }

  if (wechatItem) {
    wechatItem.addEventListener("click", () => {
      handleWeChatAction();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isFeedbackModalVisible) {
      hideFeedbackModal();
    }
  });
}

/**
 * 显示反馈弹窗
 */
function showFeedbackModal() {
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");

  if (feedbackModal && feedbackBackdrop) {
    feedbackBackdrop.classList.add("visible");
    feedbackModal.classList.add("visible");
    isFeedbackModalVisible = true;

    document.body.style.overflow = "hidden";
  }
}

/**
 * 隐藏反馈弹窗
 */
function hideFeedbackModal() {
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");

  if (feedbackModal && feedbackBackdrop) {
    feedbackBackdrop.classList.remove("visible");
    feedbackModal.classList.remove("visible");
    isFeedbackModalVisible = false;

    document.body.style.overflow = "";
  }
}

/**
 * 打开GitHub Issues页面
 */
function openGitHubIssues() {
  const issuesUrl = "https://github.com/sansan0/mao-map/issues";
  window.open(issuesUrl, "_blank", "noopener,noreferrer");
}

/**
 * 打开GitHub项目主页
 */
function openGitHubProject() {
  const projectUrl = "https://github.com/sansan0/mao-map";
  window.open(projectUrl, "_blank", "noopener,noreferrer");
}

/**
 * 处理微信公众号操作
 */
function handleWeChatAction() {
  const wechatName = "硅基茶水间";

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(wechatName)
      .then(() => {
        showTemporaryMessage(
          "公众号名称已复制到剪贴板：" + wechatName,
          "success"
        );
      })
      .catch(() => {
        showTemporaryMessage("请搜索微信公众号：" + wechatName, "info");
      });
  } else {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = wechatName;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      document.execCommand("copy");
      document.body.removeChild(textArea);
      showTemporaryMessage(
        "公众号名称已复制到剪贴板：" + wechatName,
        "success"
      );
    } catch (err) {
      showTemporaryMessage("请搜索微信公众号：" + wechatName, "info");
    }
  }

  hideFeedbackModal();
}

/**
 * 显示临时提示消息
 */
function showTemporaryMessage(message, type = "info") {
  const existingMessage = document.querySelector(".temp-message");
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = "temp-message";
  messageDiv.textContent = message;

  const colors = {
    success: { bg: "rgba(39, 174, 96, 0.9)", border: "#27ae60" },
    info: { bg: "rgba(52, 152, 219, 0.9)", border: "#3498db" },
    warning: { bg: "rgba(243, 156, 18, 0.9)", border: "#f39c12" },
  };

  const color = colors[type] || colors.info;

  Object.assign(messageDiv.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: color.bg,
    color: "white",
    padding: "12px 20px",
    borderRadius: "8px",
    border: `1px solid ${color.border}`,
    zIndex: "9999",
    fontSize: "14px",
    fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    backdropFilter: "blur(10px)",
    maxWidth: "90vw",
    textAlign: "center",
    lineHeight: "1.4",
  });

  document.body.appendChild(messageDiv);

  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.opacity = "0";
      messageDiv.style.transform = "translate(-50%, -50%) scale(0.9)";
      messageDiv.style.transition = "all 0.3s ease";

      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }, 3000);
}

/**
 * 显示诗句动画消息（带状态控制）
 */
function showPoetryMessage() {
  if (isPoetryAnimationPlaying) {
    console.log("诗句动画正在播放中，忽略新的触发");
    return;
  }

  isPoetryAnimationPlaying = true;
  console.log("开始播放诗句动画");

  if (poetryAnimationTimeout) {
    clearTimeout(poetryAnimationTimeout);
    poetryAnimationTimeout = null;
  }

  const existingPoetry = document.querySelector(".poetry-message");
  if (existingPoetry) {
    existingPoetry.remove();
  }

  const poetryDiv = document.createElement("div");
  poetryDiv.className = "poetry-message";

  const poetryTexts = [
    "俱往矣，数风流人物，还看今朝",
    "一万年太久，只争朝夕",
    "雄关漫道真如铁，而今迈步从头越",
    "江山如此多娇，引无数英雄竞折腰",
  ];

  const randomPoetry =
    poetryTexts[Math.floor(Math.random() * poetryTexts.length)];
  poetryDiv.textContent = randomPoetry;

  Object.assign(poetryDiv.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%) scale(0.3)",
    background:
      "linear-gradient(135deg, rgba(200, 16, 46, 0.95), rgba(139, 69, 19, 0.95))",
    color: "#f4f1de",
    padding: "24px 32px",
    borderRadius: "16px",
    border: "2px solid rgba(255, 215, 0, 0.6)",
    zIndex: "9999",
    fontSize: "18px",
    fontWeight: "700",
    fontFamily: "'KaiTi', '楷体', serif",
    boxShadow:
      "0 8px 32px rgba(200, 16, 46, 0.4), inset 0 2px 8px rgba(255, 255, 255, 0.2)",
    backdropFilter: "blur(12px)",
    maxWidth: "80vw",
    textAlign: "center",
    lineHeight: "1.6",
    letterSpacing: "2px",
    textShadow: "2px 2px 4px rgba(0, 0, 0, 0.6)",
    opacity: "0",
    pointerEvents: "none",
    transition: "all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  });

  document.body.appendChild(poetryDiv);

  requestAnimationFrame(() => {
    poetryDiv.style.opacity = "1";
    poetryDiv.style.transform = "translate(-50%, -50%) scale(1)";
  });

  setTimeout(() => {
    if (poetryDiv.parentNode && isPoetryAnimationPlaying) {
      poetryDiv.style.transform = "translate(-50%, -50%) scale(1.1)";
      poetryDiv.style.fontSize = "20px";
    }
  }, 800);

  // 第三阶段：放大到最大并开始淡出
  setTimeout(() => {
    if (poetryDiv.parentNode && isPoetryAnimationPlaying) {
      poetryDiv.style.transform = "translate(-50%, -50%) scale(1.3)";
      poetryDiv.style.opacity = "0.3";
      poetryDiv.style.fontSize = "24px";
      poetryDiv.style.filter = "blur(1px)";
    }
  }, 2200);

  // 第四阶段：完全消失
  setTimeout(() => {
    if (poetryDiv.parentNode && isPoetryAnimationPlaying) {
      poetryDiv.style.transform = "translate(-50%, -50%) scale(1.8)";
      poetryDiv.style.opacity = "0";
      poetryDiv.style.filter = "blur(3px)";

      setTimeout(() => {
        if (poetryDiv.parentNode) {
          poetryDiv.remove();
        }
        isPoetryAnimationPlaying = false;
        console.log("诗句动画播放完成，状态已重置");
      }, 800);
    } else if (!isPoetryAnimationPlaying) {
      if (poetryDiv.parentNode) {
        poetryDiv.remove();
      }
    }
  }, 3500);

  setTimeout(() => {
    if (poetryDiv.parentNode && isPoetryAnimationPlaying) {
      poetryDiv.style.boxShadow =
        "0 8px 32px rgba(255, 215, 0, 0.8), inset 0 2px 8px rgba(255, 255, 255, 0.3), 0 0 20px rgba(255, 215, 0, 0.6)";
    }
  }, 1000);

  setTimeout(() => {
    if (poetryDiv.parentNode && isPoetryAnimationPlaying) {
      poetryDiv.style.boxShadow =
        "0 8px 32px rgba(200, 16, 46, 0.4), inset 0 2px 8px rgba(255, 255, 255, 0.2)";
    }
  }, 1800);

  poetryAnimationTimeout = setTimeout(() => {
    if (isPoetryAnimationPlaying) {
      console.warn("诗句动画超时保护触发，强制重置状态");
      isPoetryAnimationPlaying = false;

      const remainingPoetry = document.querySelector(".poetry-message");
      if (remainingPoetry) {
        remainingPoetry.remove();
      }
    }
    poetryAnimationTimeout = null;
  }, 5000);
}

/**
 * 强制停止诗句动画
 */
function forceStopPoetryAnimation() {
  if (isPoetryAnimationPlaying) {
    isPoetryAnimationPlaying = false;

    if (poetryAnimationTimeout) {
      clearTimeout(poetryAnimationTimeout);
      poetryAnimationTimeout = null;
    }

    const poetryElements = document.querySelectorAll(".poetry-message");
    poetryElements.forEach((element) => {
      if (element.parentNode) {
        element.remove();
      }
    });
  }
}

// ==================== 坐标数据处理 ====================
/**
 * 从地区数据构建坐标映射表
 */
function buildCoordinateMapFromRegions() {
  console.log("建立坐标映射...");

  if (regionsData && regionsData.regions) {
    regionsData.regions.forEach((region) => {
      const extPath = region.ext_path;
      const coordinates = region.coordinates;

      if (
        extPath &&
        coordinates &&
        Array.isArray(coordinates) &&
        coordinates.length === 2
      ) {
        coordinateMap.set(extPath, coordinates);
      }
    });
  }

  Object.entries(INTERNATIONAL_COORDINATES).forEach(([name, coords]) => {
    coordinateMap.set(name, coords);
  });

  console.log("坐标映射建立完成，共", coordinateMap.size, "个地点");
  console.log("国际坐标:", Object.keys(INTERNATIONAL_COORDINATES));
}

// ==================== 数据加载 ====================
/**
 * 加载地理坐标数据
 */
async function loadGeographicData() {
  try {
    const response = await fetch("data/china_regions_coordinates.json");

    if (response.ok) {
      regionsData = await response.json();
      buildCoordinateMapFromRegions();
      console.log("china_regions_coordinates.json 加载成功");
    } else {
      throw new Error("china_regions_coordinates.json 加载失败");
    }

    return true;
  } catch (error) {
    console.warn("外部地理数据加载失败:", error.message);
    Object.entries(INTERNATIONAL_COORDINATES).forEach(([name, coords]) => {
      coordinateMap.set(name, coords);
    });
    console.log("已加载备用国际坐标数据");
    return true;
  }
}

/**
 * 加载轨迹事件数据
 */
async function loadTrajectoryData() {
  try {
    const response = await fetch("data/mao_trajectory_events.json");
    if (!response.ok) {
      throw new Error(
        `加载事件数据失败: ${response.status} - ${response.statusText}`
      );
    }

    const rawData = await response.json();

    if (
      !rawData.events ||
      !Array.isArray(rawData.events) ||
      rawData.events.length === 0
    ) {
      throw new Error("mao_trajectory_events.json 格式错误或事件数据为空");
    }

    return processTrajectoryData(rawData);
  } catch (error) {
    console.error("加载轨迹数据失败:", error);
    throw error;
  }
}

// ==================== 坐标匹配 ====================
/**
 * 构建完整的行政区划路径
 */
function buildFullLocationPath(locationInfo) {
  if (!locationInfo) return null;

  let parts = [];

  if (locationInfo.country && locationInfo.country !== "中国") {
    parts.push(locationInfo.country);
    if (locationInfo.city) {
      parts.push(locationInfo.city);
    }
  } else {
    if (locationInfo.province) {
      parts.push(locationInfo.province);
    }
    if (locationInfo.city) {
      parts.push(locationInfo.city);
    }
    if (locationInfo.district && locationInfo.district !== locationInfo.city) {
      parts.push(locationInfo.district);
    }
  }

  const fullPath = parts.length > 0 ? parts.join(" ") : null;

  return fullPath;
}

/**
 * 根据位置信息获取坐标
 */
function getCoordinates(locationInfo) {
  if (!locationInfo) return null;

  if (locationInfo.coordinates) {
    return locationInfo.coordinates;
  }

  const fullPath = buildFullLocationPath(locationInfo);
  if (fullPath && coordinateMap.has(fullPath)) {
    return coordinateMap.get(fullPath);
  }

  console.warn("无法匹配坐标:", locationInfo, "构建路径:", fullPath);
  return null;
}

/**
 * 获取坐标和格式化地点名称
 */
function getCoordinatesWithLocation(locationInfo) {
  if (!locationInfo) return { coordinates: null, location: "未知地点" };

  if (locationInfo.coordinates) {
    return {
      coordinates: locationInfo.coordinates,
      location: formatLocationName(locationInfo),
    };
  }

  const fullPath = buildFullLocationPath(locationInfo);
  const coordinates =
    fullPath && coordinateMap.has(fullPath)
      ? coordinateMap.get(fullPath)
      : null;

  return {
    coordinates: coordinates,
    location: formatLocationName(locationInfo),
  };
}

/**
 * 格式化地点名称显示
 */
function formatLocationName(locationInfo) {
  if (!locationInfo) return "未知地点";

  let parts = [];

  if (locationInfo.country && locationInfo.country !== "中国") {
    parts.push(locationInfo.country);
    if (locationInfo.city) parts.push(locationInfo.city);
  } else {
    if (locationInfo.province) parts.push(locationInfo.province);
    if (locationInfo.city && locationInfo.city !== locationInfo.province) {
      parts.push(locationInfo.city);
    }
    if (locationInfo.district && locationInfo.district !== locationInfo.city) {
      parts.push(locationInfo.district);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "未知地点";
}

// ==================== 轨迹数据处理 ====================
/**
 * 处理原始轨迹数据，添加坐标信息
 */
function processTrajectoryData(data) {
  const processedEvents = data.events.map((event, index) => {
    const processed = {
      ...event,
      index: index,
      startCoords: null,
      endCoords: null,
      transitCoords: [],
      startLocation: null,
      endLocation: null,
    };

    if (event.coordinates && event.coordinates.start) {
      const startResult = getCoordinatesWithLocation(event.coordinates.start);
      processed.startCoords = startResult.coordinates;
      processed.startLocation = startResult.location;
    }

    if (event.coordinates && event.coordinates.end) {
      const endResult = getCoordinatesWithLocation(event.coordinates.end);
      processed.endCoords = endResult.coordinates;
      processed.endLocation = endResult.location;
    }

    if (event.coordinates && event.coordinates.transit) {
      processed.transitCoords = event.coordinates.transit
        .map((transit) => getCoordinates(transit))
        .filter((coords) => coords !== null);
    }

    if (!processed.endLocation && processed.startLocation) {
      processed.endLocation = processed.startLocation;
      processed.endCoords = processed.startCoords;
    }

    return processed;
  });

  return {
    ...data,
    events: processedEvents,
  };
}

// ==================== 位置聚合 ====================
/**
 * 按地理位置聚合事件
 */
function groupEventsByLocation(events, maxIndex) {
  const groups = new Map();

  for (let i = 0; i <= maxIndex; i++) {
    const event = events[i];

    if (event.movementType === "出生") {
      if (event.endCoords && event.endLocation) {
        const coordKey = `${event.endCoords[0]},${event.endCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.endCoords,
            location: event.endLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: "出生",
        });

        group.types.add(event.movementType);
      }
    } else if (event.movementType === "原地活动") {
      if (event.endCoords && event.endLocation) {
        const coordKey = `${event.endCoords[0]},${event.endCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.endCoords,
            location: event.endLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: "活动",
        });

        group.types.add(event.movementType);
      }
    } else {
      if (event.startCoords && event.startLocation) {
        const coordKey = `${event.startCoords[0]},${event.startCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.startCoords,
            location: event.startLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: "起点",
        });

        group.types.add(event.movementType);
      }

      if (event.endCoords && event.endLocation) {
        const coordKey = `${event.endCoords[0]},${event.endCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.endCoords,
            location: event.endLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: "目的地",
        });

        group.types.add(event.movementType);
      }

      if (
        event.transitCoords &&
        event.transitCoords.length > 0 &&
        event.coordinates &&
        event.coordinates.transit
      ) {
        event.transitCoords.forEach((coords, transitIndex) => {
          if (coords && event.coordinates.transit[transitIndex]) {
            const transitInfo = event.coordinates.transit[transitIndex];
            const transitResult = getCoordinatesWithLocation(transitInfo);

            if (transitResult.coordinates && transitResult.location) {
              const coordKey = `${coords[0]},${coords[1]}`;

              if (!groups.has(coordKey)) {
                groups.set(coordKey, {
                  coordinates: coords,
                  location: transitResult.location,
                  events: [],
                  types: new Set(),
                });
              }

              const group = groups.get(coordKey);
              group.events.push({
                ...event,
                index: i,
                date: event.date,
                event: `途经：${event.event}`,
                age: event.age,
                visitType: "途径",
                originalEvent: event.event,
              });

              group.types.add(event.movementType);
            }
          }
        });
      }
    }
  }

  return groups;
}

/**
 * 根据访问次数获取标记样式类
 */
function getVisitCountClass(visitCount) {
  if (visitCount === 1) return "visits-1";
  if (visitCount === 2) return "visits-2";
  if (visitCount === 3) return "visits-3";
  return "visits-4-plus";
}

/**
 * 根据事件类型获取主要标记类型
 */
function getPrimaryMarkerType(types) {
  if (types.has("出生")) return "marker-birth";

  if (types.has("国际移动")) return "marker-international";

  if (types.has("长途移动")) return "marker-long-distance";

  if (types.has("短途移动")) return "marker-short-distance";

  const movementTypes = ["国际移动", "长途移动", "短途移动"].filter((type) =>
    types.has(type)
  );
  if (movementTypes.length > 1) return "marker-mixed";

  if (types.has("原地活动")) return "marker-activity";

  return "marker-movement";
}

/**
 * 创建地点标记
 */
function createLocationMarker(
  locationGroup,
  isCurrent = false,
  isVisited = false
) {
  const { coordinates, location, events, types } = locationGroup;
  const [lng, lat] = coordinates;
  const visitCount = events.length;

  const markerClasses = [
    "location-marker",
    getPrimaryMarkerType(types),
    getVisitCountClass(visitCount),
  ];

  if (isCurrent) markerClasses.push("current");
  if (isVisited) markerClasses.push("visited");

  const markerContent = visitCount > 1 ? visitCount.toString() : "";

  const baseSize = isMobileDevice() ? 2 : 0;
  const iconSizes = {
    1: [14 + baseSize, 14 + baseSize],
    2: [18 + baseSize, 18 + baseSize],
    3: [22 + baseSize, 22 + baseSize],
    4: [26 + baseSize, 26 + baseSize],
  };

  const sizeKey = visitCount >= 4 ? 4 : visitCount;
  const iconSize = iconSizes[sizeKey];
  const iconAnchor = [iconSize[0] / 2, iconSize[1] / 2];

  const markerElement = L.divIcon({
    className: markerClasses.join(" "),
    html: markerContent,
    iconSize: iconSize,
    iconAnchor: iconAnchor,
  });

  const marker = L.marker([lat, lng], {
    icon: markerElement,
    interactive: true,
    keyboard: true,
    zIndexOffset: 1000,
  });

  const clickHandler = function (e) {
    e.originalEvent.stopPropagation();
    showDetailPanel(locationGroup);
  };

  marker._originalClickHandler = clickHandler;

  marker.on("click", clickHandler);

  marker.on("add", function () {
    setTimeout(() => {
      if (marker._icon) {
        marker._icon.style.zIndex = "1000";
        marker._icon.style.pointerEvents = "auto";
        marker._icon.style.cursor = "pointer";
      }
    }, 50);
  });

  let tooltipText;
  if (visitCount === 1) {
    const event = events[0];
    tooltipText = `${event.date} - ${event.visitType === "途径" ? "途经" : ""}${
      event.originalEvent || event.event
    }`;
  } else {
    const transitCount = events.filter((e) => e.visitType === "途径").length;
    const destCount = events.filter((e) => e.visitType === "目的地").length;

    let desc = [];
    if (destCount > 0) desc.push(`${destCount}次到达`);
    if (transitCount > 0) desc.push(`${transitCount}次途径`);

    tooltipText = `${location} (${desc.join("，")})`;
  }

  marker.bindTooltip(tooltipText, {
    direction: "top",
    offset: [0, -15],
    className: "simple-tooltip",
  });

  return marker;
}

// ==================== 地图标记和路径  ====================
/**
 * 创建 motion 动画路径
 */
function createMotionPath(
  fromCoords,
  toCoords,
  transitCoords = [],
  isLatest = false,
  eventIndex = null,
  isConnectionPath = false,
  isReverse = false
) {
  if (!fromCoords || !toCoords) return null;

  const pathCoords = [];

  if (isReverse) {
    // 反向路径：从终点到起点
    pathCoords.push([toCoords[1], toCoords[0]]);

    // 反向添加 transit 点
    if (!isConnectionPath && transitCoords && transitCoords.length > 0) {
      for (let i = transitCoords.length - 1; i >= 0; i--) {
        pathCoords.push([transitCoords[i][1], transitCoords[i][0]]);
      }
    }

    pathCoords.push([fromCoords[1], fromCoords[0]]);
  } else {
    // 正向路径：从起点到终点
    pathCoords.push([fromCoords[1], fromCoords[0]]);

    if (!isConnectionPath && transitCoords && transitCoords.length > 0) {
      transitCoords.forEach((coords) => {
        pathCoords.push([coords[1], coords[0]]);
      });
    }

    pathCoords.push([toCoords[1], toCoords[0]]);
  }

  const polylineOptions = {
    color: isLatest ? "#c0392b" : "#85c1e9",
    weight: isConnectionPath ? 2 : 3,
    opacity: isLatest ? 0.9 : isConnectionPath ? 0.4 : 0.6,
    smoothFactor: 1,
    dashArray: isConnectionPath ? "4, 8" : "8, 8",
  };

  // 拖动时使用极短的动画时间，实现快速显示
  let effectiveDuration = isDragging ? 1 : animationConfig.pathDuration;

  const motionOptions = {
    auto: isDragging ? true : false,
    duration: effectiveDuration,
    easing: isDragging
      ? L.Motion.Ease.easeLinear || animationConfig.motionOptions.easing
      : animationConfig.motionOptions.easing,
  };

  const motionPath = L.motion.polyline(
    pathCoords,
    polylineOptions,
    motionOptions
  );

  // 保存路径元数据
  motionPath._isAnimated = true;
  motionPath._isLatest = isLatest;
  motionPath._needsAnimation = isLatest && !isDragging;
  motionPath._eventIndex = eventIndex;
  motionPath._isConnectionPath = isConnectionPath;
  motionPath._isReverse = isReverse;
  motionPath._originalPathCoords = pathCoords;
  motionPath._pathOptions = polylineOptions;

  return motionPath;
}

/**
 * 更新路径样式
 */
function updatePathStyle(path, isLatest) {
  if (!path) return;

  const color = isLatest ? "#c0392b" : "#85c1e9";
  const opacity = isLatest ? 0.9 : 0.6;

  path.setStyle({
    color: color,
    opacity: opacity,
    dashArray: "8, 8",
  });

  path._isLatest = isLatest;

  if (path._path) {
    path._path.style.stroke = color;
    path._path.style.strokeOpacity = opacity;
  }
}

/**
 * 静态更新路径（无动画）
 */
function updatePathsStatic(targetIndex) {
  pathLayers.forEach((path) => {
    if (path._map) {
      map.removeLayer(path);
    }
  });
  pathLayers = [];
  motionPaths.clear();

  for (let i = 0; i <= targetIndex; i++) {
    const currentEvent = trajectoryData.events[i];

    if (
      currentEvent.startCoords &&
      currentEvent.endCoords &&
      currentEvent.movementType !== "原地活动"
    ) {
      console.log(
        `${isDragging ? "拖动" : "静态"}添加路径: 事件 ${i}: ${
          currentEvent.event
        }`
      );

      const isLatest = i === targetIndex;
      const motionPath = createMotionPath(
        currentEvent.startCoords,
        currentEvent.endCoords,
        currentEvent.transitCoords,
        isLatest,
        i,
        false,
        false
      );

      if (motionPath) {
        motionPath._needsAnimation = false;
        motionPath._initiallyHidden = false;
        motionPath.addTo(map);
        pathLayers.push(motionPath);
        motionPaths.set(i, motionPath);

        // 如果是拖动状态，立即启动动画以快速显示
        if (isDragging && motionPath.motionStart) {
          motionPath.motionStart();
        }

        console.log(`成功添加${isDragging ? "拖动" : "静态"}路径: 事件 ${i}`);
      } else {
        console.warn(`路径创建失败: 事件 ${i}`);
      }
    } else {
      console.log(`跳过事件 ${i}: ${currentEvent.event} (原地活动或缺少坐标)`);
    }
  }
}

/**
 * 创建路径消失动画
 */
function animatePathDisappear(path) {
  if (!path || !path._map) return;

  const pathElement = path._path;
  if (!pathElement) {
    map.removeLayer(path);
    return;
  }

  const totalLength = pathElement.getTotalLength();

  pathElement.style.strokeDasharray = totalLength;
  pathElement.style.strokeDashoffset = "0";
  pathElement.style.transition = `stroke-dashoffset ${animationConfig.pathDuration}ms ease-in-out, opacity ${animationConfig.pathDuration}ms ease-in-out`;

  setTimeout(() => {
    pathElement.style.strokeDashoffset = totalLength;
    pathElement.style.opacity = "0";
  }, 50);

  setTimeout(() => {
    if (path._map) {
      map.removeLayer(path);
    }
  }, animationConfig.pathDuration + 100);
}

/**
 * 批量执行路径消失动画
 */
function batchAnimatePathsDisappear(paths, staggerDelay = 200) {
  if (!paths || paths.length === 0) return;

  return new Promise((resolve) => {
    let completedCount = 0;
    const totalPaths = paths.length;

    paths.forEach((path, index) => {
      setTimeout(() => {
        animatePathDisappear(path);

        completedCount++;
        if (completedCount === totalPaths) {
          setTimeout(() => {
            resolve();
          }, animationConfig.pathDuration + 100);
        }
      }, index * staggerDelay);
    });
  });
}

/**
 * 动画更新路径
 */
function updatePathsAnimated(targetIndex, isReverse = false) {
  if (isReverse) {
    // 反向动画：让后面的路径逐渐消失
    const pathsToRemove = pathLayers.filter(
      (path) => path._eventIndex > targetIndex
    );

    if (pathsToRemove.length > 0) {
      console.log(`开始反向消失动画，移除 ${pathsToRemove.length} 条路径`);

      pathsToRemove.forEach((path, index) => {
        setTimeout(() => {
          animatePathDisappear(path);
        }, index * 100);
      });

      // 延迟清理路径数组和映射
      setTimeout(() => {
        pathsToRemove.forEach((pathToRemove) => {
          const pathIndex = pathLayers.indexOf(pathToRemove);
          if (pathIndex > -1) {
            pathLayers.splice(pathIndex, 1);
          }
          if (motionPaths.has(pathToRemove._eventIndex)) {
            motionPaths.delete(pathToRemove._eventIndex);
          }
        });
      }, pathsToRemove.length * 200 + animationConfig.pathDuration);
    }
  } else {
    // 正向动画：添加新路径
    const currentEvent = trajectoryData.events[targetIndex];

    pathLayers.forEach((path) => {
      if (path._isLatest) {
        updatePathStyle(path, false);
      }
    });

    if (
      currentEvent.startCoords &&
      currentEvent.endCoords &&
      currentEvent.movementType !== "原地活动"
    ) {
      console.log(
        `Motion 添加路径: 事件 ${targetIndex} - ${currentEvent.event}`
      );

      const motionPath = createMotionPath(
        currentEvent.startCoords,
        currentEvent.endCoords,
        currentEvent.transitCoords,
        true,
        targetIndex,
        false,
        false
      );

      if (motionPath) {
        motionPath.addTo(map);
        pathLayers.push(motionPath);
        motionPaths.set(targetIndex, motionPath);

        motionPath.motionStart();
      }
    }
  }
}

/**
 * 更新事件标记
 */
function updateEventMarkers(targetIndex) {
  eventMarkers.forEach((marker) => map.removeLayer(marker));
  eventMarkers = [];
  locationMarkers.clear();

  locationGroups = groupEventsByLocation(trajectoryData.events, targetIndex);

  const currentEvent = trajectoryData.events[targetIndex];
  const currentCoordKey = currentEvent.endCoords
    ? `${currentEvent.endCoords[0]},${currentEvent.endCoords[1]}`
    : null;

  locationGroups.forEach((locationGroup, coordKey) => {
    const isCurrent = coordKey === currentCoordKey;
    const isVisited = !isCurrent;

    const marker = createLocationMarker(locationGroup, isCurrent, isVisited);

    if (marker) {
      marker.addTo(map);
      eventMarkers.push(marker);
      locationMarkers.set(coordKey, marker);
    }
  });

  setTimeout(() => {
    ensureMarkersInteractivity();
  }, 100);
}

/**
 * 确保标记交互性正常工作
 */
function ensureMarkersInteractivity() {
  eventMarkers.forEach((marker) => {
    if (marker._icon) {
      const zIndex = Math.abs(parseInt(marker._icon.style.zIndex) || 0) || 1000;
      marker._icon.style.zIndex = zIndex;

      marker._icon.style.pointerEvents = "auto";
      marker._icon.style.cursor = "pointer";

      if (!marker._hasInteractivityEnsured) {
        marker._hasInteractivityEnsured = true;

        const originalOnClick = marker._originalClickHandler;
        if (originalOnClick) {
          marker.off("click");
          marker.on("click", originalOnClick);
        }
      }
    }
  });

  if (map && map.invalidateSize) {
    map.invalidateSize({
      animate: false,
      pan: false,
    });
  }
}

// ==================== 动画控制 ====================
/**
 * 显示指定索引的事件
 */
function showEventAtIndex(index, animated = true, isUserDrag = false) {
  if (!trajectoryData || index >= trajectoryData.events.length || index < 0)
    return;
  if (animationConfig.isAnimating && !isUserDrag) return;

  const isMovingForward = index > currentEventIndex;
  const isMovingBackward = index < currentEventIndex;

  previousEventIndex = currentEventIndex;
  currentEventIndex = index;
  const event = trajectoryData.events[index];

  if (animated && (isMovingForward || isMovingBackward)) {
    animationConfig.isAnimating = true;
    setTimeout(() => {
      animationConfig.isAnimating = false;
    }, animationConfig.pathDuration + 100);
  }

  updateCurrentEventInfo(event);
  updateProgress();
  updateEventMarkers(index);

  if (animated && (isMovingForward || isMovingBackward)) {
    updatePathsAnimated(index, isMovingBackward);
  } else {
    updatePathsStatic(index);
  }

  if (isCameraFollowEnabled) {
    handleCameraFollow(event, previousEventIndex, animated);
  }

  if (animated) {
    setTimeout(() => {
      ensureMarkersInteractivity();
    }, animationConfig.pathDuration + 100);
  }
}

// ==================== 镜头跟随控制 ====================
/**
 * 处理镜头跟随逻辑
 */
function handleCameraFollow(currentEvent, previousIndex, animated = true) {
  if (!currentEvent) return;

  const bounds = calculatePathBounds(currentEvent, previousIndex);
  if (bounds && bounds.isValid()) {
    const panOptions = {
      animate: animated,
      duration: animated ? animationConfig.cameraFollowDuration / 1000 : 0, // 镜头时长
      paddingTopLeft: [50, 50],
      paddingBottomRight: [50, 100],
      maxZoom: 8,
      easeLinearity: 0.5,
    };

    map.fitBounds(bounds, panOptions);
  } else if (currentEvent.endCoords) {
    const [lng, lat] = currentEvent.endCoords;
    const panOptions = {
      animate: animated,
      duration: animated ? animationConfig.cameraPanDuration / 1000 : 0, // 平移时长
      easeLinearity: 0.5,
    };
    map.setView([lat, lng], Math.max(map.getZoom(), 6), panOptions);
  }
}

/**
 * 计算路径边界框
 */
function calculatePathBounds(currentEvent, previousIndex) {
  const coordinates = [];

  if (previousIndex >= 0 && trajectoryData.events[previousIndex]) {
    const prevEvent = trajectoryData.events[previousIndex];
    if (prevEvent.endCoords) {
      coordinates.push([prevEvent.endCoords[1], prevEvent.endCoords[0]]);
    }
  }

  if (currentEvent.startCoords) {
    coordinates.push([
      currentEvent.startCoords[1],
      currentEvent.startCoords[0],
    ]);
  }

  if (currentEvent.transitCoords && currentEvent.transitCoords.length > 0) {
    currentEvent.transitCoords.forEach((coords) => {
      if (coords && coords.length === 2) {
        coordinates.push([coords[1], coords[0]]);
      }
    });
  }

  if (currentEvent.endCoords) {
    coordinates.push([currentEvent.endCoords[1], currentEvent.endCoords[0]]);
  }

  if (coordinates.length === 1) {
    const [lat, lng] = coordinates[0];
    const offset = 0.1;
    coordinates.push([lat + offset, lng + offset]);
    coordinates.push([lat - offset, lng - offset]);
  }

  if (coordinates.length >= 2) {
    try {
      return L.latLngBounds(coordinates);
    } catch (error) {
      console.warn("计算边界框失败:", error);
      return null;
    }
  }

  return null;
}

/**
 * 切换镜头跟随状态
 */
function toggleCameraFollow() {
  isCameraFollowEnabled = !isCameraFollowEnabled;
  updateCameraFollowUI();

  try {
    localStorage.setItem(
      "cameraFollowEnabled",
      isCameraFollowEnabled.toString()
    );
  } catch (error) {
    console.warn("无法保存镜头跟随设置:", error);
  }
}

/**
 * 更新镜头跟随UI状态
 */
function updateCameraFollowUI() {
  const cameraSwitch = document.getElementById("camera-follow-switch");
  const cameraStatus = document.getElementById("camera-follow-status");

  if (cameraSwitch) {
    if (isCameraFollowEnabled) {
      cameraSwitch.classList.add("active");
    } else {
      cameraSwitch.classList.remove("active");
    }
  }

  if (cameraStatus) {
    cameraStatus.textContent = isCameraFollowEnabled ? "开启" : "关闭";
  }
}

/**
 * 初始化镜头跟随控制
 */
function initCameraFollowControl() {
  try {
    const saved = localStorage.getItem("cameraFollowEnabled");
    if (saved !== null) {
      isCameraFollowEnabled = saved === "true";
    }
  } catch (error) {
    console.warn("无法读取镜头跟随设置:", error);
  }

  const cameraSwitch = document.getElementById("camera-follow-switch");
  if (cameraSwitch) {
    cameraSwitch.addEventListener("click", toggleCameraFollow);
  }

  updateCameraFollowUI();
}

// ==================== 路径高亮功能 ====================
/**
 * 高亮指定事件的路径
 */
function highlightEventPath(eventIndex) {
  if (
    !trajectoryData ||
    eventIndex < 0 ||
    eventIndex >= trajectoryData.events.length
  ) {
    return;
  }

  clearPathHighlight();

  const motionPath = motionPaths.get(eventIndex);

  if (motionPath && motionPath._map) {
    const originalStyle = {
      color: motionPath.options.color,
      weight: motionPath.options.weight,
      opacity: motionPath.options.opacity,
      dashArray: motionPath.options.dashArray,
    };

    motionPath.setStyle({
      color: "#e74c3c",
      weight: 5,
      opacity: 0.9,
      dashArray: "10, 0",
    });

    motionPath.motionStart();

    highlightedPaths.push({
      path: motionPath,
      originalStyle: originalStyle,
    });

    currentHighlightedEventIndex = eventIndex;

    if (highlightTimeout) {
      clearTimeout(highlightTimeout);
    }

    highlightTimeout = setTimeout(() => {
      clearPathHighlight();
    }, 4000);

    // 聚焦到路径
    if (motionPath.getBounds && isCameraFollowEnabled) {
      try {
        const bounds = motionPath.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 8,
            animate: true,
            duration: animationConfig.cameraFollowDuration / 1000, // 镜头时长
            easeLinearity: 0.5,
          });
        }
      } catch (error) {
        console.warn("聚焦路径失败:", error);
      }
    }
  }
}

/**
 * 清除路径高亮
 */
function clearPathHighlight() {
  if (highlightTimeout) {
    clearTimeout(highlightTimeout);
    highlightTimeout = null;
  }

  highlightedPaths.forEach(({ path, originalStyle }) => {
    if (path && path._map) {
      try {
        path.setStyle(originalStyle);
        path.motionStart();
      } catch (error) {
        console.warn("恢复路径样式失败:", error);
      }
    }
  });

  highlightedPaths = [];
  currentHighlightedEventIndex = -1;
}

/**
 * 快速清除路径高亮
 */
function quickClearPathHighlight() {
  if (highlightTimeout) {
    clearTimeout(highlightTimeout);
    highlightTimeout = null;
  }

  highlightedPaths.forEach(({ path, originalStyle }) => {
    if (path && path._map) {
      try {
        path.setStyle({
          ...originalStyle,
          opacity: originalStyle.opacity * 0.3,
        });

        setTimeout(() => {
          if (path && path._map) {
            path.setStyle(originalStyle);
            path.motionStart();
          }
        }, 200);
      } catch (error) {
        console.warn("快速清除路径高亮失败:", error);
      }
    }
  });

  highlightedPaths = [];
  currentHighlightedEventIndex = -1;
}

// ==================== UI更新 ====================
/**
 * 更新当前事件信息显示
 */
function updateCurrentEventInfo(event) {
  const pcElements = {
    "event-date": event.date,
    "event-title": event.event,
    "event-location": event.endLocation,
    "current-age": event.age,
  };

  Object.entries(pcElements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });

  const mobileElements = {
    "event-date-mobile": event.date,
    "event-title-mobile": event.event,
    "event-location-mobile": event.endLocation,
    "current-age-mobile": event.age,
  };

  Object.entries(mobileElements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

/**
 * 更新进度信息
 */
function updateProgress() {
  const progress = trajectoryData
    ? ((currentEventIndex + 1) / trajectoryData.events.length) * 100
    : 0;

  const mobileElements = {
    "current-progress-mobile": progress.toFixed(1) + "%",
    "current-event-index-mobile": currentEventIndex + 1,
  };

  Object.entries(mobileElements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });

  const desktopElements = {
    "current-progress-desktop": progress.toFixed(1) + "%",
    "current-event-index-desktop": currentEventIndex + 1,
    "current-age-desktop": trajectoryData.events[currentEventIndex].age,
  };

  Object.entries(desktopElements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });

  const slider = document.getElementById("timeline-slider");
  if (slider && !slider.matches(":active")) {
    slider.value = currentEventIndex;
  }
}

/**
 * 更新统计数据
 */
function updateStatistics() {
  if (!trajectoryData || !trajectoryData.events) return;

  const events = trajectoryData.events;
  const movementEvents = events.filter(
    (e) => e.movementType !== "出生" && e.movementType !== "原地活动"
  );
  const internationalEvents = events.filter(
    (e) => e.movementType === "国际移动"
  );

  const visitedPlaces = new Set();
  events.forEach((event) => {
    if (event.endLocation) {
      let location = event.endLocation;
      if (location.includes("省")) {
        location = location.split("省")[0] + "省";
      } else if (location.includes("市")) {
        location = location.split("市")[0] + "市";
      }
      visitedPlaces.add(location);
    }
  });

  const startYear = parseInt(events[0].date.split("-")[0]);
  const endYear = parseInt(events[events.length - 1].date.split("-")[0]);
  const timeSpan = endYear - startYear;

  const pcStats = {
    "total-events": events.length,
    "movement-count": movementEvents.length,
    "visited-places": visitedPlaces.size,
    "international-count": internationalEvents.length,
    "time-span": timeSpan + "年",
  };

  Object.entries(pcStats).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

// ==================== 播放控制 ====================
/**
 * 切换播放/暂停状态
 */
function togglePlay() {
  const btn = document.getElementById("play-btn");
  if (!btn) return;

  if (isPlaying) {
    isPlaying = false;
    if (playInterval) {
      clearTimeout(playInterval);
      playInterval = null;
    }
    btn.textContent = "▶";
    btn.title = "播放";
  } else {
    isPlaying = true;
    btn.textContent = "⏸";
    btn.title = "暂停";

    playNextEvent();
  }
}

// 递归播放下一个事件
function playNextEvent() {
  if (!isPlaying || currentEventIndex >= trajectoryData.events.length - 1) {
    if (currentEventIndex >= trajectoryData.events.length - 1) {
      isPlaying = false;
      const btn = document.getElementById("play-btn");
      if (btn) {
        btn.textContent = "▶";
        btn.title = "播放";
      }
    }
    return;
  }

  showEventAtIndex(currentEventIndex + 1, true);

  const waitTime = Math.max(
    currentPlaySpeed,
    animationConfig.pathDuration + 200
  );

  playInterval = setTimeout(() => {
    playNextEvent();
  }, waitTime);
}

/**
 * 下一个事件
 */
function nextEvent() {
  if (currentEventIndex < trajectoryData.events.length - 1) {
    showEventAtIndex(currentEventIndex + 1, true, true);
  }
}

/**
 * 上一个事件
 */
function previousEvent() {
  if (currentEventIndex > 0) {
    showEventAtIndex(currentEventIndex - 1, true, true);
  }
}

// ==================== 键盘控制 ====================
/**
 * 统一的键盘事件处理函数
 */
function handleTimelineKeydown(e) {
  if (!trajectoryData || !trajectoryData.events) return;

  let newIndex = currentEventIndex;
  let handled = false;

  switch (e.key) {
    case "ArrowLeft":
    case "ArrowDown":
      newIndex = Math.max(0, currentEventIndex - 1);
      handled = true;
      break;
    case "ArrowRight":
    case "ArrowUp":
      newIndex = Math.min(
        trajectoryData.events.length - 1,
        currentEventIndex + 1
      );
      handled = true;
      break;
    case "Home":
      newIndex = 0;
      handled = true;
      break;
    case "End":
      // 检查是否有动画正在播放
      if (isPoetryAnimationPlaying) {
        e.preventDefault();
        return;
      }
      // 不跳转，只显示诗句动画
      e.preventDefault();
      showPoetryMessage();
      return;
    case " ":
      e.preventDefault();
      togglePlay();
      return;
  }

  if (handled) {
    e.preventDefault();
    if (newIndex !== currentEventIndex) {
      showEventAtIndex(newIndex, true, true);
    }
  }
}

// ==================== 动画设置控制 ====================
/**
 * 初始化动画控制滑块
 */
function initAnimationControls() {
  const pathDurationSlider = document.getElementById("path-duration");
  const pathDurationDisplay = document.getElementById("path-duration-display");
  const cameraSpeedSlider = document.getElementById("camera-speed-slider");
  const cameraSpeedDisplay = document.getElementById("camera-speed-display");

  if (pathDurationSlider && pathDurationDisplay) {
    pathDurationSlider.value = animationConfig.pathDuration;
    pathDurationDisplay.textContent =
      (animationConfig.pathDuration / 1000).toFixed(1) + "s";

    pathDurationSlider.addEventListener("input", (e) => {
      const newDuration = parseInt(e.target.value);
      animationConfig.pathDuration = newDuration;

      if (currentPlaySpeed < newDuration) {
        currentPlaySpeed = newDuration + 500;
        updateSpeedUI();
      }

      pathDurationDisplay.textContent = (newDuration / 1000).toFixed(1) + "s";
      updateAnimationDuration(newDuration);
    });
  }

  if (cameraSpeedSlider && cameraSpeedDisplay) {
    // 从本地存储恢复设置
    let savedSpeedLevel = 1;
    try {
      const saved = localStorage.getItem("cameraSpeedLevel");
      if (saved !== null) {
        savedSpeedLevel = parseInt(saved);
        if (
          savedSpeedLevel < 0 ||
          savedSpeedLevel >= CAMERA_SPEED_LEVELS.length
        ) {
          savedSpeedLevel = 1;
        }
      }
    } catch (error) {
      console.warn("无法读取镜头速度设置:", error);
    }

    cameraSpeedSlider.value = savedSpeedLevel;
    updateCameraSpeed(savedSpeedLevel);

    cameraSpeedSlider.addEventListener("input", (e) => {
      const levelIndex = parseInt(e.target.value);
      updateCameraSpeed(levelIndex);

      try {
        localStorage.setItem("cameraSpeedLevel", levelIndex.toString());
      } catch (error) {
        console.warn("无法保存镜头速度设置:", error);
      }
    });
  }
}

/**
 * 更新镜头速度配置
 */
function updateCameraSpeed(levelIndex) {
  if (levelIndex < 0 || levelIndex >= CAMERA_SPEED_LEVELS.length) {
    console.warn("无效的镜头速度档位:", levelIndex);
    return;
  }

  const speedConfig = CAMERA_SPEED_LEVELS[levelIndex];
  const cameraSpeedDisplay = document.getElementById("camera-speed-display");

  animationConfig.cameraFollowDuration = speedConfig.cameraFollowDuration;
  animationConfig.cameraPanDuration = speedConfig.cameraPanDuration;

  if (cameraSpeedDisplay) {
    cameraSpeedDisplay.textContent = speedConfig.name;
  }

  console.log(`镜头跟随速度已调整为: ${speedConfig.name}`, {
    跟随时长: speedConfig.cameraFollowDuration + "ms",
    平移时长: speedConfig.cameraPanDuration + "ms",
  });
}

/**
 * 更新动画时长配置
 */
function updateAnimationDuration(duration) {
  document.documentElement.style.setProperty(
    "--path-animation-duration",
    duration + "ms"
  );
}

// 更新播放速度UI
function updateSpeedUI() {
  const speedSelect = document.getElementById("custom-speed-select");
  if (speedSelect) {
    speedSelect.dataset.value = currentPlaySpeed.toString();
    const selectText = speedSelect.querySelector(".select-text");
    if (selectText) {
      selectText.textContent = getSpeedLabel(currentPlaySpeed);
    }
  }
}

/**
 * 获取速度标签
 */
function getSpeedLabel(speed) {
  const speedLabels = {
    500: "极快",
    1000: "快速",
    2000: "正常",
    3000: "慢速",
    5000: "极慢",
  };
  return speedLabels[speed] || `${speed}ms`;
}

/**
 * 复制当前事件数据到剪贴板
 */
function copyCurrentEventData() {
  if (!trajectoryData || !trajectoryData.events || currentEventIndex < 0) {
    showTemporaryMessage("当前没有可复制的事件数据", "warning");
    return;
  }

  try {
    const currentEvent = trajectoryData.events[currentEventIndex];

    const cleanEventData = {
      date: currentEvent.date,
      age: currentEvent.age,
      movementType: currentEvent.movementType,
      event: currentEvent.event,
      coordinates: currentEvent.coordinates,
      verification: currentEvent.verification || "",
      userVerification: currentEvent.userVerification || [],
    };

    if (cleanEventData.userVerification.length === 0) {
      cleanEventData.userVerification = [
        {
          username: "考据者署名 (可选)",
          comment: "考据补充或感言 (可选)",
          date: "考据日期 (可选)",
        },
      ];
    }

    const jsonString = JSON.stringify(cleanEventData, null, 2);

    const formattedJson = `    ${jsonString.replace(/\n/g, "\n    ")},`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(formattedJson)
        .then(() => {
          const eventNumber = currentEventIndex + 1;
          showTemporaryMessage(
            `事件 ${eventNumber} 数据已复制到剪贴板`,
            "success"
          );
        })
        .catch(() => {
          fallbackCopyToClipboard(formattedJson);
        });
    } else {
      fallbackCopyToClipboard(formattedJson);
    }
  } catch (error) {
    console.error("复制事件数据时出错:", error);
    showTemporaryMessage("复制失败，请重试", "warning");
  }
}

/**
 * 兼容性剪贴板复制方案
 */
function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (successful) {
      const eventNumber = currentEventIndex + 1;
      showTemporaryMessage(`事件 ${eventNumber} 数据已复制到剪贴板`, "success");
    } else {
      showTemporaryMessage("复制失败，请手动选择并复制", "warning");
    }
  } catch (err) {
    console.error("传统复制方法也失败:", err);
    showTemporaryMessage("复制失败，浏览器不支持自动复制", "warning");
  }
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  const loading = document.getElementById("loading");
  if (loading) {
    loading.style.display = "none";
  }
}

// ==================== 自定义下拉选择器 ====================
/**
 * 初始化自定义速度选择器
 */
function initCustomSpeedSelect() {
  const customSelect = document.getElementById("custom-speed-select");
  if (!customSelect) return;

  const selectDisplay = customSelect.querySelector(".select-display");
  const selectText = customSelect.querySelector(".select-text");
  const selectDropdown = customSelect.querySelector(".select-dropdown");
  const selectOptions = customSelect.querySelectorAll(".select-option");

  let isOpen = false;

  function openDropdown() {
    if (isOpen) return;

    isOpen = true;
    customSelect.classList.add("open");

    setTimeout(() => {
      document.addEventListener("click", handleDocumentClick);
    }, 0);
  }

  function closeDropdown() {
    if (!isOpen) return;

    isOpen = false;
    customSelect.classList.remove("open");
    document.removeEventListener("click", handleDocumentClick);
  }

  function handleDocumentClick(e) {
    if (!customSelect.contains(e.target)) {
      closeDropdown();
    }
  }

  function toggleDropdown(e) {
    e.stopPropagation();
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function selectOption(option) {
    const value = option.dataset.value;
    const text = option.textContent;

    selectText.textContent = text;

    customSelect.dataset.value = value;

    selectOptions.forEach((opt) => opt.classList.remove("selected"));
    option.classList.add("selected");

    currentPlaySpeed = parseInt(value);

    if (isPlaying) {
      togglePlay();
      setTimeout(() => togglePlay(), 100);
    }

    closeDropdown();
  }

  if (selectDisplay) {
    selectDisplay.addEventListener("click", toggleDropdown);
  }

  selectOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      selectOption(option);
    });
  });

  customSelect.addEventListener("keydown", (e) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openDropdown();
      }
    } else {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
        case "ArrowUp":
          e.preventDefault();
          navigateOptions(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          navigateOptions(1);
          break;
        case "Enter":
          e.preventDefault();
          const selectedOption = selectDropdown.querySelector(
            ".select-option.selected"
          );
          if (selectedOption) {
            selectOption(selectedOption);
          }
          break;
      }
    }
  });

  function navigateOptions(direction) {
    const options = Array.from(selectOptions);
    const currentIndex = options.findIndex((opt) =>
      opt.classList.contains("selected")
    );
    let newIndex = currentIndex + direction;

    if (newIndex < 0) newIndex = options.length - 1;
    if (newIndex >= options.length) newIndex = 0;

    options.forEach((opt) => opt.classList.remove("selected"));
    options[newIndex].classList.add("selected");
  }

  customSelect.setAttribute("tabindex", "0");

  const initialValue = customSelect.dataset.value || "1000";
  const initialOption = customSelect.querySelector(
    `[data-value="${initialValue}"]`
  );
  if (initialOption) {
    selectText.textContent = initialOption.textContent;
    selectOptions.forEach((opt) => opt.classList.remove("selected"));
    initialOption.classList.add("selected");
  }
}

// ==================== 音乐播放功能 ====================
const MUSIC_PLAYLIST = [
  {
    id: "internationale",
    title: "国际歌",
    artist: "经典革命歌曲",
    duration: "04:55",
    urls: [
      // 第二个是维基百科的公共版权音乐
      "https://raw.githubusercontent.com/sansan0/mao-map/refs/heads/master/data/music/Internationale-cmn_(英特纳雄耐尔).ogg",
      "https://upload.wikimedia.org/wikipedia/commons/5/5b/Internationale-cmn_%28%E8%8B%B1%E7%89%B9%E7%BA%B3%E9%9B%84%E8%80%90%E5%B0%94%29.ogg",
    ],
  },
  {
    id: "dongfanghong",
    title: "东方红",
    artist: "经典红色歌曲",
    duration: "02:25",
    urls: [
      "https://raw.githubusercontent.com/sansan0/mao-map/refs/heads/master/data/music/东方红_-_The_East_Is_Red_(1950).ogg",
      "https://upload.wikimedia.org/wikipedia/commons/d/d8/%E4%B8%9C%E6%96%B9%E7%BA%A2_-_The_East_Is_Red_%281950%29.ogg",
    ],
  },
];

/**
 * 清理音频事件监听器
 */
function cleanupMusicEventListeners() {
  if (!musicAudio) return;

  console.log("清理音频事件监听器");

  const eventsToClean = [
    "loadedmetadata",
    "canplaythrough",
    "error",
    "loadstart",
    "loadeddata",
  ];

  eventsToClean.forEach((eventType) => {
    musicAudio.removeEventListener(eventType, () => {});
  });

  currentAudioEventListeners.clear();
}

/**
 * 等待音频准备就绪后自动播放
 */
function autoPlayWhenReady(shouldPlay = true) {
  if (!musicAudio || !shouldPlay) {
    isAutoPlayPending = false;
    return Promise.resolve(false);
  }

  isAutoPlayPending = true;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn("音频加载超时，取消自动播放");
      isAutoPlayPending = false;
      cleanup();
      resolve(false);
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      musicAudio.removeEventListener("canplaythrough", handleCanPlay);
      musicAudio.removeEventListener("loadedmetadata", handleCanPlay);
      musicAudio.removeEventListener("error", handleError);
    };

    const handleCanPlay = () => {
      cleanup();

      if (isAutoPlayPending) {
        console.log("音频准备就绪，开始自动播放");
        musicAudio
          .play()
          .then(() => {
            isMusicPlaying = true;
            startProgressUpdate();
            updatePlayButton();
            updateMusicBtnState();
            updateTimelineControlBackground();
            isAutoPlayPending = false;
            resolve(true);
          })
          .catch((error) => {
            console.warn("自动播放失败:", error);
            isAutoPlayPending = false;
            updatePlayButton();
            updateMusicBtnState();
            updateTimelineControlBackground();
            resolve(false);
          });
      } else {
        resolve(false);
      }
    };

    const handleError = (error) => {
      console.warn("音频加载出错，取消自动播放:", error);
      cleanup();
      isAutoPlayPending = false;
      resolve(false);
    };

    // 检查音频是否已经可以播放
    if (musicAudio.readyState >= 3) {
      cleanup();
      handleCanPlay();
    } else {
      musicAudio.addEventListener("canplaythrough", handleCanPlay, {
        once: true,
      });
      musicAudio.addEventListener("loadedmetadata", handleCanPlay, {
        once: true,
      });
      musicAudio.addEventListener("error", handleError, { once: true });
    }
  });
}

/**
 * 加载音频文件
 */
function loadMusicAudio(song, autoPlay = false) {
  if (!musicAudio) return Promise.resolve(false);

  console.log(`加载音频: ${song.title}, 自动播放: ${autoPlay}`);

  isAutoPlayPending = false;

  if (isMusicPlaying) {
    musicAudio.pause();
    isMusicPlaying = false;
    clearInterval(musicProgressInterval);
  }

  cleanupMusicEventListeners();

  musicAudio.currentTime = 0;
  updateMusicProgress();
  updatePlayButton();
  updateMusicBtnState();

  let urlIndex = 0;

  function tryLoadUrl() {
    return new Promise((resolve) => {
      if (urlIndex >= song.urls.length) {
        console.warn("无法加载音频文件:", song.title);
        showTemporaryMessage("无法加载音频文件，请尝试上传本地文件", "warning");
        resolve(false);
        return;
      }

      const url = song.urls[urlIndex];
      console.log("尝试加载音频:", url);

      const loadTimeoutId = setTimeout(() => {
        console.warn("音频加载超时:", url);
        handleLoadError();
      }, 8000);

      const cleanup = () => {
        clearTimeout(loadTimeoutId);
        musicAudio.removeEventListener("canplaythrough", handleLoadSuccess);
        musicAudio.removeEventListener("loadedmetadata", handleLoadSuccess);
        musicAudio.removeEventListener("error", handleLoadError);
      };

      const handleLoadSuccess = () => {
        console.log("音频加载成功:", url);
        cleanup();

        updatePlayButton();
        updateMusicBtnState();

        if (autoPlay) {
          autoPlayWhenReady(true).then((success) => {
            resolve(success);
          });
        } else {
          resolve(true);
        }
      };

      const handleLoadError = () => {
        console.warn("音频加载失败:", url);
        cleanup();
        urlIndex++;
        tryLoadUrl().then(resolve);
      };

      musicAudio.addEventListener("canplaythrough", handleLoadSuccess, {
        once: true,
      });
      musicAudio.addEventListener("loadedmetadata", handleLoadSuccess, {
        once: true,
      });
      musicAudio.addEventListener("error", handleLoadError, { once: true });

      musicAudio.src = url;
      musicAudio.volume = musicVolume;
      musicAudio.load();
    });
  }

  audioLoadingPromise = tryLoadUrl();
  return audioLoadingPromise;
}

/**
 * 播放上一首
 */
function playPreviousSong() {
  const prevIndex =
    currentMusicIndex > 0 ? currentMusicIndex - 1 : MUSIC_PLAYLIST.length - 1;
  const wasPlaying = isMusicPlaying;

  console.log(`播放上一首: 索引 ${prevIndex}, 之前在播放: ${wasPlaying}`);

  selectSong(prevIndex, wasPlaying);
}

/**
 * 播放下一首
 */
function playNextSong() {
  const nextIndex =
    currentMusicIndex < MUSIC_PLAYLIST.length - 1 ? currentMusicIndex + 1 : 0;
  const wasPlaying = isMusicPlaying;

  console.log(`播放下一首: 索引 ${nextIndex}, 之前在播放: ${wasPlaying}`);

  selectSong(nextIndex, wasPlaying);
}

/**
 * 选择歌曲
 */
function selectSong(index, autoPlay = false) {
  if (index < 0 || index >= MUSIC_PLAYLIST.length) return;

  console.log(`选择歌曲: 索引 ${index}, 自动播放: ${autoPlay}`);

  currentMusicIndex = index;
  const song = MUSIC_PLAYLIST[index];

  const titleEl = document.getElementById("current-song-title");
  const artistEl = document.getElementById("current-song-artist");

  if (titleEl) titleEl.textContent = song.title;
  if (artistEl) artistEl.textContent = song.artist;

  const playlistItems = document.querySelectorAll(".playlist-item");
  playlistItems.forEach((item, i) => {
    if (i === index) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  loadMusicAudio(song, autoPlay);
}

/**
 * 切换播放/暂停
 */
function toggleMusicPlay() {
  if (!musicAudio) return;

  if (isMusicPlaying) {
    console.log("暂停音乐播放");
    musicAudio.pause();
    isMusicPlaying = false;
    clearInterval(musicProgressInterval);
    updatePlayButton();
    updateMusicBtnState();
    updateTimelineControlBackground();
  } else {
    console.log("开始音乐播放");
    const playBtn = document.getElementById("music-play-btn");
    if (playBtn) {
      playBtn.textContent = "⏳";
      playBtn.title = "加载中...";
    }

    if (musicAudio.readyState < 3) {
      console.log("音频未准备好，等待加载...");
      autoPlayWhenReady(true);
    } else {
      console.log("音频已准备好，直接播放");
      musicAudio
        .play()
        .then(() => {
          isMusicPlaying = true;
          startProgressUpdate();
          updatePlayButton();
          updateMusicBtnState();
          updateTimelineControlBackground(); 
        })
        .catch((error) => {
          console.error("音频播放失败:", error);
          showTemporaryMessage("音频播放失败，请检查文件格式", "warning");

          isMusicPlaying = false;
          updatePlayButton();
          updateMusicBtnState();
        });
    }
  }
}

/**
 * 处理音乐播放结束
 */
function handleMusicEnded() {
  console.log("音乐播放结束，准备播放下一首");

  isMusicPlaying = false;
  clearInterval(musicProgressInterval);
  updatePlayButton();
  updateMusicBtnState();
  updateTimelineControlBackground();

  // 自动播放下一首
  setTimeout(() => {
    const nextIndex =
      currentMusicIndex < MUSIC_PLAYLIST.length - 1 ? currentMusicIndex + 1 : 0;
    selectSong(nextIndex, true);
  }, 500);
}

/**
 * 初始化音乐播放功能
 */
function initMusicPlayer() {
  const musicBtn = document.getElementById("music-btn");
  const musicModal = document.getElementById("music-modal");
  const musicBackdrop = document.getElementById("music-backdrop");
  const musicClose = document.getElementById("music-modal-close");
  const musicAudioElement = document.getElementById("music-audio");

  musicAudio = musicAudioElement;

  if (musicBtn) {
    musicBtn.addEventListener("click", showMusicModal);
  }

  if (musicClose) {
    musicClose.addEventListener("click", hideMusicModal);
  }

  if (musicBackdrop) {
    musicBackdrop.addEventListener("click", hideMusicModal);
  }

  if (musicModal) {
    musicModal.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  initMusicControls();
  initMusicPlaylist();
  initMusicUpload();
  initVolumeControl();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMusicModalVisible) {
      hideMusicModal();
    }
  });
}

/**
 * 显示音乐弹窗
 */
function showMusicModal() {
  const musicModal = document.getElementById("music-modal");
  const musicBackdrop = document.getElementById("music-backdrop");

  if (musicModal && musicBackdrop) {
    musicBackdrop.classList.add("visible");
    musicModal.classList.add("visible");
    isMusicModalVisible = true;

    document.body.style.overflow = "hidden";
  }
}

/**
 * 隐藏音乐弹窗
 */
function hideMusicModal() {
  const musicModal = document.getElementById("music-modal");
  const musicBackdrop = document.getElementById("music-backdrop");

  if (musicModal && musicBackdrop) {
    musicBackdrop.classList.remove("visible");
    musicModal.classList.remove("visible");
    isMusicModalVisible = false;

    document.body.style.overflow = "";
  }
}

/**
 * 初始化音乐播放控制
 */
function initMusicControls() {
  const playBtn = document.getElementById("music-play-btn");
  const prevBtn = document.getElementById("music-prev-btn");
  const nextBtn = document.getElementById("music-next-btn");
  const progressBar = document.querySelector(".music-progress-bar");

  if (playBtn) {
    playBtn.addEventListener("click", toggleMusicPlay);
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", playPreviousSong);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", playNextSong);
  }

  if (progressBar) {
    progressBar.addEventListener("click", handleProgressClick);
  }

  if (!musicAudio) {
    musicAudio = document.getElementById("music-audio");
  }

  // 绑定基础事件监听器（这些不会被清理）
  if (musicAudio) {
    musicAudio.addEventListener("loadedmetadata", updateMusicDuration);
    musicAudio.addEventListener("timeupdate", updateMusicProgress);
    musicAudio.addEventListener("ended", handleMusicEnded);
    musicAudio.addEventListener("error", handleMusicError);
  }
}

/**
 * 初始化播放列表
 */
function initMusicPlaylist() {
  const playlistItems = document.getElementById("music-playlist-items");

  if (!playlistItems) return;

  playlistItems.innerHTML = "";

  MUSIC_PLAYLIST.forEach((song, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "playlist-item";
    itemEl.dataset.index = index;

    itemEl.innerHTML = `
      <div class="playlist-item-info">
        <div class="playlist-item-title">${song.title}</div>
        <div class="playlist-item-artist">${song.artist}</div>
      </div>
      <div class="playlist-item-duration">${song.duration}</div>
    `;

    itemEl.addEventListener("click", () => {
      const wasPlaying = isMusicPlaying;
      selectSong(index, wasPlaying); // 如果之前在播放，则自动播放新选择的歌曲
    });

    playlistItems.appendChild(itemEl);
  });

  if (MUSIC_PLAYLIST.length > 0) {
    selectSong(0, false); // 默认选择第一首，但不自动播放
  }
}

/**
 * 更新播放按钮状态
 */
function updatePlayButton() {
  const playBtn = document.getElementById("music-play-btn");
  if (playBtn) {
    if (isMusicPlaying) {
      playBtn.textContent = "⏸";
      playBtn.title = "暂停";
    } else {
      playBtn.textContent = "▶";
      playBtn.title = "播放";
    }
  }
}

/**
 * 更新音乐按钮状态
 */
function updateMusicBtnState() {
  const musicBtn = document.getElementById("music-btn");
  if (musicBtn) {
    if (isMusicPlaying) {
      musicBtn.classList.add("playing");
    } else {
      musicBtn.classList.remove("playing");
    }
  }
}

/**
 * 开始进度更新
 */
function startProgressUpdate() {
  musicProgressInterval = setInterval(() => {
    updateMusicProgress();
  }, 1000);
}

/**
 * 更新音乐进度
 */
function updateMusicProgress() {
  if (!musicAudio || !musicAudio.duration) return;

  const currentTime = musicAudio.currentTime;
  const duration = musicAudio.duration;
  const progress = (currentTime / duration) * 100;

  const progressFill = document.getElementById("music-progress-fill");
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }

  const currentTimeEl = document.getElementById("music-current-time");
  const totalTimeEl = document.getElementById("music-total-time");

  if (currentTimeEl) {
    currentTimeEl.textContent = formatTime(currentTime);
  }

  if (totalTimeEl) {
    totalTimeEl.textContent = formatTime(duration);
  }
}

/**
 * 更新音乐总时长
 */
function updateMusicDuration() {
  if (!musicAudio || !musicAudio.duration) return;

  const totalTimeEl = document.getElementById("music-total-time");
  if (totalTimeEl) {
    totalTimeEl.textContent = formatTime(musicAudio.duration);
  }
}

/**
 * 处理进度条点击
 */
function handleProgressClick(e) {
  if (!musicAudio || !musicAudio.duration) return;

  const progressBar = e.currentTarget;
  const rect = progressBar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = x / rect.width;
  const newTime = percentage * musicAudio.duration;

  musicAudio.currentTime = newTime;
  updateMusicProgress();
}

/**
 * 处理音频错误
 */
function handleMusicError(e) {
  console.error("音频播放错误:", e);
  showTemporaryMessage("音频播放出错，请尝试其他歌曲", "warning");

  isMusicPlaying = false;
  clearInterval(musicProgressInterval);
  updatePlayButton();
  updateMusicBtnState();
  updateTimelineControlBackground(); 
}

/**
 * 格式化时间显示
 */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * 初始化音量控制
 */
function initVolumeControl() {
  const volumeSlider = document.getElementById("music-volume-slider");
  const volumeValue = document.getElementById("music-volume-value");

  if (volumeSlider) {
    volumeSlider.addEventListener("input", (e) => {
      const volume = parseInt(e.target.value) / 100;
      setMusicVolume(volume);
    });

    volumeSlider.value = musicVolume * 100;
  }

  if (volumeValue) {
    volumeValue.textContent = Math.round(musicVolume * 100) + "%";
  }
}

/**
 * 设置音乐音量
 */
function setMusicVolume(volume) {
  musicVolume = Math.max(0, Math.min(1, volume));

  if (musicAudio) {
    musicAudio.volume = musicVolume;
  }

  const volumeValue = document.getElementById("music-volume-value");
  if (volumeValue) {
    volumeValue.textContent = Math.round(musicVolume * 100) + "%";
  }

  try {
    localStorage.setItem("musicVolume", musicVolume.toString());
  } catch (error) {
    console.warn("无法保存音量设置:", error);
  }
}

/**
 * 初始化本地音乐上传
 */
function initMusicUpload() {
  const uploadBtn = document.getElementById("music-upload-btn");
  const fileInput = document.getElementById("music-file-input");

  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      fileInput?.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", handleMusicFileUpload);
  }
}

/**
 * 处理本地音乐文件上传
 */
function handleMusicFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("audio/")) {
    showTemporaryMessage("请选择有效的音频文件", "warning");
    return;
  }

  const tempUrl = URL.createObjectURL(file);

  const tempSong = {
    id: "local_" + Date.now(),
    title: file.name.replace(/\.[^/.]+$/, ""),
    artist: "本地音乐",
    duration: "未知",
    urls: [tempUrl],
    isLocal: true,
  };

  MUSIC_PLAYLIST.push(tempSong);

  initMusicPlaylist();

  selectSong(MUSIC_PLAYLIST.length - 1, false); // 选择新上传的歌曲，但不自动播放

  showTemporaryMessage("本地音乐文件添加成功", "success");

  e.target.value = "";
}

/**
 * 从本地存储恢复音乐设置
 */
function restoreMusicSettings() {
  try {
    const savedVolume = localStorage.getItem("musicVolume");
    if (savedVolume !== null) {
      musicVolume = parseFloat(savedVolume);
      setMusicVolume(musicVolume);
    }
  } catch (error) {
    console.warn("无法读取音乐设置:", error);
  }
}

/**
 * 更新时间轴控制面板背景色
 */
function updateTimelineControlBackground() {
  const timelineControl = document.getElementById('timeline-control');
  
  if (timelineControl) {
    if (isMusicPlaying) {
      timelineControl.classList.add('music-playing');
    } else {
      timelineControl.classList.remove('music-playing');
    }
  }
}

// ==================== leaflet.motion 插件检查和性能优化 ====================
/**
 * 检查 leaflet.motion 插件是否正确加载
 */
function checkMotionPlugin() {
  if (
    typeof L.motion !== "undefined" &&
    typeof L.motion.polyline === "function"
  ) {
    console.log("✅ leaflet.motion 插件加载成功");
    return true;
  } else {
    console.error("❌ leaflet.motion 插件未正确加载");
    return false;
  }
}

/**
 * 清理 motion 资源
 */
function cleanupMotionResources() {
  const allPaths = Array.from(motionPaths.values());

  if (allPaths.length > 0) {
    batchAnimatePathsDisappear(allPaths, 100)
      .then(() => {
        motionPaths.clear();
        pathLayers = [];
        animationQueue = [];
        isAnimationInProgress = false;

        console.log("Motion 资源清理完成");
      })
      .catch((error) => {
        console.warn("Motion 资源清理失败:", error);
        motionPaths.forEach((path) => {
          if (path && path._map) {
            try {
              path.motionStop();
              map.removeLayer(path);
            } catch (e) {
              console.warn("强制清理路径失败:", e);
            }
          }
        });

        motionPaths.clear();
        pathLayers = [];
        animationQueue = [];
        isAnimationInProgress = false;
      });
  } else {
    motionPaths.clear();
    animationQueue = [];
    isAnimationInProgress = false;
    console.log("Motion 资源清理完成");
  }
}

/**
 * 预加载关键路径动画
 */
function preloadKeyAnimations() {
  if (!trajectoryData || !trajectoryData.events) return;

  const keyEvents = trajectoryData.events.slice(
    0,
    Math.min(10, trajectoryData.events.length)
  );

  keyEvents.forEach((event, index) => {
    if (
      event.startCoords &&
      event.endCoords &&
      event.movementType !== "原地活动"
    ) {
      const preloadPath = createMotionPath(
        event.startCoords,
        event.endCoords,
        event.transitCoords,
        false,
        index,
        false,
        false
      );

      if (preloadPath) {
        preloadPath.addTo(map);
        preloadPath.setStyle({ opacity: 0 });

        setTimeout(() => {
          if (preloadPath._map) {
            map.removeLayer(preloadPath);
          }
        }, 100);
      }
    }
  });

  console.log("关键路径预加载完成");
}

/**
 * 优化 motion 性能配置
 */
function optimizeMotionPerformance() {
  if (!map || !map._renderer) {
    console.warn("地图未完全初始化，跳过性能优化");
    return;
  }

  try {
    const renderer = map._renderer;
    if (renderer && renderer._container) {
      const container = renderer._container;

      container.style.willChange = "transform";
      container.style.transform = "translateZ(0)";
      container.style.backfaceVisibility = "hidden";

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeName === "path" && node.getAttribute("stroke")) {
                node.style.willChange = "stroke-dashoffset";
                node.style.transform = "translateZ(0)";
              }
            });
          }
        });
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      window.motionObserver = observer;

      console.log("Motion 性能优化已启用");
    }
  } catch (error) {
    console.warn("Motion 性能优化失败:", error);
  }
}

/**
 * 动态调整 motion 参数
 */
function dynamicAdjustMotionParams() {
  const pathCount = motionPaths.size;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const isMobile = isMobileDevice();

  let durationMultiplier = 1;

  if (pathCount > 20) {
    durationMultiplier = 0.7;
  } else if (pathCount > 10) {
    durationMultiplier = 0.85;
  }

  if (isMobile) {
    durationMultiplier *= 0.8;
  }

  if (devicePixelRatio > 2) {
    durationMultiplier *= 0.9;
  }

  animationConfig.pathDuration = Math.max(
    1000,
    animationConfig.pathDuration * durationMultiplier
  );
}

/**
 * 监听性能指标
 */
function monitorMotionPerformance() {
  let frameCount = 0;
  let lastTime = Date.now();
  let isMonitoring = false;

  function measureFPS() {
    if (!isMonitoring) return;

    frameCount++;
    const currentTime = Date.now();

    if (currentTime - lastTime >= 1000) {
      const fps = frameCount;
      frameCount = 0;
      lastTime = currentTime;

      // 如果 FPS 过低，自动调整参数
      if (fps < 30 && motionPaths.size > 0) {
        console.warn("Motion 性能较低，自动调整参数");
        dynamicAdjustMotionParams();
      }

      if (motionPaths.size > 0) {
        console.log(
          `Motion 性能监控 - FPS: ${fps}, 路径数量: ${motionPaths.size}`
        );
      }
    }

    if (motionPaths.size > 0 && isMonitoring) {
      requestAnimationFrame(measureFPS);
    }
  }

  isMonitoring = true;
  if (motionPaths.size > 0) {
    requestAnimationFrame(measureFPS);
  }

  return {
    stop: () => {
      isMonitoring = false;
    },
  };
}

// ==================== 事件绑定 ====================
/**
 * 绑定所有事件监听器
 */
function bindEvents() {
  const playBtn = document.getElementById("play-btn");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  if (playBtn) playBtn.addEventListener("click", togglePlay);
  if (prevBtn) prevBtn.addEventListener("click", previousEvent);
  if (nextBtn) nextBtn.addEventListener("click", nextEvent);

  const slider = document.getElementById("timeline-slider");
  if (slider) {
    slider.addEventListener("mousedown", () => {
      isDragging = true;
      console.log("开始拖动 (mousedown)");
    });

    slider.addEventListener("touchstart", () => {
      isDragging = true;
      console.log("开始拖动 (touchstart)");
    });

    slider.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        console.log("结束拖动 (mouseup)");
        const finalIndex = parseInt(slider.value);
        if (finalIndex !== currentEventIndex) {
          showEventAtIndex(finalIndex, true, true);
        }
      }
    });

    slider.addEventListener("touchend", () => {
      if (isDragging) {
        isDragging = false;
        console.log("结束拖动 (touchend)");
        const finalIndex = parseInt(slider.value);
        if (finalIndex !== currentEventIndex) {
          showEventAtIndex(finalIndex, true, true);
        }
      }
    });

    slider.addEventListener("input", (e) => {
      if (trajectoryData) {
        const newIndex = parseInt(e.target.value);
        console.log(`滑块输入: ${newIndex}, 拖动状态: ${isDragging}`);

        if (isDragging) {
          showEventAtIndex(newIndex, false, true);
        } else {
          showEventAtIndex(newIndex, true, true);
        }
      }
    });

    slider.addEventListener("dblclick", (e) => {
      e.preventDefault();
      copyCurrentEventData();
    });

    slider.addEventListener("keydown", (e) => {
      handleTimelineKeydown(e);
    });

    slider.addEventListener("focus", () => {
      slider.style.outline = "none";
    });

    slider.addEventListener("click", () => {
      slider.focus();
    });
  }

  document.addEventListener("keydown", (e) => {
    const activeElement = document.activeElement;
    const isInputElement =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT" ||
        activeElement.contentEditable === "true");

    const detailPanel = document.getElementById("location-detail-panel");
    const isPanelVisible =
      detailPanel && detailPanel.classList.contains("visible");

    if (!isInputElement && !isPanelVisible) {
      handleTimelineKeydown(e);
    }
  });

  const speedSelect = document.getElementById("speed-select");
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => {
      currentPlaySpeed = parseInt(e.target.value);
      if (isPlaying) {
        togglePlay();
        setTimeout(() => togglePlay(), 100);
      }
    });
  }
  initCustomSpeedSelect();

  const speedBtns = document.querySelectorAll(".speed-btn");
  speedBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      speedBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPlaySpeed = parseInt(btn.dataset.speed);

      if (isPlaying) {
        togglePlay();
        setTimeout(() => togglePlay(), 100);
      }
    });
  });

  initAnimationControls();
  initStatsHover();
  initDetailPanel();
  initMobileInteractions();
  initFeedbackModal();
  initCameraFollowControl();
  initMusicPlayer();

  restoreMusicSettings();

  window.addEventListener("resize", () => {
    const mapEl = document.getElementById("map");
    if (isMobileDevice()) {
      if (isPanelVisible) {
        mapEl.classList.remove("panel-hidden");
        mapEl.classList.add("panel-visible");
      } else {
        mapEl.classList.remove("panel-visible");
        mapEl.classList.add("panel-hidden");
      }
    } else {
      mapEl.classList.remove("panel-hidden", "panel-visible");
      isPanelVisible = true;
      document.getElementById("timeline-control").classList.remove("hidden");
    }
  });
}

// ==================== 启动应用 ====================
/**
 * 修改初始化应用函数，添加插件检查
 */
async function initApp() {
  try {
    initMap();

    const motionLoaded = checkMotionPlugin();
    if (!motionLoaded) {
      throw new Error(
        "leaflet.motion 插件未正确加载，请确保已正确引入插件文件"
      );
    }

    // 等待地图完全加载
    await new Promise((resolve) => {
      if (map._loaded) {
        resolve();
      } else {
        map.on("load", resolve);
        setTimeout(resolve, 2000);
      }
    });

    const geoDataLoaded = await loadGeographicData();
    if (!geoDataLoaded) {
      throw new Error("地理数据加载失败");
    }

    trajectoryData = await loadTrajectoryData();

    if (trajectoryData && trajectoryData.events.length > 0) {
      const slider = document.getElementById("timeline-slider");
      if (slider) {
        slider.max = trajectoryData.events.length - 1;
        slider.style.transition = `all ${animationConfig.timelineDuration}ms ease`;
      }

      const totalCountEls = document.querySelectorAll(
        "[id^='total-event-count']"
      );
      totalCountEls.forEach((el) => {
        if (el) el.textContent = trajectoryData.events.length;
      });

      updateStatistics();
      showEventAtIndex(0, false);

      setTimeout(() => {
        optimizeMotionPerformance();

        if (motionLoaded) {
          preloadKeyAnimations();
        }

        const performanceMonitor = monitorMotionPerformance();
        window.motionPerformanceMonitor = performanceMonitor;
      }, 1500);
    } else {
      throw new Error("轨迹数据为空");
    }

    bindEvents();
    hideLoading();

    const mapEl = document.getElementById("map");
    if (isMobileDevice()) {
      mapEl.classList.add("panel-visible");
    }

    window.addEventListener("beforeunload", () => {
      forceStopPoetryAnimation();

      cleanupMotionResources();
      if (window.motionObserver) {
        window.motionObserver.disconnect();
      }
      if (window.motionPerformanceMonitor) {
        window.motionPerformanceMonitor.stop();
      }
    });

    console.log("leaflet.motion 插件状态:", motionLoaded ? "已加载" : "未加载");
  } catch (error) {
    console.error("应用初始化失败:", error);

    const loading = document.getElementById("loading");
    if (loading) {
      loading.innerHTML = `
        <div class="error">
          <h3>加载失败</h3>
          <p>应用初始化时出现错误，请刷新页面重试。</p>
          <p>错误信息: ${error.message}</p>
        </div>
      `;
    }
  }
}

// ==================== 启动应用 ====================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
