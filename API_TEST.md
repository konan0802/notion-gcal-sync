# API手動テストガイド

このドキュメントは、Notion APIとGoogle Tasks APIを手動でテストするためのガイドです。
PostmanやThunder Client、curlなどのAPIクライアントツールで実行できます。

## 事前準備

### 必要な情報

1. **Notion API**
   - `NOTION_API_KEY`: Notion Integration Token
   - `DATABASE_ID`: NotionデータベースのID（URLから取得）
   - `DATA_SOURCE_ID`: データソースのID（Database IDから取得）

2. **Google Tasks API**
   - OAuth 2.0認証が必要（PostmanのOAuth 2.0設定を使用）
   - または、GAS経由でアクセストークンを取得

> **重要**: Notionは2025年9月3日のアップデート（APIバージョン`2025-09-03`）で、従来のDatabases APIを非推奨とし、新しい[Data Sources API](https://developers.notion.com/reference/query-a-data-source)への移行を推奨しています。

### Database IDとData Source IDの取得方法

**1. Database IDの取得:**

NotionデータベースのURLから取得します：

```
https://www.notion.so/ワークスペース名/{DATABASE_ID}?v=...
```

例：
```
https://www.notion.so/myworkspace/a1b2c3d4e5f6...?v=123
                                 ^^^^^^^^^^^^^^^^
                                 この部分がDATABASE_ID
```

**2. Data Source IDの取得:**

Database IDを使ってデータソース一覧を取得します：

```bash
curl -X GET 'https://api.notion.com/v1/databases/YOUR_DATABASE_ID' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28'
```

レスポンスの `data_sources` 配列から最初のData Source IDを使用します。

---

## Notion API テスト

### 共通ヘッダー

すべてのNotion APIリクエストで以下のヘッダーが必要です：

```
Authorization: Bearer YOUR_NOTION_API_KEY
Notion-Version: 2022-06-28
Content-Type: application/json
```

> **注意**: 最新のAPIバージョンは `2025-09-03` ですが、`2022-06-28` でも動作します。新しいバージョンではData Sources APIの使用が必須です。

---

### 1. データベース情報を取得してData Source IDを確認

データベース情報とその配下のデータソース一覧を取得します。

**エンドポイント:**
```
GET https://api.notion.com/v1/databases/{DATABASE_ID}
```

**リクエスト例 (curl):**
```bash
curl -X GET 'https://api.notion.com/v1/databases/YOUR_DATABASE_ID' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28'
```

**レスポンス例:**
```json
{
  "object": "database",
  "id": "xxxxx-xxxxx-xxxxx",
  "title": [
    {
      "type": "text",
      "text": {
        "content": "タスク管理"
      }
    }
  ],
  "data_sources": [
    {
      "type": "database_data_source",
      "id": "datasource-xxxxx-xxxxx"
    }
  ],
  "properties": {
    "タイトル": {
      "id": "title",
      "type": "title",
      "name": "タイトル"
    },
    "期日": {
      "id": "due",
      "type": "date",
      "name": "期日"
    }
  }
}
```

> このレスポンスから `data_sources[0].id` を取得し、以降のクエリで使用します。

---

### 2. データソース内の全ページを取得

データソース内の**全てのページ**（タスク）を取得します。

**エンドポイント:**
```
POST https://api.notion.com/v1/data_sources/{DATA_SOURCE_ID}/query
```

**リクエストボディ（最小構成）:**
```json
{
  "page_size": 100
}
```

**リクエストボディ（ソート付き）:**
```json
{
  "page_size": 100,
  "sorts": [
    {
      "timestamp": "last_edited_time",
      "direction": "descending"
    }
  ]
}
```

**リクエスト例 (curl):**
```bash
curl -X POST 'https://api.notion.com/v1/data_sources/YOUR_DATA_SOURCE_ID/query' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "page_size": 100,
    "sorts": [
      {
        "timestamp": "last_edited_time",
        "direction": "descending"
      }
    ]
  }'
```

**レスポンス例:**
```json
{
  "object": "list",
  "results": [
    {
      "object": "page",
      "id": "xxxxx-xxxxx-xxxxx",
      "created_time": "2025-12-27T10:00:00.000Z",
      "last_edited_time": "2025-12-27T15:30:00.000Z",
      "properties": {
        "タイトル": {
          "type": "title",
          "title": [
            {
              "type": "text",
              "text": {
                "content": "サンプルタスク"
              }
            }
          ]
        }
      }
    }
  ],
  "next_cursor": "xxxxx-xxxxx-xxxxx",
  "has_more": true
}
```

**ページネーション（次ページ取得）:**

`has_more` が `true` の場合、次のページが存在します。`next_cursor` を使って続きを取得します。

**リクエストボディ（2ページ目以降）:**
```json
{
  "page_size": 100,
  "start_cursor": "xxxxx-xxxxx-xxxxx"
}
```

**リクエスト例 (curl):**
```bash
curl -X POST 'https://api.notion.com/v1/data_sources/YOUR_DATA_SOURCE_ID/query' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "page_size": 100,
    "start_cursor": "YOUR_NEXT_CURSOR"
  }'
```

> **注意**: `page_size` の最大値は100です。100件以上のページがある場合は、ページネーションで複数回リクエストする必要があります。

---

### 3. 最近更新されたページを取得（同期用）

特定の日時以降に更新されたページをフィルタリングして取得します。**これが同期処理で最も重要なエンドポイントです。**

**エンドポイント:**
```
POST https://api.notion.com/v1/data_sources/{DATA_SOURCE_ID}/query
```

**リクエストボディ:**
```json
{
  "filter": {
    "timestamp": "last_edited_time",
    "last_edited_time": {
      "on_or_after": "2025-12-27T10:00:00.000Z"
    }
  },
  "sorts": [
    {
      "timestamp": "last_edited_time",
      "direction": "descending"
    }
  ],
  "page_size": 100
}
```

**リクエスト例 (curl):**
```bash
# 1時間前以降に更新されたページを取得
LAST_SYNC_TIME=$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%S.000Z')

curl -X POST 'https://api.notion.com/v1/data_sources/YOUR_DATA_SOURCE_ID/query' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d "{
    \"filter\": {
      \"timestamp\": \"last_edited_time\",
      \"last_edited_time\": {
        \"on_or_after\": \"${LAST_SYNC_TIME}\"
      }
    },
    \"page_size\": 100
  }"
```

**ポイント:**
- `on_or_after`: 指定した日時**以降**に更新されたページを取得
- 同期処理では、前回の同期時刻を `on_or_after` に指定します
- ページネーションが必要な場合は、`start_cursor` を使用して全件取得します

---

### 4. ページを作成

新しいページ（タスク）をデータソース（データベース）に追加します。

> **注意**: ページ作成APIは `/v1/pages` エンドポイントを使用します（データソースAPIではない）。

**エンドポイント:**
```
POST https://api.notion.com/v1/pages
```

**リクエストボディ:**
```json
{
  "parent": {
    "type": "database_id",
    "database_id": "YOUR_DATABASE_ID"
  },
  "properties": {
    "タイトル": {
      "title": [
        {
          "text": {
            "content": "新しいタスク"
          }
        }
      ]
    },
    "期日": {
      "date": {
        "start": "2025-12-31"
      }
    },
    "ステータス": {
      "select": {
        "name": "未着手"
      }
    }
  }
}
```

**リクエスト例 (curl):**
```bash
curl -X POST 'https://api.notion.com/v1/pages' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "parent": {
      "type": "database_id",
      "database_id": "YOUR_DATABASE_ID"
    },
    "properties": {
      "タイトル": {
        "title": [
          {
            "text": {
              "content": "APIテストタスク"
            }
          }
        ]
      }
    }
  }'
```

---

### 5. ページを更新

既存のページの内容を更新します。

**エンドポイント:**
```
PATCH https://api.notion.com/v1/pages/{PAGE_ID}
```

**リクエストボディ:**
```json
{
  "properties": {
    "タイトル": {
      "title": [
        {
          "text": {
            "content": "更新されたタスク"
          }
        }
      ]
    },
    "ステータス": {
      "select": {
        "name": "進行中"
      }
    }
  }
}
```

**リクエスト例 (curl):**
```bash
curl -X PATCH 'https://api.notion.com/v1/pages/YOUR_PAGE_ID' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "properties": {
      "タイトル": {
        "title": [
          {
            "text": {
              "content": "更新されたタスク"
            }
          }
        ]
      }
    }
  }'
```

---

### 6. ページをアーカイブ（削除）

ページをアーカイブします（物理削除ではなく論理削除）。

**エンドポイント:**
```
PATCH https://api.notion.com/v1/pages/{PAGE_ID}
```

**リクエストボディ:**
```json
{
  "archived": true
}
```

**リクエスト例 (curl):**
```bash
curl -X PATCH 'https://api.notion.com/v1/pages/YOUR_PAGE_ID' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "archived": true
  }'
```

---

## Google Tasks API テスト

### 認証について

Google Tasks APIはOAuth 2.0認証が必要です。

**スコープ:**
```
https://www.googleapis.com/auth/tasks
```

**Postmanでの設定:**
1. Authorization タブで "OAuth 2.0" を選択
2. Configure New Token で以下を設定：
   - Grant Type: Authorization Code
   - Auth URL: `https://accounts.google.com/o/oauth2/auth`
   - Access Token URL: `https://oauth2.googleapis.com/token`
   - Client ID: （Google Cloud Consoleで取得）
   - Client Secret: （Google Cloud Consoleで取得）
   - Scope: `https://www.googleapis.com/auth/tasks`

---

### 1. タスクリスト一覧を取得

全てのタスクリストを取得します。

**エンドポイント:**
```
GET https://www.googleapis.com/tasks/v1/users/@me/lists
```

**リクエスト例 (curl):**
```bash
curl -X GET 'https://www.googleapis.com/tasks/v1/users/@me/lists' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**レスポンス例:**
```json
{
  "kind": "tasks#taskLists",
  "items": [
    {
      "kind": "tasks#taskList",
      "id": "MTxxxxxxxxxxxxxxxx",
      "title": "マイタスク",
      "updated": "2025-12-27T10:00:00.000Z"
    }
  ]
}
```

---

### 2. タスク一覧を取得

特定のタスクリスト内のタスクを取得します。

**エンドポイント:**
```
GET https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks
```

**クエリパラメータ:**
- `maxResults`: 取得する最大件数（オプション）
- `showCompleted`: 完了済みタスクも含める（true/false）
- `showHidden`: 非表示タスクも含める（true/false）
- `updatedMin`: この日時以降に更新されたタスクのみ取得（RFC 3339形式）

**リクエスト例 (curl):**
```bash
curl -X GET 'https://www.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=10&showCompleted=true' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**レスポンス例:**
```json
{
  "kind": "tasks#tasks",
  "items": [
    {
      "kind": "tasks#task",
      "id": "MTxxxxxxxxxxxxxxxx",
      "title": "サンプルタスク",
      "status": "needsAction",
      "due": "2025-12-31T00:00:00.000Z",
      "updated": "2025-12-27T10:00:00.000Z",
      "notes": "タスクの説明"
    }
  ]
}
```

---

### 3. 最近更新されたタスクを取得

特定の日時以降に更新されたタスクを取得します。

**エンドポイント:**
```
GET https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks?updatedMin={DATETIME}
```

**リクエスト例 (curl):**
```bash
curl -X GET 'https://www.googleapis.com/tasks/v1/lists/@default/tasks?updatedMin=2025-12-27T10:00:00Z&showCompleted=true' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### 4. タスクを作成

新しいタスクを作成します。

**エンドポイント:**
```
POST https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks
```

**リクエストボディ:**
```json
{
  "title": "新しいタスク",
  "notes": "タスクの説明",
  "due": "2025-12-31T00:00:00.000Z",
  "status": "needsAction"
}
```

**リクエスト例 (curl):**
```bash
curl -X POST 'https://www.googleapis.com/tasks/v1/lists/@default/tasks' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "APIテストタスク",
    "notes": "これはAPIテストで作成されたタスクです",
    "due": "2025-12-31T00:00:00.000Z"
  }'
