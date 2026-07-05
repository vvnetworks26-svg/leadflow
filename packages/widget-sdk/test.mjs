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
  check('BN: no localStorage',      !bundle.includes('localStorage'),                         '');
  check('BN: shell CSS in bundle',   bundle.includes('lf-conv-shell'),                        'CSS');
  check('BN: input CSS in bundle',   bundle.includes('lf-conv-input'),                        'CSS');
  check('BN: ARIA role dialog',      bundle.includes('role'),                                 'ARIA');
  check('BN: Escape key handler',    bundle.includes('Escape'),                               'keyboard');
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
