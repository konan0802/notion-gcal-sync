/**
 * GoogleTasksService.gs
 * 
 * Google Tasks API (v1) との通信を担当するサービス
 * タスクの取得・作成・更新・削除を行う
 * 
 * 依存関係:
 * - TaskData.gs: TaskDataConverter を使用
 * - Google Apps Script Advanced Service: Tasks API
 */

// ========================================
// 設定
// ========================================

const GOOGLE_TASKS_CONFIG = {
  API_VERSION: 'v1',
  // Google Tasks APIのレートリミット: 50,000 requests/day
  // 実際には十分な余裕があるため、特別な遅延は不要
  RATE_LIMIT_DELAY: 0
};

// ========================================
// タスク取得
// ========================================

/**
 * 期日が過去1ヶ月 ~ 未来2ヶ月の間のGoogle Tasksを取得
 * 削除判定のため、同じ期間で取得する必要がある
 * @returns {Array} タスク配列
 */
function listRecentTasks() {
  const taskListId = '@default';
  
  Logger.log('[GoogleTasksService] Listing tasks with due date (past 1 month ~ future 2 months)');
  
  try {
    // 過去1ヶ月の日付を計算
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // 未来2ヶ月の日付を計算
    const twoMonthsLater = new Date();
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
    
    const options = {
      maxResults: 100,
      showCompleted: true,  // 完了済みも含める
      showDeleted: false,
      showHidden: false
    };
    
    const response = Tasks.Tasks.list(taskListId, options);
    const tasks = response.items || [];
    
    // 期日が過去1ヶ月 ~ 未来2ヶ月の範囲にあるタスクのみフィルタ
    const recentTasks = tasks.filter(task => {
      if (!task.due) {
        // 期日なし → 除外
        return false;
      }
      const dueDate = new Date(task.due);
      return dueDate >= oneMonthAgo && dueDate <= twoMonthsLater;
    });
    
    Logger.log(`[GoogleTasksService] Found ${recentTasks.length} tasks`);
    return recentTasks;
    
  } catch (error) {
    Logger.log(`[GoogleTasksService] Error listing recent tasks: ${error.message}`);
    throw error;
  }
}

// ========================================
// タスク作成・更新・削除
// ========================================

/**
 * 新規タスクを作成
 * @param {Object} taskData - タスクデータ（Google Tasks形式またはTaskData形式）
 * @returns {Object} 作成されたタスク
 */
function createTask(taskData) {
  const taskListId = '@default';
  
  Logger.log(`[GoogleTasksService] Creating new task: ${taskData.title}`);
  
  try {
    // TaskData形式の場合はGoogle Tasks形式に変換
    let googleTaskData = taskData;
    if (taskData.source) {
      googleTaskData = TaskDataConverter.toGoogleTask(taskData);
    }
    
    const task = Tasks.Tasks.insert(googleTaskData, taskListId);
    
    Logger.log(`[GoogleTasksService] Task created: ${task.id}`);
    
    return task;
    
  } catch (error) {
    Logger.log(`[GoogleTasksService] Error creating task: ${error.message}`);
    throw error;
  }
}

/**
 * タスクを更新
 * @param {string} taskId - タスクID
 * @param {Object} taskData - 更新するタスクデータ
 * @returns {Object} 更新されたタスク
 */
function updateTask(taskId, taskData) {
  const taskListId = '@default';
  
  Logger.log(`[GoogleTasksService] Updating task: ${taskId}`);
  
  try {
    // TaskData形式の場合はGoogle Tasks形式に変換
    let googleTaskData = taskData;
    if (taskData.source) {
      googleTaskData = TaskDataConverter.toGoogleTask(taskData);
    }
    
    const task = Tasks.Tasks.patch(googleTaskData, taskListId, taskId);
    
    Logger.log(`[GoogleTasksService] Task updated: ${task.id}`);
    
    return task;
    
  } catch (error) {
    Logger.log(`[GoogleTasksService] Error updating task: ${error.message}`);
    throw error;
  }
}

/**
 * タスクを削除
 * @param {string} taskId - タスクID
 */
function deleteTask(taskId) {
  const taskListId = '@default';
  
  Logger.log(`[GoogleTasksService] Deleting task: ${taskId}`);
  
  try {
    Tasks.Tasks.remove(taskListId, taskId);
    
    Logger.log(`[GoogleTasksService] Task deleted: ${taskId}`);
    
  } catch (error) {
    Logger.log(`[GoogleTasksService] Error deleting task: ${error.message}`);
    throw error;
  }
}

// ========================================
// 単体テスト関数
// ========================================

/**
 * テスト: 期日が過去1ヶ月 ~ 未来2ヶ月のタスク取得
 */
