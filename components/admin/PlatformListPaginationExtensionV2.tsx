"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PAGE_SIZES = [5, 10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const STORAGE_KEY = "labnarrative_admin_list_page_size";

type State = { page: number; pageSize: number; signature: string };
type Pair = { top: HTMLDivElement; bottom: HTMLDivElement };

function clean(value: string | null | undefined) {
  return (value || "").trim();
}

function numbers(page: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const result: Array<number | "…"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) result.push("…");
  for (let value = start; value <= end; value += 1) result.push(value);
  if (end < total - 1) result.push("…");
  result.push(total);
  return result;
}

function preferredSize() {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    if (PAGE_SIZES.includes(value as (typeof PAGE_SIZES)[number])) return value;
  } catch {}
  return DEFAULT_PAGE_SIZE;
}

function saveSize(value: number) {
  try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
}

function remember(item: HTMLElement) {
  if (item.dataset.platformDualDisplay !== undefined) return;
  item.dataset.platformDualDisplay = item.style.getPropertyValue("display") || "__empty__";
  item.dataset.platformDualDisplayPriority = item.style.getPropertyPriority("display") || "__empty__";
}

function show(item: HTMLElement) {
  remember(item);
  const value = item.dataset.platformDualDisplay === "__empty__" ? "" : item.dataset.platformDualDisplay || "";
  const priority = item.dataset.platformDualDisplayPriority === "__empty__" ? "" : item.dataset.platformDualDisplayPriority || "";
  if (!value) item.style.removeProperty("display");
  else item.style.setProperty("display", value, priority);
  delete item.dataset.platformDualHidden;
}

function hide(item: HTMLElement) {
  remember(item);
  item.style.setProperty("display", "none", "important");
  item.dataset.platformDualHidden = "true";
}

function available(item: HTMLElement) {
  return item.dataset.platformDualHidden === "true" || window.getComputedStyle(item).display !== "none";
}

function structural(container: HTMLElement) {
  const identity = `${container.className || ""} ${container.getAttribute("aria-label") || ""}`.toLowerCase();
  return /metric|summary|stat|toolbar|filter|tabs?|nav|actions?|header|footer|hero|topbar|controls?/.test(identity);
}

function itemsFor(container: HTMLElement): HTMLElement[] {
  if (container.closest(".platformListPagination")) return [];
  if (["NAV", "HEADER", "FOOTER", "FORM"].includes(container.tagName) || structural(container)) return [];
  const children = Array.from(container.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && !child.classList.contains("platformListPagination"),
  );
  if (!children.length) return [];

  if (container.tagName === "UL" || container.tagName === "OL") return children.filter((item) => item.tagName === "LI");
  if (container.getAttribute("role") === "list") {
    const roleItems = children.filter((item) => item.getAttribute("role") === "listitem");
    return roleItems.length ? roleItems : children;
  }

  const identity = `${container.className || ""}`.toLowerCase();
  const listLike = /list|queue|rows|items|inbox|history|decisions|activity|results|cards/.test(identity);
  const gridLike = /grid/.test(identity);
  const semantic = children.filter((item) => ["ARTICLE", "LI"].includes(item.tagName));
  if (listLike && semantic.length) return semantic;
  if (gridLike && semantic.length >= 5) return semantic;
  if (!listLike) return [];

  const eligible = children.filter((item) => !["H1", "H2", "H3", "P", "SPAN", "BUTTON", "LABEL"].includes(item.tagName));
  if (eligible.length < 2) return [];
  const first = eligible[0];
  const firstClass = clean(first.className).split(/\s+/).filter(Boolean)[0] || "";
  const repeated = eligible.filter((item) => item.tagName === first.tagName && (!firstClass || item.classList.contains(firstClass)));
  return repeated.length >= 2 ? repeated : [];
}

function itemKey(item: HTMLElement, index: number) {
  return item.getAttribute("data-id") || item.id || clean(item.querySelector("h1,h2,h3,h4,strong")?.textContent) || clean(item.textContent).slice(0, 100) || String(index);
}

function mirrorAnchor(top: HTMLElement): Element | null {
  const anchor = top.nextElementSibling;
  if (!anchor) return null;
  if (anchor.tagName === "TABLE" || anchor.querySelector("table") || ["UL", "OL"].includes(anchor.tagName) || anchor.getAttribute("role") === "list") return anchor;
  if (anchor.tagName !== "ARTICLE") return anchor;
  let last: Element = anchor;
  let cursor = anchor.nextElementSibling;
  while (cursor && cursor.tagName === "ARTICLE" && !cursor.classList.contains("platformListPagination")) {
    last = cursor;
    cursor = cursor.nextElementSibling;
  }
  return last;
}

