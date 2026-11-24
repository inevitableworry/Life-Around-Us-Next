import test from 'node:test';
import assert from 'node:assert/strict';
import {spherePoint,globePointCoordinates,normalizeLongitude} from '../src/geodesy.js';
test('Earth sphere and geographic coordinates match at surveyed cities',()=>{
 const cities=[
  ['Greenwich',51.4769,0.0005],['New York',40.7128,-74.006],
  ['Hickory',35.7345,-81.3445],['Tokyo',35.6762,139.6503],
  ['Sydney',-33.8688,151.2093],['Cape Town',-33.9249,18.4241],
  ['West Dateline',0,-179.99],['East Dateline',0,179.99],
 ];
 for(const [name,lat,lon] of cities){
  const point=spherePoint(lat,lon,2.2);
  const result=globePointCoordinates(point);
  assert.ok(Math.abs(result.lat-lat)<1e-9,name+' latitude mismatch');
  assert.ok(Math.abs(result.lon-lon)<1e-9,name+' longitude mismatch');
 }
});
test('Geographic longitude normalization and invalid input',()=>{
 assert.equal(normalizeLongitude(190),-170);
 assert.equal(normalizeLongitude(-190),170);
 assert.throws(()=>globePointCoordinates({x:0,y:0,z:0}),RangeError);
});

test('NASA texture cardinal orientation matches sphere geometry',()=>{
 const eq=spherePoint(0,0),east=spherePoint(0,90),west=spherePoint(0,-90);
 assert.ok(eq.x>0.9999&&Math.abs(eq.z)<1e-9);
 assert.ok(east.z<-.9999);
 assert.ok(west.z>.9999);
});
