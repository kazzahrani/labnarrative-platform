"use client";

import { useEffect } from "react";

const STATUS_ORDER: Record<string, number> = {
  "awaiting final review": 0,
  "in production": 1,
  "revision requested": 2,
  "approved to send": 3,
  "needs attention": 4,
  queued: 5,
  qualified: 6,
  discovered: 7,
  paused: 8,
  replied: 9,
  interested: 10,
  rejected: 90,
  "email sent": 100,
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findPipelineHistoryTable(): HTMLTableElement | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));

  return tables.find((table) => {
    const headings = Array.from(table.querySelectorAll("thead th")).map((heading) => normalize(heading.textContent ?? ""));
    return ["pi", "institution", "score", "status", "priority", "added"].every((heading) => headings.includes(heading));
  }) ?? null;
}

function sortPipelineHistory() {
  if (window.location.pathname !== "/admin/automation") return;

  const table = findPipelineHistoryTable();
  const tbody = table?.tBodies.item(0);
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  if (rows.length < 2) return;

  rows.forEach((row, index) => {
    if (!row.dataset.pipelineOriginalIndex) {
      row.dataset.pipelineOriginalIndex = String(index);
    }
  });

  const sortedRows = [...rows].sort((left, right) => {
    const leftStatus = normalize(left.cells.item(3)?.textContent ?? "");
    const rightStatus = normalize(right.cells.item(3)?.textContent ?? "");
    const statusDifference = (STATUS_ORDER[leftStatus] ?? 50) - (STATUS_ORDER[rightStatus] ?? 50);

    if (statusDifference !== 0) return statusDifference;

    const leftPriority = Number.parseInt(left.cells.item(4)?.textContent?.trim() ?? "", 10);
    const rightPriority = Number.parseInt(right.cells.item(4)?.textContent?.trim() ?? "", 10);
    const priorityDifference = (Number.isFinite(leftPriority) ? leftPriority : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightPriority) ? rightPriority : Number.MAX_SAFE_INTEGER);

    if (priorityDifference !== 0) return priorityDifference;

    return Number(left.dataset.pipelineOriginalIndex ?? 0) - Number(right.dataset.pipelineOriginalIndex ?? 0);
  });

  const orderChanged = rows.some((row, index) => row !== sortedRows[index]);
  if (orderChanged) tbody.append(...sortedRows);
}

export default function PipelineHistorySortEnhancer() {
  useEffect(() => {
    let scheduled = false;

    const scheduleSort = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        sortPipelineHistory();
      });
    };

    scheduleSort();

    const observer = new MutationObserver(scheduleSort);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", scheduleSort);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", scheduleSort);
    };
  }, []);

  return null;
}
