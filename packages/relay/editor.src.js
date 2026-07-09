import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { indentWithTab } from "@codemirror/commands";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { yCollab } from "y-codemirror.next";
import MarkdownIt from "markdown-it";

const params = new URLSearchParams(location.search);
const path = params.get("path") || "";
const userName = params.get("user") || "You";
function hashColor(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return `hsl(${h%360} 65% 45%)`; }
const userColor = params.get("color") || hashColor(userName + ":" + path);
function b64url(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
const room = b64url(path);

const nameEl = document.getElementById("name");
const statusEl = document.getElementById("status");
const presenceEl = document.getElementById("presence");
const previewEl = document.getElementById("preview");
const base = path.split("/").pop() || "untitled";
nameEl.textContent = base; nameEl.title = path; document.title = base + " — SOMA Editor";

const md = new MarkdownIt({ html:false, linkify:true });
const ydoc = new Y.Doc();
const provider = new SocketIOProvider("http://localhost:3333", room, ydoc, { autoConnect:true, disableBc:true });
const ytext = ydoc.getText("content");
const undoManager = new Y.UndoManager(ytext);
provider.awareness.setLocalStateField("user", { name:userName, color:userColor, colorLight:userColor + "33" });

function setStatus(t,c){ statusEl.textContent=t; statusEl.style.color=c||"#888"; }
function renderPreview(){ try { previewEl.innerHTML = md.render(ytext.toString()); } catch(e){} }
function renderPresence(){
  const states = [...provider.awareness.getStates().values()].filter(s => s.user);
  presenceEl.innerHTML = states.map(s => `<span class="who" style="background:${s.user.color}">${esc(s.user.name||"?")}</span>`).join("");
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

provider.on("sync", s => { setStatus(s ? "● live · saves automatically" : "syncing…", s ? "#16a34a" : "#d97706"); renderPreview(); });
provider.awareness.on("change", renderPresence);
renderPresence();

const view = new EditorView({
  state: EditorState.create({
    doc: ytext.toString(),
    extensions: [
      basicSetup, markdown(), EditorView.lineWrapping,
      keymap.of([indentWithTab]),
      yCollab(ytext, provider.awareness, { undoManager }),
      EditorView.updateListener.of(u => { if (u.docChanged) renderPreview(); }),
      EditorView.theme({ "&": { height: "100%" } })
    ]
  }),
  parent: document.getElementById("edit")
});
renderPreview();
// ── Edit-then-dispatch: ask a SOMA agent to revise this report live ──────────
const revInput = document.getElementById("revInput");
const revBtn = document.getElementById("revBtn");
async function dispatchRevision(){
  const instruction = (revInput && revInput.value || "").trim();
  if (!instruction) return;
  revBtn.disabled = true; setStatus("dispatching revision…", "#2563eb");
  try {
    const r = await fetch("/dispatch-revision", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ path, instruction }) });
    if (r.ok) { revInput.value = ""; setStatus("● revision dispatched — the agent will edit here", "#2563eb"); }
    else setStatus("dispatch failed: " + r.status, "#dc2626");
  } catch(e){ setStatus("dispatch error", "#dc2626"); }
  revBtn.disabled = false;
}
if (revBtn) revBtn.onclick = dispatchRevision;
if (revInput) revInput.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); dispatchRevision(); } });

window.addEventListener("beforeunload", () => { try { provider.destroy(); } catch(e){} });
