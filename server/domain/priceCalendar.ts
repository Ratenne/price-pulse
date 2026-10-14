export function koreaYearMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}

export function completedPriceWindow(now = new Date()) {
  const currentMonth = koreaYearMonth(now);
  const [year, month] = currentMonth.split("-").map(Number);
  return {
    currentMonth,
    fromMonth: new Date(Date.UTC(year, month - 7, 1)).toISOString().slice(0, 7),
  };
}
