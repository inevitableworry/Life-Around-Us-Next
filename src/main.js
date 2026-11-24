import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {spherePoint,globePointCoordinates,normalizeLongitude} from './geodesy.js';
import {CITIES} from './cities.js';
import {updateCityWeather,setTemperatureUnit,getTemperatureUnit,setWeatherVisible,getWeatherVisible} from './live-weather.js';


const $ = (id) => document.getElementById(id);
const PROVIDERS=['classic','enhanced','maplibre','google3d','maps'];
const RADIUS = 2.2;
let current = 'classic', previous = 'classic';
let currentProvider='classic', home=null, cityIndex=0, weatherTimer=null, lastGeocode=0;
let currentGoogleKey = '';
let selected = {lat: 0, lon: 0};
let currentCityName='Planet Earth';
let googleViewer = null, googleMap = null, googleScript = null, mapsScript = null;
let freeMap = null, freeMapImport = null, freeMapMarker = null;
const freeMapStyles = Object.freeze({liberty:'https://tiles.openfreemap.org/styles/liberty',dark:'https://tiles.openfreemap.org/styles/dark',positron:'https://tiles.openfreemap.org/styles/positron'});
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
function updateCoordinates(lat, lon, name) {
  if(!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return;
  selected = {lat: clamp(Number(lat), -85, 85), lon: normalizeLongitude(Number(lon))};
  $('coordinates').textContent = selected.lat.toFixed(4) + '\u00b0, ' + selected.lon.toFixed(4) + '\u00b0';
  const nearest=CITIES.reduce((a,b)=>{
    const d=Math.hypot((b.lat-selected.lat), (b.lon-selected.lon)*Math.cos(selected.lat*Math.PI/180));
    return d<a.distance?{city:b,distance:d}:a;
  },{city:null,distance:Infinity});
  const known=nearest.distance<1.5?nearest.city:null;
  currentCityName=name || known?.name || 'Selected location';
  $('city-country').textContent=known?.country?.toUpperCase() || 'LIVE EARTH WEATHER';
  clearTimeout(weatherTimer);
  weatherTimer=setTimeout(()=>updateCityWeather(selected.lat,selected.lon,currentCityName),360);
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
// Unified globe: location lights and home beacon are anchored to geographic coordinates.
const lightGeo=new THREE.BufferGeometry();
const lightCoords=[];
for(const city of CITIES){
 const v=spherePoint(city.lat,city.lon,RADIUS*1.007);
 lightCoords.push(v.x,v.y,v.z);
}
lightGeo.setAttribute('position',new THREE.Float32BufferAttribute(lightCoords,3));
const dotCanvas=document.createElement('canvas');dotCanvas.width=32;dotCanvas.height=32;
const dotContext=dotCanvas.getContext('2d');
const dotGlow=dotContext.createRadialGradient(16,16,0,16,16,16);
dotGlow.addColorStop(0,'rgba(255,255,255,1)');
dotGlow.addColorStop(0.19,'rgba(157,232,255,.95)');
dotGlow.addColorStop(.5,'rgba(97,182,255,.34)');
dotGlow.addColorStop(1,'rgba(80,153,255,0)');
dotContext.fillStyle=dotGlow;dotContext.fillRect(0,0,32,32);
const citiesGlow=new THREE.Points(lightGeo,new THREE.PointsMaterial({
 color:0xc4eaff,size:7,sizeAttenuation:false,map:new THREE.CanvasTexture(dotCanvas),
 transparent:true,alphaTest:.02,opacity:.75,depthWrite:false,
 blending:THREE.AdditiveBlending
}));
scene.add(citiesGlow);

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
  positionHomeBeacon();
  // Seamless near-surface detail: the free map continues the same Earth and
  // coordinates instead of presenting a second globe selection panel.
  if((current==='classic'||current==='enhanced')&&camera.position.length()<2.92){
    const look=globePointCoordinates(camera.position);
    if(Number.isFinite(look.lat)&&Number.isFinite(look.lon)){
      updateCoordinates(look.lat,look.lon);
      setMode('maplibre');
    }
  }
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
  $('earth-provider').value = mode==='google3d'||mode==='maps'?'google':currentProvider;
  $('google-choice').hidden = !['google3d','maps'].includes(mode);
  if(mode==='google3d'||mode==='maps')$('google-visual').value=mode;
  $('planet-view').classList.toggle('hidden',mode!=='classic'&&mode!=='enhanced');
  $('home-beacon').style.display=mode==='classic'||mode==='enhanced'?'':'none';
  $('google3d-view').classList.toggle('hidden',mode!=='google3d');
  $('maplibre-view').classList.toggle('hidden',mode!=='maplibre');
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
  if(mode==='classic'||mode==='enhanced')currentProvider=mode;
  if(mode==='classic'||mode==='enhanced') {
    getEarthTexture(mode).then(tex=>{material.map=tex;material.needsUpdate=true;}).catch(()=>toast('Earth texture unavailable'));
    atmo.visible=showAtmosphere && mode==='enhanced';
    cloudMesh.visible=showClouds;
    orbit.autoRotate=autoRotate;
  } else if(mode==='maplibre') connectFreeMap().catch(error=>{console.error('MapLibre error:',error.message);notice('MapLibre could not load the free map tiles. Check the network connection and try again.');setActive(previous);});
  else if(mode==='google3d') connect3d().catch(error=>{console.error('Google 3D setup error',error.message);notice('Google 3D could not load. Check your billed API key, Map Tiles API permissions, referrer restrictions, quotas, and network connection.');setActive(previous);});
  else if(mode==='maps') connectMaps().catch(error=>{console.error('Google Maps setup error',error.message);notice('Google Maps could not load. Check your API key, Maps JavaScript API permissions, referrer restrictions and billing.');setActive(previous);});
}
// One Earth viewport and provider controls live in Settings, not separate globe buttons.
$('earth-provider').addEventListener('change',e=>{
  const source=e.target.value;
  $('google-choice').hidden=source!=='google';
  if(source==='google'){
    if(!currentGoogleKey){
      toast('Add a Google Maps key in Settings, or use the free MapLibre option.');
      // The choice stays expanded; imagery changes only with an enabled key.
      return;
    }
    setMode($('google-visual').value);
  }else{
    currentProvider=source;
    localStorage.setItem('life-next-earth-provider',source);
    setMode(source);
  }
});
$('google-visual').addEventListener('change',e=>setMode(e.target.value));
function openSettings(){$('settings').hidden=false;$('settings-btn').setAttribute('aria-expanded','true');}
function closeSettings(){$('settings').hidden=true;$('settings-btn').setAttribute('aria-expanded','false');}
$('settings-btn').onclick=()=> $('settings').hidden?openSettings():closeSettings();
$('settings-close').onclick=closeSettings;
$('temperature-unit').value=getTemperatureUnit();
$('temperature-unit').addEventListener('change',e=>setTemperatureUnit(e.target.value));
$('show-weather').checked=getWeatherVisible();
$('show-weather').addEventListener('change',e=>setWeatherVisible(e.target.checked));
$('free-map-style').onchange=e=>{
  if(freeMap)freeMap.setStyle(freeMapStyles[e.target.value]);
};
$('quality').onchange=e=>setRenderQuality(e.target.value);
$('spin').onchange=e=>{autoRotate=e.target.checked;};
$('clouds').onchange=e=>{showClouds=e.target.checked;cloudMesh.visible=showClouds;};
$('atmo').onchange=e=>{showAtmosphere=e.target.checked;atmo.visible=showAtmosphere && current==='enhanced';};
$('google-connect').onclick=()=>{
  const key=$('google-key').value.trim();
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(key)) {toast('Enter a valid-looking Google Maps Platform key.');return;}
  currentGoogleKey=key;
  $('google-key').value='';
  $('earth-provider').value='google';$('google-choice').hidden=false;
  closeSettings();
  toast('Key added to this tab only. Choose Google Earth 3D or Google Maps.');
};
function gotoGlobal() {
  if(current==='classic'||current==='enhanced') {
    camera.position.set(0,0.8,8.2);orbit.target.set(0,0,0);orbit.update();
  }else if(current==='google3d'&&googleViewer){
    googleViewer.camera.flyTo({destination:window.Cesium.Cartesian3.fromDegrees(0,20,18000000),duration:1.6});
  }else if(current==='maplibre'&&freeMap){freeMap.flyTo({center:[0,20],zoom:1.4,pitch:0,duration:1300});}
  else if(current==='maps'&&googleMap){googleMap.setCenter({lat:20,lng:0});googleMap.setZoom(2);}
}
$('reset').onclick=gotoGlobal;
$('explore').onclick=()=>{
  if(current==='classic'||current==='enhanced') {
    const {lat,lon}=selected;
    const vector=spherePoint(lat,lon,1);
    const dir=new THREE.Vector3(vector.x,vector.y,vector.z);
    camera.position.copy(dir.multiplyScalar(3.3));orbit.target.set(0,0,0);orbit.update();
    toast('Zooming toward this location; detailed streets use free MapLibre.',2800);
    setTimeout(()=>{if(current==='classic'||current==='enhanced'){setMode('maplibre');}},650);
  }else if(current==='google3d'&&googleViewer){
    googleViewer.camera.flyTo({destination:window.Cesium.Cartesian3.fromDegrees(selected.lon,selected.lat,55000),duration:1.7});
  }else if(current==='maplibre'&&freeMap){freeMap.flyTo({center:[selected.lon,selected.lat],zoom:Math.max(12,freeMap.getZoom()),pitch:60,duration:1450});}
  else if(current==='maps'&&googleMap){googleMap.setCenter({lat:selected.lat,lng:selected.lon});googleMap.setZoom(11);}
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
  }else if(current==='maplibre'&&freeMap){freeMap.zoomTo(Math.max(0,Math.min(19,freeMap.getZoom()+(direction>0?1:-1))),{duration:400});}
  else if(current==='maps'&&googleMap) googleMap.setZoom(googleMap.getZoom()+(direction>0?1:-1));
}
$('zoom-in').onclick=()=>zoom(1);
$('zoom-out').onclick=()=>zoom(-1);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeSettings();
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(e.key==='+'||e.key==='=')zoom(1);
  if(e.key==='-')zoom(-1);
});