```

**レスポンス例:**
```json
{
  "kind": "tasks#task",
  "id": "MTxxxxxxxxxxxxxxxx",
  "title": "APIテストタスク",
  "status": "needsAction",
  "due": "2025-12-31T00:00:00.000Z",
  "updated": "2025-12-27T10:30:00.000Z"
}
```

---

### 5. タスクを更新

既存のタスクを更新します。

**エンドポイント:**
```
PATCH https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks/{TASK_ID}
```

**リクエストボディ:**
```json
{
  "title": "更新されたタスク",
  "notes": "内容を更新しました",
  "status": "needsAction"
}
```

**リクエスト例 (curl):**
```bash
curl -X PATCH 'https://www.googleapis.com/tasks/v1/lists/@default/tasks/YOUR_TASK_ID' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "更新されたタスク",
    "status": "needsAction"
  }'
```

---

### 6. タスクを完了にする

タスクのステータスを完了にします。

**エンドポイント:**
```
PATCH https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks/{TASK_ID}
```

**リクエストボディ:**
```json
{
  "status": "completed"
}
```

**リクエスト例 (curl):**
```bash
curl -X PATCH 'https://www.googleapis.com/tasks/v1/lists/@default/tasks/YOUR_TASK_ID' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "completed"
  }'
