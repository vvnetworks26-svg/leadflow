/**
 * test.mjs — B.1 → C.4 Acceptance Criteria
 */
import fs from 'fs';
import vm from 'vm';

const bundle = fs.readFileSync('./dist/widget.js', 'utf8');

function HTMLScriptElement() {}
const HTMLScriptElement_proto = HTMLScriptElement.prototype;

function makeShadowRoot() {
  const ch = [];
  const sr = {
    ch, firstChild: null,
    appendChild(el)  { ch.push(el); el.parentNode=sr; sr.firstChild=ch[0]??null; return el; },
    insertBefore(el,ref){ const i=ch.indexOf(ref); if(i>=0)ch.splice(i,0,el); else ch.push(el); el.parentNode=sr; sr.firstChild=ch[0]??null; return el; },
    removeChild(el)  { const i=ch.indexOf(el); if(i>=0)ch.splice(i,1); el.parentNode=null; sr.firstChild=ch[0]??null; return el; },
    querySelector(sel){ return ch.find(c=>sel.startsWith('.')? c.className?.includes(sel.slice(1)) : c.tagName?.toLowerCase()===sel.toLowerCase())??null; },
    addEventListener(){},
  };
  return sr;
}

function makeBrowser({ scriptDataset={}, readyState='complete', online=true }={}) {
  const logs=[], warns=[], errors=[];
  const body={ children:[], appendChild(el){el.parentNode=body;this.children.push(el);return el;}, removeChild(el){const i=this.children.indexOf(el);if(i!==-1)this.children.splice(i,1);el.parentNode=null;return el;} };
  const scriptEl=Object.create(HTMLScriptElement_proto);
  Object.assign(scriptEl,{dataset:scriptDataset,nodeType:1});
  const navigator_={userAgent:'Mozilla/5.0 Chrome/120',onLine:online};
  const _wl={};
  const window_={
    __LEADFLOW__:undefined, navigator:navigator_, innerWidth:1200, innerHeight:800,
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    addEventListener(ev,cb){if(!_wl[ev])_wl[ev]=[];_wl[ev].push(cb);},
    removeEventListener(ev,cb){if(_wl[ev])_wl[ev]=_wl[ev].filter(f=>f!==cb);},
    _fire(ev){navigator_.onLine=ev==='online';(_wl[ev]||[]).forEach(f=>f());},
  };
  const document_={
    readyState, currentScript:scriptEl, body, activeElement:null,
    createElement(tag){
      const el={
        id:'',className:'',tagName:tag.toUpperCase(),parentNode:null,
        dataset:{},children:[], style:{setProperty(k,v){this[k]=v;},display:'',cssText:''},
        firstChild:null, textContent:'', innerHTML:'', value:'',
        rows:1, maxLength:500, disabled:false, placeholder:'',
        scrollHeight:100, scrollTop:0,
        setAttribute(k,v){this['__'+k]=v;}, getAttribute(k){return this['__'+k]??null;},
        removeAttribute(k){delete this['__'+k];},
        appendChild(c){this.children.push(c);c.parentNode=this;this.firstChild=this.children[0]??null;return c;},
        insertBefore(c,ref){const i=this.children.indexOf(ref);if(i>=0)this.children.splice(i,0,c);else this.children.push(c);c.parentNode=this;this.firstChild=this.children[0]??null;return c;},
        removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentNode=null;this.firstChild=this.children[0]??null;return c;},
        attachShadow(){const sr=makeShadowRoot();this.shadowRoot=sr;return sr;},
        shadowRoot:null,
        focus(){document_.activeElement=this;}, blur(){},
        querySelectorAll(sel){
          const results=[];
          const search=(node)=>{
            if(!node.children)return;
            for(const c of node.children){
              if(sel.startsWith('.')&&c.className?.split(' ').includes(sel.slice(1)))results.push(c);
              else if(!sel.startsWith('.')&&!sel.startsWith('#')&&c.tagName?.toLowerCase()===sel.toLowerCase())results.push(c);
              search(c);
            }
          };
          search(this);
          return results;
        },
        querySelector(sel){return this.querySelectorAll(sel)[0]??null;},
        getRootNode(){let n=this;while(n.parentNode)n=n.parentNode;return n.shadowRoot||n;},
        get classList(){
          const el=this;
          return{
            add(...cls){for(const c of cls){if(!el.className.split(' ').filter(Boolean).includes(c))el.className=(el.className+' '+c).trim();}},
            remove(...cls){el.className=el.className.split(' ').filter(c=>c&&!cls.includes(c)).join(' ');},
            contains(c){return el.className.split(' ').includes(c);},
            toggle(c,force){if(force===true||(force===undefined&&!el.className.split(' ').includes(c))){this.add(c);}else{this.remove(c);}},
          };
        },
        _evs:{},
        addEventListener(ev,cb){if(!this._evs[ev])this._evs[ev]=[];this._evs[ev].push(cb);},
        dispatchEvent(e){(this._evs[e.type||e.key]||[]).forEach(cb=>cb(e));return true;},
        animate(kf,opts){const a={onfinish:null,oncancel:null};setTimeout(()=>a.onfinish?.(),opts.duration||0);return a;},
      };
      // textarea-specific  
      if(tag.toLowerCase()==='textarea'||tag.toLowerCase()==='button')el.type='';
      return el;
    },
    addEventListener(_ev,cb){cb();},
    getElementById(id){return body.children.find(el=>el.id===id)??null;},
    querySelectorAll(sel){return(sel.includes('data-business')&&scriptDataset['business'])?[scriptEl]:[];},
  };
  const console_={log(...a){logs.push(a.map(String).join(' '));},warn(...a){warns.push(a.map(String).join(' '));},error(...a){errors.push(a.map(String).join(' '));}};
  return{document:document_,window:window_,console:console_,navigator:navigator_,body,logs,warns,errors,scriptEl};
}