export default function PlatformListPaginationExtensionV2() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin") || pathname.startsWith("/admin/preview")) return;

    let disposed = false;
    const states = new Map<string, State>();
    const pairs = new Map<string, Pair>();
    const mirrors = new Map<string, HTMLDivElement>();

    const ensureState = (id: string, signature: string, count: number) => {
      let state = states.get(id);
      if (!state) {
        state = { page: 1, pageSize: preferredSize(), signature };
        states.set(id, state);
      } else if (state.signature !== signature) {
        state.signature = signature;
        state.page = 1;
      }
      const total = Math.max(1, Math.ceil(count / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), total);
      return state;
    };

    const ensurePair = (id: string, container: HTMLElement) => {
      let pair = pairs.get(id);
      if (!pair || !pair.top.isConnected || !pair.bottom.isConnected) {
        const top = document.createElement("div");
        const bottom = document.createElement("div");
        top.className = "platformListPagination platformListPaginationExtension";
        bottom.className = "platformListPagination platformListPaginationBottom platformListPaginationExtension";
        top.dataset.platformDualId = id;
        bottom.dataset.platformDualId = id;
        pair = { top, bottom };
        pairs.set(id, pair);
      }
      if (pair.top.nextElementSibling !== container) container.insertAdjacentElement("beforebegin", pair.top);
      if (container.nextElementSibling !== pair.bottom) container.insertAdjacentElement("afterend", pair.bottom);
      return pair;
    };

    const render = (control: HTMLDivElement, count: number, state: State, refresh: () => void) => {
      const total = Math.max(1, Math.ceil(count / state.pageSize));
      const start = count ? (state.page - 1) * state.pageSize + 1 : 0;
      const end = Math.min(count, state.page * state.pageSize);
      const renderKey = `${count}:${state.page}:${state.pageSize}:${total}`;
      if (control.dataset.platformDualRender === renderKey) return;
      control.dataset.platformDualRender = renderKey;
      control.replaceChildren();

      const summary = document.createElement("span");
      summary.className = "platformListPaginationSummary";
      summary.textContent = `${start}–${end} of ${count}`;
      control.append(summary);

      const right = document.createElement("div");
      right.className = "platformListPaginationControls";
      const label = document.createElement("label");
      label.className = "platformListPageSize";
      label.append(document.createTextNode("Show "));
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Items per page");
      PAGE_SIZES.forEach((size) => {
        const option = document.createElement("option");
        option.value = String(size);
        option.textContent = String(size);
        option.selected = state.pageSize === size;
        select.append(option);
      });
      select.addEventListener("change", () => {
        const value = Number(select.value);
        state.pageSize = PAGE_SIZES.includes(value as (typeof PAGE_SIZES)[number]) ? value : DEFAULT_PAGE_SIZE;
        saveSize(state.pageSize);
        state.page = 1;
        refresh();
      });
      label.append(select);
      right.append(label);

      const buttons = document.createElement("div");
      buttons.className = "platformListPageButtons";
      const add = (labelText: string, target: number, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = labelText;
        button.disabled = disabled;
        if (current) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => { state.page = target; refresh(); });
        buttons.append(button);
      };
      add("‹", Math.max(1, state.page - 1), state.page <= 1);
      numbers(state.page, total).forEach((value) => {
        if (value === "…") {
          const span = document.createElement("span");
          span.className = "platformListPageEllipsis";
          span.textContent = "…";
          buttons.append(span);
        } else add(String(value), value, false, value === state.page);
      });
      add("›", Math.min(total, state.page + 1), state.page >= total);
      right.append(buttons);
      control.append(right);
    };

    const paginate = (id: string, container: HTMLElement, sourceItems: HTMLElement[]) => {
      if (container.previousElementSibling?.classList.contains("platformListPagination")) return;
      if (sourceItems.some((item) => item.dataset.platformPaginationDisplay !== undefined)) return;
      const current = sourceItems.filter(available);
      if (!current.length) return;
      const signature = current.map(itemKey).join("|");
      const state = ensureState(id, signature, current.length);
      const from = (state.page - 1) * state.pageSize;
      const to = from + state.pageSize;
      current.forEach((item, index) => index >= from && index < to ? show(item) : hide(item));
      const pair = ensurePair(id, container);
      const refresh = () => paginate(id, container, sourceItems);
      render(pair.top, current.length, state, refresh);
      render(pair.bottom, current.length, state, refresh);
    };

    const mirrorExisting = () => {
      const originals = Array.from(document.querySelectorAll<HTMLDivElement>(
        ".platformListPagination[data-platform-pagination-id], .platformListPagination[data-platform-native-pagination]",
      )).filter((node) => !node.classList.contains("platformListPaginationBottom"));

      originals.forEach((original, index) => {
        const id = original.dataset.platformPaginationId || original.dataset.platformNativePagination || `${pathname}:native:${index}`;
        const key = `${pathname}:${id}`;
        const anchor = mirrorAnchor(original);
        if (!anchor) return;
        let mirror = mirrors.get(key);
        if (!mirror || !mirror.isConnected) {
          mirror = document.createElement("div");
          mirror.className = "platformListPagination platformListPaginationBottom platformListPaginationMirror";
          mirror.dataset.platformMirrorId = key;
          mirrors.set(key, mirror);
        }
        if (anchor.nextElementSibling !== mirror) anchor.insertAdjacentElement("afterend", mirror);
        const html = original.innerHTML;
        if (mirror.dataset.platformMirrorHtml === html) return;
        mirror.dataset.platformMirrorHtml = html;
        mirror.innerHTML = html;

        const sourceSelects = Array.from(original.querySelectorAll<HTMLSelectElement>("select"));
        Array.from(mirror.querySelectorAll<HTMLSelectElement>("select")).forEach((select, i) => {
          const source = sourceSelects[i];
          if (!source) return;
          select.value = source.value;
          select.addEventListener("change", () => {
            source.value = select.value;
            source.dispatchEvent(new Event("change", { bubbles: true }));
            window.setTimeout(applyAll, 0);
          });
        });
        const sourceButtons = Array.from(original.querySelectorAll<HTMLButtonElement>("button"));
        Array.from(mirror.querySelectorAll<HTMLButtonElement>("button")).forEach((button, i) => {
          const source = sourceButtons[i];
          if (!source) return;
          button.disabled = source.disabled;
          button.addEventListener("click", () => {
            source.click();
            window.setTimeout(applyAll, 0);
          });
        });
      });
    };

    const paginateGeneric = () => {
      const selector = [
        "main ul", "main ol", "main [role='list']",
        "main [class*='list']", "main [class*='List']",
        "main [class*='queue']", "main [class*='Queue']",
        "main [class*='rows']", "main [class*='Rows']",
        "main [class*='items']", "main [class*='Items']",
        "main [class*='inbox']", "main [class*='Inbox']",
        "main [class*='history']", "main [class*='History']",
        "main [class*='decisions']", "main [class*='Decisions']",
        "main [class*='activity']", "main [class*='Activity']",
        "main [class*='results']", "main [class*='Results']",
        "main [class*='cards']", "main [class*='Cards']",
        "main [class*='grid']", "main [class*='Grid']",
      ].join(",");
      const seen = new Set<HTMLElement>();
      Array.from(document.querySelectorAll<HTMLElement>(selector)).forEach((container, index) => {
        if (seen.has(container)) return;
        seen.add(container);
        if (container.closest(".platformListPagination") || container.querySelector(":scope > table")) return;
        const items = itemsFor(container);
        if (items.length) paginate(`${pathname}:generic:${index}`, container, items);
      });
    };

    function applyAll() {
      if (disposed) return;
      mirrorExisting();
      paginateGeneric();
    }

    const refresh = () => applyAll();
    applyAll();
    const timer = window.setInterval(applyAll, 1000);
    document.addEventListener("input", refresh, true);
    document.addEventListener("change", refresh, true);
    window.addEventListener("focus", refresh);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("input", refresh, true);
      document.removeEventListener("change", refresh, true);
      window.removeEventListener("focus", refresh);
      pairs.forEach(({ top, bottom }) => { top.remove(); bottom.remove(); });
      mirrors.forEach((mirror) => mirror.remove());
      document.querySelectorAll<HTMLElement>("[data-platform-dual-hidden='true']").forEach(show);
    };
  }, [pathname]);

  return null;
}
