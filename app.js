const $ = (id) => document.getElementById(id);
const DAY = 86400000;
const URGENT_DAYS = 7;
let items = [];
let activeCat = '';
let activeTab = 'all';

// ---- 추천 메뉴 ----
const INDOOR_KW = /박물관|미술관|도서관|과학관|전시|체험관|공연|극장|센터|교육관|실내|만들기|공방|스튜디오|아카이브|기념관|문화원|문화회관|온라인/;
const OUTDOOR_KW = /야외|숲|공원|생태|텃밭|농장|한강|캠핑|등산|탐방|둘레길|걷기|산책|트레킹|자전거|물놀이|수영장|운동장|고궁|궁궐|성곽|하천|습지|정원|나들이/;
const isIndoor = (e) => {
  const t = e.title + ' ' + e.place + ' ' + e.category;
  return INDOOR_KW.test(t) && !OUTDOOR_KW.test(t);
};

function weekendRange(now = new Date()) {
  const dow = now.getDay();
  const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dow === 0 ? -1 : 6 - dow));
  const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1, 23, 59, 59);
  return { start: sat.getTime(), end: sun.getTime(), label: `${fmt(sat.toISOString(), false)}~${fmt(sun.toISOString(), false)}` };
}
const availableThisWeekend = (e, wk) => {
  if (!e.useStart && !e.useEnd) return false;
  const us = e.useStart ? new Date(e.useStart).getTime() : -Infinity;
  const ue = e.useEnd ? new Date(e.useEnd).getTime() : Infinity;
  const applyOpens = e.applyStart ? new Date(e.applyStart).getTime() : 0;
  return us <= wk.end && ue >= wk.start && applyOpens <= wk.end;
};

const TABS = [
  { key: 'all', label: '🎯 전체 추천', desc: '' },
  { key: 'weekend', label: '🗓 이번 주말', desc: '' },
  { key: 'indoor', label: '☔ 비 오는 날 실내', desc: '박물관·도서관·전시 등 실내 체험으로 추정되는 프로그램이에요. 장소는 원문에서 한 번 더 확인하세요.' },
];

const pad = (n) => String(n).padStart(2, '0');
const fmt = (iso, withTime = true) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const base = `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`;
  return withTime ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
};
const range = (a, b) => (a || b ? `${fmt(a, false)} ~ ${fmt(b, false)}` : '-');

