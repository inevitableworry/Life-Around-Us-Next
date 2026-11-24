import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {spherePoint,globePointCoordinates,normalizeLongitude} from './geodesy.js';

const $ = (id) => document.getElementById(id);
const MODE = { classic: 'classic', enhanced: 'enhanced', google3d: 'google3d', maps: 'maps' };
const RADIUS = 2.2;
let current = 'classic', previous = 'classic';
let currentGoogleKey = '';
let selected = {lat: 0, lon: 0};
let googleViewer = null, googleMap = null, googleScript = null, mapsScript = null;
let autoRotate = true, showClouds = true, showAtmosphere = true, quality = 'auto';
let lastMessageTimer = null;

function toast(message, milliseconds = 4000) {
  $('toast').textContent = message;
  clearTimeout(lastMessageTimer);
  lastMessageTimer = setTimeout(() => { $('toast').textContent = ''; }, milliseconds);
}
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
}
$('notice').addEventListener('click', () => { $('notice').hidden = true; });
const rad = (a) => a * Math.PI / 180;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function updateCoordinates(lat, lon) {
  selected = {lat: clamp(lat, -85, 85), lon: normalizeLongitude(lon)};
  $('coordinates').textContent = selected.lat.toFixed(4) + '°, ' + selected.lon.toFixed(4) + '°';
  $('location-name').textContent = Math.abs(selected.lat) < 0.001 && Math.abs(selected.lon) < 0.001 ? 'PLANET EARTH' : 'SELECTED LOCATION';
}

// Real-time rendering in visitor's browser; no DLSS claims or server GPU.
const viewport = $('planet-view');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 1200);
camera.position.set(0, 0.8, 8.2);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
viewport.appendChild(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.enablePan = false;
orbit.minDistance = 2.5;
orbit.maxDistance = 12;
orbit.autoRotate = true;
orbit.autoRotateSpeed = 0.33;
orbit.rotateSpeed = 0.48;
orbit.zoomSpeed = 0.75;

scene.add(new THREE.AmbientLight(0x8fa9cd, 0.55));
const sun = new THREE.DirectionalLight(0xfff7e3, 2.6);
sun.position.set(6, 4, 7);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x2263cc, 0.45);
fill.position.set(-5, -3, -4);
scene.add(fill);

const earthGeometry = new THREE.SphereGeometry(RADIUS, 128, 96);
const material = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.91, metalness: 0.03,
});
const earth = new THREE.Mesh(earthGeometry, material);
scene.add(earth);
const textureLoader = new THREE.TextureLoader();
const textures = new Map();
function getEarthTexture(mode) {
  const path = mode === 'enhanced' ? '/textures/earth-4k.jpg' : '/textures/earth-classic.jpg';
  if (textures.has(path)) return Promise.resolve(textures.get(path));
  return new Promise((resolve, reject) => {
    textureLoader.load(path, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.wrapS = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textures.set(path, texture);
      resolve(texture);
    }, undefined, reject);
  });
}
getEarthTexture('classic').then(tex => { material.map = tex; material.needsUpdate = true; }).catch(() => toast('NASA globe texture could not load'));
if (window.innerWidth > 900) setTimeout(() => getEarthTexture('enhanced').catch(() => {}), 2400); // optional local NASA prewarm; never Google content

// Procedural clouds are separate from imagery, rendering above the globe.
const cloudsCanvas = document.createElement('canvas');
cloudsCanvas.width = 1024; cloudsCanvas.height = 512;
const cx = cloudsCanvas.getContext('2d');
let seed = 91357;
function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
for (let i = 0; i < 185; i++) {
  const x = random() * 1024, y = random() * 512;
  const a = (random() * 15 + 7);
  const g = cx.createRadialGradient(x, y, 0, x, y, a * 2.8);
  g.addColorStop(0, 'rgba(244,251,255,0.22)');
  g.addColorStop(0.45, 'rgba(243,249,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(x - a * 3, y - a * 3, a * 6, a * 6);
}
const cloudTexture = new THREE.CanvasTexture(cloudsCanvas);
const cloudMesh = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS * 1.013, 72, 48),
  new THREE.MeshBasicMaterial({ map: cloudTexture, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.NormalBlending })
);
cloudMesh.visible = true;
scene.add(cloudMesh);

