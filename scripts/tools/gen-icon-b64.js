const icons = {
  first_sort: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20c0-5 2-8 7-10-1 5-4 7-9 8"/><path d="M5 14c2-4 5-6 9-7-1 4-3 7-7 9"/><path d="M12 20v-5"/></svg>`,
  online_novice: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7l1.5-2h5L16 7"/><circle cx="12" cy="13" r="3"/></svg>`,
  device_novice: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h6"/><path d="M5 7h14"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v5M14 11v5"/></svg>`,
  category_collector: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,
  streak_3_days: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>`,
  points_100: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23b8d6ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m12 7 1.5 3 3.5.5-2.5 2.4.6 3.6L12 15l-3.1 1.5.6-3.6L7 10.5l3.5-.5z"/></svg>`,
};

for (const [k, v] of Object.entries(icons)) {
  const b64 = Buffer.from(v).toString('base64');
  console.log(`${k}|||data:image/svg+xml;base64,${b64}`);
}