```

---

### 7. タスクを削除

タスクを削除します。

**エンドポイント:**
```
DELETE https://www.googleapis.com/tasks/v1/lists/{TASKLIST_ID}/tasks/{TASK_ID}
```

**リクエスト例 (curl):**
```bash
curl -X DELETE 'https://www.googleapis.com/tasks/v1/lists/@default/tasks/YOUR_TASK_ID' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**レスポンス:**
204 No Content（削除成功）

---

## 同期に必要なAPI操作まとめ

### Notion側

| 操作 | メソッド | エンドポイント | 備考 |
|------|---------|--------------|------|
| データベース情報取得 | GET | `/v1/databases/{id}` | Data Source ID確認用 |
| 全ページ取得 | POST | `/v1/data_sources/{id}/query` | Data Source ID使用 |
| 更新されたページ取得 | POST | `/v1/data_sources/{id}/query` | filter付き（同期用） |
| ページ作成 | POST | `/v1/pages` | parent.database_id指定 |
| ページ更新 | PATCH | `/v1/pages/{id}` | プロパティ更新 |
| ページアーカイブ | PATCH | `/v1/pages/{id}` | archived: true |

> **重要**: 2025年9月3日以降、ページのクエリには `/v1/data_sources/{id}/query` を使用してください。従来の `/v1/databases/{id}/query` は非推奨です。

