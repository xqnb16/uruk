import bounds from './assets/nav-v04.json';

const bodyRadius = .30;
const boxes = list => list.map(([x,z,w,d]) => [x-w/2,x+w/2,z-d/2,z+d/2]);
const at = (v,lo,hi) => v > lo && v < hi;
const placeAt = (x,z,cx,cz,w,d) => at(x,cx-w/2,cx+w/2) && at(z,cz-d/2,cz+d/2);

// Floor-height and boundary geometry are kept small so a walk step does not raycast the render mesh.
const east = boxes([...bounds.east,
  [-5.32,0,6.48,9.16],[5.32,0,6.48,9.16],
  [-1.98,.98,.62,3.52],[1.98,.98,.62,3.52],[20.0,0,23.2,3.9],
  [4.80,24.05,2.82,1.14],[5.85,17.08,2.82,1.14],[6.76,10.74,2.82,1.14],
  [7.45,-6.97,2.82,1.14],[-.48,-18.13,2.82,1.14],[3.69,-28.58,2.82,1.14],
  [9.5,-33.6,2.82,1.14],[-1.22,30.38,.50,.50],
  [19.21,-23.58,.76,.81],[24.55,-23.58,.76,.81],
  [18.79,-24.41,.65,.65],[24.85,-23.55,.65,.65],[25.47,-23.73,.57,.57],
  [19.47,-27.35,.72,6.99],[24.34,-27.35,.73,6.99],
  [-2.94,25.76,.23,.23],[-.96,25.76,.23,.23],[-2.94,22.52,.23,.23],[-.96,22.52,.23,.23],
  [3.97,18.22,.60,.60],[4.58,18.32,.66,.66],[3.81,15.54,.55,.55],[-2.83,26.74,.56,.56]
]);
const west = boxes([...bounds.west,
  [-28.99,-15.67,.98,.92],[-29.93,-16.05,.57,.42],[-24.68,-15.91,.95,2.52],
  [-26.54,-14.13,1.53,1.29],[-24.82,-18.99,1.43,.42]
]);
const terrace = boxes([
  [24.52,-46.88,.78,.78],[24.0,-46.75,.48,.48],[27.66,-47.25,.88,.70],
  [29.13,-47.13,.55,.55],[29.65,-47.04,.56,.56]
]);

function levelAt(x,z,r=0) {
  const y=-z;
  const trim=r*.83;
  if (at(x,-22.01,-2.02) && at(y,20.06+trim,21.98-trim)){
    const height=Math.min(.315,Math.max(.02,(x+22.01)*.322),Math.max(.02,(-2.02-x)*.324));
    return {area:'bridge',height};
  }
  if (at(x,-43.31+trim,-20.99-trim) && at(y,12.51+trim,34.45-trim)) return {area:'west',height:0};
  if (at(x,19.78+trim,24.04-trim) && at(y,23.54,39.15)) {
    const height=Math.max(0,Math.min(8.877,(y-23.61)*.575));
    return {area:'stairs',height};
  }
  const gallery=at(x,19.84+trim,24.15-trim) && at(y,39.02,45.12);
  const terraceDeck=at(x,18.01+trim,33.96-trim) && at(y,43.92+trim,47.34-trim);
  const threshold=at(x,25.45+trim,26.76-trim) && at(y,46.88,49.43-trim);
  if (gallery||terraceDeck||threshold) return {area:'temple',height:8.888};
  if (at(x,-4.02+trim,-2.78) && at(z,25.25+trim,27.91-trim)) {
    return {area:'east',height:-Math.min(.48,Math.max(0,-x-3.07)*.53)};
  }
  if (at(x,-3.02+trim,(y>3?27.35:14.5)-trim) && at(y,-29.7+trim,34.7-trim)) {
    // The support walls outside the two stair flights are solid.
    if (y > 30.80 && x > 14.47) return null;
    return {area:'east',height:0};
  }
  return null;
}

export function createNavigation() {
  return {
    canStand(x,z,r=bodyRadius,prevX=x,prevZ=z) {
      const floor=levelAt(x,z,r);
      if(!floor) return false;
      const from=levelAt(prevX,prevZ);
      if(from && Math.abs(floor.height-from.height)>.37) return false;
      const checks=floor.area==='west'?west:floor.area==='temple'?terrace:
        floor.area==='east'?east:[];
      if(checks.some(([left,right,front,back])=>x+r>left && x-r<right && z+r>front && z-r<back)) return false;
      return true;
    },
    floorHeight(x,z) { return levelAt(x,z)?.height ?? 0; },
    landmark(x,z) {
      const y=-z;
      const floor=levelAt(x,z);
      if(floor?.area==='bridge' && x<-3.03 && x>-20.98) return ['运河木桥','向西过桥可到作坊，回望东岸可见神殿'];
      if(floor?.area==='west'){
        if(placeAt(x,z,-27.12,-15.85,6.2,4.95)) return ['西岸陶器作坊','敞门内可以走到工作台前'];
        if(placeAt(x,z,-32.35,-27.45,6.52,7.44)) return ['西岸民居院落','穿过西侧小门，可绕近河步道回桥头'];
        return ['西岸居民街','桥头直走可达院落，左侧是陶器作坊'];
      }
      if(floor?.area==='temple'){
        if(y>47.1&&at(x,25.5,26.75)) return ['白庙入口','门框与彩陶饰带在头顶'];
        return ['安努高台 · 白庙露台','转身可回望城门、运河与西岸居民街'];
      }
      if(floor?.area==='stairs' && y>24) return ['安努神殿大阶梯','沿台阶登顶，可回望来路'];
      if(y>19.7&&x>15) return ['神殿前广场','正前方是通往白庙露台的大阶梯'];
      if(y>4.48) return ['门后市集','向东沿主路去神殿，沿河向北可走上木桥'];
      if(y>-4.55) return ['双塔城门','穿过门洞，沿开阔的主路进入市集'];
      if(y>-8) return ['城门外','沿主路走进门洞'];
      if(x<-2.8&&z>25.2) return ['卸货台阶','沿岸石台阶可以走回码头路面'];
      return ['运河码头','双塔城门在前方'];
    }
  };
}
