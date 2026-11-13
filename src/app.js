/* BotBattle prototype — Matter.js rigid bodies, breakable joints and point damage. */
(() => {
"use strict";
const M=window.Matter;
if(!M){document.getElementById("status").textContent="Physics library could not load. Check your internet connection.";return;}
const {Engine,World,Bodies,Body,Constraint,Composite,Events,Query,Vector}=M;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2, GROUND=760, WORLD_W=3300, GRID=20;
const TYPES={
 core:{name:"Control core",cat:"Structure",w:78,h:46,hp:210,density:.0025,cost:0,color:"#7dcfcb",desc:"The essential control unit. Destroy this to win. Every machine must have exactly one.",price:0},
 beam:{name:"Steel chassis",cat:"Structure",w:68,h:18,hp:100,density:.0018,cost:15,color:"#899dac",desc:"A rigid structural member for attaching wheels, armor and weapons.",price:0},
 armor:{name:"Armor plate",cat:"Structure",w:72,h:19,hp:190,density:.0028,cost:35,color:"#a6b6bd",desc:"Heavy ballistic armor. Takes reduced projectile damage.",price:0},
 wheel:{name:"Drive wheel",cat:"Mobility",r:25,hp:110,density:.0023,cost:30,color:"#b8c9d1",desc:"Motorized rubber wheel. Connects through a freely rotating axle.",price:0,bind:"drive"},
 servo:{name:"Servo hinge",cat:"Mobility",w:24,h:24,hp:76,density:.002,cost:35,color:"#d2a25e",desc:"Powered pivot. Hold the utility key to turn attached components.",price:0,bind:"utility"},
 foot:{name:"Grip foot",cat:"Mobility",w:70,h:15,hp:95,density:.002,cost:22,color:"#91a0aa",desc:"High-friction base for creating braced robots or articulated legs.",price:0},
 spring:{name:"Suspension",cat:"Mobility",w:22,h:38,hp:76,density:.0017,cost:30,color:"#b0bac3",desc:"Compliant connector for suspension and impact isolation.",price:0},
 cannon:{name:"Cannon",cat:"Weapons",w:65,h:22,hp:92,density:.0025,cost:72,color:"#eeaa61",desc:"Heavy shell with strong recoil and severe localized damage.",price:0,bind:"primary",cd:.62},
 mg:{name:"Autocannon",cat:"Weapons",w:61,h:16,hp:66,density:.002,cost:65,color:"#e5ba83",desc:"Fast automatic fire. Good for stripping off exposed modules.",price:0,bind:"primary",cd:.135},
 rocket:{name:"Rocket pod",cat:"Weapons",w:64,h:27,hp:80,density:.0021,cost:125,color:"#e1796a",desc:"Slow explosive projectile dealing area damage to multiple parts.",price:230,bind:"secondary",cd:1.25},
 laser:{name:"Beam laser",cat:"Weapons",w:58,h:17,hp:75,density:.002,cost:130,color:"#87ddd9",desc:"Instant straight-line hit, precise but lower impact force.",price:290,bind:"secondary",cd:.42},
 saw:{name:"Rotary saw",cat:"Weapons",r:27,hp:105,density:.0025,cost:95,color:"#d5b082",desc:"Motorized melee disc; can shred enemy parts at close range.",price:160,bind:"utility"},
 thruster:{name:"Rocket thruster",cat:"Systems",w:33,h:42,hp:75,density:.0018,cost:105,color:"#efa45b",desc:"Applies real upward force while boosting. Try mounting several.",price:170,bind:"boost"},
 battery:{name:"Power battery",cat:"Systems",w:42,h:35,hp:105,density:.002,cost:42,color:"#a0d6a5",desc:"Adds stored energy capacity for firing and propulsion.",price:0},
 shield:{name:"Shield panel",cat:"Systems",w:18,h:72,hp:230,density:.0032,cost:155,color:"#78b6df",desc:"Durable physical defensive barrier with a lot of mass.",price:340}
};
const categories=["All","Structure","Mobility","Weapons","Systems"];
const actions=["driveLeft","driveRight","primary","secondary","boost","utility"];
const actionNames={driveLeft:"Drive left",driveRight:"Drive right",primary:"Primary weapon",secondary:"Secondary weapon",boost:"Boost / thruster",utility:"Utility / servo / saw"};
const defaultKeys={driveLeft:"KeyA",driveRight:"KeyD",primary:"KeyJ",secondary:"KeyK",boost:"Space",utility:"KeyL"};
const store={
 get:(name,fallback)=>{try{const v=JSON.parse(localStorage.getItem("bb."+name));return v===null?fallback:v;}catch(e){return fallback;}},
 put:(name,val)=>{try{localStorage.setItem("bb."+name,JSON.stringify(val));}catch(e){}}
};
let blueprint=store.get("blueprint",null);
let nextId=1;
const starter=()=>[
 {id:1,type:"core",x:0,y:0,angle:0},
 {id:2,type:"beam",x:-62,y:10,angle:0},
 {id:3,type:"beam",x:62,y:10,angle:0},
 {id:4,type:"wheel",x:-67,y:48,angle:0,bind:"drive"},
 {id:5,type:"wheel",x:67,y:48,angle:0,bind:"drive"},
 {id:6,type:"cannon",x:48,y:-48,angle:0,bind:"primary"},
 {id:7,type:"armor",x:-27,y:-36,angle:0},
 {id:8,type:"battery",x:-4,y:40,angle:0}
];
function validateDesign(input){
 if(!Array.isArray(input)||!input.length||input.length>65)return starter();
 const result=input.filter(p=>TYPES[p.type]&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.angle)).map(p=>({id:Number(p.id)||Math.floor(Math.random()*999999),type:p.type,x:clamp(p.x,-750,750),y:clamp(p.y,-600,600),angle:clamp(p.angle,-Math.PI*8,Math.PI*8),bind:actions.includes(p.bind)||p.bind==="drive"?p.bind:undefined}));
 if(result.filter(p=>p.type==="core").length!==1)return starter();
 return result;
}
blueprint=validateDesign(blueprint);
nextId=Math.max(...blueprint.map(p=>p.id))+1;
let credits=store.get("credits",150),wins=store.get("wins",0),unlocks=store.get("unlocks",[]);
if(!Number.isFinite(credits))credits=150;if(!Number.isFinite(wins))wins=0;
if(!Array.isArray(unlocks))unlocks=[];
let keys=Object.assign({},defaultKeys,store.get("keys",{}));
let mode="build",category="All",tool=null,selected=null,drag=null,sandbox=true;
let undoStack=[],engine=null,actors=[],player=null,enemy=null,projectiles=[],particles=[],effects=[];
let elapsed=0,cameraX=700,zoom=1,ended=false,matchStats={damage:0,kills:0};
let canvas=$("game"),ctx=canvas.getContext("2d"),cw=800,ch=500,dpr=1;
let pointer={x:0,y:0,moved:false,down:false};
const down=new Set();let mappingListen=null,lastTime=0,accumulator=0,toastTimer=0;
const wheelTypes=["wheel"],gunTypes=["cannon","mg","rocket","laser"];
function getType(t){return TYPES[t]||TYPES.beam;}
function persist(){store.put("blueprint",blueprint);store.put("credits",credits);store.put("wins",wins);store.put("unlocks",unlocks);$("credits").textContent=credits;$("wins").textContent=wins;}
function flash(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200);}
function setStatus(s){$("status").textContent=s;}
function snapshot(){undoStack.push(JSON.stringify(blueprint));if(undoStack.length>35)undoStack.shift();}
function allowed(type){return sandbox||!getType(type).price||unlocks.includes(type);}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function parentFor(p,previous){
 let best=null,score=Infinity;
 for(const candidate of previous){if(candidate.id===p.id)continue;const d=dist(p,candidate);if(d<score){score=d;best=candidate;}}
 return score<=116?best:null;
}
function connectivity(design){
 const attached=[design.find(p=>p.type==="core")].filter(Boolean),links=[],loose=[];
 for(const p of design){if(p.type==="core")continue;
   const parent=parentFor(p,attached);
   if(parent){links.push({parent,child:p});attached.push(p);}else loose.push(p);
 }
 return {links,loose};
}
function updateStats(){
 const sum=key=>blueprint.reduce((a,p)=>a+(getType(p.type)[key]||0),0);
 const mass=blueprint.reduce((a,p)=>a+(getType(p.type).density||.002)*(p.type==="wheel"||p.type==="saw"?Math.PI*getType(p.type).r**2:getType(p.type).w*getType(p.type).h),0);
 const attached=connectivity(blueprint);
 $("statParts").textContent=blueprint.length;
 $("statMass").textContent=mass.toFixed(1)+" kg";
 $("statHP").textContent=sum("hp");
 $("statPower").textContent=blueprint.filter(p=>["cannon","mg","rocket","laser","thruster"].includes(p.type)).length*12+" W";
 $("statCost").textContent=sum("cost");
 const warn=$("buildWarning");
 if(attached.loose.length){warn.className="warning";warn.textContent=attached.loose.length+" unattached part(s). Place within ~116 px of a connected component, or they will fall away.";}
 else{warn.className="warning good";warn.textContent="STRUCTURE CONNECTED — "+attached.links.length+" physical joints"; }
 $("partsCount").textContent=blueprint.length+" PLACED";
}
function glyph(type){
 const c=getType(type).color;
 let shape="";
 if(type==="wheel"||type==="saw")shape='<circle cx="35" cy="23" r="17" fill="#26333a" stroke="'+c+'" stroke-width="5"/><circle cx="35" cy="23" r="5" fill="'+c+'"/>';
 else if(type==="cannon"||type==="mg"||type==="laser"||type==="rocket")shape='<rect x="10" y="15" width="27" height="19" rx="3" fill="#536675" stroke="'+c+'"/><rect x="37" y="19" width="27" height="9" rx="1" fill="'+c+'"/>';
 else if(type==="thruster")shape='<path d="M24 6 H46 L52 27 L35 40 L18 27 Z" fill="#384c56" stroke="'+c+'" stroke-width="3"/><path d="M28 33 L35 45 L42 33" fill="'+c+'"/>';
 else if(type==="servo"||type==="spring")shape='<circle cx="35" cy="23" r="15" fill="#26333a" stroke="'+c+'" stroke-width="5"/><path d="M22 23 H48 M35 10 V36" stroke="'+c+'" stroke-width="4"/>';
 else shape='<rect x="9" y="13" width="52" height="22" rx="3" fill="#34444c" stroke="'+c+'" stroke-width="3"/><circle cx="19" cy="24" r="3" fill="'+c+'"/><circle cx="51" cy="24" r="3" fill="'+c+'"/>';
 return '<svg viewBox="0 0 70 46" aria-hidden="true">'+shape+'</svg>';
}
function drawPalette(){
 const cat=$("categories");cat.innerHTML="";
 categories.forEach(c=>{const b=document.createElement("button");b.textContent=c;b.className=category===c?"active":"";b.onclick=()=>{category=c;drawPalette();};cat.appendChild(b);});
 const box=$("parts");box.innerHTML="";
 Object.keys(TYPES).filter(t=>t!=="core"&&(category==="All"||TYPES[t].cat===category)).forEach(type=>{
  const t=TYPES[type],unlocked=allowed(type),b=document.createElement("button");
  b.className="part-btn"+(tool===type?" selected":"")+(unlocked?"":" locked");
  b.innerHTML='<div class="part-icon">'+glyph(type)+'</div><div class="part-name">'+t.name+'</div><div class="part-price">'+(!unlocked?"🔒 "+t.price+" SCRAP":t.cost+" BP")+'</div>';
  b.title=t.desc;
  b.onclick=()=>{if(!allowed(type)){flash("Unlock "+t.name+" in the shop, or turn on Sandbox.");return;}setMode("build");tool=tool===type?null:type;selected=null;drawPalette();showInspector();setStatus(tool?"CLICK BLUEPRINT TO PLACE "+t.name.toUpperCase():"SELECT A COMPONENT");};
  box.appendChild(b);
 });
}
function showInspector(){
 const root=$("inspector"),part=blueprint.find(p=>p.id===selected);
 if(!part){root.innerHTML='<div class="empty">Select any component in the workshop to inspect and configure it.<p>DRAG parts to move them. Q / E rotate. Delete removes, Ctrl+Z undoes.</p></div>';updateStats();return;}
 const t=getType(part.type),editable=part.type!=="core";
 let html='<div class="inspector-head"><h2>'+t.name.toUpperCase()+'</h2><span class="pill">'+t.cat+'</span></div><p class="info-desc">'+t.desc+'</p><div class="twocol"><div class="field"><label>X POSITION</label><input id="propX" type="number" value="'+part.x+'" step="10"></div><div class="field"><label>Y POSITION</label><input id="propY" type="number" value="'+part.y+'" step="10"></div></div><div class="field"><label>ROTATION</label><input id="propAngle" type="number" step="15" value="'+Math.round(part.angle*180/Math.PI)+'"></div>';
 if(t.bind){html+='<div class="field"><label>CONTROL GROUP</label><select id="propBind">';
  ["drive","primary","secondary","boost","utility"].forEach(opt=>{html+='<option value="'+opt+'"'+((part.bind||t.bind)===opt?" selected":"")+'>'+opt.toUpperCase()+'</option>';});
  html+='</select></div>';}
 html+='<div class="metric"><span>HEALTH</span><b>'+t.hp+' HP</b></div><div class="metric"><span>MASS</span><b>'+t.density+'</b></div>';
 if(editable)html+='<div class="inspector-buttons"><button id="duplicate">DUPLICATE</button><button id="rotate">ROTATE 15°</button><button class="danger" id="delete">DELETE</button></div>';
 root.innerHTML=html;
 for(const k of ["X","Y","Angle"]){$("prop"+k).addEventListener("change",e=>{snapshot();part[k==="X"?"x":k==="Y"?"y":"angle"]=k==="Angle"?Number(e.target.value)*Math.PI/180:clamp(Number(e.target.value),-750,750);persist();updateStats();});}
 if(t.bind)$("propBind").addEventListener("change",e=>{snapshot();part.bind=e.target.value;persist();});
 if(editable){$("delete").onclick=deleteSelected;$("duplicate").onclick=duplicateSelected;$("rotate").onclick=()=>rotateSelected(15);}
 updateStats();
}
function rotateSelected(deg){const p=blueprint.find(p=>p.id===selected);if(!p||p.type==="core")return;snapshot();p.angle+=deg*Math.PI/180;persist();showInspector();}
function deleteSelected(){const p=blueprint.find(p=>p.id===selected);if(!p||p.type==="core")return;snapshot();blueprint=blueprint.filter(n=>n.id!==p.id);selected=null;persist();showInspector();flash("Component removed");}
function duplicateSelected(){const p=blueprint.find(p=>p.id===selected);if(!p||p.type==="core")return;if(blueprint.length>=65){flash("Maximum 65 components");return;}snapshot();const copy={...p,id:nextId++,x:p.x+40,y:p.y+20};blueprint.push(copy);selected=copy.id;persist();showInspector();}
function undo(){if(!undoStack.length)return;blueprint=JSON.parse(undoStack.pop());selected=null;tool=null;persist();drawPalette();showInspector();flash("Undone");}
function resetStarter(){snapshot();blueprint=starter();nextId=Math.max(nextId,9);selected=null;tool=null;persist();drawPalette();showInspector();flash("Starter bot loaded");}
function resize(){const rect=canvas.getBoundingClientRect();cw=Math.max(1,rect.width);ch=Math.max(1,rect.height);dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
const editOrigin=()=>({x:cw/2,y:ch*.54});
function screenToEdit(sx,sy){const p=editOrigin();return{x:(sx-p.x)/zoom,y:(sy-p.y)/zoom};}
function screenToWorld(sx,sy){return{x:cameraX+(sx-cw/2)/zoom,y:GROUND+(sy-(ch-70))/zoom};}
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function partAt(pos){
 for(let i=blueprint.length-1;i>=0;i--){const p=blueprint[i],t=getType(p.type),dx=pos.x-p.x,dy=pos.y-p.y,c=Math.cos(-p.angle),s=Math.sin(-p.angle),x=dx*c-dy*s,y=dx*s+dy*c;
 if(t.r?Math.hypot(x,y)<=t.r+4:Math.abs(x)<=t.w/2+4&&Math.abs(y)<=t.h/2+4)return p;}
 return null;
}
canvas.addEventListener("pointerdown",e=>{
 const s=pointerPos(e);pointer={...pointer,x:s.x,y:s.y,down:true};
 if(mode!=="build")return;
 const pos=screenToEdit(s.x,s.y),hit=partAt(pos);
 if(tool&&!hit){if(blueprint.length>=65){flash("Maximum 65 parts");return;}snapshot();const type=tool,p={id:nextId++,type,x:Math.round(pos.x/GRID)*GRID,y:Math.round(pos.y/GRID)*GRID,angle:0};if(TYPES[type].bind)p.bind=TYPES[type].bind;blueprint.push(p);selected=p.id;persist();showInspector();setStatus("PLACED "+TYPES[type].name.toUpperCase());return;}
 if(hit){selected=hit.id;drag=hit.type==="core"?null:{id:hit.id,offsetX:hit.x-pos.x,offsetY:hit.y-pos.y,moved:false,snapshot:false};tool=null;drawPalette();showInspector();}
 else{selected=null;tool=null;drawPalette();showInspector();}
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
 const s=pointerPos(e);pointer.x=s.x;pointer.y=s.y;pointer.moved=true;
 if(mode==="build"&&drag&&pointer.down){const p=blueprint.find(p=>p.id===drag.id);if(!p)return;const q=screenToEdit(s.x,s.y),x=Math.round((q.x+drag.offsetX)/GRID)*GRID,y=Math.round((q.y+drag.offsetY)/GRID)*GRID;if(x!==p.x||y!==p.y){if(!drag.snapshot){snapshot();drag.snapshot=true;}p.x=x;p.y=y;drag.moved=true;updateStats();}}
});
const finishDrag=()=>{pointer.down=false;if(drag&&drag.moved){persist();showInspector();}drag=null;};
canvas.addEventListener("pointerup",finishDrag);canvas.addEventListener("pointercancel",finishDrag);
canvas.addEventListener("wheel",e=>{e.preventDefault();zoom=clamp(zoom*(e.deltaY<0?1.1:.9),.48,1.8);},{passive:false});
document.addEventListener("keydown",e=>{
 if(mappingListen){keys[mappingListen]=e.code;store.put("keys",keys);mappingListen=null;drawMappings();e.preventDefault();return;}
 const typing=e.target&&["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName);if(typing)return;
 down.add(e.code);
 if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
 if(mode==="build"){
  if((e.ctrlKey||e.metaKey)&&e.code==="KeyZ"){e.preventDefault();undo();}
  if(e.code==="Delete"||e.code==="Backspace")deleteSelected();
  if(e.code==="KeyQ")rotateSelected(-15);
  if(e.code==="KeyE")rotateSelected(15);
  if(e.code==="Escape"){selected=null;tool=null;drawPalette();showInspector();}
 }else if(e.code==="Escape")setMode("build");
});
document.addEventListener("keyup",e=>down.delete(e.code));
window.addEventListener("blur",()=>{down.clear();pointer.down=false;drag=null;});
function keyDown(action){return down.has(keys[action]);}
function drawMappings(){
 const root=$("mapping");root.innerHTML="";
 for(const a of actions){const row=document.createElement("div");row.className="map-row";const title=document.createElement("span");title.textContent=actionNames[a];const btn=document.createElement("button");btn.textContent=mappingListen===a?"PRESS KEY...":keys[a].replace(/^(Key|Digit)/,"");if(mappingListen===a)btn.classList.add("listening");btn.onclick=()=>{mappingListen=a;drawMappings();};row.append(title,btn);root.appendChild(row);}
}
function setMode(next){
 if(next!=="build"&&!blueprint.some(p=>p.type==="core")){flash("Build a control core first");return;}
 mode=next;ended=false;accumulator=0;projectiles=[];particles=[];effects=[];elapsed=0;
 document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
 const play=mode!=="build";$("hud").hidden=!play;$("message").hidden=true;$("stageTitle").textContent=mode==="build"?"WORKSHOP / BLUEPRINT EDITOR":mode==="test"?"TEST CHAMBER / LIVE PHYSICS":"SCRAP ARENA / LIVE NPC MATCH";
 $("help").innerHTML=play?"A / D DRIVE <span>·</span> MOUSE AIM <span>·</span> CLICK OR J FIRE <span>·</span> K SECONDARY <span>·</span> SPACE BOOST <span>·</span> ESC WORKSHOP":"GRID 20 PX <span>·</span> WHEEL TO ZOOM <span>·</span> Q/E ROTATE <span>·</span> DEL REMOVE";
 $("undoBtn").disabled=play;$("clearBtn").disabled=play;
 if(play){tool=null;selected=null;drawPalette();showInspector();startSimulation(next);}
 else {engine=null;actors=[];player=null;enemy=null;setStatus("WORKSHOP READY — SELECT A COMPONENT");}
}
function buildBody(p,actor){
 const t=getType(p.type),ang=actor.mirror?Math.PI-p.angle:p.angle;
 const x=actor.spawnX+(actor.mirror?-p.x:p.x),y=actor.spawnY+p.y;
 const opt={label:p.type,friction:p.type==="wheel"||p.type==="foot"?1:.65,frictionStatic:1.5,frictionAir:.005,restitution:.08,density:t.density,collisionFilter:{group:actor.group}};
 const b=t.r?Bodies.circle(x,y,t.r,opt):Bodies.rectangle(x,y,t.w,t.h,opt);
 Body.setAngle(b,ang);
 const piece={id:p.id,type:p.type,body:b,actor,hp:t.hp,maxHp:t.hp,dead:false,bind:p.bind||t.bind||null,cd:0,heat:0};
 b.plugin={...b.plugin,part:piece};
 World.add(engine.world,b);
 return piece;
}
function localPoint(body,world){const dx=world.x-body.position.x,dy=world.y-body.position.y,c=Math.cos(-body.angle),s=Math.sin(-body.angle);return{x:dx*c-dy*s,y:dx*s+dy*c};}
function makeLink(a,b){
 const mid={x:(a.body.position.x+b.body.position.x)/2,y:(a.body.position.y+b.body.position.y)/2};
 const dx=b.body.position.x-a.body.position.x,dy=b.body.position.y-a.body.position.y,len=Math.max(1,Math.hypot(dx,dy));
 const isPivot=["wheel","servo","cannon","mg","rocket","laser","saw"].includes(b.type);
 const n=isPivot?1:2,link={a,b,constraints:[],hp:58,maxHp:58,active:true,pivot:isPivot};
 for(let i=0;i<n;i++){
  const side=i===0?-1:1,span=isPivot?0:13;
  const world=isPivot?{x:b.body.position.x,y:b.body.position.y}:{x:mid.x+side*(-dy/len)*span,y:mid.y+side*(dx/len)*span};
  const springy=b.type==="spring";
  const c=Constraint.create({bodyA:a.body,bodyB:b.body,pointA:localPoint(a.body,world),pointB:localPoint(b.body,world),length:0,stiffness:springy?.15:.9,damping:springy?.22:.15,render:{visible:false}});
  World.add(engine.world,c);link.constraints.push(c);
 }
 return link;
}
function makeActor(id,design,x,y,mirror,ai){
 const actor={id,team:id,spawnX:x,spawnY:y,mirror,group:id==="player"?-1:id==="enemy"?-2:-3,parts:[],links:[],core:null,ai,alive:true,energy:100,maxEnergy:100,dir:0,fire:false,secondary:false,boost:false,utility:false,score:0};
 const safe=validateDesign(design);
 for(const p of safe)actor.parts.push(buildBody(p,actor));
 actor.core=actor.parts.find(p=>p.type==="core");
 const connected=[safe.find(p=>p.type==="core")],lookup=new Map(actor.parts.map(p=>[p.id,p]));
 for(const p of safe){if(p.type==="core")continue;const parent=parentFor(p,connected);if(parent){actor.links.push(makeLink(lookup.get(parent.id),lookup.get(p.id)));connected.push(p);}}
 actor.maxEnergy=100+actor.parts.filter(p=>p.type==="battery").length*70;
 actor.energy=actor.maxEnergy;
 actors.push(actor);return actor;
}
function npcDesign(){
 return [
 {id:101,type:"core",x:0,y:0,angle:0},
 {id:102,type:"beam",x:-64,y:7,angle:0},
 {id:103,type:"beam",x:64,y:7,angle:0},
 {id:104,type:"wheel",x:-71,y:47,angle:0},
 {id:105,type:"wheel",x:71,y:47,angle:0},
 {id:106,type:"cannon",x:43,y:-47,angle:0},
 {id:107,type:"armor",x:-36,y:-38,angle:0},
 {id:108,type:"armor",x:83,y:-29,angle:Math.PI/2},
 {id:109,type:"battery",x:-4,y:38,angle:0}
 ];
}
function startSimulation(kind){
 engine=Engine.create({positionIterations:10,velocityIterations:8,constraintIterations:7,enableSleeping:false});
 engine.gravity.y=1.25;
 const ground=Bodies.rectangle(WORLD_W/2,GROUND+70,WORLD_W+150,140,{isStatic:true,label:"floor",friction:1,render:{visible:false}});
 const left=Bodies.rectangle(-45,GROUND/2,90,GROUND+100,{isStatic:true});
 const right=Bodies.rectangle(WORLD_W+45,GROUND/2,90,GROUND+100,{isStatic:true});
 World.add(engine.world,[ground,left,right]);
 player=makeActor("player",blueprint,630,GROUND-128,false,false);
 enemy=makeActor("enemy",npcDesign(),kind==="test"?1450:1550,GROUND-128,true,kind==="battle");
 cameraX=player.core.body.position.x;zoom=clamp(zoom,.7,1.35);
 Events.on(engine,"collisionStart",collisionDamage);
 $("enemyStatus").textContent=kind==="test"?"TARGET DUMMY":"100%";
 $("enemyHP").style.width="100%";$("playerHP").style.width="100%";
 setStatus(kind==="test"?"TEST LIVE — THE TARGET DUMMY DOES NOT FIGHT BACK":"NPC ONLINE — DESTROY SCRAPJAW'S CONTROL CORE");
}
function isPowered(part){
 if(part.dead||!part.actor.alive)return false;
 const actor=part.actor,seen=new Set([actor.core]),open=[actor.core];
 while(open.length){const cur=open.pop();if(cur===part)return true;
 for(const l of actor.links){if(!l.active)continue;const next=l.a===cur?l.b:l.b===cur?l.a:null;if(next&&!next.dead&&!seen.has(next)){seen.add(next);open.push(next);}}}
 return false;
}
function linkBreak(link,at){
 if(!link||!link.active)return;link.active=false;
 for(const c of link.constraints)World.remove(engine.world,c);
 const pos=at||link.b.body.position;burst(pos,12,"#f4a85f",2.8);spark(pos);
}
function damage(part,amount,hit,owner,force){
 if(!part||part.dead||amount<=0)return;
 const t=getType(part.type),dmg=amount*(part.type==="armor"?.7:part.type==="shield"?.6:1);
 part.hp=Math.max(0,part.hp-dmg);
 part.heat=Math.min(1,part.heat+dmg/65);
 if(owner==="player"&&part.actor!==player)matchStats.damage+=dmg;
 if(force){const v=Vector.sub(part.body.position,hit),n=Vector.magnitude(v)||1;Body.applyForce(part.body,hit,{x:v.x/n*force*.000025*part.body.mass,y:v.y/n*force*.000025*part.body.mass});}
 const link=part.actor.links.find(l=>l.active&&l.b===part);
 if(link){link.hp-=amount*.34;if(link.hp<=0)linkBreak(link,hit);}
 burst(hit,Math.min(9,Math.max(2,Math.floor(dmg/9))),part.type==="shield"?"#7ddfff":"#ffb46a",2.4);
 if(part.hp<=0){
  part.dead=true;part.body.frictionAir=.013;
  spark(part.body.position);burst(part.body.position,25,part.type==="battery"?"#8cf9be":"#ffbd77",5);
  if(link)linkBreak(link,part.body.position);
  if(part.type==="battery")part.actor.energy=Math.max(0,part.actor.energy-50);
  if(part.type==="core"){part.actor.alive=false;for(const l of part.actor.links)if(l.active)linkBreak(l,part.body.position);finishMatch(part.actor);}
 }
}
function collisionDamage(event){
 for(const pair of event.pairs){
  const a=pair.bodyA,b=pair.bodyB,pa=a.plugin&&a.plugin.part,pb=b.plugin&&b.plugin.part;
  if(pa&&pb&&pa.actor===pb.actor)continue;
  const speed=pa&&pb?Vector.magnitude(Vector.sub(a.velocity,b.velocity)):pa?a.speed:b.speed;
  if(speed<6.5)continue;
  const amount=Math.min(36,(speed-6.5)*1.35);
  const hit=pair.collision&&pair.collision.supports&&pair.collision.supports[0]||{x:(a.position.x+b.position.x)/2,y:(a.position.y+b.position.y)/2};
  if(pa)damage(pa,amount,hit,pb?pb.actor.team:null,speed);
  if(pb)damage(pb,amount,hit,pa?pa.actor.team:null,speed);
 }
}
function finishMatch(loser){
 if(ended)return;ended=true;
 const won=loser!==player;
 const message=$("message");
 message.innerHTML=(mode==="test"?"TARGET DESTROYED":won?"VICTORY":"ROBOT DESTROYED")+'<small>'+(mode==="test"?"Your weapons and component damage are working.":won?"+"+(125+Math.min(75,Math.round(matchStats.damage/20)))+" scrap credits earned":"Repair your design and try again. +20 scrap credits")+'</small>';
 message.hidden=false;
 if(mode==="battle"){if(won){wins++;credits+=125+Math.min(75,Math.round(matchStats.damage/20));}else credits+=20;persist();}
 setStatus("MATCH ENDED — RETURN TO WORKSHOP OR START A NEW MATCH");
}
function muzzle(part){const b=part.body,t=getType(part.type),a=b.angle,dist=(t.w||45)*.53;return{x:b.position.x+Math.cos(a)*dist,y:b.position.y+Math.sin(a)*dist};}
function rayHit(from,to,owner,radius){
 const bds=Composite.allBodies(engine.world).filter(b=>b.plugin&&b.plugin.part&&b.plugin.part.actor.team!==owner);
 // Sample along the projectile trajectory. Works even for very fast projectiles.
 const length=Math.hypot(to.x-from.x,to.y-from.y),n=Math.max(1,Math.ceil(length/5));
 for(let i=1;i<=n;i++){const x=lerp(from.x,to.x,i/n),y=lerp(from.y,to.y,i/n);const hits=Query.point(bds,{x,y});
 if(hits.length)return{part:hits[0].plugin.part,point:{x,y}};}
 return null;
}
function spawnBullet(part){
 const t=getType(part.type),b=part.body,m=muzzle(part),a=b.angle;
 const params=part.type==="cannon"?{speed:31,dmg:37,r:5,color:"#ffca80"}:part.type==="mg"?{speed:37,dmg:12,r:3,color:"#fbe1a4"}:{speed:20,dmg:55,r:7,color:"#ff916c",splash:85};
 projectiles.push({x:m.x,y:m.y,vx:Math.cos(a)*params.speed+b.velocity.x,vy:Math.sin(a)*params.speed+b.velocity.y,r:params.r,dmg:params.dmg,owner:part.actor.team,color:params.color,splash:params.splash||0,life:110,trail:[]});
 Body.applyForce(b,m,{x:-Math.cos(a)*b.mass*(part.type==="cannon"?.004:.0017),y:-Math.sin(a)*b.mass*(part.type==="cannon"?.004:.0017)});
 burst(m,4,"#ffdb9a",1.7);
}
function laserFire(part){
 const m=muzzle(part),a=part.body.angle,to={x:m.x+Math.cos(a)*1050,y:m.y+Math.sin(a)*1050};
 const hit=rayHit(m,to,part.actor.team,0),end=hit?hit.point:to;
 effects.push({type:"beam",from:m,to:end,life:9,max:9,color:"#87f7f7"});
 if(hit)damage(hit.part,24,hit.point,part.actor.team,2);
}
function blast(at,r,damageAmount,owner){
 effects.push({type:"blast",x:at.x,y:at.y,r,life:22,max:22});
 burst(at,32,"#ff9e62",6.5);
 for(const a of actors)if(a.team!==owner)for(const p of a.parts){if(p.dead)continue;const d=dist(p.body.position,at);if(d<r)damage(p,damageAmount*(1-d/r),at,owner,damageAmount*2);}
}
function burst(at,n,color,speed){
 for(let i=0;i<n&&particles.length<450;i++){
  const a=Math.random()*TAU,force=(.3+Math.random())*speed;
  particles.push({x:at.x,y:at.y,vx:Math.cos(a)*force,vy:Math.sin(a)*force,life:18+Math.random()*28,max:46,color,size:1+Math.random()*2.5});
 }
}
function spark(pos){effects.push({type:"spark",x:pos.x,y:pos.y,life:13,max:13});}
function aimAndShoot(actor,target,delta){
 for(const p of actor.parts){
  if(p.dead||!isPowered(p))continue;
  p.cd=Math.max(0,p.cd-delta);
  p.heat=Math.max(0,p.heat-delta*.3);
  if(gunTypes.includes(p.type)){
   if(target){let a=Math.atan2(target.y-p.body.position.y,target.x-p.body.position.x);const old=p.body.angle;while(a-old>Math.PI)a-=TAU;while(a-old<-Math.PI)a+=TAU;Body.setAngle(p.body,lerp(old,a,.23));Body.setAngularVelocity(p.body,0);}
   const active=p.bind==="secondary"?actor.secondary:actor.fire;
   const cost=p.type==="rocket"?24:p.type==="laser"?11:p.type==="cannon"?9:2.5;
   if(active&&p.cd<=0&&actor.energy>=cost&&!ended){actor.energy-=cost;p.cd=getType(p.type).cd;if(p.type==="laser")laserFire(p);else spawnBullet(p);}
  }
  if(p.type==="servo"&&actor.utility)Body.setAngularVelocity(p.body,clamp(p.body.angularVelocity+.07,-.25,.25));
  if(p.type==="saw"&&actor.utility){
   Body.setAngularVelocity(p.body,.48);
   if(p.cd<=0){p.cd=.12;for(const foe of actors){if(foe===actor)continue;for(const other of foe.parts){if(other.dead)continue;const d=dist(p.body.position,other.body.position),radius=getType(other.type).r||Math.max(getType(other.type).w,getType(other.type).h)*.4;
    if(d<getType("saw").r+radius){damage(other,11,other.body.position,actor.team,8);break;}}}}
  }
  if(p.type==="thruster"&&actor.boost&&actor.energy>0){
   const a=p.body.angle,force=.0034*Math.max(5,actor.parts.reduce((sum,part)=>sum+part.body.mass,0));
   Body.applyForce(p.body,p.body.position,{x:Math.sin(a)*force,y:-Math.cos(a)*force});actor.energy=Math.max(0,actor.energy-.16);
   if(Math.random()<.5)burst({x:p.body.position.x-Math.sin(a)*16,y:p.body.position.y+Math.cos(a)*22},2,"#ffb76b",3);
  }
 }
}
function stepControl(actor,dt){
 if(!actor.alive)return;
 if(actor.ai){
  const target=player.core.body.position,me=actor.core.body.position,dx=target.x-me.x,d=Math.abs(dx);
  actor.dir=d>335?Math.sign(dx):d<195?-Math.sign(dx):0;
  actor.fire=d<1000&&Math.abs(target.y-me.y)<250;
  actor.secondary=actor.fire;
  actor.boost=false;
 }else if(actor===player){
  actor.dir=(keyDown("driveRight")?1:0)-(keyDown("driveLeft")?1:0);
  actor.fire=keyDown("primary")||pointer.down;
  actor.secondary=keyDown("secondary");
  actor.boost=keyDown("boost");
  actor.utility=keyDown("utility");
 }else{actor.dir=0;actor.fire=false;actor.secondary=false;actor.boost=false;actor.utility=false;}
 const batteryCount=actor.parts.filter(p=>p.type==="battery"&&!p.dead&&isPowered(p)).length;
 actor.energy=clamp(actor.energy+dt*(8+batteryCount*12),0,actor.maxEnergy);
 for(const p of actor.parts)if(p.type==="wheel"&&!p.dead&&isPowered(p)&&p.bind==="drive"){
  const speed=actor.dir*.34;
  Body.setAngularVelocity(p.body,lerp(p.body.angularVelocity,speed,.16));
 }
 const mouse=screenToWorld(pointer.x,pointer.y);
 const target=actor.ai?player.core.body.position:actor===player?(pointer.moved?mouse:{x:actor.core.body.position.x+450,y:actor.core.body.position.y-45}):null;
 aimAndShoot(actor,target,dt);
}
function stepProjectiles(dt){
 const f=dt*60;
 for(let i=projectiles.length-1;i>=0;i--){
  const p=projectiles[i],from={x:p.x,y:p.y},to={x:p.x+p.vx*f,y:p.y+p.vy*f};
  if(p.splash)p.vy+=.055*f;else p.vy+=.022*f;
  const hit=rayHit(from,to,p.owner,p.r);
  p.trail.push(from);if(p.trail.length>8)p.trail.shift();
  if(hit){
   if(p.splash)blast(hit.point,p.splash,p.dmg,p.owner);
   else damage(hit.part,p.dmg,hit.point,p.owner,p.dmg);
   projectiles.splice(i,1);continue;
  }
  p.x=to.x;p.y=to.y;p.life-=f;
  if(p.y>=GROUND||p.x<0||p.x>WORLD_W||p.life<=0){if(p.splash&&p.x>0&&p.x<WORLD_W)blast({x:p.x,y:Math.min(GROUND,p.y)},p.splash,p.dmg,p.owner);projectiles.splice(i,1);}
 }
}
function simulate(dt){
 if(!engine)return;elapsed+=dt;
 if(!ended){stepControl(player,dt);stepControl(enemy,dt);}
 Engine.update(engine,dt*1000);
 stepProjectiles(dt);
 for(const a of actors)for(const p of a.parts)p.heat=Math.max(0,p.heat-dt*.12);
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.vy+=.12*dt*60;p.vx*=.99;p.life-=dt*60;if(p.life<=0)particles.splice(i,1);}
 for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt*60;if(effects[i].life<=0)effects.splice(i,1);}
 cameraX=lerp(cameraX,clamp(player.core.body.position.x,Math.min(cw/2,700),WORLD_W-Math.min(cw/2,700)),.06);
 if(!ended)for(const a of actors)if(a.core.body.position.y>GROUND+400&&!a.core.dead){damage(a.core,10000,a.core.body.position,a===player?"enemy":"player",0);}
 updateHUD();
}
function updateHUD(){
 if(!player||!enemy)return;
 for(const [actor,pct,status] of [[player,$("playerHP"),$("playerStatus")],[enemy,$("enemyHP"),$("enemyStatus")]]){
  const h=Math.round(100*actor.core.hp/actor.core.maxHp);
  pct.style.width=h+"%";status.textContent=h+"% CORE · "+actor.parts.filter(p=>!p.dead).length+" PARTS";
 }
}
function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawPart(part,px,py,angle,opts={}){
 const type=part.type,t=getType(type),dead=!!part.dead,color=dead?"#4c545b":t.color;
 ctx.save();ctx.translate(px,py);ctx.rotate(angle);
 if(opts.selected){ctx.shadowColor="#f7a448";ctx.shadowBlur=20;}
 if(type==="wheel"){
  ctx.fillStyle="#141c21";ctx.strokeStyle=dead?"#676d70":"#61727a";ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,25,0,TAU);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#273742";ctx.lineWidth=5;for(let i=0;i<10;i++){const a=i*TAU/10;ctx.beginPath();ctx.moveTo(Math.cos(a)*19,Math.sin(a)*19);ctx.lineTo(Math.cos(a)*25,Math.sin(a)*25);ctx.stroke();}
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,13,0,TAU);ctx.stroke();
  ctx.fillStyle="#dce0d7";for(let i=0;i<5;i++){const a=i*TAU/5;ctx.beginPath();ctx.arc(Math.cos(a)*8,Math.sin(a)*8,2.1,0,TAU);ctx.fill();}
 }else if(type==="saw"){
  const n=15;ctx.beginPath();for(let i=0;i<n*2;i++){const a=i*Math.PI/n,r=i%2?23:30;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fillStyle=dead?"#535b63":"#c7c8c0";ctx.fill();ctx.strokeStyle="#495967";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#384651";ctx.beginPath();ctx.arc(0,0,8,0,TAU);ctx.fill();ctx.fillStyle="#ffb46b";ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.fill();
 }else if(type==="core"){
  roundedRect(-39,-23,78,46,5);ctx.fillStyle="#293e45";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle="#243139";ctx.fillRect(-33,-16,66,32);
  ctx.strokeStyle="#5b7984";ctx.lineWidth=2;for(const y of [-13,13]){ctx.beginPath();ctx.moveTo(-26,y);ctx.lineTo(26,y);ctx.stroke();}
  ctx.fillStyle=dead?"#6c4644":"#83f7e4";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=dead?0:13;
  ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(16,0);ctx.lineTo(0,15);ctx.lineTo(-16,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
 }else if(type==="cannon"||type==="mg"||type==="rocket"||type==="laser"){
  const h=t.h,w=t.w;roundedRect(-w/2,-h/2,w*.58,h,3);ctx.fillStyle="#445762";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=dead?"#555a60":"#1d2930";ctx.fillRect(-1,-h*.3,w*.49,h*.6);
  ctx.fillStyle=color;ctx.fillRect(w*.38,-h*.25,w*.16,h*.5);
  if(type==="rocket"){ctx.fillStyle="#ab4f43";ctx.fillRect(-12,-h*.42,19,h*.84);ctx.fillStyle="#d5c0a2";for(let i=-1;i<=1;i++)ctx.fillRect(10,-9+i*8,13,4);}
  if(type==="laser"){ctx.fillStyle="#adfffb";ctx.fillRect(10,-3,22,6);}
  for(let i=0;i<3;i++){ctx.fillStyle="#849baa";ctx.fillRect(-w*.34+i*8,-h*.32,4,3);}
 }else if(type==="thruster"){
  roundedRect(-t.w/2,-t.h/2,t.w,t.h,4);ctx.fillStyle="#374650";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#bb854f";ctx.fillRect(-13,11,26,8);
  ctx.fillStyle="#1a232b";ctx.fillRect(-10,-12,20,16);ctx.strokeStyle="#7996a4";ctx.strokeRect(-10,-12,20,16);
 }else if(type==="battery"){
  roundedRect(-21,-17.5,42,35,4);ctx.fillStyle="#3c534b";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();
  ctx.fillStyle="#a3e8ac";ctx.beginPath();ctx.moveTo(5,-13);ctx.lineTo(-8,3);ctx.lineTo(0,3);ctx.lineTo(-5,13);ctx.lineTo(11,-5);ctx.lineTo(3,-5);ctx.fill();
 }else if(type==="servo"){
  ctx.fillStyle="#313c43";ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,12,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,5,0,TAU);ctx.fill();
 }else if(type==="spring"){
  ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-7,-19);for(let i=0;i<8;i++)ctx.lineTo(i%2?9:-9,-16+i*4);ctx.lineTo(7,18);ctx.stroke();
 }else{
  roundedRect(-t.w/2,-t.h/2,t.w,t.h,3);ctx.fillStyle=dead?"#454a50":"#35434d";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();
  ctx.strokeStyle="#5f7681";ctx.lineWidth=1;
  if(type==="armor"||type==="shield"){for(let i=-t.w/2+12;i<t.w/2-3;i+=16){ctx.beginPath();ctx.moveTo(i,-t.h/2+4);ctx.lineTo(i+5,t.h/2-4);ctx.stroke();}}
  else {ctx.beginPath();ctx.moveTo(-t.w/2+8,-t.h/2+4);ctx.lineTo(t.w/2-8,t.h/2-4);ctx.moveTo(t.w/2-8,-t.h/2+4);ctx.lineTo(-t.w/2+8,t.h/2-4);ctx.stroke();}
  ctx.fillStyle="#9ab1ba";for(const x of [-t.w/2+8,t.w/2-8]){ctx.beginPath();ctx.arc(x,0,2,0,TAU);ctx.fill();}
 }
 if(opts.health&&part.hp<part.maxHp){
  ctx.fillStyle="#161d22";ctx.fillRect(-22,-(t.h||t.r*2)/2-12,44,4);
  ctx.fillStyle=part.hp/part.maxHp>.5?"#e8b16d":"#f2685f";ctx.fillRect(-22,-(t.h||t.r*2)/2-12,44*part.hp/part.maxHp,4);
 }
 if(opts.selected){ctx.strokeStyle="#f7ae57";ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.strokeRect(-(t.w||t.r*2)/2-6,-(t.h||t.r*2)/2-6,(t.w||t.r*2)+12,(t.h||t.r*2)+12);ctx.setLineDash([]);}
 ctx.restore();
}
function drawBackground(){
 const grad=ctx.createLinearGradient(0,0,0,ch);grad.addColorStop(0,"#142532");grad.addColorStop(.7,"#1b2832");grad.addColorStop(1,"#1c262d");ctx.fillStyle=grad;ctx.fillRect(0,0,cw,ch);
 ctx.fillStyle="#273e48";ctx.globalAlpha=.5;
 for(let x=-200;x<cw+300;x+=180){const off=(x-cameraX*.12)%440;ctx.beginPath();ctx.moveTo(off,ch-160);ctx.lineTo(off+80,ch-240);ctx.lineTo(off+200,ch-150);ctx.lineTo(off+350,ch-180);ctx.lineTo(off+440,ch-120);ctx.lineTo(off+440,ch);ctx.lineTo(off,ch);ctx.fill();}
 ctx.globalAlpha=1;
 ctx.strokeStyle="#324550";ctx.lineWidth=1;
 for(let x=((cw/2-(cameraX*zoom)%60)+60)%60;x<cw;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ch);ctx.stroke();}
 for(let y=ch-70;y>0;y-=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
 ctx.fillStyle="#263138";ctx.fillRect(0,ch-70,cw,70);ctx.fillStyle="#44525b";ctx.fillRect(0,ch-70,cw,4);
 for(let x=((cw/2-cameraX*zoom)%55+55)%55;x<cw;x+=55){ctx.fillStyle="#34424a";ctx.fillRect(x,ch-66,28,4);}
 ctx.strokeStyle="#394750";for(let x=0;x<cw;x+=38){ctx.beginPath();ctx.moveTo(x,ch-42);ctx.lineTo(x+22,ch-55);ctx.stroke();}
}
function drawBuild(){
 ctx.fillStyle="#17212a";ctx.fillRect(0,0,cw,ch);
 const o=editOrigin(),spacing=GRID*zoom;
 ctx.strokeStyle="#2c3c47";ctx.lineWidth=.65;
 for(let x=o.x%spacing;x<cw;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ch);ctx.stroke();}
 for(let y=o.y%spacing;y<ch;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
 ctx.strokeStyle="#41606b";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o.x,0);ctx.lineTo(o.x,ch);ctx.moveTo(0,o.y);ctx.lineTo(cw,o.y);ctx.stroke();
 ctx.save();ctx.translate(o.x,o.y);ctx.scale(zoom,zoom);
 const conn=connectivity(blueprint);
 for(const l of conn.links){ctx.strokeStyle="#638594";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(l.parent.x,l.parent.y);ctx.lineTo(l.child.x,l.child.y);ctx.stroke();ctx.strokeStyle="#243944";ctx.lineWidth=3;ctx.stroke();}
 for(const p of blueprint)drawPart(p,p.x,p.y,p.angle,{selected:p.id===selected});
 for(const loose of conn.loose){ctx.strokeStyle="#ff716c";ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.strokeRect(loose.x-35,loose.y-28,70,56);ctx.setLineDash([]);}
 if(tool){const q=screenToEdit(pointer.x,pointer.y),x=Math.round(q.x/GRID)*GRID,y=Math.round(q.y/GRID)*GRID;ctx.globalAlpha=.45;drawPart({type:tool},x,y,0);ctx.globalAlpha=1;}
 ctx.restore();
 ctx.fillStyle="#95a7b1";ctx.font="600 11px 'Barlow Condensed'";ctx.fillText("X / 0",o.x+8,18);ctx.fillText("Y / 0",9,o.y-8);
 if(!blueprint.length){ctx.textAlign="center";ctx.font="700 24px 'Barlow Condensed'";ctx.fillStyle="#e9b16d";ctx.fillText("START BUILDING",cw/2,ch/2-18);ctx.textAlign="left";}
}
function drawBattle(){
 drawBackground();
 ctx.save();ctx.translate(cw/2-cameraX*zoom,ch-70-GROUND*zoom);ctx.scale(zoom,zoom);
 // Industrial arena fixtures and range markers in world space.
 ctx.fillStyle="#35454e";for(let x=200;x<WORLD_W;x+=350){ctx.fillRect(x-2,GROUND-10,4,10);ctx.fillStyle="#ac895d";ctx.fillRect(x-9,GROUND-12,18,3);ctx.fillStyle="#35454e";}
 for(const actor of actors){
  for(const l of actor.links)if(l.active){const a=l.a.body.position,b=l.b.body.position;ctx.strokeStyle="#242f37";ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.strokeStyle=l.hp<25?"#c47e64":"#66808b";ctx.lineWidth=5;ctx.stroke();}
  for(const p of actor.parts)drawPart(p,p.body.position.x,p.body.position.y,p.body.angle,{health:true});
  if(actor.core){const pos=actor.core.body.position;ctx.font="700 14px 'Barlow Condensed'";ctx.textAlign="center";ctx.fillStyle=actor===player?"#8fe9df":"#ff968b";ctx.fillText(actor===player?"YOU":mode==="test"?"TARGET DUMMY":"SCRAPJAW",pos.x,pos.y-103);ctx.textAlign="left";}
 }
 for(const p of projectiles){ctx.strokeStyle=p.color;ctx.lineWidth=p.r*.85;ctx.beginPath();ctx.moveTo(p.x-p.vx*.6,p.y-p.vy*.6);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle="#fff1c8";ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();}
 for(const fx of effects){ctx.save();ctx.globalAlpha=clamp(fx.life/fx.max,0,1);
 if(fx.type==="beam"){ctx.strokeStyle=fx.color;ctx.shadowColor=fx.color;ctx.shadowBlur=20;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(fx.from.x,fx.from.y);ctx.lineTo(fx.to.x,fx.to.y);ctx.stroke();ctx.strokeStyle="#f5ffff";ctx.lineWidth=1.5;ctx.stroke();}
 if(fx.type==="blast"){ctx.strokeStyle="#ffac62";ctx.lineWidth=5;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r*(1-fx.life/fx.max),0,TAU);ctx.stroke();}
 if(fx.type==="spark"){ctx.strokeStyle="#ffcc79";ctx.lineWidth=2;for(let i=0;i<9;i++){const a=i*TAU/9,r=(1-fx.life/fx.max)*30;ctx.beginPath();ctx.moveTo(fx.x+Math.cos(a)*r*.45,fx.y+Math.sin(a)*r*.45);ctx.lineTo(fx.x+Math.cos(a)*r,fx.y+Math.sin(a)*r);ctx.stroke();}}
 ctx.restore();}
 for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
 ctx.restore();
 // Match-time diagnostics.
 ctx.fillStyle="#b2c2cb";ctx.font="700 12px 'Barlow Condensed'";ctx.fillText("ENERGY "+Math.round(player.energy)+"/"+Math.round(player.maxEnergy),18,ch-101);
 ctx.fillStyle="#263b43";ctx.fillRect(18,ch-95,140,5);ctx.fillStyle="#81d4c5";ctx.fillRect(18,ch-95,140*player.energy/player.maxEnergy,5);
 ctx.textAlign="right";ctx.fillStyle="#aec0c9";ctx.fillText("TIME "+Math.floor(elapsed/60).toString().padStart(2,"0")+":"+Math.floor(elapsed%60).toString().padStart(2,"0"),cw-20,ch-95);ctx.textAlign="left";
}
function frame(t){
 const dt=lastTime?Math.min(.05,(t-lastTime)/1000):.016;lastTime=t;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);
 if(mode==="build")drawBuild();
 else{accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps<4){simulate(1/60);accumulator-=1/60;steps++;}drawBattle();}
 requestAnimationFrame(frame);
}
function drawShop(){
 const root=$("shopItems");root.innerHTML="";
 Object.entries(TYPES).filter(([id,t])=>t.price>0).forEach(([id,t])=>{
  const own=unlocks.includes(id),row=document.createElement("div");row.className="shop-row";const info=document.createElement("div");info.innerHTML="<strong>"+t.name+"</strong><small>"+t.desc+"</small>";
  const b=document.createElement("button");b.textContent=own?"OWNED":t.price+" SCRAP";b.disabled=own||credits<t.price;
  b.onclick=()=>{credits-=t.price;unlocks.push(id);persist();drawShop();drawPalette();flash("Unlocked "+t.name);};
  row.append(info,b);root.append(row);
 });
}
function openModal(id){$(id).showModal();}
document.querySelectorAll(".mode").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("shopBtn").onclick=()=>{drawShop();openModal("shopModal");};
$("controlsBtn").onclick=()=>{drawMappings();openModal("settingsModal");};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$("undoBtn").onclick=undo;
$("clearBtn").onclick=()=>{if(!confirm("Remove all components except the core?"))return;snapshot();blueprint=blueprint.filter(p=>p.type==="core");selected=null;persist();showInspector();};
$("saveBtn").onclick=()=>{persist();flash("Blueprint saved locally");};
$("templateBtn").onclick=()=>{if(confirm("Replace current design with the starter robot?"))resetStarter();};
$("sandbox").addEventListener("change",e=>{sandbox=e.target.checked;tool=null;drawPalette();});
window.addEventListener("resize",resize);
window.__botbattleDebug={state:()=>({mode,player,enemy,engine,blueprint,ended,projectiles}),damagePart:(side,type,amount)=>{const actor=side==="player"?player:enemy;if(!actor)return null;const part=actor.parts.find(p=>p.type===type&&!p.dead);if(!part)return null;damage(part,amount,part.body.position,side==="player"?"enemy":"player",amount);return {id:part.id,hp:part.hp,dead:part.dead};},step:()=>simulate(1/60)};
resize();persist();drawPalette();showInspector();requestAnimationFrame(frame);
})();