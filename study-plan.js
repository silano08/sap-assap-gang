(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapStudyPlan = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "sap-study-progress-v1";

  const SECTIONS = [
    { id: "section-2", number: 2, title: "슬라이드 다운로드", lectures: 1, duration: "1분", estimate: "1분", done: true },
    { id: "section-3", number: 3, title: "자격 증명 & 페더레이션", lectures: 12, duration: "1시간 26분", estimate: "2일", done: true },
    { id: "section-4", number: 4, title: "보안", lectures: 29, duration: "1시간 59분", estimate: "2일", done: true },
    { id: "section-5", number: 5, title: "컴퓨팅(Compute) & 로드 밸런싱", lectures: 27, duration: "2시간 41분", estimate: "3일" },
    { id: "section-6", number: 6, title: "스토리지", lectures: 14, duration: "1시간 9분", estimate: "1일" },
    { id: "section-7", number: 7, title: "캐싱", lectures: 7, duration: "35분", estimate: "0.5일" },
    { id: "section-8", number: 8, title: "데이터베이스", lectures: 6, duration: "39분", estimate: "0.5일" },
    { id: "section-9", number: 9, title: "서비스 통신", lectures: 7, duration: "34분", estimate: "0.5일" },
    { id: "section-10", number: 10, title: "데이터 엔지니어링", lectures: 16, duration: "1시간 15분", estimate: "1일" },
    { id: "section-11", number: 11, title: "모니터링", lectures: 6, duration: "29분", estimate: "0.5일" },
    { id: "section-12", number: 12, title: "배포 및 인스턴스 관리", lectures: 9, duration: "43분", estimate: "0.5일" },
    { id: "section-13", number: 13, title: "비용 제어", lectures: 11, duration: "29분", estimate: "0.5일" },
    { id: "section-14", number: 14, title: "마이그레이션(Migration)", lectures: 13, duration: "56분", estimate: "1일" },
    { id: "section-15", number: 15, title: "VPC", lectures: 13, duration: "1시간 21분", estimate: "1일" },
    { id: "section-16", number: 16, title: "머신 러닝", lectures: 14, duration: "27분", estimate: "0.5일" },
    { id: "section-17", number: 17, title: "기타 서비스", lectures: 16, duration: "39분", estimate: "0.5일" },
    { id: "section-18", number: 18, title: "시험 대비 (모의고사 풀이)", lectures: 11, duration: "1시간 1분", estimate: "7일" },
    { id: "dump", number: null, title: "Dump 풀이", lectures: 0, duration: "시험 전 마무리", estimate: "마무리" },
  ];

  function sectionById(sectionId) {
    return SECTIONS.find((section) => section.id === sectionId) || SECTIONS[0];
  }

  function normalizeProgress(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item && item.user)
      .map((item) => {
        const section = sectionById(item.sectionId);
        const lecture = Math.max(0, Math.min(Number(item.lecture || 0), section.lectures || Number(item.lecture || 0)));
        return {
          user: item.user,
          sectionId: section.id,
          lecture,
          done: !!item.done,
          updatedAt: item.updatedAt || new Date().toISOString(),
        };
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function loadProgress(storage) {
    try {
      return normalizeProgress(JSON.parse(storage.getItem(KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveProgress(storage, items) {
    storage.setItem(KEY, JSON.stringify(normalizeProgress(items)));
  }

  function upsertProgress(items, progress) {
    return normalizeProgress([progress, ...normalizeProgress(items).filter((item) => item.user !== progress.user)]);
  }

  function updateProgress(storage, progress) {
    const next = upsertProgress(loadProgress(storage), progress);
    saveProgress(storage, next);
    return next;
  }

  function progressForUser(items, user) {
    return normalizeProgress(items).find((item) => item.user === user) || null;
  }

  function sectionPercent(section, lecture, done) {
    if (done) return 100;
    if (!section.lectures) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(lecture || 0) / section.lectures) * 100)));
  }

  function compareProgress(items, users) {
    return users.map((user) => {
      const progress = progressForUser(items, user);
      const section = sectionById(progress?.sectionId);
      const lecture = progress?.lecture || 0;
      const done = !!progress?.done;
      return {
        user,
        progress,
        section,
        lecture,
        done,
        percent: sectionPercent(section, lecture, done),
      };
    });
  }

  return {
    KEY,
    SECTIONS,
    loadProgress,
    saveProgress,
    updateProgress,
    upsertProgress,
    progressForUser,
    compareProgress,
    sectionById,
    sectionPercent,
  };
});
