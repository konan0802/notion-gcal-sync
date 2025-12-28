/**
 * Code.gs
 * 
 * NotionとGoogle Calendarの双方向同期を実行するメインロジック
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
 * Notion ↔ Google Calendar の双方向同期を実行
 */
function syncTasks() {
  Logger.log('========================================');
  Logger.log('[Sync] Starting synchronization');
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
    const googleEventIdToNotionMap = new Map(); // Google Event ID → Notion Task のマップ
    const notionPageIdToGoogleMap = new Map(); // Notion Page ID → Google Event のマップ
    
    notionPages.forEach(page => {
      const taskData = TaskDataConverter.fromNotionPage(page);
      notionTasksMap.set(taskData.id, taskData);
      
      if (taskData.googleEventId) {
        googleEventIdToNotionMap.set(taskData.googleEventId, taskData);
      }
    });
    
    googleEvents.forEach(event => {
      const taskData = TaskDataConverter.fromGoogleEvent(event);
      googleTasksMap.set(taskData.id, taskData);
      
      if (taskData.notionPageId) {
        notionPageIdToGoogleMap.set(taskData.notionPageId, taskData);
      }
    });
    
    Logger.log(`[Sync] Notion: ${notionTasksMap.size} tasks`);
    Logger.log(`[Sync] Google Calendar: ${googleTasksMap.size} events`);
    
  // 4. タスク分類（1回のループで完了）
  Logger.log('[Sync] Categorizing tasks...');
  const categories = categorizeTasks(notionTasksMap, googleTasksMap, googleEventIdToNotionMap, notionPageIdToGoogleMap);
  Logger.log(`[Sync] Categories: NewNotion=${categories.newNotionTasks.length}, NewGoogle=${categories.newGoogleEvents.length}, N→G=${categories.notionToGoogleUpdates.length}, G→N=${categories.googleToNotionUpdates.length}, DeletedInNotion=${categories.deletedInNotion.length}, DeletedInGoogle=${categories.deletedInGoogle.length}`);
  
  // 5. Phase 1: 新規タスク作成
  Logger.log('[Sync] Phase 1: Creating new tasks');
  createNotionToGoogle(categories.newNotionTasks, dataSourceId);
  createGoogleToNotion(categories.newGoogleEvents, dataSourceId);
    
    // 6. Phase 2: 既存タスク更新
    Logger.log('[Sync] Phase 2: Updating changed tasks');
    updateNotionToGoogle(categories.notionToGoogleUpdates);
    updateGoogleToNotion(categories.googleToNotionUpdates);
    
    // 7. Phase 3: 削除タスク処理
    Logger.log('[Sync] Phase 3: Deletion detection');
    deleteFromGoogleCalendar(categories.deletedInNotion);
    archiveFromNotion(categories.deletedInGoogle);
    
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
 * タスクを新規・更新・削除に分類
 * @param {Map} notionTasksMap - Notion Page ID → TaskData
 * @param {Map} googleTasksMap - Google Event ID → TaskData
 * @param {Map} googleEventIdToNotionMap - Google Event ID → Notion Taskのマップ（未使用だが互換性のため保持）
 * @param {Map} notionPageIdToGoogleMap - Notion Page ID → Google Eventのマップ
 * @returns {Object} 分類されたタスク
 */
function categorizeTasks(notionTasksMap, googleTasksMap, googleEventIdToNotionMap, notionPageIdToGoogleMap) {
  const newNotionTasks = [];
  const newGoogleEvents = [];
  const notionToGoogleUpdates = [];
  const googleToNotionUpdates = [];
  const deletedInNotion = [];
  const deletedInGoogle = [];

  const processedGoogleEventIds = new Set();

  // Notionタスクを処理
  notionTasksMap.forEach(notionTask => {
    if (!notionTask.googleEventId) {
      // Google Event IDがない → 新規タスク（Notion → Google）
      newNotionTasks.push(notionTask);
    } else {
      // Google Event IDがある → 既存タスク
      const googleEvent = googleTasksMap.get(notionTask.googleEventId);
      
      if (googleEvent) {
        // 両方に存在 → 内容比較
        if (hasContentChanged(notionTask, googleEvent)) {
          // 内容が異なる → タイムスタンプ比較で更新方向を決定
          const notionTime = new Date(notionTask.lastEditedTime);
          const googleTime = new Date(googleEvent.lastEditedTime);

          if (notionTime > googleTime) {
            notionToGoogleUpdates.push({ notionTask, googleEvent });
          } else if (googleTime > notionTime) {
            googleToNotionUpdates.push({ notionTask, googleEvent });
          }
        }
        processedGoogleEventIds.add(googleEvent.id);
      } else {
        // Notionには存在するがGoogleにない → Googleで削除された
        deletedInGoogle.push(notionTask);
      }
    }
  });

  // Googleタスクを処理
  googleTasksMap.forEach(googleEvent => {
    if (processedGoogleEventIds.has(googleEvent.id)) {
      return; // 既に処理済み
    }

    if (googleEvent.notionPageId) {
      // Notion Page IDを持っているが、Notionに存在しない → Notionで削除された
      deletedInNotion.push(googleEvent);
    } else {
      // Notion Page IDがない → 新規タスク（Google → Notion）
      newGoogleEvents.push(googleEvent);
    }
  });

  return {
    newNotionTasks,
    newGoogleEvents,
    notionToGoogleUpdates,
    googleToNotionUpdates,
    deletedInNotion,
    deletedInGoogle
  };
}

/**
 * タスクの内容が異なるかチェック
 * title, status, startTime, endTimeの4つのフィールドで判定
 * @param {TaskData} notionTask - Notionタスク
 * @param {TaskData} googleEvent - Google Calendarイベント
 * @returns {boolean} 内容が異なる場合true
 */
function hasContentChanged(notionTask, googleEvent) {
  const titleChanged = notionTask.title !== googleEvent.title;
  const statusChanged = notionTask.status !== googleEvent.status;
  const startTimeChanged = notionTask.startTime !== googleEvent.startTime;
  const endTimeChanged = notionTask.endTime !== googleEvent.endTime;
  
  return titleChanged || statusChanged || startTimeChanged || endTimeChanged;
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
    Logger.log(`[New] Notion → Google: "${notionTask.title}"`);
    
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
      Logger.log(`[New] Created Google Calendar Event: ${createdEvent.id}`);
      
      waitForRateLimit();
    } catch (error) {
      Logger.log(`[New] Error creating event: ${error.message}`);
    }
  });
  
  Logger.log(`[New] Notion → Google: ${createCount} tasks created`);
}