function calcState(e, now = Date.now()) {
  const s = e.applyStart ? new Date(e.applyStart).getTime() : 0;
  const end = e.applyEnd ? new Date(e.applyEnd).getTime() : Infinity;
  if (now < s) return { key: 'soon', at: s };
  if (now > end) return { key: 'closed', at: end };
  const left = end - now;
  const days = Math.floor(left / DAY);
  const hours = Math.floor(left / 3600000);
  let dday;
  if (end === Infinity) dday = '상시';
  else if (left < DAY) dday = hours <= 0 ? '곧 마감' : `${hours}시간 남음`;
  else dday = `D-${days}`;
  return { key: left <= URGENT_DAYS * DAY ? 'urgent' : 'open', at: end, dday };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const infoRow = (label, value) => {
  const p = el('p', 'info');
  p.append(el('b', null, label), document.createTextNode(value));
  return p;
};
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

function card(e, st, featured) {
  const c = el('article', 'card' + (featured ? ' featured' : ''));
  const img = safeUrl(e.img);
  const top = el('div', 'thumb');
  if (img) { const i = el('img'); i.src = img; i.alt = ''; i.loading = 'lazy'; i.onerror = () => i.remove(); top.append(i); }
  const badge =
    st.key === 'soon' ? `${fmt(e.applyStart)} 오픈`
    : st.dday;
  top.append(el('span', 'badge ' + st.key, badge));
  c.append(top);

  const b = el('div', 'body');
  const tags = el('div', 'tags');
  if (e.category) tags.append(el('span', 'tag', e.category));
  tags.append(el('span', 'tag ' + (e.free ? 'free' : 'paid'), e.free ? '무료' : e.fee || '유료'));
  if (e.method) tags.append(el('span', 'tag', e.method));
  b.append(tags, el('h3', null, e.title), el('div', 'place', `📍 ${e.gu ? e.gu + ' · ' : ''}${e.place}`));
  if (st.key === 'soon') b.append(infoRow('신청 오픈', fmt(e.applyStart)));
  else b.append(infoRow('신청 마감', fmt(e.applyEnd)));
  b.append(infoRow('체험 기간', range(e.useStart, e.useEnd)), infoRow('대상', e.target));
  if (e.summary) b.append(el('p', 'summary', e.summary));

  const act = el('div', 'actions');
  const url = safeUrl(e.url);
  if (url) { const a = el('a', 'btn primary', st.key === 'soon' ? '상세 보기' : '지금 신청하기'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; act.append(a); }
  if (e.lat && e.lng) {
    const m = el('a', 'btn', '지도'); m.target = '_blank'; m.rel = 'noopener';
    m.href = `https://map.kakao.com/link/map/${encodeURIComponent(e.place)},${e.lat},${e.lng}`;
    act.append(m);
  }
  b.append(act);
  c.append(b);
  return c;
}

function section(title, desc, entries, featured) {
  if (!entries.length) return null;
  const s = el('section', 'sec');
  const h = el('div', 'sec-head');
  h.append(el('h2', null, title), el('p', 'sec-desc', `${desc} · ${entries.length}개`));
  const g = el('div', 'grid' + (featured ? ' big' : ''));
  g.append(...entries.map(({ e, st }) => card(e, st, featured)));
  s.append(h, g);
  return s;
}

function render() {
  const freeOnly = $('free').checked;
  const now = Date.now();
  const wk = weekendRange();
  const all = items
    .map((e) => ({ e, st: calcState(e, now) }))
    .filter(({ e, st }) => st.key !== 'closed' && (!activeCat || e.category === activeCat) && (!freeOnly || e.free))
    .filter(({ e }) => activeTab === 'all' || (activeTab === 'weekend' ? availableThisWeekend(e, wk) : isIndoor(e)));
  const tab = TABS.find((t) => t.key === activeTab);
  const intro = activeTab === 'weekend' ? `이번 주말(${wk.label})에 체험할 수 있는 프로그램이에요.` : tab.desc;

  const byAt = (a, b) => a.st.at - b.st.at;
  const urgent = all.filter((x) => x.st.key === 'urgent').sort(byAt);
  const open = all.filter((x) => x.st.key === 'open').sort(byAt);
  const soon = all.filter((x) => x.st.key === 'soon').sort(byAt);

  const parts = [
    section('🔥 마감 임박', `${URGENT_DAYS}일 안에 신청이 끝나요`, urgent, true),
    section('✅ 지금 신청 중', '마감 빠른 순', open, false),
    section('⏰ 곧 신청 시작', '오픈 시각을 놓치지 마세요', soon, false),
  ].filter(Boolean);

  if (intro) parts.unshift(el('p', 'tab-intro', intro));
  $('root').replaceChildren(...(parts.length ? parts : [el('p', 'empty', '지금 추천할 체험이 없어요. 필터를 바꿔보세요.')]));
}

function buildTabs() {
  $('tabs').replaceChildren(
    ...TABS.map((t) => {
      const b = el('button', 'tab' + (t.key === activeTab ? ' on' : ''), t.label);
      b.type = 'button';
      b.onclick = () => { activeTab = t.key; buildTabs(); render(); };
      return b;
    }),
  );
}

function buildChips() {
  const cats = ['', ...new Set(items.map((e) => e.category).filter(Boolean))];
  $('chips').replaceChildren(
    ...cats.map((c) => {
      const b = el('button', 'chip' + (c === activeCat ? ' on' : ''), c || '전체');
      b.type = 'button';
      b.onclick = () => { activeCat = c; buildChips(); render(); };
      return b;
    }),
  );
}

fetch('data/events.json')
  .then((r) => r.json())
  .then((d) => {
    items = d.items;
    $('updated').textContent = `(최종 갱신: ${new Date(d.updatedAt).toLocaleString('ko-KR')})`;
    $('sampleNote').hidden = !d.sample;
    $('free').addEventListener('input', render);
    buildTabs();
    buildChips();
    render();
  })
  .catch(() => { $('root').replaceChildren(el('p', 'empty', '데이터를 불러오지 못했어요. (로컬에서는 `npx serve .`로 실행하세요)')); });
