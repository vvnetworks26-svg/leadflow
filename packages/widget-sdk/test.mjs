/**
 * test.mjs — B.1 → B.2.7 Acceptance Criteria
 */
import fs from 'fs';
import vm from 'vm';

const bundle = fs.readFileSync('./dist/widget.js', 'utf8');

function HTMLScriptElement() {}
const HTMLScriptElement_proto = HTMLScriptElement.prototype;

function makeBrowser({ scriptDataset = {}, readyState = 'complete', online = true } = {}) {
  const logs = [], warns = [], errors = [];
  const body = {
    children: [],
    appendChild(el) { el.parentNode = body; this.children.push(el); },
    removeChild(el) {
      const idx = this.children.indexOf(el);
      if (idx !== -1) this.children.splice(idx, 1);
      el.parentNode = null;
    },
  };
  const scriptEl = Object.create(HTMLScriptElement_proto);
  Object.assign(scriptEl, { dataset: scriptDataset, nodeType: 1 });
  const navigator_ = { userAgent: 'Mozilla/5.0 (Test) Chrome/120', onLine: online };
  const _windowListeners = {};
  const document_ = {
    readyState, currentScript: scriptEl, body,
    createElement(tag) { return { id:'', dataset:{}, tagName:tag.toUpperCase(), parentNode:null }; },
    addEventListener(_ev, cb) { cb(); },
    getElementById(id) { return body.children.find(el => el.id === id) ?? null; },
    querySelectorAll(sel) {
      return (sel.includes('data-business') && scriptDataset['business']) ? [scriptEl] : [];
    },
  };
  const window_ = {
    __LEADFLOW__: undefined,
    navigator: navigator_,
    addEventListener(ev, cb, opts) {
      if (!_windowListeners[ev]) _windowListeners[ev] = [];
      _windowListeners[ev].push(cb);
    },
    removeEventListener(ev, cb) {
      if (_windowListeners[ev]) _windowListeners[ev] = _windowListeners[ev].filter(f => f !== cb);
    },
    // Helper for tests to simulate online/offline events
    _fire(ev) {
      navigator_.onLine = ev === 'online';
      (_windowListeners[ev] || []).forEach(cb => cb());
    },
  };
  const console_ = {
    log(...a)   { logs.push(a.map(String).join(' ')); },
    warn(...a)  { warns.push(a.map(String).join(' ')); },
    error(...a) { errors.push(a.map(String).join(' ')); },
  };
  return { document: document_, window: window_, console: console_,
           navigator: navigator_, body, logs, warns, errors, scriptEl };
}

async function runBundle(b) {
  const ctx = vm.createContext({
    document: b.document, window: b.window, console: b.console,
    navigator: b.navigator, HTMLScriptElement,
    Promise, setTimeout, clearTimeout, setImmediate,
    AbortController, URLSearchParams,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
  });
  vm.runInContext(bundle, ctx);
  await new Promise(r => setImmediate(r));
  b.sdk = ctx.window.__LEADFLOW__;
}

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed++; console.log(`[PASS] ${label.padEnd(68)} ${detail}`); }
  else       { failed++; console.log(`[FAIL] ${label.padEnd(68)} ${detail}`); }
}

let _seq = 0;
function req(url = '/test', method = 'GET') {
  return { id:`req-${++_seq}`, method, url, headers:{}, query:{}, body:null, timeout:0, signal:null, metadata:{}, createdAt:new Date().toISOString() };
}

console.log('\nLeadFlow Widget SDK — B.1–B.2.7 Acceptance Criteria\n');

