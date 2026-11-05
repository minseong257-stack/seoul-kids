// 서울시 공공서비스예약 Open API → 초등 1학년 참여 가능 프로그램만 추려 data/events.json 생성
// 사용: SEOUL_API_KEY=발급키 node scripts/fetch-data.mjs   (키 없으면 sample 키: 5건만 수집)
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.SEOUL_API_KEY || 'sample';
const IS_SAMPLE = KEY === 'sample';
const SERVICES = ['ListPublicReservationCulture', 'ListPublicReservationEducation'];
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/events.json');
const PAGE = 1000;

async function fetchService(name) {
  const rows = [];
  for (let start = 1; ; start += PAGE) {
    const end = IS_SAMPLE ? 5 : start + PAGE - 1;
    const url = `http://openapi.seoul.go.kr:8088/${KEY}/json/${name}/${start}/${end}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const json = await res.json();
    const body = json[name];
    if (!body) throw new Error(`${name}: ${JSON.stringify(json).slice(0, 200)}`);
    if (body.RESULT?.CODE !== 'INFO-000') {
      if (body.RESULT?.CODE === 'INFO-200') break; // 데이터 없음
      throw new Error(`${name}: ${body.RESULT?.CODE} ${body.RESULT?.MESSAGE}`);
    }
    rows.push(...body.row);
    if (IS_SAMPLE || end >= body.list_total_count) break;
  }
  return rows;
}

// ---------- 초1 대상 판정 ----------
// '유아'는 미취학(만3~5세) 대상이 대부분이라 단독으로는 초1 대상으로 보지 않음
const POSITIVE = /제한없|누구나|전체|모든|전연령|가족|어린이|초등|초1|1학년|아동|학부모|자녀|7세|8세/;
const ADULT_ONLY = /성인|청소년|중학|고등|일반인|대학|직장|노인|어르신|시니어|임산부|외국인|만19|만 19/;

export function fitsGrade1(raw) {
  const t = (raw || '').replace(/\s+/g, '').replace(/유아동반/g, '');
  const minAge = t.match(/(\d{1,2})세이상/);
  if (minAge && Number(minAge[1]) >= 9) return false; // 예: "일반인 13세 이상"
  if (!t || /제한없|누구나|전연령|전체|모든/.test(t)) return true;

  // "초등학생(2019년생~2014년생)" → 올해 초1 출생연도(올해-7) 포함 여부
  const born = t.match(/(\d{4})년생?[~\-～](\d{4})년생?/);
  if (born) {
    const y = new Date().getFullYear() - 7;
    return Math.min(+born[1], +born[2]) <= y && Math.max(+born[1], +born[2]) >= y;
  }

  // "초등 3~6학년", "초등3학년 이상" 등 → 1학년 포함 여부
  const range = t.match(/(\d)\s*[~\-～]\s*(\d)\s*학년/);
  if (range) return Number(range[1]) <= 1 && Number(range[2]) >= 1;
  const upper = t.match(/(\d)학년이상/);
  if (upper) return Number(upper[1]) <= 1;
  const single = t.match(/초등(?:학생)?\(?(\d)학년/);
  if (single && !/\d학년[^,]*\d학년/.test(t)) return Number(single[1]) === 1;
  if (/고학년|중학년/.test(t) && !/저학년|전학년|1학년/.test(t)) return false;

  // 나이 표기: 초1 = 만 6~7세 (한국 나이 8세)
  const age = t.match(/(?:만)?(\d{1,2})세?\s*[~\-～]\s*(?:만)?(\d{1,2})세/);
  if (age) return Number(age[1]) <= 8 && Number(age[2]) >= 6;
  const ageUp = t.match(/(?:만)?(\d{1,2})세이상/);
  if (ageUp && !POSITIVE.test(t.replace(/\d+세/g, ''))) return Number(ageUp[1]) <= 7;

  if (POSITIVE.test(t)) return true;
  if (ADULT_ONLY.test(t)) return false;
  return false;
}

// ---------- 정리 ----------
const clean = (s) => (s || '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const toIso = (s) => (s ? s.replace(' ', 'T').replace(/\.\d+$/, '') + '+09:00' : null);

function summarize(dtl) {
  const body = (dtl || '').split(/3\.\s*상세내용/)[1] || dtl || '';
  return clean(body.split(/4\.\s*주의사항/)[0]).slice(0, 220);
}

function normalize(r) {
  const detail = clean(r.DTLCONT);
  return {
    id: r.SVCID,
    title: clean(r.SVCNM),
    place: clean(r.PLACENM),
    gu: r.AREANM || '',
    category: r.MINCLASSNM || r.MAXCLASSNM || '',
    status: r.SVCSTATNM || '',
    target: clean(r.USETGTINFO) || '제한없음',
    free: r.PAYATNM === '무료',
    fee: r.PAYATNM || '',
    method: /추첨/.test(detail) ? '추첨' : /선착순/.test(detail) ? '선착순' : '',
    applyStart: toIso(r.RCPTBGNDT),
    applyEnd: toIso(r.RCPTENDDT),
    useStart: toIso(r.SVCOPNBGNDT),
    useEnd: toIso(r.SVCOPNENDDT),
    url: r.SVCURL,
    img: r.IMGURL || '',
    tel: r.TELNO || '',
    lat: Number(r.Y) || null,
    lng: Number(r.X) || null,
    summary: summarize(r.DTLCONT),
  };
}

async function main() {
  const all = [];
  for (const s of SERVICES) all.push(...(await fetchService(s)));
  const now = Date.now();
  const seen = new Set();
  const items = all
    .filter((r) => !seen.has(r.SVCID) && seen.add(r.SVCID))
    .filter((r) => /접수중|안내중|예약일시중지/.test(r.SVCSTATNM || ''))
    .filter((r) => fitsGrade1(r.USETGTINFO))
    .map(normalize)
    .filter((e) => !e.useEnd || new Date(e.useEnd).getTime() >= now)
    .sort((a, b) => (a.applyEnd || '9').localeCompare(b.applyEnd || '9'));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ updatedAt: new Date().toISOString(), sample: IS_SAMPLE, count: items.length, items }, null, 1),
  );
  console.log(`수집 ${all.length}건 → 초1 대상 ${items.length}건 저장 (${IS_SAMPLE ? '샘플 키' : '정식 키'})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
