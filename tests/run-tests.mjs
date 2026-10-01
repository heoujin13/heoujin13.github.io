/**
 * Node 로 테스트 실행:  node tests/run-tests.mjs
 * (Node 18 이상. 브라우저에서는 tests/run-tests.html 을 Live Server 로 여세요)
 */
import { runAll } from './suite.js';

const { total, passed, failed } = await runAll(({ name, ok, error }) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `\n      → ${error}`}`);
});
console.log(`\n${passed}/${total} 통과${failed ? `, ${failed} 실패` : ''}`);
process.exitCode = failed ? 1 : 0;