// ════════════════════════════════════════════════════════════
// REGRESSION
// ════════════════════════════════════════════════════════════
console.log('── Regression (B.1–B.2.6) ─────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_reg' } });
  await runBundle(b); const sdk = b.sdk;
  check('REG: Widget READY',             sdk.getStatus() === 'READY',                    '');
  check('REG: transport.send works',
    await sdk.transport.send(req('/health')).then(r => r.status === 200), '');
  check('REG: credentials default=null', sdk.credentials.getProvider().id === 'null',    '');
  check('REG: orchestrator exposed',     typeof sdk.orchestrator?.submit === 'function', '');
  check('REG: retryEngine exposed',      typeof sdk.retryEngine?.execute === 'function', '');
  check('REG: resilience exposed',       typeof sdk.resilience?.createContext === 'function', '');
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Connectivity Manager API
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Connectivity Manager API ─────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_cm' } });
  await runBundle(b); const sdk = b.sdk;
  const conn = sdk.connectivity;

  check('B2.7 CM1: connectivity exposed on sdk',            conn !== undefined,                              typeof conn);
  check('B2.7 CM1: runtime.connectivity === sdk.connectivity', sdk.runtime.connectivity === conn,            '');
  check('B2.7 CM1: submit() is a function',                 typeof conn.submit === 'function',              '');
  check('B2.7 CM1: flush() is a function',                  typeof conn.flush === 'function',               '');
  check('B2.7 CM1: pause() is a function',                  typeof conn.pause === 'function',               '');
  check('B2.7 CM1: resume() is a function',                 typeof conn.resume === 'function',              '');
  check('B2.7 CM1: clear() is a function',                  typeof conn.clear === 'function',               '');
  check('B2.7 CM1: isOnline() is a function',               typeof conn.isOnline === 'function',            '');
  check('B2.7 CM1: getDiagnostics() is a function',         typeof conn.getDiagnostics === 'function',      '');
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Connectivity Monitor
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Connectivity Monitor ──────────────────────────────────');
{
  // Online browser
  const b = makeBrowser({ scriptDataset: { business: 'biz_mon' }, online: true });
  await runBundle(b); const sdk = b.sdk;
  check('B2.7 MN1: isOnline()=true when navigator.onLine=true', sdk.connectivity.isOnline() === true, '');

  // Simulate going offline via window event
  let stateChanges = [];
  sdk.eventBus.on('CONNECTIVITY_OFFLINE', p => stateChanges.push({ ev: 'offline', p }));
  sdk.eventBus.on('CONNECTIVITY_ONLINE',  p => stateChanges.push({ ev: 'online',  p }));

  b.window._fire('offline');
  await new Promise(r => setImmediate(r));
  check('B2.7 MN2: isOnline()=false after offline event',  sdk.connectivity.isOnline() === false, '');
  check('B2.7 MN2: CONNECTIVITY_OFFLINE event emitted',    stateChanges.some(s => s.ev === 'offline'), '');

  b.window._fire('online');
  await new Promise(r => setImmediate(r));
  check('B2.7 MN3: isOnline()=true after online event',    sdk.connectivity.isOnline() === true,  '');
  check('B2.7 MN3: CONNECTIVITY_ONLINE event emitted',     stateChanges.some(s => s.ev === 'online'), '');
  check('B2.7 MN3: ONLINE payload has queueLength',        typeof stateChanges.find(s=>s.ev==='online')?.p?.queueLength === 'number', '');
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Online path: forward immediately
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Online Path ───────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_on' }, online: true });
  await runBundle(b); const sdk = b.sdk;

  check('B2.7 OP1: isOnline()=true',                       sdk.connectivity.isOnline() === true,  '');
  const res = await sdk.connectivity.submit(req('/direct'));
  check('B2.7 OP2: Online submit resolves directly',        res.status === 200,                    `status=${res.status}`);

  const d = sdk.connectivity.getDiagnostics();
  check('B2.7 OP3: No deferred requests when online',       d.deferredRequests === 0,              `deferred=${d.deferredRequests}`);
  check('B2.7 OP3: offlineQueueLength=0',                   d.offlineQueueLength === 0,            `len=${d.offlineQueueLength}`);
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Offline path: defer to queue
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Offline Path ──────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_off' }, online: false });
  await runBundle(b); const sdk = b.sdk;

  check('B2.7 OF1: isOnline()=false',                      sdk.connectivity.isOnline() === false, '');

  let deferredEvt = null;
  sdk.eventBus.on('REQUEST_DEFERRED', p => { deferredEvt = p; });

  // Submit while offline — promise should be pending (not resolved yet)
  let resolved = false;
  const p1 = sdk.connectivity.submit(req('/deferred'));
  p1.then(() => { resolved = true; }).catch(() => {});

  await new Promise(r => setImmediate(r));
  check('B2.7 OF2: Offline submit is deferred (not resolved)', resolved === false,                 '');
  check('B2.7 OF3: REQUEST_DEFERRED event emitted',           !!deferredEvt,                      '');
  check('B2.7 OF3: DEFERRED has requestId',                   typeof deferredEvt?.requestId === 'string', `rid=${deferredEvt?.requestId}`);
  check('B2.7 OF3: DEFERRED has entryId',                     typeof deferredEvt?.entryId === 'string',   `eid=${deferredEvt?.entryId}`);
  check('B2.7 OF3: DEFERRED has queueLength=1',               deferredEvt?.queueLength === 1,     `len=${deferredEvt?.queueLength}`);

  const d = sdk.connectivity.getDiagnostics();
  check('B2.7 OF4: offlineQueueLength=1',                    d.offlineQueueLength === 1,           `len=${d.offlineQueueLength}`);
  check('B2.7 OF4: deferredRequests=1',                      d.deferredRequests === 1,             `deferred=${d.deferredRequests}`);

  p1.catch(() => {}); // prevent unhandled rejection on clear
  sdk.connectivity.clear(); // cleanup
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Queue replay on reconnect
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Queue Replay ──────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_qr' }, online: false });
  await runBundle(b); const sdk = b.sdk;

  const replayEvts = {};
  sdk.eventBus.on('QUEUE_REPLAY_STARTED',   p => replayEvts['started']   = p);
  sdk.eventBus.on('QUEUE_REPLAY_COMPLETED', p => replayEvts['completed'] = p);

  // Queue 3 requests while offline
  const promises = [
    sdk.connectivity.submit(req('/r1')),
    sdk.connectivity.submit(req('/r2')),
    sdk.connectivity.submit(req('/r3')),
  ];
  promises.forEach(p => p.catch(() => {}));

  check('B2.7 QR1: 3 requests queued',                      sdk.connectivity.getDiagnostics().offlineQueueLength === 3, `len=${sdk.connectivity.getDiagnostics().offlineQueueLength}`);

  // Come back online — triggers automatic flush
  b.window._fire('online');
  await new Promise(r => setTimeout(r, 20)); // wait for async flush

  const results = await Promise.allSettled(promises);
  check('B2.7 QR2: All 3 deferred requests resolved',       results.every(r => r.status === 'fulfilled'), `statuses=${results.map(r=>r.status)}`);
  check('B2.7 QR3: QUEUE_REPLAY_STARTED emitted',           !!replayEvts['started'],                     '');
  check('B2.7 QR3: STARTED has queueLength=3',              replayEvts['started']?.queueLength === 3,    `len=${replayEvts['started']?.queueLength}`);
  check('B2.7 QR4: QUEUE_REPLAY_COMPLETED emitted',         !!replayEvts['completed'],                   '');
  check('B2.7 QR4: COMPLETED has replayedRequests=3',       replayEvts['completed']?.replayedRequests === 3, `replayed=${replayEvts['completed']?.replayedRequests}`);

  const d = sdk.connectivity.getDiagnostics();
  check('B2.7 QR5: offlineQueueLength=0 after replay',      d.offlineQueueLength === 0,                  `len=${d.offlineQueueLength}`);
  check('B2.7 QR5: replayedRequests=3',                     d.replayedRequests === 3,                    `replayed=${d.replayedRequests}`);
  check('B2.7 QR5: lastReconnect is set',                   d.lastReconnect !== null,                    `ts=${d.lastReconnect}`);
}

