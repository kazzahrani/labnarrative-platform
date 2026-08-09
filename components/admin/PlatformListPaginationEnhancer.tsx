"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const PAGE_SIZES = [5, 10, 25, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

type PaginationState = {
  page: number;
  pageSize: number;
  signature: string;
};

type QueueItem = {
  prospectId?: string;
  piName?: string;
  institution?: string;
  score?: number | null;
};

type DashboardPayload = {
  queue?: QueueItem[];
};

function text(value: string | null | undefined): string {
  return (value || "").trim();
}

function rememberDisplay(item: HTMLElement) {
  if (item.dataset.platformPaginationDisplay !== undefined) return;
  const current = item.style.getPropertyValue("display");
  const priority = item.style.getPropertyPriority("display");
  item.dataset.platformPaginationDisplay = current || "__empty__";
  item.dataset.platformPaginationDisplayPriority = priority || "__empty__";
}

function restoreDisplay(item: HTMLElement) {
  rememberDisplay(item);
  const value = item.dataset.platformPaginationDisplay === "__empty__"
    ? ""
    : item.dataset.platformPaginationDisplay || "";
  const priority = item.dataset.platformPaginationDisplayPriority === "__empty__"
    ? ""
    : item.dataset.platformPaginationDisplayPriority || "";

  if (!value) item.style.removeProperty("display");
  else item.style.setProperty("display", value, priority);
  delete item.dataset.platformPaginationHidden;
}

function hideItem(item: HTMLElement) {
  rememberDisplay(item);
  item.style.setProperty("display", "none", "important");
  item.dataset.platformPaginationHidden = "true";
}

