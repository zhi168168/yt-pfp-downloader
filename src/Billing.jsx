import React, {useEffect,useState} from 'react';
import {plans} from '../billing/plans.mjs';
import './billing.css';

export async function billingAPI(path,body) {
  const response = await fetch(`/api/billing/${path}`,{method:body === undefined ? 'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:body === undefined ? {}:{'Content-Type':'application/json'},body:body === undefined ? undefined:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
  const result = await response.json().catch(()=>null);
  if (!response.ok) { const error = new Error(result?.error || 'Billing service is unavailable. Please try again.'); error.status=response.status; throw error; }
  return result;
}
export function UsageLine({usage}) {
  return <div className="usage-line"><span>{plans[usage.plan]?.name || 'Free'} · {usage.used} / {usage.dailyLimit} channels used today</span>
    <a href="/pricing.html">View plans</a><small>Resets at 00:00 UTC. All sizes of the same channel share one use.</small></div>;
}
export function BillingPanel() {
  const [usage,setUsage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{billingAPI('status').then(setUsage).catch(error=>setError(error.message));},[]);
  async function manage() {
    setBusy(true);setError('');
    try { const result=await billingAPI('manage',{});window.location.assign(result.url); }
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <section className="account-section"><h2>Your plan & daily allowance</h2>
    {usage ? <><UsageLine usage={usage}/>{usage.validUntil>0 && <p className="billing-note">{usage.canceling?'Access ends':'Current paid period ends'} {new Date(usage.validUntil).toLocaleDateString()}.</p>}
      {usage.hasSubscription && <button type="button" className="account-secondary" disabled={busy || !usage.paymentsAvailable} onClick={manage}>Manage subscription / cancel renewal</button>}</>:!error && <p>Loading allowance…</p>}
    {usage?.mode==='test' && <p className="billing-note">Sandbox payment mode. Test purchases do not grant production access.</p>}
    {error && <p className="billing-error" role="alert">{error}</p>}</section>;
}
export function Pricing() {
  const [usage,setUsage]=useState(null),[guest,setGuest]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
  const payment=new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('payment');
  async function refresh() {
    setError('');setLoading(true);
    try {
      const result = /^[a-f0-9]{32}$/.test(payment || '') ? await billingAPI('reconcile',{orderId:payment}) : await billingAPI('status');
      setUsage(result);setGuest(false);
      if (payment) setNotice(result.plan === 'free' ? 'Payment is not confirmed yet. Refresh after completing checkout; your plan opens only after payment is verified.' : 'Payment verified. Your daily channel allowance is ready.');
    } catch(error) {if(error.status===401)setGuest(true);else setError(error.message);}
    finally{setLoading(false);}
  }
  useEffect(()=>{refresh();},[]);
  async function checkout(plan) {
    if(guest){location.assign('/account?returnTo=%2Fpricing.html');return;}
    setBusy(true);setError('');
    try{const result=await billingAPI('checkout',{plan,consent});location.assign(result.url);}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <>
    <div className="pricing-intro"><span className="eyebrow">SIMPLE MONTHLY PLANS</span><h1>YT PFP Downloader pricing</h1><p>Start with one free channel a day. Need more? Choose your daily allowance. Every plan includes all available image sizes.</p></div>
    {usage && <UsageLine usage={usage}/>}
    {usage?.mode==='test' && <p className="billing-notice">Sandbox payment mode. Test purchases do not grant production access.</p>}
    {error && <p className="billing-error" role="alert">{error}</p>}
    {notice && <p className="billing-notice" role="status">{notice}</p>}
    <div className="pricing-grid">{Object.entries(plans).map(([key,plan])=><section className={`price-card ${key==='starter'?'recommended':''}`} key={key}>
      <div className="price-heading"><h2>{plan.name}</h2>{key==='starter'&&<span>MORE ROOM</span>}</div>
      <p className="price-amount">${plan.amount}<span>{key==='free'?' / forever':' / month'}</span></p>
      <p className="price-limit"><strong>{plan.dailyLimit.toLocaleString('en-US')}</strong> {plan.dailyLimit===1?'channel':'channels'} per day</p>
      <ul><li>Channel lookup and profile information</li><li>Preview every available image size</li><li>Download all available avatar sizes</li><li>Repeat a channel at no extra daily cost</li></ul>
      {key==='free' ? <a className="primary" href={guest?'/account?returnTo=%2F':'/'}>{guest?'Create a free account':'Back to downloader'}</a>:
        <button className="primary" disabled={loading || busy || (!guest && (!consent || !usage?.paymentsAvailable || usage?.hasSubscription))} onClick={()=>checkout(key)}>
          {busy?'Opening checkout…':usage?.plan===key?'Current plan':guest?'Sign in to choose':`Choose ${plan.name}`}</button>}
      <p className="billing-note">{key==='free'?'No card required.':`Billed monthly at $${plan.amount} USD, plus any applicable tax. Automatically renews until canceled.`}</p>
    </section>)}</div>
    <div className="pricing-details">
      <label className="billing-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I agree to the <a href="/terms.html">Terms</a>, <a href="/privacy.html">Privacy Policy</a> and <a href="/refunds.html">Refund Policy</a>, and authorize monthly recurring charges for the plan I choose until I cancel.</span></label>
      {!guest && !loading && !usage?.paymentsAvailable && <p className="billing-note">Paid checkout is not available yet. Your free daily channel allowance is available.</p>}
      {usage?.hasSubscription && <p className="billing-note">Manage or cancel your existing subscription in <a href="/account">My account</a>. A second subscription is blocked to prevent duplicate charges.</p>}
      <button className="text-link" disabled={loading || busy} onClick={refresh}>Refresh plan / payment status</button>
      <h2>What counts as one use?</h2><p>One unique YouTube channel per account per UTC day. A channel lookup unlocks its profile information, previews and every available avatar size. Reopening that channel, changing sizes or using a video link from the same channel does not use more of your daily allowance.</p>
      <h2>When does my allowance reset?</h2><p>Every day at 00:00 UTC. Unused allowance does not roll over. Failed lookups do not count. Opening a channel again on a new UTC day uses one of that day’s slots.</p>
      <h2>How do monthly plans work?</h2><p>Starter is $3.88/month for 100 channels per day. Pro is $9.88/month for 1,000 channels per day. No trial or annual commitment. Cancel renewal through My account; access continues through the successfully paid period. A failed renewal or expired period returns your account to Free.</p>
      <h2>Can I request a refund?</h2><p>For your first paid subscription, request a full refund within 7 calendar days if your total paid channel uses since that payment are no more than 10 for Starter or 100 for Pro. This is a cumulative threshold, not a daily refund threshold. Support reviews requests. Duplicate charges, qualifying service interruptions and mandatory legal rights are covered in our <a href="/refunds.html">Refund Policy</a>.</p>
      <h2>Does paying create a sharper original?</h2><p>All plans offer the same available image sizes. Larger variants may be scaled by YouTube; a paid plan increases your daily channel allowance.</p>
    </div>
  </>;
}