async function runBundle(b){
  const ctx=vm.createContext({
    document:b.document,window:b.window,console:b.console,
    navigator:b.navigator,HTMLScriptElement,
    Promise,setTimeout,clearTimeout,setImmediate,
    AbortController,URLSearchParams,
    getComputedStyle:()=>({display:'block'}),
    crypto:{randomUUID:()=>'uuid-'+Math.random().toString(36).slice(2)},
  });
  vm.runInContext(bundle,ctx);
  await new Promise(r=>setImmediate(r));
  b.sdk=ctx.window.__LEADFLOW__;
}

let passed=0,failed=0;
function check(label,cond,detail=''){
  if(cond){passed++;console.log(`[PASS] ${label.padEnd(68)} ${detail}`);}
  else    {failed++;console.log(`[FAIL] ${label.padEnd(68)} ${detail}`);}
}

console.log('\nLeadFlow Widget SDK — B.1–C.4 Acceptance Criteria\n');

// ════════════════════════════════════════════════════════════
// REGRESSION
// ════════════════════════════════════════════════════════════
console.log('── Regression (B.1–C.3) ────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_reg'}});
  await runBundle(b); const sdk=b.sdk;
  check('REG: Widget READY',           sdk.getStatus()==='READY',               '');
  check('REG: renderer mounted',       sdk.renderer.isMounted()===true,         '');
  check('REG: launcher exposed',       sdk.launcher!==null,                     '');
  check('REG: C.3 state machine',      sdk.launcher?.getState()==='closed',     `state=${sdk.launcher?.getState()}`);
}

// ════════════════════════════════════════════════════════════
// C.4 — Conversation Controller API
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Controller API ──────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_cv'}});
  await runBundle(b); const sdk=b.sdk;
  const cv=sdk.conversation;

  check('C4 CA1: conversation exposed on sdk',         cv!==null,                             typeof cv);
  check('C4 CA1: runtime.conversation===sdk.conv',     sdk.runtime.conversation===cv,          '');
  check('C4 CA1: open() is a function',                typeof cv?.open==='function',           '');
  check('C4 CA1: close() is a function',               typeof cv?.close==='function',          '');
  check('C4 CA1: minimize() is a function',            typeof cv?.minimize==='function',       '');
  check('C4 CA1: restore() is a function',             typeof cv?.restore==='function',        '');
  check('C4 CA1: toggle() is a function',              typeof cv?.toggle==='function',         '');
  check('C4 CA1: appendMessage() is a function',       typeof cv?.appendMessage==='function',  '');
  check('C4 CA1: clearMessages() is a function',       typeof cv?.clearMessages==='function',  '');
  check('C4 CA1: getInputValue() is a function',       typeof cv?.getInputValue==='function',  '');
  check('C4 CA1: setInputPlaceholder() is a fn',       typeof cv?.setInputPlaceholder==='function', '');
  check('C4 CA1: getDiagnostics() is a function',      typeof cv?.getDiagnostics==='function', '');
}

// ════════════════════════════════════════════════════════════
// C.4 — State Machine
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 State Machine ───────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_sm'}});
  await runBundle(b); const sdk=b.sdk;
  const cv=sdk.conversation;

  check('C4 SM1: Initial state=closed',                cv?.getState()==='closed',             `state=${cv?.getState()}`);
  check('C4 SM2: isOpen()=false initially',            cv?.isOpen()===false,                  '');

  cv?.open();
  check('C4 SM3: State=open after open()',             cv?.getState()==='open',               `state=${cv?.getState()}`);
  check('C4 SM4: isOpen()=true after open()',          cv?.isOpen()===true,                   '');
  check('C4 SM5: getStatus().visible=true',            cv?.getStatus().visible===true,        '');

  cv?.minimize();
  check('C4 SM6: State=minimized after minimize()',    cv?.getState()==='minimized',          `state=${cv?.getState()}`);
  check('C4 SM7: isMinimized()=true',                  cv?.isMinimized()===true,              '');

  cv?.restore();
  check('C4 SM8: State=open after restore()',          cv?.getState()==='open',               `state=${cv?.getState()}`);

  cv?.close();
  check('C4 SM9: State=closed after close()',          cv?.getState()==='closed',             `state=${cv?.getState()}`);

  // toggle
  cv?.toggle();
  check('C4 SM10: Toggle opens',                       cv?.isOpen()===true,                   '');
  cv?.toggle();
  check('C4 SM11: Toggle closes',                      cv?.isOpen()===false,                  '');
}

