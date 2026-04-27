/* ============================================================================
 * app.js  ·  共享脚本（主题切换 + 导航高亮 + 通用交互）
 *
 * 引用方式：
 *   <script src="../scripts/app.js" defer></script>
 *
 * 本脚本会在所有原型页面被引用。
 * ============================================================================ */

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // 1. 主题切换（亮 / 暗 / 跟随系统）
  // --------------------------------------------------------------------------
  const STORAGE_KEY = "aitools-theme";

  /**
   * 读取已保存的主题偏好
   * @returns {"light"|"dark"|"system"}
   */
  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch (e) {
      return "system";
    }
  }

  /**
   * 应用主题到 <html data-theme="">
   * "system" 时移除该属性，由 prefers-color-scheme 接管
   */
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === "system") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore */
    }
    // 同步所有主题切换按钮的视觉
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("data-current", theme);
      btn.setAttribute("aria-label", "切换主题（当前：" + theme + "）");
    });
  }

  /**
   * 在主题 system → light → dark → system 之间循环
   */
  function cycleTheme() {
    const order = ["system", "light", "dark"];
    const current = getStoredTheme();
    const next = order[(order.indexOf(current) + 1) % order.length];
    applyTheme(next);
  }

  // 初始化主题（尽早应用，避免闪烁）
  applyTheme(getStoredTheme());

  // --------------------------------------------------------------------------
  // 2. 导航高亮（根据当前 URL 标记 .nav-item--active）
  // --------------------------------------------------------------------------
  function highlightNav() {
    const path = location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const target = el.getAttribute("data-nav");
      if (target === path) {
        el.classList.add("nav-item--active");
        el.setAttribute("aria-current", "page");
      } else {
        el.classList.remove("nav-item--active");
        el.removeAttribute("aria-current");
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. Tab 切换（用于 Skill 详情页的 [内容] [同步目标] [历史]）
  // --------------------------------------------------------------------------
  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach((group) => {
      const tabs = group.querySelectorAll(".tabs__tab");
      const panels = document.querySelectorAll(
        "[data-tab-panel='" + group.getAttribute("data-tabs") + "']"
      );
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const name = tab.getAttribute("data-tab");
          tabs.forEach((t) => {
            t.classList.toggle(
              "tabs__tab--active",
              t.getAttribute("data-tab") === name
            );
            t.setAttribute(
              "aria-selected",
              t.getAttribute("data-tab") === name ? "true" : "false"
            );
          });
          panels.forEach((p) => {
            p.hidden = p.getAttribute("data-panel") !== name;
          });
        });
      });
    });
  }

  // --------------------------------------------------------------------------
  // 4. Modal 开关
  // --------------------------------------------------------------------------
  function initModals() {
    // 打开 Modal 的触发器：[data-open-modal="modal-id"]
    document.querySelectorAll("[data-open-modal]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const id = trigger.getAttribute("data-open-modal");
        const modal = document.getElementById(id);
        if (modal) modal.hidden = false;
      });
    });

    // 关闭 Modal 的触发器：[data-close-modal]
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const closer = target.closest("[data-close-modal]");
      if (closer) {
        const overlay = closer.closest(".modal-overlay");
        if (overlay) overlay.hidden = true;
      }
      // 点击遮罩关闭
      if (target.classList.contains("modal-overlay")) {
        target.hidden = true;
      }
    });

    // Esc 关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document
          .querySelectorAll(".modal-overlay:not([hidden])")
          .forEach((m) => (m.hidden = true));
      }
    });
  }

  // --------------------------------------------------------------------------
  // 5. 主题切换按钮绑定
  // --------------------------------------------------------------------------
  function initThemeToggle() {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", cycleTheme);
    });
  }

  // --------------------------------------------------------------------------
  // 6. Toast（极简版）
  // --------------------------------------------------------------------------
  window.showToast = function (options) {
    const { title, desc, variant = "success", persist = false } = options || {};
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const iconMap = {
      success: "✓",
      warning: "⚠",
      danger: "✕",
      info: "ℹ",
    };
    const toast = document.createElement("div");
    toast.className = "toast toast--" + variant;
    toast.setAttribute(
      "role",
      variant === "danger" || variant === "warning" ? "alert" : "status"
    );
    toast.innerHTML =
      '<div class="toast__icon" aria-hidden="true" style="font-weight:700;display:flex;align-items:center;justify-content:center;">' +
      iconMap[variant] +
      "</div>" +
      '<div class="toast__body">' +
      '<p class="toast__title">' +
      title +
      "</p>" +
      (desc ? '<p class="toast__desc">' + desc + "</p>" : "") +
      "</div>" +
      '<button class="btn btn--ghost btn--icon btn--sm" aria-label="关闭" data-close-toast>×</button>';
    container.appendChild(toast);
    toast.querySelector("[data-close-toast]").addEventListener("click", () => {
      toast.remove();
    });
    if (!persist && variant !== "danger") {
      setTimeout(() => toast.remove(), 4000);
    }
  };

  // --------------------------------------------------------------------------
  // 启动
  // --------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    highlightNav();
    initTabs();
    initModals();
    initThemeToggle();
  });
})();
