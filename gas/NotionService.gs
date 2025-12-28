/**
 * NotionService.gs
 * 
 * Notion API (v2025-09-03) との通信を担当するサービス
 * Data Sources API を使用してページの取得・作成・更新を行う
 * 
 * 依存関係:
 * - TaskData.gs: TaskDataConverter を使用
 */

// ========================================
// 設定
// ========================================

const NOTION_CONFIG = {
  API_VERSION: '2025-09-03', // Data Sources API対応バージョン
  BASE_URL: 'https://api.notion.com/v1',
  RATE_LIMIT_DELAY: 350 // Notion APIレートリミット対策（350ms）
};

// ========================================
// ユーティリティ関数
// ========================================

/**
 * Notion APIへのHTTPリクエストを実行
 * @param {string} endpoint - APIエンドポイント（例: '/databases/xxx'）
 * @param {Object} options - リクエストオプション
 * @returns {Object} レスポンスデータ
 */
function notionApiRequest(endpoint, options = {}) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
  
  if (!apiKey) {
    throw new Error('Notion API Keyが設定されていません');
  }
  
  const url = NOTION_CONFIG.BASE_URL + endpoint;
  
  const defaultOptions = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': NOTION_CONFIG.API_VERSION,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  const requestOptions = { ...defaultOptions, ...options };
  
  Logger.log(`[Notion API] ${requestOptions.method.toUpperCase()} ${url}`);
  
  try {
    const response = UrlFetchApp.fetch(url, requestOptions);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // レスポンスのログ（デバッグ用）
    Logger.log(`[Notion API] Status: ${statusCode}`);
    
    // エラーハンドリング
    if (statusCode === 429) {
      const retryAfter = response.getHeaders()['Retry-After'] || 5;
      Logger.log(`[Notion API] Rate limit exceeded. Retry after ${retryAfter}s`);
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }
    
    if (statusCode >= 400) {
      Logger.log(`[Notion API] Error: ${responseText}`);
      const errorData = JSON.parse(responseText);
      throw new Error(`Notion API Error (${statusCode}): ${errorData.message || responseText}`);
    }
    
    return JSON.parse(responseText);
    
  } catch (error) {
    Logger.log(`[Notion API] Exception: ${error.message}`);
    throw error;
  }
}

/**
 * レートリミット対策の待機
 */
function waitForRateLimit() {
  Utilities.sleep(NOTION_CONFIG.RATE_LIMIT_DELAY);
}

// ========================================
// ページ取得
// ========================================

/**
 * 開始時刻（日付.start）が過去1ヶ月 ~ 未来2ヶ月の間のNotionページを取得
 * @param {string} dataSourceId - Data Source ID
 * @returns {Array} ページ配列（最大250件）
 */
function queryRecentTasks(dataSourceId) {
  Logger.log('[NotionService] Querying tasks with start time (past 1 month ~ future 2 months)');
  
  // 過去1ヶ月の日付を計算
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  oneMonthAgo.setHours(0, 0, 0, 0);
  const oneMonthAgoDate = oneMonthAgo.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // 未来2ヶ月の日付を計算
  const twoMonthsLater = new Date();
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
  twoMonthsLater.setHours(23, 59, 59, 999);
  const twoMonthsLaterDate = twoMonthsLater.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const payload = {
    filter: {
      and: [
        {
          property: '日付',
          date: {
            on_or_after: oneMonthAgoDate
          }
        },
        {
          property: '日付',
          date: {
            on_or_before: twoMonthsLaterDate
          }
        }
      ]
    },
    page_size: 250
  };
  
  const response = notionApiRequest(
    `/data_sources/${dataSourceId}/query`,
    {
      method: 'post',
      payload: JSON.stringify(payload)
    }
  );
  
  waitForRateLimit(); // レートリミット対策
  
  Logger.log(`[NotionService] Found ${response.results.length} tasks`);
  return response.results || [];
}

// ========================================
// ページ作成・更新・削除
// ========================================

/**
 * 新規ページを作成
 * @param {string} dataSourceId - Data Source ID
 * @param {Object} pageData - ページデータ
 * @returns {Object} 作成されたページ
 */
function createPage(dataSourceId, pageData) {
  Logger.log(`[NotionService] Creating new page in data source: ${dataSourceId}`);
  
  const payload = {
    parent: {
      data_source_id: dataSourceId
    },
    properties: pageData.properties
  };
  
  const response = notionApiRequest(
    '/pages',
    {
      method: 'post',
      payload: JSON.stringify(payload)
    }
  );
  
  Logger.log(`[NotionService] Page created: ${response.id}`);
  
  return response;
}

