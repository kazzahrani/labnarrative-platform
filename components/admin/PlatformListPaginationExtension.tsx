"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PAGE_SIZES = [5, 10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_STORAGE_KEY = "labnarrative_admin_list_page_size";

type PaginationState = {
  page: number;
  pageSize: number;
  signature: string;
};

type ControlPair = {
  top: HTMLDivElement;
  bottom: HTMLDivElement;
};

function text(value: string | null | undefined) {
  return (value || "").trim();
}

function pageNumbers(page: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const values: Array<number | "…"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) values.push("…");
  for (let value = start; value <= end; value += 1) values.push(value);
  if (end < total - 1) values.push("…");
  values.push(total);
  return values;
}

function preferredPageSize(): number {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    if (PAGE_SIZES.includes(stored as (typeof PAGE_SIZES)[number])) return stored;
  } catch {
    // Storage is optional; fall back to the platform default.
  }
  return DEFAULT_PAGE_SIZE;
}

function savePreferredPageSize(value: number) {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures; pagination still works for the current page.
  }
}

function rememberDisplay(item: HTMLElement) {
  if (item.dataset.platformExtensionDisplay !== undefined) return;
  const current = item.style.getPropertyValue("display");
  const priority = item.style.getPropertyPriority("display");
  item.dataset.platformExtensionDisplay = current || "__empty__";
  item.dataset.platformExtensionDisplayPriority = priority || "__empty__";
}

function restoreDisplay(item: HTMLElement) {
  rememberDisplay(item);
  const value = item.dataset.platformExtensionDisplay === "__empty__"
    ? ""
    : item.dataset.platformExtensionDisplay || "";
  const priority = item.dataset.platformExtensionDisplayPriority === "__empty__"
    ? ""
    : item.dataset.platformExtensionDisplayPriority || "";

  if (!value) item.style.removeProperty("display");
  else item.style.setProperty("display", value, priority);
  delete item.dataset.platformExtensionHidden;
}

function hideItem(item: HTMLElement) {
  rememberDisplay(item);
  item.style.setProperty("display", "none", "important");
  item.dataset.platformExtensionHidden = "true";
}

function isAvailable(item: HTMLElement) {
  if (item.dataset.platformExtensionHidden === "true") return true;
  return window.getComputedStyle(item).display !== "none";
}

