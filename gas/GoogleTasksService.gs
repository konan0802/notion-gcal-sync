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
