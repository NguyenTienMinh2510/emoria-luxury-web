EMORIA MEMORY HOUSE 3D

Implemented alongside the existing House Studio; its 2D live preview, forms,
navigation, photo gallery and publish flow are retained. No production deploy
or production database migration has been performed.

ASSETS
Reference images: public/memoryhouse (user supplied, preserved).
Blender source: docs/memoryhouse/memory-house.blend.
Rebuild in PowerShell from the repository root:
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/build-memory-house-blender.py
Requires Blender 5.2 (tested with 5.2.2 LTS); no add-ons or paid services needed.
The script reconstructs a stylized miniature from the image references using
real mesh geometry. This is not photogrammetry or exact image-to-3D conversion.
Generated GLBs, preview and catalog thumbnails: public/memoryhouse/models.
asset-info.json records sizes, triangle counts and stable identifiers.
The Blender file shows the house in the render camera. Library objects are
hidden in viewport/render and grouped under Decoration library; unhide one
decor_<id> hierarchy to edit it. Their origins intentionally coincide.
Rebuilding replaces generated files; preserve manual .blend edits separately
or incorporate them into the source script before rebuilding.

MODEL CONTRACT
glTF coordinates: +Y up, +Z front; units are metres.
Five room_<id> nodes carry extras.roomId.
Each room has three UV photo surfaces with extras.roomId and photoIndex 0..2.
Each room has three slot anchors with extras.roomId and slot left/table/right.
The title anchor has extras.titleAnchor=true.
The prop library has twelve decor_<id> roots with extras.assetId.
Do not rename these without updating the renderer, tests and DB allowlist.
Three.js GLTFLoader and OrbitControls are lazy loaded; no new dependencies.
Rendering is on demand; pixel ratio is capped at 1.5 and photos at 768x576.
At most fifteen photo textures and fifteen placed objects are used per house.

USER FLOW
Open House Studio from an owned NFC memory -> name/theme, add room photos ->
choose room, choose left/table/right and an item -> optional rotate/remove/undo
and day/sunset/night lighting -> save draft -> publish to refresh public link.
Three first photos per room hang in the 3D frames; all ten permitted photos
remain available in the existing room gallery. Tap a frame to open its photo.
Orbit, zoom, overview and room focus work in owner and visitor modes.
The placement interaction uses three preset positions per room, not free
dragging or scaling, so it stays simple and objects stay inside the house.
Undo affects only the previous decoration/lighting change, never photo edits.
The public viewer has no editing controls. Publishing freezes decorations with
the same snapshot as photos. Editing a draft does not change the public house.
If 3D/WebGL loading fails, the existing 2D flow remains usable.

DATA AND MIGRATION
The existing rooms_draft JSON holds per-room optional lighting and decorations:
  {"lighting":"sunset","decorations":[{"slot":"table","item":"vase","rotation":90}]}
New validation migration (apply after the existing event studios migration):
  supabase/migrations/20260928170000_memory_house_decorations.sql
No new table, destructive schema changes, RLS expansion or backfill is needed.
Older room JSON without these fields remains valid. Invalid asset IDs, slots,
duplicate slots, extra transform fields, rotations and lighting are rejected.
Production rollout: apply the new migration through the project's normal
Supabase migration process, then deploy the web/API changes together.
Owner draft API now retains photo_path so reopen -> save does not lose image
identity. Public responses still remove photo_path; only signed photo URLs
are rendered. Signed URLs are removed before saving rooms back to the DB.

CHECKS
  npm.cmd run test:house3d
  npm.cmd run test:ci
  npm.cmd run test:event-db
  npm.cmd run build
Database tests require the local supabase_db_emoria-sandbox container (or set
EMORIA_CONTAINER). They apply migrations and run regression SQL; fixture rows
for the new decoration test are rolled back. Missing Docker exits nonzero;
--allow-skip is explicitly unverified.
Browser QA uses an ignored .local/house-qa.html fixture with fake transport:
full Studio, real GLBs and rendering, no production API writes. It is distinct
from the real PostgreSQL RPC tests. The fixture is not included in Vite build.
