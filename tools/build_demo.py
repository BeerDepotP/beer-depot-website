"""Builds demo-store-tools.html: the real Store Tools page with a fake in-browser backend (any PIN works,
nothing is saved anywhere). Used for the claude.ai demo artifact."""
import base64, json, pathlib
here = pathlib.Path(__file__).parent; root = here.parent
src = (root / "public/food-stock/index.html").read_text()
menu = (here / "menu.js").read_text()
def b64(path, mime): return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
logo = b64(root / "public/img/logo-orange.png", "image/png")
photos = {f.name: b64(f, "image/jpeg") for f in (root / "public/img/food").glob("*.jpg")}
fake = r"""
const FOOD_PHOTOS = %s;
const PH = {}; const DEMO_PH = id => PH[id] || "";
function menuPhoto(f, key){
  const e = swEdits[key||f.name] || {};
  if(e.photo === "none") return "";
  if(e.photo) return PH[e.photo] || "";
  return f.photo ? (FOOD_PHOTOS[f.photo] || "") : "";
}
(function(){
  const DB = { food:{items:{},prices:{},edits:{},toppings:null},
    sales:{on:true,items:[{id:"s1",name:"Spotted Cow 12pk Cans",price:"15.99",was:"18.99",note:"While supplies last",photo:""}]},
    seasonal:{on:true,title:"Christmas",items:[{id:"c1",name:"Ham Dinner Tray",price:"39.99",note:"Order by Dec 20",photo:""}]},
    hours:{weekly:null,overrides:[{date:"2026-12-25",closed:true,open:"",close:"",note:"Merry Christmas! See You Friday"}]},
    notify:{on:true,delayMin:60,form:{title:"Email Me When Back",intro:"We'll send you one email when it's back in stock.",button:"Email Me",thanks:"Got it! We'll email you when it's back.",emailSubject:"{item} Is Back in Stock at The Beer Depot",emailHeading:"It's Back in Stock!",emailNote:"Stop in or give us a call to grab it.",emailLink:"See What's In Stock",fields:[{id:"f1",label:"Name",type:"text",required:true},{id:"f2",label:"Phone Number",type:"tel",required:false}]},items:[{key:"k:Blanton's Single Barrel 750ml",name:"Blanton's Single Barrel 750ml",count:3,people:[{email:"jim@example.com",at:"2026-11-05T15:00:00Z"},{email:"sara@example.com",at:"2026-11-05T16:10:00Z"},{email:"dave@example.com",at:"2026-11-04T12:00:00Z"}]},{key:"f:Smoked Lasagna",name:"Smoked Lasagna",count:1,people:[{email:"pat@example.com",at:"2026-11-05T17:30:00Z"}]}],sent:[{at:"2026-11-04T14:05:00Z",name:"Spotted Cow 12pk Cans",count:2}]},
    layout:{items:[],groups:["Beer - Domestic","Beer - Craft","Hard Seltzer","Whiskey","Bourbon","Vodka","Wine - Red","Wine - White","Tequila","Cigars (Not Shown)","Craft Cans","Kombucha"]},
    club:{sending:true,members:[{email:"jim@example.com",joined:"2026-11-03T15:00:00Z",source:"sign"},{email:"sara@example.com",joined:"2026-11-04T18:20:00Z",source:"web"}]} };
  const now = Date.now();
  const report = { seen:{}, badges:{nofind:2,top:0,requests:1}, week:"2026-W45", thisWeek:"2026-W45", prevWeek:"2026-W44", totalSearches:41,
    top:[{q:"titos",n:9,last:now},{q:"spotted cow",n:7,last:now},{q:"ribs",n:5,last:now}],
    noResults:[{q:"white claw mango",none:3,lastNone:now},{q:"blanton",none:2,lastNone:now}],
    requests:[{item:"Weihenstephaner Hefeweissen",name:"Dave",phone:"262-555-0142",at:new Date().toISOString()}] };
  const ok = (o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"content-type":"application/json"}});
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    url = String(url); const post = opt && opt.method === "POST"; const b = post ? JSON.parse(opt.body) : {};
    if(url.startsWith("/api/food-stock")){
      if(!post) return ok(DB.food);
      const f = DB.food;
      if(b.check) return ok({ok:true});
      if(b.action==="photo"){ const id = "demo"+Date.now().toString(36); PH[id] = b.data; return ok({ok:true,photo:id}); }
      if(b.action==="toppings"){ f.toppings = b.list; return ok({ok:true,...f}); }
      if(b.action==="edit"){ const e = {...(f.edits[b.name]||{})};
        if(b.label) e.label = b.label; else delete e.label;
        if("photo" in b){ if(b.photo) e.photo = b.photo; else delete e.photo; }
        if(Object.keys(e).length) f.edits[b.name] = e; else delete f.edits[b.name];
        if(Array.isArray(b.prices)) f.prices[b.name] = b.prices;
        return ok({ok:true,...f}); }
      if(typeof b.inStock === "boolean"){ f.items[b.name] = b.inStock; return ok({ok:true,...f}); }
      return ok({ok:true,...f});
    }
    if(url.startsWith("/api/stock")) return ok({items:[],updated:new Date().toISOString()});
    if(url.startsWith("/api/sales")){ if(!post) return ok(DB.sales);
      if(b.action==="photo"){ const id = "demo"+Date.now().toString(36); PH[id] = b.data; return ok({ok:true,photo:id}); }
      if(b.action==="save") DB.sales = {on:!!b.on,items:b.items,updated:new Date().toISOString()};
      return ok({ok:true,...DB.sales}); }
    if(url.startsWith("/api/seasonal")){ if(!post) return ok(DB.seasonal);
      if(b.action==="photo"){ const id = "demo"+Date.now().toString(36); PH[id] = b.data; return ok({ok:true,photo:id}); }
      if(b.action==="save") DB.seasonal = {on:!!b.on,title:(b.title||"Seasonal"),items:b.items,updated:new Date().toISOString()};
      return ok({ok:true,...DB.seasonal}); }
    if(url.startsWith("/api/hours")){ if(post && b.action==="save"){ if(b.weekly) DB.hours.weekly=b.weekly; if(b.overrides) DB.hours.overrides=b.overrides.slice().sort((x,y)=>x.date<y.date?-1:1); }
      return ok({ok:true,...DB.hours}); }
    if(url.startsWith("/api/notify")){ const n = DB.notify;
      if(b.action==="settings"){ n.on = !!b.on; if(b.delayMin!=null) n.delayMin = +b.delayMin; }
      if(b.action==="form"){ n.form = Object.assign({},n.form,b.form); n.form.fields = (b.form.fields||[]).map((f,i)=>Object.assign({},f,{id:"f"+(i+1)})); }
      if(b.action==="previewEmail"){ const x = Object.assign({},n.form,b.form), q = t=>String(t).replace(/</g,"&lt;").replace(/\n/g,"<br>");
        return ok({subject:String(x.emailSubject).replace(/\{item\}/gi,"(Sample) Blanton's Single Barrel 750ml"),html:`<body style="margin:0;background:#F3EBE2;font-family:Arial"><div style="max-width:560px;margin:0 auto;padding:20px"><div style="background:#2B1B12;border-radius:14px;padding:22px;color:#E8D9CC"><h1 style="margin:0 0 8px;color:#F26B1D;font-size:26px">${q(x.emailHeading)}</h1><p style="color:#fff;font-size:20px;font-weight:bold">(Sample) Blanton's Single Barrel 750ml</p><p>${q(x.emailNote)}</p><p style="color:#fff;font-weight:bold">${q(x.emailLink)} · 262-696-4602</p></div><p style="font-size:12px;color:#7A6B60">The Beer Depot · N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072<br>You asked us to email you when this item came back. Unsubscribe</p></div></body>`}); }
      if(b.action==="clear") n.items = n.items.filter(i=>i.key!==b.key);
      if(b.action==="removeEmail"){ const it = n.items.find(i=>i.key===b.key); if(it){ it.people = it.people.filter(p=>p.email!==b.email); it.count = it.people.length; } n.items = n.items.filter(i=>i.count); }
      return ok({ok:true,ready:true,defaults:{title:"Email Me When Back",intro:"We'll send you one email when it's back in stock.",button:"Email Me",thanks:"Got it! We'll email you when it's back.",emailSubject:"{item} Is Back in Stock at The Beer Depot",emailHeading:"It's Back in Stock!",emailNote:"Stop in or give us a call to grab it.",emailLink:"See What's In Stock",fields:[]},...n}); }
    if(url.startsWith("/api/layout")){ const l = DB.layout;
      if(b.action==="save") l.items = b.items.map(x=>Object.assign({},x,{name:x.name||undefined}));
      if(b.action==="reset") l.items = [];
      return ok({ok:true,items:l.items,groupNames:l.groups,groupError:"",builtin:{"made-here":"Made Here","on-sale":"On Sale","seasonal":"Seasonal","local-favorites":"Local Favorites","grilling-outdoor":"Grilling & Outdoor","new-arrivals":"New Arrivals",cocktails:"Ready to Drink Cocktails",beer:"Beer",nonalc:"Non-Alcoholic",seltzer:"Hard Seltzers",thc:"THC",whiskey:"Whiskey & Bourbon",wine:"Wine",tequila:"Tequila",vodka:"Vodka",brandy:"Brandy",gin:"Gin",rum:"Rum",liqueur:"Liqueur",mixers:"Soda & Mixers"}}); }
    if(url.startsWith("/api/insights")){
      if(b.type==="seen"){ report.badges[b.tab]=0; return ok({ok:true,badges:report.badges,seen:report.seen}); }
      if(b.type==="badges") return ok({badges:report.badges,seen:report.seen});
      return ok(report); }
    if(url.startsWith("/api/bourbon-club")){
      const c = DB.club;
      if(b.action==="remove") c.members = c.members.filter(m=>m.email!==b.email);
      if(b.action==="sending") c.sending = !!b.on;
      if(b.action==="schedule"){ c.day = +b.day; c.time = b.time; }
      const DEF = {subject:"This Week's Allocated Bourbon at The Beer Depot",heading:"This Week's Allocated Bourbon",tagline:"Hard-to-Find Bottles. Once They're Gone, They're Gone.",top:"",info:"In stock as of Thursday 5 PM. First come, first served, in store only. No reservations.",bottom:""};
      if(b.action==="saveEmail") c.email = Object.assign({},DEF,b.content);
      if(b.action==="previewEmail"){ const x = Object.assign({},DEF,b.content), q = t=>String(t).replace(/</g,"&lt;").replace(/\n/g,"<br>");
        return ok({subject:x.subject,html:`<body style="margin:0;background:#F3EBE2;font-family:Arial"><div style="max-width:560px;margin:0 auto;padding:20px"><div style="background:#2B1B12;border-radius:14px;padding:22px;color:#E8D9CC"><h1 style="margin:0 0 6px;color:#F26B1D;font-size:28px">${q(x.heading)}</h1><p style="color:#fff;font-weight:bold">${q(x.tagline)}</p><p style="color:#fff">${q(x.top)}</p><ul style="color:#fff"><li>(Sample) Blanton's Single Barrel 750ml</li><li>(Sample) Weller Special Reserve 750ml</li></ul><p>${q(x.info)}</p><p style="color:#fff">${q(x.bottom)}</p></div></div></body>`}); }
      if(b.action==="test") return ok({ok:true,bottles:4});
      return ok({day:c.day==null?4:c.day,time:c.time||"17:00",email:Object.assign({},DEF,c.email),defaults:DEF,sending:c.sending,count:c.members.length,members:c.members,last:{date:"2026-11-05",sent:2,bottles:4},ready:true}); }
    return realFetch(url,opt);
  };
  try{ sessionStorage.setItem("bd-pin","demo"); }catch(e){}
})();
""" % json.dumps(photos)
html = src.replace('<script src="/menu.js"></script>', "<script>\n" + menu + "\n</script>\n<script>" + fake + "</script>", 1)
html = html.replace("/api/sales?photo=${encodeURIComponent(it.photo)}", "${DEMO_PH(it.photo)}").replace("/api/seasonal?photo=${encodeURIComponent(it.photo)}", "${DEMO_PH(it.photo)}").replace('"/api/food-stock?photo=" + encodeURIComponent(d.photo)', 'DEMO_PH(d.photo)')
html = html.replace("/img/logo-orange.png", logo).replace("/img/favicon-32.png","").replace("/img/favicon-64.png","").replace("/img/apple-touch-icon.png","")
html = html.replace("<title>Store Tools · The Beer Depot</title>", "<title>DEMO Store Tools · The Beer Depot</title>", 1)
html = html.replace("<h1>Store Tools</h1>", "<h1>Store Tools <small style=\"font:700 13px var(--body);background:#F26B1D;border-radius:999px;padding:3px 9px;vertical-align:middle\">DEMO</small></h1>", 1)
(root / "demo-store-tools.html").write_text(html)
print("demo-store-tools.html", len(html)//1024, "KB")
