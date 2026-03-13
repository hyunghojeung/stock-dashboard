# 프로젝트 목표
300만 원으로 1천만 원을 버는 것이 최종 목표이다.
- 과거 급등했던 종목들의 주가 차트 흐름에서 공통된 패턴을 분석한다.
- 해당 급등 패턴과 유사한 차트 형태를 보이는 현재 종목들을 탐지한다.
- 탐지된 종목에 투자하고, 발생한 수익은 전액 재투자하여 복리로 자산을 불린다.
- 이 과정을 반복하여 300만 원 → 1천만 원 달성을 목표로 한다.

# Project Rules

## UI Rules
- 종목코드가 보이는 모든 곳에는 종목명이 같이 표시한다.

## GitHub Workflow
- GitHub 소유자: hyunghojeung
- 저장소: hyunghojeung/stock-dashboard
- 기본 브랜치: main
- 작업 완료 후 반드시 커밋 → 푸시 → PR 생성 → PR 머지까지 직접 수행한다.
- PR 머지 방식: squash merge
- gh CLI 인증: 환경변수 GH_TOKEN 사용 (gh auth login 대신)
- 새 PC에서 설정 방법: 터미널에서 `export GH_TOKEN="your_token_here"` 실행 후 Claude Code 시작
- 토큰 필요 권한: repo, read:org
- 토큰은 절대 코드나 설정 파일에 직접 저장하지 않는다.

## 작업 완료 규칙
- 코드 수정 후 반드시 커밋 → 푸시 → PR 생성 → PR 머지(squash)까지 직접 완료한다.
- 사용자에게 PR 머지를 요청하지 말고 직접 수행한다.

## Supabase
- 프로젝트 URL: https://auwqsmfuejhrqegfhzxe.supabase.co
- Supabase 클라이언트: src/supabaseClient.js 참조
- DB 테이블 생성/수정이 필요하면 Supabase Management API 또는 SQL Editor API를 통해 직접 수행한다.
- Supabase service_role key가 필요한 경우 환경변수 SUPABASE_SERVICE_ROLE_KEY 사용
- 새 PC 설정: `export SUPABASE_SERVICE_ROLE_KEY="your_key_here"` 실행 후 Claude Code 시작

## 언어 규칙
- 모든 대화, 진행 상황 안내, 커밋 메시지, PR 설명은 한글로 작성한다.
- 코드 내 주석도 한글로 작성한다.
- 영어 전문 용어(API, PR, merge 등)는 그대로 사용 가능하되, 설명은 한글로 한다.
