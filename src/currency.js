// src/currency.js
function sumLine(items, usdToMxn) {
  let mxn = 0, usd = 0;
  for (const it of items) {
    const qty = it.qty ?? it.hours ?? 0;
    const price = it.unitPrice ?? it.ratePerHour ?? 0;
    const total = qty * price;
    if ((it.currency || 'MXN') === 'USD') usd += total; else mxn += total;
  }
  return { mxn, usd, mxnAll: mxn + usd * usdToMxn, usdAll: usd + mxn / usdToMxn };
}

export function calcTotals({ parts=[], consumables=[], labor=[] }, usdToMxn=18.2, taxRate=0.16) {
  const a = sumLine(parts, usdToMxn);
  const b = sumLine(consumables, usdToMxn);
  const c = sumLine(labor, usdToMxn);
  const subtotalMXN = a.mxnAll + b.mxnAll + c.mxnAll;
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
