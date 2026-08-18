import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Terminal, ArrowRightLeft, Loader2, AlertCircle, 
  Folder, FileCode, CheckCircle, Plus, Trash2, Database,
  MessageSquare, Menu, Play, X, Globe, ExternalLink, Activity, ShieldAlert, History, Minimize2, Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function TypewriterText({ text, speed = 15 }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    setDisplayedText("");

    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(index));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span className="whitespace-pre-wrap">{displayedText}</span>;
}

export default function App() {
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState('');
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'Aegis production cluster links established.', agent_type: 'writer' }
  ]);
  const [input, setInput] = useState('');
  const [pendingPatch, setPendingPatch] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [testingSandbox, setTestingSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState(null);

  // Global Pipeline Macro-State Tracking
  const [currentPipelineStatus, setCurrentPipelineStatus] = useState('IDLE');

  // Deployment States
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);

  // Sidebar Left Navigation Tabs: 'files' | 'database' | 'history'
  const [sidebarTab, setSidebarTab] = useState('files');
  const [dbData, setDbData] = useState({});
  const [pipelineHistory, setPipelineHistory] = useState([]);

  // Bottom Console Tabs: 'terminal' | 'security'
  const [bottomTab, setBottomTab] = useState('terminal');
  const [auditVulnerabilities, setAuditVulnerabilities] = useState([]);
  const [auditing, setAuditing] = useState(false);
  const [showBottomDrawer, setShowBottomDrawer] = useState(false); 
  const [isBottomMinimized, setIsBottomMinimized] = useState(false); 

  // --- Dynamic Draggable Width & Height Metrics ---
  const [explorerWidth, setExplorerWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const [consoleHeight, setConsoleHeight] = useState(250);

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  // Cleanly normalizes chat headers to make sure "Lead Developer" always keeps its "L"
  const formatChatMessage = (rawContent) => {
    if (!rawContent) return "";
    return rawContent.replace(/^\[[^\]]+\]:\s*/, "");
  };

  // Draggable Resize Responders
  const startExplorerResize = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = explorerWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent) => {
      const newWidth = Math.max(160, Math.min(450, startWidth + (mouseMoveEvent.clientX - startX)));
      setExplorerWidth(newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const startChatResize = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = chatWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent) => {
      const newWidth = Math.max(220, Math.min(500, startWidth - (mouseMoveEvent.clientX - startX)));
      setChatWidth(newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const startConsoleResize = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startHeight = consoleHeight;
    const startY = mouseDownEvent.clientY;

    const doDrag = (mouseMoveEvent) => {
      const newHeight = Math.max(100, Math.min(600, startHeight - (mouseMoveEvent.clientY - startY)));
      setConsoleHeight(newHeight);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // WebSocket Connection Management
  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = 'ws://127.0.0.1:8000/ws/aegis/stream';
      socketRef.current = new WebSocket(wsUrl);

      socketRef.current.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          
          if (packet.type === 'STATE_CHANGE') {
            setCurrentPipelineStatus(packet.value);
            if (packet.value === 'SUCCESS' || packet.value === 'FAILED') {
              setTestingSandbox(false);
            }
            fetchDbMetadata();
            fetchPipelineHistory();
          } 
          
          else if (packet.type === 'TERMINAL_STREAM') {
            setSandboxResult((prev) => {
              const currentOutput = prev && prev.output && prev.output !== "Script completed with zero logs." 
                ? prev.output 
                : "";
              return {
                success: true,
                output: currentOutput + packet.value + "\n",
                error: null,
              };
            });
          }
        } catch (err) {
          console.error("Error parsing WebSocket packet:", err);
        }
      };

      socketRef.current.onclose = () => {
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const fetchDbMetadata = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/db/viewer');
      const data = await res.json();
      setDbData(data);
    } catch (err) {}
  };

  const fetchPipelineHistory = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/pipelines/history');
      const data = await res.json();
      setPipelineHistory(data);
    } catch (err) {}
  };

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/aegis/files');
        const data = await res.json();
        setFiles(data);
        const keys = Object.keys(data);
        if (keys.length > 0) setActiveFile(keys[0]);
      } catch (err) {
        setErrorMessage("Database sync error.");
      }
    };
    fetchWorkspace();
    fetchDbMetadata();
    fetchPipelineHistory();
  }, []);

  const currentCode = files[activeFile] || '';

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const setCodeForActiveFile = async (newVal) => {
    setFiles(prev => ({ ...prev, [activeFile]: newVal }));
    try {
      await fetch('http://127.0.0.1:8000/api/aegis/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: activeFile, content: newVal })
      });
      fetchDbMetadata();
    } catch (err) {}
  };

  const handleCreateFile = async () => {
    const filename = prompt("Enter file name:");
    if (!filename) return;
    const initialContent = `# New ${filename} module\n`;
    setFiles(prev => ({ ...prev, [filename]: initialContent }));
    setActiveFile(filename);
    try {
      await fetch('http://127.0.0.1:8000/api/aegis/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: initialContent })
      });
      fetchDbMetadata();
    } catch (err) {}
  };

  const handleDeleteFile = async (filename, e) => {
    e.stopPropagation();
    if (Object.keys(files).length <= 1) return;
    if (!confirm(`Delete ${filename}?`)) return;
    const newFiles = { ...files };
    delete newFiles[filename];
    setFiles(newFiles);
    if (activeFile === filename) setActiveFile(Object.keys(newFiles)[0]);
    setPendingPatch(null);
    try {
      await fetch('http://127.0.0.1:8000/api/aegis/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      fetchDbMetadata();
    } catch (err) {}
  };

  const handleDeployPipeline = async () => {
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/deploy', { method: 'POST' });
      const data = await res.json();
      setDeployResult(data);
      fetchPipelineHistory();
      fetchDbMetadata();
    } catch (err) {
      setDeployResult({ success: false, logs: "Pipeline connection failed." });
    } finally {
      setDeploying(false);
    }
  };

  const runCodeInSandbox = async () => {
    setTestingSandbox(true);
    setSandboxResult({ success: true, output: "", error: null });
    setPendingPatch(null);
    setBottomTab('terminal');
    setShowBottomDrawer(true); 
    setIsBottomMinimized(false); 
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_snapshot: currentCode })
      });
      const data = await res.json();
      
      if (!data.success) {
        setSandboxResult({ success: false, output: data.output, error: data.error });
        if (data.proposed_code) {
          setPendingPatch(data.proposed_code);
        }
        if (data.updated_history) {
          setMessages(data.updated_history);
        }
      } else {
        setSandboxResult({ success: true, output: data.output, error: null });
      }
      fetchPipelineHistory();
    } catch (err) {
      setSandboxResult({ success: false, error: "Sandbox server response timed out." });
    } finally {
      setTestingSandbox(false);
    }
  };

  const runSecurityAudit = async () => {
    setAuditing(true);
    setBottomTab('security');
    setShowBottomDrawer(true); 
    setIsBottomMinimized(false); 
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_snapshot: currentCode })
      });
      const data = await res.json();
      if (data.success) {
        setAuditVulnerabilities(data.vulnerabilities);
      } else {
        setAuditVulnerabilities([{ line: 0, severity: "HIGH", type: "Syntax Error", description: data.error }]);
      }
    } catch (err) {
      setAuditVulnerabilities([{ line: 0, severity: "HIGH", type: "Audit Error", description: "Failed to connect to backend audit service." }]);
    } finally {
      setAuditing(false);
    }
  };

  const handleChat = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isProcessing) return;
    setIsProcessing(true);
    const currentInput = input;
    setInput('');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/aegis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, code_snapshot: currentCode })
      });
      const data = await res.json();
      if (data.history) setMessages(data.history);
      if (data.proposed_code) setPendingPatch(data.proposed_code);
    } catch (err) {} finally { setIsProcessing(false); }
  };

  const applyPatch = () => {
    if (pendingPatch) {
      setCodeForActiveFile(pendingPatch);
      setPendingPatch(null);
    }
  };

  const lineCount = currentCode.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[#020202] text-gray-300 font-sans flex h-screen overflow-hidden selection:bg-indigo-500/20">
      
      {/* Explorer Sidebar (Draggable width) */}
      <motion.aside 
        style={{ width: showExplorer ? explorerWidth : 0 }} 
        animate={{ opacity: showExplorer ? 1 : 0 }} 
        className="border-r border-[#121212] flex flex-col bg-[#040404] h-full shrink-0 overflow-hidden relative"
      >
        <div className="p-4 border-b border-[#121212] flex justify-between items-center h-16 shrink-0">
          <h1 className="text-base font-black text-white tracking-tighter">AEGIS<span className="text-indigo-500">.</span></h1>
          
          <div className="flex gap-1.5 bg-neutral-950 border border-neutral-900 rounded-lg p-1 text-gray-500">
            <button onClick={() => setSidebarTab('files')} className={`p-1 rounded transition-all ${sidebarTab === 'files' ? 'text-indigo-400 bg-[#0e0e0e]' : 'hover:text-gray-300'}`} title="File Explorer"><Folder size={11} /></button>
            <button onClick={() => setSidebarTab('database')} className={`p-1 rounded transition-all ${sidebarTab === 'database' ? 'text-indigo-400 bg-[#0e0e0e]' : 'hover:text-gray-300'}`} title="Database Viewer"><Database size={11} /></button>
            <button onClick={() => setSidebarTab('history')} className={`p-1 rounded transition-all ${sidebarTab === 'history' ? 'text-indigo-400 bg-[#0e0e0e]' : 'hover:text-gray-300'}`} title="Pipeline Logs"><History size={11} /></button>
          </div>
        </div>

        <div className="p-3 flex-1 overflow-y-auto" style={{ width: explorerWidth }}>
          {sidebarTab === 'files' && (
            <>
              <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-gray-500 mb-3 uppercase">
                <span className="flex items-center gap-1.5"><Folder size={11} /> Workspace</span>
                <button onClick={handleCreateFile} className="hover:text-indigo-400 p-0.5 rounded text-gray-500"><Plus size={12} /></button>
              </div>
              <div className="space-y-0.5">
                {Object.keys(files).map((filename) => (
                  <div key={filename} onClick={() => { setActiveFile(filename); setPendingPatch(null); }} className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-mono cursor-pointer transition-all ${activeFile === filename ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-gray-500 hover:bg-[#0c0c0c] border border-transparent'}`}>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <FileCode size={12} className="shrink-0" />
                      <span className="truncate">{filename}</span>
                    </div>
                    <button onClick={(e) => handleDeleteFile(filename, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            </>
          )}

          {sidebarTab === 'database' && (
            <div className="space-y-4 font-mono text-[9px]">
              <div className="text-[9px] font-bold tracking-widest text-gray-500 mb-2 uppercase flex items-center gap-1.5">
                <Database size={11} /> Live SQLite Schema
              </div>
              {Object.keys(dbData).length === 0 ? (
                <div className="text-gray-600 italic">No tables found.</div>
              ) : (
                Object.entries(dbData).map(([tableName, data]) => (
                  <div key={tableName} className="border border-neutral-900 bg-neutral-950/40 rounded-md overflow-hidden">
                    <div className="bg-[#0b0b0b] px-2 py-1 border-b border-neutral-900 font-bold text-indigo-400 uppercase">
                      {tableName}
                    </div>
                    <div className="p-2 space-y-1.5">
                      <div className="text-[7.5px] text-gray-600">COLUMNS: {data.columns.join(', ')}</div>
                      <div className="max-h-20 overflow-y-auto space-y-0.5 scrollbar-thin">
                        {data.rows.map((row, idx) => (
                          <div key={idx} className="bg-neutral-950 p-1 border border-neutral-900/40 rounded text-gray-400 whitespace-nowrap overflow-x-auto">
                            {JSON.stringify(row)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {sidebarTab === 'history' && (
            <div className="space-y-3 font-mono text-[10px]">
              <div className="text-[9px] font-bold tracking-widest text-gray-500 mb-1.5 uppercase flex items-center gap-1.5">
                <History size={11} /> Pipeline History
              </div>
              <div className="space-y-1.5">
                {pipelineHistory.length === 0 ? (
                  <div className="text-gray-600 italic">No runs logged.</div>
                ) : (
                  pipelineHistory.map((pipeline) => (
                    <div key={pipeline.id} className="border border-neutral-900 bg-neutral-950/20 p-2 rounded-md space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Node #{pipeline.id}</span>
                        <span className={`text-[8.5px] px-1 py-0.2 rounded font-bold ${pipeline.status === 'SUCCESS' || pipeline.status === 'DEPLOY_SUCCESS' ? 'text-emerald-400 bg-emerald-950/10' : 'text-red-400 bg-red-950/10'}`}>
                          {pipeline.status}
                        </span>
                      </div>
                      {pipeline.repo_url && (
                        <a href={pipeline.repo_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline flex items-center gap-1 text-[8.5px] truncate">
                          View Code <ExternalLink size={7} />
                        </a>
                      )}
                      <div className="text-[8px] text-gray-600 text-right">{pipeline.last_updated}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Drag handle line inside files sidebar */}
        {showExplorer && (
          <div 
            onMouseDown={startExplorerResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/30 transition-colors z-50 border-r border-[#1a1a1a]"
          />
        )}
      </motion.aside>

      {/* Code Editor */}
      <main className="flex-1 flex flex-col h-full bg-[#030303] overflow-hidden">
        <div className="h-16 border-b border-[#121212] flex items-center px-6 justify-between text-xs text-gray-500 font-mono bg-[#040404] shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowExplorer(!showExplorer)} className={`p-2 rounded-lg border transition-all ${showExplorer ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'border-gray-900 text-gray-600'}`}><Menu size={14} /></button>
            <button onClick={() => setShowChat(!showChat)} className={`p-2 rounded-lg border transition-all ${showChat ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'border-gray-900 text-gray-600'}`}><MessageSquare size={14} /></button>
            <span className="flex items-center gap-2 text-indigo-400 border-l border-gray-900 pl-4"><FileCode size={14} /> {activeFile || "No File"}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={runSecurityAudit} disabled={auditing || !activeFile} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#090909] border border-gray-900 text-gray-400 hover:text-white font-semibold rounded-lg text-xs disabled:opacity-50">
              {auditing ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />} Audit Workspace
            </button>

            <button onClick={runCodeInSandbox} disabled={testingSandbox || !activeFile} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#090909] border border-gray-900 text-gray-400 hover:text-white font-semibold rounded-lg text-xs disabled:opacity-50">
              {testingSandbox ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />} Run Sandbox
            </button>
            
            <button 
              onClick={handleDeployPipeline}
              disabled={deploying}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-black font-bold rounded-lg text-xs transition-colors disabled:opacity-50 shadow-md"
            >
              {deploying ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
              Ship Production
            </button>
          </div>
        </div>
        
        {/* CRITICAL LAYOUT FIX: Added min-h-0 to editor viewport container to allow panels to shrink */}
        <div className="flex-1 flex relative overflow-hidden bg-[#020202]/50 min-h-0">
          <div ref={lineNumbersRef} className="w-12 select-none border-r border-[#121212] text-right pr-3 pt-8 font-mono text-xs text-gray-700 overflow-hidden leading-relaxed">
            {lineNumbers.map((num) => <div key={num} className="h-5">{num}</div>)}
          </div>
          <textarea ref={textareaRef} onScroll={handleScroll} className="flex-1 bg-transparent p-8 pl-4 font-mono text-xs outline-none resize-none text-slate-100 leading-relaxed overflow-y-auto" value={currentCode} onChange={(e) => setCodeForActiveFile(e.target.value)} disabled={!activeFile} />
        </div>

        {/* Console / Refactor Panels / Deployment Outputs */}
        <AnimatePresence>
          {deployResult && (
            <motion.div initial={{ height: 0 }} animate={{ height: "30%" }} exit={{ height: 0 }} className="border-t border-[#121212] bg-[#040404] flex flex-col font-mono text-xs overflow-hidden shrink-0">
              <div className="h-10 border-b border-[#121212] bg-[#070707] flex items-center justify-between px-6 shrink-0">
                <span className={`font-bold flex items-center gap-2 ${deployResult.success ? 'text-indigo-400' : 'text-red-400'}`}>
                  <Globe size={12} /> {deployResult.success ? 'DEPLOYMENT SUCCESSFUL' : 'PIPELINE RUNTIME REJECTED'}
                </span>
                <button onClick={() => setDeployResult(null)} className="text-gray-600 hover:text-gray-400"><X size={14} /></button>
              </div>
              <div className="flex-1 p-5 overflow-y-auto bg-[#020202] text-slate-400 whitespace-pre-wrap flex flex-col justify-between">
                <p>{deployResult.logs}</p>
                {deployResult.success && (
                  <div className="mt-2 p-3 bg-indigo-950/10 border border-indigo-950/30 rounded-xl flex items-center justify-between">
                    <span className="text-indigo-300 font-semibold truncate">{deployResult.url}</span>
                    <a href={deployResult.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-400 text-black font-bold px-3 py-1 rounded-md text-[10px]">
                      Open App <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {showBottomDrawer && (
            <motion.div 
              initial={{ height: 0 }} 
              style={{ height: isBottomMinimized ? "40px" : consoleHeight }} 
              exit={{ height: 0 }} 
              className="border-t border-[#121212] bg-[#050505] flex flex-col font-mono text-xs overflow-hidden shrink-0 transition-all duration-200 relative"
            >
              {/* Drag handle line on top of the bottom console */}
              {!isBottomMinimized && (
                <div 
                  onMouseDown={startConsoleResize}
                  className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-indigo-500/30 transition-colors z-50 border-t border-[#1a1a1a]"
                />
              )}

              <div className="h-10 border-b border-[#121212] bg-[#080808] flex items-center justify-between px-6 shrink-0 select-none">
                <div className="flex gap-4">
                  <button onClick={() => { setBottomTab('terminal'); setIsBottomMinimized(false); }} className={`font-bold flex items-center gap-2 ${bottomTab === 'terminal' ? 'text-indigo-400 border-b-2 border-indigo-500 pb-1' : 'text-gray-500'}`}>
                    <Terminal size={12} /> TERMINAL OUT
                  </button>
                  <button onClick={() => { setBottomTab('security'); setIsBottomMinimized(false); }} className={`font-bold flex items-center gap-2 ${bottomTab === 'security' ? 'text-indigo-400 border-b-2 border-indigo-500 pb-1' : 'text-gray-500'}`}>
                    <ShieldAlert size={12} /> SAST COMPLIANCE
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsBottomMinimized(!isBottomMinimized)} className="text-gray-600 hover:text-gray-400">
                    {isBottomMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                  </button>
                  <button onClick={() => { setShowBottomDrawer(false); setCurrentPipelineStatus('IDLE'); }} className="text-gray-600 hover:text-gray-400"><X size={14} /></button>
                </div>
              </div>

              {!isBottomMinimized && (
                <div className="flex-1 p-6 overflow-y-auto bg-[#020202] text-slate-300 scrollbar-thin">
                  {bottomTab === 'terminal' ? (
                    sandboxResult && sandboxResult.error ? (
                      <span className="text-red-400 font-semibold whitespace-pre-wrap">{sandboxResult.error}</span>
                    ) : (
                      <span className="font-mono text-[11px] whitespace-pre-wrap">{sandboxResult ? sandboxResult.output : "Sandbox idle. Execute workspace scripts above."}</span>
                    )
                  ) : (
                    <div className="space-y-3 font-mono text-xs">
                      {auditVulnerabilities.length === 0 ? (
                        <span className="text-emerald-400 font-semibold">No static security vulnerabilities flagged inside workspace modules. Secure architecture verified!</span>
                      ) : (
                        auditVulnerabilities.map((vuln, idx) => (
                          <div key={idx} className="border border-red-950/20 bg-red-950/5 p-3 rounded-lg flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-red-400 font-extrabold bg-red-950/10 px-2 py-0.5 rounded text-[10px]">
                                  {vuln.severity}
                                </span>
                                <span className="text-white font-bold">{vuln.type}</span>
                                <span className="text-gray-600">Line {vuln.line}</span>
                              </div>
                              <p className="text-gray-400 text-[11px] leading-relaxed">{vuln.description}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {pendingPatch && (
            <motion.div initial={{ height: 0 }} animate={{ height: "35%" }} exit={{ height: 0 }} className="border-t border-[#121212] bg-[#050505] flex flex-col overflow-hidden shrink-0">
              <div className="h-12 border-b border-[#121212] flex items-center justify-between px-6 bg-[#070707] shrink-0">
                <span className="text-xs font-mono font-semibold text-indigo-400 flex items-center gap-2"><ArrowRightLeft size={14} /> AUTOMATIC CRASH REPAIR DRAFT</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPendingPatch(null)} className="text-xs bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg">Reject</button>
                  <button type="button" onClick={applyPatch} className="text-xs bg-indigo-500 hover:bg-indigo-400 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors">Apply Fix</button>
                </div>
              </div>
              <pre className="flex-1 p-6 font-mono text-xs text-slate-300 overflow-y-auto leading-relaxed bg-[#020202]">{pendingPatch}</pre>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* AI Assistant Sidebar (Draggable width) */}
      <motion.aside 
        style={{ width: showChat ? chatWidth : 0 }} 
        animate={{ opacity: showChat ? 1 : 0 }} 
        className="border-l border-[#121212] flex flex-col bg-[#060606] h-full shrink-0 overflow-hidden relative"
      >
        {/* Drag handle line on the left edge of chat sidebar */}
        {showChat && (
          <div 
            onMouseDown={startChatResize}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/30 transition-colors z-50 border-l border-[#1a1a1a]"
          />
        )}

        <div className="p-3 border-b border-[#121212] flex items-center justify-between text-[11px] font-mono text-gray-500 h-16 shrink-0" style={{ width: chatWidth }}>
          <span>SECURE AUDIT FEED</span>
          <span className="flex items-center gap-1 text-indigo-500 font-bold text-[9px]"><CheckCircle size={9} /> PIPELINE VERIFIED</span>
        </div>

        <div className="bg-[#090909] p-3 border-b border-[#121212] font-mono text-[10px]" style={{ width: chatWidth }}>
          <div className="flex items-center gap-1.5 text-gray-400 font-bold mb-1.5">
            <Activity size={11} className={currentPipelineStatus !== 'IDLE' && currentPipelineStatus !== 'SUCCESS' && currentPipelineStatus !== 'FAILED' ? "text-indigo-400 animate-pulse" : "text-gray-600"} />
            ORCHESTRATION PIPELINE STATUS
          </div>
          <div className="bg-[#030303] border border-gray-900 rounded-md p-1.5 flex items-center justify-between">
            <span className="text-gray-500">Active Node:</span>
            <span className={`font-extrabold tracking-wide ${currentPipelineStatus === 'SUCCESS' ? 'text-emerald-400' : currentPipelineStatus === 'FAILED' ? 'text-red-400' : 'text-indigo-400'}`}>
              {currentPipelineStatus}
            </span>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto font-mono text-[11px]" style={{ width: chatWidth }}>
          {messages.map((m, i) => {
            const isLatestAgentMessage = m.role === 'agent' && i === messages.length - 1;
            return (
              <div key={i} className={`p-3 rounded-lg border ${m.role === 'agent' ? 'border-indigo-950/20 bg-indigo-950/5 text-indigo-300' : 'border-gray-900 bg-gray-950/50 text-white'}`}>
                <div className="flex items-center justify-between mb-1.5 border-b border-gray-900/40 pb-1 text-[8.5px] font-bold tracking-widest text-gray-500">
                  <span>{m.role === 'agent' ? 'AEGIS' : 'OPERATOR'}</span>
                  {m.agent_type && <span className="text-indigo-500 font-extrabold">{String(m.agent_type).toUpperCase()}</span>}
                </div>
                {isLatestAgentMessage ? (
                  <TypewriterText text={formatChatMessage(m.content)} />
                ) : (
                  <p className="leading-relaxed whitespace-pre-line">{formatChatMessage(m.content)}</p>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={handleChat} className="p-3 border-t border-[#121212] bg-[#030303] shrink-0" style={{ width: chatWidth }}>
          <div className="flex items-center gap-1.5 bg-[#090909] border border-gray-900 px-3 py-2.5 rounded-lg">
            <input type="text" className="flex-1 bg-transparent outline-none font-mono text-[11px] text-white placeholder-gray-700" placeholder={`Ask about ${activeFile || 'Aegis'}...`} value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="text-indigo-500"><Send size={14} /></button>
          </div>
        </form>
      </motion.aside>
    </div>
  );
}