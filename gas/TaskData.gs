/**
 * TaskData.gs
 * 
 * NotionとGoogle Calendar間で共有する統一データ構造と変換ユーティリティ
 * 両サービスで使用される共通のデータ型定義と変換ロジックを提供
 */

// ========================================
// データ型定義
// ========================================

/**
 * 共通タスクデータ型
 * NotionとGoogle Calendar間でやり取りする統一データ構造
 * 同期に必要な最小限のフィールドのみを含む
 * 
 * @typedef {Object} TaskData
 * @property {string} id - データソースのプライマリID
 *   - source='notion'の場合: Notion Page ID
 *   - source='google'の場合: Google Calendar Event ID
 * @property {string} title - タスク名（双方向同期）
 * @property {string} status - ステータス（双方向同期）: ToDo/Done
 * @property {string|null} startTime - 開始日時（双方向同期）: ISO 8601形式
 * @property {string|null} endTime - 終了日時（双方向同期）: ISO 8601形式
 * @property {string} lastEditedTime - 最終編集日時（同期判定用）: ISO 8601形式
 * @property {string|null} notionUrl - NotionページURL（Notion → Google Calendarのdescription）
 * @property {string|null} googleEventId - Google Calendar Event ID（マッピング用）
 *   - source='notion'の場合: Notionプロパティに保存されたGoogle Event ID
 *   - source='google'の場合: idと同じ値
 * @property {string|null} notionPageId - Notion Page ID（削除判定用）
 *   - source='google'の場合: descriptionから抽出したNotion Page ID
 *   - source='notion'の場合: idと同じ値
 * @property {string} source - データソース: 'notion' | 'google'
 */

// ========================================
// データ変換ユーティリティ
// ========================================

/**
 * TaskData変換ユーティリティ
 * NotionとGoogle Tasks間のデータ変換を担当
 */
