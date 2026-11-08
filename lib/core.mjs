import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../public/corpus.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../public/baseline.js', import.meta.url), 'utf8'), context);
export const baseline = context.window.SIPEngine;
export const corpus = context.window.CORPUS;
export const themes = Object.keys(baseline.THEMES);
export const profileFields = ['motivation', 'horizon', 'budget', 'liquidity', 'risk'];
export const sources = [
 { id:'skip', title:'Skipping an instalment', url:'https://groww.in/help/mutual-funds/order/can-i-pause-sip-for-next-month', fact:'My SIPs → select SIP → Edit SIP → Skip Installment. Check the affected month on confirmation.' },
 { id:'limits', title:'Skip limits and timing', url:'https://groww.in/help/mutual-funds/mf-sip/what-is-the-maximum-period-for-which-i-can-skip-my-sip-installments--63', fact:'One instalment can be skipped at a time. Three consecutive skipped instalments automatically cancel a SIP. If the next instalment is due within two days, a skip request will apply to later instalments, not that one.' },
 { id:'cancel', title:'Cancelling a SIP', url:'https://groww.in/help/mutual-funds/order/can-i-cancel-my-sip-as-per-my-wish', fact:'Cancellation stops future instalments and leaves current holdings in place. It is unavailable within three working days of the upcoming instalment.' },
 { id:'pay', title:'Recovering a failed AutoPay debit', url:'https://groww.in/help/mutual-funds/mf-sip/how-do-i-pay-for-my-sip-installment-if-the-autopay-debit-has-failed--40', fact:'Locate the pending SIP payment on the dashboard and check its Pay option. No fixed recovery window is established here.' }
];
export function cleanProfile(value = {}) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid profile.');
 return Object.fromEntries(profileFields.map(k => [k, typeof value[k] === 'string' ? value[k].trim().slice(0,400) : '']));
}
export function safety(text) {
 if (/\b(?:[A-Z]{5}\d{4}[A-Z]|\d{9,18})\b|\b(?:account number|aadhaar|my pan|pan is|pan number|portfolio screenshot)\b/i.test(text)) return 'identifiers';
 if (/\b(?:recommend|pick|choose|select)\b.{0,40}\b(?:fund|stock|scheme)\b|\b(?:best (?:\w+ ){0,3}(?:fund|stock|sip)|which (?:fund|stock|sip)|double (?:my )?money)\b/i.test(text)) return 'picks';
 if (/\b(?:act now|last chance|you will miss out|miss the rally|invest everything now|guaranteed returns?)\b/i.test(text)) return 'urgency';
 return null;
}
export function refusal(reason) {
 return { gate:'refuse', reply: reason==='identifiers' ? 'Please remove personal identifiers. I only need your goal, time horizon, and a description of the situation; no PAN, account numbers, or portfolio screenshots.' : reason==='picks' ? 'I can help you review affordability, risk, liquidity, and payment conditions, but I cannot select a fund, stock, or scheme for you.' : 'I cannot promise returns or pressure you to invest. We can review your goal and the payment choices calmly.', question:'What would you like to understand about your goal or next payment?', lesson:'', activity:'none', profileUpdate:Object.fromEntries(profileFields.map(k=>[k,null])), sourceIds:[] };
}
export function parseDay(input) {
 if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Use a valid payment date.');
 const date=new Date(input+'T00:00:00.000Z');
 if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==input) throw new Error('Use a valid payment date.');
 return date;
}
export function nextMonth(day) {
 const date=parseDay(day), year=date.getUTCFullYear(), month=date.getUTCMonth();
 const last=new Date(Date.UTC(year,month+2,0)).getUTCDate();
 return new Date(Date.UTC(year,month+1,Math.min(date.getUTCDate(),last))).toISOString().slice(0,10);
}
export function paymentDecision(input={}, nowDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
 const due=parseDay(input.dueDate), today=parseDay(nowDay);
 const amount=Number(input.amount), skips=Number(input.consecutiveSkips), days=Math.round((due-today)/86400000);
 if (!Number.isFinite(amount)||amount<=0||amount>1e7||!Number.isInteger(skips)||skips<0||skips>2) throw new Error('Use an amount above zero and 0–2 previous skips.');
 const status=days<=2?'too_late':skips===2?'third_skip':'eligible';
 return {status, amount, dueDate:input.dueDate, nextDate:nextMonth(input.dueDate), consecutiveSkips:skips, title:status==='too_late'?'This payment is still due':status==='third_skip'?'This skip will stop future SIP payments':'Review this one-month skip', explanation:status==='too_late'?'This demo applies the two-day skip cutoff. The upcoming instalment stays due; a later instalment can be reviewed instead.':status==='third_skip'?'This would be the third consecutive skipped instalment. Groww states that three consecutive skips automatically cancel the SIP. Existing holdings remain invested.':'This skips one instalment only. The next scheduled payment is shown separately so the break has a clear end.', feeNote:'Failed-debit charges depend on your bank and payment method. No bank fee is assumed here.', sourceIds:['limits','skip'], canConfirm:days>2 };
}
export const assistantSchema={type:'object',additionalProperties:false,properties:{
 gate:{type:'string',enum:['answer','ask','refuse']},reply:{type:'string'},question:{type:'string'},lesson:{type:'string'},activity:{type:'string',enum:['none','budget','risk','payment']},profileUpdate:{type:'object',additionalProperties:false,properties:Object.fromEntries(profileFields.map(k=>[k,{type:['string','null']}])),required:profileFields},sourceIds:{type:'array',items:{type:'string',enum:sources.map(s=>s.id)}}
},required:['gate','reply','question','lesson','activity','profileUpdate','sourceIds']};
export const discoverySchema={type:'object',additionalProperties:false,properties:{theme:{type:'string',enum:[...themes,'uncertain']},lapse:{type:'string',enum:['voluntary','involuntary','silent','recovery','never_lapsed','uncertain']},summary:{type:'string'},quote:{type:'string'},rationale:{type:'string'},metric:{type:'string'}},required:['theme','lapse','summary','quote','rationale','metric']};
export function validateAssistant(out) {
 if (!out || !['answer','ask','refuse'].includes(out.gate) || !['none','budget','risk','payment'].includes(out.activity)) throw new Error('Unusable AI response.');
 for (const k of ['reply','question','lesson']) if(typeof out[k]!=='string'||out[k].length>5000) throw new Error('Unusable AI response.');
 if(!out.profileUpdate||!Array.isArray(out.sourceIds)) throw new Error('Unusable AI response.');
 for(const k of profileFields) if(out.profileUpdate[k]!==null&&(typeof out.profileUpdate[k]!=='string'||out.profileUpdate[k].length>400)) throw new Error('Unusable profile suggestion.');
 if(out.sourceIds.some(id=>!sources.some(s=>s.id===id))) throw new Error('Unknown source.');
 return out;
}
export function previewAssistant(profile, message, stage) {
 const out={gate:'ask',reply:'',question:'',lesson:'',activity:'none',profileUpdate:Object.fromEntries(profileFields.map(k=>[k,null])),sourceIds:[]};
 const goal=profile.motivation?`You saved “${profile.motivation}” as your motivation. `:'';
 if(!profile.motivation){out.reply='Let’s start with the reason behind this SIP. You can describe it in your own words and save it in the profile beside this conversation.';out.question='What would you like this money to help you do?';return out;}
 if(/cash|salary|expense|rent|budget|afford/i.test(message)){out.reply=goal+'A cash need deserves a budget review before an investment decision. Keep money needed for essentials separate from any amount you are comfortable committing.';out.question='What has changed in the amount you can set aside this month?';out.activity='budget';out.lesson='A one-month skip, cancelling future instalments, and selling existing units are different actions.';out.sourceIds=['skip','cancel'];}
 else if(/debit|bank|fee|charge|failed|mandate/i.test(message)){out.reply=goal+'A failed payment is a payment-status question. The bank may apply charges; this demo does not know your bank’s tariff or account status.';out.question='Is the payment already marked failed, or is it still upcoming?';out.activity='payment';out.sourceIds=['pay','limits'];}
 else if(/red|loss|return|risk|volatil|market/i.test(message)){out.reply=goal+'A short return snapshot shows current market value, not a monthly interest credit or a forecast. Your horizon, liquidity needs, and comfort with losses all matter.';out.question='Is the concern mainly a loss on screen, or needing the money sooner than planned?';out.lesson='A long horizon does not remove volatility or make every product suitable. A small contribution does not establish risk tolerance.';out.activity='risk';}
 else if(stage==='skip'){out.reply=goal+'Before reviewing a skip, it helps to separate cash pressure, market uncertainty, and payment problems.';out.question='What is the main reason you are considering a break?';out.activity='payment';out.sourceIds=['skip','limits'];}
 else {out.reply=goal+'We can review how your time horizon and current budget fit together, then explore the relevant education or payment information.';out.question='What has changed since you set this goal, or what would you like to understand?';out.activity=stage==='buy'?'risk':'budget';}
 return out;
}
