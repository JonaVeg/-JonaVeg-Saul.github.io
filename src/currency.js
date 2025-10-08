// src/currency.js
function sum(items, usdToMxn) {
  let mxn = 0, usd = 0;
  for (const it of items) {
    const qty = Number(it.qty ?? it.hours ?? 0);
    const price = Number(it.unitPrice ?? it.ratePerHour ?? 0);
    const total = qty * price;
    (it.currency === 'USD') ? usd += total : mxn += total;
  }
  return {
    subtotalMXN: mxn + usd * usdToMxn,
    subtotalUSD: usd + mxn / usdToMxn
  };
}

export function calcTotals({ parts=[], consumables=[], labor=[] }, usdToMxn=18.2, taxRate=0.16) {
  const a = sum(parts, usdToMxn);
  const b = sum(consumables, usdToMxn);
  const c = sum(labor, usdToMxn);
  const subtotalMXN = a.subtotalMXN + b.subtotalMXN + c.subtotalMXN;
  const taxMXN = subtotalMXN * taxRate;
  const totalMXN = subtotalMXN + taxMXN;

  const subtotalUSD = subtotalMXN / usdToMxn;
  const taxUSD = taxMXN / usdToMxn;
  const totalUSD = subtotalUSD + taxUSD;

  return {
    mx: { subtotal: subtotalMXN, tax: taxMXN, total: totalMXN },
    us: { subtotal: subtotalUSD, tax: taxUSD, total: totalUSD }
  };
}
