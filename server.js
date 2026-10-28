const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, DB=process.env.DB_FILE||path.join(__dirname,'data.json'), PUB=path.join(__dirname,'public');
function seed(){return{restaurants:[{id:'r_demo',slug:'demo',apiKey:'rk_demo_bella_2026',name:'Bella Vista Bistro',
 settings:{openDays:[2,3,4,5,6,0],open:'17:00',close:'22:00',slotMinutes:30,capacity:20,maxParty:8,closedDates:[],timezone:'America/Chicago'}}],bookings:[]};}
let db; try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch{db=seed();save()}
const todayCT=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date());
function demoSeed(){const d=todayCT();db.demoSeeded=db.demoSeeded||[];if(db.demoSeeded.includes(d))return;db.demoSeeded.push(d);
 [['17:30',2,'Maria Lopez','(312) 555-0142','Anniversary'],['18:00',4,'The Chen family','(312) 555-0187','High chair please'],['19:00',2,'David Kim','(773) 555-0110',''],['19:30',6,'Sarah Johnson','(312) 555-0199','Birthday dinner'],['20:30',3,'Alex Rivera','(708) 555-0123','']]
 .forEach(([time,partySize,name,phone,notes])=>db.bookings.push({id:'bk_'+crypto.randomBytes(5).toString('hex'),restaurantId:'r_demo',date:d,time,partySize,name,phone,notes,status:'confirmed',createdAt:new Date().toISOString()}));save()}
demoSeed();setInterval(demoSeed,3600e3);
function save(){fs.writeFileSync(DB,JSON.stringify(db,null,1))}
const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m}, toT=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
function slots(r,date){const s=r.settings,dow=new Date(date+'T12:00:00Z').getUTCDay();
 if(!s.openDays.includes(dow)||s.closedDates.includes(date))return{open:false,slots:[]};
 const out=[];for(let m=toMin(s.open);m+s.slotMinutes<=toMin(s.close);m+=s.slotMinutes){const t=toT(m);
  const used=db.bookings.filter(b=>b.restaurantId===r.id&&b.date===date&&b.time===t&&b.status==='confirmed').reduce((a,b)=>a+b.partySize,0);
  out.push({time:t,remaining:Math.max(0,s.capacity-used)})}
 return{open:true,slots:out}}
function send(res,code,obj,extra={}){res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*',...extra});res.end(JSON.stringify(obj))}
function body(req){return new Promise(ok=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{ok(JSON.parse(d||'{}'))}catch{ok(null)}})})}
function makeBooking(r,b){if(!b)return[400,{error:'Invalid JSON'}];
 const{date,time,name,phone}=b,partySize=parseInt(b.partySize);
 if(!validDate(date)||!time||!name||!phone||!partySize)return[400,{error:'date, time, partySize, name, phone are required'}];
 if(partySize<1||partySize>r.settings.maxParty)return[400,{error:'partySize must be 1-'+r.settings.maxParty}];
 const sl=slots(r,date).slots.find(s=>s.time===time);if(!sl)return[409,{error:'That time is not available'}];
 if(sl.remaining<partySize)return[409,{error:'Not enough seats left at '+time+' (remaining '+sl.remaining+')'}];
 const bk={id:'bk_'+crypto.randomBytes(5).toString('hex'),restaurantId:r.id,date,time,partySize,name:String(name).slice(0,80),phone:String(phone).slice(0,30),notes:String(b.notes||'').slice(0,300),status:'confirmed',createdAt:new Date().toISOString()};
 db.bookings.push(bk);save();return[201,bk]}
