/**
 * Code.gs
 * 
 * Notion → Google Calendarの単方向同期を実行するメインロジック
 * 
 * 依存関係:
 * - TaskData.gs: TaskDataConverter
 * - NotionService.gs: Notion API操作
 * - GoogleCalendarService.gs: Google Calendar API操作
 */

// ========================================
// メイン同期関数
// ========================================

/**
 * Notion → Google Calendar の単方向同期を実行
 * NotionをマスターデータとしてGoogle Calendarに反映
 */
function syncTasks() {
  Logger.log('========================================');
  Logger.log('[Sync] Starting one-way synchronization (Notion → Google Calendar)');
  Logger.log('========================================');
  
  try {
    // 1. データソースIDを取得
    const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
    if (!dataSourceId) {
      throw new Error('NOTION_DATA_SOURCE_IDが設定されていません');
    }
    
    // 2. 両サービスからタスクを取得
    Logger.log('[Sync] Fetching tasks from both services (start time: past 1 month ~ future 2 months)...');
    const notionPages = queryRecentTasks(dataSourceId);
    const googleEvents = listRecentEvents();
    
    // 3. TaskDataに変換してマップを作成
    const notionTasksMap = new Map(); // Notion Page ID → TaskData
    const googleTasksMap = new Map(); // Google Event ID → TaskData
    
    notionPages.forEach(page => {
      const taskData = TaskDataConverter.fromNotionPage(page);
      notionTasksMap.set(taskData.id, taskData);
    });
    
    googleEvents.forEach(event => {
      const taskData = TaskDataConverter.fromGoogleEvent(event);
      googleTasksMap.set(taskData.id, taskData);
    });
    
    Logger.log(`[Sync] Notion: ${notionTasksMap.size} tasks`);
    Logger.log(`[Sync] Google Calendar: ${googleTasksMap.size} events (including non-Notion events)`);
    
    // 4. タスク分類（単方向）
    Logger.log('[Sync] Categorizing tasks...');
    const categories = categorizeTasks(notionTasksMap, googleTasksMap);
    Logger.log(`[Sync] Categories: Create=${categories.toCreate.length}, Update=${categories.toUpdate.length}, Delete=${categories.toDelete.length}`);
    
    // 5. Phase 1: 新規タスク作成（Notion → Google）
    Logger.log('[Sync] Phase 1: Creating new tasks');
    createNotionToGoogle(categories.toCreate, dataSourceId);
    
    // 6. Phase 2: 既存タスク更新（Notion → Google）
    Logger.log('[Sync] Phase 2: Updating changed tasks');
    updateNotionToGoogle(categories.toUpdate);
    
    // 7. Phase 3: 削除タスク処理（Notionに存在しないGoogleイベントを削除）
    Logger.log('[Sync] Phase 3: Deleting tasks removed from Notion');
    deleteFromGoogleCalendar(categories.toDelete);
    
    Logger.log('========================================');
    Logger.log('[Sync] Synchronization completed successfully');
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log(`[Sync] ERROR: ${error.message}`);
    Logger.log(`[Sync] Stack trace: ${error.stack}`);
    throw error;
  }
}

// ========================================
// タスク分類関数
// ========================================

/**
 * タスクを新規・更新・削除に分類（単方向：Notion → Google）
 * @param {Map} notionTasksMap - Notion Page ID → TaskData
 * @param {Map} googleTasksMap - Google Event ID → TaskData
 * @returns {Object} 分類されたタスク { toCreate, toUpdate, toDelete }
 */
function categorizeTasks(notionTasksMap, googleTasksMap) {
  const toCreate = [];  // Notion → Google: 作成
  const toUpdate = [];  // Notion → Google: 更新
  const toDelete = [];  // Google: 削除（Notionに存在しない）

  const processedGoogleEventIds = new Set();

  // 1. Notionタスクを処理
  notionTasksMap.forEach(notionTask => {
    if (!notionTask.googleEventId) {
      // Google Event IDがない → Create
      toCreate.push(notionTask);
    } else {
      // Google Event IDがある → Googleに存在するか確認
      const googleEvent = googleTasksMap.get(notionTask.googleEventId);
      
      if (googleEvent) {
        // 両方に存在 → 内容が異なる場合はUpdate
        if (hasContentChanged(notionTask, googleEvent)) {
          toUpdate.push({ notionTask, googleEvent });
        }
        processedGoogleEventIds.add(googleEvent.id);
      } else {
        // NotionにはあるがGoogleにない → 再作成
        // （Google Event IDをクリアして新規作成扱い）
        toCreate.push(notionTask);
      }
    }
  });

  // 2. Googleタスクを処理（Notionに紐付かないものを削除）
  googleTasksMap.forEach(googleEvent => {
    if (processedGoogleEventIds.has(googleEvent.id)) {
      return; // 既に処理済み（Notionと紐付いている）
    }

    if (googleEvent.notionPageId) {
      // Notion Page IDを持っているが、Notionに存在しない → Delete
      toDelete.push(googleEvent);
    }
    // Notion Page IDがない場合は無視（Google Calendar上で直接作成されたイベント）
  });

  return { toCreate, toUpdate, toDelete };
}

