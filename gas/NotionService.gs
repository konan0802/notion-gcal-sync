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
// ページ更新
// ========================================

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

