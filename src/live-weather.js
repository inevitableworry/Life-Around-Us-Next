import {weatherIcon, weatherLabel} from './weather-icons.js';
const $ = id => document.getElementById(id);
// Honor the original Life refresh behavior: three-hour weather cache,
 // a day's stale fallback during outages, and rate-limit backoff.
const TTL = 3 * 60 * 60 * 1000;
const MAX_STALE = 24 * 60 * 60 * 1000;
const LOCAL_CACHE_KEY='life-next-openmeteo-cache-v3';
const BACKOFF_KEY='life-next-openmeteo-backoff';
let blockedUntil=Number(localStorage.getItem(BACKOFF_KEY)||0);
function getCached(key){
 const memory=cache.get(key);
 if(memory)return memory;
 try{
  const all=JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY)||'{}');
  const entry=all[key];
  if(entry && Date.now()-entry.time<MAX_STALE && entry.data?.current){cache.set(key,entry);return entry;}
 }catch{}
 return null;
}
function saveCached(key,value){
 cache.set(key,value);
 try{
  const all=JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY)||'{}');
  all[key]=value;
  const keys=Object.keys(all).filter(id=>Date.now()-all[id].time<MAX_STALE)
    .sort((a,b)=>all[b].time-all[a].time).slice(0,25);
  const trimmed={};for(const id of keys)trimmed[id]=all[id];
  localStorage.setItem(LOCAL_CACHE_KEY,JSON.stringify(trimmed));
 }catch{}
}

const cache = new Map();
let seq=0, abort=null, latest=null, timezone='UTC', city='Planet Earth';
let unit = localStorage.getItem('life-next-temp-unit')==='fahrenheit'?'fahrenheit':'celsius';
let visible = localStorage.getItem('life-next-show-weather')!=='false';
function temp(n){
 if(n==null || !Number.isFinite(Number(n)))return '\u2014';
 return Math.round(unit==='fahrenheit'?Number(n)*1.8+32:Number(n))+'\u00b0'+(unit==='fahrenheit'?'F':'C');
}
function clock(){
 let now = new Date();
 try{
  $('city-time').textContent = new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(now).filter(x=>x.type!=='dayPeriod').map(x=>x.value).join('').trim();
  $('city-date').textContent = new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'long',month:'short',day:'numeric'}).format(now);
  $('city-ampm').textContent = new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',hour12:true}).formatToParts(now).find(x=>x.type==='dayPeriod')?.value||'';
 }catch{ $('city-time').textContent=now.toLocaleTimeString(); $('city-date').textContent=now.toDateString(); }
}
function render(data){
 if(!data?.current)return;
 const c=data.current,day=c.is_day===1;
 $('weather-temp').textContent=temp(c.temperature_2m);
 $('weather-icon').innerHTML=weatherIcon(c.weather_code,day);
 $('weather-description').textContent=weatherLabel(c.weather_code,day);
 $('weather-details').textContent=temp(c.apparent_temperature)+' feels like | Humidity '+(c.relative_humidity_2m??'\u2014')+'% | Wind '+(c.wind_speed_10m??'\u2014')+' km/h | Open-Meteo';
 const d=data.daily||{}; $('weather-days').replaceChildren();
 for(let i=0;i<Math.min(3,d.time?.length||0);i++){
  let div=document.createElement('div'),title=document.createElement('span'),hi=document.createElement('b'),lo=document.createElement('small');
  title.textContent=i===0?'TODAY':new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(new Date(d.time[i]+'T12:00:00Z')).toUpperCase();
  hi.textContent=temp(d.temperature_2m_max?.[i]);lo.textContent=temp(d.temperature_2m_min?.[i]);
  div.append(title,hi,lo);$('weather-days').append(div);
 }
 $('headline-one').textContent=city+' | '+temp(c.temperature_2m)+' | '+weatherLabel(c.weather_code,day);
 const prob=d.precipitation_probability_max?.[0];
 $('headline-two').textContent='Open-Meteo | '+(prob!=null?prob+'% precipitation probability':'Humidity '+c.relative_humidity_2m+'%');
 $('headline-three').textContent='Today '+temp(d.temperature_2m_max?.[0])+' / '+temp(d.temperature_2m_min?.[0])+' | 3-day forecast';
}
export function setTemperatureUnit(v){if(!['celsius','fahrenheit'].includes(v))return;unit=v;localStorage.setItem('life-next-temp-unit',v);if(latest)render(latest);}
export function getTemperatureUnit(){return unit;}
export function setWeatherVisible(v){visible=Boolean(v);localStorage.setItem('life-next-show-weather',String(visible));for(const id of ['weather','weather-details','weather-days'])$(id).hidden=!visible;}
export function getWeatherVisible(){return visible;}
export async function updateCityWeather(lat,lon,name='Selected location'){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 city=String(name||'Selected location');$('location-name').textContent=city;
 const id=++seq,key=lat.toFixed(2)+','+lon.toFixed(2);
 const previous=getCached(key);
 if(previous){latest=previous.data;timezone=latest.timezone||'UTC';clock();render(latest);if(Date.now()-previous.time<TTL)return;}
 if(Date.now()<blockedUntil){
   $('weather-description').textContent=previous?'Cached weather ? Provider temporarily limited':'Weather is rate-limited; retry later';
   return;
 }
 abort?.abort();abort=new AbortController();
 $('weather-description').textContent=previous?'Refreshing weather...':'Loading Open-Meteo...';
 const u=new URL('https://api.open-meteo.com/v1/forecast');
 u.searchParams.set('latitude',lat.toFixed(4));u.searchParams.set('longitude',lon.toFixed(4));
 u.searchParams.set('current','temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m');
 u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max');
 u.searchParams.set('forecast_days','3');u.searchParams.set('timezone','auto');
 try{
  const res=await fetch(u,{signal:abort.signal});
  if(res.status===429){
    let reason='';try{reason=(await res.json()).reason||'';}catch{}
    blockedUntil=/daily/i.test(reason)?(Math.floor(Date.now()/86400000)+1)*86400000+10*60000:Date.now()+3600000;
    localStorage.setItem(BACKOFF_KEY,String(blockedUntil));
    throw new Error('Open-Meteo rate limit; cached conditions retained');
  }
  if(!res.ok)throw new Error('Open-Meteo '+res.status);
  const data=await res.json();if(!data?.current)throw new Error('Missing current conditions');
  if(id!==seq)return;latest=data;timezone=data.timezone||'UTC';
  saveCached(key,{time:Date.now(),data});clock();render(data);
 }catch(err){if(err.name==='AbortError'||id!==seq)return;console.warn('Open-Meteo:',err.message);$('weather-description').textContent=previous?'Cached weather':'Weather currently unavailable';}
}
setTemperatureUnit(unit);setWeatherVisible(visible);clock();setInterval(clock,30000);
