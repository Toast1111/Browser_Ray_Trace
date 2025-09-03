# Browser Ray Tracer (WebGL Ray Marching)

A tiny, portable ray tracer that runs entirely in the browser using WebGL fragment shaders (no server, no plugins). It works on desktops, tablets, phones—even a smart fridge if it has a modern browser.

## Features

- Signed Distance Field (SDF) ray marching in a fragment shader
- Simple scenes: spheres, plane, box room, orbiting objects
- Lighting: diffuse, specular, soft shadows, cheap reflections
- Mouse and touch controls (orbit, zoom/pinch)
- Resolution scaling for performance on mobile/high-DPI
- WebGL2 preferred with graceful WebGL1 fallback

## Quick start

1) Open index.html directly: Many browsers block file:// shader loading. Prefer a local server.

2) Run a static server in this folder.

Try one of the following options:

- Python 3

	```bash
	python3 -m http.server 5173
	```

- Node (if available)

	```bash
	npx serve -l 5173
	```

Then open: <http://localhost:5173/>

## Controls

- Drag: orbit
- Mouse wheel / pinch: zoom
- Two-finger drag: pan (limited)
- Scene, resolution, pause/reset: top-left UI

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow that deploys the site to GitHub Pages on each push to main.

Steps:

1) Commit and push your changes to the `main` branch.

2) In your repository settings, under “Pages”, set Source to “GitHub Actions”.

3) After the workflow completes, your site will be available at:
	- User/Org site: <https://YOUR-USER.github.io/>
	- Project site: <https://YOUR-USER.github.io/Browser_Ray_Trace/>

Tip: For this repository, the project site will be at <https://Toast1111.github.io/Browser_Ray_Trace/> after the first successful deploy.

You can also trigger a manual deploy from the Actions tab using “Deploy to GitHub Pages”.

## Notes

- If performance is low, reduce the Resolution Scale in the UI.
- WebGL must be enabled in the browser. WebGPU is not required.
- This ray tracer uses ray marching and is not path-traced; it focuses on speed and portability.

---

## Browser_Ray_Trace

want to test your machine for performance, whether it’s a Mac, iPad, or Desktop you can see if your device can ray trace
