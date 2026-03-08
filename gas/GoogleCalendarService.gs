/**
 * GoogleCalendarService.gs
 * 
 * Google Calendar API (v3) との通信を担当するサービス
 * イベントの取得・作成・更新・削除を行う
 * 
 * 依存関係:
 * - TaskData.gs: TaskDataConverter を使用
 * - Google Apps Script Advanced Service: Calendar API
 */

// ========================================
// 設定
// ========================================

const GOOGLE_CALENDAR_CONFIG = {
  API_VERSION: 'v3',
  // Google Calendar APIのレートリミット: 
  // - 1,000,000 queries/day
  // - 100 requests/second/user
  RATE_LIMIT_DELAY: 0 // 十分な余裕があるため遅延不要
};

// ========================================
// イベント取得
// ========================================

/**
 * 期日が過去1ヶ月 ~ 未来2ヶ月の間のGoogleカレンダーイベントを取得
 * @returns {Array} イベント配列
 */
function listRecentEvents() {
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_IDが設定されていません');
  }
  
  Logger.log('[GoogleCalendarService] Listing events (past 1 month ~ future 2 months)');
  
  try {
    // 過去1ヶ月の日付を計算
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);
    
    // 未来2ヶ月の日付を計算
    const twoMonthsLater = new Date();
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
    twoMonthsLater.setHours(23, 59, 59, 999);
    
    const options = {
      timeMin: oneMonthAgo.toISOString(),
      timeMax: twoMonthsLater.toISOString(),
      singleEvents: true, // 繰り返しイベントを個別に展開
      orderBy: 'startTime',
      maxResults: 250,
      showDeleted: false
    };
    
    const response = Calendar.Events.list(calendarId, options);
    const events = response.items || [];
    
    Logger.log(`[GoogleCalendarService] Found ${events.length} events`);
    return events;
    
  } catch (error) {
    Logger.log(`[GoogleCalendarService] Error listing events: ${error.message}`);
    throw error;
  }
}

// ========================================
// イベント作成・更新・削除
// ========================================

/**
 * 新規イベントを作成
 * @param {Object} eventData - イベントデータ（Google Calendar形式またはTaskData形式）
 * @returns {Object} 作成されたイベント
 */
function createEvent(eventData) {
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_IDが設定されていません');
  }
  
  Logger.log(`[GoogleCalendarService] Creating new event: ${eventData.summary || eventData.title}`);
  
  try {
    // TaskData形式の場合はGoogle Calendar形式に変換
    let googleEventData = eventData;
    if (eventData.source) {
      googleEventData = TaskDataConverter.toGoogleEvent(eventData);
    }
    
    const event = Calendar.Events.insert(googleEventData, calendarId);
    
    Logger.log(`[GoogleCalendarService] Event created: ${event.id}`);
    
    return event;
    
  } catch (error) {
    Logger.log(`[GoogleCalendarService] Error creating event: ${error.message}`);
    throw error;
  }
}

/**
 * イベントを更新
 * @param {string} eventId - イベントID
 * @param {Object} eventData - 更新するイベントデータ
 * @returns {Object} 更新されたイベント
 */
function updateEvent(eventId, eventData) {
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_IDが設定されていません');
  }
  
  Logger.log(`[GoogleCalendarService] Updating event: ${eventId}`);
  
  try {
    // TaskData形式の場合はGoogle Calendar形式に変換
    let googleEventData = eventData;
    if (eventData.source) {
      googleEventData = TaskDataConverter.toGoogleEvent(eventData);
    }
    
    const event = Calendar.Events.patch(googleEventData, calendarId, eventId);
    
    Logger.log(`[GoogleCalendarService] Event updated: ${event.id}`);
    
    return event;
    
  } catch (error) {
    Logger.log(`[GoogleCalendarService] Error updating event: ${error.message}`);
    throw error;
  }
}

/**
 * イベントを削除
 * @param {string} eventId - イベントID
 */
function deleteEvent(eventId) {
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_IDが設定されていません');
  }
  
  Logger.log(`[GoogleCalendarService] Deleting event: ${eventId}`);
  
  try {
    Calendar.Events.remove(calendarId, eventId);
    
    Logger.log(`[GoogleCalendarService] Event deleted: ${eventId}`);
    
  } catch (error) {
    Logger.log(`[GoogleCalendarService] Error deleting event: ${error.message}`);
    throw error;
  }
}