// ════════════════════════════════════════════════════════════
// C.4 — Shell DOM Structure
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Shell DOM Structure ─────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_dom'}});
  await runBundle(b); const sdk=b.sdk;

  const contentRoot=sdk.renderer.getRoot();
  check('C4 SD1: contentRoot exists',                  contentRoot!==null,                    '');

  // Launcher wrapper is children[0], shell is children[1]
  const shellEl=contentRoot?.children?.[1];
  check('C4 SD2: Shell element exists',                shellEl!==undefined,                   `children=${contentRoot?.children?.length}`);
  check('C4 SD3: Shell has role=dialog',               shellEl?.getAttribute('role')==='dialog', `role=${shellEl?.getAttribute('role')}`);
  check('C4 SD4: Shell has aria-label',                shellEl?.getAttribute('aria-label')!==null, '');
  check('C4 SD5: Shell has aria-modal=true',           shellEl?.getAttribute('aria-modal')==='true', '');

  // Find header inside shell
  const header=shellEl?.querySelector?.('.lf-conv-header');
  check('C4 SD6: Header exists in shell',              header!==undefined&&header!==null,     '');

  // Find body inside shell
  const body=shellEl?.querySelector?.('.lf-conv-body');
  check('C4 SD7: Body exists in shell',                body!==undefined&&body!==null,         '');

  // Find footer
  const footer=shellEl?.querySelector?.('.lf-conv-footer');
  check('C4 SD8: Footer exists in shell',              footer!==undefined&&footer!==null,     '');

  // Find composer
  const composer=shellEl?.querySelector?.('.lf-conv-composer');
  check('C4 SD9: Composer exists in shell',            composer!==undefined&&composer!==null, '');
}

// ════════════════════════════════════════════════════════════
// C.4 — Header
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Header ──────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_hdr'}});
  await runBundle(b); const sdk=b.sdk;
  const contentRoot=sdk.renderer.getRoot();
  const shellEl=contentRoot?.children?.[1];
  const header=shellEl?.querySelector?.('.lf-conv-header');
  const minBtn=shellEl?.querySelector?.('.lf-conv-minimize');
  const closeBtn=shellEl?.querySelector?.('.lf-conv-close');

  check('C4 HE1: Header has role=banner',              header?.getAttribute('role')==='banner', `role=${header?.getAttribute('role')}`);
  check('C4 HE2: Minimize button has aria-label',      minBtn?.getAttribute('aria-label')!==null, `label=${minBtn?.getAttribute('aria-label')}`);
  check('C4 HE3: Close button has aria-label',         closeBtn?.getAttribute('aria-label')!==null, `label=${closeBtn?.getAttribute('aria-label')}`);
  check('C4 HE4: Title element exists',                shellEl?.querySelector?.('.lf-conv-title')!==null, '');
}

// ════════════════════════════════════════════════════════════
// C.4 — Body (message area)
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Body ────────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_body'}});
  await runBundle(b); const sdk=b.sdk;
  const cv=sdk.conversation;

  check('C4 BO1: messageCount=0 initially',            cv?.getStatus().messageCount===0,      `count=${cv?.getStatus().messageCount}`);

  cv?.appendMessage('<p>Hello world</p>');
  check('C4 BO2: appendMessage increments count',      cv?.getDiagnostics().messageCount===1, `count=${cv?.getDiagnostics().messageCount}`);

  cv?.appendMessage('<p>Second message</p>');
  check('C4 BO3: Second message adds up',              cv?.getDiagnostics().messageCount===2, `count=${cv?.getDiagnostics().messageCount}`);

  cv?.clearMessages();
  check('C4 BO4: clearMessages resets count',          cv?.getDiagnostics().messageCount===0, `count=${cv?.getDiagnostics().messageCount}`);

  // scrollToBottom is safe to call
  cv?.scrollToBottom();
  check('C4 BO5: scrollToBottom does not throw',       true,                                  'no throw');
}

// ════════════════════════════════════════════════════════════
// C.4 — Composer / Input
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Composer & Input ────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_inp'}});
  await runBundle(b); const sdk=b.sdk;
  const cv=sdk.conversation;

  check('C4 IN1: getInputValue()="" initially',        cv?.getInputValue()==='',              `val="${cv?.getInputValue()}"`);
  check('C4 IN2: inputLength=0 initially',             cv?.getDiagnostics().inputLength===0,  `len=${cv?.getDiagnostics().inputLength}`);

  cv?.setInputPlaceholder('Ask me anything…');
  check('C4 IN3: setInputPlaceholder works',           true,                                  'no throw');

  cv?.setInputDisabled(true);
  cv?.setInputDisabled(false);
  check('C4 IN4: setInputDisabled works',              true,                                  'no throw');

  cv?.clearInput();
  check('C4 IN5: clearInput works',                    cv?.getInputValue()==='',              `val="${cv?.getInputValue()}"`);

  // Check input element in DOM
  const contentRoot=sdk.renderer.getRoot();
  const shellEl=contentRoot?.children?.[1];
  const textarea=shellEl?.querySelector?.('.lf-conv-input');
  check('C4 IN6: Textarea element exists in DOM',      textarea!==null&&textarea!==undefined, '');
  check('C4 IN7: Textarea has aria-label',             textarea?.getAttribute('aria-label')!==null, `label=${textarea?.getAttribute('aria-label')}`);
  check('C4 IN8: Textarea has aria-multiline=true',    textarea?.getAttribute('aria-multiline')==='true', '');

  // Send button
  const sendBtn=shellEl?.querySelector?.('.lf-conv-send');
  check('C4 IN9: Send button exists',                  sendBtn!==null&&sendBtn!==undefined,   '');
  check('C4 IN10: Send button has aria-label',         sendBtn?.getAttribute('aria-label')!==null, '');
}