// The free map renderer is loaded only when the visitor chooses MapLibre.
// Uses OpenFreeMap's OpenStreetMap-derived Liberty/Dark/Positron styles.
// No Google API key, billing, proxy or tile scraping. Attribution is always visible.
async function connectFreeMap() {
  if (!freeMapImport) freeMapImport = import('./free-map.js').then(module=>module.default);
  const maplibre = await freeMapImport;
  maplibreMarkerConstructor=maplibre.Marker;
  if (current !== 'maplibre') return;
  if (!freeMap) {
    freeMap = new maplibre.Map({
      container: 'maplibre-view',
      style: freeMapStyles[$('free-map-style').value],
      center: [selected.lon, selected.lat],
      zoom: Math.abs(selected.lat) > 0.01 || Math.abs(selected.lon)>0.01 ? 8.5 : 1.6,
      pitch: 45,
      maxPitch: 75,
      minZoom: 0,
      maxZoom: 19,
      attributionControl: false,
      antialias: true,
      cooperativeGestures: false,
      maxTileCacheSize: 120,
      fadeDuration: 150
    });
    freeMap.addControl(new maplibre.AttributionControl({compact:false}), 'bottom-left');
    freeMap.on('style.load', () => {
      // A globe at low zoom turns naturally into usable street-level tiles.
      // The style swap resets projection, so reapply it every time.
      try { freeMap.setProjection({type:'globe'}); }
      catch (err) { console.warn('Globe projection unavailable; map remains usable.',err.message); }
    });
    freeMap.on('click', e => {
      updateCoordinates(e.lngLat.lat, e.lngLat.lng);
      // Home beacon stays anchored to saved address instead of jumping on clicks.
    });
    freeMap.on('error', e => {
      // MapLibre keeps rendering other tiles when one request fails.
      if(e?.error)console.warn('Free map tile error:',e.error.message || String(e.error));
    });
    freeMap.on('zoomend',()=>{
      if(current==='maplibre'&&currentProvider!=='maplibre'&&freeMap.getZoom()<1.35){
        const c=freeMap.getCenter();
        updateCoordinates(c.lat,c.lng);
        setMode(currentProvider);
        const point=spherePoint(c.lat,c.lng,1);
        camera.position.copy(new THREE.Vector3(point.x,point.y,point.z).multiplyScalar(8.2));
        orbit.update();
        toast('Returned to your selected NASA globe.');
      }
    });
    freeMap.on('moveend', () => {
      if (current !== 'maplibre') return;
      const center=freeMap.getCenter();
      $('distance').textContent='MapLibre | zoom '+freeMap.getZoom().toFixed(1);
      // The saved selection follows the moved center so the next mode can open
      // the area the visitor actually browsed.
      updateCoordinates(center.lat,center.lng);
    });
    freeMap.once('load',()=>{freeMap.resize();renderHomeBeacon();});
  } else {
    freeMap.resize();
    freeMap.flyTo({center:[selected.lon,selected.lat],duration:900,zoom:Math.max(2,Math.min(11,freeMap.getZoom()))});
  }
  renderHomeBeacon();
  toast('Free OpenStreetMap streets and buildings. Scroll or pinch to explore.');
}

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
// Address lookups are user-initiated only. The public Nominatim instance is
// not an autocomplete service; do not issue continuous searches or scrape it.
// Production high-volume installs should use a dedicated geocoder.
function initHome(){
 try{
  const item=JSON.parse(localStorage.getItem('life-next-home-v1')||'null');
  if(item && Number.isFinite(item.lat)&&Number.isFinite(item.lon) && typeof item.address==='string'){
    home=item; $('home-address').value=item.address;
  }
 }catch{}
 $('show-home-beacon').checked=localStorage.getItem('life-next-show-beacon')!=='false';
 $('show-home-beacon').addEventListener('change',e=>{
   localStorage.setItem('life-next-show-beacon',String(e.target.checked));
   renderHomeBeacon();
 });
 $('save-address').addEventListener('click',saveAddress);
 $('clear-address').addEventListener('click',()=>{
   home=null;localStorage.removeItem('life-next-home-v1');$('home-address').value='';
   renderHomeBeacon();toast('Saved location removed from this browser.');
 });
 renderHomeBeacon();
}
async function saveAddress(){
 const address=$('home-address').value.trim();
 if(address.length<3||address.length>180){toast('Enter an address or city.');return;}
 const delay=1000-(Date.now()-lastGeocode);
 if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
 lastGeocode=Date.now();
 const btn=$('save-address');btn.disabled=true;btn.textContent='FINDING ADDRESS...';
 try{
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q',address);
  url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');
  const response=await fetch(url.toString(),{headers:{Accept:'application/json'},referrerPolicy:'strict-origin-when-cross-origin'});
  if(!response.ok)throw new Error('Address search HTTP '+response.status);
  const list=await response.json();
  if(!list.length)throw new Error('Address not found. Check spelling or include city/state.');
  const lat=Number(list[0].lat),lon=Number(list[0].lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Invalid map coordinates');
  home={address,lat,lon};
  localStorage.setItem('life-next-home-v1',JSON.stringify(home));
  $('show-home-beacon').checked=true;
  localStorage.setItem('life-next-show-beacon','true');
  updateCoordinates(lat,lon,'Home Location');renderHomeBeacon();
  if(current==='maplibre'&&freeMap)freeMap.flyTo({center:[lon,lat],zoom:12,duration:1350});
  else if(current==='classic'||current==='enhanced'){
    const point=spherePoint(lat,lon,1);
    camera.position.copy(new THREE.Vector3(point.x,point.y,point.z).multiplyScalar(5.2));
    orbit.update();
  }
  closeSettings();toast('Home beacon saved in this browser. Blue light enabled.');
 }catch(err){toast(err.message,6000);}
 finally{btn.disabled=false;btn.textContent='FIND & SAVE ADDRESS';}
}
function renderHomeBeacon(){
 const visible=!!home&&$('show-home-beacon').checked;
 $('home-beacon').hidden=!visible;
 if(freeMap&&home&&maplibreMarkerConstructor){
  if(!freeMapMarker){
    const el=document.createElement('div');el.className='blue-map-beacon';
    freeMapMarker=new (freeMapImportResolvedMarker())({element:el,anchor:'center'});
  }
  freeMapMarker.setLngLat([home.lon,home.lat]).addTo(freeMap);
  freeMapMarker.getElement().hidden=!visible;
 }
}
let maplibreMarkerConstructor=null;
function freeMapImportResolvedMarker(){
 if(!maplibreMarkerConstructor)throw new Error('MapLibre marker not ready');
 return maplibreMarkerConstructor;
}
function positionHomeBeacon(){
 if(!home||$('home-beacon').hidden||!(current==='classic'||current==='enhanced'))return;
 const coord=spherePoint(home.lat,home.lon,RADIUS*1.012);
 const pos=new THREE.Vector3(coord.x,coord.y,coord.z);
 const isFront=pos.dot(camera.position)>RADIUS*RADIUS;
 $('home-beacon').style.visibility=isFront?'visible':'hidden';
 if(!isFront)return;
 const ndc=pos.clone().project(camera);
 $('home-beacon').style.left=((ndc.x+1)*.5*window.innerWidth)+'px';
 $('home-beacon').style.top=((-ndc.y+1)*.5*window.innerHeight)+'px';
}

setActive('classic');
setRenderQuality('auto');
initHome();
const remembered=localStorage.getItem('life-next-earth-provider');
if(['classic','enhanced','maplibre'].includes(remembered)){
 currentProvider=remembered;
 if(remembered!=='classic')setMode(remembered);
}
$('earth-provider').value=currentProvider;
cityIndex=Math.max(0,CITIES.findIndex(city=>city.name==='New York'));
function visitCity(offset){
 cityIndex=(cityIndex+offset+CITIES.length)%CITIES.length;
 const c=CITIES[cityIndex];
 updateCoordinates(c.lat,c.lon,c.name);
 $('city-tour-position').textContent=(cityIndex+1)+' / '+CITIES.length;
 if(current==='maplibre'&&freeMap)freeMap.flyTo({center:[c.lon,c.lat],zoom:7.8,duration:1200});
 else if(current==='classic'||current==='enhanced'){
   const point=spherePoint(c.lat,c.lon,1);
   camera.position.copy(new THREE.Vector3(point.x,point.y,point.z).multiplyScalar(8.2));
   orbit.update();
 }
}
$('previous-city').addEventListener('click',()=>visitCity(-1));
$('next-city').addEventListener('click',()=>visitCity(1));
visitCity(0);
if(home){
  updateCoordinates(home.lat,home.lon,'Home Location');
  const coord=spherePoint(home.lat,home.lon,1);
  camera.position.copy(new THREE.Vector3(coord.x,coord.y,coord.z).multiplyScalar(7.2));
  orbit.update();
}
const params=new URLSearchParams(location.search);
if(params.get('lat')&&params.get('lon'))updateCoordinates(Number(params.get('lat')),Number(params.get('lon')));