// GPU Fresnel scattering approximation (separate from photoreal Google data).
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS * 1.032, 96, 56),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { glowColor: {value: new THREE.Color(0x62b7fa)} },
    vertexShader: 'varying vec3 vNormal;varying vec3 vWorld;void main(){vNormal=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 vNormal;varying vec3 vWorld;uniform vec3 glowColor;void main(){vec3 viewDir=normalize(cameraPosition-vWorld);float edge=pow(1.0-max(dot(normalize(vNormal),viewDir),0.0),3.0);gl_FragColor=vec4(glowColor,edge*0.28);}'
  })
);
scene.add(atmo);

// Sparse stars use a single Points draw call, independent of the Earth textures.
const starPositions = new Float32Array(1500 * 3);
for (let i = 0; i < 1500; i++) {
  const a = random() * Math.PI * 2, z = random() * 2 - 1, r = 100;
  const f = Math.sqrt(1-z*z);
  starPositions[i*3] = r*f*Math.cos(a);
  starPositions[i*3+1] = r*z;
  starPositions[i*3+2] = r*f*Math.sin(a);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({color:0xa4c6e6, size:0.2, transparent:true, opacity:0.8, sizeAttenuation:false}));
scene.add(stars);

const raycaster = new THREE.Raycaster();
let pointerDown = null;
renderer.domElement.addEventListener('pointerdown', e => {pointerDown = {x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!pointerDown || Math.hypot(pointerDown.x-e.clientX,pointerDown.y-e.clientY) > 6) return;
  pointerDown = null;
  const rect = renderer.domElement.getBoundingClientRect();
  const pos = new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pos,camera);
  const hit = raycaster.intersectObject(earth)[0];
  if (hit) {
    const point=hit.point.clone().normalize();
    // Three sphere UV: geographic prime meridian points along -Z, longitude grows toward -X.
    updateCoordinates(globePointCoordinates(point).lat, globePointCoordinates(point).lon);
    toast('Location selected. Use Explore Location to zoom in.');
  }
});
function setRenderQuality(next) {
  quality = next;
  const ratio = next === 'balanced' ? 1 : next === 'max' ? Math.min(2, window.devicePixelRatio || 1) : Math.min(1.65,window.devicePixelRatio||1);
  renderer.setPixelRatio(ratio);
  resize();
}
function resize() {
  const w=viewport.clientWidth,h=viewport.clientHeight;
  camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
window.addEventListener('resize',resize,{passive:true});
resize();
let last = performance.now(), frameCount=0, period=performance.now(), lowFrames=0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt=Math.min(0.05,(t-last)/1000);last=t;
  if (current !== 'classic' && current !== 'enhanced') return;
  orbit.autoRotate = autoRotate;
  orbit.update();
  cloudMesh.rotation.y += dt * 0.007;
  renderer.render(scene,camera);
  frameCount++;
  if(t-period>=1300) {
    const fps=frameCount*1000/(t-period);
    $('fps').textContent = Math.round(fps) + ' FPS · ' + (quality === 'max' ? 'HIGH' : quality === 'balanced' ? 'BALANCED' : 'ADAPTIVE');
    if(quality==='auto') {
      lowFrames = fps < 42 ? lowFrames+1 : Math.max(0,lowFrames-1);
      if(lowFrames>=4 && renderer.getPixelRatio()>1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio()-0.25));
        resize();lowFrames=0;
      }
    }
    period=t;frameCount=0;
  }
}
requestAnimationFrame(loop);

