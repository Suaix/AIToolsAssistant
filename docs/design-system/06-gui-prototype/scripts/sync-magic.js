/* ============================================================================
 * sync-magic.js  ·  Flow 2 同步魔法动效
 *
 * 演示"你写一次，它到处都在"的视觉化：
 *
 *   源卡片（.magic-source）
 *       ↓ 克隆出"幽灵副本"
 *       ↓ 沿抛物线飞向每个目标（.magic-target）
 *       ↓ 到达目标时触发"微弹"+ 绿色勾
 *       ↓ 目标状态徽章从灰变绿
 *
 * 总时长：约 900ms（3 个目标依次触发时为 1.2s）
 *
 * 使用方式：
 *   1. 在页面中标记一个源元素：class="magic-source" id="..."
 *   2. 在页面中标记多个目标元素：class="magic-target" data-target-name="..."
 *      目标内必须有一个 .magic-target__status 元素（会被替换为绿色勾）
 *   3. 调用 SyncMagic.run(sourceEl, targetEls)
 *
 * 引用：
 *   <script src="../scripts/sync-magic.js" defer></script>
 * ============================================================================ */

window.SyncMagic = (function () {
  "use strict";

  const DURATION_FLY = 420;   // 单个副本飞行时间
  const DURATION_BOUNCE = 240; // 目标弹动时间
  const STAGGER = 120;         // 多个目标之间的交错延迟

  /**
   * 创建一个"幽灵副本"元素（从源位置出发）
   */
  function createGhost(sourceEl) {
    const rect = sourceEl.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "magic-ghost";
    ghost.textContent = "📦";
    Object.assign(ghost.style, {
      position: "fixed",
      left: rect.left + rect.width / 2 - 20 + "px",
      top: rect.top + rect.height / 2 - 20 + "px",
      width: "40px",
      height: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "24px",
      background: "var(--color-brand-subtle)",
      color: "var(--color-brand-default)",
      border: "2px solid var(--color-brand-default)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      zIndex: "var(--z-toast, 60)",
      pointerEvents: "none",
      transform: "scale(0.6)",
      opacity: "0",
      transition:
        "transform var(--duration-fast) var(--easing-standard), opacity var(--duration-fast) var(--easing-standard)",
    });
    document.body.appendChild(ghost);
    // 下一帧触发"显现"
    requestAnimationFrame(() => {
      ghost.style.transform = "scale(1)";
      ghost.style.opacity = "1";
    });
    return ghost;
  }

  /**
   * 让幽灵副本沿抛物线飞向目标位置
   * @returns {Promise<void>}
   */
  function flyGhostTo(ghost, targetEl) {
    return new Promise((resolve) => {
      const ghostRect = ghost.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const startX = ghostRect.left + ghostRect.width / 2;
      const startY = ghostRect.top + ghostRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;

      // 抛物线控制点：在起点与终点之间，上方 60px
      const ctrlX = (startX + endX) / 2;
      const ctrlY = Math.min(startY, endY) - 60;

      const startTime = performance.now();

      function frame(now) {
        const t = Math.min((now - startTime) / DURATION_FLY, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);

        // 二次贝塞尔曲线插值
        const px =
          (1 - eased) * (1 - eased) * startX +
          2 * (1 - eased) * eased * ctrlX +
          eased * eased * endX;
        const py =
          (1 - eased) * (1 - eased) * startY +
          2 * (1 - eased) * eased * ctrlY +
          eased * eased * endY;

        // 终点前开始缩小
        const scale = t > 0.8 ? 1 - (t - 0.8) * 2 : 1;

        ghost.style.left = px - 20 + "px";
        ghost.style.top = py - 20 + "px";
        ghost.style.transform = "scale(" + scale + ")";

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          ghost.remove();
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  /**
   * 目标到达时的"微弹 + 变绿"动画
   */
  function bounceTarget(targetEl) {
    return new Promise((resolve) => {
      // 1. 整卡弹一下
      targetEl.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.04)" },
          { transform: "scale(1)" },
        ],
        {
          duration: DURATION_BOUNCE,
          easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        }
      );

      // 2. 状态徽章从 neutral/warning → success
      const statusEl = targetEl.querySelector(".magic-target__status");
      if (statusEl) {
        statusEl.classList.remove(
          "badge--neutral",
          "badge--warning",
          "badge--loading"
        );
        statusEl.classList.add("badge--success");
        statusEl.innerHTML =
          '<span class="badge__dot"></span>已同步';
      }

      setTimeout(resolve, DURATION_BOUNCE);
    });
  }

  /**
   * 主流程：把源"送到"所有目标
   * @param {Element} sourceEl
   * @param {NodeList|Element[]} targetEls
   * @returns {Promise<void>}
   */
  function run(sourceEl, targetEls) {
    if (!sourceEl) return Promise.resolve();
    const targets = Array.from(targetEls || []);
    if (targets.length === 0) return Promise.resolve();

    // 源的"闪烁"反馈
    sourceEl.animate(
      [
        { boxShadow: "0 0 0 0 var(--color-brand-default)" },
        { boxShadow: "0 0 0 12px rgba(20, 184, 166, 0)" },
      ],
      { duration: 600, easing: "ease-out" }
    );

    // 目标预置为 loading 状态
    targets.forEach((t) => {
      const statusEl = t.querySelector(".magic-target__status");
      if (statusEl) {
        statusEl.className = "badge badge--loading";
        statusEl.innerHTML =
          '<span class="badge__dot badge__dot--pulse"></span>同步中…';
      }
    });

    // 每个目标交错触发
    const promises = targets.map((target, i) => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          const ghost = createGhost(sourceEl);
          await flyGhostTo(ghost, target);
          await bounceTarget(target);
          resolve();
        }, i * STAGGER);
      });
    });

    return Promise.all(promises).then(() => {
      // 完成后全局 Toast
      if (typeof window.showToast === "function") {
        window.showToast({
          title: "同步完成",
          desc: "已送达 " + targets.length + " 个工具",
          variant: "success",
        });
      }
    });
  }

  return { run: run };
})();