function testListRecentTasks() {
  Logger.log('========================================');
  Logger.log('TEST: listRecentTasks');
  Logger.log('========================================');
  
  try {
    const tasks = listRecentTasks();
    
    Logger.log(`SUCCESS: Retrieved ${tasks.length} tasks`);
    
    // 各タスクの詳細を表示
    tasks.forEach((task, index) => {
      const taskData = TaskDataConverter.fromGoogleTask(task);
      Logger.log(`${index + 1}. ${taskData.title} (${taskData.status}) - Due: ${taskData.dueDate}`);
    });
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: タスク作成
 */
function testCreateTask() {
  Logger.log('========================================');
  Logger.log('TEST: createTask');
  Logger.log('========================================');
  
  try {
    const taskData = {
      title: 'APIテスト - ' + new Date().toLocaleString('ja-JP'),
      status: 'needsAction',
      due: '2025-12-31T00:00:00.000Z'
    };
    
    const createdTask = createTask(taskData);
    
    Logger.log(`SUCCESS: Task created`);
    Logger.log(`Task ID: ${createdTask.id}`);
    Logger.log(`Title: ${createdTask.title}`);
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: タスク更新
 */
function testUpdateTask() {
  Logger.log('========================================');
  Logger.log('TEST: updateTask');
  Logger.log('========================================');
  
  const taskId = ''; // ここに実際のタスクIDを入力してテスト
  
  if (!taskId) {
    Logger.log('ERROR: Please set taskId in the test function');
    return;
  }
  
  try {
    const taskData = {
      title: '更新されたタスク - ' + new Date().toLocaleString('ja-JP'),
      status: 'needsAction'
    };
    
    const updatedTask = updateTask(taskId, taskData);
    
    Logger.log(`SUCCESS: Task updated`);
    Logger.log(`Task ID: ${updatedTask.id}`);
    Logger.log(`Title: ${updatedTask.title}`);
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * テスト: TaskDataConverterの変換
 */
function testTaskDataConverter() {
  Logger.log('========================================');
  Logger.log('TEST: TaskDataConverter (Google Tasks)');
  Logger.log('========================================');
  
  try {
    // 1. Google Task → TaskData
    const googleTask = {
      id: 'test-id-123',
      title: 'テストタスク',
      status: 'needsAction',
      due: '2025-12-31T00:00:00.000Z',
      updated: '2025-12-27T10:00:00.000Z',
      selfLink: 'https://www.googleapis.com/tasks/v1/...'
    };
    
    Logger.log('1. Google Task → TaskData:');
    const taskData = TaskDataConverter.fromGoogleTask(googleTask);
    Logger.log(JSON.stringify(taskData, null, 2));
    
    // 2. TaskData → Google Task
    Logger.log('\n2. TaskData → Google Task:');
    const convertedBack = TaskDataConverter.toGoogleTask(taskData);
    Logger.log(JSON.stringify(convertedBack, null, 2));
    
    Logger.log('\nSUCCESS: Conversion test completed');
    
  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
  }
}

/**
 * デバッグ: 1件のGoogle TaskのRAWデータを表示
 */
function testDebugGoogleTaskDateTime() {
  Logger.log('[DEBUG] Fetching one Google Task to inspect date/time...');
  
  const taskListId = '@default';
  const response = Tasks.Tasks.list(taskListId, {
    maxResults: 1,
    showCompleted: true
  });
  
  if (response.items && response.items.length > 0) {
    const googleTask = response.items[0];
    
    Logger.log('[DEBUG] ===== Google Task RAW Data =====');
    Logger.log('[DEBUG] Task ID: ' + googleTask.id);
    Logger.log('[DEBUG] Title: ' + googleTask.title);
    Logger.log('[DEBUG] Full RAW: ' + JSON.stringify(googleTask, null, 2));
    
    // TaskDataConverterで変換
    const taskData = TaskDataConverter.fromGoogleTask(googleTask);
    
    Logger.log('[DEBUG] ===== After Conversion =====');
    Logger.log('[DEBUG] TaskData.title: ' + taskData.title);
    Logger.log('[DEBUG] TaskData.dueDate: ' + taskData.dueDate);
    Logger.log('[DEBUG] TaskData.lastEditedTime: ' + taskData.lastEditedTime);
    Logger.log('[DEBUG] TaskData.status: ' + taskData.status);
  } else {
    Logger.log('[DEBUG] No tasks found');
  }
}

/**
 * 全テスト実行
 */
function runAllGoogleTasksTests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL GOOGLE TASKS SERVICE TESTS');
  Logger.log('========================================\n');
  
  testListRecentTasks();
  Logger.log('\n');
  
  Utilities.sleep(1000);
  
  testTaskDataConverter();
  Logger.log('\n');
  
  // createTaskテストはコメントアウト（実際のデータを作成するため）
  // testCreateTask();
  
  Logger.log('========================================');
  Logger.log('ALL TESTS COMPLETED');
  Logger.log('========================================');
}