function isStructuralContainer(element: HTMLElement) {
  const identity = `${element.className || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  return /metric|summary|stat|toolbar|filter|tabs?|nav|actions?|header|footer|hero|topbar|controls?/.test(identity);
}

function listIdentity(element: HTMLElement) {
  return `${element.className || ""} ${element.getAttribute("role") || ""}`.toLowerCase();
}

function candidateItems(container: HTMLElement): HTMLElement[] {
  if (container.closest(".platformListPagination")) return [];
  if (["NAV", "HEADER", "FOOTER", "FORM"].includes(container.tagName)) return [];
  if (isStructuralContainer(container)) return [];

  const direct = Array.from(container.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && !child.classList.contains("platformListPagination"),
  );
  if (!direct.length) return [];

  if (container.tagName === "UL" || container.tagName === "OL") {
    return direct.filter((item) => item.tagName === "LI");
  }

  if (container.getAttribute("role") === "list") {
    const roleItems = direct.filter((item) => item.getAttribute("role") === "listitem");
    return roleItems.length ? roleItems : direct;
  }

  const semantic = direct.filter((item) => ["ARTICLE", "LI"].includes(item.tagName));
  const identity = listIdentity(container);
  const explicitlyListLike = /list|queue|rows|items|inbox|history|decisions|activity|results|cards/.test(identity);
  const gridLike = /grid/.test(identity);

  if (semantic.length >= 1 && explicitlyListLike) return semantic;
  if (semantic.length >= 5 && gridLike) return semantic;

  if (!explicitlyListLike) return [];

  const eligible = direct.filter((item) => !["H1", "H2", "H3", "P", "SPAN", "BUTTON", "LABEL"].includes(item.tagName));
  if (!eligible.length) return [];

  const first = eligible[0];
  const firstClass = text(first.className).split(/\s+/).filter(Boolean)[0] || "";
  const repeated = eligible.filter((item) => {
    if (item.tagName !== first.tagName) return false;
    if (!firstClass) return true;
    return item.classList.contains(firstClass);
  });

  return repeated.length >= 2 ? repeated : [];
}

function keyFor(item: HTMLElement, index: number) {
  return item.getAttribute("data-id")
    || item.id
    || text(item.querySelector("h1,h2,h3,h4,strong")?.textContent)
    || text(item.textContent).slice(0, 100)
    || String(index);
}

function findMirrorBottomAnchor(topControl: HTMLElement): Element | null {
  const anchor = topControl.nextElementSibling;
  if (!anchor) return null;

  if (anchor.tagName === "TABLE" || anchor.querySelector("table")) return anchor;
  if (["UL", "OL"].includes(anchor.tagName) || anchor.getAttribute("role") === "list") return anchor;

  if (anchor.tagName === "ARTICLE") {
    let last: Element = anchor;
    let cursor = anchor.nextElementSibling;
    while (cursor && cursor.tagName === "ARTICLE" && !cursor.classList.contains("platformListPagination")) {
      last = cursor;
      cursor = cursor.nextElementSibling;
    }
    return last;
  }

  return anchor;
}

export default function PlatformListPaginationExtension() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin") || pathname.startsWith("/admin/preview")) return;

    let disposed = false;
    let observer: MutationObserver | null = null;
    let frame = 0;
    const states = new Map<string, PaginationState>();
    const controls = new Map<string, ControlPair>();
    const mirrors = new Map<string, HTMLDivElement>();

    const observe = () => {
      if (!disposed && observer) observer.observe(document.body, { childList: true, subtree: true });
    };

    const runQuietly = (task: () => void) => {
      observer?.disconnect();
      try {
        task();
      } finally {
        observe();
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyAll();
      });
    };

    const ensureState = (id: string, signature: string, itemCount: number) => {
      let state = states.get(id);
      if (!state) {
        state = { page: 1, pageSize: preferredPageSize(), signature };
        states.set(id, state);
      } else if (state.signature !== signature) {
        state.signature = signature;
        state.page = 1;
      }
      const totalPages = Math.max(1, Math.ceil(itemCount / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      return state;
    };

    const ensureControlPair = (id: string, anchor: HTMLElement) => {
      let pair = controls.get(id);
      if (!pair || !pair.top.isConnected || !pair.bottom.isConnected) {
        const top = document.createElement("div");
        const bottom = document.createElement("div");
        top.className = "platformListPagination platformListPaginationExtension";
        bottom.className = "platformListPagination platformListPaginationBottom platformListPaginationExtension";
        top.dataset.platformExtensionId = id;
        bottom.dataset.platformExtensionId = id;
        pair = { top, bottom };
        controls.set(id, pair);
      }

      if (pair.top.nextElementSibling !== anchor) anchor.insertAdjacentElement("beforebegin", pair.top);
      if (anchor.nextElementSibling !== pair.bottom) anchor.insertAdjacentElement("afterend", pair.bottom);
      return pair;
    };

    const renderOne = (
      control: HTMLDivElement,
      itemCount: number,
      state: PaginationState,
      refresh: () => void,
    ) => {
      const totalPages = Math.max(1, Math.ceil(itemCount / state.pageSize));
      const start = itemCount === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
      const end = Math.min(itemCount, state.page * state.pageSize);
      control.replaceChildren();

      const summary = document.createElement("span");
      summary.className = "platformListPaginationSummary";
      summary.textContent = `${start}–${end} of ${itemCount}`;
      control.append(summary);

      const right = document.createElement("div");
      right.className = "platformListPaginationControls";

      const sizeLabel = document.createElement("label");
      sizeLabel.className = "platformListPageSize";
      sizeLabel.append(document.createTextNode("Show "));
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
        savePreferredPageSize(state.pageSize);
        state.page = 1;
        refresh();
      });
      sizeLabel.append(select);
      right.append(sizeLabel);

      const buttons = document.createElement("div");
      buttons.className = "platformListPageButtons";
      const addButton = (label: string, target: number, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        if (current) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => {
          state.page = target;
          refresh();
        });
        buttons.append(button);
      };

      addButton("‹", Math.max(1, state.page - 1), state.page <= 1);
      pageNumbers(state.page, totalPages).forEach((value) => {
        if (value === "…") {
          const ellipsis = document.createElement("span");
          ellipsis.className = "platformListPageEllipsis";
          ellipsis.textContent = "…";
          buttons.append(ellipsis);
        } else {
          addButton(String(value), value, false, value === state.page);
        }
      });
      addButton("›", Math.min(totalPages, state.page + 1), state.page >= totalPages);
      right.append(buttons);
      control.append(right);
    };

    const paginateContainer = (id: string, container: HTMLElement, items: HTMLElement[]) => {
      if (!items.length) return;
      if (container.previousElementSibling?.classList.contains("platformListPagination")) return;
      if (items.some((item) => item.dataset.platformPaginationDisplay !== undefined)) return;

      const available = items.filter(isAvailable);
      if (!available.length) return;
      const signature = available.map(keyFor).join("|");
      const state = ensureState(id, signature, available.length);
      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;

      available.forEach((item, index) => {
        if (index >= start && index < end) restoreDisplay(item);
        else hideItem(item);
      });

      const pair = ensureControlPair(id, container);
      const refresh = () => runQuietly(() => paginateContainer(id, container, items));
      renderOne(pair.top, available.length, state, refresh);
      renderOne(pair.bottom, available.length, state, refresh);
    };

    const mirrorExistingControls = () => {
      const originals = Array.from(document.querySelectorAll<HTMLDivElement>(
        ".platformListPagination[data-platform-pagination-id], .platformListPagination[data-platform-native-pagination]",
      )).filter((node) => !node.classList.contains("platformListPaginationBottom"));

      originals.forEach((original, index) => {
        const id = original.dataset.platformPaginationId || original.dataset.platformNativePagination || `${pathname}:native:${index}`;
        const key = `${pathname}:${id}`;
        const anchor = findMirrorBottomAnchor(original);
        if (!anchor) return;

        let mirror = mirrors.get(key);
        if (!mirror || !mirror.isConnected) {
          mirror = document.createElement("div");
          mirror.className = "platformListPagination platformListPaginationBottom platformListPaginationMirror";
          mirror.dataset.platformMirrorId = key;
          mirrors.set(key, mirror);
        }
        if (anchor.nextElementSibling !== mirror) anchor.insertAdjacentElement("afterend", mirror);

        mirror.innerHTML = original.innerHTML;
        const sourceSelects = Array.from(original.querySelectorAll<HTMLSelectElement>("select"));
        Array.from(mirror.querySelectorAll<HTMLSelectElement>("select")).forEach((select, selectIndex) => {
          const source = sourceSelects[selectIndex];
          if (!source) return;
          select.value = source.value;
          select.addEventListener("change", () => {
            source.value = select.value;
            source.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });

        const sourceButtons = Array.from(original.querySelectorAll<HTMLButtonElement>("button"));
        Array.from(mirror.querySelectorAll<HTMLButtonElement>("button")).forEach((button, buttonIndex) => {
          const source = sourceButtons[buttonIndex];
          if (!source) return;
          button.disabled = source.disabled;
          if (source.getAttribute("aria-current")) button.setAttribute("aria-current", source.getAttribute("aria-current") || "page");
          else button.removeAttribute("aria-current");
          button.addEventListener("click", () => source.click());
        });
      });
    };

    const paginateGenericLists = () => {
      const selectors = [
        "main ul",
        "main ol",
        "main [role='list']",
        "main [class*='list']",
        "main [class*='List']",
        "main [class*='queue']",
        "main [class*='Queue']",
        "main [class*='rows']",
        "main [class*='Rows']",
        "main [class*='items']",
        "main [class*='Items']",
        "main [class*='inbox']",
        "main [class*='Inbox']",
        "main [class*='history']",
        "main [class*='History']",
        "main [class*='decisions']",
        "main [class*='Decisions']",
        "main [class*='activity']",
        "main [class*='Activity']",
        "main [class*='results']",
        "main [class*='Results']",
        "main [class*='cards']",
        "main [class*='Cards']",
        "main [class*='grid']",
        "main [class*='Grid']",
      ];

      const seen = new Set<HTMLElement>();
      const containers = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")));
      containers.forEach((container, index) => {
        if (seen.has(container)) return;
        seen.add(container);
        if (container.closest(".platformListPagination")) return;
        if (container.querySelector(":scope > table")) return;
        const items = candidateItems(container);
        if (!items.length) return;
        paginateContainer(`${pathname}:generic:${index}`, container, items);
      });
    };

    function applyAll() {
      if (disposed) return;
      runQuietly(() => {
        mirrorExistingControls();
        paginateGenericLists();
      });
    }

    observer = new MutationObserver(schedule);
    observe();
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    applyAll();

    return () => {
      disposed = true;
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      controls.forEach(({ top, bottom }) => {
        top.remove();
        bottom.remove();
      });
      mirrors.forEach((mirror) => mirror.remove());
      document.querySelectorAll<HTMLElement>("[data-platform-extension-hidden='true']").forEach(restoreDisplay);
    };
  }, [pathname]);

  return null;
}
