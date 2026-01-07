# notion-gcal-sync
NotionのタスクをGoogle Calendarに双方向同期するツール

## システム概要
Notion上のタスクデータベースとGoogle Calendar（専用カレンダー）を双方向で自動同期します。どちらか一方で作成・更新・削除されたタスクは、もう一方にも反映されます。

## 技術スタック
- **Google Apps Script (GAS)**: 同期ロジックの実装とスケジュール実行
- **Notion API (v2025-09-03)**: Notionデータベースの読み書き（Data Sources API使用）
- **Google Calendar API (v3)**: Google Calendarの管理
- **PropertiesService**: 同期状態の管理（設定情報、IDマッピング）

## 重要な制限事項

### Notion API バージョンについて
- 本ツールは**Notion API v2025-09-03**を使用します
- 2025年9月3日以降、従来のDatabases APIは非推奨となり、**Data Sources API**の使用が推奨されています
- Database ID → Data Source IDの変換が必要です

### Google Calendar方式への移行について
- 当初はGoogle Tasks APIを使用していましたが、Google Calendar方式に移行しました
- 本ツールは**日付のみを管理**し、すべてのタスクを**終日イベント**として同期します
- 時刻の管理を行わないことで、タイムゾーン変換や時刻の不整合を完全に回避しています

## セットアップ手順

### 1. Googleカレンダーで専用カレンダーを作成