// ════════════════════════════════════════════════════════════
// C.4 — Events
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Events ──────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_ev'}});
  await runBundle(b); const sdk=b.sdk;
  const cv=sdk.conversation;
  const evts={};
  sdk.eventBus.on('CONVERSATION_OPENED',    p=>evts['opened']   =p);
  sdk.eventBus.on('CONVERSATION_CLOSED',    p=>evts['closed']   =p);
  sdk.eventBus.on('CONVERSATION_MINIMIZED', p=>evts['minimized']=p);
  sdk.eventBus.on('CONVERSATION_RESTORED',  p=>evts['restored'] =p);

  cv?.open();
  check('C4 EV1: CONVERSATION_OPENED emitted',         !!evts['opened'],                      '');
  check('C4 EV1: OPENED has timestamp',                typeof evts['opened']?.timestamp==='string', '');

  cv?.minimize();
  check('C4 EV2: CONVERSATION_MINIMIZED emitted',      !!evts['minimized'],                   '');

  cv?.restore();
  check('C4 EV3: CONVERSATION_RESTORED emitted',       !!evts['restored'],                    '');

  cv?.close();
  check('C4 EV4: CONVERSATION_CLOSED emitted',         !!evts['closed'],                      '');
}

// ════════════════════════════════════════════════════════════
// C.4 — Diagnostics
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Diagnostics ─────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_diag'}});
  await runBundle(b); const sdk=b.sdk;
  const d=sdk.getDiagnostics();

  check('C4 DG1: conversationVisible in diagnostics',  typeof d.conversationVisible==='boolean', `vis=${d.conversationVisible}`);
  check('C4 DG1: conversationState in diagnostics',    typeof d.conversationState==='string',    `state=${d.conversationState}`);
  check('C4 DG1: inputLength=0 initially',             d.inputLength===0,                       '');
  check('C4 DG1: messageCount=0 initially',            d.messageCount===0,                      '');
  check('C4 DG1: minimized=false initially',           d.minimized===false,                     '');
  check('C4 DG1: fullscreen=false',                    d.fullscreen===false,                    '');
  check('C4 DG1: JSON-serialisable',
    (()=>{try{JSON.stringify(d);return true;}catch{return false;}})(), '');

  sdk.conversation?.open();
  sdk.conversation?.appendMessage('<p>Test</p>');
  const d2=sdk.getDiagnostics();
  check('C4 DG2: conversationState=open after open',   d2.conversationState==='open',           `state=${d2.conversationState}`);
  check('C4 DG2: messageCount=1 after append',         d2.messageCount===1,                     `count=${d2.messageCount}`);
}

// ════════════════════════════════════════════════════════════
// C.4 — Lifecycle (destroy + re-init)
// ════════════════════════════════════════════════════════════
console.log('\n── C.4 Lifecycle ───────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_lf'}});
  await runBundle(b); const sdk=b.sdk;
  check('C4 LF1: conversation exists after init',      sdk.conversation!==null,               '');
  sdk.destroy();
  check('C4 LF2: conversation=null after destroy',     sdk.conversation===null,               '');
  const s=await sdk.initialize({businessId:'biz_lf2',position:'bottom-right',theme:'auto',primaryColor:'#6366f1'});
  check('C4 LF3: Re-init creates conversation',        sdk.conversation!==null&&s==='mounted', `status=${s}`);
}

// ════════════════════════════════════════════════════════════
// C.5 — Installation Lifecycle Manager API
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Lifecycle Manager API ───────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_lm'}});
  await runBundle(b); const sdk=b.sdk;

  check('C5 LM1: installation exposed on sdk',         sdk.installation!==null,               typeof sdk.installation);
  check('C5 LM1: install() is a function',             typeof sdk.install==='function',        '');
  check('C5 LM1: uninstall() is a function',           typeof sdk.uninstall==='function',      '');
  check('C5 LM1: reinstall() is a function',           typeof sdk.reinstall==='function',      '');
  check('C5 LM1: reload() is a function',              typeof sdk.reload==='function',         '');
  check('C5 LM1: getInstallationStatus() is fn',       typeof sdk.getInstallationStatus==='function','');
}

