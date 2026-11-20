// Small presentational building blocks shared by every page.

export function pageHeading(kicker, title, description, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}

export function metric(label, value, icon, foot = "") {
  return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`;
}

export function empty(message, sub = "Nothing to display here yet.") {
  return `<div class="empty-state"><strong>${message}</strong>${sub}</div>`;
}
