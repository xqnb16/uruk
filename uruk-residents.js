import * as T from './assets/three.module.js';
import { clone } from './assets/skeleton-utils.js';

const specs=[
  { kind:'potter', location:[-29.65,-15.91,.009], heading:1.19, seed:.45 },
  { kind:'porter', points:[[2.44,24.76],[2.57,21.48],[2.51,16.88],[3.03,14.10]], speed:.55, seed:13.0, tint:0xffffff },
  { kind:'porter', points:[[1.48,15.25],[1.65,12.3],[1.77,9.90]], speed:.575, seed:7.6, tint:0xc9d2ce },
  { kind:'pilgrim', points:[[-1.04,-2.2],[-.95,-4.92],[-.99,-7.0],[.09,-8.61]], speed:.575, seed:3.15, tint:0xb8d3ca },
  { kind:'pilgrim', points:[[22.76,-24.15],[22.76,-31.13],[22.76,-38.30]], speed:.505, seed:8.40, stairs:true, tint:0xffffff },
  { kind:'pilgrim', points:[[20.61,-24.18],[20.54,-30.87],[20.54,-37.52]], speed:.49, seed:21.4, stairs:true, tint:0xd0dcf5 },
  { kind:'pilgrim', points:[[-.30,24.9],[.62,24.35],[1.08,23.69]], speed:.51, seed:3.81, scale:.94, tint:0xe3be9f },
  { kind:'porter', points:[[-2.23,15.78],[-2.17,14.46],[-2.13,13.23]], speed:.45, seed:8.24, scale:1.04, tint:0xffeac9 },
  { kind:'pilgrim', points:[[3.46,21.26],[3.32,19.00]], speed:.47, seed:6.55, scale:.94, tint:0xe0eddb },
  { kind:'porter', location:[4.49,14.89,0], heading:-.59, seed:2.12, tint:0xeddcbd, gesture:[1.44,4.05] },
  { kind:'pilgrim', points:[[4.76,11.51],[4.58,9.89],[4.42,8.70]], speed:.52, seed:1.43, scale:1.02, tint:0xcbc4a9 },
  { kind:'pilgrim', points:[[-25.40,-23.11],[-26.58,-23.04],[-27.30,-23.57]], speed:.47, seed:3.41, scale:.97, tint:0xecc5aa }
];

function route(points) {
  const parts=[];
  let length=0;
  for(let i=1;i<points.length;i++){
    const [ax,az]=points[i-1],[bx,bz]=points[i];
    const dx=bx-ax,dz=bz-az;
    const run=Math.hypot(dx,dz);
    parts.push({x:ax,z:az,dx,dz,run,start:length});
    length+=run;
  }
  return { parts,length };
}

function sample(path, distance, sign) {
  const segment=path.parts.find(p=>distance<=p.start+p.run)??path.parts.at(-1);
  const rate=T.MathUtils.clamp((distance-segment.start)/segment.run,0,1);
  return {x:segment.x+segment.dx*rate,z:segment.z+segment.dz*rate,
    heading:Math.atan2(sign*segment.dx,sign*segment.dz)};
}

function shadowTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  const grad=ctx.createRadialGradient(32,32,2,32,32,31);
  grad.addColorStop(0,'rgba(30, 20, 12, .58)');
  grad.addColorStop(.42,'rgba(35, 21, 12, .30)');
  grad.addColorStop(1,'rgba(35, 21, 12, 0)');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,64,64);
  return new T.CanvasTexture(canvas);
}
function angleDistance(a,b) { return Math.atan2(Math.sin(b-a),Math.cos(b-a)); }

