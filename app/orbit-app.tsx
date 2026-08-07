"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "ideas" | "ready" | "progress" | "hold" | "done";
type Task = { id: number; title: string; status: Status; owner: string; due: string; tag: string; priority: "Low" | "Medium" | "High"; comments: number };

const columns: { id: Status; label: string; color: string }[] = [
  { id: "ideas", label: "Ideas", color: "#a78bfa" },
  { id: "ready", label: "Ready", color: "#60a5fa" },
  { id: "progress", label: "In progress", color: "#f59e0b" },
  { id: "hold", label: "On hold", color: "#f472b6" },
  { id: "done", label: "Done", color: "#34d399" },
];

const seed: Task[] = [
  { id: 1, title: "Finalize debut stream rundown", status: "progress", owner: "JM", due: "Aug 9", tag: "Launch", priority: "High", comments: 6 },
  { id: 2, title: "Review model expressions", status: "progress", owner: "AK", due: "Aug 11", tag: "Creative", priority: "Medium", comments: 3 },
  { id: 3, title: "Set up moderation playbook", status: "ready", owner: "SL", due: "Aug 13", tag: "Community", priority: "High", comments: 2 },
  { id: 4, title: "Plan first collab outreach", status: "ideas", owner: "JM", due: "Aug 18", tag: "Growth", priority: "Low", comments: 4 },
  { id: 5, title: "Commission stream overlays", status: "hold", owner: "AK", due: "Aug 21", tag: "Creative", priority: "Medium", comments: 1 },
  { id: 6, title: "Create social media accounts", status: "done", owner: "JM", due: "Aug 4", tag: "Launch", priority: "High", comments: 8 },
  { id: 7, title: "Draft weekly content cadence", status: "ready", owner: "SL", due: "Aug 15", tag: "Content", priority: "Medium", comments: 0 },
];

const people = [
  { name: "Johnathan Marsh", user: "@johnathan", initials: "JM", role: "Owner", color: "#8b5cf6", online: true },
  { name: "Avery Kim", user: "@averyk", initials: "AK", role: "Editor", color: "#ec4899", online: true },
  { name: "Sam Lee", user: "@samlee", initials: "SL", role: "Member", color: "#0ea5e9", online: false },
  { name: "Morgan Rivers", user: "@morgan", initials: "MR", role: "Guest", color: "#f59e0b", online: true },
];

export function OrbitApp() {
  const [tasks, setTasks] = useState<Task[]>(seed);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"board" | "directory" | "settings">("board");
  const [modal, setModal] = useState<"task" | "share" | "reminder" | null>(null);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [dragged, setDragged] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");

  useEffect(() => { const saved = localStorage.getItem("orbit-tasks"); if (saved) setTasks(JSON.parse(saved)); }, []);
  useEffect(() => { localStorage.setItem("orbit-tasks", JSON.stringify(tasks)); }, [tasks]);
  const filtered = useMemo(() => tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())), [tasks, search]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const addTask = () => { if (!taskTitle.trim()) return; setTasks([...tasks, { id: Date.now(), title: taskTitle, status: "ideas", owner: "JM", due: "No date", tag: "General", priority: "Medium", comments: 0 }]); setTaskTitle(""); setModal(null); notify("Task added to Ideas"); };

  return <div className="app-shell">
    <aside className={sidebar ? "sidebar" : "sidebar collapsed"}>
      <div className="brand"><div className="brand-mark">O</div><span>orbit</span><button className="icon-button close-side" onClick={() => setSidebar(false)}>‹</button></div>
      <button className="workspace"><span className="workspace-icon">V</span><span><b>VStudio HQ</b><small>Community workspace</small></span><i>⌄</i></button>
      <nav>
        <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><span>⌂</span> Home</button>
        <button><span>◎</span> My work <em>5</em></button>
        <button className={view === "directory" ? "active" : ""} onClick={() => setView("directory")}><span>♙</span> People</button>
      </nav>
      <div className="nav-label"><span>MY BOARDS</span><button>＋</button></div>
      <nav className="boards"><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><i className="dot purple"/>VTuber Launch</button><button><i className="dot cyan"/>Content Calendar</button><button><i className="dot orange"/>Community Events</button></nav>
      <div className="nav-label"><span>SHARED WITH ME</span></div>
      <nav className="boards"><button><i className="dot pink"/>Art Commissions</button><button><i className="dot green"/>Mod Team</button></nav>
      <div className="sidebar-bottom"><button onClick={() => setView("settings")}><span>⚙</span> Settings</button><button><span>?</span> Help & feedback</button><div className="profile"><Avatar initials="JM" color="#8b5cf6"/><span><b>Johnathan</b><small>Online</small></span><button>•••</button></div></div>
    </aside>

    <main className="main">
      <header className="topbar">{!sidebar && <button className="icon-button" onClick={() => setSidebar(true)}>☰</button>}<div className="global-search">⌕<input placeholder="Search anything…" value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button">◔<i/></button><button className="icon-button">♧</button><Avatar initials="JM" color="#8b5cf6"/></div></header>
      {view === "board" && <BoardView tasks={filtered} setTasks={setTasks} onAdd={() => setModal("task")} onShare={() => setModal("share")} onReminder={() => setModal("reminder")} dragged={dragged} setDragged={setDragged}/>} 
      {view === "directory" && <Directory query={directoryQuery} setQuery={setDirectoryQuery} onInvite={() => { notify("Invite copied to clipboard"); }}/>} 
      {view === "settings" && <Settings notify={notify}/>} 
    </main>
    {modal && <Modal type={modal} close={() => setModal(null)} taskTitle={taskTitle} setTaskTitle={setTaskTitle} addTask={addTask} notify={notify}/>} 
    {toast && <div className="toast"><b>✓</b>{toast}</div>}
  </div>;
}

