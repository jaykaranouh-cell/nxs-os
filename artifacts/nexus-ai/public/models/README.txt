NXS City — import your own 3D city here
=======================================

Drop a glTF binary named exactly:

    city.glb

into this folder (artifacts/nexus-ai/public/models/city.glb).

That's it. Next time NXS City loads in 3D mode it will detect the file,
use YOUR city as the buildings, and keep the live data layer on top
(glowing conduits, flowing data packets, district labels, click-to-enter).
If the file is missing or fails to load, it falls back to the built-in
procedural city automatically. No code changes needed.

Where to get a city kit (export/convert to .glb):
  - KitBash3D        — high-end sci-fi / cyberpunk city kits (matches the neon look)
  - Sketchfab        — search "sci-fi city" / "cyberpunk city", filter Downloadable + glTF
  - Quaternius       — free low-poly city packs (CC0)
  - Kenney.nl        — free building/city assets (CC0)

Tuning (only if needed) — edit these constants in:
    artifacts/nexus-ai/src/components/city/City3D.tsx
  CITY_MODEL_FIT       how wide the city is scaled to (world units, default 30)
  CITY_MODEL_Y_OFFSET  nudge up/down if it sits below/above the floor
  ANGLES / HEIGHTS     where each district's label + conduit anchors sit

Keep the file reasonably sized (ideally < ~25 MB). If your model is .fbx,
.obj or .blend, export/convert to .glb first (Blender: File > Export > glTF
2.0, format "glTF Binary (.glb)").
