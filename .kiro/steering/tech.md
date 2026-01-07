# Technology Stack

## Architecture

**サーバーレス双方向同期**  
Google Apps Script上で動作し、時間トリガーによる定期実行で両サービス間のデータを同期。  
共通データ型（TaskData）を中心とした抽象化レイヤーにより、各API仕様の差異を吸収する。

## Core Technologies

- **Language**: JavaScript (ES6+)
- **Runtime**: Google Apps Script
- **APIs**: 
  - Notion API v2025-09-03 (Data Sources API)
  - Google Calendar API v3
- **State Management**: PropertiesService（設定情報、IDマッピング）

## Key Libraries

- **AdvancedServices**: Google Calendar API（GASの高度なサービス）

## Development Standards

### API Version Requirements

- **Notion API v2025-09-03 必須**: Data Sources API使用（従来のDatabases APIは非推奨）
- **Google Calendar API v3**: 終日イベント（date形式）のみ使用

### Code Quality

- **JSDoc必須**: 全ての関数にJSDocコメントを記述
- **ログトレース**: `Logger.log('[ServiceName] message')` 形式で処理フローを追跡
- **レートリミット対策**: Notion API呼び出し間に350ms待機（`waitForRateLimit()`）

### Type Safety

- **共通データ型**: TaskData型による型安全性（JSDoc @typedef）
- **変換レイヤー**: TaskDataConverter による双方向変換

### Testing

- **テスト関数**: `test`プレフィックス（例: `testConfiguration()`, `testListAllTasks()`）
- **手動テスト**: GASエディタで実行、ログで確認

## Development Environment

### Required Setup

1. Google Apps Scriptプロジェクト作成
2. Advanced Services: Google Calendar API有効化
3. Script Properties設定（NOTION_API_KEY、NOTION_DATA_SOURCE_ID、GOOGLE_CALENDAR_ID）
4. 時間トリガー設定（5分ごと推奨）

### Common Commands

```bash
# GASエディタで実行:
# - testConfiguration(): 設定確認
# - syncTasks(): 同期実行
# - testListAllTasks(): Notionタスク一覧取得テスト
# - testListAllEvents(): Google Calendarイベント一覧取得テスト
```

## Key Technical Decisions

### 日付のみの管理（終日イベント）

**決定**: すべてのタスクを終日イベントとして扱い、時刻情報を管理しない  
**理由**: タイムゾーン変換や時刻の不整合を完全に回避し、シンプルで確実な同期を実現

### 共通データ型による抽象化

**決定**: TaskData型を定義し、各API仕様の差異を吸収  
**理由**: NotionとGoogle Calendarの日付形式の違い（包含的 vs 排他的）を1箇所で管理

### サービス層の分離

**決定**: NotionService.gs、GoogleCalendarService.gs、TaskData.gsに機能を分離  
**理由**: API仕様変更への対応を局所化し、メインロジック（Code.gs）をシンプルに保つ

### Last Write Wins方式の競合解決

**決定**: タイムスタンプ比較により新しい方を優先  
**理由**: 両サービスでほぼ同時に編集された場合の競合をシンプルに解決

### レートリミット対策

**決定**: Notion API呼び出し間に350ms待機  
**理由**: 平均3リクエスト/秒の制限を遵守し、APIエラーを回避

---
_Document standards and patterns, not every dependency_

