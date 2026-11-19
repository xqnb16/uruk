import * as T from './assets/three.module.js';
import { GLTFLoader } from './assets/gltf-loader.js';
import { MeshoptDecoder } from './assets/meshopt-decoder.js';
import { Reflector } from './assets/reflector.js';
import { createNavigation } from './uruk-navigation.js';
import { populateUruk } from './uruk-residents.js';
import brickURL from './assets/mudbrick.webp';
import siltURL from './assets/silt.webp';
import skyURL from './assets/morning-sky.webp';
import workshopURL from './assets/workshop-plaster.webp';
import adobeURL from './assets/web-adobe.webp';
import limeURL from './assets/web-lime.webp';

const sunDirection = new T.Vector3(-63, 35, 44).normalize();

async function photograph(url, renderer, repeat = false, treatment = null) {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (!treatment) return texture(image, renderer, repeat);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (treatment === 'plaster') {
    const mean = [0,0,0];
    let count = 0;
    for (let i = 0; i < pixels.data.length; i += 80) {
      count++;
      for (let c=0; c<3; c++) mean[c] += pixels.data[i+c];
    }
    for (let c=0; c<3; c++) mean[c] /= count;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let c=0; c<3; c++) pixels.data[i+c] = mean[c] + (pixels.data[i+c]-mean[c])*.56;
    }
  } else {
    for (let i = 0; i < pixels.data.length; i += 4) {
      const avg = .25 * pixels.data[i] + .58 * pixels.data[i+1] + .17 * pixels.data[i+2];
      pixels.data[i]   = avg + (pixels.data[i]   - avg) * .46 + 8;
      pixels.data[i+1] = avg + (pixels.data[i+1] - avg) * .46 + 6;
      pixels.data[i+2] = avg + (pixels.data[i+2] - avg) * .46 + 1;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return texture(canvas, renderer, repeat);
}
function texture(image, renderer, repeat = true, color = T.SRGBColorSpace) {
  const result = new T.Texture(image);
  result.colorSpace = color;
  if (repeat) result.wrapS = result.wrapT = T.RepeatWrapping;
  result.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  result.needsUpdate = true;
  return result;
}

function localSurface(renderer, category) {
  const side = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(side, side);
  let seed = 1347 + category.length;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const detail = (seed / 0x100000000 - .5) * 28;
    const layers = Math.sin(x * .119 + Math.cos(y * .107) * 1.17) * 7 + Math.sin(x * .298 + y * .123) * 4;
    const grain = category === 'timber' ? 18 * Math.sin(x * .91 + Math.sin(y * .046) * 1.9)
      : category === 'linen' ? 9 * (Math.sin(x * 1.89) + Math.sin(y * 2.16))
      : category.startsWith('furrow') ? 22 * Math.cos((category === 'furrow-east' ? x : y) * .295 + layers * .030)
      : layers;
    const i = (y * side + x) * 4;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = Math.round(237 + detail + grain);
    data.data[i+3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return texture(canvas, renderer);
}

const terrainShade = `
float pathNoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=fract(sin(dot(i,vec2(127.,311.7)))*43758.5);
  float b=fract(sin(dot(i+vec2(1,0),vec2(127.,311.7)))*43758.5);
  float c=fract(sin(dot(i+vec2(0,1),vec2(127.,311.7)))*43758.5);
  float d=fract(sin(dot(i+vec2(1,1),vec2(127.,311.7)))*43758.5);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}`;

function workshopLight(shader, plaster) {
  shader.uniforms.plasterPatina = { value: Number(plaster) };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 workshopPosition;')
    .replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nworkshopPosition=(modelMatrix * vec4(transformed, 1.)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 workshopPosition;\nuniform float plasterPatina;\n'+terrainShade)
    .replace('#include <map_fragment>', `#include <map_fragment>
      if(plasterPatina>.5){
        float stain = pathNoise(vec2(workshopPosition.x+workshopPosition.z,workshopPosition.y*.21)*2.1);
        float damp = smoothstep(.05,.93,workshopPosition.y+.33*stain);
        diffuseColor.rgb *= mix(vec3(.44,.39,.32),vec3(1.),damp);
      }`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 wp=workshopPosition;
      float indoors=smoothstep(-30.51,-30.02,wp.x)*(1.-smoothstep(-23.85,-23.47,wp.x))*
        smoothstep(-18.72,-18.26,wp.z)*(1.-smoothstep(-13.82,-13.34,wp.z))*(1.-smoothstep(2.78,3.31,wp.y));
      if(indoors>.001){
        float thresholdBounce=exp2(-length((wp-vec3(-27.17,.4,-18.08))*vec3(1.19,.79,.82))*.65);
        float windowBounce=exp2(-length((wp-vec3(-23.58,2.0,-16.92))*vec3(1.11,.85,1.50))*1.24);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*indoors*(
          vec3(.48,.34,.23)*thresholdBounce + vec3(.22,.29,.37)*windowBounce);
      }`);
}

function banks(scene, silt) {
  const material = new T.MeshStandardMaterial({ map: silt, bumpMap: silt, bumpScale: .028,
    roughness: .95, color: 0xd4b795 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 sandPosition;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nsandPosition=(modelMatrix * vec4(transformed,1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 sandPosition;\n' + terrainShade)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mudPatch=pathNoise(sandPosition.xz*.51);
        float tunnel=1.-(1.-smoothstep(1.9,2.45,abs(sandPosition.x)))*(1.-smoothstep(3.3,5.15,abs(sandPosition.z)))*.32;
        float shore=smoothstep(0.,1.8,abs(sandPosition.x+3.2));
        diffuseColor.rgb *= mix(.82,1.18,mudPatch)*tunnel*mix(.70,1.,shore);`);
  };
  const shore = (w, cx) => {
    const plane = new T.PlaneGeometry(w, 249);
    plane.rotateX(-Math.PI/2);
    const uv=plane.attributes.uv;
    for (let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w*.29,uv.getY(i)*249*.29);
    const obj = new T.Mesh(plane,material);
    obj.position.set(cx,-.006,-27);
    obj.receiveShadow=true;
    scene.add(obj);
  };
  shore(186,90);
  shore(190,-116);
  for (const x of [-3.02,-20.98]) {
    const edge = new T.BoxGeometry(.12,.87,249);
    const uv = edge.attributes.uv;
    for (let i=0;i<8;i++) uv.setXY(i,uv.getX(i)*72,uv.getY(i)*.27);
    const bank = new T.Mesh(edge,material);
    bank.position.set(x,-.441,-27);
    bank.receiveShadow=true;
    scene.add(bank);
  }
}

function atmosphere(scene, sky) {
  const mat=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    uniforms:{photo:{value:sky},sun:{value:sunDirection}},
    vertexShader:`varying vec3 direction;
    void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform sampler2D photo; uniform vec3 sun; varying vec3 direction;
    void main(){
      vec3 p=normalize(direction);
      float u=fract(atan(p.z,p.x)/6.2831853+.68);
      float v=asin(clamp(p.y,-1.,1.))/3.14159265+.5;
      vec3 image=texture2D(photo,vec2(u,v)).rgb;
      vec3 horizon=mix(vec3(.61,.57,.47),vec3(.20,.38,.63),smoothstep(0.,.65,p.y));
      image=mix(horizon,image,smoothstep(0.,.09,min(u,1.-u)));
      float sunspot=max(dot(p,sun),0.);
      image += vec3(1.,.69,.36)*(.23*pow(sunspot,32.)+2.3*smoothstep(.99915,.99973,sunspot));
      gl_FragColor=vec4(image*1.19,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const dome=new T.Mesh(new T.SphereGeometry(199,48,24),mat);
  dome.renderOrder=-10;
  dome.frustumCulled=false;
  scene.add(dome);
  scene.fog=new T.FogExp2(0xc9c7be,.0071);
}

function canal(scene) {
  const water=new Reflector(new T.PlaneGeometry(18.14,244),{
    textureWidth:832,textureHeight:512,clipBias:.002,multisample:0,
    shader:{
      uniforms:{ ...Reflector.ReflectorShader.uniforms, time:{value:0}, detailed:{value:1}, sun:{value:sunDirection} },
      vertexShader:`uniform mat4 textureMatrix; varying vec4 reflected; varying vec3 world;
      void main(){
        reflected=textureMatrix*vec4(position,1.);
        world=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
      fragmentShader:`uniform sampler2D tDiffuse; uniform float time,detailed; uniform vec3 sun;
      varying vec4 reflected; varying vec3 world;
      ${terrainShade}
      void main(){
        vec2 p=world.xz;
        float current=pathNoise(p*.40+vec2(0.,time*.08));
        float xw=sin(p.x*4.1+p.y*2.7+time*1.7+current*3.1)+.47*sin(p.x*15.2-p.y*4.4-time*2.3);
        float zw=sin(p.y*7.9-p.x*3.2+time*1.3)+.37*sin(p.y*19.4+p.x*6.8+time*3.1);
        vec3 view=normalize(cameraPosition-world);
        vec3 normal=normalize(vec3(.032*xw,1.,.053*zw));
        float f=pow(1.-clamp(dot(view,normal),0.,1.),2.6);
        vec2 uv=reflected.xy/reflected.w+vec2(xw*.0027,zw*.0042);
        vec3 mirror=vec3(.28,.35,.37);
        if(detailed>.5) mirror=texture2D(tDiffuse,uv).rgb;
        float bank=1.-smoothstep(.03,1.9,min(p.x+20.98,-3.02-p.x));
        vec3 deep=mix(vec3(.075,.092,.073),vec3(.151,.120,.071),bank*.57);
        float spark=pow(max(dot(reflect(-sun,normal),view),0.),93.);
        vec3 rgb=mix(deep,mirror,.20+.73*f)+spark*vec3(1.24,.82,.41)*.55;
        rgb+=smoothstep(.70,.87,current)*bank*vec3(.123,.105,.080);
        gl_FragColor=vec4(rgb,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    }
  });
  water.rotation.x=-Math.PI/2;
  water.position.set(-12,-.619,-27);
  const reflect=water.onBeforeRender;
  const prevMatrix=new T.Matrix4();
  let last=-Infinity;
  water.onBeforeRender=function(renderer,scene,camera,...rest) {
    if(this.material.uniforms.detailed.value<.5 || prevMatrix.equals(camera.matrixWorld)) return;
    const now=performance.now();
    if (now-last<64) return;
    last=now;
    prevMatrix.copy(camera.matrixWorld);
    reflect.call(this,renderer,scene,camera,...rest);
  };
  scene.add(water);
  return water;
}

function loadScript(section) {
  return new Promise((resolve, reject) => {
    const script=document.createElement('script');
    script.src='assets/uruk-v08-'+section+'.js';
    script.onload=()=>{
      script.remove();
      const encoded=globalThis.urukModelChunks?.[section];
      if (encoded) {
        delete globalThis.urukModelChunks[section];
        resolve(encoded);
      } else reject(new Error('Model data missing: '+section));
    };
    script.onerror=()=>{script.remove();reject(new Error('Model failed to load: '+section));};
    document.head.append(script);
  });
}

async function loadModel(section, loader) {
  const data = await loadScript(section);
  const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(data) : Uint8Array.from(atob(data), c=>c.charCodeAt(0));
  const bin=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return loader.parseAsync(bin,'');
}

export async function loadUruk(scene, renderer) {
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const zones=['gate','quay','market','skyline','west','temple'];
  const work=Promise.all(zones.map(zone=>loadModel(zone,loader)));
  const residents=Promise.all(['potter','porter','pilgrim'].map(async role=>[role,await loadModel('cast-'+role,loader)]));
  const surface=Promise.all([
    photograph(brickURL,renderer,true,'masonry'),
    photograph(siltURL,renderer,true),
    photograph(skyURL,renderer),
    photograph(workshopURL,renderer,true,'plaster'),
    photograph(adobeURL,renderer,true),
    photograph(limeURL,renderer,true)
  ]);
  const [chunks,[brick,silt,sky,workshop,brickscan,limewash],roles]=await Promise.all([work,surface,residents]);
  atmosphere(scene,sky);
  banks(scene,silt);
  const materials={
    masonry:brick,
    adobe:localSurface(renderer,'adobe'),
    timber:localSurface(renderer,'timber'),
    linen:localSurface(renderer,'linen'),
    'furrow-east':localSurface(renderer,'furrow-east'),
    'furrow-north':localSurface(renderer,'furrow-north'),
    silt, workshop, brickscan, limewash
  };
  function placeChunk(chunk, zone) {
    chunk.traverse(model=>{
      if(!model.isMesh) return;
      const mat=model.material;
      const type=mat.userData.surface;
      if(materials[type]){
        mat.map=materials[type];
        mat.bumpMap=materials[type];
        mat.bumpScale={masonry:.024,brickscan:.010,limewash:.008,silt:.031,adobe:.012,workshop:.0085}[type]??.009;
      } else if(type==='far-water'){
        mat.emissive.setRGB(.063,.074,.069);
        mat.emissiveIntensity=.24;
      }
      if(type==='masonry') mat.color.setRGB(.85,.76,.66);
      if(zone==='west') mat.onBeforeCompile=shader=>workshopLight(shader,type==='workshop');
      mat.needsUpdate=true;
      model.receiveShadow=true;
      model.castShadow=zone!=='skyline' && zone!=='outskirts';
    });
    chunk.name='Uruk section: '+zone;
    if(zone==='outskirts') chunk.layers.set(1);
    scene.add(chunk);
    if(zone==='outskirts') chunk.traverse(object=>object.layers.set(1));
  }
  for (const [index,{scene:chunk}] of chunks.entries()) placeChunk(chunk,zones[index]);
  let distance;
  function loadDistance() {
    return distance??=loadModel('outskirts',loader).then(({scene:chunk})=>{
      placeChunk(chunk,'outskirts');
      return true;
    },()=>false);
  }

  const ambient=new T.HemisphereLight(0xd6e5ff,0xa2815e,1.49);
  ambient.layers.enable(1);
  scene.add(ambient);
  const sun=new T.DirectionalLight(0xffe3c3,3.14);
  sun.layers.enable(1);
  sun.target.position.set(-5,0,-6.5);
  sun.position.copy(sun.target.position).addScaledVector(sunDirection,62);
  sun.castShadow=true;
  sun.shadow.camera.left=-42; sun.shadow.camera.right=41;
  sun.shadow.camera.top=42; sun.shadow.camera.bottom=-40;
  sun.shadow.camera.near=1; sun.shadow.camera.far=129;
  sun.shadow.bias=-.00032;
  sun.shadow.normalBias=.042;
  sun.shadow.autoUpdate=false;
  sun.shadow.needsUpdate=true;
  scene.add(sun,sun.target);
  const water=canal(scene);
  const navigation=createNavigation();
  const crowd=populateUruk(scene,Object.fromEntries(roles),navigation,workshopLight,materials.linen);
  return { sun,water,crowd,loadDistance,...navigation };
}