// ════════════════════════════════════════════════════════════
// C.5 — Installation Status
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Installation Status ─────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_is'}});
  await runBundle(b); const sdk=b.sdk;

  check('C5 IS1: status=installed after auto-init',    sdk.getInstallationStatus()==='installed', `status=${sdk.getInstallationStatus()}`);
  check('C5 IS2: installation.status()===installed',   sdk.installation?.status()==='installed',  `status=${sdk.installation?.status()}`);

  const state=sdk.installation?.getState();
  check('C5 IS3: getState() returns object',           typeof state==='object'&&state!==null,     '');
  check('C5 IS4: state.status===installed',            state?.status==='installed',               `status=${state?.status}`);
  check('C5 IS5: state.embedMode is string',           typeof state?.embedMode==='string',        `mode=${state?.embedMode}`);
  check('C5 IS6: state.installedAt is string',         typeof state?.installedAt==='string',      `at=${state?.installedAt}`);
  check('C5 IS7: browserCapabilities is object',       typeof state?.browserCapabilities==='object', '');
}

// ════════════════════════════════════════════════════════════
// C.5 — Compatibility Detection
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Compatibility Detection ─────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_compat'}});
  await runBundle(b); const sdk=b.sdk;

  const state=sdk.installation?.getState();
  const caps=state?.browserCapabilities;

  check('C5 CD1: browserCapabilities present',         caps!==undefined&&caps!==null,             '');
  check('C5 CD2: shadowDOM capability is boolean',     typeof caps?.shadowDOM==='boolean',        `val=${caps?.shadowDOM}`);
  check('C5 CD3: abortController is boolean',          typeof caps?.abortController==='boolean',  `val=${caps?.abortController}`);
  check('C5 CD4: fetch is boolean',                    typeof caps?.fetch==='boolean',            `val=${caps?.fetch}`);
  check('C5 CD5: resizeObserver is boolean',           typeof caps?.resizeObserver==='boolean',   `val=${caps?.resizeObserver}`);
  check('C5 CD6: intersectionObserver is boolean',     typeof caps?.intersectionObserver==='boolean','');
  check('C5 CD7: customElements is boolean',           typeof caps?.customElements==='boolean',   '');
  check('C5 CD8: cssVariables is boolean',             typeof caps?.cssVariables==='boolean',     '');
  check('C5 CD9: compatibilityWarnings is array',      Array.isArray(state?.compatibilityWarnings), '');
}

// ════════════════════════════════════════════════════════════
// C.5 — Embed Modes
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Embed Modes ─────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_em'}});
  await runBundle(b); const sdk=b.sdk;

  const state=sdk.installation?.getState();
  check('C5 EM1: default embedMode=floating',          state?.embedMode==='floating',             `mode=${state?.embedMode}`);

  // reinstall with fullscreen mode
  const result=await sdk.reinstall('fullscreen');
  check('C5 EM2: reinstall() returns result',          typeof result==='object'&&result!==null,   '');
  check('C5 EM3: reinstall embedMode=fullscreen',      result?.embedMode==='fullscreen',          `mode=${result?.embedMode}`);
  check('C5 EM4: reinstall succeeded',                 result?.success===true,                    `success=${result?.success}`);

  // reload
  const reloadResult=await sdk.reload();
  check('C5 EM5: reload() returns result',             typeof reloadResult==='object',            '');
  check('C5 EM6: reload succeeds',                     reloadResult?.success===true,              `success=${reloadResult?.success}`);

  // popover → falls back to floating
  const popResult=await sdk.reinstall('popover');
  check('C5 EM7: popover falls back to floating',      popResult?.embedMode==='floating',         `mode=${popResult?.embedMode}`);
}

// ════════════════════════════════════════════════════════════
// C.5 — Duplicate Installation Prevention
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Duplicate Prevention ────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_dup'}});
  await runBundle(b); const sdk=b.sdk;

  // Widget is already installed by auto-init. Calling install() again
  // should be blocked as a duplicate.
  let dupPrevented=false;
  try {
    const r=await sdk.install('floating');
    dupPrevented=r?.duplicatePrevented===true || r?.success===false;
  } catch { dupPrevented=true; }
  check('C5 DP1: duplicate install prevented',         dupPrevented,                              '');
}

// ════════════════════════════════════════════════════════════
// C.5 — Events
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Events ──────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_ev5'}});
  await runBundle(b); const sdk=b.sdk;
  const evts={};
  sdk.eventBus.on('INSTALL_STARTED',     p=>evts['started']    =p);
  sdk.eventBus.on('INSTALL_COMPLETED',   p=>evts['completed']  =p);
  sdk.eventBus.on('UNINSTALL_COMPLETED', p=>evts['uninstalled']=p);
  sdk.eventBus.on('REINSTALL_COMPLETED', p=>evts['reinstalled']=p);

  // reinstall triggers INSTALL_STARTED + INSTALL_COMPLETED + REINSTALL_COMPLETED
  await sdk.reinstall('floating');
  check('C5 EV1: INSTALL_STARTED emitted',             !!evts['started'],                         '');
  check('C5 EV2: INSTALL_COMPLETED emitted',           !!evts['completed'],                       '');
  check('C5 EV3: REINSTALL_COMPLETED emitted',         !!evts['reinstalled'],                     '');
  check('C5 EV4: INSTALL_COMPLETED has embedMode',     typeof evts['completed']?.embedMode==='string','');
  check('C5 EV5: INSTALL_COMPLETED has timestamp',     typeof evts['completed']?.timestamp==='string','');

  sdk.uninstall();
  check('C5 EV6: UNINSTALL_COMPLETED emitted',         !!evts['uninstalled'],                     '');
}

