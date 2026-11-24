# Life Around Us: Next — development roadmap

- [x] Separate Earth exploration test codebase, no changes to the existing Life site
- [x] NASA original-style 2K equirectangular Earth
- [x] Enhanced NASA 4K georeferenced globe
- [x] Fresnel atmospheric effect, WebGL physically-based illumination, clouds, starfield
- [x] Browser display quality selector with adaptive pixel ratio
- [x] Longitude/latitude selection from a clicked Earth point
- [x] Google Photorealistic 3D Tiles with CesiumJS integration scaffold
- [x] Google Maps hybrid/satellite web integration scaffold
- [x] API key stored only in current browser tab memory
- [x] Separate Cloudflare-compatible static web build configuration
- [ ] Test with a real enabled Google API key, billing, and domain referrer permissions
- [ ] Validate Google attribution visibility in each supported browser and all loaded tiles
- [ ] Add licensed 3D elevation and global tile LOD with no unauthorized content
- [ ] Add NASA/Copernicus monthly/time-series geography from explicitly redistributable datasets
- [ ] Optimize texture compression with KTX2 and use WebGPU where stable
- [ ] Benchmark performance on RTX 3080, Android, tablets and foldables
- [ ] Add optional offline AI image enhancement only for NASA/other permitted assets; no false detail claims
- [ ] Verify accurate globe longitude conventions against independent surveyed city points
- [ ] Add graceful slow-network and Google billing quota fallback
- [ ] Complete website review and screenshots, then configure custom domain lifenext.orosapp.us
- [ ] Cloudflare billable Google quota testing and access restrictions

4K is texture resolution, NOT NVIDIA DLSS 4/5. Internet connectivity and legal Google tile-fetch restrictions prevent guaranteed zero-load Google Earth-style zoom at arbitrary positions.
