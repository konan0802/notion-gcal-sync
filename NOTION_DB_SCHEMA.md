# Notionデータベース構造メモ

## データベース識別情報

```
Database ID:     ee598941-8e4f-41a4-94bc-0a25c982841d
Data Source ID:  3f19b18a-0c1c-4672-bef6-c90e7b784e3a
```

## プロパティ一覧

### 1. タスク名（Title）
- **Property ID**: `title`
- **Type**: `title`
- **説明**: タスクのタイトル
- **必須**: Yes
- **例**: "NotionとGoogleカレンダーを双方向同期"

**データ構造:**
```json
"タスク名": {
  "id": "title",
  "type": "title",
  "title": [
    {
      "type": "text",
      "text": {
        "content": "タスクのタイトル",
        "link": null
      },
      "plain_text": "タスクのタイトル"
    }
  ]
}
```

---

### 2. Google Event ID（Rich Text）
- **Property Name**: `Google Event ID`
- **Type**: `rich_text`
- **説明**: 連携されたGoogle Calendar EventのID（マッピング・削除判定用）
- **必須**: No（同期時に自動設定）
- **Null許可**: Yes
- **例**: "abc123xyz"

**データ構造:**
```json
"Google Event ID": {
  "id": "XXXXX",
  "type": "rich_text",
  "rich_text": [
    {
      "type": "text",
      "text": {
        "content": "abc123xyz",
        "link": null
      },
      "plain_text": "abc123xyz"
    }
  ]
}
```

**Null時:**
```json
"Google Event ID": {
  "id": "XXXXX",
  "type": "rich_text",
  "rich_text": []
}
```

**注意:**
- このプロパティは同期処理で自動的に管理されます
- 手動で編集しないでください
- Google Calendar → Notionの逆引きと削除判定に使用されます

---

### 3. ステータス（Status）
- **Property ID**: `Gj%7Bz`
- **Type**: `status`
- **説明**: タスクの進捗状況
- **利用可能な値**: ToDo / Done
- **デフォルト値**: "ToDo"

**利用可能な値:**
```
- ToDo (default)
- Done
```

**データ構造:**
```json
"ステータス": {
  "id": "Gj%7Bz",
  "type": "status",
  "status": {
    "name": "ToDo"
  }
}
```

**注意:**
- Google Calendarの完了状態と同期（将来実装予定）

---

### 4. 日付（Date）
- **Property Name**: `日付`
- **Property ID**: `RR~v`
- **Type**: `date`
- **説明**: タスクの開始日と終了日（日付のみ、時刻情報は使用しない）
- **Null許可**: Yes
- **時刻含む**: No（日付のみを管理）
- **終日イベント専用**: Yes

**1日のタスク（endなし）:**
```json
"日付": {
  "id": "RR~v",
  "type": "date",
  "date": {
    "start": "2026-01-03",
    "end": null,
    "time_zone": null
  }
}
```

**複数日のタスク（endあり）:**
```json
"日付": {
  "id": "RR~v",
  "type": "date",
  "date": {
    "start": "2025-12-27",
    "end": "2025-12-28",
    "time_zone": null
  }
}
```

**注意:**
- 本ツールは**日付のみ**を管理します（時刻情報は無視）
- Notionで時刻を設定しても、同期時に日付部分のみが使用されます
- 日付形式は常に`YYYY-MM-DD`（ISO 8601の日付部分のみ）
- `time_zone`は常に`null`として扱います
- Google Calendarでは常に**終日イベント**として同期されます

**Null時:**
```json
"日付": {
  "id": "RR~v",
  "type": "date",
  "date": null
}
```

---

### 5. 種別（Select）
- **Property ID**: `hbR%7B`
- **Type**: `select`
- **説明**: タスクのカテゴリ
- **Null許可**: Yes

**利用可能な値:**

| 名前 | ID | Color |
|-----|-----|-------|
| 買い物 | IYjH | default |
| 入社までの準備事項 | \|SdG | orange |
| 記事作成 | ~FFj | blue |
| 今後やりたいこと | 27c3c132-cb85-45a2-8f53-30ac0a93e2d5 | gray |
| ライフプラン | MY@u | purple |
| 本（Biz） | en=I | pink |
| 本（Dev） | ^y=N | green |

**データ構造:**
```json
"種別": {
  "id": "hbR%7B",
  "type": "select",
  "select": {
    "id": "|SdG",
    "name": "入社までの準備事項",
    "color": "orange"
  }
}
```

