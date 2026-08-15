import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PDFDocument } from 'pdf-lib'
import './styles.css'
import compressIcon from './assets/compress.png'
import convertIcon from './assets/convert.png'
import settingsIcon from './assets/settings.png'

const isTauri = () => '__TAURI_INTERNALS__' in window
const decodeBase64 = (encoded) => Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
const controls = [{ label: 'Compress', icon: compressIcon, panel: 'compress' }, { label: 'Convert', icon: convertIcon, panel: 'convert' }]
function Control({ label, icon, onClick, onMouseEnter, variant = '' }) { return <button className={`control ${variant}`} type="button" aria-label={label} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={onMouseEnter} onClick={onClick}><span className="icon"><img src={icon} alt="" /></span><span className="label">{label}</span></button> }
function DropPanel({ folder, incomingFile, visible }) {
  const [file, setFile] = useState(null)
  const [goal, setGoal] = useState('smallest')
  const [targetMb, setTargetMb] = useState(2)
  const [status, setStatus] = useState('')
  const inputRef = useRef(null)
  const receive = (nextFile) => {
    if (!nextFile || !(nextFile.type === 'application/pdf' || nextFile.name?.toLowerCase().endsWith('.pdf'))) { setStatus('Please choose a PDF file.'); return }
    setFile(nextFile); setStatus('Ready to compress.')
  }
  useEffect(() => { if (incomingFile) receive(incomingFile) }, [incomingFile])
  const compress = async () => {
    if (!file) return
    setStatus('Compressing…')
    try {
      const rawFile = file.path ? decodeBase64(await invoke('read_file', { path: file.path })) : await file.arrayBuffer()
      const document = await PDFDocument.load(rawFile, { ignoreEncryption: true })
      const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false })
      const filename = file.name.replace(/\\.pdf$/i, '') + '-compressed.pdf'
      if (isTauri()) await invoke('save_pdf', { folder, filename, bytes: Array.from(bytes) })
      setStatus(isTauri() ? `Saved to ${folder}` : 'Compression complete.')
    } catch (error) { setStatus(`Could not compress this PDF: ${error.message || error}`) }
  }
  return <section hidden={!visible} className="panel compression-panel" aria-label="Compress PDFs"><h1>Compress PDF</h1><p>Reduce file size while keeping links and form fields.</p><button className={`drop-zone compact ${file ? 'has-file' : ''}`} type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files[0]) }}><span>{file?.name || 'Drop a PDF here'}</span><small>{file ? 'Replace file' : 'or click to choose a file'}</small></button><input ref={inputRef} className="file-input" type="file" accept="application/pdf,.pdf" onChange={(event) => receive(event.target.files[0])} />{file && <button type="button" className="clear-file" onClick={() => { setFile(null); setStatus('') }}>Clear file</button>}<div className="compression-options"><span className="options-label">Compression goal</span><div className="goal-row"><button className={goal === 'smallest' ? 'selected' : ''} type="button" onClick={() => setGoal('smallest')}>Smallest possible</button><button className={goal === 'target' ? 'selected' : ''} type="button" onClick={() => setGoal('target')}>Target size</button>{goal === 'target' && <label className="target-size"><input type="number" min="1" value={targetMb} onChange={(event) => setTargetMb(event.target.value)} /> MB</label>}</div><label className="preserve-toggle"><input type="checkbox" checked readOnly /> Keep links &amp; form fields</label></div><button className="compress-action" type="button" disabled={!file || status === 'Compressing…'} onClick={compress}>{status === 'Compressing…' ? 'Compressing…' : 'Compress PDF'}</button>{status && <span className="compression-status">{status}</span>}</section>
}
function ConvertPanel({ folder, incomingFile, onFileChange, visible }) {
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
    } catch (error) { setStatus(error.message || String(error)) }
  }
  return <section hidden={!visible} className="panel convert-panel" aria-label="Convert files"><h1>Convert files</h1><p>Change image and video formats in a few clicks.</p><button className={`drop-zone compact ${file ? 'has-file' : ''}`} type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files[0]) }}><span>{file?.name || 'Drop a file here'}</span><small>{file ? 'Replace file' : 'HEIC, JPG, PNG, MOV, MP4'}</small></button><input ref={inputRef} className="file-input" type="file" accept="image/heic,image/heif,image/jpeg,image/png,video/quicktime,video/mp4,.heic,.heif,.mov,.mp4" onChange={(event) => receive(event.target.files[0])} />{file && <button type="button" className="clear-file" onClick={() => { setFile(null); setStatus(''); onFileChange(false) }}>Clear file</button>}<div className="conversion-options"><span className="options-label">Convert to</span><div className="format-row">{outputs.map((output) => <button key={output} className={format === output ? 'selected' : ''} type="button" onClick={() => setFormat(output)}>{output}</button>)}</div><div className="supported-note"><span>Image conversion is ready</span><strong>HEIC → PNG / JPG &nbsp;·&nbsp; JPG/PNG → HEIC</strong></div></div><button className="convert-action" type="button" disabled={!file || status === 'Converting…'} onClick={convert}>{status === 'Converting…' ? 'Converting…' : `Convert to ${format}`}</button>{status && <span className="compression-status">{status}</span>}</section>
}
function SettingsPanel({ folder, onChoose, alwaysOnTop, onAlwaysOnTopChange, visible }) { return <section hidden={!visible} className="panel settings-panel" aria-label="KiloFile settings"><h1>KiloFile</h1><p>Settings</p><div className="save-location"><span className="location-label">Save location</span><span className="location-path" title={folder}>{folder}</span><button type="button" className="choose-folder" onClick={onChoose}>Choose folder</button></div><label className="mode-toggle"><span><strong>Keep above other windows</strong><small>Keep KiloFile visible while you work.</small></span><span className="toggle-switch"><input type="checkbox" checked={alwaysOnTop} onChange={(event) => onAlwaysOnTopChange(event.target.checked)} /><span /></span></label></section> }
function App() {
  const [expanded, setExpanded] = useState(false); const [panel, setPanel] = useState(null); const [folder, setFolder] = useState('Downloads'); const [incomingFile, setIncomingFile] = useState(null); const [convertLocked, setConvertLocked] = useState(false); const [alwaysOnTop, setAlwaysOnTop] = useState(() => localStorage.getItem('pdf-squeeze-always-on-top') === 'true'); const navbarMode = false; const dragRef = useRef(null)
  useEffect(() => { if (isTauri()) invoke('default_output_folder').then(setFolder) }, [])
  useEffect(() => {
    if (isTauri()) invoke('set_always_on_top', { enabled: alwaysOnTop }).catch(console.error)
  }, [alwaysOnTop])
  const resize = async (width) => { if (isTauri()) await invoke('resize_window', { width }) }
  const setPillSize = async (next) => { if (panel || navbarMode) return; setExpanded(next); await resize(next ? 260 : 128) }
  const showPanel = async (nextPanel) => { setPanel(nextPanel); setExpanded(true); await resize(navbarMode ? 560 : 820) }
  const closePanel = async () => { setPanel(null); setExpanded(false); await resize(navbarMode ? 560 : 128) }
  const chooseFolder = async () => { if (!isTauri()) return; const chosen = await invoke('choose_output_folder'); if (chosen) setFolder(chosen) }
  const changeAlwaysOnTop = (enabled) => { setAlwaysOnTop(enabled); localStorage.setItem('pdf-squeeze-always-on-top', String(enabled)) }
  const beginDrag = async (event) => { if (event.button === 0 && isTauri()) await invoke('start_window_dragging') }
  const collapseOnLeave = () => { if (panel) closePanel(); else setPillSize(false) }
  useEffect(() => {
    if (!isTauri()) return undefined
    let unlisten
    getCurrentWindow().onDragDropEvent((event) => {
      const path = event.payload.type === 'enter' || event.payload.type === 'drop' ? event.payload.paths[0] : null
      if (!path) return
      const target = path.toLowerCase().endsWith('.pdf') ? 'compress' : 'convert'
      showPanel(target)
      if (event.payload.type === 'drop') setIncomingFile({ path, name: path.split('/').pop() })
    }).then((stop) => { unlisten = stop })
    return () => unlisten?.()
  }, [])
  const openTool = (tool) => ({ onMouseEnter: () => showPanel(tool), onClick: () => showPanel(tool) })
  return <main className="canvas"><div className="content-row" onMouseLeave={collapseOnLeave}><aside className={`pill ${expanded ? 'expanded' : ''}`} onMouseEnter={() => setPillSize(true)} onMouseDown={beginDrag} data-tauri-drag-region aria-label="PDF Squeeze tools"><div className="pill-top">{controls.map((control) => <Control key={control.label} {...control} {...openTool(control.panel)} />)}</div><div className="settings-area"><div className="divider" /><Control label="Settings" icon={settingsIcon} {...openTool('settings')} /></div></aside><DropPanel folder={folder} incomingFile={incomingFile} visible={panel === 'compress'} /><ConvertPanel folder={folder} incomingFile={incomingFile} onFileChange={setConvertLocked} visible={panel === 'convert'} /><SettingsPanel folder={folder} onChoose={chooseFolder} alwaysOnTop={alwaysOnTop} onAlwaysOnTopChange={changeAlwaysOnTop} visible={panel === 'settings'} /></div></main>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
