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

// ========================================
// 単体テスト関数
// ========================================

/**
 * テスト: イベント一覧取得
 */
function testListRecentEvents() {
  Logger.log('========================================');
  Logger.log('TEST: listRecentEvents');
  Logger.log('========================================');
  
  try {
    const events = listRecentEvents();
    
    Logger.log(`SUCCESS: Retrieved ${events.length} events`);
    
    // 各イベントの詳細を表示
    events.forEach((event, index) => {
      const taskData = TaskDataConverter.fromGoogleEvent(event);
      Logger.log(`${index + 1}. ${taskData.title} (${taskData.status})`);
      Logger.log(`   Start: ${taskData.startTime}`);
      Logger.log(`   End: ${taskData.endTime}`);
    });
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: イベント作成
 */
function testCreateEvent() {
  Logger.log('========================================');
  Logger.log('TEST: createEvent');
  Logger.log('========================================');
  
  try {
    // 明日の10:00-11:00のイベントを作成
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    const endTime = new Date(tomorrow);
    endTime.setHours(11, 0, 0, 0);
    
    const eventData = {
      summary: 'APIテスト - ' + new Date().toLocaleString('ja-JP'),
      start: {
        dateTime: tomorrow.toISOString(),
        timeZone: 'Asia/Tokyo'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Tokyo'
      }
    };
    
    const createdEvent = createEvent(eventData);
    
    Logger.log(`SUCCESS: Event created`);
    Logger.log(`Event ID: ${createdEvent.id}`);
    Logger.log(`Summary: ${createdEvent.summary}`);
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: TaskDataConverterの変換
 */
function testTaskDataConverterForCalendar() {
  Logger.log('========================================');
  Logger.log('TEST: TaskDataConverter (Google Calendar)');
  Logger.log('========================================');
  
  try {
    // 1. Google Calendar Event → TaskData
    const googleEvent = {
      id: 'test-event-123',
      summary: 'テストイベント',
      start: {
        dateTime: '2026-01-15T10:00:00+09:00',
        timeZone: 'Asia/Tokyo'
      },
      end: {
        dateTime: '2026-01-15T11:00:00+09:00',
        timeZone: 'Asia/Tokyo'
      },
      status: 'confirmed',
      updated: '2025-12-27T10:00:00Z',
      htmlLink: 'https://calendar.google.com/calendar/event?eid=xxx'
    };
    
    Logger.log('1. Google Calendar Event → TaskData:');
    const taskData = TaskDataConverter.fromGoogleEvent(googleEvent);
    Logger.log(JSON.stringify(taskData, null, 2));
    
    // 2. TaskData → Google Calendar Event
    Logger.log('\n2. TaskData → Google Calendar Event:');
    const convertedBack = TaskDataConverter.toGoogleEvent(taskData);
    Logger.log(JSON.stringify(convertedBack, null, 2));
    
    Logger.log('\nSUCCESS: Conversion test completed');
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * デバッグ: 1件のGoogle CalendarイベントのRAWデータを表示
 */
function testDebugGoogleEventDateTime() {
  Logger.log('[DEBUG] Fetching one Google Calendar event to inspect date/time...');
  
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  if (!calendarId) {
    Logger.log('[DEBUG] ERROR: GOOGLE_CALENDAR_ID not set');
    return;
  }
  
  const response = Calendar.Events.list(calendarId, {
    maxResults: 1,
    singleEvents: true,
    orderBy: 'startTime'
  });
  
  if (response.items && response.items.length > 0) {
    const googleEvent = response.items[0];
    
    Logger.log('[DEBUG] ===== Google Calendar Event RAW Data =====');
    Logger.log('[DEBUG] Event ID: ' + googleEvent.id);
    Logger.log('[DEBUG] Summary: ' + googleEvent.summary);
    Logger.log('[DEBUG] Full RAW: ' + JSON.stringify(googleEvent, null, 2));
    
    // TaskDataConverterで変換
    const taskData = TaskDataConverter.fromGoogleEvent(googleEvent);
    
    Logger.log('[DEBUG] ===== After Conversion =====');
    Logger.log('[DEBUG] TaskData.title: ' + taskData.title);
    Logger.log('[DEBUG] TaskData.startTime: ' + taskData.startTime);
    Logger.log('[DEBUG] TaskData.endTime: ' + taskData.endTime);
    Logger.log('[DEBUG] TaskData.status: ' + taskData.status);
  } else {
    Logger.log('[DEBUG] No events found');
  }
}

/**
 * デバッグ: 特定のGoogle Calendarイベントの生データを表示
 * @param {string} eventId - Google Calendar Event ID
 */
function testDebugGoogleEventById(eventId) {
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  Logger.log('[DEBUG] Fetching event: ' + eventId);
  
  try {
    const event = Calendar.Events.get(calendarId, eventId);
    
    Logger.log('[DEBUG] ===== Google Calendar RAW Data =====');
    Logger.log('[DEBUG] Event ID: ' + event.id);
    Logger.log('[DEBUG] Summary: ' + event.summary);
    Logger.log('[DEBUG] Start: ' + JSON.stringify(event.start, null, 2));
    Logger.log('[DEBUG] End: ' + JSON.stringify(event.end, null, 2));
    Logger.log('[DEBUG] Updated: ' + event.updated);
    
    // TaskDataConverterで変換
    const taskData = TaskDataConverter.fromGoogleEvent(event);
    
    Logger.log('[DEBUG] ===== After Conversion =====');
    Logger.log('[DEBUG] TaskData.title: ' + taskData.title);
    Logger.log('[DEBUG] TaskData.startTime: ' + taskData.startTime);
    Logger.log('[DEBUG] TaskData.endTime: ' + taskData.endTime);
    Logger.log('[DEBUG] TaskData.status: ' + taskData.status);
    
    // toGoogleEventで逆変換
    const googleEvent = TaskDataConverter.toGoogleEvent(taskData);
    
    Logger.log('[DEBUG] ===== After toGoogleEvent =====');
    Logger.log('[DEBUG] Start: ' + JSON.stringify(googleEvent.start, null, 2));
    Logger.log('[DEBUG] End: ' + JSON.stringify(googleEvent.end, null, 2));
    
  } catch (error) {
    Logger.log('[DEBUG] Error: ' + error.message);
  }
}

/**
 * 全テスト実行
 */
function runAllGoogleCalendarTests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL GOOGLE CALENDAR SERVICE TESTS');
  Logger.log('========================================\n');
  
  testListRecentEvents();
  Logger.log('\n');
  
  Utilities.sleep(1000);
  
  testTaskDataConverterForCalendar();
  Logger.log('\n');
  
  // createEventテストはコメントアウト（実際のデータを作成するため）
  // testCreateEvent();
  
  Logger.log('========================================');
  Logger.log('ALL TESTS COMPLETED');
  Logger.log('========================================');
}