const TaskDataConverter = {
  /**
   * Notionページから共通TaskDataを生成
   * @param {Object} page - Notionページオブジェクト
   * @returns {TaskData}
   */
  fromNotionPage: function(page) {
    const properties = page.properties;
    
    // タイトル取得
    const titleProp = properties['タスク名'] || properties['title'];
    const title = titleProp?.title?.[0]?.plain_text || '(無題)';
    
    // Google Event ID取得（Notionプロパティに保存されている場合）
    const googleEventIdProp = properties['Google Event ID'];
    const googleEventId = googleEventIdProp?.rich_text?.[0]?.plain_text || null;
    
    // ステータス取得（ToDo/Done）
    const statusProp = properties['ステータス'];
    const status = statusProp?.status?.name || 'ToDo';
    
    // 日付プロパティから開始時刻・終了時刻を取得
    const dateProp = properties['日付'];
    const dateData = dateProp?.date;
    let startTime = null;
    let endTime = null;
    
    if (dateData) {
      // 開始時刻（start）
      if (dateData.start) {
        // タイムゾーン表記を統一（+09:00などをZ形式に変換）
        startTime = TaskDataConverter._normalizeDateTime(dateData.start);
      }
      
      // 終了時刻（end）
      if (dateData.end) {
        endTime = TaskDataConverter._normalizeDateTime(dateData.end);
        
        // Notionの終日イベントは包含的（inclusive）、Google Calendarは排他的（exclusive）
        // TaskDataは排他的形式で統一するため、Notionのendに+1日する
        // 例：Notion start=12/27, end=12/28（2日間） → TaskData end=12/29T00:00Z
        // 時刻指定イベント（time_zone != null）の場合は変換不要
        if (dateData.time_zone === null && endTime && endTime.match(/T00:00:00\.000Z$/)) {
          const endDateObj = new Date(endTime);
          endDateObj.setDate(endDateObj.getDate() + 1); // +1日（排他的形式に変換）
          endTime = endDateObj.toISOString();
        }
      }
    }
    
    // 最終編集時刻もタイムゾーン表記を統一
    const lastEditedTime = page.last_edited_time.replace(/\+00:00$/, 'Z');
    
    return {
      id: page.id, // Notion Page ID
      title: title,
      status: status,
      startTime: startTime,
      endTime: endTime,
      lastEditedTime: lastEditedTime,
      notionUrl: page.url,
      googleEventId: googleEventId,
      notionPageId: page.id, // idと同じ値（削除判定用）
      source: 'notion'
    };
  },

  /**
   * 日時文字列をUTC（Z形式）に正規化
   * @param {string} dateTimeStr - ISO 8601形式の日時文字列
   * @returns {string} UTC（Z形式）の日時文字列
   */
  _normalizeDateTime: function(dateTimeStr) {
    if (!dateTimeStr) return null;
    
    // 既にZ形式の場合はそのまま
    if (dateTimeStr.endsWith('Z')) {
      return dateTimeStr;
    }
    
    // +00:00形式はZに置換
    if (dateTimeStr.endsWith('+00:00')) {
      return dateTimeStr.replace(/\+00:00$/, 'Z');
    }
    
    // その他のタイムゾーン（例：+09:00）はDateオブジェクトを使ってUTCに変換
    try {
      const date = new Date(dateTimeStr);
      return date.toISOString();
    } catch (error) {
      Logger.log(`[TaskDataConverter] Error normalizing dateTime: ${error.message}`);
      return dateTimeStr; // エラーの場合はそのまま返す
    }
  },

  /**
   * UTC時刻を指定タイムゾーンのローカル時刻文字列に変換
   * Notion APIはタイムゾーン付きの時刻をローカル時刻として解釈するため、
   * UTC時刻をローカル時刻に変換し、タイムゾーンオフセットは含めない
   * @param {string} utcDateTimeStr - UTC時刻文字列（ISO 8601形式）
   * @param {string} timeZone - タイムゾーン（例："Asia/Tokyo"）
   * @returns {string} ローカル時刻文字列（タイムゾーンオフセットなし、例："2026-01-03T10:00:00.000"）
   */
  _convertToTimeZone: function(utcDateTimeStr, timeZone) {
    if (!utcDateTimeStr) return null;
    
    try {
      const utcDate = new Date(utcDateTimeStr);
      
      // Utilities.formatDate を使用してタイムゾーン変換
      // 形式: "yyyy-MM-dd'T'HH:mm:ss.SSS" (例: 2026-01-03T10:00:00.000)
      // タイムゾーンオフセット（+09:00など）は含めない（Notion APIの仕様）
      const localDateTimeStr = Utilities.formatDate(utcDate, timeZone, "yyyy-MM-dd'T'HH:mm:ss.SSS");
      
      return localDateTimeStr;
    } catch (error) {
      Logger.log(`[TaskDataConverter] Error converting to timezone: ${error.message}`);
      return utcDateTimeStr; // エラーの場合はそのまま返す
    }
  },

  /**
   * TaskDataからNotionプロパティを生成
   * @param {TaskData} taskData - 共通タスクデータ
   * @returns {Object} Notionプロパティオブジェクト
   */
  toNotionProperties: function(taskData) {
    const properties = {};
    
    // タイトル（必須）
    if (taskData.title) {
      properties['タスク名'] = {
        title: [
          {
            text: {
              content: taskData.title
            }
          }
        ]
      };
    }
    
    // Google Event ID（マッピング用）
    if (taskData.googleEventId) {
      properties['Google Event ID'] = {
        rich_text: [
          {
            text: {
              content: taskData.googleEventId
            }
          }
        ]
      };
    }
    
    // ステータス（ToDo/Done）
    if (taskData.status) {
      properties['ステータス'] = {
        status: {
          name: taskData.status
        }
      };
    }
    
    // 日付（開始時刻と終了時刻を含む）
    if (taskData.startTime || taskData.endTime) {
      // 終日イベント判定（00:00:00Z で終わる場合）
      const isAllDay = taskData.startTime && taskData.startTime.match(/T00:00:00\.000Z$/);
      
      if (isAllDay) {
        // 終日イベントの場合は日付のみ（時刻なし）でNotionに保存
        const startDate = taskData.startTime.split('T')[0]; // YYYY-MM-DD
        let endDate = null;
        
        if (taskData.endTime) {
          // TaskDataは排他的（exclusive）形式
          // Notionは包含的（inclusive）形式
          // TaskDataのendから-1日してNotionに保存
          // 例：TaskData end=12/29T00:00Z → Notion end=12/28（12/27-12/28の2日間）
          
          const endDateObj = new Date(taskData.endTime.split('T')[0]);
          const startDateObj = new Date(startDate);
          const dayDiff = (endDateObj - startDateObj) / (1000 * 60 * 60 * 24);
          
          if (dayDiff <= 1) {
            // 1日以内の差 = 1日間の終日イベント
            // Notionでは end=null にする
            endDate = null;
          } else {
            // 2日以上の差 = 複数日の終日イベント
            // TaskDataの排他的endから-1日してNotionの包含的endにする
            const notionEndDate = new Date(endDateObj.getTime() - 1000 * 60 * 60 * 24);
            endDate = notionEndDate.toISOString().split('T')[0];
          }
        }
        
        properties['日付'] = {
          date: {
            start: startDate, // 日付のみ
            end: endDate,     // 日付のみ（または null）
            time_zone: null   // 終日イベントはタイムゾーンなし
          }
        };
      } else {
        // 時刻指定イベントの場合は時刻を含めて保存
        // Notionはタイムゾーンをローカル時刻として解釈するため、
        // UTC時刻をJSTに変換せず、タイムゾーン付きの文字列として渡す
        
        // UTC時刻をJST時刻に変換（+09:00形式）
        const startJST = taskData.startTime ? TaskDataConverter._convertToTimeZone(taskData.startTime, 'Asia/Tokyo') : null;
        const endJST = taskData.endTime ? TaskDataConverter._convertToTimeZone(taskData.endTime, 'Asia/Tokyo') : null;
        
        properties['日付'] = {
          date: {
            start: startJST,
            end: endJST,
            time_zone: 'Asia/Tokyo'  // JST (GMT+9) で保存
          }
        };
      }
    } else {
      properties['日付'] = {
        date: null
      };
    }
    
    return properties;
  },

  /**
   * Google Calendar EventからTaskDataを生成
   * @param {Object} googleEvent - Google Calendar Eventオブジェクト
   * @returns {TaskData}
   */
  fromGoogleEvent: function(googleEvent) {
    // タイトル取得 + プレフィックスからステータス判定
    let title = googleEvent.summary || '(無題)';
    let status = 'ToDo';
    
    // プレフィックスでステータスを判定
    if (title.startsWith('✔ ')) {
      status = 'Done';
      title = title.substring(2); // プレフィックスを除去
    } else if (title.startsWith('▶ ')) {
      status = 'ToDo';
      title = title.substring(2); // プレフィックスを除去
    }
    // プレフィックスがない場合はデフォルトで ToDo
    
    // 開始時刻取得（UTCに統一）
    let startTime = null;
    if (googleEvent.start) {
      if (googleEvent.start.dateTime) {
        startTime = TaskDataConverter._normalizeDateTime(googleEvent.start.dateTime);
      } else if (googleEvent.start.date) {
        // 終日イベントの場合は日付のみ
        startTime = googleEvent.start.date + 'T00:00:00.000Z';
      }
    }
    
    // 終了時刻取得（UTCに統一）
    let endTime = null;
    if (googleEvent.end) {
      if (googleEvent.end.dateTime) {
        endTime = TaskDataConverter._normalizeDateTime(googleEvent.end.dateTime);
      } else if (googleEvent.end.date) {
        // 終日イベントの場合は日付のみ
        endTime = googleEvent.end.date + 'T00:00:00.000Z';
      }
    }
    
    // descriptionからNotion Page IDを抽出（形式: "Notion: PAGE_ID\nURL"）
    let notionPageId = null;
    if (googleEvent.description) {
      const match = googleEvent.description.match(/^Notion:\s*([a-f0-9-]+)/i);
      if (match) {
        notionPageId = match[1];
      }
    }
    
    // lastEditedTime（updated）もUTCに統一
    const lastEditedTime = TaskDataConverter._normalizeDateTime(googleEvent.updated);
    
    return {
      id: googleEvent.id, // Google Calendar Event ID
      title: title, // プレフィックス除去済み
      status: status, // プレフィックスから判定
      startTime: startTime,
      endTime: endTime,
      lastEditedTime: lastEditedTime,
      notionUrl: null, // Google Calendarから作成された場合は後で設定
      googleEventId: googleEvent.id, // idと同じ値
      notionPageId: notionPageId, // descriptionから抽出したNotion Page ID
      source: 'google'
    };
  },

  /**
   * TaskDataからGoogle Calendar Event形式を生成
   * @param {TaskData} taskData - 共通タスクデータ
   * @returns {Object} Google Calendar Eventオブジェクト
   */
  toGoogleEvent: function(taskData) {
    const googleEvent = {};
    
    // タイトル（必須）+ ステータスプレフィックス
    if (taskData.title) {
      let prefix = '';
      if (taskData.status === 'Done') {
        prefix = '✔ ';
      } else {
        prefix = '▶ ';
      }
      googleEvent.summary = prefix + taskData.title;
    }
    
    // 開始時刻と終了時刻
    if (taskData.startTime) {
      // 時刻が 00:00:00Z（UTC 0時）の場合は終日イベントとして扱う
      const isAllDay = taskData.startTime.match(/T00:00:00\.000Z$/);
      
      if (isAllDay) {
        // 終日イベント形式（dateTime フィールドを明示的にクリア）
        const startDate = taskData.startTime.split('T')[0]; // YYYY-MM-DD
        googleEvent.start = { 
          date: startDate,
          dateTime: null, // 既存の dateTime をクリア
          timeZone: null  // 既存の timeZone をクリア
        };
        
        // 終日イベントのendは排他的（exclusive）
        // TaskDataも排他的形式なので、そのまま使用
        if (taskData.endTime && taskData.endTime.match(/T00:00:00\.000Z$/)) {
          // endTimeがある場合（複数日イベント）
          googleEvent.end = { 
            date: taskData.endTime.split('T')[0],  // そのまま使用
            dateTime: null,
            timeZone: null
          };
        } else if (!taskData.endTime) {
          // endTimeがnull = 1日間の終日イベント（Notionでend未設定）
          // Google Calendarでは翌日の日付を設定
          const endDateObj = new Date(startDate);
          endDateObj.setDate(endDateObj.getDate() + 1);
          const endDate = endDateObj.toISOString().split('T')[0];
          
          googleEvent.end = { 
            date: endDate,  // 翌日
            dateTime: null,
            timeZone: null
          };
        } else {
          // endTimeが00:00:00Zではない場合（時刻指定イベント、通常ありえない）
          googleEvent.end = { 
            date: startDate,
            dateTime: null,
            timeZone: null
          };
        }
      } else {
        // 通常の時刻指定イベント（date フィールドを明示的にクリア）
        googleEvent.start = {
          dateTime: taskData.startTime,
          timeZone: 'Asia/Tokyo',
          date: null // 既存の date をクリア
        };
        
        // 終了時刻がない場合は、開始時刻の1時間後をデフォルトとする
        if (taskData.endTime) {
          googleEvent.end = {
            dateTime: taskData.endTime,
            timeZone: 'Asia/Tokyo',
            date: null
          };
        } else {
          // endTimeがない場合は、startTimeの1時間後を設定
          const startDate = new Date(taskData.startTime);
          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1時間後
          googleEvent.end = {
            dateTime: endDate.toISOString(),
            timeZone: 'Asia/Tokyo',
            date: null
          };
        }
      }
    } else {
      // startTimeがない場合は終日イベントとして扱う（本来は同期対象外のはず）
      const today = new Date().toISOString().split('T')[0];
      googleEvent.start = { 
        date: today,
        dateTime: null,
        timeZone: null
      };
      googleEvent.end = { 
        date: today,
        dateTime: null,
        timeZone: null
      };
    }
    
    // description: Notion Page IDとURLを含める（削除判定用）
    if (taskData.notionUrl) {
      googleEvent.description = `Notion: ${taskData.id}\n${taskData.notionUrl}`;
    }
    
    return googleEvent;
  },

  /**
   * Google TaskからTaskDataを生成（後方互換性のため保持）
   * @param {Object} googleTask - Google Taskオブジェクト
   * @returns {TaskData}
   * @deprecated Google Calendarに移行したため非推奨
   */
  fromGoogleTask: function(googleTask) {
    // ステータス変換: Google Tasks ("needsAction" | "completed") → 統一形式（ToDo/Done）
    let status = 'ToDo';
    if (googleTask.status === 'completed') {
      status = 'Done';
    }
    
    // 期日: RFC 3339形式をそのまま保持（日時情報含む）
    let dueDate = null;
    if (googleTask.due) {
      // "2025-12-31T00:00:00.000Z" 形式をそのまま使用
      dueDate = googleTask.due;
    }
    
    // notesからNotion Page IDを抽出（形式: "Notion: PAGE_ID\nURL"）
    let notionPageId = null;
    if (googleTask.notes) {
      const match = googleTask.notes.match(/^Notion:\s*([a-f0-9-]+)/i);
      if (match) {
        notionPageId = match[1];
      }
    }
    
    return {
      id: googleTask.id, // Google Task ID
      title: googleTask.title || '(無題)',
      status: status,
      dueDate: dueDate,
      lastEditedTime: googleTask.updated,
      notionUrl: null, // Google Tasksから作成された場合は後で設定
      googleTaskId: googleTask.id, // idと同じ値
      notionPageId: notionPageId, // notesから抽出したNotion Page ID
      source: 'google'
    };
  },

  /**
   * TaskDataからGoogle Task形式を生成（後方互換性のため保持）
   * @param {TaskData} taskData - 共通タスクデータ
   * @returns {Object} Google Taskオブジェクト
   * @deprecated Google Calendarに移行したため非推奨
   */
  toGoogleTask: function(taskData) {
    const googleTask = {};
    
    // タイトル（必須）
    if (taskData.title) {
      googleTask.title = taskData.title;
    }
    
    // ステータス: 統一形式（ToDo/Done） → Google Tasks形式
    if (taskData.status === 'Done') {
      googleTask.status = 'completed';
    } else {
      googleTask.status = 'needsAction';
    }
    
    // 期日: ISO 8601形式をそのまま使用
    if (taskData.dueDate) {
      // Notionから "2025-12-31" 形式が来た場合は時刻を追加
      // Notionから "2025-12-31T15:30:00.000Z" 形式が来た場合はそのまま
      if (taskData.dueDate.length === 10) {
        // 日付のみの場合（YYYY-MM-DD）
        googleTask.due = taskData.dueDate + 'T00:00:00.000Z';
      } else {
        // 日時情報が含まれている場合
        googleTask.due = taskData.dueDate;
      }
    }
    
    // notes: Notion Page IDとURLを含める（削除判定用）
    if (taskData.notionUrl) {
      googleTask.notes = `Notion: ${taskData.id}\n${taskData.notionUrl}`;
    }
    
    return googleTask;
  }
};