function Avatar({ initials, color }: { initials: string; color: string }) { return <span className="avatar" style={{ background: color }}>{initials}</span>; }

function BoardView({ tasks, setTasks, onAdd, onShare, onReminder, dragged, setDragged }: any) {
  return <section className="content board-page"><div className="board-head"><div><div className="eyebrow">VSTUDIO HQ <span>/</span> BOARDS</div><h1>VTuber Launch <button>☆</button></h1><p>Everything we need to make launch day unforgettable.</p></div><div className="head-actions"><div className="avatar-stack"><Avatar initials="JM" color="#8b5cf6"/><Avatar initials="AK" color="#ec4899"/><Avatar initials="SL" color="#0ea5e9"/><span>+3</span></div><button className="secondary" onClick={onShare}>♙ Share</button><button className="primary" onClick={onAdd}>＋ Add task</button></div></div>
    <div className="board-tabs"><button className="active">▦ Board</button><button>☷ List</button><button>▥ Timeline</button><button>▣ Calendar</button><span/><button>⌁ Filter</button><button>⇅ Sort</button><button>•••</button></div>
    <div className="board-stats"><span><b>{tasks.length}</b> tasks</span><span><b>{tasks.filter((t:Task)=>t.status==="done").length}</b> completed</span><div className="progress"><i style={{width:`${Math.round(tasks.filter((t:Task)=>t.status==="done").length / Math.max(tasks.length,1)*100)}%`}}/></div><strong>{Math.round(tasks.filter((t:Task)=>t.status==="done").length / Math.max(tasks.length,1)*100)}%</strong><button className="reminder-link" onClick={onReminder}>◷ Set Discord reminder</button></div>
    <div className="kanban">{columns.map(col => <div className="column" key={col.id} onDragOver={e=>e.preventDefault()} onDrop={() => { if (dragged) setTasks((old:Task[])=>old.map(t=>t.id===dragged?{...t,status:col.id}:t)); setDragged(null); }}><div className="column-head"><span style={{background:col.color}}/>{col.label}<em>{tasks.filter((t:Task)=>t.status===col.id).length}</em><button>•••</button></div><div className="cards">{tasks.filter((t:Task)=>t.status===col.id).map((task:Task)=><TaskCard key={task.id} task={task} setDragged={setDragged}/>)}</div><button className="add-inline" onClick={onAdd}>＋ Add task</button></div>)}</div>
  </section>;
}

function TaskCard({ task, setDragged }: { task: Task; setDragged: (id:number)=>void }) { return <article className="task-card" draggable onDragStart={()=>setDragged(task.id)}><div className="card-top"><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><button>•••</button></div><h3>{task.title}</h3><span className="tag">{task.tag}</span><div className="card-foot"><Avatar initials={task.owner} color={task.owner==="JM"?"#8b5cf6":task.owner==="AK"?"#ec4899":"#0ea5e9"}/><span className="due">◷ {task.due}</span><span className="comments">◌ {task.comments}</span></div></article>; }

