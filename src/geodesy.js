const RAD=Math.PI/180;
export function clampLatitude(lat){return Math.min(85,Math.max(-85,lat));}
export function normalizeLongitude(lon){return ((lon+540)%360)-180;}
export function spherePoint(lat,lon,radius=1){
 const phi=lat*RAD,lambda=lon*RAD;
 // Three.js SphereGeometry maps equirectangular longitude 0 to +X.
 // +Z is longitude -90; -Z is +90, matching NASA 2:1 imagery.
 return {x:radius*Math.cos(phi)*Math.cos(lambda),
         y:radius*Math.sin(phi),
         z:-radius*Math.cos(phi)*Math.sin(lambda)};
}
export function globePointCoordinates(point){
 const length=Math.hypot(point.x,point.y,point.z);
 if(length===0||!Number.isFinite(length))throw new RangeError('Invalid globe point');
 return {lat:Math.asin(point.y/length)/RAD,lon:normalizeLongitude(Math.atan2(-point.z,point.x)/RAD)};
}
