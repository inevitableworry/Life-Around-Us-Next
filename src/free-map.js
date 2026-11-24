// MapLibre GL JS 6 requires an explicit worker URL for bundled Vite builds.
// This module is lazy-loaded only when the user opens Free Map mode.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
maplibregl.setWorkerUrl(workerUrl);
export default maplibregl;
