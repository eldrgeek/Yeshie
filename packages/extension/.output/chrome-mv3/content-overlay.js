var contentOverlay=(function(){function e(e){return e}var t=`
  #yeshie-overlay {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    width: 320px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    display: none;
  }
  #yeshie-overlay.visible {
    display: flex;
    flex-direction: column;
  }
  .yeshie-header {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .yeshie-logo {
    width: 22px;
    height: 22px;
    background: #6c5ce7;
    color: #fff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 13px;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .yeshie-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .yeshie-minimize {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .yeshie-minimize:hover {
    color: #fff;
  }
  .yeshie-body {
    overflow: hidden;
    transition: max-height 0.2s ease;
  }
  .yeshie-body.minimized {
    max-height: 0 !important;
    overflow: hidden;
  }
  .yeshie-steps {
    padding: 8px 12px;
    overflow-y: auto;
    max-height: 260px;
  }
  .yeshie-step {
    padding: 4px 0;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yeshie-step.pending {
    color: rgba(255,255,255,0.5);
  }
  .yeshie-step.running {
    color: #ffc107;
  }
  .yeshie-step.ok {
    color: #66bb6a;
    opacity: 0.8;
  }
  .yeshie-step.error {
    color: #ef5350;
  }
  .yeshie-step .detail {
    font-size: 12px;
    opacity: 0.7;
    margin-left: 6px;
  }
  .yeshie-controls {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .yeshie-suggest-btn, .yeshie-cancel-btn {
    flex: 1;
    padding: 6px 0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .yeshie-suggest-btn {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  .yeshie-suggest-btn:hover {
    background: rgba(255,255,255,0.2);
  }
  .yeshie-cancel-btn {
    background: rgba(239,83,80,0.2);
    color: #ef5350;
  }
  .yeshie-cancel-btn:hover {
    background: rgba(239,83,80,0.35);
  }
  .yeshie-suggest-input {
    display: none;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.1);
    gap: 6px;
  }
  .yeshie-suggest-input.active {
    display: flex;
  }
  .yeshie-suggest-input input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    background: rgba(255,255,255,0.05);
    color: #fff;
    font-size: 13px;
    outline: none;
  }
  .yeshie-suggest-input input::placeholder {
    color: rgba(255,255,255,0.4);
  }
  .yeshie-suggest-input button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: #6c5ce7;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  }
  .yeshie-suggest-input button:hover {
    background: #7c6cf7;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .yeshie-step.running {
    animation: pulse 1.5s ease-in-out infinite;
  }
`,n={pending:`○`,running:`⏳`,ok:`✅`,error:`❌`,skipped:`⏭`};function r(e,r={}){let i=document.createElement(`div`);i.id=`yeshie-overlay-host`,e.appendChild(i);let a=i.attachShadow({mode:`open`}),o=document.createElement(`style`);o.textContent=t,a.appendChild(o);let s=document.createElement(`div`);s.id=`yeshie-overlay`,a.appendChild(s),s.innerHTML=`
    <div class="yeshie-header">
      <span class="yeshie-logo">Y</span>
      <span class="yeshie-title"></span>
      <button class="yeshie-minimize">_</button>
    </div>
    <div class="yeshie-body">
      <div class="yeshie-steps"></div>
      <div class="yeshie-controls">
        <button class="yeshie-suggest-btn">💬 Suggest</button>
        <button class="yeshie-cancel-btn">✖ Cancel</button>
      </div>
      <div class="yeshie-suggest-input">
        <input type="text" placeholder="What should Yeshie do differently?" />
        <button>Send</button>
      </div>
    </div>
  `;let c=a.querySelector(`.yeshie-title`),l=a.querySelector(`.yeshie-steps`),u=a.querySelector(`.yeshie-body`),d=a.querySelector(`.yeshie-minimize`),f=a.querySelector(`.yeshie-cancel-btn`),p=a.querySelector(`.yeshie-suggest-btn`),m=a.querySelector(`.yeshie-suggest-input`),h=m.querySelector(`input`),g=m.querySelector(`button`),_=``,v=!1;return d.addEventListener(`click`,e=>{e.stopPropagation(),v=!v,u.classList.toggle(`minimized`,v),d.textContent=v?`▢`:`_`}),f.addEventListener(`click`,()=>{r.onCancel?.(_)}),p.addEventListener(`click`,()=>{m.classList.toggle(`active`),m.classList.contains(`active`)&&h.focus()}),g.addEventListener(`click`,()=>{let e=h.value.trim();e&&(r.onSuggest?.({runId:_,suggestion:e}),h.value=``,m.classList.remove(`active`))}),{get shadowRoot(){return a},show(e,t,r){_=e,c.textContent=t,v=!1,u.classList.remove(`minimized`),d.textContent=`_`,m.classList.remove(`active`),h.value=``,l.innerHTML=``;for(let e of r){let t=document.createElement(`div`);t.className=`yeshie-step pending`,t.dataset.stepId=e.id,t.textContent=`${n.pending} ${e.label}`,l.appendChild(t)}s.classList.add(`visible`)},hide(){s.classList.remove(`visible`)},updateStep(e,t,r){let i=l.querySelector(`[data-step-id="${e}"]`);if(!i)return;i.className=`yeshie-step ${t}`,(i.textContent?.replace(/^[^\s]+\s/,``)||``).replace(/\s*\S+$/,``).trim();let a=(i.textContent||``).replace(/^.*?\s/,``),o=i.querySelector(`.detail`),s=o?a.replace(o.textContent||``,``).trim():a;if(i.textContent=`${n[t]} ${s}`,r?.detail){let e=document.createElement(`span`);e.className=`detail`,e.textContent=r.detail,i.appendChild(e)}}}}var i=e({matches:[`https://app.yeshid.com/*`],runAt:`document_idle`,main(){let e=r(document.body);chrome.runtime.onMessage.addListener((t,n,r)=>{t.type===`overlay_show`?(e.show(t.runId,t.taskName,t.steps),r({ok:!0})):t.type===`overlay_step_update`?(e.updateStep(t.stepId,t.status,{detail:t.detail,durationMs:t.durationMs}),r({ok:!0})):t.type===`overlay_hide`&&(setTimeout(()=>e.hide(),3e3),r({ok:!0}))})}}),a={debug:(...e)=>([...e],void 0),log:(...e)=>([...e],void 0),warn:(...e)=>([...e],void 0),error:(...e)=>([...e],void 0)};return(()=>{let e;try{e=i.main(),e instanceof Promise&&(e=e.catch(e=>{throw a.error(`The unlisted script "content-overlay" crashed on startup!`,e),e}))}catch(e){throw a.error(`The unlisted script "content-overlay" crashed on startup!`,e),e}return e})()})();
contentOverlay;