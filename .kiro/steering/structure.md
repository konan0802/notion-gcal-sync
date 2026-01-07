# Project Structure

## Organization Philosophy

**サービス層パターン**  
API操作をサービスクラスに分離し、共通データ型（TaskData）を介してデータをやり取りする。  
メインロジック（Code.gs）は同期フロー制御に専念し、API仕様の詳細は各サービス層に隠蔽する。

## Directory Patterns

### Google Apps Script コード (`/gas/`)

**Location**: `/gas/`  
**Purpose**: 全てのGASコードを格納（実行ファイル）  
**Example**:
- `Code.gs` - メイン同期ロジック
- `TaskData.gs` - 共通データ型と変換ユーティリティ
- `NotionService.gs` - Notion API操作
- `GoogleCalendarService.gs` - Google Calendar API操作

### ドキュメント（トップレベル）

**Location**: ルートディレクトリ  
**Purpose**: プロジェクト全体の仕様、設計、テスト手順を記述  
**Example**:
- `README.md` - プロジェクト全体の設計、セットアップ手順
- `NOTION_DB_SCHEMA.md` - Notionデータベース構造
- `API_TEST.md` - API手動テストガイド

## Naming Conventions

- **Files**: PascalCase.gs（例: `TaskData.gs`, `NotionService.gs`）
- **Functions**: camelCase（例: `syncTasks()`, `createNotionPage()`）
- **Constants**: UPPER_SNAKE_CASE（例: `NOTION_API_KEY`, `API_VERSION`）
- **Test Functions**: `test`プレフィックス（例: `testConfiguration()`, `testListAllTasks()`）

## Code Organization Principles

### 共通データ型を中心とした設計

```javascript
// TaskData.gs - 共通データ型定義
/**
 * @typedef {Object} TaskData
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {string} lastEditedTime
 * @property {string} source - 'notion' | 'google'
 */

// TaskDataConverter - 双方向変換
fromNotionPage(page) → TaskData
toNotionProperties(taskData) → NotionProperties
fromGoogleEvent(event) → TaskData
toGoogleEvent(taskData) → GoogleEvent
```

### サービス層の責務分離

- **NotionService.gs**: Notion API (v2025-09-03) 操作のみ
- **GoogleCalendarService.gs**: Google Calendar API (v3) 操作のみ
- **TaskData.gs**: データ型定義と変換ロジックのみ
- **Code.gs**: 同期フロー制御とタスク分類のみ

### ログ出力パターン

```javascript
Logger.log('[ServiceName] Message');
// 例:
Logger.log('[NotionService] Creating page...');
Logger.log('[GoogleCalendarService] Updating event...');
Logger.log('[Sync] Phase 1: Creating new tasks');
```

サービス名プレフィックスによりログを追跡しやすくする。

### エラーハンドリングパターン

```javascript
try {
  const response = UrlFetchApp.fetch(url, options);
  // 処理
} catch (error) {
  Logger.log(`[ServiceName] Error: ${error.message}`);
  throw error; // または適切な処理
}
```

### レートリミット対策パターン

```javascript
// Notion API呼び出し後
waitForRateLimit(); // 350ms待機

function waitForRateLimit() {
  Utilities.sleep(350);
}
```

## Data Flow Pattern

```
Notion API         TaskData (統一形式)         Google Calendar API
    │                   ▲                            │
    │                   │                            │
    └─→ fromNotionPage()│                            │
                         │                            │
    ┌─→ toNotionProperties()                         │
    │                   │                            │
    │                   ▼                            │
Code.gs (同期ロジック) ←→ TaskDataConverter ←→ Code.gs
    │                   ▲                            │
    │                   │                            │
    └─→ toGoogleEvent() │                            │
                         │                            │
    ┌─→ fromGoogleEvent()                            │
    │                   │                            │
    │                   ▼                            │
```

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_