### Google Tasks側

| 操作 | メソッド | エンドポイント |
|------|---------|--------------|
| タスクリスト一覧 | GET | `/tasks/v1/users/@me/lists` |
| タスク一覧取得 | GET | `/tasks/v1/lists/{id}/tasks` |
| 更新されたタスク取得 | GET | `/tasks/v1/lists/{id}/tasks?updatedMin={datetime}` |
| タスク作成 | POST | `/tasks/v1/lists/{id}/tasks` |
| タスク更新 | PATCH | `/tasks/v1/lists/{id}/tasks/{taskId}` |
| タスク削除 | DELETE | `/tasks/v1/lists/{id}/tasks/{taskId}` |

---

## レートリミット対策

### Notion API
- 平均3リクエスト/秒を維持
- 連続リクエスト時は350ms以上の間隔を推奨
- 429エラー時はRetry-Afterヘッダーを確認

### Google Tasks API
- 1日あたり50,000リクエスト
- 通常の使用では問題なし
- 429エラー時はExponential backoffでリトライ

---

## トラブルシューティング

### Notion API

**401 Unauthorized**
- APIキーが正しいか確認
- Integration がデータベースへのアクセス権を持っているか確認

**404 Not Found**
- Database ID / Data Source IDが正しいか確認
- データベースが削除されていないか確認
- データベースがIntegrationに共有されているか確認

**400 Bad Request**
- リクエストボディのJSON形式が正しいか確認
- プロパティ名がデータベースのスキーマと一致しているか確認
- Database IDとData Source IDを混同していないか確認

**429 Too Many Requests**
- レートリミット（3req/sec）を超えています
- `Retry-After` ヘッダーの秒数待ってからリトライ

> **重要**: ページのクエリには `/v1/data_sources/{id}/query` を使用してください。従来の `/v1/databases/{id}/query` は2025年9月3日以降非推奨です。詳細は[公式ドキュメント](https://developers.notion.com/reference/query-a-data-source)を参照。

### Google Tasks API

**401 Unauthorized**
- アクセストークンが有効か確認
- トークンが期限切れの場合は再取得

**403 Forbidden**
- OAuth スコープに `https://www.googleapis.com/auth/tasks` が含まれているか確認

**404 Not Found**
- タスクリストIDやタスクIDが正しいか確認
- タスクが既に削除されていないか確認