function setActive(mode) {
  current=mode;
  for(const button of document.querySelectorAll('.mode')) {
    const active=button.dataset.mode===mode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  $('planet-view').classList.toggle('hidden',mode!=='classic'&&mode!=='enhanced');
  $('google3d-view').classList.toggle('hidden',mode!=='google3d');
  $('maps-view').classList.toggle('hidden',mode!=='maps');
  $('legacy-view').classList.add('hidden');
  $('fps').style.display = mode==='classic'||mode==='enhanced' ? '' : 'none';
  $('credits').style.display = mode==='google3d'||mode==='maps' ? 'none' : '';
}
function setMode(mode) {
  $('notice').hidden=true;
  if(mode==='legacy') {
    window.open('https://life.orosapp.us/','_blank','noopener,noreferrer');
    toast('Original website opened in a new tab. It disallows cross-site embedding.');
    return;
  }
  if((mode==='google3d'||mode==='maps')&&!currentGoogleKey) {
    openSettings();
    toast('Enter a Google Maps API key to enable this licensed mode.',5500);
    return;
  }
  previous=current;
  setActive(mode);
  if(mode==='classic'||mode==='enhanced')$('earth-preset').value=mode;
  if(mode==='classic'||mode==='enhanced') {
    getEarthTexture(mode).then(tex=>{material.map=tex;material.needsUpdate=true;}).catch(()=>toast('Earth texture unavailable'));
    atmo.visible=showAtmosphere && mode==='enhanced';
    cloudMesh.visible=showClouds;
    orbit.autoRotate=autoRotate;
  } else if(mode==='google3d') connect3d().catch(error=>{console.error('Google 3D setup error',error.message);notice('Google 3D could not load. Check your billed API key, Map Tiles API permissions, referrer restrictions, quotas, and network connection.');setActive(previous);});
  else if(mode==='maps') connectMaps().catch(error=>{console.error('Google Maps setup error',error.message);notice('Google Maps could not load. Check your API key, Maps JavaScript API permissions, referrer restrictions and billing.');setActive(previous);});
}
for(const button of document.querySelectorAll('.mode')) button.addEventListener('click',()=>setMode(button.dataset.mode));
function openSettings(){$('settings').hidden=false;$('settings-btn').setAttribute('aria-expanded','true');}
function closeSettings(){$('settings').hidden=true;$('settings-btn').setAttribute('aria-expanded','false');}
$('settings-btn').onclick=()=> $('settings').hidden?openSettings():closeSettings();
$('settings-close').onclick=closeSettings;
$('earth-preset').onchange=e=>setMode(e.target.value);
$('quality').onchange=e=>setRenderQuality(e.target.value);
$('spin').onchange=e=>{autoRotate=e.target.checked;};
$('clouds').onchange=e=>{showClouds=e.target.checked;cloudMesh.visible=showClouds;};
$('atmo').onchange=e=>{showAtmosphere=e.target.checked;atmo.visible=showAtmosphere && current==='enhanced';};
$('google-connect').onclick=()=>{
  const key=$('google-key').value.trim();
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(key)) {toast('Enter a valid-looking Google Maps Platform key.');return;}
  currentGoogleKey=key;
  $('google-key').value='';
  closeSettings();
  toast('Key added to this tab only. Choose Google Earth 3D or Google Maps.');
};
function gotoGlobal() {
  if(current==='classic'||current==='enhanced') {
    camera.position.set(0,0.8,8.2);orbit.target.set(0,0,0);orbit.update();
  }else if(current==='google3d'&&googleViewer){
    googleViewer.camera.flyTo({destination:window.Cesium.Cartesian3.fromDegrees(0,20,18000000),duration:1.6});
  }else if(current==='maps'&&googleMap){googleMap.setCenter({lat:20,lng:0});googleMap.setZoom(2);}
}
$('reset').onclick=gotoGlobal;
$('explore').onclick=()=>{
  if(current==='classic'||current==='enhanced') {
    const {lat,lon}=selected;
    const vector=spherePoint(lat,lon,1);
    const dir=new THREE.Vector3(vector.x,vector.y,vector.z);
    camera.position.copy(dir.multiplyScalar(3.3));orbit.target.set(0,0,0);orbit.update();
    toast('High-detail city exploration requires the Google 3D mode, if available.',4900);
  }else if(current==='google3d'&&googleViewer){
    googleViewer.camera.flyTo({destination:window.Cesium.Cartesian3.fromDegrees(selected.lon,selected.lat,55000),duration:1.7});
  }else if(current==='maps'&&googleMap){googleMap.setCenter({lat:selected.lat,lng:selected.lon});googleMap.setZoom(11);}
};
function zoom(direction){
  if(current==='classic'||current==='enhanced') {
    camera.position.multiplyScalar(direction>0?0.8:1.25);
    const d=camera.position.length();if(d<orbit.minDistance)camera.position.setLength(orbit.minDistance);if(d>orbit.maxDistance)camera.position.setLength(orbit.maxDistance);
    orbit.update();
  }else if(current==='google3d'&&googleViewer){
    const C=window.Cesium; const c=googleViewer.camera;
    c.moveForward((direction>0?1:-1)*Math.max(100,c.positionCartographic.height*0.18));
    googleViewer.scene.requestRender();
  }else if(current==='maps'&&googleMap) googleMap.setZoom(googleMap.getZoom()+(direction>0?1:-1));
}
$('zoom-in').onclick=()=>zoom(1);
$('zoom-out').onclick=()=>zoom(-1);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeSettings();
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(e.key==='+'||e.key==='=')zoom(1);
  if(e.key==='-')zoom(-1);
});

