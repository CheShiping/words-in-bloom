"use client";

/* ============================================================
 * 词间日和 · Words in Bloom（考研单词版）
 * 依据逆向分析报告复刻：无后端纯静态，进度只存当前浏览器。
 * 动效分层：CSS keyframes（氛围）/ WAAPI element.animate（卡片切换）
 *          / GSAP（页面编排、导航胶囊、数字滚动、测验瞄准光标）
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const STORAGE_KEY = "wordsInBloomData";
const THEME_KEY = "wordsInBloomTheme";
const BOOK_KEY = "wordsInBloomBook";
const PAGE_SIZE = 60;
const CARD_SWITCH_EXIT_MS = 50;
const CARD_SWITCH_ENTER_MS = 70;
const REVIEW_STAGE_HOURS = [4, 24, 72, 168, 336, 720];
const PAGES = [
  ["home", "首页", "⌂"],
  ["library", "词典库", "册"],
  ["study", "沉浸学习", "◎"],
  ["flash", "记忆卡片", "▭"],
  ["quiz", "记忆测试", "✓"],
  ["favorites", "收藏夹", "♡"],
];
const STATUS_LABEL = { new: "未学", learning: "学习中", review: "待复习", mastered: "已掌握" };

/* ---------- 小工具 ---------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shuffleWith = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
const shuffled = (list, seed = Date.now() >>> 0) => {
  const rand = shuffleWith(seed);
  const out = [...list];
  // Fisher–Yates：等概率洗牌（原 sort(() => rand() - .5) 有偏）
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const dayKey = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const beijingParts = () => {
  const fmt = (opts) =>
    new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, ...opts });
  const date = fmt({ year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const time = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  const m = date.match(/^(.+)(星期.)$/);
  return { date: m ? `${m[1]} · ${m[2]}` : date, time };
};

/* ---------- 用户数据 ---------- */
const defaultUserData = () => ({
  v: 1,
  words: {}, // id -> { status, favorite, reviewAt, correctStreak }
  dates: [],
  lastWordId: null,
  studyCollectionId: "all",
  motion: true,
  quizCursor: true,
  // duration = 专注时长，breakDuration = 休息时长：两者不可共用，否则专注时长会被休息的 5 分钟污染
  pomodoro: { duration: 25, breakDuration: 5, remaining: 1500, running: false, mode: "focus", endsAt: null },
});
const loadLocalUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUserData();
    const parsed = JSON.parse(raw);
    return { ...defaultUserData(), ...parsed, pomodoro: { ...defaultUserData().pomodoro, ...(parsed.pomodoro || {}) } };
  } catch {
    return defaultUserData();
  }
};
const wordState = (user, id) => user.words[id] || {};
const withStatus = (user, word) => {
  const ws = user.words[word.id];
  return {
    ...word,
    status: ws?.status || "new",
    favorite: !!ws?.favorite,
    reviewAt: ws?.reviewAt || null,
    correctStreak: ws?.correctStreak || 0,
  };
};
const touchDate = (user) => {
  const key = dayKey();
  return user.dates.includes(key) ? user : { ...user, dates: [...user.dates.slice(-400), key] };
};
const streakDays = (dates) => {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let days = 0;
  while (set.has(dayKey(cursor))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
};
const mulberryHash = (id, seed) => {
  let t = (id * 374761393 + seed * 668265263) >>> 0;
  t = (t ^ (t >>> 13)) >>> 0;
  t = Math.imul(t, 1274126177) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};

/* ---------- 筛选 ---------- */
function applyFilters(words, filters, { favoriteOnly = false } = {}) {
  const kw = (filters.keyword || "").trim().toLowerCase();
  let list = words.filter((w) => {
    if (favoriteOnly && !w.favorite) return false;
    if (filters.collection && filters.collection !== "all" && w.collectionId !== filters.collection) return false;
    if (filters.category && filters.category !== "all" && w.category !== filters.category) return false;
    if (filters.status && filters.status !== "all") {
      if (filters.status === "favorite" ? !w.favorite : w.status !== filters.status) return false;
    }
    if (kw && !(w.word.toLowerCase().includes(kw) || w.meaning.toLowerCase().includes(kw))) return false;
    return true;
  });
  if (filters.sort === "alpha") list = [...list].sort((a, b) => a.word.localeCompare(b.word));
  else if (filters.sort === "random") list = [...list].sort((a, b) => mulberryHash(a.id, filters.seed) - mulberryHash(b.id, filters.seed));
  else if (filters.sort === "review")
    list = [...list].sort((a, b) => (a.reviewAt || Infinity) - (b.reviewAt || Infinity));
  else if (filters.sort === "favorite") list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return list;
}

/* ---------- 花瓣粒子层（确定性播种 + CSS 变量） ---------- */
function petalNoise(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function usePetalLayers(motionEnabled) {
  const backRef = useRef(null);
  const midRef = useRef(null);
  const frontRef = useRef(null);
  useEffect(() => {
    const fields = [
      [backRef.current, 12, 8, 16, 0.18, 0.34, 16, 29, 0],
      [midRef.current, 8, 12, 23, 0.3, 0.56, 13, 23, 1],
      [frontRef.current, 4, 20, 37, 0.44, 0.76, 11, 19, 2],
    ];
    if (!motionEnabled) {
      fields.forEach(([field]) => field && (field.innerHTML = ""));
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = window.innerWidth <= 700 || window.matchMedia("(pointer: coarse)").matches;
    const scale = reduced ? [0.25, 0.25, 0.25] : compact ? [0.5, 0.5, 0.5] : [1, 1, 1];
    fields.forEach(([field, count, minSize, maxSize, minOpa, maxOpa, minDur, maxDur, layer], i) => {
      if (!field) return;
      const frag = document.createDocumentFragment();
      const n = Math.max(1, Math.round(count * scale[i]));
      for (let index = 0; index < n; index++) {
        const seed = index + layer * 41;
        const size = minSize + petalNoise(seed, 1) * (maxSize - minSize);
        const duration = minDur + petalNoise(seed, 2) * (maxDur - minDur);
        const wind = -8 + petalNoise(seed, 3) * 16;
        const petal = document.createElement("i");
        petal.className = "petal";
        const style = petal.style;
        style.setProperty("--petal-x", `${1 + petalNoise(seed, 4) * 98}%`);
        style.setProperty("--petal-static-y", `${4 + petalNoise(seed, 5) * 90}%`);
        style.setProperty("--petal-size", `${size.toFixed(1)}px`);
        style.setProperty("--petal-height", `${(size * 1.44).toFixed(1)}px`);
        style.setProperty("--petal-opacity", (minOpa + petalNoise(seed, 6) * (maxOpa - minOpa)).toFixed(2));
        style.setProperty("--petal-duration", `${duration.toFixed(2)}s`);
        style.setProperty("--petal-delay", `${(-petalNoise(seed, 7) * duration).toFixed(2)}s`);
        style.setProperty("--petal-wind-a", `${(wind * 0.58 + petalNoise(seed, 8) * 4).toFixed(2)}vw`);
        style.setProperty("--petal-wind-b", `${(-wind * 0.34 + petalNoise(seed, 9) * 5 - 2.5).toFixed(2)}vw`);
        style.setProperty("--petal-wind-c", `${(wind + petalNoise(seed, 10) * 6 - 3).toFixed(2)}vw`);
        frag.append(petal);
      }
      field.replaceChildren(frag);
    });
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.dispatchEvent(new Event("petal-resync")), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [motionEnabled]);
  return { backRef, midRef, frontRef };
}

/* ---------- 数字滚动（IntersectionObserver + GSAP，周期号防重播） ---------- */
function CountUp({ value, suffix = "" }) {
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const render = (v) => (el.textContent = Math.round(v).toLocaleString("en-US") + suffix);
    if (started.current && started.current.key === value) return;
    started.current = { key: value };
    const start = value > 50 ? Math.max(0, value - Math.max(18, value * 0.24)) : 0;
    if (prefersReducedMotion()) {
      render(value);
      return;
    }
    const counter = { v: start };
    render(start);
    gsap.to(counter, {
      v: value,
      duration: 1,
      ease: "power3.out",
      onUpdate: () => render(counter.v),
      onComplete: () => render(value),
    });
  }, [value, suffix]);
  return <b className="home-count" ref={ref}>0{suffix}</b>;
}

/* ---------- WAAPI 卡片横向切换（50ms 出 / 70ms 入） ----------
 * 规则（设计系统 §7.2）：
 * 1. 离场：50ms，方向由手势决定，位移 = max(34px, 卡宽 × .08)；
 * 2. 提交必须同步（flushSync），否则旧卡卸载与新卡挂载之间会空一帧并「弹出」；
 * 3. 入场零位移、不区分方向 —— 带横向位移的入场会撑大 scrollWidth、冒出横向滚动条；
 * 4. from：手势跟手留下的位移与透明度，离场动画从该位置接续，不跳变。
 */
async function switchCard(getCurrent, commit, direction, isActivePage, from = null) {
  const current = getCurrent();
  if (!current || !current.animate || document.body.classList.contains("no-motion") || prefersReducedMotion()) {
    commit();
    return;
  }
  const travel = Math.max(34, (current.offsetWidth || 0) * 0.08);
  const exitX = direction > 0 ? -travel : travel;
  const startX = from?.offset || 0;
  const startOpacity = from?.opacity ?? 1;
  current.style.pointerEvents = "none";
  const exit = current.animate(
    [
      { opacity: startOpacity, transform: `translate3d(${startX}px,0,0) scale(1)` },
      { opacity: 0, transform: `translate3d(${exitX}px,0,0) scale(0.985)` },
    ],
    { duration: CARD_SWITCH_EXIT_MS, easing: "cubic-bezier(0.4,0,0.65,1)", fill: "forwards" },
  );
  try {
    await exit.finished.catch(() => {});
    if (!isActivePage()) return;
    /* 取消离场动画：fill:forwards 会把元素永久停在 opacity:0。
       DOM 被复用时（记忆卡片的 .flip-scene 无 key）新内容会继承这份残留 → 整张卡变透明。
       cancel 与 commit 在同一 tick 内完成，浏览器不会绘制中间帧。 */
    exit.cancel();
    /* 同步提交：DOM 更新与状态提交在同一帧内完成，杜绝空帧 */
    flushSync(() => commit());
    const incoming = getCurrent();
    if (!incoming) return;
    incoming.animate(
      [
        { opacity: 0, transform: "scale(0.985)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: CARD_SWITCH_ENTER_MS, easing: "cubic-bezier(0.2,0.72,0.25,1)" },
    );
  } finally {
    const el = getCurrent();
    if (el) el.style.pointerEvents = "";
  }
}

/* ---------- 滑动手势（设计系统 §7.3） ----------
 * 起手：|dx| ≥ 10px 且 |dx| > |dy|（此前不锁定方向，纵向仍走原生滚动）
 * 提交：卡片 56px / 整页 72px，且 |dx| > |dy|
 * 跟手：dx × .55；旋转 damp × .03deg；透明度下限 .45（1 − |dx|/1100）
 * 回弹：.24s cubic-bezier(.22,1,.36,1)；提交后归位并由离场动画接续
 * 防冲突：卡片手势后 400ms 内不触发翻页；滑动后 400ms 截断补发 click
 */
function useSwipeDeck({ targetRef, onSwipe, threshold = 56, enabled = true, guardRef, shouldStart }) {
  const drag = useRef(null);
  const lastActiveAt = useRef(0);
  const resolve = useCallback(
    () => (typeof targetRef === "function" ? targetRef() : targetRef?.current),
    [targetRef],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (shouldStart && !shouldStart(e)) return;
      const el = resolve();
      if (!el) return;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, active: false, el };
    },
    [enabled, resolve, shouldStart],
  );

  const onPointerMove = useCallback(
    (e) => {
      const st = drag.current;
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x0;
      const dy = e.clientY - st.y0;
      if (!st.active) {
        if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
        st.active = true;
        lastActiveAt.current = Date.now();
        if (guardRef) guardRef.current = Date.now();
        document.body.classList.add("swiping-x");
        try {
          st.el.setPointerCapture(e.pointerId);
        } catch {}
      }
      st.dx = dx;
      st.dy = dy;
      const damp = dx * 0.55;
      const rot = damp * 0.03;
      const opacity = Math.max(0.45, 1 - Math.abs(dx) / 1100);
      st.el.style.transform = `translate3d(${damp}px, 0, 0) rotate(${rot}deg)`;
      st.el.style.opacity = String(opacity);
    },
    [guardRef],
  );

  const settle = useCallback(
    (e) => {
      const st = drag.current;
      drag.current = null;
      document.body.classList.remove("swiping-x");
      if (!st || !st.active) return;
      const el = st.el;
      const { dx, dy } = st;
      const passed = Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
      const damp = dx * 0.55;
      const opacity = Math.max(0.45, 1 - Math.abs(dx) / 1100);
      if (passed) {
        // 提交：交还位移与透明度，由离场动画从当前位置接续
        el.style.transform = "";
        el.style.opacity = "";
        onSwipe?.({ direction: dx < 0 ? 1 : -1, offset: damp, opacity, dx });
        return;
      }
      // 未提交：回弹
      const fromTransform = el.style.transform || "translate3d(0,0,0) scale(1)";
      const fromOpacity = el.style.opacity || "1";
      const anim = el.animate(
        [
          { transform: fromTransform, opacity: Number(fromOpacity) },
          { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
        ],
        { duration: 240, easing: "cubic-bezier(0.22,1,0.36,1)" },
      );
      anim.finished
        .catch(() => {})
        .finally(() => {
          el.style.transform = "";
          el.style.opacity = "";
        });
    },
    [onSwipe, threshold],
  );

  const onPointerUp = settle;
  const onPointerCancel = settle;

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, lastActiveAt };
}

/* ============================================================
 * 主组件
 * ============================================================ */export default function BloomApp() {
  const [catalog, setCatalog] = useState(null);
  const [bootError, setBootError] = useState("");
  const [user, setUser] = useState(defaultUserData);
  const [page, setPage] = useState("home");
  const [modalOpen, setModalOpen] = useState(false);
  const [clock, setClock] = useState({ date: "", time: "--:--:--" });
  const [, setTick] = useState(0); // 番茄钟/时钟每秒重绘
  const [showTop, setShowTop] = useState(false);
  const [theme, setTheme] = useState("light");
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [bookFirstVisit, setBookFirstVisit] = useState(false);
  const [pickedCollection, setPickedCollection] = useState("");

  const [lib, setLib] = useState({ collection: "all", category: "all", status: "all", sort: "original", keyword: "", seed: 1, page: 0 });
  const [flash, setFlash] = useState({ collection: "all", status: "all", sort: "original", seed: 1, index: 0, flipped: false });
  const [quizSetup, setQuizSetup] = useState({ collection: "all", category: "all", status: "all", count: 20 });
  const [quiz, setQuiz] = useState(null);

  const loadedRef = useRef(false);
  const pageDirRef = useRef(0);
  const cardSwipeAtRef = useRef(0);
  const [userLoaded, setUserLoaded] = useState(false);
  const sectionRefs = useRef({});
  const quizCursorRef = useRef(null);
  const motionEnabled = user.motion !== false;

  /* ---- 词库加载（对应原站 /api/catalog，这里改为静态 JSON） ---- */
  useEffect(() => {
    let alive = true;
    fetch(`${BASE_PATH}/data/catalog.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload) => alive && setCatalog({ collections: payload.collections, words: payload.words }))
      .catch((err) => alive && setBootError(String(err.message || err)));
    return () => {
      alive = false;
    };
  }, []);

  /* ---- 本地持久化 ---- */
  useEffect(() => {
    setUser(loadLocalUser());
    loadedRef.current = true;
    setUserLoaded(true);
  }, []);
  useEffect(() => {
    if (loadedRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } catch {}
    }
  }, [user]);

  const patchUser = useCallback((fn) => setUser((prev) => fn(prev)), []);

  /* ---- 全局 body 状态 ---- */
  useEffect(() => {
    document.body.dataset.page = page;
  }, [page]);
  useEffect(() => {
    document.body.classList.toggle("motion-enabled", motionEnabled);
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);

  /* ---- 主题：首帧脚本已写入 data-theme，这里只负责回写状态与切换 ---- */
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);
  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const onVis = () => document.body.classList.toggle("page-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ---- 北京时间时钟 + 每秒 tick ---- */
  useEffect(() => {
    setClock(beijingParts());
    const timer = setInterval(() => {
      setClock(beijingParts());
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---- 返回顶部按钮 ---- */
  useEffect(() => {
    let frame = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        setShowTop(window.scrollY > 500);
        frame = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- 花瓣 ---- */
  const petals = usePetalLayers(motionEnabled);

  /* ---- 页面切换（dir：1 下一段 / -1 上一段 / 0 点击导航） ---- */
  const navigate = useCallback((next, dir = 0) => {
    pageDirRef.current = dir;
    setPage(next);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  /* ---- 首访选书：弹框不可关闭；选定后软重启并回首页 ---- */
  useEffect(() => {
    if (!catalog || !userLoaded) return;
    let chosen = "";
    try {
      chosen = localStorage.getItem(BOOK_KEY) || "";
    } catch {}
    if (!chosen && user.studyCollectionId !== "all") chosen = user.studyCollectionId;
    if (chosen) {
      setPickedCollection(chosen);
      return;
    }
    setBookFirstVisit(true);
    setBookPickerOpen(true);
  }, [catalog, userLoaded, user.studyCollectionId]);

  const confirmBook = useCallback(() => {
    if (!pickedCollection) return;
    try {
      localStorage.setItem(BOOK_KEY, pickedCollection);
    } catch {}
    patchUser((prev) => ({ ...prev, studyCollectionId: pickedCollection, lastWordId: null }));
    setBookPickerOpen(false);
    setBookFirstVisit(false);
    navigate("home");
  }, [pickedCollection, patchUser, navigate]);
  useEffect(() => {
    const el = sectionRefs.current[page];
    if (!el || page === "library" || !motionEnabled) return;
    if (prefersReducedMotion()) return;
    const dir = pageDirRef.current;
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { autoAlpha: 0, x: dir * 48, y: dir ? 0 : 34, scale: 0.985, filter: "blur(8px)" },
      { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", duration: 0.72, ease: "power3.out", clearProps: "transform,filter" },
    );
  }, [page, catalog, motionEnabled]);

  /* ---- 首访顶栏入场（timeline + clipPath 揭幕，每会话一次） ---- */
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("wordsInBloomNavigationIntro") === "1";
    } catch {}
    if (seen || !motionEnabled) return;
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(".topbar", { autoAlpha: 0, y: -24, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.72, clearProps: "transform" })
      .fromTo(".topbar .brand", { scale: 0, rotate: -8 }, { scale: 1, rotate: 0, duration: 0.58, ease: "back.out(1.8)" }, 0.1)
      .fromTo("#topNav", { clipPath: "inset(0 100% 0 0 round 18px)", x: -12 }, { clipPath: "inset(0 0% 0 0 round 18px)", x: 0, duration: 0.76 }, 0.18)
      .fromTo(".topbar .tools", { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.5 }, 0.32);
    try {
      sessionStorage.setItem("wordsInBloomNavigationIntro", "1");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 导航胶囊聚光灯（几何反解拱形圆 + 双层文字接力） ---- */
  useEffect(() => {
    const nav = document.getElementById("topNav");
    if (!nav) return;
    const cleanups = [];
    nav.querySelectorAll("button").forEach((button) => {
      const circle = button.querySelector(".nav-hover-circle");
      const label = button.querySelector(".nav-label-copy");
      const hoverLabel = button.querySelector(".nav-label-hover");
      if (!circle || !label || !hoverLabel) return;
      const rect = button.getBoundingClientRect();
      const radius = ((rect.width * rect.width) / 4 + rect.height * rect.height) / (2 * rect.height);
      const diameter = Math.ceil(radius * 2) + 2;
      const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (rect.width * rect.width) / 4))) + 1;
      Object.assign(circle.style, { width: `${diameter}px`, height: `${diameter}px`, bottom: `-${delta}px` });
      const active = button.classList.contains("active");
      gsap.set(circle, { xPercent: -50, scale: active ? 1.18 : 0, transformOrigin: `50% ${diameter - delta}px` });
      gsap.set(label, { y: active ? -(rect.height + 8) : 0 });
      gsap.set(hoverLabel, { y: active ? 0 : rect.height + 12, autoAlpha: active ? 1 : 0 });
      const reduce = prefersReducedMotion();
      const enter = () => {
        if (reduce) {
          gsap.set(circle, { scale: 1.2 });
          gsap.set(label, { y: -(rect.height + 8) });
          gsap.set(hoverLabel, { y: 0, autoAlpha: 1 });
          return;
        }
        gsap.to(circle, { scale: 1.2, duration: 0.12, ease: "power3.out", overwrite: true });
        gsap.to(label, { y: -(rect.height + 8), duration: 0.11, ease: "power3.out", overwrite: true });
        gsap.to(hoverLabel, { y: 0, autoAlpha: 1, duration: 0.11, ease: "power3.out", overwrite: true });
      };
      const leave = () => {
        if (button.classList.contains("active")) return;
        if (reduce) {
          gsap.set(circle, { scale: 0 });
          gsap.set(label, { y: 0 });
          gsap.set(hoverLabel, { y: rect.height + 12, autoAlpha: 0 });
          return;
        }
        gsap.to(circle, { scale: 0, duration: 0.1, ease: "power2.out", overwrite: true });
        gsap.to(label, { y: 0, duration: 0.09, ease: "power2.out", overwrite: true });
        gsap.to(hoverLabel, { y: rect.height + 12, autoAlpha: 0, duration: 0.09, ease: "power2.out", overwrite: true });
      };
      button.addEventListener("mouseenter", enter);
      button.addEventListener("mouseleave", leave);
      button.addEventListener("focus", enter);
      button.addEventListener("blur", leave);
      cleanups.push(() => {
        button.removeEventListener("mouseenter", enter);
        button.removeEventListener("mouseleave", leave);
        button.removeEventListener("focus", enter);
        button.removeEventListener("blur", leave);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [page, catalog]);

  /* ---- 词库派生数据 ---- */
  const allWords = useMemo(() => (catalog ? catalog.words.map((w) => withStatus(user, w)) : []), [catalog, user]);
  const categories = useMemo(
    () => (catalog ? [...new Set(catalog.words.map((w) => w.category))].sort((a, b) => a.localeCompare(b, "zh")) : []),
    [catalog],
  );
  const stats = useMemo(() => {
    const total = allWords.length;
    const mastered = allWords.filter((w) => w.status === "mastered").length;
    const learning = allWords.filter((w) => w.status === "learning").length;
    const review = allWords.filter((w) => w.status === "review").length;
    // 到期：已标记待复习且复习时间已到（reviewAt 为空表示随时可复习）
    const due = allWords.filter((w) => w.status === "review" && (!w.reviewAt || w.reviewAt <= Date.now())).length;
    const favorites = allWords.filter((w) => w.favorite).length;
    const learned = total - allWords.filter((w) => w.status === "new").length;
    return {
      total,
      collections: catalog?.collections.length || 0,
      mastered,
      learning,
      review,
      due,
      favorites,
      learned,
      percent: total ? Math.round((learned / total) * 100) : 0,
      streak: streakDays(user.dates),
    };
  }, [allWords, catalog, user.dates]);

  /* ---- 各词集学习进度（选书弹窗与路径卡复用） ---- */
  const collectionProgress = useMemo(() => {
    const map = new Map();
    (catalog?.collections || []).forEach((c) => map.set(c.id, { learned: 0, total: c.wordCount || 0 }));
    allWords.forEach((w) => {
      const entry = map.get(w.collectionId);
      if (entry && w.status !== "new") entry.learned += 1;
    });
    return map;
  }, [catalog, allWords]);

  /* ---- 学习行为 ---- */
  const setWordState = useCallback(
    (id, patch, { touch = true } = {}) =>
      patchUser((prev) => {
        const next = touch ? touchDate(prev) : prev;
        const ws = next.words[id] || {};
        return { ...next, words: { ...next.words, [id]: { ...ws, ...patch } } };
      }),
    [patchUser],
  );
  const updateWordStatus = useCallback(
    (id, status) =>
      setWordState(id, {
        status,
        // 手动标记「待复习」落在首档（4h），否则手动标记后首页「待复习」计数不会变化
        reviewAt: status === "review" ? Date.now() + REVIEW_STAGE_HOURS[0] * 3600e3 : null,
        correctStreak: status === "mastered" ? 2 : 0,
      }),
    [setWordState],
  );
  const toggleFavorite = useCallback((id) => {
    const cur = user.words[id] || {};
    setWordState(id, { favorite: !cur.favorite }, { touch: false });
  }, [setWordState, user.words]);
  const markStudy = useCallback(
    (id) => {
      const ws = user.words[id] || {};
      const patch = {};
      if (!ws.status || ws.status === "new") patch.status = "learning";
      setWordState(id, patch);
      patchUser((prev) => ({ ...prev, lastWordId: id }));
    },
    [setWordState, patchUser, user.words],
  );
  const scheduleReview = useCallback(
    (id, ok) => {
      const ws = user.words[id] || {};
      if (ok) {
        const streak = (ws.correctStreak || 0) + 1;
        const mastered = streak >= 2;
        setWordState(id, {
          correctStreak: streak,
          status: mastered ? "mastered" : ws.status && ws.status !== "new" ? ws.status : "learning",
          reviewAt: mastered ? null : Date.now() + REVIEW_STAGE_HOURS[clamp(streak, 0, 5)] * 3600e3,
        });
      } else {
        setWordState(id, { correctStreak: 0, status: "review", reviewAt: Date.now() + REVIEW_STAGE_HOURS[0] * 3600e3 });
      }
    },
    [setWordState, user.words],
  );

  /* ---- 全局键盘流 ---- */
  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
        return;
      }
      // 首访选书弹框不可关闭：Esc 无效
      if (e.key === "Escape" && bookPickerOpen && !bookFirstVisit) {
        setBookPickerOpen(false);
        return;
      }
      if (typing) {
        if (e.key === "Enter" && e.target.id === "blankAnswer") document.getElementById("submitBlank")?.click();
        return;
      }
      const pool = studyPoolRef.current;
      if (page === "study" && pool?.length) {
        const idx = pool.findIndex((w) => w.id === user.lastWordId);
        const pos = idx < 0 ? 0 : idx;
        if (e.key === "ArrowLeft") moveStudyRef.current(-1);
        if (e.key === "ArrowRight") moveStudyRef.current(1);
        const current = pool[clamp(pos, 0, pool.length - 1)];
        if (current && !typing) {
          if (e.key.toLowerCase() === "m") updateWordStatus(current.id, "mastered");
          if (e.key.toLowerCase() === "r") updateWordStatus(current.id, "review");
          if (e.key.toLowerCase() === "f") toggleFavorite(current.id);
        }
      }
      if (page === "quiz" && quiz && !quiz.done) {
        if (e.key === "ArrowLeft") moveQuizRef.current(-1);
        if (e.key === "ArrowRight") nextQuestionRef.current();
      }
      if (page === "flash") {
        if (e.key === "ArrowLeft") moveFlashRef.current(-1);
        if (e.key === "ArrowRight") moveFlashRef.current(1);
        if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-flip]")) {
          e.preventDefault();
          e.target.click();
        }
      }
      /* 整页翻页：在没有自身方向键语义的页面上，← → 直接翻页 */
      if (page === "home" || page === "library" || page === "favorites") {
        const idx = PAGES.findIndex(([id]) => id === page);
        if (e.key === "ArrowLeft" && PAGES[idx - 1]) navigate(PAGES[idx - 1][0], -1);
        if (e.key === "ArrowRight" && PAGES[idx + 1]) navigate(PAGES[idx + 1][0], 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [page, quiz, modalOpen, bookPickerOpen, bookFirstVisit, user.lastWordId, updateWordStatus, toggleFavorite, navigate]);

  /* ---- 沉浸学习 ---- */
  const studyPoolRef = useRef([]);
  const moveStudyRef = useRef(() => {});
  const moveQuizRef = useRef(() => {});
  const nextQuestionRef = useRef(() => {});
  const moveFlashRef = useRef(() => {});
  const studyCardRef = useRef(null);
  const studyElRef = useRef(null);
  const flashSceneRef = useRef(null);
  const quizCardRef = useRef(null);
  const [studyBusy, setStudyBusy] = useState(false);
  const [flashBusy, setFlashBusy] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);

  const studyPool = useMemo(() => {
    if (!catalog) return [];
    let pool = allWords.filter((w) => user.studyCollectionId === "all" || w.collectionId === user.studyCollectionId);
    return pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, user.studyCollectionId]);
  studyPoolRef.current = studyPool;
  const studyIndex = Math.max(0, studyPool.findIndex((w) => w.id === user.lastWordId));
  const studyWord = studyPool[clamp(studyIndex, 0, Math.max(0, studyPool.length - 1))];

  const moveStudy = useCallback(
    (step, from = null) => {
      const pool = studyPoolRef.current;
      if (!pool.length || studyBusy) return;
      const pos = Math.max(0, pool.findIndex((w) => w.id === user.lastWordId));
      const next = pool[(pos + step + pool.length) % pool.length];
      switchCard(
        () => studyCardRef.current?.querySelector(".study-card"),
        () => {
          patchUser((prev) => ({ ...prev, lastWordId: next.id }));
          markStudy(next.id);
        },
        step,
        () => page === "study",
        from,
      ).then(() => setStudyBusy(false));
      setStudyBusy(true);
    },
    [studyBusy, user.lastWordId, patchUser, markStudy, page],
  );
  moveStudyRef.current = moveStudy;

  /* ---- 记忆卡片 ---- */
  const flashPool = useMemo(() => {
    if (!catalog) return [];
    return applyFilters(allWords, flash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, flash.collection, flash.status, flash.sort, flash.seed]);
  const flashWord = flashPool[clamp(flash.index, 0, Math.max(0, flashPool.length - 1))];
  const moveFlash = useCallback(
    (step, from = null) => {
      const pool = flashPool;
      if (!pool.length || flashBusy) return;
      const nextIndex = (flash.index + step + pool.length) % pool.length;
      switchCard(
        () => flashSceneRef.current,
        () => setFlash((f) => ({ ...f, index: nextIndex, flipped: false })),
        step,
        () => page === "flash",
        from,
      ).then(() => setFlashBusy(false));
      setFlashBusy(true);
    },
    [flashPool, flash.index, flashBusy, page],
  );
  moveFlashRef.current = moveFlash;

  /* ---- 记忆测试 ---- */
  const quizPool = useMemo(() => {
    if (!catalog) return [];
    return applyFilters(allWords, { ...quizSetup, keyword: "", sort: "original" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, quizSetup.collection, quizSetup.category, quizSetup.status]);

  const startQuiz = useCallback(() => {
    if (!quizPool.length) return;
    const picked = shuffled(quizPool).slice(0, clamp(quizSetup.count, 5, 50));
    const items = picked.map((w) => {
      const mode = ["cn-en", "en-cn", "blank"][Math.floor(Math.random() * 3)];
      if (mode === "blank") return { wordId: w.id, mode };
      const distractors = shuffled(quizPool.filter((x) => x.id !== w.id)).slice(0, 3);
      // 注意：shuffleWith 返回的是随机数生成器，洗牌必须走 shuffled()
      const choices = shuffled([w, ...distractors], Date.now() >>> 0);
      const options = choices.map((x) => ({
        text: mode === "cn-en" ? x.word : x.meaning,
        correct: x.id === w.id,
      }));
      return { wordId: w.id, mode, options };
    });
    setQuiz({ items, index: 0, records: items.map(() => null), correct: 0, wrong: 0, done: false, answered: false, selected: null, revealed: false });
    navigate("quiz");
  }, [quizPool, quizSetup.count, navigate]);

  const quizWord = quiz && !quiz.done ? allWords.find((w) => w.id === quiz.items[quiz.index]?.wordId) : null;

  const answerQuiz = useCallback(
    (ok, selectedIdx = null) => {
      if (!quiz || quiz.answered || quiz.done) return;
      const records = [...quiz.records];
      records[quiz.index] = { answered: true, ok, selected: selectedIdx };
      setQuiz((q) => ({ ...q, records, answered: true, selected: selectedIdx, revealed: true, correct: q.correct + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) }));
      markStudy(quiz.items[quiz.index].wordId);
      scheduleReview(quiz.items[quiz.index].wordId, ok);
    },
    [quiz, markStudy, scheduleReview],
  );

  const submitBlank = useCallback(() => {
    const input = document.getElementById("blankAnswer");
    if (!input || !quizWord) return;
    answerQuiz(input.value.trim().toLowerCase() === quizWord.word.toLowerCase());
  }, [quizWord, answerQuiz]);

  const stepQuiz = useCallback(
    (target, direction, from = null) => {
      if (!quiz || quiz.done || quizBusy || target === quiz.index) return;
      switchCard(
        () => quizCardRef.current,
        () =>
          setQuiz((q) => {
            const rec = q.records[target];
            return { ...q, index: target, answered: !!rec?.answered, selected: rec?.selected ?? null, revealed: !!rec?.answered };
          }),
        direction,
        () => page === "quiz",
        from,
      ).then(() => setQuizBusy(false));
      setQuizBusy(true);
    },
    [quiz, quizBusy, page],
  );
  const moveQuiz = useCallback(
    (step, from = null) => {
      if (!quiz) return;
      stepQuiz(clamp(quiz.index + step, 0, quiz.items.length - 1), step, from);
    },
    [quiz, stepQuiz],
  );
  const nextQuestion = useCallback(
    (from = null) => {
      if (!quiz) return;
      if (quiz.index >= quiz.items.length - 1) setQuiz((q) => ({ ...q, done: true }));
      else stepQuiz(quiz.index + 1, 1, from);
    },
    [quiz, stepQuiz],
  );
  moveQuizRef.current = moveQuiz;
  nextQuestionRef.current = nextQuestion;

  /* ---- 滑动手势：卡片左右滑动 ---- */
  const swipeAtRef = useRef(0);
  const guardClick = useCallback((e) => {
    // 滑动后 400ms 截断补发 click，避免松手时误触按钮
    if (Date.now() - swipeAtRef.current < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const studySwipe = useSwipeDeck({
    targetRef: studyElRef,
    threshold: 56,
    enabled: page === "study",
    guardRef: swipeAtRef,
    onSwipe: ({ direction, offset, opacity }) => {
      if (page !== "study") return;
      moveStudy(direction, { offset, opacity });
    },
  });

  const flashSwipe = useSwipeDeck({
    targetRef: flashSceneRef,
    threshold: 56,
    enabled: page === "flash",
    guardRef: swipeAtRef,
    onSwipe: ({ direction, offset, opacity }) => {
      if (page !== "flash") return;
      moveFlash(direction, { offset, opacity });
    },
  });

  const quizSwipe = useSwipeDeck({
    targetRef: quizCardRef,
    threshold: 56,
    enabled: page === "quiz" && !!quiz && !quiz.done && !quiz.answered,
    guardRef: swipeAtRef,
    onSwipe: ({ direction, offset, opacity }) => {
      if (page !== "quiz" || !quiz || quiz.done || quiz.answered) return;
      if (direction > 0) nextQuestion({ offset, opacity });
      else moveQuiz(-1, { offset, opacity });
    },
  });

  /* ---- 滑动手势：整页左右翻页（排除卡片区与表单控件） ---- */
  const pageSwipe = useSwipeDeck({
    targetRef: () => sectionRefs.current[page],
    threshold: 72,
    enabled: !modalOpen && !bookPickerOpen,
    guardRef: swipeAtRef,
    shouldStart: (e) => {
      if (e.target.closest(".swipe-deck, input, textarea, select, button, a, [role='button']")) return false;
      // 卡片手势后 400ms 内不触发翻页
      if (Date.now() - swipeAtRef.current < 400) return false;
      return true;
    },
    onSwipe: ({ direction, offset, opacity }) => {
      if (modalOpen || bookPickerOpen) return;
      const idx = PAGES.findIndex(([id]) => id === page);
      const target = PAGES[idx + direction];
      if (!target) return;
      const el = sectionRefs.current[page];
      const anim = el?.animate(
        [
          { transform: `translate3d(${offset}px,0,0)`, opacity },
          { transform: `translate3d(${-direction * 160}px,0,0)`, opacity: 0 },
        ],
        { duration: 160, easing: "cubic-bezier(0.4,0,0.65,1)" },
      );
      const go = () => navigate(target[0], direction);
      if (anim) anim.finished.catch(() => {}).finally(go);
      else go();
    },
  });

  /* ---- 番茄钟 ---- */
  const pomo = user.pomodoro;
  const pomoTotal = (pomo.mode === "break" ? pomo.breakDuration : pomo.duration) * 60;
  const pomoRemaining = pomo.running && pomo.endsAt ? Math.max(0, Math.ceil((pomo.endsAt - Date.now()) / 1000)) : pomo.remaining;
  const setPomodoro = useCallback(
    (patch) => patchUser((prev) => ({ ...prev, pomodoro: { ...prev.pomodoro, ...patch } })),
    [patchUser],
  );
  const togglePomodoro = useCallback(() => {
    const p = user.pomodoro;
    if (p.running) setPomodoro({ running: false, remaining: pomoRemaining, endsAt: null });
    else {
      const total = (p.mode === "break" ? p.breakDuration : p.duration) * 60;
      setPomodoro({ running: true, endsAt: Date.now() + (pomoRemaining || total) * 1000 });
    }
  }, [user.pomodoro, pomoRemaining, setPomodoro]);
  const finishPomodoro = useCallback(() => {
    const p = user.pomodoro;
    // 专注与休息的时长相互独立：不再共用 duration，避免专注时长被休息的 5 分钟污染
    if (p.mode === "focus") setPomodoro({ mode: "break", remaining: p.breakDuration * 60, running: false, endsAt: null });
    else setPomodoro({ mode: "focus", remaining: p.duration * 60, running: false, endsAt: null });
  }, [user.pomodoro, setPomodoro]);
  useEffect(() => {
    if (pomo.running && pomoRemaining <= 0) finishPomodoro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, pomoRemaining]);
  const setPomodoroDuration = useCallback(
    (minutes) => {
      const m = clamp(Math.round(minutes), 5, 90);
      const patch = { remaining: m * 60, running: false, endsAt: null };
      if (pomo.mode === "break") patch.breakDuration = m;
      else patch.duration = m;
      setPomodoro(patch);
    },
    [setPomodoro, pomo.mode],
  );
  const pomoDialRef = useRef(null);
  const dialDrag = useRef(null);
  const onDialPointer = useCallback(
    (e) => {
      if (pomo.running || !pomoDialRef.current) return;
      if (e.type === "pointerdown") {
        pomoDialRef.current.setPointerCapture(e.pointerId);
        dialDrag.current = true;
      } else if (!dialDrag.current) return;
      const rect = pomoDialRef.current.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const clockwise = (angle + 450) % 360;
      setPomodoroDuration(5 + (clockwise / 360) * 85);
      if (e.type === "pointerup" || e.type === "pointercancel") dialDrag.current = false;
    },
    [pomo.running, setPomodoroDuration],
  );

  /* ---- 测验自定义瞄准光标 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const cursor = quizCursorRef.current;
    const corners = cursor ? Array.from(cursor.querySelectorAll("i")) : [];
    const dot = cursor?.querySelector("b");
    if (!cursor || corners.length !== 4 || !dot) return;
    const rest = [
      { x: -18, y: -18 },
      { x: 6, y: -18 },
      { x: 6, y: 6 },
      { x: -18, y: 6 },
    ];
    let target = null;
    let frame = null;
    let spin = null;
    let px = 0;
    let py = 0;
    const moveX = gsap.quickTo(cursor, "x", { duration: 0.1, ease: "power3.out" });
    const moveY = gsap.quickTo(cursor, "y", { duration: 0.1, ease: "power3.out" });
    const cornerMoves = corners.map((c) => ({
      x: gsap.quickTo(c, "x", { duration: 0.2, ease: "power2.out" }),
      y: gsap.quickTo(c, "y", { duration: 0.2, ease: "power2.out" }),
    }));
    const available = () =>
      document.body.dataset.page === "quiz" &&
      user.quizCursor !== false &&
      !document.body.classList.contains("no-motion") &&
      !prefersReducedMotion();
    const startSpin = () => {
      if (!spin) spin = gsap.to(cursor, { rotation: 360, duration: 2, ease: "none", repeat: -1 });
      else spin.restart();
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!available()) return;
        if (target?.isConnected) {
          const r = target.getBoundingClientRect();
          const size = 12;
          const b = 4;
          const positions = [
            { x: r.left - b - px, y: r.top - b - py },
            { x: r.right + b - size - px, y: r.top - b - py },
            { x: r.right + b - size - px, y: r.bottom + b - size - py },
            { x: r.left - b - px, y: r.bottom + b - size - py },
          ];
          cornerMoves.forEach((m, i) => {
            m.x(positions[i].x);
            m.y(positions[i].y);
          });
          cursor.classList.add("is-active");
          document.body.classList.add("quiz-target-active");
        }
        moveX(px);
        moveY(py);
      });
    };
    const release = () => {
      target = null;
      document.body.classList.remove("quiz-target-active");
      gsap.to(corners, { borderColor: "#8f5867", duration: 0.15, overwrite: "auto" });
      gsap.to(dot, { backgroundColor: "#8f5867", scale: 1, duration: 0.18, overwrite: true });
      cornerMoves.forEach((m, i) => {
        m.x(rest[i].x);
        m.y(rest[i].y);
      });
      if (available()) startSpin();
      else spin?.pause();
    };
    const onOver = (e) => {
      if (!available()) return;
      const t = e.target.closest?.("button,a,input,select,[role='button']");
      if (!t || t === target) return;
      target = t;
      px = e.clientX;
      py = e.clientY;
      cursor.classList.add("is-active");
      document.body.classList.add("quiz-target-active");
      spin?.pause();
      gsap.to(cursor, { rotation: 0, duration: 0.16, ease: "power2.out", overwrite: "auto" });
      gsap.to(corners, { borderColor: "#b56f82", duration: 0.15, overwrite: "auto" });
      gsap.to(dot, { backgroundColor: "#b56f82", duration: 0.15, overwrite: "auto" });
      schedule();
    };
    const onMove = (e) => {
      if (!available()) return;
      if (!document.body.classList.contains("quiz-custom-cursor")) document.body.classList.add("quiz-custom-cursor");
      cursor.classList.add("is-active");
      px = e.clientX;
      py = e.clientY;
      schedule();
    };
    const onOut = (e) => {
      if (!target) return;
      const next = e.relatedTarget?.closest?.("button,a,input,select,[role='button']");
      if (next === target) return;
      if (next && available()) {
        target = next;
        px = e.clientX;
        py = e.clientY;
        schedule();
        return;
      }
      release();
    };
    const onDown = () => available() && (gsap.to(dot, { scale: 0.65, duration: 0.16, overwrite: "auto" }), gsap.to(cursor, { scale: 0.9, duration: 0.16, overwrite: "auto" }));
    const onUp = () => available() && (gsap.to(dot, { scale: 1, duration: 0.22, overwrite: "auto" }), gsap.to(cursor, { scale: 1, duration: 0.22, overwrite: "auto" }));
    const sync = () => {
      const on = available();
      document.body.classList.toggle("quiz-custom-cursor", on);
      if (!on) {
        cursor.classList.remove("is-active");
        document.body.classList.remove("quiz-target-active");
        spin?.pause();
      } else if (!target) startSpin();
    };
    sync();
    const syncTimer = setInterval(sync, 400);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("scroll", () => target && schedule(), { passive: true });
    return () => {
      clearInterval(syncTimer);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      frame !== null && cancelAnimationFrame(frame);
      spin?.kill();
      document.body.classList.remove("quiz-custom-cursor", "quiz-target-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.quizCursor, motionEnabled]);

  /* ---- 重置 ---- */
  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser({ ...defaultUserData(), motion: user.motion, quizCursor: user.quizCursor });
    setQuiz(null);
    setFlash((f) => ({ ...f, index: 0, flipped: false }));
    setModalOpen(false);
  }, [user.motion, user.quizCursor]);

  /* ---- 学习最新词集 / 随机 / 继续 ---- */
  const latestCollection = useMemo(
    () => (catalog ? [...catalog.collections].filter((c) => c.wordCount > 0).sort((a, b) => b.sortOrder - a.sortOrder)[0] : null),
    [catalog],
  );
  const startLatest = useCallback(() => {
    if (!latestCollection) return;
    patchUser((prev) => ({ ...prev, studyCollectionId: latestCollection.id }));
    navigate("study");
  }, [latestCollection, patchUser, navigate]);
  const startRandom = useCallback(() => {
    if (!catalog || !allWords.length) return;
    const picked = shuffled(allWords).slice(0, 40);
    patchUser((prev) => ({ ...prev, studyCollectionId: "all", lastWordId: picked[0]?.id ?? prev.lastWordId }));
    navigate("study");
  }, [catalog, allWords, patchUser, navigate]);
  const continueStudy = useCallback(() => {
    patchUser((prev) => ({ ...prev, studyCollectionId: "all" }));
    navigate("study");
  }, [patchUser, navigate]);

  const app = {
    catalog,
    user,
    allWords,
    categories,
    stats,
    navigate,
    patchUser,
    setWordState,
    updateWordStatus,
    toggleFavorite,
    markStudy,
    lib,
    setLib,
    flash,
    setFlash,
    quizSetup,
    setQuizSetup,
    quiz,
    setQuiz,
    quizPool,
    startQuiz,
    answerQuiz,
    submitBlank,
    clock,
    pomo,
    pomoRemaining,
    togglePomodoro,
    setPomodoroDuration,
    onDialPointer,
    pomoDialRef,
    latestCollection,
    startLatest,
    startRandom,
    continueStudy,
    // 卡片切换的唯一入口：带 busy 锁，页面与键盘共用同一把锁
    moveStudy,
    moveFlash,
    // 滑动手势：卡片与整页
    studySwipe,
    flashSwipe,
    quizSwipe,
    guardClick,
    studyElRef,
    openBookPicker: () => setBookPickerOpen(true),
  };

  const navButtons = (variant) =>
    PAGES.map(([id, label, icon]) => (
      <button key={id} className={page === id ? "active" : ""} data-page={id} aria-label={`前往${label}`} onClick={() => navigate(id)}>
        {variant === "top" ? (
          <span className="nav-label-stack">
            <i className="nav-hover-circle" aria-hidden="true" />
            <span className="nav-label-copy">
              <span className="nav-icon">{icon}</span>
              <em>{label}</em>
            </span>
            <span className="nav-label-copy nav-label-hover" aria-hidden="true">
              <span className="nav-icon">{icon}</span>
              <em>{label}</em>
            </span>
          </span>
        ) : (
          <>
            <span>{icon}</span>
            {label}
          </>
        )}
      </button>
    ));

  const renderPage = () => {
    if (!catalog) {
      return page === "home" ? <BootHome clock={clock} bootError={bootError} /> : null;
    }
    switch (page) {
      case "home":
        return <HomePage app={app} />;
      case "library":
        return <LibraryPage app={app} />;
      case "study":
        return <StudyPage app={app} studyCardRef={studyCardRef} />;
      case "flash":
        return <FlashPage app={app} flashSceneRef={flashSceneRef} flashWord={flashWord} flashPool={flashPool} />;
      case "quiz":
        return <QuizPage app={app} quizWord={quizWord} quizCardRef={quizCardRef} moveQuiz={moveQuiz} nextQuestion={nextQuestion} />;
      case "favorites":
        return <FavoritesPage app={app} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="garden-background-art" aria-hidden="true" />
      <div className="glow g1" aria-hidden="true" />
      <div className="glow g2" aria-hidden="true" />
      <div className="sakura-branch" aria-hidden="true" />
      <div className="petal-field petal-field--back" ref={petals.backRef} aria-hidden="true" />
      <div className="app-shell">
        <div className="petal-field petal-field--mid" ref={petals.midRef} aria-hidden="true" />
        <div className="petal-field petal-field--front" ref={petals.frontRef} aria-hidden="true" />
        <header className="topbar glass">
          <div className="brand">
            词间日和<small>WORDS IN BLOOM</small>
          </div>
          <nav className="nav" id="topNav">
            {navButtons("top")}
          </nav>
          <div className="tools">
            <button
              className={`motion-toggle ${motionEnabled ? "on" : ""}`}
              onClick={() => patchUser((prev) => ({ ...prev, motion: !(prev.motion !== false) }))}
              aria-pressed={motionEnabled}
              aria-label="切换背景动画"
            >
              <span className="motion-bloom" aria-hidden="true">
                ✿
              </span>
              <span className="motion-label">花影</span>
              <i className="switch-track" aria-hidden="true" />
              <em className="motion-state">{motionEnabled ? "开" : "关"}</em>
            </button>
            <button className="theme-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色暖粉和风主题" : "切换到深色夜樱主题"}>
              <span className="icon-moon" aria-hidden="true">
                ☾
              </span>
              <span className="icon-sun" aria-hidden="true">
                ☀
              </span>
            </button>
            <button className="icon-btn" onClick={() => setModalOpen(true)} aria-label="重置全部进度">
              重置
            </button>
          </div>
        </header>
        <main
          className="main"
          onPointerDown={pageSwipe.onPointerDown}
          onPointerMove={pageSwipe.onPointerMove}
          onPointerUp={pageSwipe.onPointerUp}
          onPointerCancel={pageSwipe.onPointerCancel}
          onClickCapture={guardClick}
        >
          {PAGES.map(([id]) => (
            <section
              key={id}
              id={id}
              ref={(el) => {
                sectionRefs.current[id] = el;
              }}
              className={`page ${page === id ? "active" : ""}`}
            >
              {page === id ? renderPage() : null}
            </section>
          ))}
        </main>
        <div className="app-status-row">
          <div className="sync-status" data-state={catalog ? (bootError ? "error" : "connected") : "connecting"} role="status">
            {bootError ? "词库加载失败 · 请刷新重试" : catalog ? "静态版已就绪 · 进度保存在此浏览器" : "正在整理今天的学习书桌…"}
          </div>
        </div>
        <div className="footer-whisper">A word revisited becomes a word remembered.</div>
      </div>
      <nav className="bottom-nav glass" id="bottomNav">
        {navButtons("bottom")}
      </nav>
      {page !== "home" && (pomo.running || pomoRemaining < pomo.duration * 60) && (
        <button className="pomodoro-mini glass" onClick={() => navigate("home")} aria-label="返回首页查看番茄钟">
          <span aria-hidden="true">◷</span>
          <span>
            <b>{formatPomodoro(pomoRemaining)}</b>
            <br />
            <small>{pomo.mode === "focus" ? "专注" : "休息"} · {pomo.running ? "进行中" : "已暂停"}</small>
          </span>
        </button>
      )}
      <button className={`to-top ${showTop ? "show" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回顶部">
        ↑
      </button>
      <div className="quiz-target-cursor" ref={quizCursorRef} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div className={`modal ${modalOpen ? "show" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modalTitle" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
        <div className="dialog glass">
          <h3 id="modalTitle">重置学习记录？</h3>
          <p>这会清除学习状态、收藏、连续天数和测试成绩，且无法撤销。</p>
          <div className="actions">
            <button className="pill" onClick={() => setModalOpen(false)}>
              取消
            </button>
            <button className="pill danger" onClick={resetAll}>
              确认重置
            </button>
          </div>
        </div>
      </div>
      {bookPickerOpen && (
        <div
          className="modal show book-picker-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bookPickerTitle"
          onClick={(e) => {
            // 首访选书不可关闭：遮罩点击无效
            if (e.target === e.currentTarget && !bookFirstVisit) setBookPickerOpen(false);
          }}
        >
          <div className="dialog glass book-picker">
            <div className="picker-head">
              <div>
                <h3 id="bookPickerTitle">{bookFirstVisit ? "先选一本词集" : "切换词集"}</h3>
                <p>{bookFirstVisit ? "Pick a lesson to begin — this step cannot be skipped." : "Switch lessons — the desk is reset and you go back home."}</p>
              </div>
              <span className="count">{catalog?.collections.length || 0} 期词集</span>
            </div>
            <div className="picker-list">
              {(catalog?.collections || []).map((c) => {
                const p = collectionProgress.get(c.id) || { learned: 0, total: c.wordCount || 0 };
                const pct = p.total ? Math.round((p.learned / p.total) * 100) : 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`journal-card glass book-card ${pickedCollection === c.id ? "active" : ""}`}
                    onClick={() => setPickedCollection(c.id)}
                    aria-pressed={pickedCollection === c.id}
                  >
                    <h4>{c.title}</h4>
                    <div className="book-meta">
                      <span className="badge">{c.section}</span>
                      <span className="badge collection">{p.total} 词</span>
                    </div>
                    <div className="path-bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <span className="count">
                      {p.learned}/{p.total} 已学
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="actions">
              {!bookFirstVisit && (
                <button className="pill" onClick={() => setBookPickerOpen(false)}>
                  取消
                </button>
              )}
              <button className={`pill ${bookFirstVisit ? "primary" : "book-card-cta"}`} onClick={confirmBook} disabled={!pickedCollection}>
                {bookFirstVisit ? "开始学习" : "换这一本"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const formatPomodoro = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/* ---------- 启动骨架屏 ---------- */
function BootHome({ clock, bootError }) {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">WORDS IN BLOOM</div>
        <h1>词间日和</h1>
        <div className="jp">ことばの記憶</div>
        <p className="subtitle">Let the words you learn today settle, slowly, into memory.</p>
        <span className="date">
          <span>{clock.date}</span>
          <time className="beijing-time">{clock.time}</time>
        </span>
      </div>
      <div className="dashboard glass" aria-busy="true" aria-label="正在载入学习数据">
        <div className="home-boot-ring" aria-hidden="true" />
        <div className="stats">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="stat home-boot-stat" key={i}>
              <i className="home-boot-line" />
              <i className="home-boot-line short" />
            </div>
          ))}
        </div>
      </div>
      <div className="home-boot-actions" aria-hidden="true">
        <i className="home-boot-action" />
        <i className="home-boot-action" />
        <i className="home-boot-action" />
      </div>
      <p className="home-boot-copy" style={{ marginTop: 18 }}>
        {bootError ? `词库加载失败：${bootError}` : "正在整理今天的学习书桌…"}
      </p>
      <div className="home-showcase">
        <div className="home-grid">
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "55%" }} />
            <i className="home-boot-line short" style={{ width: "80%" }} />
          </div>
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "40%" }} />
            <i className="home-boot-line short" style={{ width: "70%" }} />
          </div>
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "60%" }} />
            <i className="home-boot-line short" style={{ width: "75%" }} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 首页 ---------- */
function HomePage({ app }) {
  const { stats, navigate, clock, setLib, pomo, pomoRemaining, togglePomodoro, setPomodoroDuration, onDialPointer, pomoDialRef, latestCollection, startLatest, startRandom, continueStudy } = app;
  const ringR = 64;
  const ringC = 2 * Math.PI * ringR;
  const dialR = 56;
  const dialC = 2 * Math.PI * dialR;
  const pomoMinutes = pomo.mode === "break" ? pomo.breakDuration : pomo.duration;
  const pomoTotal = pomoMinutes * 60;
  const dialRatio = pomo.running ? pomoRemaining / pomoTotal : pomoMinutes / 90;
  const sections = ["核心词", "基础词", "拓展词"];
  const sectionProgress = sections.map((section) => {
    const list = app.allWords.filter((w) => w.section === section);
    const learned = list.filter((w) => w.status !== "new").length;
    return { section, total: list.length, learned, pct: list.length ? Math.round((learned / list.length) * 100) : 0 };
  });
  const goLibrary = (status) => {
    setLib((f) => ({ ...f, status, page: 0 }));
    navigate("library");
  };
  return (
    <>
      <div className="hero">
        <div className="eyebrow">WORDS IN BLOOM</div>
        <h1>词间日和</h1>
        <div className="jp">ことばの記憶</div>
        <p className="subtitle">Let the words you learn today settle, slowly, into memory.</p>
        <span className="date">
          <span>{clock.date}</span>
          <time className="beijing-time">{clock.time}</time>
        </span>
      </div>
      <div className="dashboard glass">
        <div className="ring-wrap" role="img" aria-label={`全部词库进度 ${stats.percent}%`}>
          <svg viewBox="0 0 148 148" width="148" height="148">
            <circle cx="74" cy="74" r={ringR} fill="none" stroke="rgba(181,111,130,0.16)" strokeWidth="9" />
            <circle
              cx="74"
              cy="74"
              r={ringR}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringC * (1 - stats.percent / 100)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ddc8cd" />
                <stop offset="100%" stopColor="#b56f82" />
              </linearGradient>
            </defs>
          </svg>
          <b>{stats.percent}%</b>
          <small>全部词库进度</small>
        </div>
        <div className="stats">
          <div className="stat">
            <CountUp value={stats.total} />
            <span>累计单词</span>
          </div>
          <div className="stat">
            <CountUp value={stats.collections} />
            <span>累计词集</span>
          </div>
          <button className="stat" onClick={() => goLibrary("mastered")}>
            <CountUp value={stats.mastered} />
            <span>已掌握</span>
          </button>
          <button className="stat" onClick={() => goLibrary("learning")}>
            <CountUp value={stats.learning} />
            <span>学习中</span>
          </button>
          <button className="stat" onClick={() => goLibrary("review")}>
            <CountUp value={stats.review} />
            <span>待复习</span>
          </button>
          <div className="stat">
            <CountUp value={stats.streak} suffix=" 天" />
            <span>连续学习</span>
          </div>
        </div>
      </div>
      <div className="home-actions">
        <button className="pill primary" onClick={startLatest}>
          学习最新词集
        </button>
        <button className="pill" onClick={app.openBookPicker}>
          选择词集
        </button>
        <button className="pill" onClick={startRandom}>
          跨词集随机学习
        </button>
        <button className="pill" onClick={continueStudy}>
          继续上次进度
        </button>
      </div>
      <p className="home-hint">
        累计进度 {stats.percent}% · 收藏 {stats.favorites} 个单词
      </p>
      <div className="home-grid">
        <div className="journal-card glass pomodoro-card">
          <div className="kicker">Pomodoro</div>
          <h3>专注时光</h3>
          <div className="dial-row">
            <div
              className={`pomodoro-dial ${pomo.running ? "running" : ""}`}
              ref={pomoDialRef}
              onPointerDown={onDialPointer}
              onPointerMove={onDialPointer}
              onPointerUp={onDialPointer}
              onPointerCancel={onDialPointer}
              role="slider"
              aria-label="番茄钟时长"
              aria-valuemin={5}
              aria-valuemax={90}
              aria-valuenow={pomo.duration}
            >
              <svg viewBox="0 0 132 132" width="132" height="132">
                <circle cx="66" cy="66" r={dialR} fill="none" stroke="rgba(181,111,130,0.14)" strokeWidth="7" />
                <circle
                  cx="66"
                  cy="66"
                  r={dialR}
                  fill="none"
                  stroke={pomo.mode === "break" ? "#9caf94" : "#b56f82"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={dialC}
                  strokeDashoffset={dialC * (1 - clamp(dialRatio, 0, 1))}
                  style={{ transition: "stroke-dashoffset 0.2s ease" }}
                />
              </svg>
              <span className="dial-time">{formatPomodoro(pomoRemaining)}</span>
            </div>
            <div className="pomodoro-side">
              <span className="pomodoro-phase">
                {pomo.mode === "focus" ? "专注" : "休息"} · {pomo.running ? "进行中" : "已暂停"}
              </span>
              <span className="pomodoro-phase">拖动表盘调时长（5–90 分钟）</span>
              <div className="card-actions">
                <button className="pill primary" onClick={togglePomodoro}>
                  {pomo.running ? "暂停" : "开始"}
                </button>
                <button className="pill" onClick={() => app.patchUser((prev) => ({ ...prev, pomodoro: { ...prev.pomodoro, remaining: (prev.pomodoro.mode === "break" ? prev.pomodoro.breakDuration : prev.pomodoro.duration) * 60, running: false, endsAt: null } }))}>
                  重置
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="journal-card glass">
          <div className="kicker">Batch {String(app.catalog.collections.length).padStart(2, "0")} / {String(app.catalog.collections.length).padStart(2, "0")} · Latest</div>
          <h3 className="latest-title">{latestCollection?.title || "—"}</h3>
          <p className="muted">
            最新一期词集，共 {latestCollection?.wordCount || 0} 个单词。A word visited today returns tomorrow.
          </p>
          <div className="card-actions">
            <button className="pill primary" onClick={startLatest}>
              学习该词集
            </button>
            <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: latestCollection?.id || "all", page: 0 })); navigate("library"); }}>
              查看词表
            </button>
          </div>
        </div>
        <div className="journal-card glass">
          <div className="kicker">A Quiet Path</div>
          <h3>长期学习路径</h3>
          <div className="path-row">
            {sectionProgress.map((s) => (
              <div className="path-item" key={s.section}>
                <span>{s.section}</span>
                <div className="path-bar">
                  <i style={{ width: `${s.pct}%` }} />
                </div>
                <b>
                  {s.learned}/{s.total}
                </b>
              </div>
            ))}
          </div>
          <div className="card-actions">
            <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
              打开词典库
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 词典库 ---------- */
function LibraryPage({ app }) {
  const { allWords, catalog, categories, lib, setLib, navigate, toggleFavorite } = app;
  const filtered = useMemo(() => applyFilters(allWords, lib), [allWords, lib]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = clamp(lib.page, 0, pageCount - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const setPage = (patch) => setLib((f) => ({ ...f, ...patch }));
  const searchRef = useRef(null);
  const onSearch = (e) => {
    if (e.nativeEvent.isComposing) return;
    setPage({ keyword: e.target.value, page: 0 });
  };
  return (
    <>
      <div className="section-head">
        <div>
          <h2>词典库</h2>
          <p>Every word, in season.</p>
        </div>
      </div>
      <div className="filters glass">
        <input ref={searchRef} className="field search" placeholder="搜索单词或释义…" defaultValue={lib.keyword} onChange={onSearch} aria-label="搜索单词" />
        <select className="field" value={lib.collection} onChange={(e) => setPage({ collection: e.target.value, page: 0 })} aria-label="按词集筛选">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
        <select className="field" value={lib.category} onChange={(e) => setPage({ category: e.target.value, page: 0 })} aria-label="按主题筛选">
          <option value="all">全部主题</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="field" value={lib.status} onChange={(e) => setPage({ status: e.target.value, page: 0 })} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="new">未学</option>
          <option value="learning">学习中</option>
          <option value="review">待复习</option>
          <option value="mastered">已掌握</option>
          <option value="favorite">已收藏</option>
        </select>
        <select className="field" value={lib.sort} onChange={(e) => setPage({ sort: e.target.value, seed: Date.now() >>> 0, page: 0 })} aria-label="排序">
          <option value="original">录入顺序</option>
          <option value="alpha">字母顺序</option>
          <option value="random">随机顺序</option>
          <option value="review">待复习优先</option>
          <option value="favorite">收藏优先</option>
        </select>
        <button
          className="pill"
          onClick={() => {
            setLib((f) => ({ ...f, collection: "all", category: "all", status: "all", sort: "original", keyword: "", page: 0, seed: 1 }));
            if (searchRef.current) searchRef.current.value = "";
          }}
        >
          清除筛选
        </button>
        <button className="pill" onClick={() => setPage({ sort: "random", seed: Date.now() >>> 0, page: 0 })}>
          从当前结果随机学习
        </button>
      </div>
      <div className="content-tools">
        <p className="count">
          共 {catalog.collections.length} 期词集 · 筛选到 {filtered.length} 个单词
          {filtered.length ? ` · 第 ${current + 1}/${pageCount} 页 · 本页 ${slice.length} 个` : ""}
        </p>
      </div>
      {slice.length ? (
        <>
          <div className="grid">
            {slice.map((w) => (
              <article
                key={w.id}
                className="word-card glass"
                role="button"
                tabIndex={0}
                onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: w.collectionId })); navigate("study"); }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: w.collectionId }));
                  navigate("study");
                }}
              >
                <header>
                  <h3>{w.word}</h3>
                  <button className={`fav-btn ${w.favorite ? "active" : ""}`} onClick={(e) => (e.stopPropagation(), toggleFavorite(w.id))} aria-label="收藏">
                    {w.favorite ? "♥" : "♡"}
                  </button>
                </header>
                <p className="meaning">{w.meaning}</p>
                <div className="badges">
                  <span className="badge">{w.category}</span>
                  <span className="badge collection">{w.collectionTitle}</span>
                  <span className={`badge s-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            {Array.from({ length: pageCount }, (_, i) => i)
              .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - current) <= 2)
              .map((i, idx, arr) => (
                <span key={i} style={{ display: "contents" }}>
                  {idx > 0 && arr[idx - 1] !== i - 1 && <span className="count">…</span>}
                  <button className={i === current ? "current" : ""} onClick={() => setPage({ page: i })}>
                    {i + 1}
                  </button>
                </span>
              ))}
          </div>
        </>
      ) : (
        <div className="empty glass">
          No words found here yet.
          <br />
          Try another collection or a different phrase.
        </div>
      )}
    </>
  );
}

/* ---------- 沉浸学习 ---------- */
function StudyPage({ app, studyCardRef }) {
  const { user, allWords, catalog, patchUser, updateWordStatus, toggleFavorite, navigate, moveStudy } = app;
  const pool = useMemo(
    () => allWords.filter((w) => user.studyCollectionId === "all" || w.collectionId === user.studyCollectionId),
    [allWords, user.studyCollectionId],
  );
  const idx = Math.max(0, pool.findIndex((w) => w.id === user.lastWordId));
  const word = pool[clamp(idx, 0, Math.max(0, pool.length - 1))];
  useEffect(() => {
    if (word) app.markStudy(word.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);
  if (!pool.length) {
    return (
      <>
        <div className="section-head">
          <div>
            <h2>沉浸学习</h2>
            <p>Slow reading, one word at a time.</p>
          </div>
        </div>
        <div className="empty glass">该词集暂无可学单词，换一个词集试试。</div>
      </>
    );
  }
  return (
    <>
      <div className="section-head study-head">
        <div>
          <h2>沉浸学习</h2>
          <p>
            {idx + 1} / {pool.length} · {word?.collectionTitle}
          </p>
        </div>
        <select className="field" value={user.studyCollectionId} onChange={(e) => patchUser((prev) => ({ ...prev, studyCollectionId: e.target.value, lastWordId: null }))} aria-label="选择词集">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
      </div>
      <div
        className="study-stage swipe-deck"
        ref={studyCardRef}
        onPointerDown={app.studySwipe.onPointerDown}
        onPointerMove={app.studySwipe.onPointerMove}
        onPointerUp={app.studySwipe.onPointerUp}
        onPointerCancel={app.studySwipe.onPointerCancel}
        onClickCapture={app.guardClick}
      >
        {word && (
          <div className="study-card glass swipe-target" key={word.id} ref={app.studyElRef}>
            <span className="badge">{word.category}</span>
            <h2 className="study-word">{word.word}</h2>
            <p className="study-meaning">{word.meaning}</p>
            <div className="study-actions">
              <button className={`pill ${word.status === "learning" ? "on" : ""}`} onClick={() => updateWordStatus(word.id, "learning")}>
                学习中
              </button>
              <button className={`pill ${word.status === "review" ? "on" : ""}`} onClick={() => updateWordStatus(word.id, "review")}>
                待复习
              </button>
              <button className={`pill ${word.status === "mastered" ? "mastered-cta" : "on"}`} onClick={() => updateWordStatus(word.id, "mastered")}>
                已掌握
              </button>
              <button className={`pill ${word.favorite ? "on" : ""}`} onClick={() => toggleFavorite(word.id)}>
                {word.favorite ? "♥ 已收藏" : "♡ 收藏"}
              </button>
              <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: word.collectionId, keyword: word.word, page: 0 })); navigate("library"); }}>
                在词库中查看
              </button>
            </div>
            <p className="study-hint">← → 切换单词 · M 掌握 · R 复习 · F 收藏</p>
          </div>
        )}
        <div className="study-nav-row">
          <button className="round-btn" onClick={() => moveStudy(-1)} aria-label="上一个">
            ←
          </button>
          <button className="round-btn" onClick={() => moveStudy(1)} aria-label="下一个">
            →
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- 记忆卡片 ---------- */
function FlashPage({ app, flashSceneRef, flashWord, flashPool }) {
  const { flash, setFlash, catalog, allWords, toggleFavorite, navigate, moveFlash } = app;
  const setF = (patch) => setFlash((f) => ({ ...f, ...patch }));
  return (
    <>
      <div className="section-head">
        <div>
          <h2>记忆卡片</h2>
          <p>Flip, recall, let it settle.</p>
        </div>
        <p className="count">
          {flashPool.length ? flash.index + 1 : 0} / {flashPool.length}
        </p>
      </div>
      <div className="filters glass">
        <select className="field" value={flash.collection} onChange={(e) => setF({ collection: e.target.value, index: 0, flipped: false })} aria-label="按词集筛选">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
        <select className="field" value={flash.status} onChange={(e) => setF({ status: e.target.value, index: 0, flipped: false })} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="new">未学</option>
          <option value="learning">学习中</option>
          <option value="review">待复习</option>
          <option value="mastered">已掌握</option>
          <option value="favorite">已收藏</option>
        </select>
        <select className="field" value={flash.sort} onChange={(e) => setF({ sort: e.target.value, seed: Date.now() >>> 0, index: 0, flipped: false })} aria-label="排序">
          <option value="original">录入顺序</option>
          <option value="alpha">字母顺序</option>
          <option value="random">随机顺序</option>
        </select>
      </div>
      {flashWord ? (
        <>
          <div
            className="flip-scene swipe-deck swipe-target"
            ref={flashSceneRef}
            onPointerDown={app.flashSwipe.onPointerDown}
            onPointerMove={app.flashSwipe.onPointerMove}
            onPointerUp={app.flashSwipe.onPointerUp}
            onPointerCancel={app.flashSwipe.onPointerCancel}
            onClickCapture={app.guardClick}
          >
            <div
              className={`flip-card ${flash.flipped ? "flipped" : ""}`}
              key={flashWord.id}
              data-flip
              tabIndex={0}
              onClick={() => setF({ flipped: !flash.flipped })}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setF({ flipped: !flash.flipped }))}
              aria-label="翻转卡片"
            >
              <div className="face front glass">
                <span className="badge">{flashWord.category}</span>
                <h2 className="flip-word">{flashWord.word}</h2>
                <p className="flip-tip">点击或按空格翻面</p>
              </div>
              <div className="face back glass">
                <span className="badge collection">{flashWord.collectionTitle}</span>
                <h2 className="flip-word">{flashWord.word}</h2>
                <p className="flip-meaning">{flashWord.meaning}</p>
              </div>
            </div>
          </div>
          <div className="flash-nav">
            <button className="round-btn" onClick={() => moveFlash(-1)} aria-label="上一张">
              ←
            </button>
            <button className={`pill ${flashWord.favorite ? "primary" : ""}`} onClick={() => toggleFavorite(flashWord.id)}>
              {flashWord.favorite ? "♥ 已收藏" : "♡ 收藏"}
            </button>
            <button className="pill" onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: flashWord.id, studyCollectionId: flashWord.collectionId })); navigate("study"); }}>
              去沉浸学习
            </button>
            <button className="round-btn" onClick={() => moveFlash(1)} aria-label="下一张">
              →
            </button>
          </div>
        </>
      ) : (
        <div className="empty glass">当前筛选下没有卡片，换一组条件试试。</div>
      )}
    </>
  );
}