**Null時:**
```json
"種別": {
  "id": "hbR%7B",
  "type": "select",
  "select": null
}
```

---

## Google Calendar同期マッピング

### ID連携
- **Notion → Google Calendar**: Google Event IDをNotionの「Google Event ID」プロパティに保存
- **Google Calendar → Notion**: Notion Page IDをGoogle Calendarイベントの`description`フィールドに保存（形式：`Notion: PAGE_ID\nURL`）
- **削除判定**: 両方にIDが存在し、片方に実体がない場合、削除されたと判断

### Notion → Google Calendar

| Notionプロパティ | Google Calendarフィールド | 変換ルール |
|----------------|----------------------|-----------|
| タスク名（title） | summary | `▶ `（ToDo）または`✔ `（Done）プレフィックス付き |
| ステータス（ToDo） | summary（▶プレフィックス） | `▶ タスク名`形式 |
| ステータス（Done） | summary（✔プレフィックス） | `✔ タスク名`形式 |
| 日付.start | start.date | YYYY-MM-DD形式（常に終日イベント） |
| 日付.end | end.date | YYYY-MM-DD形式（Notionの包含的→Google Calendarの排他的形式に+1日調整） |
| ページURL | description | `Notion: PAGE_ID\nURL`形式で設定 |

**注意:**
- すべてのタスクは終日イベントとして同期されます
- Notionで時刻を設定しても、日付部分のみが使用されます
- Notionの日付範囲は包含的（inclusive）形式（例：12/27-12/28 = 2日間）
- Google Calendarは排他的（exclusive）形式（例：start=12/27, end=12/29 = 2日間）
- 変換時に自動的に+1日調整されます

### Google Calendar → Notion

| Google Calendarフィールド | Notionプロパティ | 変換ルール |
|----------------------|----------------|-----------|
| summary | タスク名（title） | `▶ `または`✔ `プレフィックスを除去 |
| summary（▶プレフィックス） | ステータス（ToDo） | プレフィックスから判定 |
| summary（✔プレフィックス） | ステータス（Done） | プレフィックスから判定 |
| start.date | 日付.start | YYYY-MM-DD形式（`time_zone: null`） |
| end.date | 日付.end | YYYY-MM-DD形式（Google Calendarの排他的形式→Notionの包含的形式に-1日調整、`time_zone: null`） |
| id | Google Event ID | マッピング・削除判定用に保存 |
| description | （同期しない） | NotionページIDとURLが入っているため同期対象外 |

**注意:**
- Google Calendarからの同期も終日イベントのみを対象とします
- dateTimeフィールドを持つ時刻指定イベントは、日付部分のみが抽出されます（本来は発生しないはず）

---

## サンプルページデータ

### 例1: 日付範囲あり

```json
{
  "id": "1d8bc031-aa6a-4c43-b74c-67f3198d78fb",
  "created_time": "2025-12-25T01:45:00.000Z",
  "last_edited_time": "2025-12-26T01:18:00.000Z",
  "properties": {
    "タスク名": {
      "title": [{"plain_text": "GCP：dbtのセットアップ"}]
    },
    "ステータス": {
      "status": {"name": "未着手"}
    },
    "日付": {
      "date": {
        "start": "2026-01-11",
        "end": "2026-01-14"
      }
    },
    "種別": {
      "select": {"name": "入社までの準備事項", "color": "orange"}
    }
  }
}
```

### 例2: 日付なし

```json
{
  "id": "2d48ea99-2838-8048-b3d4-dea579b076b3",
  "properties": {
    "タスク名": {
      "title": [{"plain_text": "統計検定 DS基礎"}]
    },
    "ステータス": {
      "status": {"name": "未着手"}
    },
    "日付": {
      "date": null
    },
    "種別": {
      "select": {"name": "今後やりたいこと"}
    }
  }
}
```

### 例3: 種別なし

```json
{
  "id": "2d48ea99-2838-80a7-a4ee-ddf34a829e22",
  "properties": {
    "タスク名": {
      "title": [{"plain_text": "マイリンクの未読をなくす"}]
    },
    "ステータス": {
      "status": {"name": "未着手"}
    },
    "日付": {
      "date": {
        "start": "2025-12-29",
        "end": "2025-12-30"
      }
    },
    "種別": {
      "select": null
    }
  }
}
```

---

## 実装時の注意点

### 0. セットアップ前準備

