# テキスト変換法則

Notion API（Blocks）とGoogle Tasks（プレーンテキスト）間のメモ変換ルール

## 概要

- **Notion**: Blocks API形式（リッチテキスト、見出し、リスト等）
- **Google Tasks**: プレーンテキスト（改行区切りの単純なテキスト）
- **変換戦略**: Markdown形式を中間フォーマットとして使用

## 変換方向

```
Notion Blocks → Markdown風テキスト → Google Tasks (プレーンテキスト)
                                           ↓
                                      保存される
                                           ↓
Google Tasks (プレーンテキスト) → Markdownパース → Notion Blocks
```

## Notion → Google Tasks 変換ルール

### 対応ブロックタイプ

| Notionブロック | Markdown形式 | 例 |
|---------------|-------------|-----|
| `paragraph` | テキスト + 改行×2 | `Hello World\n\n` |
| `heading_1` | `# テキスト` + 改行×2 | `# タイトル\n\n` |
| `heading_2` | `## テキスト` + 改行×2 | `## サブタイトル\n\n` |
| `heading_3` | `### テキスト` + 改行×2 | `### 小見出し\n\n` |
| `bulleted_list_item` | `- テキスト` + 改行 | `- リスト項目\n` |
| `numbered_list_item` | `1. テキスト` + 改行 | `1. 番号付き\n` |
| `to_do` (未完了) | `[ ] テキスト` + 改行 | `[ ] タスク\n` |
| `to_do` (完了) | `[x] テキスト` + 改行 | `[x] 完了済み\n` |
| `code` | ` ```言語\nコード\n``` ` + 改行×2 | ` ```js\ncode\n``` \n\n` |
| `quote` | `> テキスト` + 改行 | `> 引用\n` |

### Rich Text要素の扱い

| 要素 | Markdown形式 |
|-----|-------------|
| **太字** | `**テキスト**` |
| *斜体* | `*テキスト*` |
| `コード` | `` `テキスト` `` |
| ~~取り消し線~~ | `~~テキスト~~` |
| リンク | `[テキスト](URL)` |

### 変換アルゴリズム

```javascript
1. ページのブロック一覧を取得（GET /v1/blocks/{page_id}/children）
2. 各ブロックを順番に処理：
   a. ブロックタイプを判定
   b. rich_text配列からプレーンテキストを抽出
   c. 装飾（太字、斜体等）をMarkdown記法に変換
   d. ブロックタイプに応じたプレフィックスを追加
   e. 改行を追加
3. 全ブロックのテキストを結合
4. 末尾の余分な改行を削除
```

## Google Tasks → Notion 変換ルール

### パースルール（上から順に評価）

| パターン | ブロックタイプ | 正規表現 |
|---------|--------------|---------|
| `# テキスト` | `heading_1` | `^# (.+)$` |
| `## テキスト` | `heading_2` | `^## (.+)$` |
| `### テキスト` | `heading_3` | `^### (.+)$` |
| `- テキスト` | `bulleted_list_item` | `^- (.+)$` |
| `* テキスト` | `bulleted_list_item` | `^\* (.+)$` |
| `1. テキスト` | `numbered_list_item` | `^\d+\. (.+)$` |
| `[ ] テキスト` | `to_do` (未完了) | `^\[ \] (.+)$` |
| `[x] テキスト` | `to_do` (完了) | `^\[x\] (.+)$` |
| `> テキスト` | `quote` | `^> (.+)$` |
| ` ```...``` ` | `code` | ` ^```(\w*)\n([\s\S]*?)\n``` $` |
| その他 | `paragraph` | `^(.+)$` |
| 空行 | （スキップ） | `^\s*$` |

### Rich Text要素のパース

| パターン | 装飾 | 正規表現 |
|---------|-----|---------|
| `**テキスト**` | 太字 | `\*\*(.+?)\*\*` |
| `*テキスト*` | 斜体 | `\*(.+?)\*` |
| `` `テキスト` `` | コード | `` `(.+?)` `` |
| `~~テキスト~~` | 取り消し線 | `~~(.+?)~~` |
| `[テキスト](URL)` | リンク | `\[(.+?)\]\((.+?)\)` |

### 変換アルゴリズム

```javascript
1. プレーンテキストを改行で分割
2. 各行を処理：
   a. 空行をスキップ
   b. パターンマッチングでブロックタイプを判定
   c. Rich Text装飾をパース
   d. Notion Block形式のオブジェクトを生成
3. 全ブロックを配列にまとめる
4. Blocks APIで一括追加（PATCH /v1/blocks/{page_id}/children）
```

## 実装例

### Notion → Google Tasks

```javascript
// 入力（Notion Blocks）
[
  {
    "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "plain_text": "タスク詳細" }]
    }
  },
  {
    "type": "paragraph",
    "paragraph": {
      "rich_text": [{ "plain_text": "このタスクは重要です。" }]
    }
  },
  {
    "type": "bulleted_list_item",
    "bulleted_list_item": {
      "rich_text": [{ "plain_text": "手順1" }]
    }
  }
]

// 出力（Google Tasks notes）
"## タスク詳細\n\nこのタスクは重要です。\n\n- 手順1\n"
```

### Google Tasks → Notion

```javascript
// 入力（Google Tasks notes）
"## 買い物リスト\n\n- 牛乳\n- パン\n- 卵\n"

// 出力（Notion Blocks）
[
  {
    "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "買い物リスト" } }]
    }
  },
  {
    "type": "bulleted_list_item",
    "bulleted_list_item": {
      "rich_text": [{ "text": { "content": "牛乳" } }]
    }
  },
  {
    "type": "bulleted_list_item",
    "bulleted_list_item": {
      "rich_text": [{ "text": { "content": "パン" } }]
    }
  },
  {
    "type": "bulleted_list_item",
    "bulleted_list_item": {
      "rich_text": [{ "text": { "content": "卵" } }]
    }
  }
]
```

## 制限事項と注意点

### 情報損失

以下のNotion機能は変換時に失われます：

- 色（テキスト色、背景色）
- インデント（ネストされたリスト）
- 複雑な装飾の組み合わせ
- メンション（@ユーザー、@ページ）
- 埋め込みコンテンツ
- 画像・ファイル
- データベースビュー
- テーブル

### 文字数制限

- **Google Tasks notes**: 最大8192文字
- **Notion blocks**: ブロック数に制限あり（最大100ブロック/リクエスト）

### 改行の扱い

- Notionの段落間は改行×2で区切る
- Google Tasksの改行はそのまま保持
- 変換時に余分な改行を削除

## 将来的な拡張案

1. **リッチテキスト対応の拡張**
   - 下線、ハイライト等の追加
   - カスタム色の保持（メタデータとして）

2. **ネスト対応**
   - リストのインデントを記号で表現（`  - サブ項目`）

3. **メンション対応**
   - `@ユーザー名` をテキストとして保持

4. **画像対応**
   - 画像URLをMarkdown形式で埋め込み

5. **双方向同期の最適化**
   - 差分検出による部分更新
   - 衝突解決戦略

## バージョン履歴

- **v1.0** (2025-12-27): 初版作成

