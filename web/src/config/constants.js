export const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry'];
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const DIFFICULTY_CAPS = { Easy: 30, Medium: 25, Hard: 20 };
export const DEFAULT_STUDENT_PASSWORD = 'Test@123';
export const LEADERBOARD_LIMIT = 50;
export const TOP_STUDENT_SCAN = 100;
export const PAGE_SIZE = 20;
export const CACHE_TTL_MS = 60_000;
export const WEEKLY_SCAN_LIMIT = 100;
export const MAX_ACCURACY = 100;
export const NEGATIVE_MARK = 0.25;

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weekStartKey(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return todayKey(start);
}

export function dateKeyToMillis(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
}
