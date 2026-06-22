# AWS SAP 스터디 트래커 📚

### 🔗 https://silano08.github.io/sap-assap-gang/

AWS Solutions Architect Professional 공부 진척을 **로그 파일 하나로** 관리하는 가벼운 대시보드.
DB·백엔드 없음. `study-log.jsonl` 만 수정/커밋하면 어디서든 진도가 보입니다.

> 둘이 같이 쓰기 좋아요(가연·소울) — 각자 자기 줄을 추가하고 push 하면 됨.

## 기능

- ⏱ **타이머** — 공부 시간 측정, 멈추면 입력칸에 분 단위 자동 기입
- 📕 **오답노트** — 문제번호 + 메모, 최신순 모아보기
- ✅ **오늘 강의 진도** / **덤프 푼 문제 수** / **정답률(%)**
- 💡 **오늘 가장 헷갈린 개념 1개**
- 📈 **최근 7일 추이** — 공부시간 막대 + 덤프/정답률
- 🔥 **연속 학습일(streak)**
- 👥 **상단 토글 `가연 | 소울 | 합계`** — 슬라이딩 인디케이터 + 페이지 전환 애니메이션
  - 사람 탭: 그 사람 대시보드 + **타이머·기록 입력**(개인 뷰에서만)
  - **합계**: 입력 카드 없이 **비교 전용** — 오늘 둘 합산(공부시간·덤프·정답률·오답) + 두 사람 오답노트(이름표) + 날짜별 **두 사람 막대 나란히**(가연=주황, 소울=파랑)
  - **둘이 비교 카드**(항상 표시): 최근 7일 공부시간·덤프·정답률·연속, 1등 값은 강조
  - 로그가 비어 있어도 토글에는 `가연 · 소울`이 항상 떠요(첫 기록 추가용)
- ⚡ **깃 자동 커밋(선택)** — 토큰 한 번 넣으면 "오늘 기록 추가"가 **브라우저에서 바로 깃 커밋**(복붙·터미널 불필요, 동적 앱처럼)

## 데이터 구조 — `study-log.jsonl`

**하루 = 한 줄(JSON)**. git diff 가 깔끔하고 충돌이 거의 없습니다.

```json
{"user":"가연","date":"2026-06-19","studyMin":120,"lecture":"Sec5 / L23","dumps":30,"correct":24,"problems":[{"id":"Q123","ok":false,"note":"DMS는 스키마 변환 X"},{"id":"Q124","ok":true,"note":""}],"confusing":"6R 마이그레이션 전략 구분"}
```

| 필드 | 의미 | 비고 |
|------|------|------|
| `user` | 작성자 이름 | 유저 선택/비교 기준 (없으면 "나") |
| `date` | 날짜 `YYYY-MM-DD` | 필수 (정렬 기준) |
| `studyMin` | 공부 시간(분) | 타이머값 |
| `lecture` | 오늘 강의 진도 | 자유 텍스트 |
| `dumps` | 덤프 푼 문제 수 | 정답률 분모 |
| `correct` | 맞은 문제 수 | 정답률 = correct/dumps |
| `problems[]` | 문제별 기록 | `ok:false` 만 오답노트에 표시 |
| `confusing` | 가장 헷갈린 개념 1개 | |

모든 필드는 `date` 빼고 선택. 없으면 그냥 `–` 로 표시됩니다.

## 기록하는 법 (3가지)

**A. 깃 자동 커밋 (제일 편함, 동적처럼)**
1. 개인 탭(가연/소울) → 입력 카드 하단 **`⚙ 깃 자동 커밋`** 펼치기
2. [fine-grained 토큰](https://github.com/settings/personal-access-tokens/new) 발급 — Repository access: *Only select repositories → `sap-assap-gang`*, Permissions: **Contents: Read and write** → 토큰 칸에 붙여넣고 **저장**(`연결됨 ✓`)
3. 이제 타이머 돌리고 값 입력 → **"오늘 기록 추가"** → `✓ 깃에 커밋됨`. 끝.
   - 토큰은 **이 브라우저에만** 저장(코드·깃엔 없음). 소울도 자기 브라우저에 자기 토큰. 공용 PC 금지, 언제든 revoke 가능.

**B. 입력폼 + 수동 커밋 (토큰 없이)**
1. **"오늘 기록 추가"** → 화면 즉시 반영(이 브라우저에 저장) + 복붙용 JSONL 한 줄 표시 → **📋 복사**
2. `study-log.jsonl` 맨 아래에 붙여넣기 → commit & push
   (제일 쉬운 커밋: GitHub 웹에서 [`study-log.jsonl` 편집](https://github.com/silano08/sap-assap-gang/edit/main/study-log.jsonl) → 붙여넣기 → Commit changes)

**C. 직접 손편집**
- `study-log.jsonl` 에 한 줄 추가. 새로고침하면 반영.

> 데이터 모델은 **(이름+날짜) 하루 한 줄** — 같은 날 다시 추가하면 그 줄이 교체돼요(중복 X).

## 어디서든 보기 — GitHub Pages

이미 배포돼 있어요 → **https://silano08.github.io/sap-assap-gang/**
(레포 `silano08/sap-assap-gang`, Pages: `main` / `/ (root)`)

이후엔 **로그만 커밋**하면 어디서든 최신 진도 확인 끝. 로컬에서 재배포할 때:

```bash
cd aws-sap-tracker
git add . && git commit -m "log: 오늘 공부" && git push
# → Pages가 ~25초 뒤 자동 재빌드
```

## 로컬에서 보기

`index.html` 더블클릭(`file://`)은 브라우저 보안 때문에 로그 자동읽기가 막힐 수 있어요.
그땐 화면의 **파일 선택** 폴백을 쓰거나, 가벼운 로컬 서버로 여세요:

```bash
python -m http.server 8000   # → http://localhost:8000
```

## 파일 구성

```
aws-sap-tracker/
├── index.html       대시보드 마크업
├── style.css        스타일 (시각적 위계 중심)
├── app.js           로그 읽기 + 타이머 + localStorage + 깃 자동커밋
├── study-log.jsonl  ★ 데이터 (이것만 관리)
├── .gitignore       windows nul 등 제외
└── README.md
```