/**
 * Google Calendar → Notion の新規タスク作成
 * @param {Array} newGoogleTasks - 新規Googleタスク配列
 * @param {string} dataSourceId - Data Source ID
 */
function createGoogleToNotion(newGoogleEvents, dataSourceId) {
  let createCount = 0;
  
  newGoogleEvents.forEach(googleEvent => {
    Logger.log(`[New] Google → Notion: "${googleEvent.title}"`);
    
    try {
      const properties = TaskDataConverter.toNotionProperties(googleEvent);
      const pageData = {
        properties: properties
      };
      const createdPage = createPage(dataSourceId, pageData);
      
      // Google Calendarイベントを更新してNotion Page IDを保存
      const eventData = {
        description: `Notion: ${createdPage.id}\n${createdPage.url}`
      };
      updateEvent(googleEvent.id, TaskDataConverter.toGoogleEvent({...googleEvent, notionUrl: createdPage.url, notionPageId: createdPage.id}));
      
      createCount++;
      Logger.log(`[New] Created Notion Page: ${createdPage.id}`);
      
      waitForRateLimit();
    } catch (error) {
      Logger.log(`[New] Error creating page: ${error.message}`);
    }
  });
  
  Logger.log(`[New] Google → Notion: ${createCount} tasks created`);
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
    Logger.log(`  Notion: ${notionTask.lastEditedTime}`);
    Logger.log(`  Google: ${googleEvent.lastEditedTime}`);
    
    try {
      const updateData = TaskDataConverter.toGoogleEvent(notionTask);
      updateEvent(googleEvent.id, updateData);
      
      updateCount++;
    } catch (error) {
      Logger.log(`[Update] Error updating event: ${error.message}`);
    }
  });
  
  Logger.log(`[Update] Notion → Google: ${updateCount} tasks updated`);
}

/**
 * Google Calendar → Notion の更新
 * @param {Array} updates - 更新対象の配列
 */
function updateGoogleToNotion(updates) {
  let updateCount = 0;
  
  updates.forEach(({ notionTask, googleEvent }) => {
    Logger.log(`[Update] Google → Notion: "${googleEvent.title}"`);
    Logger.log(`  Notion: ${notionTask.lastEditedTime}`);
    Logger.log(`  Google: ${googleEvent.lastEditedTime}`);
    
    try {
      const properties = TaskDataConverter.toNotionProperties(googleEvent);
      updatePage(notionTask.id, properties);
      
      updateCount++;
      
      waitForRateLimit();
    } catch (error) {
      Logger.log(`[Update] Error updating page: ${error.message}`);
    }
  });
  
  Logger.log(`[Update] Google → Notion: ${updateCount} tasks updated`);
}

// ========================================
// Phase 3: 削除タスク処理
// ========================================

/**
 * Notionから削除されたタスクをGoogle Calendarから削除
 * @param {Array} deletedInNotion - Notionで削除された（同期対象外になった）Googleイベント配列
 */
function deleteFromGoogleCalendar(deletedInNotion) {
  let deleteCount = 0;
  
  deletedInNotion.forEach(googleEvent => {
    Logger.log(`[Deletion] Deleting Google Calendar event: "${googleEvent.title}"`);
    
    try {
      deleteEvent(googleEvent.id);
      
      deleteCount++;
      
      Utilities.sleep(100); // レート リミット対策
    } catch (error) {
      Logger.log(`[Deletion] Error deleting event: ${error.message}`);
    }
  });
  
  Logger.log(`[Deletion] Google Calendar: ${deleteCount} events deleted`);
}

/**
 * Google Calendarから削除されたタスクをNotionでアーカイブ
 * @param {Array} deletedInGoogle - Googleで削除されたNotionタスク配列
 */
function archiveFromNotion(deletedInGoogle) {
  let archiveCount = 0;
  
  deletedInGoogle.forEach(notionTask => {
    Logger.log(`[Deletion] Archiving Notion page: "${notionTask.title}"`);
    
    try {
      archivePage(notionTask.id);
      
      archiveCount++;
      
      waitForRateLimit();
    } catch (error) {
      Logger.log(`[Deletion] Error archiving page: ${error.message}`);
    }
  });
  
  Logger.log(`[Deletion] Notion: ${archiveCount} tasks archived`);
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
