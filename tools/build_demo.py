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
  const DB = { food:{items:{},prices:{},edits:{},toppings:null}, specials:{items:["Spotted Cow 12pk $15.99","Tito's 1.75L $34.99"]},
    sales:{on:true,items:[{id:"s1",name:"Spotted Cow 12pk Cans",price:"15.99",was:"18.99",note:"While supplies last",photo:""}]},
    seasonal:{on:true,title:"Christmas",items:[{id:"c1",name:"Ham Dinner Tray",price:"39.99",note:"Order by Dec 20",photo:""}]},
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
    if(url.startsWith("/api/specials")){ if(post){ DB.specials = {items:b.items.filter(Boolean),updated:new Date().toISOString()}; return ok({ok:true,...DB.specials}); } return ok({...DB.specials,updated:new Date().toISOString()}); }
    if(url.startsWith("/api/sales")){ if(!post) return ok(DB.sales);
      if(b.action==="photo"){ const id = "demo"+Date.now().toString(36); PH[id] = b.data; return ok({ok:true,photo:id}); }
      if(b.action==="save") DB.sales = {on:!!b.on,items:b.items,updated:new Date().toISOString()};
      return ok({ok:true,...DB.sales}); }
    if(url.startsWith("/api/seasonal")){ if(!post) return ok(DB.seasonal);
      if(b.action==="photo"){ const id = "demo"+Date.now().toString(36); PH[id] = b.data; return ok({ok:true,photo:id}); }
      if(b.action==="save") DB.seasonal = {on:!!b.on,title:(b.title||"Seasonal"),items:b.items,updated:new Date().toISOString()};
      return ok({ok:true,...DB.seasonal}); }
    if(url.startsWith("/api/insights")){
      if(b.type==="seen"){ report.badges[b.tab]=0; return ok({ok:true,badges:report.badges,seen:report.seen}); }
      if(b.type==="badges") return ok({badges:report.badges,seen:report.seen});
      return ok(report); }
    if(url.startsWith("/api/bourbon-club")){
      const c = DB.club;
      if(b.action==="remove") c.members = c.members.filter(m=>m.email!==b.email);
      if(b.action==="sending") c.sending = !!b.on;
      if(b.action==="test") return ok({ok:true,bottles:4});
      return ok({sending:c.sending,count:c.members.length,members:c.members,last:{date:"2026-11-05",sent:2,bottles:4},ready:true}); }
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
