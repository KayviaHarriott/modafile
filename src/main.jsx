import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './styles.css'
import compressIcon from './assets/compress.png'
import convertIcon from './assets/convert.png'
import settingsIcon from './assets/settings.png'

const isTauri = () => '__TAURI_INTERNALS__' in window
const controls = [{ label: 'Compress', icon: compressIcon, panel: 'compress' }, { label: 'Convert', icon: convertIcon, panel: 'convert' }]
function Control({ label, icon, onClick, onMouseEnter, onMouseLeave, completed = false, dragActive = false, variant = '' }) { return <button className={`control ${variant} ${dragActive ? 'drag-target' : ''}`} type="button" aria-label={label} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onClick}><span className="icon"><img src={icon} alt="" />{completed && <i className="completion-dot" />}</span><span className="label">{label}</span></button> }
function DropPanel({ folder, incomingFile, visible, autoCompress, preserveMetadata, onComplete }) {
  const [file, setFile] = useState(null)
  const [goal, setGoal] = useState('smallest')
  const [targetMb, setTargetMb] = useState(2)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [completedFiles, setCompletedFiles] = useState([])
  const inputRef = useRef(null)
  const autoStartedRef = useRef(null)
  const receive = (nextFile) => {
    if (!nextFile || !(nextFile.type === 'application/pdf' || nextFile.name?.toLowerCase().endsWith('.pdf'))) { setStatus('Please choose a PDF file.'); return }
    setFile(nextFile); setStatus('Ready to compress.')
  }
  useEffect(() => { if (incomingFile) receive(incomingFile) }, [incomingFile])
  const compress = async () => {
    if (!file) return
    setStatus('Compressing…')
    setProgress(12)
    const progressTimer = window.setInterval(() => setProgress((value) => Math.min(value + 11, 88)), 220)
    try {
      if (!isTauri() || !file.path) throw new Error('Please use the KiloFile macOS app to compress PDFs.')
      const result = await invoke('compress_pdf', { inputPath: file.path, folder, targetMb: goal === 'target' ? Number(targetMb) : null, preserveMetadata })
      setStatus(result.targetMet ? `Saved: ${result.path}` : `Saved smallest version: ${result.path}`)
      setProgress(100)
      setCompletedFiles((items) => [{ path: result.path, name: result.path.split('/').pop(), originalSize: result.originalSize, outputSize: result.outputSize }, ...items].slice(0, 3))
      onComplete?.('PDF compressed', result.path)
    } catch (error) { setStatus(`Could not compress this PDF: ${error.message || error}`); setProgress(0) } finally { window.clearInterval(progressTimer) }
  }
  useEffect(() => { if (autoCompress && incomingFile?.path && file?.path === incomingFile.path && autoStartedRef.current !== incomingFile.path) { autoStartedRef.current = incomingFile.path; compress() } }, [incomingFile, file, autoCompress])
  const size = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes > 9_000_000 ? 1 : 2)} MB`
  return <section hidden={!visible} className="panel compression-panel" aria-label="Compress files"><header className="compress-header"><h1>Compress Files</h1><p>Reduce a PDF while keeping links, form fields, and the document’s quality intact.</p></header><div className="compress-rule" /><button className={`drop-zone compact ${file ? 'has-file' : ''}`} title="Supported format: PDF" type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files[0]) }}><i className="upload-glyph" aria-hidden="true">⇧</i><span>{file?.name || <>Drag and drop a file here or <u>Choose file</u></>}</span><small>{file ? 'Click to replace this PDF' : 'PDF files only'}</small></button><input ref={inputRef} className="file-input" type="file" accept="application/pdf,.pdf" onChange={(event) => receive(event.target.files[0])} /><p className="format-note">Supported format: PDF · Links and forms are preserved</p>{file && <button type="button" className="clear-file" onClick={() => { setFile(null); setStatus(''); setProgress(0) }}>Clear file</button>}<button className="compress-action primary-action" type="button" disabled={!file || status === 'Compressing…'} onClick={compress}>{status === 'Compressing…' ? 'Compressing…' : 'Compress PDF'}</button><div className="compression-options"><span className="options-label">Compression goal</span><div className="goal-row"><button className={goal === 'smallest' ? 'selected' : ''} type="button" onClick={() => setGoal('smallest')}>Smallest possible</button><button className={goal === 'target' ? 'selected' : ''} type="button" onClick={() => setGoal('target')}>Target size</button><label className={`target-size ${goal !== 'target' ? 'disabled' : ''}`}><input type="number" min="1" value={targetMb} disabled={goal !== 'target'} onChange={(event) => setTargetMb(event.target.value)} /> MB</label></div></div>{status === 'Compressing…' && <div className="progress-wrap"><span>Compressing PDF</span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>}<div className="completed-files"><span className="options-label">Recent outputs</span>{completedFiles.length ? completedFiles.map((item) => <div className="completed-file" key={item.path}><b>PDF</b><span><strong>{item.name}</strong><small>{size(item.outputSize)} · {Math.max(0, Math.round((1 - item.outputSize / item.originalSize) * 100))}% smaller</small></span><button type="button" title="Show in Finder" aria-label="Show in Finder" onClick={() => invoke('reveal_in_finder', { path: item.path })}>⌁</button></div>) : <small className="empty-completed">Compressed files will appear here.</small>}</div>{status && status !== 'Compressing…' && <span className="compression-status">{status}</span>}</section>
}
function ConvertPanel({ folder, incomingFile, onFileChange, visible, onComplete }) {
  const [file, setFile] = useState(null)
  const [format, setFormat] = useState('PNG')
  const [status, setStatus] = useState('')
  const inputRef = useRef(null)
  const extension = file?.name?.split('.').pop()?.toLowerCase()
  const isVideo = extension === 'mov' || extension === 'mp4' || extension === 'm4v'
  const receive = (nextFile) => { if (nextFile) { setFile(nextFile); onFileChange(true); setFormat(['heic', 'heif'].includes(nextFile.name.split('.').pop()?.toLowerCase()) ? 'PNG' : nextFile.name.split('.').pop()?.toLowerCase() === 'mov' ? 'MP4' : 'JPG') } }
  useEffect(() => { if (incomingFile) receive(incomingFile) }, [incomingFile])
  const outputs = isVideo ? ['MP4', 'MOV'] : ['PNG', 'JPG', 'HEIC']
  const convert = async () => {
    if (!file) return
    setStatus('Converting…')
    try {
      const output = file.path ? await invoke('convert_file', { inputPath: file.path, folder, format }) : await invoke('convert_uploaded_file', { filename: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())), folder, format })
      setStatus(`Saved: ${output}`)
      onComplete?.('File converted', output)
    } catch (error) { setStatus(error.message || String(error)) }
  }
  return <section hidden={!visible} className="panel convert-panel" aria-label="Convert files"><h1>Convert files</h1><p>Change image and video formats in a few clicks.</p><button className={`drop-zone compact ${file ? 'has-file' : ''}`} type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files[0]) }}><span>{file?.name || 'Drop a file here'}</span><small>{file ? 'Replace file' : 'HEIC, JPG, PNG, MOV, MP4'}</small></button><input ref={inputRef} className="file-input" type="file" accept="image/heic,image/heif,image/jpeg,image/png,video/quicktime,video/mp4,.heic,.heif,.mov,.mp4" onChange={(event) => receive(event.target.files[0])} />{file && <button type="button" className="clear-file" onClick={() => { setFile(null); setStatus(''); onFileChange(false) }}>Clear file</button>}<div className="conversion-options"><span className="options-label">Convert to</span><div className="format-row">{outputs.map((output) => <button key={output} className={format === output ? 'selected' : ''} type="button" onClick={() => setFormat(output)}>{output}</button>)}</div><div className="supported-note"><span>Image conversion is ready</span><strong>HEIC → PNG / JPG &nbsp;·&nbsp; JPG/PNG → HEIC</strong></div></div><button className="convert-action" type="button" disabled={!file || status === 'Converting…'} onClick={convert}>{status === 'Converting…' ? 'Converting…' : `Convert to ${format}`}</button>{status && <span className="compression-status">{status}</span>}</section>
}
function SettingToggle({ title, detail, checked, onChange }) { return <div className="mode-toggle" title={detail}><span><strong>{title}</strong></span><button className={`toggle-switch ${checked ? 'is-on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)}><i /></button></div> }
function SettingsPanel({ folder, onChoose, alwaysOnTop, onAlwaysOnTopChange, preferences, onPreferenceChange, theme, onThemeToggle, visible }) { return <section hidden={!visible} className="panel settings-panel" aria-label="KiloFile settings"><div className="settings-heading"><h1>KiloFile</h1><button className="theme-toggle" type="button" onClick={onThemeToggle} aria-label="Toggle light and dark mode">{theme === 'dark' ? '☀' : '☾'}</button></div><div className="save-location"><span className="location-label">Save location</span><span className="location-path" title={folder}>{folder}</span><button type="button" className="choose-folder" onClick={onChoose}>Choose folder</button></div><div className="settings-list"><SettingToggle title="Keep above other windows" detail="Focus KiloFile when you hover over it." checked={alwaysOnTop} onChange={onAlwaysOnTopChange} /><SettingToggle title="Auto-compress dropped PDFs" detail="Start compression immediately after dropping a PDF." checked={preferences.autoCompress} onChange={(value) => onPreferenceChange('autoCompress', value)} /><SettingToggle title="Reveal completed files" detail="Show the saved file in Finder after each job." checked={preferences.revealInFinder} onChange={(value) => onPreferenceChange('revealInFinder', value)} /><SettingToggle title="Completion notification" detail="Show a macOS notification and green completion light." checked={preferences.completionNotification} onChange={(value) => onPreferenceChange('completionNotification', value)} /><SettingToggle title="Preserve metadata" detail="Keep PDF document metadata when compressing." checked={preferences.preserveMetadata} onChange={(value) => onPreferenceChange('preserveMetadata', value)} /><SettingToggle title="Launch KiloFile at login" detail="Open KiloFile automatically when you sign in." checked={preferences.launchAtLogin} onChange={(value) => onPreferenceChange('launchAtLogin', value)} /><SettingToggle title="Reduce motion" detail="Minimize interface animations." checked={preferences.reduceMotion} onChange={(value) => onPreferenceChange('reduceMotion', value)} /></div></section> }
function WindowControls() { const stop = (event) => event.stopPropagation(); return <div className="window-controls" aria-label="Window controls" onMouseDown={stop} onPointerDown={stop}><button className="window-control close" type="button" aria-label="Close KiloFile" onClick={() => invoke('close_window').catch(console.error)} /><button className="window-control minimize" type="button" aria-label="Minimize KiloFile" onClick={() => invoke('minimize_window').catch(console.error)} /></div> }
function App() {
  const [expanded, setExpanded] = useState(false); const [panel, setPanel] = useState(null); const [folder, setFolder] = useState('Downloads'); const [incomingCompressFile, setIncomingCompressFile] = useState(null); const [incomingConvertFile, setIncomingConvertFile] = useState(null); const [convertLocked, setConvertLocked] = useState(false); const [alwaysOnTop, setAlwaysOnTop] = useState(() => localStorage.getItem('pdf-squeeze-always-on-top') === 'true'); const [theme, setTheme] = useState(() => localStorage.getItem('kilofile-theme') || 'dark'); const [dragTarget, setDragTarget] = useState(null); const [preferences, setPreferences] = useState(() => ({ autoCompress: localStorage.getItem('kilofile-auto-compress') === 'true', revealInFinder: localStorage.getItem('kilofile-reveal') === 'true', completionNotification: localStorage.getItem('kilofile-notification') === 'true', preserveMetadata: localStorage.getItem('kilofile-metadata') !== 'false', launchAtLogin: localStorage.getItem('kilofile-login') === 'true', reduceMotion: localStorage.getItem('kilofile-reduce-motion') === 'true' })); const [completionTool, setCompletionTool] = useState(null); const navbarMode = false; const dragRef = useRef(null); const panelTimer = useRef(null)
  useEffect(() => { if (isTauri()) invoke('default_output_folder').then(setFolder) }, [])
  useEffect(() => {
    if (isTauri()) invoke('set_always_on_top', { enabled: alwaysOnTop }).catch(console.error)
  }, [alwaysOnTop])
  const resize = async (width, height = 520) => { if (isTauri()) await invoke('resize_window', { width, height }) }
  const setPillSize = async (next) => { if (panel || navbarMode) return; setExpanded(next); await resize(next ? 260 : 128) }
  const showPanel = async (nextPanel) => { setPanel(nextPanel); setExpanded(true); await resize(navbarMode ? 560 : 820, 620) }
  const closePanel = async () => { setPanel(null); setExpanded(false); await resize(navbarMode ? 560 : 128) }
  const cancelPanelClose = () => { if (panelTimer.current) window.clearTimeout(panelTimer.current) }
  const schedulePanelClose = () => { cancelPanelClose(); panelTimer.current = window.setTimeout(closePanel, 170) }
  const chooseFolder = async () => { if (!isTauri()) return; const chosen = await invoke('choose_output_folder'); if (chosen) setFolder(chosen) }
  const changeAlwaysOnTop = (enabled) => { setAlwaysOnTop(enabled); localStorage.setItem('pdf-squeeze-always-on-top', String(enabled)) }
  const changePreference = (key, value) => { setPreferences((current) => ({ ...current, [key]: value })); const storageKeys = { autoCompress: 'kilofile-auto-compress', revealInFinder: 'kilofile-reveal', completionNotification: 'kilofile-notification', preserveMetadata: 'kilofile-metadata', launchAtLogin: 'kilofile-login', reduceMotion: 'kilofile-reduce-motion' }; localStorage.setItem(storageKeys[key], String(value)); if (key === 'launchAtLogin' && isTauri()) invoke('set_launch_at_login', { enabled: value }).catch(console.error) }
  const complete = (tool) => (title, path) => { setCompletionTool(tool); window.setTimeout(() => setCompletionTool(null), 3500); if (preferences.revealInFinder && isTauri()) invoke('reveal_in_finder', { path }).catch(console.error); if (preferences.completionNotification && isTauri()) invoke('show_completion_notification', { title, body: path.split('/').pop() }).catch(console.error) }
  const beginDrag = async (event) => { if (event.button === 0 && isTauri()) await invoke('start_window_dragging') }
  const collapseOnLeave = () => { if (panel) closePanel(); else setPillSize(false) }
  useEffect(() => {
    if (!isTauri()) return undefined
    let unlisten
    getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'leave') { setDragTarget(null); return }
      const path = event.payload.type === 'enter' || event.payload.type === 'drop' ? event.payload.paths[0] : null
      if (!path) return
      const target = path.toLowerCase().endsWith('.pdf') ? 'compress' : 'convert'
      setDragTarget(target)
      showPanel(target)
      if (event.payload.type === 'drop') { const droppedFile = { path, name: path.split('/').pop() }; if (target === 'compress') setIncomingCompressFile(droppedFile); else setIncomingConvertFile(droppedFile) }
      if (event.payload.type === 'drop') setDragTarget(null)
    }).then((stop) => { unlisten = stop })
    return () => unlisten?.()
  }, [])
  const openTool = (tool) => ({ onMouseEnter: () => { cancelPanelClose(); showPanel(tool) }, onMouseLeave: schedulePanelClose })
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('kilofile-theme', next) }
  return <main className={`canvas ${theme} ${preferences.reduceMotion ? 'reduce-motion' : ''}`} onMouseEnter={() => { if (alwaysOnTop && isTauri()) invoke('focus_window').catch(console.error) }}><WindowControls /><div className="content-row" onMouseLeave={collapseOnLeave}><aside className={`pill ${expanded ? 'expanded' : ''}`} onMouseEnter={() => setPillSize(true)} onMouseDown={beginDrag} data-tauri-drag-region aria-label="PDF Squeeze tools"><div className="pill-top">{controls.map((control) => <Control key={control.label} {...control} dragActive={dragTarget === control.panel} completed={completionTool === control.panel} {...openTool(control.panel)} />)}</div><div className="settings-area"><div className="divider" /><Control label="Settings" icon={settingsIcon} {...openTool('settings')} /></div></aside><div className="panel-host" onMouseEnter={cancelPanelClose} onMouseLeave={schedulePanelClose}><DropPanel folder={folder} incomingFile={incomingCompressFile} visible={panel === 'compress'} autoCompress={preferences.autoCompress} preserveMetadata={preferences.preserveMetadata} onComplete={complete('compress')} /><ConvertPanel folder={folder} incomingFile={incomingConvertFile} onFileChange={setConvertLocked} visible={panel === 'convert'} onComplete={complete('convert')} /><SettingsPanel folder={folder} onChoose={chooseFolder} alwaysOnTop={alwaysOnTop} onAlwaysOnTopChange={changeAlwaysOnTop} preferences={preferences} onPreferenceChange={changePreference} theme={theme} onThemeToggle={toggleTheme} visible={panel === 'settings'} /></div></div></main>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