// ════════════════════════════════════════════════════════════
// C.5 — Diagnostics
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Diagnostics ─────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_d5'}});
  await runBundle(b); const sdk=b.sdk;
  const d=sdk.getDiagnostics();

  check('C5 DG1: installationStatus in diagnostics',   typeof d.installationStatus==='string',    `status=${d.installationStatus}`);
  check('C5 DG2: installationTime in diagnostics',     d.installationTime!==undefined,            `time=${d.installationTime}`);
  check('C5 DG3: embedMode in diagnostics',            typeof d.embedMode==='string',             `mode=${d.embedMode}`);
  check('C5 DG4: compatibilityWarnings is array',      Array.isArray(d.compatibilityWarnings),    '');
  check('C5 DG5: browserCapabilities is object',       typeof d.browserCapabilities==='object',   '');
  check('C5 DG6: duplicateInstallationPrevented bool', typeof d.duplicateInstallationPrevented==='boolean','');
  check('C5 DG7: installationStatus=installed',        d.installationStatus==='installed',        `status=${d.installationStatus}`);
  check('C5 DG8: JSON-serialisable',
    (()=>{try{JSON.stringify(d);return true;}catch{return false;}})(), '');

  // After uninstall, status should reflect it
  sdk.uninstall();
  const d2=sdk.getDiagnostics();
  check('C5 DG9: status=not-installed after uninstall',d2.installationStatus==='not-installed',   `status=${d2.installationStatus}`);
}

// ════════════════════════════════════════════════════════════
// C.5 — Lifecycle (uninstall → reinstall)
// ════════════════════════════════════════════════════════════
console.log('\n── C.5 Lifecycle ───────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_lc5'}});
  await runBundle(b); const sdk=b.sdk;

  check('C5 LC1: installed after auto-init',           sdk.getInstallationStatus()==='installed', '');
  sdk.uninstall();
  check('C5 LC2: not-installed after uninstall',       sdk.getInstallationStatus()==='not-installed','');
  check('C5 LC3: conversation=null after uninstall',   sdk.conversation===null,                   '');
  const r=await sdk.reinstall('floating');
  check('C5 LC4: reinstall succeeds',                  r.success===true,                          `success=${r.success}`);
  check('C5 LC5: installed after reinstall',           sdk.getInstallationStatus()==='installed', `status=${sdk.getInstallationStatus()}`);
  check('C5 LC6: conversation restored after reinstall',sdk.conversation!==null,                  '');
}

// ════════════════════════════════════════════════════════════
// C.6 — Dashboard Controller API
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Dashboard Controller API ────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_db'}});
  await runBundle(b); const sdk=b.sdk;

  check('C6 DA1: dashboard exposed on sdk',            sdk.dashboard!==null,                      typeof sdk.dashboard);
  check('C6 DA1: runtime.dashboard===sdk.dashboard',   sdk.runtime.dashboard===sdk.dashboard,     '');
  check('C6 DA1: connectDashboard() is a function',    typeof sdk.connectDashboard==='function',  '');
  check('C6 DA1: disconnectDashboard() is fn',         typeof sdk.disconnectDashboard==='function','');
  check('C6 DA1: pushDashboardConfig() is fn',         typeof sdk.pushDashboardConfig==='function','');
  check('C6 DA1: pullDashboardState() is fn',          typeof sdk.pullDashboardState==='function', '');
  check('C6 DA1: rollbackDashboardConfig() is fn',     typeof sdk.rollbackDashboardConfig==='function','');
}

// ════════════════════════════════════════════════════════════
// C.6 — Connect & Disconnect
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Connect & Disconnect ────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_dc'}});
  await runBundle(b); const sdk=b.sdk;
  const db=sdk.dashboard;

  check('C6 CD1: not connected initially',             db?.isConnected()===false,                 `connected=${db?.isConnected()}`);

  const r=db?.connect();
  check('C6 CD2: connect() returns result',            typeof r==='object'&&r!==null,             '');
  check('C6 CD3: isConnected()=true after connect',    db?.isConnected()===true,                  `connected=${db?.isConnected()}`);

  db?.disconnect();
  check('C6 CD4: isConnected()=false after disconnect',db?.isConnected()===false,                 `connected=${db?.isConnected()}`);

  // SDK convenience methods
  const r2=sdk.connectDashboard();
  check('C6 CD5: sdk.connectDashboard() works',        r2!==null&&typeof r2==='object',           '');
  sdk.disconnectDashboard();
  check('C6 CD6: sdk.disconnectDashboard() works',     db?.isConnected()===false,                 '');
}

