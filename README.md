# 서울 초1 체험·방문 가이드

정적 웹(HTML/CSS/JS) + 서울시 공공서비스예약 Open API 자동 수집.

## 로컬 실행
```
node scripts/fetch-data.mjs        # 데이터 수집 (키 없으면 샘플 5건씩)
npx serve .                        # http://localhost:3000
```

## 전체 데이터 수집 (API 키)
1. https://data.seoul.go.kr 가입 → 인증키 신청(무료, 즉시 발급)
2. `SEOUL_API_KEY=발급키 node scripts/fetch-data.mjs`

## 배포 + 자동 갱신 (GitHub Pages)
1. GitHub 저장소에 push
2. Settings → Secrets → Actions 에 `SEOUL_API_KEY` 등록
3. Settings → Pages → Branch: main / root
4. `.github/workflows/update-data.yml` 이 매일 2회 data/events.json 갱신

## 구조
- `scripts/fetch-data.mjs` 수집·초1 대상 판별·정리 (`fitsGrade1`)
- `data/events.json` 프론트가 읽는 데이터
- `index.html`, `app.js`, `style.css` 화면