/**
 * ページを更新
 * @param {string} pageId - ページID
 * @param {Object} properties - 更新するプロパティ
 * @returns {Object} 更新されたページ
 */
function updatePage(pageId, properties) {
  Logger.log(`[NotionService] Updating page: ${pageId}`);
  
  const payload = {
    properties: properties
  };
  
  const response = notionApiRequest(
    `/pages/${pageId}`,
    {
      method: 'patch',
      payload: JSON.stringify(payload)
    }
  );
  
  Logger.log(`[NotionService] Page updated: ${response.id}`);
  
  return response;
}

/**
 * ページをアーカイブ（論理削除）
 * @param {string} pageId - ページID
 * @returns {Object} アーカイブされたページ
 */
function archivePage(pageId) {
  Logger.log(`[NotionService] Archiving page: ${pageId}`);
  
  const payload = {
    archived: true
  };
  
  const response = notionApiRequest(
    `/pages/${pageId}`,
    {
      method: 'patch',
      payload: JSON.stringify(payload)
    }
  );
  
  Logger.log(`[NotionService] Page archived: ${response.id}`);
  
  return response;
}

// ========================================
// 単体テスト関数
// ========================================

/**
 * テスト: 期日が過去1ヶ月 ~ 未来2ヶ月のタスク取得
 */
