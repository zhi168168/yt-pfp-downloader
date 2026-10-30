import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from './icons.jsx';
import { AccountLink, accountAPI } from './Account.jsx';

const demoSizes = [1280,1080,900,800,720,500,400,240,88].map(size=>({size,width:size,height:size}));
function ProfileResult({ profile, onRefresh, busy, input, restoredSize }) {
  const [selected, setSelected] = useState(profile?.sizes[0]?.size || 800);
  const [shape, setShape] = useState('square');
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(false);
  const downloadRef = useRef();
  const dialogRef = useRef();
  const sizes = profile?.sizes || demoSizes;
  const choice = sizes.find(s=>s.size === selected) || sizes[0];
  const image = profile ? choice.imageUrl : '/images/example-youtube.jpg';
  useEffect(()=>{ setSelected(restoredSize || profile?.sizes[0]?.size || 800); setMessage(''); },[profile]);
  useEffect(()=>{
    if (!zoom) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    return ()=>{ if (dialog.open) dialog.close(); };
  },[zoom]);
  function signIn() {
    try { sessionStorage.setItem('ytpfp-download', JSON.stringify({input, size:choice.size, time:Date.now()})); } catch {}
    window.location.assign('/account?returnTo=%2F&download=1');
  }
  async function requireSession() {
    const session = await accountAPI('get-session');
    if (!session?.user) { signIn(); return false; }
    return true;
  }
  async function openImage(event) {
    event.preventDefault();
    try { if (await requireSession()) window.location.assign(choice.downloadUrl + '&inline=2'); }
    catch { setMessage('Sign-in service is temporarily unavailable. Please try again.'); }
  }
  async function download() {
    if (downloading || !profile) return;
    setDownloading(true); setMessage('');
    try {
      if (!await requireSession()) return;
      const response = await fetch(choice.downloadUrl, {credentials:'same-origin',cache:'no-store'});
      if (response.status === 401) { signIn(); return; }
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Download failed. Please try again.'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || `youtube-profile-${choice.width}x${choice.height}.jpg`;
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
      setMessage('Your image is ready. Check your browser’s downloads.');
    } catch (error) { setMessage(error.message || 'Could not download. Try Open image below.'); }
    finally { setDownloading(false); }
  }
  return <section className={`preview-panel ${busy ? 'is-busy' : ''}`} aria-labelledby="preview-title" aria-busy={busy}>
    <div className="panel-toolbar"><span id="preview-title" className="panel-title"><span className={`status-dot ${profile ? 'green' : ''}`}/>{profile ? 'Your profile picture' : 'Example preview'}</span><div className="segmented" role="group" aria-label="Preview shape">{['square','circle'].map(s=><button key={s} type="button" aria-pressed={shape===s} onClick={()=>setShape(s)}>{s==='square'?'Square':'Circle'}</button>)}</div></div>
    <div className="result-layout">
      <div className="avatar-stage"><button className="avatar-zoom" onClick={()=>setZoom(true)} aria-label="Enlarge profile picture"><img className={shape==='circle'?'circle':''} src={image} alt={`${profile?.name || 'YouTube'} profile picture${profile?'':' example'}`} width="280" height="280"/><span className="zoom-hint"><Icon name="picture"/> Click to enlarge</span></button></div>
      <div className="result-info"><div className="channel-heading"><div><h2>{profile?.name || 'YouTube'}</h2><p className="channel-handle">{profile?.handle || (profile ? 'Public YouTube channel' : '@YouTube')}</p></div>{profile && <a className="icon-button channel-external" href={profile.channelUrl} target="_blank" rel="noopener noreferrer" aria-label="View channel on YouTube"><Icon name="external"/></a>}</div>
        <div className="size-picker"><p id="choose-size" className="control-label">Choose your size</p><div className="size-options" role="group" aria-labelledby="choose-size">{sizes.map(s=><button key={s.size} aria-pressed={choice.size===s.size} onClick={()=>{setSelected(s.size);setMessage('');}}>{s.size}<span>px</span></button>)}</div></div>
        <p className="selected-dimensions">{profile ? `${choice.width} × ${choice.height} px · JPG` : 'Example · 800 × 800 px'}{profile && choice.size===sizes[0].size && <span className="largest-label">Largest available</span>}</p>
        {profile ? <><button ref={downloadRef} className="primary download-button" onClick={download} disabled={downloading || busy}><Icon name="download"/>{downloading?'Preparing image…':'Download JPG'}<span className="file-size">{Math.max(1,Math.round(choice.bytes/1024))} KB</span></button><div className="result-secondary"><a href={choice.downloadUrl + '&inline=2'} onClick={openImage}>Open image <Icon name="external"/></a><button onClick={onRefresh} disabled={busy}>Try another channel <Icon name="refresh"/></button></div></> : <div className="example-note"><Icon name="link"/><span>Enter a channel above to download<br className="desktop-break"/> its profile picture.</span></div>}
        <p className="download-message" role="status">{message}</p>
      </div>
    </div>
    <div className="panel-bottom"><Icon name="picture"/><span>{profile ? 'Sizes are checked against the image returned by YouTube. Larger sizes may be scaled.' : 'A preview of what’s waiting on the other side of your link.'}</span></div>
    {zoom && <dialog ref={dialogRef} className="image-dialog" onCancel={()=>setZoom(false)} onClick={e=>{if(e.target===e.currentTarget)setZoom(false);}}><button className="icon-button dialog-close" aria-label="Close enlarged preview" onClick={()=>setZoom(false)}><Icon name="close"/></button><img src={image} alt={`${profile?.name || 'YouTube'} enlarged profile picture`} className={shape==='circle'?'circle':''}/><p>{profile ? `${profile.name} · ${choice.width} × ${choice.height}` : 'Example · YouTube'}</p></dialog>}
  </section>;
}
function Downloader() {
  const [input,setInput] = useState('');
  const [restoredSize,setRestoredSize] = useState(null);
  const [profile,setProfile] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const inputRef = useRef();
  const abortRef = useRef();
  useEffect(()=>{
    try {
      const saved = JSON.parse(sessionStorage.getItem('ytpfp-download') || 'null');
      if (saved && Date.now()-saved.time < 86400000 && typeof saved.input === 'string') {
        setInput(saved.input); setRestoredSize(saved.size); lookup(saved.input);
      }
      sessionStorage.removeItem('ytpfp-download');
    } catch {}
    return ()=>abortRef.current?.abort();
  },[]);
  async function lookup(value = input) {
    if (!value.trim()) {setError('Paste a YouTube channel, @handle, or video link.'); inputRef.current?.focus(); return;}
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(true);setError('');setProfile(null);
    try {
      const response = await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:value.trim()}),signal:controller.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not fetch this profile. Please try again.');
      setProfile(result);
    } catch(e) { if(e.name!=='AbortError') setError(e.message || 'Connection failed. Please try again.'); }
    finally { if (abortRef.current===controller) setBusy(false); }
  }
  return <>
    <form className="lookup-form" onSubmit={e=>{e.preventDefault();lookup();}} aria-label="Find a YouTube profile picture"><label htmlFor="profile-input" className="sr-only">YouTube channel URL, @handle, or video link</label><div className="input-wrap"><Icon name="link"/><input ref={inputRef} id="profile-input" value={input} onChange={e=>{setInput(e.target.value);setError('');}} placeholder="Paste a YouTube URL or @handle" maxLength="2048" autoComplete="off" spellCheck="false" aria-invalid={Boolean(error)} aria-describedby={error?'lookup-error':'input-help'} disabled={busy}/>{input && !busy && <button type="button" className="clear-input" onClick={()=>{setInput('');inputRef.current?.focus();}} aria-label="Clear link"><Icon name="close"/></button>}</div><button className="primary fetch-button" disabled={busy} type="submit">{busy?<><span className="spinner"/>Fetching profile…</>:<>Get profile picture<Icon name="arrow"/></>}</button></form>
    <div className="form-meta" id="input-help"><span>Or try <button disabled={busy} onClick={()=>{setInput('@YouTube');lookup('@YouTube');}}>@YouTube</button></span><span className="assurances"><span>Free to use</span><i/> <span>Sign in to download</span><i/><span>9 image sizes</span></span></div>
    {error && <div className="lookup-error" id="lookup-error" role="alert"><span>{error}</span><button disabled={busy} onClick={()=>lookup()}>Try again <Icon name="refresh"/></button></div>}
    <div className="lookup-status sr-only" role="status">{busy?'Finding the channel and checking image sizes.':profile?`Found ${profile.name}. ${profile.sizes.length} image sizes available.`:''}</div>
    <ProfileResult input={input} restoredSize={restoredSize} profile={profile} busy={busy} onRefresh={()=>{setProfile(null);setRestoredSize(null);setInput('');setError('');inputRef.current?.focus();inputRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}}/>
  </>;
}
createRoot(document.getElementById('downloader')).render(<Downloader/>);
createRoot(document.getElementById('session-root')).render(<AccountLink/>);