export function populateUruk(scene, prototypes, navigation, reflect, cloth) {
  const shadowMap=shadowTexture();
  const shadowMaterial=new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,opacity:.72});
  const plane=new T.PlaneGeometry(1.16,1.04);
  const startTime=performance.now();
  let lastShadow=-Infinity;
  let high=true;
  const agents=specs.map(spec=>{
    const source=prototypes[spec.kind];
    const character=clone(source.scene);
    const geometry=[];
    character.traverse(object=>{
      if(!object.isMesh)return;
      geometry.push(object);
      object.receiveShadow=true;
      object.castShadow=false;
      const list=Array.isArray(object.material)?object.material:[object.material];
      const materials=list.map(original=>{
        const material=original.clone();
        if(/cloth|selvage|wrapped seam/.test(material.name)){
          if(spec.tint) material.color.multiply(new T.Color(spec.tint));
          material.map=cloth;
          material.bumpMap=cloth;
          material.bumpScale=.0026;
          material.needsUpdate=true;
        }
        if(spec.kind==='potter') material.onBeforeCompile=shader=>reflect(shader,false);
        return material;
      });
      object.material=Array.isArray(object.material)?materials:materials[0];
    });
    character.name='Resident: '+spec.kind;
    character.scale.setScalar(spec.scale??1);
    scene.add(character);
    const contact=new T.Mesh(plane,shadowMaterial);
    contact.rotation.x=-Math.PI/2;
    contact.renderOrder=3;
    scene.add(contact);
    const mixer=new T.AnimationMixer(character);
    const clip=source.animations[0];
    if(!clip) throw new Error('Missing resident motion: '+spec.kind);
    mixer.clipAction(clip).play();
    return {spec,character,geometry,contact,mixer,clip,
      path:spec.points?route(spec.points):null, lastPose:-Infinity, heading:undefined,x:0,z:0,ground:0,casting:false};
  });

  function update(now, camera) {
    const clock=(now-startTime)/1000;
    let nearMoving=false;
    for(const npc of agents){
      const {spec,character,mixer,clip,contact,path}=npc;
      const elapsed=Math.max(0,clock)+spec.seed;
      let x,z,ground,motion,desiredHeading;
      if(!path){
        [x,z,ground]=spec.location;
        desiredHeading=spec.heading;
        const [start,end]=spec.gesture??[0,clip.duration];
        motion=start+elapsed%Math.min(end-start,clip.duration-start);
      } else {
        const duration=path.length/spec.speed;
        const tail=spec.kind==='porter'?2.66:.85;
        const head=spec.kind==='porter'?1.05:.85;
        const phase=elapsed%(duration*2+tail+head);
        const reverseStart=duration+tail;
        const reverseEnd=reverseStart+duration;
        const departing=phase<duration;
        const returning=phase>reverseStart&&phase<reverseEnd;
        const walking=departing||returning;
        const direction=departing||phase<=reverseStart-.42?1:-1;
        const distance=departing?phase*spec.speed:
           returning?path.length-(phase-reverseStart)*spec.speed:phase<=reverseStart?path.length:0;
        const next=sample(path,distance,direction);
        x=next.x;z=next.z;desiredHeading=next.heading;
        if(phase>reverseEnd+.4) desiredHeading=sample(path,0,1).heading;
        ground=navigation.floorHeight(x,z);
        if(walking){
          const leg=(phase-(returning?reverseStart:0))%1.333;
          motion=leg+(spec.stairs?(returning?68/24:34/24):0);
        }else if(spec.kind==='porter'&&phase<reverseStart){
          motion=34/24+T.MathUtils.clamp(phase-duration,.005,Math.min(2.655,clip.duration-34/24-.003));
        }else {
          motion=.012+(spec.stairs?(direction<0?68/24:34/24):0);
        }
      }
      npc.x=x;npc.z=z;npc.ground=ground;
      if(npc.heading===undefined) npc.heading=desiredHeading;
      npc.heading+=angleDistance(npc.heading,desiredHeading)*.116;
      character.position.set(x,ground+.004,z);
      character.rotation.y=npc.heading;
      contact.position.set(x,ground+.031,z);
      const distance=Math.hypot(camera.position.x-x,camera.position.z-z);
      const visible=distance<(high?58:39);
      character.visible=contact.visible=visible;
      if(visible&&now-npc.lastPose>(distance<13?0:distance<31?64:155)){
        mixer.setTime(Math.min(motion,clip.duration-.002));
        npc.lastPose=now;
      }
      const cast=high&&visible&&distance<15;
      if(cast!==npc.casting){
        npc.casting=cast;
        for(const object of npc.geometry) object.castShadow=cast;
        nearMoving=true;
      }
      if(cast) nearMoving=true;
    }
    if(high&&nearMoving&&now-lastShadow>135){
      lastShadow=now;
      return true;
    }
    return false;
  }
  return {
    update,
    setQuality(quality) {
      high=quality;
      lastShadow=-Infinity;
    },
    canPass(x,z,ground,r,previousX,previousZ) {
      return !agents.some(npc=>{
        if(Math.abs(ground-npc.ground)>=.83)return false;
        const next=(npc.x-x)**2+(npc.z-z)**2;
        const before=(npc.x-previousX)**2+(npc.z-previousZ)**2;
        const reach=r+(npc.spec.kind==='potter'?.18:.19);
        return next<reach**2 && next<before;
      });
    }
  };
}