// Third-party SDKs load only when the user deliberately enables Google modes.
// No Google tiles are stored by this app. Cesium displays per-tile credits.
function injectStyle(href){
  if(document.querySelector('link[data-external="'+href+'"]'))return;
  const node=document.createElement('link');node.rel='stylesheet';node.href=href;node.dataset.external=href;document.head.appendChild(node);
}
function injectScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;script.async=true;
    script.onload=resolve;script.onerror=()=>reject(new Error('Third-party SDK failed'));
    document.head.appendChild(script);
  });
}
async function loadCesium(){
  if(window.Cesium)return window.Cesium;
  if(!googleScript){
    const base='https://cdn.jsdelivr.net/npm/cesium@1.147/Build/Cesium/';
    window.CESIUM_BASE_URL=base;
    injectStyle(base+'Widgets/widgets.css');
    googleScript=injectScript(base+'Cesium.js');
  }
  await googleScript;
  if(!window.Cesium)throw new Error('Cesium unavailable');
  return window.Cesium;
}
async function connect3d(){
  const C=await loadCesium();
  if(current!=='google3d')return;
  if(!googleViewer){
    googleViewer=new C.Viewer('google3d-view',{
      animation:false,timeline:false,baseLayerPicker:false,baseLayer:false,
      homeButton:false,fullscreenButton:false,sceneModePicker:false,
      navigationHelpButton:false,geocoder:false,infoBox:false,selectionIndicator:false,
      globe:false,requestRenderMode:true,maximumRenderTimeChange:Infinity
    });
    if (googleViewer.scene.globe) googleViewer.scene.globe.show=false;
    googleViewer.scene.screenSpaceCameraController.enableCollisionDetection=false;
    // Google terms require using Google geocoder rather than other geocoders
    // if search is introduced. There is no geocoder/search in this prototype.
    const tiles=await C.createGooglePhotorealistic3DTileset(
      {key:currentGoogleKey},
      {showCreditsOnScreen:true,maximumScreenSpaceError:14,dynamicScreenSpaceError:true,
       progressiveResolutionHeightFraction:0.3,skipLevelOfDetail:true,foveatedScreenSpaceError:true}
    );
    googleViewer.scene.primitives.add(tiles);
    googleViewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(selected.lon,selected.lat,1300000),duration:2.0});
    googleViewer.screenSpaceEventHandler.setInputAction(movement=>{
      const ray=googleViewer.camera.getPickRay(movement.position);
      const point=(googleViewer.scene.pickPositionSupported && googleViewer.scene.pickPosition(movement.position)) || googleViewer.camera.pickEllipsoid(movement.position);
      if(point){
        const ll=C.Cartographic.fromCartesian(point);
        updateCoordinates(C.Math.toDegrees(ll.latitude),C.Math.toDegrees(ll.longitude));
      }
    },C.ScreenSpaceEventType.LEFT_CLICK);
  } else googleViewer.resize();
  toast('Google photorealistic tiles are streamed on demand. Quality depends on coverage.',5000);
}
async function loadMapsJS(){
  if(window.google?.maps)return window.google.maps;
  if(!mapsScript)mapsScript=new Promise((resolve,reject)=>{
    const callback='lifeAroundUsMapsLoaded';
    window[callback]=()=>{delete window[callback];resolve(window.google.maps);};
    const script=document.createElement('script');
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(currentGoogleKey)+'&v=weekly&loading=async&callback='+callback;
    script.async=true;script.onerror=()=>reject(new Error('Google Maps SDK failed'));document.head.appendChild(script);
  });
  return mapsScript;
}
async function connectMaps(){
  const maps=await loadMapsJS();
  if(current!=='maps')return;
  if(!googleMap){
    googleMap=new maps.Map($('maps-view'),{
      center:{lat:selected.lat,lng:selected.lon},zoom:9,mapTypeId:'hybrid',
      gestureHandling:'greedy',disableDefaultUI:true,zoomControl:false,
      clickableIcons:false,keyboardShortcuts:true,tilt:0,heading:0
    });
    googleMap.addListener('click',(evt)=>updateCoordinates(evt.latLng.lat(),evt.latLng.lng()));
  }else{googleMap.setCenter({lat:selected.lat,lng:selected.lon});googleMap.setZoom(9);}
  toast('Google Maps satellite imagery is streamed from Google; attribution remains visible.');
}
setActive('classic');
setRenderQuality('auto');
const params=new URLSearchParams(location.search);
if(params.get('lat')&&params.get('lon'))updateCoordinates(Number(params.get('lat')),Number(params.get('lon')));