function Directory({query,setQuery,onInvite}:any) { const list=people.filter(p=>(p.name+p.user).toLowerCase().includes(query.toLowerCase())); return <section className="content directory"><div className="page-title"><div><div className="eyebrow">VSTUDIO HQ</div><h1>People</h1><p>Find teammates and manage workspace access.</p></div><button className="primary" onClick={onInvite}>＋ Invite people</button></div><div className="directory-tools"><div className="global-search">⌕<input placeholder="Search people by name or username…" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="secondary">All roles⌄</button></div><div className="people-grid">{list.map(p=><article className="person" key={p.user}><Avatar initials={p.initials} color={p.color}/><i className={p.online?"online":""}/><h3>{p.name}</h3><p>{p.user}</p><span>{p.role}</span><button className="secondary">View profile</button></article>)}</div></section>; }

function Settings({notify}:{notify:(s:string)=>void}) { const [connected,setConnected]=useState(false); return <section className="content settings"><div className="page-title"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h1>Integrations</h1><p>Connect your community tools and decide where Orbit sends updates.</p></div></div><div className="settings-card"><div className="discord-logo">☁</div><div><h2>Discord</h2><p>Link sign-in, members, and task reminders to your Discord server.</p></div><span className={connected?"connected":"not-connected"}>{connected?"● Connected":"Not connected"}</span></div><div className="settings-body"><div><h3>Discord account</h3><p>Use Discord as your primary identity. Local owner access remains available as a recovery option.</p></div><button className={connected?"secondary":"discord-button"} onClick={()=>{setConnected(!connected);notify(connected?"Discord disconnected":"Discord server connected")}}>{connected?"Disconnect":"Connect Discord"}</button></div><div className="settings-body"><div><h3>Bot reminders</h3><p>Send scheduled task reminders to channels the bot can access.</p><div className="channel-preview"><span>#</span><b>project-updates</b><small>Default reminder channel</small></div></div><button className="secondary" onClick={()=>notify("Bot configuration saved")}>Configure bot</button></div><div className="settings-body"><div><h3>Local sign-in</h3><p>Password access is enabled for one workspace owner. Invite-only registration is recommended.</p></div><span className="connected">● Enabled</span></div></section>; }

function Modal({type,close,taskTitle,setTaskTitle,addTask,notify}:any) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><button className="modal-close" onClick={close}>×</button>{type==="task"&&<><span className="modal-icon purple-bg">＋</span><h2>Create a task</h2><p>Add a new item to the Ideas column.</p><label>Task name<input autoFocus value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addTask()}} placeholder="What needs to be done?"/></label><div className="modal-row"><label>Status<select><option>Ideas</option><option>Ready</option><option>In progress</option></select></label><label>Priority<select><option>Medium</option><option>High</option><option>Low</option></select></label></div><button className="primary wide" onClick={addTask}>Create task</button></>}{type==="share"&&<><span className="modal-icon blue-bg">♙</span><h2>Share VTuber Launch</h2><p>Give a workspace member access to this board.</p><label>Search people<input autoFocus placeholder="Name or @username"/></label><div className="share-person"><Avatar initials="MR" color="#f59e0b"/><span><b>Morgan Rivers</b><small>@morgan</small></span><select><option>Can edit</option><option>Can view</option></select></div><button className="primary wide" onClick={()=>{close();notify("Board access updated")}}>Share board</button></>}{type==="reminder"&&<><span className="modal-icon discord-bg">#</span><h2>Schedule Discord reminder</h2><p>Send a board update through your server bot.</p><label>Channel<select><option># project-updates</option><option># vtuber-team</option><option># moderators</option></select></label><div className="modal-row"><label>Date<input type="date" defaultValue="2026-08-09"/></label><label>Time<input type="time" defaultValue="18:00"/></label></div><label>Message<textarea defaultValue="Heads up! VTuber Launch has tasks due soon. Check the board for details."/></label><button className="discord-button wide" onClick={()=>{close();notify("Discord reminder scheduled")}}>Schedule reminder</button></>}</div></div>; }
