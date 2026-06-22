# AWS SAP 스터디 트래커 📚

AWS Solutions Architect Professional 공부 진척을 **로그 파일 하나로** 관리하는 가벼운 대시보드.
DB·백엔드 없음. `study-log.jsonl` 만 수정/커밋하면 어디서든 진도가 보입니다.

> 동료와 같이 쓰기 좋아요 — 각자 자기 줄을 추가하고 push 하면 됨.

## 기능

- ⏱ **타이머** — 공부 시간 측정, 멈추면 입력칸에 분 단위 자동 기입
- 📕 **오답노트** — 문제번호 + 메모, 최신순 모아보기
- ✅ **오늘 강의 진도** / **덤프 푼 문제 수** / **정답률(%)**
- 💡 **오늘 가장 헷갈린 개념 1개**
- 📈 **최근 7일 추이** — 공부시간 막대 + 덤프/정답률
- 🔥 **연속 학습일(streak)**
- 👥 **상단 토글 `가연 | 동료 | 합쳐서 보기`** — 슬라이딩 인디케이터 + 페이지 전환 애니메이션
  - 사람 탭: 그 사람 대시보드만
  - **합쳐서 보기**: 오늘 둘 합산(공부시간·덤프·정답률·오답) + 두 사람 오답노트(이름표) + 날짜별 **두 사람 막대 나란히**(가연=주황, 동료=파랑)
  - **동료 비교 카드**(항상 표시): 최근 7일 공부시간·덤프·정답률·연속, 1등 값은 강조

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

## 기록하는 법 (2가지)

**A. 입력폼 사용 (쉬움)**
1. 대시보드에서 타이머 돌리고 오늘 값 입력
2. **"로그 1줄 생성 →"** 클릭 → **📋 복사**
3. `study-log.jsonl` 맨 아래에 붙여넣기 → `commit` & `push`

**B. 직접 손편집**
- `study-log.jsonl` 에 한 줄 추가. 새로고침하면 반영.

## 어디서든 보기 — GitHub Pages

```bash
cd aws-sap-tracker
git init && git add . && git commit -m "init study tracker"
git branch -M main
git remote add origin https://github.com/<유저>/<레포>.git
git push -u origin main
```

GitHub 레포 → **Settings → Pages → Branch: `main` / `/ (root)`** 저장.
잠시 뒤 `https://<유저>.github.io/<레포>/` 에서 열립니다.
이후엔 **로그만 커밋**하면 어디서든 최신 진도 확인 끝.

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
├── app.js           로그 읽기 + 타이머 + 줄 생성
├── study-log.jsonl  ★ 데이터 (이것만 관리)
└── README.md
```