1. [Googleカレンダー](https://calendar.google.com/)を開く
2. 左側の「他のカレンダー」横の「+」をクリック
3. 「新しいカレンダーを作成」を選択
4. カレンダー名：「Notionタスク」（任意）
5. 作成後、カレンダーの設定を開く
6. 「カレンダーの統合」セクションで**カレンダーID**をコピー
   - 例：`abc123@group.calendar.google.com`

### 2. Notion Integrationの作成とData Source IDの取得

（既存のセットアップ手順を参照）

### 3. Google Apps Scriptプロジェクトの作成

1. [Google Apps Script](https://script.google.com/)を開く
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を「NotionGCalSync」に変更
4. 本リポジトリの`gas/`フォルダ内の全ファイルをコピー＆ペーストで追加：
   - `Code.gs`
   - `TaskData.gs`
   - `NotionService.gs`
   - `GoogleCalendarService.gs`（※`GoogleTasksService.gs`は不要）

### 4. 高度なGoogleサービスの有効化

1. GASエディタで「サービス」（⊕アイコン）をクリック
2. 「Google Calendar API」を検索して追加（v3）
3. 保存

### 5. スクリプトプロパティの設定

1. GASエディタで「プロジェクトの設定」（⚙アイコン）をクリック
2. 「スクリプト プロパティ」セクションで以下を追加：

```
NOTION_API_KEY: secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATA_SOURCE_ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GOOGLE_CALENDAR_ID: abc123@group.calendar.google.com
```

### 6. Notionデータベースのプロパティ設定

Notionデータベースに以下のプロパティを追加してください：

| プロパティ名 | タイプ | 設定 | 必須 |
|-------------|-------|------|------|
| タスク名 | タイトル | - | ✅ |
| ステータス | ステータス | ToDo/Done | ✅ |
| 日付 | 日付 | **終了日**をON | ✅ |
| Google Event ID | テキスト | - | ❌（自動設定） |

**重要：** 「日付」プロパティでは、「終了日」の設定をONにしてください。複数日にわたるタスクの管理が可能になります。時刻情報は使用しないため、「時刻を含める」はOFFで構いません。

### 7. テスト実行

1. GASエディタで`testConfiguration()`関数を選択
2. 「実行」ボタンをクリック
3. 初回実行時は権限の承認が必要です
4. ログで設定が正しいことを確認

5. 次に`syncTasks()`関数を選択して実行
6. ログで同期が正常に完了することを確認

### 8. トリガーの設定（自動実行）

1. GASエディタで「トリガー」（⏰アイコン）をクリック
2. 「トリガーを追加」をクリック
3. 以下のように設定：
   - **実行する関数**: `syncTasks`
   - **イベントのソース**: 時間主導型
   - **時間ベースのトリガー**: 分タイマー
   - **時間の間隔**: 5分ごと（推奨）
4. 保存

## 主要機能

### 1. 双方向同期
- **開始日が過去1ヶ月 ~ 未来2ヶ月の間にあるタスク**を同期対象とする
- Notion/Google Calendar双方で作成・更新・削除されたタスクを自動同期
- **高効率な処理**: 1回のループで分類・差分チェック・タイムスタンプ比較を完了
- 内容差分チェック（title/status/startDate/endDate）+ タイムスタンプ比較による競合解決（Last Write Wins）
- ID相互参照による正確な削除判定

### 2. 同期対象
- ✅ タスク名（title）
- ✅ ステータス（status）: ToDo/Done（2状態）※Google Calendar summaryプレフィックス（▶/✔）で実装
- ✅ 開始日（startDate）: YYYY-MM-DD形式（日付のみ）
- ✅ 終了日（endDate）: YYYY-MM-DD形式（日付のみ、排他的）
- ✅ すべてのタスクはGoogle Calendarの**終日イベント**として同期
- ✅ 複数日にわたるタスク対応（例：12/27-12/28の2日間）
- ✅ 完了タスク（Done）も含む
- ✅ 削除タスクの検出と同期
- ❌ Notionの「種別」は同期しない
- ❌ 時刻情報は管理しない（終日イベントのみ）
- ❌ 開始日なしタスクは同期対象外
- ❌ 開始日が範囲外（過去1ヶ月より前、または未来2ヶ月より後）のタスクは同期対象外

### 3. 日付のみの管理
- すべてのタスクを**終日イベント**として扱います
- 時刻情報は管理しないため、タイムゾーン変換や時刻の不整合が発生しません
- Notionで時刻を設定しても、日付のみが同期されます（時刻情報は無視）

### 4. リンク機能とID管理
- Google Calendarの`description`フィールドにNotion Page IDとURLを自動設定（削除判定用）
- NotionプロパティにGoogle Event IDを保存（マッピング・削除判定用）
- 双方向のID参照により正確な削除検出が可能
- Google CalendarからNotionページへワンクリックでジャンプ可能

### 5. 無限ループ防止
- 内容差分チェック（title/status/startDate/endDate）により、変更がない場合はスキップ
- 日付形式の統一（YYYY-MM-DD）により、フォーマット差異を吸収
- タイムスタンプは勝者決定にのみ使用

### 6. 削除同期
- ID相互参照により新規作成と削除を正確に判別
- Notion側で削除 → Google Calendarからも削除
- Google Calendar側で削除 → Notionでアーカイブ（復元可能）

## アーキテクチャ概要

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│                 │         │                      │         │                 │
│  Notion DB      │◄────────│  Google Apps Script  │────────►│ Google Calendar │
│  (タスク管理)    │         │  - 同期ロジック       │         │  (専用カレンダー)│
│                 │         │  - スケジューラー     │         │                 │
└─────────────────┘         │  - 競合解決          │         └─────────────────┘
                            │  - IDマッピング管理   │
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │  PropertiesService   │
                            │  - 設定情報          │
                            │  - IDマッピング      │
                            └──────────────────────┘
```

## データマッピング

### 双方向同期フィールド

| フィールド | Notion | Google Calendar | 備考 |
|-----------|--------|-----------------|------|
| タスク名 | タスク名（title） | summary | 必須。Google Calendar側は`▶`（ToDo）または`✔`（Done）プレフィックス付き |
| ステータス | ステータス（ToDo/Done） | summaryプレフィックス（▶/✔） | `▶`はToDo、`✔`はDone |
| 開始日 | 日付.start | start.date | YYYY-MM-DD形式。常に終日イベント |
| 終了日 | 日付.end | end.date | YYYY-MM-DD形式。Notionは包含的、Google Calendarは排他的 |

### マッピング管理フィールド

| フィールド | Notion | Google Calendar | 用途 |
|-----------|--------|-----------------|------|
| Google Event ID | Google Event ID（rich_text） | - | マッピング・削除判定 |
| Notion Page ID | - | description（1行目） | マッピング・削除判定 |
| Notion URL | - | description（2行目以降） | NotionページへのリンクDMD|

**descriptionフォーマット例:**
```
Notion: 1d8bc031-aa6a-4c43-b74c-67f3198d78fb
https://www.notion.so/1d8bc031aa6a4c43b74c67f3198d78fb
```

## 同期フロー

### Phase 1: データ取得
1. Notionから開始日が範囲内（過去1ヶ月 ~ 未来2ヶ月）のページを取得
2. Google Calendarから同じ範囲のイベントを取得
3. それぞれをTaskData形式に変換してマップを作成

### Phase 2: タスク分類（1回のループで完了）
各タスクを以下のカテゴリに分類：
- **新規Notionタスク**: Google Event IDがない
- **新規Googleタスク**: Notion Page IDがない
- **Notion → Google更新**: 内容差分あり & Notionのタイムスタンプが新しい
- **Google → Notion更新**: 内容差分あり & Googleのタイムスタンプが新しい
- **Notionで削除**: Google Event IDがあるがNotionに存在しない
- **Googleで削除**: Notion Page IDがあるがGoogleに存在しない

### Phase 3: 新規タスク作成
- Notion → Google: イベント作成 & NotionにGoogle Event IDを保存
- Google → Notion: ページ作成 & GoogleイベントにNotion Page IDを保存

### Phase 4: 既存タスク更新
- Notion → Google: イベント更新
- Google → Notion: ページ更新

### Phase 5: 削除タスク処理
- Notionで削除（または日付クリア） → Google Calendarイベントを削除
- Google Calendarで削除 → Notionでアーカイブ

## 注意事項

### Google Calendar専用カレンダーの使用
- 本ツールは指定したGoogleカレンダー（GOOGLE_CALENDAR_ID）のイベント**全て**を同期対象とします
- **タスク専用のカレンダー**を作成し、会議やプライベート予定と分離してください
- 既存のメインカレンダーを指定すると、全てのイベントがNotionに同期されます

### 日付情報の扱い
- Notionの「日付」プロパティでは「終了日」をONにしてください
- 本ツールは**日付のみ**を管理し、すべてのタスクを**終日イベント**として同期します
- Notionで時刻を設定しても、**日付部分のみが同期**されます（時刻情報は無視）
- **1日のタスク**: Notionで開始日のみ設定（例：12/27）すると、Google Calendarで1日の終日イベントとして同期されます
- **複数日のタスク**: Notionで開始日と終了日を設定（例：12/27-12/28）すると、Google Calendarでも2日間の終日イベントとして同期されます
- **日付形式の違い**:
  - Notion: 包含的（inclusive）形式（例：12/27-12/28は2日間）
  - Google Calendar: 排他的（exclusive）形式（例：start=12/27, end=12/29は2日間）
  - 変換は自動的に行われます

### レートリミット
- Notion API: 平均3リクエスト/秒（連続リクエスト時は350ms間隔）
- Google Calendar API: 1,000,000 クエリ/日、100リクエスト/秒/ユーザー
- 5分間隔のトリガーであれば、レートリミットに達することはありません

### データ量
- Notionクエリ: 最大250件/リクエスト
- Google Calendarクエリ: 最大250件/リクエスト
- 同期範囲（過去1ヶ月 ~ 未来2ヶ月）で250件を超える場合、ページネーション実装が必要です

## トラブルシューティング

### 同期が動作しない
1. `testConfiguration()`を実行して設定を確認
2. スクリプトプロパティが正しく設定されているか確認
3. Google Calendar IDが正しいか確認（専用カレンダーのID）
4. Notionデータベースに「日付」プロパティがあるか確認

### 時刻が表示される
1. 本ツールは日付のみを管理します
2. すべてのタスクは終日イベントとして同期されるため、時刻情報は使用されません
3. Notionで時刻を設定しても、日付のみが同期されます

## ファイル構成

```
gas/
├── Code.gs                    # メイン同期ロジック
├── TaskData.gs                # 共通データ型と変換ユーティリティ
├── NotionService.gs           # Notion API操作
├── GoogleCalendarService.gs   # Google Calendar API操作
└── GoogleTasksService.gs      # （非推奨・後方互換性のため保持）
```

## 今後の拡張予定

- [ ] 繰り返しイベントのサポート
- [ ] ページネーション実装（250件以上のタスク対応）
- [ ] Notion Webhookによるリアルタイム同期
- [ ] エラー通知機能（メール/Slack）

## ライセンス

MIT License

## 参考リンク

- [Notion API Reference](https://developers.notion.com/reference/intro)
- [Google Calendar API Reference](https://developers.google.com/calendar/api/v3/reference)
- [Google Apps Script Documentation](https://developers.google.com/apps-script)