function testQueryRecentTasks() {
  Logger.log('========================================');
  Logger.log('TEST: queryRecentTasks');
  Logger.log('========================================');
  
  const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
  
  if (!dataSourceId) {
    Logger.log('ERROR: NOTION_DATA_SOURCE_ID not set in Script Properties');
    return;
  }
  
  try {
    const pages = queryRecentTasks(dataSourceId);
    
    Logger.log(`SUCCESS: Retrieved ${pages.length} tasks`);
    
    // 各ページの詳細を表示
    pages.forEach((page, index) => {
      const taskData = TaskDataConverter.fromNotionPage(page);
      Logger.log(`${index + 1}. ${taskData.title} (${taskData.status}) - Due: ${taskData.dueDate}`);
    });
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: ページ作成
 */
function testCreatePage() {
  Logger.log('========================================');
  Logger.log('TEST: createPage');
  Logger.log('========================================');
  
  const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
  
  if (!dataSourceId) {
    Logger.log('ERROR: NOTION_DATA_SOURCE_ID not set in Script Properties');
    return;
  }
  
  try {
    const taskData = {
      title: 'APIテスト - ' + new Date().toLocaleString('ja-JP'),
      status: '未着手',
      dueDate: '2025-12-31',
      category: null
    };
    
    const properties = TaskDataConverter.toNotionProperties(taskData);
    const pageData = { properties: properties };
    
    const createdPage = createPage(dataSourceId, pageData);
    
    Logger.log(`SUCCESS: Page created`);
    Logger.log(`Page ID: ${createdPage.id}`);
    Logger.log(`URL: ${createdPage.url}`);
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: ページ更新
 */
function testUpdatePage() {
  Logger.log('========================================');
  Logger.log('TEST: updatePage');
  Logger.log('========================================');
  
  const pageId = ''; // ここに実際のページIDを入力してテスト
  
  if (!pageId) {
    Logger.log('ERROR: Please set pageId in the test function');
    return;
  }
  
  try {
    const properties = TaskDataConverter.toNotionProperties({
      title: '更新されたタスク - ' + new Date().toLocaleString('ja-JP'),
      status: '未着手'
    });
    
    const updatedPage = updatePage(pageId, properties);
    
    Logger.log(`SUCCESS: Page updated`);
    Logger.log(`Page ID: ${updatedPage.id}`);
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * デバッグ: 日付プロパティのRAWデータと変換後のデータを表示
 * @param {string} pageId - オプション。特定のページIDを指定（指定しない場合は最初の1件）
 */
function testDebugTaskDateTime(pageId) {
  const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
  
  Logger.log('[DEBUG] Fetching task to inspect date property...');
  
  let page = null;
  
  if (pageId) {
    // 特定のページIDを取得
    Logger.log('[DEBUG] Fetching specific page: ' + pageId);
    try {
      const response = notionApiRequest(`/pages/${pageId}`, {
        method: 'get'
      });
      page = response;
    } catch (error) {
      Logger.log('[DEBUG] Error fetching page: ' + error.message);
      return;
    }
  } else {
    // 1件だけ取得
    const response = notionApiRequest(`/data_sources/${dataSourceId}/query`, {
      method: 'post',
      payload: JSON.stringify({
        page_size: 1
      })
    });
    
    if (response.results && response.results.length > 0) {
      page = response.results[0];
    }
  }
  
  if (page) {
    Logger.log('[DEBUG] ===== Notion RAW Data =====');
    Logger.log('[DEBUG] Page ID: ' + page.id);
    Logger.log('[DEBUG] Title: ' + (page.properties['タスク名']?.title?.[0]?.plain_text || '(no title)'));
    Logger.log('[DEBUG] Date Property RAW: ' + JSON.stringify(page.properties['日付'], null, 2));
    Logger.log('[DEBUG] last_edited_time: ' + page.last_edited_time);
    
    // TaskDataConverterで変換
    const taskData = TaskDataConverter.fromNotionPage(page);
    
    Logger.log('[DEBUG] ===== After Conversion =====');
    Logger.log('[DEBUG] TaskData.title: ' + taskData.title);
    Logger.log('[DEBUG] TaskData.startTime: ' + taskData.startTime);
    Logger.log('[DEBUG] TaskData.endTime: ' + taskData.endTime);
    Logger.log('[DEBUG] TaskData.lastEditedTime: ' + taskData.lastEditedTime);
    Logger.log('[DEBUG] TaskData.status: ' + taskData.status);
    
    // toNotionPropertiesで逆変換
    const notionProps = TaskDataConverter.toNotionProperties(taskData);
    
    Logger.log('[DEBUG] ===== After toNotionProperties =====');
    Logger.log('[DEBUG] ' + JSON.stringify(notionProps['日付'], null, 2));
  } else {
    Logger.log('[DEBUG] No tasks found');
  }
}

/**
 * デバッグ: タイトルで検索して特定のタスクを表示
 * @param {string} titleKeyword - タスク名に含まれるキーワード（例：「要件定義」）
 */
function testDebugTaskByTitle(titleKeyword) {
  const dataSourceId = PropertiesService.getScriptProperties().getProperty('NOTION_DATA_SOURCE_ID');
  
  Logger.log('[DEBUG] Searching for task with title containing: ' + titleKeyword);
  
  // 全タスクを取得
  const response = notionApiRequest(`/data_sources/${dataSourceId}/query`, {
    method: 'post',
    payload: JSON.stringify({
      page_size: 100
    })
  });
  
  if (response.results && response.results.length > 0) {
    // タイトルでフィルタ
    const matchedPages = response.results.filter(page => {
      const title = page.properties['タスク名']?.title?.[0]?.plain_text || '';
      return title.includes(titleKeyword);
    });
    
    if (matchedPages.length > 0) {
      Logger.log('[DEBUG] Found ' + matchedPages.length + ' matching task(s)');
      
      matchedPages.forEach((page, index) => {
        Logger.log('[DEBUG] ===== Task ' + (index + 1) + ' =====');
        Logger.log('[DEBUG] Page ID: ' + page.id);
        Logger.log('[DEBUG] Title: ' + (page.properties['タスク名']?.title?.[0]?.plain_text || '(no title)'));
        Logger.log('[DEBUG] Date Property RAW: ' + JSON.stringify(page.properties['日付'], null, 2));
        
        // TaskDataConverterで変換
        const taskData = TaskDataConverter.fromNotionPage(page);
        Logger.log('[DEBUG] TaskData.startTime: ' + taskData.startTime);
        Logger.log('[DEBUG] TaskData.endTime: ' + taskData.endTime);
        
        // toNotionPropertiesで逆変換
        const notionProps = TaskDataConverter.toNotionProperties(taskData);
        Logger.log('[DEBUG] After toNotionProperties: ' + JSON.stringify(notionProps['日付'], null, 2));
        Logger.log('');
      });
    } else {
      Logger.log('[DEBUG] No tasks found matching: ' + titleKeyword);
    }
  } else {
    Logger.log('[DEBUG] No tasks found');
  }
}

/**
 * 全テスト実行
 */
function runAllNotionTests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL NOTION SERVICE TESTS');
  Logger.log('========================================\n');
  
  testQueryRecentTasks();
  Logger.log('\n');
  
  Utilities.sleep(1000);
  
  // createPageテストはコメントアウト（実際のデータを作成するため）
  // testCreatePage();
  
  Logger.log('========================================');
  Logger.log('ALL TESTS COMPLETED');
  Logger.log('========================================');
}