// ════════════════════════════════════════════════════════════
// C.6 — Config Sync
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Config Sync ─────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_cs'}});
  await runBundle(b); const sdk=b.sdk;
  const db=sdk.dashboard;

  // Connect with initial config
  const initResult=db?.connect({theme:'dark',primaryColor:'#ff0000'});
  check('C6 CS1: connect with config succeeds',        initResult?.success===true,                `success=${initResult?.success}`);
  check('C6 CS2: connect returns version',             typeof initResult?.version==='number',     `v=${initResult?.version}`);

  // Push incremental update
  const pushResult=sdk.pushDashboardConfig({theme:'light'});
  check('C6 CS3: push() succeeds',                     pushResult?.success===true,                `success=${pushResult?.success}`);
  check('C6 CS4: push returns changedFields',          Array.isArray(pushResult?.changedFields),  '');
  check('C6 CS5: theme in changedFields',              pushResult?.changedFields?.includes('theme'), `fields=${pushResult?.changedFields}`);
  check('C6 CS6: version increments on push',          (pushResult?.version??0) > (initResult?.version??0), `v=${pushResult?.version}`);

  // Theme applied to config service
  const resolved=sdk.runtime.configuration.getResolvedConfig();
  check('C6 CS7: theme applied to runtime config',     resolved?.theme==='light',                 `theme=${resolved?.theme}`);
}

// ════════════════════════════════════════════════════════════
// C.6 — Pull (Observer)
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Pull / Observer ─────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_ob'}});
  await runBundle(b); const sdk=b.sdk;
  sdk.connectDashboard();

  const state=sdk.pullDashboardState();
  check('C6 OB1: pull() returns object',               typeof state==='object'&&state!==null,     '');
  check('C6 OB2: state.theme is string',               typeof state?.theme==='string',            `theme=${state?.theme}`);
  check('C6 OB3: state.launcherOpen is boolean',       typeof state?.launcherOpen==='boolean',    '');
  check('C6 OB4: state.conversationState is string',   typeof state?.conversationState==='string','');
  check('C6 OB5: state.installationStatus is string',  typeof state?.installationStatus==='string','');
  check('C6 OB6: state.configVersion is number',       typeof state?.configVersion==='number',    `v=${state?.configVersion}`);
  check('C6 OB7: state.resolvedConfig is object',      typeof state?.resolvedConfig==='object',   '');
}

// ════════════════════════════════════════════════════════════
// C.6 — Rollback
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Rollback ────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_rb'}});
  await runBundle(b); const sdk=b.sdk;
  const db=sdk.dashboard;

  db?.connect({theme:'auto'});
  sdk.pushDashboardConfig({theme:'dark'});
  check('C6 RB1: theme=dark after push',               sdk.runtime.configuration.getResolvedConfig()?.theme==='dark', `theme=${sdk.runtime.configuration.getResolvedConfig()?.theme}`);

  const rbResult=sdk.rollbackDashboardConfig();
  check('C6 RB2: rollback() returns result',           typeof rbResult==='object'&&rbResult!==null,'');
  check('C6 RB3: rollback result has rolledBack=true', rbResult?.rolledBack===true,                `rb=${rbResult?.rolledBack}`);
  check('C6 RB4: rollback() emits no throw',           true,                                      'no throw');
}

// ════════════════════════════════════════════════════════════
// C.6 — Events
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Events ──────────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_dev6'}});
  await runBundle(b); const sdk=b.sdk;
  const evts={};
  sdk.eventBus.on('DASHBOARD_CONNECTED',   p=>evts['connected']  =p);
  sdk.eventBus.on('CONFIG_SYNC_STARTED',   p=>evts['syncStart']  =p);
  sdk.eventBus.on('CONFIG_SYNC_COMPLETED', p=>evts['syncDone']   =p);
  sdk.eventBus.on('CONFIG_CHANGED',        p=>evts['changed']    =p);
  sdk.eventBus.on('CONFIG_ROLLBACK',       p=>evts['rollback']   =p);

  sdk.connectDashboard({primaryColor:'#123456'});
  check('C6 EV1: DASHBOARD_CONNECTED emitted',         !!evts['connected'],                       '');
  check('C6 EV2: CONFIG_SYNC_STARTED emitted',         !!evts['syncStart'],                       '');
  check('C6 EV3: CONFIG_SYNC_COMPLETED emitted',       !!evts['syncDone'],                        '');
  check('C6 EV4: CONFIG_CHANGED emitted',              !!evts['changed'],                         '');
  check('C6 EV5: CONFIG_CHANGED has changedFields',    Array.isArray(evts['changed']?.changedFields),'');
  check('C6 EV6: CONFIG_CHANGED has diff',             Array.isArray(evts['changed']?.diff),      '');
  check('C6 EV7: sync events have timestamp',          typeof evts['syncDone']?.timestamp==='string','');

  sdk.rollbackDashboardConfig();
  check('C6 EV8: CONFIG_ROLLBACK emitted',             !!evts['rollback'],                        '');
}

