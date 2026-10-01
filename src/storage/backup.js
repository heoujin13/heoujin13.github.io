/**
 * 데이터 백업 (내보내기 / 가져오기)
 *
 * localStorage 는 브라우저 데이터를 지우면 함께 사라지므로
 * 기록을 JSON 파일로 내려받아 보관하거나 다른 기기로 옮길 수 있게 합니다.
 */
import { APP_INFO } from '../core/config.js';

export function buildBackup(repo, settingsStore) {
  return {
    app: 'running-master-ultimate',
    version: APP_INFO.version,
    exportedAt: new Date().toISOString(),
    settings: settingsStore.get(),
    runs: repo.exportAll(),
  };
}

/** JSON 파일 다운로드 */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `running-master-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

/**
 * 백업 파일 읽기 및 검증
 * @param {File} file
 * @returns {Promise<{settings: object|null, runs: Array}>}
 */
export async function readBackupFile(file) {
  if (!file) throw new Error('파일을 선택하세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('파일이 너무 큽니다 (최대 20MB).');
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아닌 파일입니다.');
  }
  if (!data || data.app !== 'running-master-ultimate' || !Array.isArray(data.runs)) {
    throw new Error('Running Master 백업 파일이 아닙니다.');
  }
  return { settings: data.settings || null, runs: data.runs };
}