/* ---------- 记忆测试 ---------- */
function QuizPage({ app, quizWord, quizCardRef, moveQuiz, nextQuestion }) {
  const { quiz, setQuiz, quizPool, quizSetup, setQuizSetup, startQuiz, answerQuiz, submitBlank, allWords, navigate, patchUser, setLib } = app;
  if (!quiz) {
    return (
      <>
        <div className="section-head">
          <div>
            <h2>记忆测试</h2>
            <p>A gentle examination of memory.</p>
          </div>
        </div>
        <div className="quiz-setup glass">
          <h2>开始一组测试</h2>
          <div className="setup-grid">
            <select className="field" value={quizSetup.collection} onChange={(e) => setQuizSetup((s) => ({ ...s, collection: e.target.value }))} aria-label="按词集出题">
              <option value="all">全部词集</option>
              {app.catalog.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}（{c.wordCount}）
                </option>
              ))}
            </select>
            <select className="field" value={quizSetup.status} onChange={(e) => setQuizSetup((s) => ({ ...s, status: e.target.value }))} aria-label="按状态出题">
              <option value="all">全部状态</option>
              <option value="new">未学</option>
              <option value="learning">学习中</option>
              <option value="review">待复习</option>
              <option value="mastered">已掌握</option>
            </select>
            <select className="field" value={quizSetup.count} onChange={(e) => setQuizSetup((s) => ({ ...s, count: Number(e.target.value) }))} aria-label="题数">
              <option value={10}>10 题</option>
              <option value={20}>20 题</option>
              <option value={30}>30 题</option>
            </select>
          </div>
          <p className="hint">本组共 {quizPool.length} 个可选单词 · 中英互测与拼写混合出题 · 同一单词连续答对两次即标记「已掌握」，答错则清零并安排复习。</p>
          <div>
            <button className="pill primary" onClick={startQuiz} disabled={!quizPool.length}>
              开始测试
            </button>
          </div>
        </div>
      </>
    );
  }
  if (quiz.done) {
    const total = quiz.correct + quiz.wrong;
    const rate = total ? Math.round((quiz.correct / total) * 100) : 0;
    const wrongItems = quiz.records
      .map((r, i) => ({ r, w: allWords.find((x) => x.id === quiz.items[i]?.wordId) }))
      .filter(({ r, w }) => r?.answered && !r.ok && w);
    return (
      <div className="result-card glass">
        <p className="result-score">{rate}</p>
        <p className="count">
          答对 {quiz.correct} / {total} 题
        </p>
        {wrongItems.length ? (
          <ul className="error-list">
            {wrongItems.map(({ w }) => (
              <li key={w.id}>
                <b>{w.word}</b> — {w.meaning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="count">全对，这一组词已经稳稳落进记忆里。</p>
        )}
        <div className="result-actions">
          <button className="pill primary" onClick={startQuiz}>
            再测一组
          </button>
          <button className="pill" onClick={() => setQuiz(null)}>
            调整范围
          </button>
          <button className="pill" onClick={() => { setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
            回词典库
          </button>
        </div>
      </div>
    );
  }
  const w = quizWord;
  const rec = quiz.records[quiz.index];
  const answered = !!rec?.answered;
  const mode = quiz.items[quiz.index].mode;
  const modeLabel = { "cn-en": "看释义选单词", "en-cn": "看单词选释义", blank: "拼写填空" }[mode];
  return (
    <>
      <div className="quiz-meta">
        <span>
          第 {quiz.index + 1} / {quiz.items.length} 题 · {modeLabel}
        </span>
        <span>
          正确 {quiz.correct} · 错误 {quiz.wrong}
        </span>
      </div>
      <div
        className="quiz-card glass swipe-deck swipe-target"
        ref={quizCardRef}
        key={quiz.index}
        onPointerDown={app.quizSwipe.onPointerDown}
        onPointerMove={app.quizSwipe.onPointerMove}
        onPointerUp={app.quizSwipe.onPointerUp}
        onPointerCancel={app.quizSwipe.onPointerCancel}
        onClickCapture={app.guardClick}
      >
        {mode === "blank" ? (
          <>
            <div className="prompt">{w?.meaning}</div>
            <div className="quiz-translation">写出对应的英文单词</div>
            <div className="blank-row">
              <input className="field" id="blankAnswer" placeholder="输入目标单词" autoComplete="off" disabled={answered} />
              <button className="pill primary" id="submitBlank" onClick={submitBlank} disabled={answered}>
                提交
              </button>
            </div>
            {answered && (
              <p className="quiz-translation">
                {rec.ok ? "正确：" : "正确答案："}
                <b>{w?.word}</b>
              </p>
            )}
          </>
        ) : (
          <>
            <div className="prompt">{mode === "cn-en" ? w?.meaning : w?.word}</div>
            <div className="quiz-translation">{mode === "cn-en" ? "选择正确的英文单词" : "选择正确的中文释义"}</div>
            <div className="options">
              {(quiz.items[quiz.index].options || []).map((o, i) => {
                let cls = "option";
                if (answered && o.correct) cls += " correct";
                else if (answered && rec?.selected === i) cls += " wrong";
                else if (answered) cls += " dim";
                return (
                  <button key={i} className={cls} disabled={answered} onClick={() => answerQuiz(o.correct, i)}>
                    {o.text}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="quiz-actions">
          <button className="pill" onClick={() => moveQuiz(-1)} disabled={quiz.index === 0}>
            ← 上一题
          </button>
          {w && (
            <button className="pill" onClick={() => { patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: w.collectionId })); navigate("study"); }}>
              沉浸学习 {w.word}
            </button>
          )}
          <button className="pill primary" onClick={nextQuestion} disabled={!answered}>
            {quiz.index >= quiz.items.length - 1 ? "查看结果" : "下一题 →"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- 收藏夹 ---------- */
function FavoritesPage({ app }) {
  const { allWords, toggleFavorite, setLib, navigate } = app;
  const favs = allWords.filter((w) => w.favorite);
  return (
    <>
      <div className="section-head">
        <div>
          <h2>收藏夹</h2>
          <p>Keep the words worth returning to, close at hand.</p>
        </div>
      </div>
      {favs.length ? (
        <>
          <div className="content-tools">
            <p className="count">已收藏 {favs.length} 个单词</p>
          </div>
          <div className="grid">
            {favs.map((w) => (
              <article
                key={w.id}
                className="word-card glass"
                role="button"
                tabIndex={0}
                onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: w.collectionId })); navigate("study"); }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: w.collectionId }));
                  navigate("study");
                }}
              >
                <header>
                  <h3>{w.word}</h3>
                  <button className="fav-btn active" onClick={(e) => (e.stopPropagation(), toggleFavorite(w.id))} aria-label="取消收藏">
                    ♥
                  </button>
                </header>
                <p className="meaning">{w.meaning}</p>
                <div className="badges">
                  <span className="badge">{w.category}</span>
                  <span className="badge collection">{w.collectionTitle}</span>
                  <span className={`badge s-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty glass">
          <div style={{ fontSize: 44 }}>♡</div>
          <p>
            Nothing has been saved yet.
            <br />
            When a word stays with you, keep it here.
          </p>
          <button className="pill primary" onClick={() => { setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
            前往单词库
          </button>
        </div>
      )}
    </>
  );
}
