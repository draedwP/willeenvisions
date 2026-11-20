const EMAIL="willeenvisions@gmail.com";const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safe=(value,max=5000)=>String(value??"").trim().slice(0,max);
const escapeHtml=s=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname!=="/api/enquiry"||request.method!=="POST")return env.ASSETS.fetch(request);
if(!env.RESEND_API_KEY||!env.TURNSTILE_SECRET_KEY||!env.MAIL_FROM)return json({error:"Enquiries are not configured yet."},503);
const origin=request.headers.get("origin");if(origin&&origin!==url.origin)return json({error:"Invalid origin."},403);
if(Number(request.headers.get("content-length")||0)>12*1024*1024)return json({error:"Request too large."},413);
let form;try{form=await request.formData()}catch{return json({error:"Invalid form."},400)}
if(form.get("website"))return json({ok:true});
const name=safe(form.get("name"),120),email=safe(form.get("email"),254),company=safe(form.get("company"),150),quantity=safe(form.get("quantity"),10),dimensions=safe(form.get("dimensions"),150),deadline=safe(form.get("deadline"),30),message=safe(form.get("message"),5000),consent=form.get("consent");
if(!name||!message||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||consent!=="yes")return json({error:"Please complete all required fields."},400);
if(quantity&&(!/^\d+$/.test(quantity)||Number(quantity)<1||Number(quantity)>100000))return json({error:"Invalid quantity."},400);
const token=safe(form.get("cf-turnstile-response"),3000);if(!token)return json({error:"Complete the spam protection check."},400);
const verify=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get("CF-Connecting-IP")||""})});
if(!verify.ok)return json({error:"Verification temporarily unavailable."},503);
const result=await verify.json();if(!result.success)return json({error:"Spam protection check failed. Please retry."},400);
const lines=[["Name",name],["Email",email],["Company",company],["Quantity",quantity],["Dimensions",dimensions],["Desired date",deadline],["Project",message]];const html=lines.map(([k,v])=>'<p><strong>'+escapeHtml(k)+'</strong><br>'+escapeHtml(v||"—").replace(/\n/g,"<br>")+'</p>').join("");
const payload={from:env.MAIL_FROM,to:[EMAIL],reply_to:email,subject:"New custom mold enquiry — "+name,html};
const file=form.get("reference");if(file instanceof File&&file.size){if(file.size>10*1024*1024)return json({error:"Attachment exceeds 10 MB."},400);if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type))return json({error:"Unsupported attachment type."},400);const bytes=new Uint8Array(await file.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));payload.attachments=[{filename:file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100)||"reference",content:btoa(binary)}]}
try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!response.ok){console.error("Resend failure",response.status);return json({error:"Unable to deliver your enquiry. Please try again later."},502)}return json({ok:true})}catch(e){console.error("Enquiry transport error",String(e));return json({error:"Service temporarily unavailable."},503)}
}};