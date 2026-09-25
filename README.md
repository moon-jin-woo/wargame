# wargame

대한민국 **행정동을 실제 지도 영토로 사용하는 웹 기반 실시간 영역 점령 게임** 프로토타입입니다.

현재 게임은 현실의 군사 조직이나 무기 체계를 재현하지 않고, 행정동별 `병력 지수 / 보급 지수 / 인접 관계`만 사용하는 추상 전략 게임으로 설계되어 있습니다.

## 현재 구현

- React + TypeScript + Vite
- MapLibre GL JS
- OpenStreetMap 래스터 배경 지도
- 최신 대한민국 행정동 경계 자동 로딩
- 약 3,500개 행정동을 개별 게임 영토로 사용
- 공유 경계선 기반 인접 행정동 그래프 생성
- 도서 지역을 위한 추상 연결
- 시작 행정동 선택
- 플레이어 + 3개 AI 세력
- 실시간 틱, 일시정지, 1x/2x/4x
- 인접 영토 점령
- 행정동별 병력/보급 지수
- 전국 점령 승리 조건
- 행정동 이름/주소 검색
- 브라우저 저장/불러오기 + 10틱 자동 저장
- 반응형 웹 UI

## 실행

Node.js 20 이상 권장.

```bash
npm install
npm run dev
```

프로덕션 빌드 검증:

```bash
npm run build
```

## 지도 및 행정동 데이터

### OpenStreetMap

배경 지도는 OpenStreetMap 표준 타일을 사용합니다.

- Data © OpenStreetMap contributors
- https://www.openstreetmap.org/copyright

현재 표준 타일 서버는 개발 프로토타입 용도입니다. 공개 서비스 트래픽이 커지면 OSM 타일 사용 정책에 맞는 별도 타일 제공자 또는 자체 호스팅으로 교체해야 합니다.

### 대한민국 행정동 경계

행정동 폴리곤은 npm 패키지 `admdongkor`의 웹용 light 데이터를 사용합니다.

- 프로젝트: https://github.com/vuski/admdongkor
- 원자료: 통계청 SGIS 행정동 경계
- 데이터 라이선스: CC BY 4.0 / 공공누리 제1유형 출처표시
- 좌표계: light 데이터는 EPSG:4326

앱은 `admdongkor.versions()`의 최신 시점을 선택하고 `get(version, 'emd', { detail: false })`로 행정동 경계를 불러옵니다.

## 게임 인접성

행정동 폴리곤이 동일한 경계 선분을 공유하면 서로 인접한 영토로 처리합니다. 육상 경계가 없는 섬 권역 때문에 게임 그래프가 분리되는 경우, 각 분리 권역을 가장 가까운 본토 권역에 하나의 **추상 연결**로 이어 전국 점령이 가능하도록 합니다.

## 프로젝트 구조

```
src/
├── adminData.ts   # 행정동 다운로드, 중심점, 인접성 그래프
├── game.ts        # 게임 상태, 점령, AI, 틱
├── persistence.ts # 로컬 저장/복원
├── App.tsx        # MapLibre 지도와 UI
├── types.ts
├── main.tsx
└── styles.css
```

## 다음 개발 후보

- 세력 수와 세력명 설정
- 미니맵 및 전국 전황 요약
- 추상화된 도로 연결도에 따른 이동 비용
- 난이도 설정
- AI 의사결정 개선
- 정적 호스팅 배포