**重要**: 同期を開始する前に、Notionデータベースに以下のプロパティを追加してください：

```
プロパティ名: Google Event ID
プロパティタイプ: テキスト (Rich Text)
```

このプロパティは同期処理で自動的に管理され、Google Calendar → Notionの逆引きに使用されます。

### 1. プロパティIDの使用

プロパティにアクセスする際は、**日本語名**または**プロパティID**を使用します：

```javascript
// 日本語名で取得（推奨）
page.properties["タスク名"]
page.properties["Google Event ID"]
page.properties["ステータス"]
page.properties["日付"]
page.properties["種別"]

// プロパティIDで取得（より確実）
page.properties["title"]
page.properties["XXXXX"]  // Google Event IDのプロパティID（環境により異なる）
page.properties["Gj%7Bz"]
page.properties["RR~v"]
page.properties["hbR%7B"]
```

### 2. Null チェック

以下のプロパティは`null`または空配列になる可能性があります：

- `Google Event ID`: 同期前のタスクやNotion単独のタスク
- `日付`: タスクに期日が設定されていない場合
- `種別`: カテゴリが選択されていない場合

```javascript
// 安全なアクセス
const googleEventId = page.properties["Google Event ID"]?.rich_text?.[0]?.plain_text || null;
const dateData = page.properties["日付"]?.date;
const startTime = dateData?.start || null;
const endTime = dateData?.end || null;
const category = page.properties["種別"]?.select?.name || null;
```

### 3. 日付範囲の処理

「日付」プロパティは`start`（開始時刻）と`end`（終了時刻）の両方を含みます：

```javascript
const dateProperty = page.properties["日付"].date;
if (dateProperty) {
  const startTime = dateProperty.start;  // 必須（開始時刻）
  const endTime = dateProperty.end;      // オプション（終了時刻）
  
  if (endTime) {
    // 期間タスク（開始と終了あり）
  } else {
    // 単一時刻タスク（開始のみ）
  }
}
```

### 4. ステータスの変換

**ステータス値（2状態）:**
- ToDo → Google Calendar summaryに`▶ `プレフィックス
- Done → Google Calendar summaryに`✔ `プレフィックス

**Google Calendar → Notionの変換:**
- `▶ `プレフィックス → ToDo
- `✔ `プレフィックス → Done
- プレフィックスなし → ToDo（デフォルト）

### 5. Google Event IDプロパティの管理

- 同期処理で自動的に設定・更新されます
- 手動での編集は避けてください
- このプロパティを使用してGoogle Calendar側の変更をNotionに反映します
- 空の場合は新規作成されたNotionタスクとして扱われます

---

## 統計情報（取得時点）

- **総タスク数**: 28件
- **日付あり**: 18件
- **日付なし**: 10件
- **種別あり**: 24件
- **種別なし**: 4件

### カテゴリ別内訳

| 種別 | 件数 |
|-----|-----|
| 入社までの準備事項 | 11件 |
| 今後やりたいこと | 3件 |
| ライフプラン | 3件 |
| 本（Biz） | 3件 |
| 本（Dev） | 1件 |
| 記事作成 | 1件 |
| 買い物 | 1件 |
| なし | 4件 |

---

## 更新履歴

- 2025-12-27: 初版作成（28タスク分のデータから構造を分析）
- 2025-12-27: Google Task IDプロパティを追加（逆引き用）、同期マッピング更新
- 2025-12-27: notesフィールドをNotionページURLに変更（テキスト変換を廃止）
- 2025-12-27: 同期対象を「直近1ヶ月以内に更新」に変更（更新日時ベースで効率化）
- 2025-12-28: **Google Calendar方式に移行**
  - 「Google Task ID」 → 「Google Event ID」に変更
  - 「日付」プロパティの`start`（開始時刻）と`end`（終了時刻）を使用
  - 時刻情報を完全サポート（タイムゾーン変換あり）
  - 専用Googleカレンダーで管理
  - 同期範囲：開始時刻が過去1ヶ月～未来2ヶ月のタスク
  - ステータス同期：Google Calendar summaryプレフィックス（▶/✔）で実装
  - 終日イベント対応：Notionで時刻なし日付のみ設定可能
  - 複数日終日イベント対応：包含的（Notion）↔排他的（Google Calendar）の変換実装
  - 削除同期実装：Notion日付クリア→Google Calendar削除、Google削除→Notionアーカイブ


