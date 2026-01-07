# Product Overview

NotionのタスクデータベースとGoogle Calendarを双方向で自動同期するGoogle Apps Scriptツール。  
サーバーレスで動作し、日付のみを管理することでタイムゾーン問題を完全に回避する。

## Core Capabilities

- **双方向自動同期**: Notion/Google Calendar双方で作成・更新・削除されたタスクを相互に反映
- **日付のみの管理**: すべてのタスクを終日イベントとして扱い、時刻情報を管理しない（タイムゾーン問題の回避）
- **競合解決**: タイムスタンプ比較によるLast Write Wins方式で自動解決
- **削除同期**: ID相互参照による正確な削除検出とアーカイブ対応
- **スケジュール実行**: 時間トリガー（5分ごと推奨）による自動同期

## Target Use Cases

- **個人のタスク管理**: Notionでタスクを一元管理し、Google Calendarで日程を可視化
- **専用カレンダー運用**: タスク専用のGoogleカレンダーを作成し、会議やプライベート予定と分離
- **範囲限定同期**: 過去1ヶ月～未来2ヶ月の範囲のタスクのみを同期対象とし、パフォーマンスを維持

## Value Proposition

- **ゼロサーバーコスト**: Google Apps Scriptで動作するため、インフラ不要
- **タイムゾーンフリー**: 日付のみを管理することで、タイムゾーン変換や時刻の不整合を完全に回避
- **正確な削除検出**: 双方向のID参照により、新規作成と削除を明確に区別
- **透明性**: Notion APIとGoogle Calendar APIの公式リファレンスに基づいた実装

---
_Focus on patterns and purpose, not exhaustive feature lists_