const pubR=r=>({slug:r.slug,name:r.name,settings:{openDays:r.settings.openDays,open:r.settings.open,close:r.settings.close,slotMinutes:r.settings.slotMinutes,maxParty:r.settings.maxParty,closedDates:r.settings.closedDates}});
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'};
http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x'),p=u.pathname;
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-API-Key','Access-Control-Max-Age':'86400'});return res.end()}
 let m;
 if(m=p.match(/^\/api\/public\/([\w-]+)(\/.*)?$/)){const r=db.restaurants.find(x=>x.slug===m[1]);if(!r)return send(res,404,{error:'Restaurant not found'});const sub=m[2]||'';
  if(req.method==='GET'&&(sub===''||sub==='/'))return send(res,200,pubR(r));
  if(req.method==='GET'&&sub==='/availability'){const d=u.searchParams.get('date');if(!validDate(d))return send(res,400,{error:'date=YYYY-MM-DD required'});return send(res,200,{date:d,...slots(r,d)})}
  if(req.method==='POST'&&sub==='/bookings'){const[c,o]=makeBooking(r,await body(req));return send(res,c,c===201?{id:o.id,date:o.date,time:o.time,partySize:o.partySize,name:o.name,status:o.status}:o)}
  return send(res,404,{error:'Not found'})}
 if(p.startsWith('/api/v1/')){const r=db.restaurants.find(x=>x.apiKey===req.headers['x-api-key']);if(!r)return send(res,401,{error:'Missing or invalid X-API-Key'});const sub=p.slice(7);
  if(sub==='/restaurant'&&req.method==='GET')return send(res,200,{...pubR(r),settings:r.settings});
  if(sub==='/settings'&&req.method==='PUT'){const b=await body(req);if(!b)return send(res,400,{error:'Invalid JSON'});const s=r.settings;
   if(b.name)r.name=String(b.name).slice(0,80);
   if(Array.isArray(b.openDays))s.openDays=b.openDays.map(Number).filter(n=>n>=0&&n<=6);
   for(const k of['open','close'])if(/^\d{2}:\d{2}$/.test(b[k]||''))s[k]=b[k];
   for(const k of['slotMinutes','capacity','maxParty'])if(parseInt(b[k])>0)s[k]=parseInt(b[k]);
   if(Array.isArray(b.closedDates))s.closedDates=b.closedDates.filter(validDate);save();return send(res,200,{...pubR(r),settings:s})}
  if(sub==='/availability'&&req.method==='GET'){const d=u.searchParams.get('date');if(!validDate(d))return send(res,400,{error:'date required'});return send(res,200,{date:d,...slots(r,d)})}
  if(sub==='/bookings'&&req.method==='GET'){const d=u.searchParams.get('date');let l=db.bookings.filter(b=>b.restaurantId===r.id&&(!d||b.date===d));if(!u.searchParams.get('includeCancelled'))l=l.filter(b=>b.status==='confirmed');return send(res,200,{bookings:l.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(({restaurantId,...x})=>x)})}
  if(sub==='/bookings'&&req.method==='POST'){const[c,o]=makeBooking(r,await body(req));if(c===201){const{restaurantId,...x}=o;return send(res,c,x)}return send(res,c,o)}
  if((m=sub.match(/^\/bookings\/(bk_\w+)$/))&&req.method==='DELETE'){const b=db.bookings.find(x=>x.id===m[1]&&x.restaurantId===r.id);if(!b)return send(res,404,{error:'Booking not found'});b.status='cancelled';save();return send(res,200,{id:b.id,status:'cancelled'})}
  return send(res,404,{error:'Not found'})}
 if(p==='/api/demo/reset'&&req.method==='POST'){db=seed();save();return send(res,200,{ok:true})}
 let f=p==='/'?'index.html':p.startsWith('/book/')?'book.html':p==='/dashboard'?'dashboard.html':p==='/docs'?'docs.html':p.slice(1);
 const fp=path.join(PUB,path.normalize(f));if(!fp.startsWith(PUB)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('Not found')}
 res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain','Content-Security-Policy':'frame-ancestors *','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'});fs.createReadStream(fp).pipe(res);
}).listen(PORT,()=>console.log('TableSimple on '+PORT));
