/* Transparent SM-2-inspired scheduling, not FSRS or a calibrated memory model. */
(function(root){'use strict';const DAY=86400000,MIN=60000;
function dayKey(at=Date.now()){const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function nextDay(at=Date.now()){const d=new Date(at);d.setDate(d.getDate()+1);d.setHours(0,0,0,0);return d.getTime();}
function blank(){return {phase:'new',due:0,interval:0,ease:2.5,reps:0,total:0,success:0,lapses:0,step:0,lastDay:'',goodDays:[]};}
function schedule(old,grade,now=Date.now()){if(![1,2,3,4].includes(grade))throw Error('Invalid grade');const c=Object.assign(blank(),old||{});c.goodDays=[...(c.goodDays||[])];const reviewing=c.phase==='review';c.total++;c.lastDay=dayKey(now);c.lastAt=now;
if(grade>=2)c.success++;if(grade>=3&&!c.goodDays.includes(c.lastDay))c.goodDays.push(c.lastDay);c.goodDays=c.goodDays.slice(-30);
if(grade===1){if(c.total>1)c.lapses++;c.phase='learning';c.step=0;c.reps=0;c.interval=0;c.due=now+MIN;c.ease=Math.max(1.3,c.ease-.2);c.goodDays=[];}
else if(!reviewing){if(grade===2){c.phase='learning';c.due=now+6*MIN;c.interval=0;}else if(grade===4){c.phase='review';c.reps=1;c.interval=3;c.due=now+3*DAY;}else if(c.step===0){c.phase='learning';c.step=1;c.due=now+10*MIN;c.interval=0;}else{c.phase='review';c.reps=1;c.interval=1;c.due=now+DAY;}}
else{c.reps++;if(grade===2){c.interval=Math.max(1,Math.round(c.interval*1.2));c.ease=Math.max(1.3,c.ease-.15);}else if(grade===3)c.interval=Math.max(c.interval+1,Math.round(c.interval*c.ease));else{c.interval=Math.max(c.interval+1,Math.round(c.interval*c.ease*1.3));c.ease=Math.min(3.5,c.ease+.15);}c.interval=Math.min(365,c.interval);c.due=now+c.interval*DAY;}
return c;}
function label(c,now=Date.now()){const t=c.due-now;if(t<60*MIN)return Math.max(1,Math.round(t/MIN))+' min';if(t<DAY)return Math.round(t/3600000)+' hr';const d=Math.round(t/DAY);return d+' day'+(d>1?'s':'');}
function secure(c,now=Date.now()){return !!c&&c.phase==='review'&&c.interval>=7&&(c.goodDays||[]).length>=2&&c.due>now;}
function normalize(text){return String(text).normalize('NFC').toLowerCase().replace(/[\s.,!?;:'"“”‘’]/g,'');}
const api={DAY,MIN,dayKey,nextDay,blank,schedule,label,secure,normalize};root.KS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