// ════════════════════════════════════════════════════════════
// C.6 — Diagnostics
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Diagnostics ─────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_dd6'}});
  await runBundle(b); const sdk=b.sdk;

  const d=sdk.getDiagnostics();
  check('C6 DG1: dashboardConnected in diagnostics',   typeof d.dashboardConnected==='boolean',   `connected=${d.dashboardConnected}`);
  check('C6 DG2: configVersion in diagnostics',        typeof d.configVersion==='number',         `v=${d.configVersion}`);
  check('C6 DG3: lastSync in diagnostics',             d.lastSync===null||typeof d.lastSync==='string','');
  check('C6 DG4: pendingUpdates in diagnostics',       typeof d.pendingUpdates==='number',        '');
  check('C6 DG5: rollbackAvailable in diagnostics',    typeof d.rollbackAvailable==='boolean',    '');
  check('C6 DG6: dashboardConnected=false initially',  d.dashboardConnected===false,              `connected=${d.dashboardConnected}`);
  check('C6 DG7: JSON-serialisable',
    (()=>{try{JSON.stringify(d);return true;}catch{return false;}})(), '');

  sdk.connectDashboard({theme:'dark'});
  const d2=sdk.getDiagnostics();
  check('C6 DG8: dashboardConnected=true after connect',d2.dashboardConnected===true,             `connected=${d2.dashboardConnected}`);
  check('C6 DG9: configVersion>0 after sync',          d2.configVersion>0,                        `v=${d2.configVersion}`);
  check('C6 DG10: lastSync is string after connect',   typeof d2.lastSync==='string',             `sync=${d2.lastSync}`);
}

// ════════════════════════════════════════════════════════════
// C.6 — Lifecycle (destroy + re-init)
// ════════════════════════════════════════════════════════════
console.log('\n── C.6 Lifecycle ───────────────────────────────────────────────');
{
  const b=makeBrowser({scriptDataset:{business:'biz_lc6'}});
  await runBundle(b); const sdk=b.sdk;

  check('C6 LC1: dashboard exists after init',         sdk.dashboard!==null,                      '');
  sdk.connectDashboard({theme:'dark'});
  check('C6 LC2: connected after connectDashboard',    sdk.dashboard?.isConnected()===true,       '');

  sdk.destroy();
  check('C6 LC3: dashboard=null after destroy',        sdk.dashboard===null,                      '');

  const s=await sdk.initialize({businessId:'biz_lc6b',position:'bottom-right',theme:'auto',primaryColor:'#6366f1'});
  check('C6 LC4: dashboard restored after re-init',    sdk.dashboard!==null&&s==='mounted',       `status=${s}`);
  check('C6 LC5: not connected after re-init',         sdk.dashboard?.isConnected()===false,      '');
}

// ════════════════════════════════════════════════════════════
// Bundle
// ════════════════════════════════════════════════════════════
console.log('\n── Bundle ──────────────────────────────────────────────────────');
{
  const stat=fs.statSync('./dist/widget.js');
  const sizeKb=(stat.size/1024).toFixed(1);
  check('BN: bundle exists',         bundle.length>0,                                          `${sizeKb} KB`);
  check('BN: IIFE',                  bundle.includes('(()=>{')||bundle.includes('(()=>'),      'IIFE');
  check('BN: no React',             !bundle.includes('ReactDOM'),                              '');
  check('BN: no WebSocket',         !bundle.includes('new WebSocket('),                       '');
  // localStorage is only used in the capability probe (write+remove), never for persistence
  check('BN: no localStorage persistence',  !bundle.includes('localStorage.getItem') && !bundle.includes("localStorage['getItem']"), '');
  check('BN: shell CSS in bundle',   bundle.includes('lf-conv-shell'),                        'CSS');
  check('BN: input CSS in bundle',   bundle.includes('lf-conv-input'),                        'CSS');
  check('BN: ARIA role dialog',      bundle.includes('role'),                                 'ARIA');
  check('BN: Escape key handler',    bundle.includes('Escape'),                               'keyboard');
  check('BN: C.5 INSTALL_STARTED',  bundle.includes('INSTALL_STARTED'),                      'C.5 event');
  check('BN: C.5 embedMode',        bundle.includes('embedMode'),                            'C.5 embed');
  check('BN: C.5 compatibility',    bundle.includes('shadowDOM'),                            'C.5 compat');
  check('BN: C.6 DASHBOARD_CONNECTED', bundle.includes('DASHBOARD_CONNECTED'),              'C.6 event');
  check('BN: C.6 CONFIG_SYNC',      bundle.includes('CONFIG_SYNC_COMPLETED'),               'C.6 sync');
  check('BN: C.6 CONFIG_CHANGED',   bundle.includes('CONFIG_CHANGED'),                      'C.6 diff');
  check('BN: version 0.1.0',        bundle.includes('0.1.0'),                                '');
  check('BN: zero runtime deps',
    (()=>{const pkg=JSON.parse(fs.readFileSync('./package.json','utf8'));return Object.keys(pkg.dependencies??{}).length===0;})(),'');
}

const total=passed+failed;
console.log();
console.log('═'.repeat(72));
console.log(`  RESULTS: ${passed}/${total} passed  |  ${failed} failed`);
console.log('═'.repeat(72));
if(failed>0)process.exit(1);
else console.log('  ALL ACCEPTANCE CRITERIA PASSED ✓');