/**
 * タスクの内容が異なるかチェック
 * title, status, startDate, endDateの4つのフィールドで判定
 * @param {TaskData} notionTask - Notionタスク
 * @param {TaskData} googleEvent - Google Calendarイベント
 * @returns {boolean} 内容が異なる場合true
 */
function hasContentChanged(notionTask, googleEvent) {
  const titleChanged = notionTask.title !== googleEvent.title;
  const statusChanged = notionTask.status !== googleEvent.status;
  const startDateChanged = notionTask.startDate !== googleEvent.startDate;
  const endDateChanged = notionTask.endDate !== googleEvent.endDate;
  
  return titleChanged || statusChanged || startDateChanged || endDateChanged;
}

// ========================================
// Phase 1: 新規タスク作成
// ========================================

/**
 * Notion → Google Calendar の新規タスク作成
 * @param {Array} newNotionTasks - 新規Notionタスク配列
 * @param {string} dataSourceId - Data Source ID
 */
function createNotionToGoogle(newNotionTasks, dataSourceId) {
  let createCount = 0;
  
  newNotionTasks.forEach(notionTask => {
    Logger.log(`[Create] Notion → Google: "${notionTask.title}"`);
    
    try {
      const googleEventData = TaskDataConverter.toGoogleEvent(notionTask);
      const createdEvent = createEvent(googleEventData);
      
      // Notionページを更新してGoogle Event IDを保存
      const properties = {
        'Google Event ID': {
          rich_text: [
            {
              text: {
                content: createdEvent.id
              }
            }
          ]
        }
      };
      updatePage(notionTask.id, properties);
      
      createCount++;
      Logger.log(`[Create] Created Google Calendar Event: ${createdEvent.id}`);
      
      waitForRateLimit();
    } catch (error) {
      Logger.log(`[Create] Error creating event: ${error.message}`);
    }
  });
  
  Logger.log(`[Create] Total: ${createCount} tasks created`);
}

// ========================================
// Phase 2: 既存タスク更新
// ========================================

/**
 * Notion → Google Calendar の更新
 * @param {Array} updates - 更新対象の配列
 */
function updateNotionToGoogle(updates) {
  let updateCount = 0;
  
  updates.forEach(({ notionTask, googleEvent }) => {
    Logger.log(`[Update] Notion → Google: "${notionTask.title}"`);
    
    try {
      const updateData = TaskDataConverter.toGoogleEvent(notionTask);
      updateEvent(googleEvent.id, updateData);
      
      updateCount++;
    } catch (error) {
      Logger.log(`[Update] Error updating event: ${error.message}`);
    }
  });
  
  Logger.log(`[Update] Total: ${updateCount} tasks updated`);
}

// ========================================
// Phase 3: 削除タスク処理
// ========================================

/**
 * Notionから削除されたタスクをGoogle Calendarから削除
 * @param {Array} deletedTasks - Notionで削除されたGoogleイベント配列
 */
function deleteFromGoogleCalendar(deletedTasks) {
  let deleteCount = 0;
  
  deletedTasks.forEach(googleEvent => {
    Logger.log(`[Delete] Deleting Google Calendar event: "${googleEvent.title}"`);
    
    try {
      deleteEvent(googleEvent.id);
      
      deleteCount++;
      
      Utilities.sleep(100); // レートリミット対策
    } catch (error) {
      Logger.log(`[Delete] Error deleting event: ${error.message}`);
    }
  });
  
  Logger.log(`[Delete] Total: ${deleteCount} events deleted`);
}

// ========================================
// テスト・設定確認関数
// ========================================

/**
 * 設定確認
 */
function testConfiguration() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
  const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
  const calendarId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CALENDAR_ID');
  
  Logger.log('=== Configuration Test ===');
  Logger.log('NOTION_API_KEY: ' + (apiKey ? '設定済み (長さ: ' + apiKey.length + ')' : '未設定'));
  Logger.log('NOTION_DATA_SOURCE_ID: ' + (dataSourceId ? dataSourceId : '未設定'));
  Logger.log('GOOGLE_CALENDAR_ID: ' + (calendarId ? calendarId : '未設定'));
  
  if (!apiKey || !dataSourceId || !calendarId) {
    Logger.log('ERROR: 必須の設定が不足しています');
    return;
  }
  
  Logger.log('設定OK');
}