function isAvailableToPaginator(item: HTMLElement): boolean {
  if (item.dataset.platformPaginationHidden === "true") return true;
  return window.getComputedStyle(item).display !== "none";
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

export default function PlatformListPaginationEnhancer() {
  useEffect(() => {
    const pathname = window.location.pathname;
    if (
      !pathname.startsWith("/admin") ||
      pathname.startsWith("/admin/preview") ||
      pathname === "/admin/sites" ||
      pathname === "/admin/sites-v3"
    ) return;

    let disposed = false;
    let observer: MutationObserver | null = null;
    let frame = 0;
    let queueItems: QueueItem[] | null = null;
    let queueTimer = 0;
    const states = new Map<string, PaginationState>();
    const controls = new Map<string, HTMLDivElement>();

    const observe = () => {
      if (!disposed && observer) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    const runWithoutObserver = (task: () => void) => {
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

    const scheduleFromEvent = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".platformListPagination")) return;
      schedule();
    };

    const ensureState = (id: string, signature: string, itemCount: number): PaginationState => {
      let state = states.get(id);
      if (!state) {
        state = { page: 1, pageSize: DEFAULT_PAGE_SIZE, signature };
        states.set(id, state);
      } else if (state.signature !== signature) {
        state.signature = signature;
        state.page = 1;
      }

      const totalPages = Math.max(1, Math.ceil(itemCount / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      return state;
    };

    const getControl = (id: string, anchor: Element): HTMLDivElement => {
      let control = controls.get(id);
      if (!control || !control.isConnected) {
        control = document.createElement("div");
        control.className = "platformListPagination";
        control.dataset.platformPaginationId = id;
        controls.set(id, control);
      }

      if (control.nextElementSibling !== anchor) {
        anchor.insertAdjacentElement("beforebegin", control);
      }
      return control;
    };

    const renderControl = (
      id: string,
      anchor: Element,
      itemCount: number,
      state: PaginationState,
      refreshCurrent: () => void,
    ) => {
      const control = getControl(id, anchor);
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
        state.page = 1;
        refreshCurrent();
      });
      sizeLabel.append(select);
      right.append(sizeLabel);

      const buttons = document.createElement("div");
      buttons.className = "platformListPageButtons";

      const addButton = (label: string, targetPage: number, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        if (current) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => {
          state.page = targetPage;
          refreshCurrent();
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

    const paginate = (
      id: string,
      items: HTMLElement[],
      anchor: Element,
      keyFor: (item: HTMLElement, index: number) => string,
    ) => {
      const availableItems = items.filter(isAvailableToPaginator);
      if (!availableItems.length) {
        controls.get(id)?.remove();
        controls.delete(id);
        return;
      }

      const signature = availableItems.map((item, index) => keyFor(item, index)).join("|");
      const state = ensureState(id, signature, availableItems.length);
      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;

      availableItems.forEach((item, index) => {
        if (index >= start && index < end) restoreDisplay(item);
        else hideItem(item);
      });

      const refreshCurrent = () => {
        runWithoutObserver(() => paginate(id, items, anchor, keyFor));
      };
      renderControl(id, anchor, availableItems.length, state, refreshCurrent);
    };

    const tableKey = (row: HTMLElement, index: number): string => {
      const slug = row.querySelector<HTMLButtonElement>("td:first-child button")?.textContent;
      const firstCell = row.querySelector<HTMLElement>("td:first-child")?.textContent;
      return text(slug) || text(firstCell) || String(index);
    };

    const paginateTables = () => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("main table"));
      tables.forEach((table, index) => {
        const tbody = table.tBodies[0];
        if (!tbody) return;
        const rows = Array.from(tbody.rows).filter((row) => {
          const onlyCell = row.cells.length === 1 ? row.cells[0] : null;
          return !(onlyCell && onlyCell.colSpan > 1);
        });
        paginate(`${pathname}:table:${index}`, rows, table, tableKey);
      });
    };

    const automationSection = (label: string): HTMLElement | null => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>("main section"));
      return sections.find((section) => {
        const kicker = section.querySelector<HTMLElement>("p")?.textContent?.trim().toLowerCase();
        return kicker === label.toLowerCase();
      }) || null;
    };

    const runCardState = (article: HTMLElement): string =>
      text(article.querySelector<HTMLElement>("p")?.textContent).toLowerCase();

    const paginateAutomationRunCards = () => {
      if (pathname !== "/admin/automation") return;
      const articles = Array.from(document.querySelectorAll<HTMLElement>("main article"));
      const groups: Array<{ id: string; states: string[] }> = [
        { id: "active", states: ["research", "build", "assets", "verify"] },
        { id: "final-review", states: ["final review"] },
        { id: "approved", states: ["approved"] },
        { id: "published", states: ["published"] },
      ];

      groups.forEach((group) => {
        const items = articles.filter((article) => group.states.includes(runCardState(article)));
        const anchor = items[0];
        if (!anchor) {
          controls.get(`${pathname}:runs:${group.id}`)?.remove();
          controls.delete(`${pathname}:runs:${group.id}`);
          return;
        }
        paginate(
          `${pathname}:runs:${group.id}`,
          items,
          anchor,
          (item, index) => text(item.querySelector("h3")?.textContent) || String(index),
        );
      });
    };

    const queueContainer = (): HTMLElement | null => {
      const section = automationSection("Eligible queue");
      if (!section) return null;
      return Array.from(section.querySelectorAll<HTMLElement>(":scope > div")).find((candidate) =>
        Array.from(candidate.children).some((child) => child instanceof HTMLDivElement && child.querySelector("strong")),
      ) || null;
    };

    const syncQueueExtras = () => {
      if (pathname !== "/admin/automation" || !queueItems) return;
      const container = queueContainer();
      if (!container) return;

      container.querySelectorAll<HTMLElement>("[data-platform-queue-extra]").forEach((node) => node.remove());
      Array.from(container.children).forEach((child) => {
        if (child instanceof HTMLParagraphElement && /showing the next 15/i.test(child.textContent || "")) {
          child.style.display = "none";
        }
      });

      queueItems.slice(15).forEach((item, offset) => {
        const index = 15 + offset;
        const row = document.createElement("div");
        row.dataset.platformQueueExtra = item.prospectId || String(index);
        Object.assign(row.style, {
          display: "grid",
          gridTemplateColumns: "32px minmax(0,1fr) auto",
          gap: "10px",
          alignItems: "center",
          padding: "10px 0",
          borderBottom: "1px solid rgba(22,35,31,.10)",
        });

        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        number.style.opacity = ".7";

        const identity = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = item.piName || "Unnamed PI";
        const institution = document.createElement("div");
        institution.textContent = item.institution || "Institution not yet recorded";
        institution.style.fontSize = "13px";
        institution.style.opacity = ".7";
        identity.append(name, institution);

        const score = document.createElement("strong");
        score.textContent = item.score == null ? "—" : String(item.score);
        row.append(number, identity, score);
        container.append(row);
      });
    };

    const paginateAutomationQueue = () => {
      if (pathname !== "/admin/automation") return;
      const container = queueContainer();
      if (!container) return;
      const items = Array.from(container.children).filter((child): child is HTMLElement =>
        child instanceof HTMLDivElement && Boolean(child.querySelector("strong")),
      );
      paginate(
        `${pathname}:queue`,
        items,
        container,
        (item, index) => text(item.querySelector("strong")?.textContent) || String(index),
      );
    };

    const paginateAutomationBlocked = () => {
      if (pathname !== "/admin/automation") return;
      const section = automationSection("Blocked safely");
      if (!section) return;
      const container = Array.from(section.querySelectorAll<HTMLElement>(":scope > div")).find((candidate) =>
        candidate.style.display === "grid" && Array.from(candidate.children).some((child) => child instanceof HTMLDivElement),
      );
      if (!container) return;
      const items = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLDivElement);
      paginate(
        `${pathname}:blocked`,
        items,
        container,
        (item, index) => text(item.querySelector("strong")?.textContent) || String(index),
      );
    };

    function applyAll() {
      if (disposed) return;
      runWithoutObserver(() => {
        document.querySelectorAll<HTMLElement>(".discoveryPagination,.productionPagination").forEach((node) => node.remove());
        paginateTables();
        if (pathname === "/admin/automation") {
          syncQueueExtras();
          paginateAutomationRunCards();
          paginateAutomationQueue();
          paginateAutomationBlocked();
        }
      });
    }

    const refreshQueue = async () => {
      if (pathname !== "/admin/automation") return;
      const { data, error } = await supabase.rpc("engine_v2_admin_dashboard");
      if (!error && data && typeof data === "object") {
        queueItems = ((data as DashboardPayload).queue || []).slice();
        schedule();
      }
    };

    observer = new MutationObserver(schedule);
    observe();
    document.addEventListener("input", scheduleFromEvent, true);
    document.addEventListener("change", scheduleFromEvent, true);
    applyAll();

    if (pathname === "/admin/automation") {
      void refreshQueue();
      queueTimer = window.setInterval(() => void refreshQueue(), 15000);
      window.addEventListener("focus", refreshQueue);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (queueTimer) window.clearInterval(queueTimer);
      window.removeEventListener("focus", refreshQueue);
      document.removeEventListener("input", scheduleFromEvent, true);
      document.removeEventListener("change", scheduleFromEvent, true);
      controls.forEach((control) => control.remove());
      document.querySelectorAll<HTMLElement>("[data-platform-pagination-hidden='true']").forEach(restoreDisplay);
      document.querySelectorAll<HTMLElement>("[data-platform-queue-extra]").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