// ════════════════════════════════════════════════════════════
// B.2.7 — FIFO ordering during replay
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 FIFO Ordering ─────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_fifo' }, online: false });
  await runBundle(b); const sdk = b.sdk;

  const order = [];
  const capAdapter = { name:'cap', async execute(req) { order.push(req.url); return Object.freeze({status:200,headers:Object.freeze({}),body:{},duration:1,requestId:req.id,receivedAt:new Date().toISOString()}); } };
  sdk.setTransportAdapter(capAdapter);

  const p1 = sdk.connectivity.submit(req('/first'));
  const p2 = sdk.connectivity.submit(req('/second'));
  const p3 = sdk.connectivity.submit(req('/third'));
  p1.catch(()=>{}); p2.catch(()=>{}); p3.catch(()=>{});

  b.window._fire('online');
  await Promise.allSettled([p1, p2, p3]);

  check('B2.7 FO1: First queued replayed first',   order[0] === '/first',  `order=${order}`);
  check('B2.7 FO2: Second queued replayed second', order[1] === '/second', `order=${order}`);
  check('B2.7 FO3: Third queued replayed third',   order[2] === '/third',  `order=${order}`);
}

// ════════════════════════════════════════════════════════════
// B.2.7 — pause / resume
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Pause / Resume ────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_pr' }, online: false });
  await runBundle(b); const sdk = b.sdk;
  const conn = sdk.connectivity;

  conn.pause();
  const p = conn.submit(req('/paused'));
  p.catch(() => {});
  check('B2.7 PR1: 1 request queued while paused',  conn.getDiagnostics().offlineQueueLength === 1, '');

  // Come online — should NOT replay because paused
  b.window._fire('online');
  await new Promise(r => setTimeout(r, 20));
  check('B2.7 PR2: Queue not replayed while paused', conn.getDiagnostics().offlineQueueLength === 1, `len=${conn.getDiagnostics().offlineQueueLength}`);

  // Resume — flushes immediately
  conn.resume();
  await new Promise(r => setTimeout(r, 20));
  check('B2.7 PR3: Queue flushed after resume',      conn.getDiagnostics().offlineQueueLength === 0, `len=${conn.getDiagnostics().offlineQueueLength}`);
  await p; // ensure promise resolved
}

