EMORIA COZY HOUSE — 2026-10-03

46 distinct decor_<id> roots reconstructed and exported in Blender 5.2.2 LTS.
Source: docs/memoryhouse/memory-house-cozy.blend.
Rebuild from repository root:
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/build-memory-house-blender.py

All 46 object references and 57 source-image hashes are retained in cozy-catalog.json.
The GLBs use +Y up / +Z front and centred floor pivots. Asset dimensions, surfaces,
photo/text anchors, 46 rendered JPEG thumbnails and 2D silhouettes share stable IDs.
Solid-colour meshes omit unused UVs; editable photo/text planes retain UV mapping.
The house has real windows, arched openings and stairs. Fixed gallery photos form
small offset clipped cards, preserving memory IDs and gallery order.

New houses use the H05 layout recorded in cozy-layout.json: capybara/cat and rugs,
asymmetric date table with shiba, music cubby with plants/ducks, sofa/teddy upstairs,
and a desk/rabbit corner. Public rendering reads the saved snapshot without adding
furniture. Saved deletions are not undone on refresh.

Existing layouts are never inferred from account names or tag strings. The owner
can preview a conservative addition of new types, or explicitly preview H05
rearrangement. The latter keeps every old instance and its photo/text content.
Applying saves the draft with a revision check and creates a private database
layout backup. Restore changes furnishing layout while preserving current room
content and intentional deletions. It does not publish, change PINs or share IDs.
Only the existing moderated, revision-checked publish flow updates a public snapshot
and captures/uploads a fresh 3D preview. Draft content stays out of public responses.

Forward migrations:
  20261003100000_house_complete_catalog.sql (46 items, v2 provenance, private backup/restore)
  20261003110000_house_cozy_surfaces.sql (v2 surfaces match the frontend catalog)
  20261003120000_house_legacy_surface_preservation.sql (unchanged legacy surfaces stay valid)
Old migrations are preserved. Version 1 retains legacy compatibility.

Checks:
  npm run test:ci
  npm run build
  node tests/memory_house_cozy.test.mjs --sources
  tests/house_cozy_upgrade.test.sql against an isolated local Supabase schema
Private production backups, credentials and rollout evidence remain in ignored .local/.
