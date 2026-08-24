export type WealthCurrency = "SAR" | "USD";

export const USD_SAR = 3.75;

export function fromSar(valueSar: number, currency: WealthCurrency) {
  return currency === "USD" ? valueSar / USD_SAR : valueSar;
}

export function toSar(value: number, currency: WealthCurrency) {
  return currency === "USD" ? value * USD_SAR : value;
}

export function formatWealthNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatWealthMoney(valueSar: number, currency: WealthCurrency, digits = 2) {
  const value = fromSar(valueSar, currency);
  return currency === "USD" ? `$${formatWealthNumber(value, digits)}` : `${formatWealthNumber(value, digits)} ر.س`;
}

export function wealthCurrencyLabel(currency: WealthCurrency) {
  return currency === "USD" ? "دولار أمريكي" : "ريال سعودي";
}