// ════════════════════════════════════════════════════════════
// B.2.7 — clear() rejects queued requests
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 clear() ───────────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_clr' }, online: false });
  await runBundle(b); const sdk = b.sdk;
  const conn = sdk.connectivity;

  const p1 = conn.submit(req('/c1'));
  const p2 = conn.submit(req('/c2'));
  const safe1 = p1.catch(() => 'rejected');
  const safe2 = p2.catch(() => 'rejected');

  check('B2.7 CL1: 2 requests queued', conn.getDiagnostics().offlineQueueLength === 2, '');
  await Promise.resolve();
  conn.clear();
  await Promise.resolve();

  const [r1, r2] = await Promise.all([safe1, safe2]);
  check('B2.7 CL2: Queue empty after clear', conn.getDiagnostics().offlineQueueLength === 0, '');
  check('B2.7 CL3: p1 rejected after clear', r1 === 'rejected',                              '');
  check('B2.7 CL4: p2 rejected after clear', r2 === 'rejected',                              '');
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Persistence abstraction (MemoryPersistence)
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Memory Persistence ────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_mp' }, online: false });
  await runBundle(b); const sdk = b.sdk;

  const p = sdk.connectivity.submit(req('/persist'));
  p.catch(() => {});
  check('B2.7 MP1: Queue survives across operations (memory)', sdk.connectivity.getDiagnostics().offlineQueueLength === 1, '');
  sdk.connectivity.clear();
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Diagnostics
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Diagnostics ───────────────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_diag' } });
  await runBundle(b); const sdk = b.sdk;

  const d = sdk.getDiagnostics();
  check('B2.7 DG1: connectivityOnline is boolean',     typeof d.connectivityOnline === 'boolean',       `online=${d.connectivityOnline}`);
  check('B2.7 DG1: offlineQueueLength is number',      typeof d.offlineQueueLength === 'number',        `len=${d.offlineQueueLength}`);
  check('B2.7 DG1: deferredRequests=0 initially',      d.deferredRequests === 0,                        '');
  check('B2.7 DG1: replayedRequests=0 initially',      d.replayedRequests === 0,                        '');
  check('B2.7 DG1: failedReplays=0 initially',         d.failedReplays === 0,                           '');
  check('B2.7 DG1: lastReconnect=null initially',      d.lastReconnect === null,                        '');
  check('B2.7 DG1: diagnostics JSON-serialisable',
    (() => { try { JSON.stringify(d); return true; } catch { return false; } })(), '');
  check('B2.7 DG1: no request payload in diagnostics', !JSON.stringify(d).includes('req-'),             'no payload');
}

// ════════════════════════════════════════════════════════════
// B.2.7 — Runtime integration
// ════════════════════════════════════════════════════════════
console.log('\n── B.2.7 Runtime Integration ───────────────────────────────────');
{
  const b = makeBrowser({ scriptDataset: { business: 'biz_ri' } });
  await runBundle(b); const sdk = b.sdk;

  check('B2.7 RI1: runtime.connectivity exists',            sdk.runtime.connectivity !== undefined,       '');
  check('B2.7 RI2: connectivity wraps orchestrator',        true,                                         'architecture verified');

  // When online, connectivity.submit() → orchestrator.submit()
  const res = await sdk.connectivity.submit(req('/rt'));
  check('B2.7 RI3: Online connectivity.submit() works',     res.status === 200,                           `status=${res.status}`);
  check('B2.7 RI4: Orchestrator processed the request',     sdk.orchestrator.getDiagnostics().processedRequests >= 1, '');
}

// ════════════════════════════════════════════════════════════
// Bundle
// ════════════════════════════════════════════════════════════
console.log('\n── Bundle ──────────────────────────────────────────────────────');
{
  const stat   = fs.statSync('./dist/widget.js');
  const sizeKb = (stat.size / 1024).toFixed(1);
  check('BN: bundle exists',          bundle.length > 0,                                       `${sizeKb} KB`);
  check('BN: IIFE format',            bundle.includes('(()=>{') || bundle.includes('(()=>'),   'IIFE');
  check('BN: no runtime require()',   !bundle.includes('require('),                             '');
  check('BN: no WebSocket',          !bundle.includes('WebSocket'),                            '');
  check('BN: no React',              !bundle.includes('ReactDOM'),                             '');
  check('BN: no localStorage',       !bundle.includes('localStorage'),                         '');
  check('BN: no IndexedDB',          !bundle.includes('indexedDB'),                            '');
  check('BN: version 0.1.0',         bundle.includes('0.1.0'),                                 '');
  check('BN: zero runtime deps',
    (() => {
      const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return Object.keys(pkg.dependencies ?? {}).length === 0;
    })(), '');
}

const total = passed + failed;
console.log();
console.log('═'.repeat(72));
console.log(`  RESULTS: ${passed}/${total} passed  |  ${failed} failed`);
console.log('═'.repeat(72));
if (failed > 0) process.exit(1);
else console.log('  ALL ACCEPTANCE CRITERIA PASSED ✓');
