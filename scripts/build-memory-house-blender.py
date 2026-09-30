"""Blender --background --python scripts/build-memory-house-blender.py
Handcrafted reconstruction of public/memoryhouse references, not photogrammetry.
Blender Z-up / front -Y exports as glTF Y-up / front +Z. Units: metres.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/memoryhouse/models'
ART = ROOT / 'docs/memoryhouse'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, metal=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .52
    p.inputs['Metallic'].default_value = metal
    return m

ivory=mat('Ivory plaster',(.88,.79,.66)); white=mat('Porcelain',(.96,.89,.77))
rose=mat('Theme blush',(.69,.39,.34)); oak=mat('Pale oak',(.57,.37,.21))
gold=mat('Champagne gold',(.63,.43,.21),.55); sage=mat('Sage leaves',(.27,.40,.25))
paper=mat('Blank photo insert',(.98,.94,.85)); dark=mat('Espresso',(.18,.10,.07))
parent=None

def finish(o,name,m):
    o.name=name; o.parent=parent
    if m: o.data.materials.append(m)
    return o

def box(name,loc,size,m,bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=finish(bpy.context.object,name,m);o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft crafted edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def ellipsoid(name,loc,size,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc)
    o=finish(bpy.context.object,name,m);o.scale=size
    for p in o.data.polygons:p.use_smooth=True
    return o

def cyl(name,loc,radius,depth,m,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=radius,radius2=radius if r2 is None else r2,depth=depth,location=loc)
    o=finish(bpy.context.object,name,m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def torus(name,loc,major,minor,m,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=loc,major_radius=major,minor_radius=minor,rotation=rotation)
    return finish(bpy.context.object,name,m)

def empty(name,loc=(0,0,0),**extras):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc
    for k,v in extras.items():o[k]=v
    return o

def frame(name,x,y,z,w,h):
    for dx in [-w/2,w/2]:box(name+' side',(x+dx,y,z),(.055,.09,h+.08),gold,.012)
    for dz in [-h/2,h/2]:box(name+' edge',(x,y,z+dz),(w,.09,.055),gold,.012)
    # A true UV plane, distinct from frame, allows live user photos.
    bpy.ops.mesh.primitive_plane_add(size=2,location=(x,y-.051,z),rotation=(math.pi/2,0,0))
    o=finish(bpy.context.object,name,paper);o.scale=(w/2,h/2,1)
    o['photoAspect']=w/h
    return o

def merge_static(root):
    # Keep photo surfaces / anchors separate; combine static furniture by material.
    meshes=[o for o in root.children_recursive if o.type=='MESH' and not any(k in o for k in ['photoIndex','decorPhotoIndex','decorText'])]
    groups=[[o for o in meshes if o.data.materials and o.data.materials[0]==m] for m in list(bpy.data.materials)]
    for group in groups:
        if not group:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
        bpy.context.object.name=root.name+' / '+bpy.context.object.data.materials[0].name

house=empty('EMORIA Memory House',assetVersion=1);parent=house
box('Floating plinth',(0,0,-.12),(9.8,3.15,.26),white,.10)
rooms=[('beginning',-2.8,0,2.8),('first',0,0,2.8),('little-things',2.8,0,2.8),('memories',-1.8,2.25,3.6),('next-chapter',1.8,2.25,3.6)]
for rid,x,z,w in rooms:
    parent=house;room=empty('room_'+rid,roomId=rid);parent=room
    box('Floor',(x,0,z+.04),(w,2.6,.14),white)
    box('Back wall',(x,1.22,z+1.12),(w,.16,2.1),ivory)
    box('Wainscot',(x,1.10,z+.42),(w-.1,.07,.67),rose,.008)
    box('Chair rail',(x,1.035,z+.77),(w-.1,.10,.065),oak,.012)
    for j in range(int(w/.24)):
        box('Panel seam',(x-w/2+.13+j*.24,1.052,z+.42),(.018,.016,.62),oak,.002)
    for side in [-1,1]:box('Wall edge',(x+side*(w/2-.065),0,z+1.12),(.13,2.6,2.1),white)
    for j in range(int(w/.22)):
        box('Oak floorboard',(x-w/2+.13+j*.22,0,z+.125),(.21,2.44,.025),oak,.003)
    # Three frames per room, two upper rooms have wider spacing.
    for i,dx in enumerate([-.72,0,.72]):
        surface=frame('photo_'+rid+'_'+str(i),x+dx,1.00,z+1.43,.62,.465)
        surface['roomId']=rid;surface['photoIndex']=i
    # Stable attachment points are stored in GLB metadata; no arbitrary transforms from DB.
    empty('slot_'+rid+'_left',(x-w*.29,-.28,z+.16),roomId=rid,slot='left')
    empty('slot_'+rid+'_right',(x+w*.29,-.38,z+.16),roomId=rid,slot='right')
    table_y,table_z = (-.70,.51) if rid=='beginning' else ((.14,.77) if rid=='first' else (.57,.76))
    empty('slot_'+rid+'_table',(x,table_y,z+table_z),roomId=rid,slot='table')
    if rid=='beginning':
        box('Sofa base',(x,.37,z+.36),(1.65,.68,.37),rose,.13)
        box('Sofa back',(x,.68,z+.64),(1.65,.18,.65),white,.12)
        for dx in [-.44,.44]:box('Sofa cushion',(x+dx,.27,z+.58),(.77,.58,.16),white,.08)
        cyl('Coffee tabletop',(x,-.70,z+.47),.40,.08,oak)
        cyl('Coffee table foot',(x,-.70,z+.29),.13,.30,oak)
    elif rid=='first':
        cyl('Dining table',(x,.14,z+.72),.62,.08,oak)
        cyl('Table pedestal',(x,.14,z+.41),.15,.54,oak)
        for dx in [-.95,.95]:
            box('Chair seat',(x+dx,.25,z+.46),(.43,.44,.10),oak)
            box('Chair back',(x+dx,.49,z+.74),(.44,.08,.55),oak)
            for lx in [-.15,.15]:box('Chair legs',(x+dx+lx,.25,z+.28),(.055,.3,.32),oak,.01)
    else:
        box('Writing table' if rid=='next-chapter' else 'Low shelf',(x,.57,z+.70),(1.7,.60,.10),oak)
        for dx in [-.73,.73]:
            for dy in [-.22,.22]:
                box('Table leg',(x+dx,.57+dy,z+.395),(.12,.12,.51),oak,.015)
        if rid=='little-things':
            box('Shelf base',(x,.57,z+.25),(1.7,.60,.08),oak)
            for dx in [-.25,.25]:box('Shelf divider',(x+dx,.57,z+.47),(.06,.54,.4),oak)
    merge_static(room)

parent=house
# Gable backing and two separate roof slopes, open front preserves all rooms.
mesh=bpy.data.meshes.new('Gable');mesh.from_pydata([(-3.7,1.22,4.43),(3.7,1.22,4.43),(0,1.22,5.52)],[],[(0,1,2)]);mesh.update()
o=bpy.data.objects.new('Gable',mesh);bpy.context.collection.objects.link(o);finish(o,'Gable',ivory)
for side in [-1,1]:
    roof=box('Pitched roof',(side*1.93,0,4.99),(4.05,2.94,.14),white)
    roof.rotation_euler.y=side*math.atan(1.15/3.86)
    trim=box('Roof blush fascia',(side*1.93,-1.48,4.99),(4.08,.07,.17),rose,.018);trim.rotation_euler.y=roof.rotation_euler.y
for i in range(12):box('Stair step',(4.55,1.1-i*.21,.10+(11-i)*.18),(.67,.25,.16),oak,.015)
box('Stair outer rail',(4.94,-.08,1.23),(.1,2.75,.1),white).rotation_euler.x=.70
box('Entrance plaque',(0,-1.45,4.54),(1.85,.12,.32),oak,.05)
empty('title_anchor',(0,-1.525,4.54),titleAnchor=True)
# Asset library: individual roots at origin. Viewer instantiates only selected items.
parent=None;library=empty('Decoration library');assets=[]
for asset in ['calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles']:
    parent=library;root=empty('decor_'+asset,assetId=asset);parent=root;assets.append(root)
    if asset=='calendar':
        box('Calendar stand',(0,.02,.24),(.48,.26,.46),oak)
        frame('Blank calendar',0,-.13,.30,.43,.35)['decorText']=True
        for x in [-.14,.14]:torus('Calendar binding',(x,0,.49),.055,.012,gold,(math.pi/2,0,0))
    elif asset=='cat':
        cyl('Cat cushion',(0,0,.055),.40,.11,oak)
        ellipsoid('Curled cat',(.06,0,.20),(.30,.25,.16),white)
        ellipsoid('Cat head',(-.23,-.10,.23),(.16,.14,.14),white)
        for x in [-.32,-.15]:cyl('Cat ear',(x,-.08,.36),.075,.13,white,0)
        for x in [-.29,-.19]:box('Sleepy eyelid',(x,-.237,.25),(.045,.013,.013),dark,.005)
        torus('Curled tail',(.07,0,.16),.24,.055,white)
    elif asset=='nameplate':
        box('Plaque foot',(0,0,.045),(.76,.26,.09),oak)
        frame('Blank plaque',0,0,.28,.72,.35)['decorText']=True
    elif asset in ['plant','vase']:
        ellipsoid('Ceramic pot',(0,0,.17),(.20,.20,.19),white)
        cyl('Gold pot foot',(0,0,.035),.14,.06,gold)
        for i in range(5):
            a=i*2.4; x=.16*math.cos(a);y=.16*math.sin(a);h=.38+i*.055
            stem=cyl('Stem',(x/2,y/2,h/2+.14),.012,h,sage);stem.rotation_euler.y=x*.7
            leaf=ellipsoid('Leaf',(x,y,h),(.14,.06,.04),sage);leaf.rotation_euler.y=-.5
            if asset=='vase':ellipsoid('Tulip',(x,y,h+.16),(.07,.075,.12),rose)
    elif asset=='mugs':
        cyl('Cup tray',(0,0,.025),.42,.05,oak)
        for x,m in [(-.2,white),(.2,rose)]:
            cyl('Cup body',(x,0,.17),.13,.25,m)
            cyl('Coffee',(x,0,.299),.105,.003,dark)
            torus('Handle',(x+(-.16 if x<0 else .16),0,.18),.085,.025,m,(math.pi/2,0,0))
    elif asset=='lamp':
        ellipsoid('Lamp base',(0,0,.13),(.18,.18,.13),oak)
        cyl('Lamp stem',(0,0,.34),.035,.30,gold)
        cyl('Fabric shade',(0,0,.58),.26,.35,white,.21)
        torus('Shade trim',(0,0,.41),.26,.014,gold)
    elif asset=='album':
        for side in [-1,1]:
            o=box('Album cover',(side*.22,0,.045),(.44,.55,.06),rose);o.rotation_euler.y=side*-.13
            box('Cream page',(side*.22,0,.08),(.40,.51,.025),paper,.012)
            bpy.ops.mesh.primitive_plane_add(size=2,location=(side*.22,0,.101))
            o=finish(bpy.context.object,'Album photo',paper);o.scale=(.15,.18,1);o['decorPhotoIndex']=0 if side==-1 else 1;o['photoAspect']=.30/.36
    elif asset=='bunting':
        box('Photo stand base',(0,0,.025),(.95,.24,.05),oak)
        for x in [-.44,.44]:cyl('Photo stand pole',(x,0,.35),.022,.65,oak)
        box('Cord',(0,0,.62),(.91,.012,.015),rose,.003)
        for index,x in enumerate([-.28,0,.28]):
            box('Polaroid',(x,-.02,.43),(.23,.022,.28),paper,.008)
            bpy.ops.mesh.primitive_plane_add(size=2,location=(x,-.037,.46),rotation=(math.pi/2,0,0))
            o=finish(bpy.context.object,'Hanging photo',paper);o.scale=(.0925,.09,1);o['decorPhotoIndex']=index;o['photoAspect']=.185/.18
            box('Wooden clip',(x,-.015,.59),(.033,.044,.09),oak,.005)
    elif asset=='frame':
        frame('Table picture',0,0,.28,.52,.39)['decorPhotoIndex']=0
        box('Frame support',(0,.12,.12),(.08,.24,.24),oak)
    elif asset=='birdcage':
        cyl('Birdcage base',(0,0,.13),.25,.07,oak)
        cyl('Birdcage pedestal',(0,0,.06),.07,.12,gold)
        for i in range(10):
            a=i*math.tau/10;cyl('Cage bar',(.23*math.cos(a),.23*math.sin(a),.40),.01,.48,gold)
        for z,r in [(.2,.23),(.60,.23),(.69,.17)]:torus('Cage hoop',(0,0,z),r,.012,gold)
        ellipsoid('Tiny bird',(0,0,.31),(.1,.07,.08),white)
        torus('Cage handle',(0,0,.79),.06,.015,gold,(math.pi/2,0,0))
    elif asset=='candles':
        cyl('Candelabra base',(0,0,.035),.22,.07,white);cyl('Central stem',(0,0,.3),.035,.53,gold)
        box('Arms',(0,0,.40),(.60,.045,.035),gold,.016)
        for x,h in [(-.28,.6),(0,.8),(.28,.6)]:
            cyl('Candle stem',(x,0,.45),.025,.18,gold);cyl('Rose candle',(x,0,h),.055,.23,rose)
            ellipsoid('Flame',(x,0,h+.16),(.024,.024,.052),gold)
    merge_static(root)

def export(root,name):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
    triangles=0
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    return {'file':name,'bytes':(OUT/name).stat().st_size,'triangles':triangles}

reports=[export(house,'memory-house.glb'),export(library,'decorations.glb')]
assert all(r['triangles']<100000 and r['bytes']<5_000_000 for r in reports),reports
parent=None
for o in library.children_recursive:o.hide_render=True;o.hide_set(True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1300;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power,size in [((-5,-7,10),1500,7),((6,-3,6),900,6),((0,5,9),1300,5)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;aim(o,(0,0,2))
bpy.ops.object.camera_add(location=(7,-19,8));cam=bpy.context.object;aim(cam,(0,0,2.3));cam.data.type='ORTHO';cam.data.ortho_scale=12.4;scene.camera=cam
box('Studio ground',(0,0,-.37),(200,200,.2),mat('Backdrop',(.71,.66,.58)),0)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'memory-house.blend'))
scene.render.filepath=str(OUT/'house-preview.png');bpy.ops.render.render(write_still=True)
# Catalog thumbnails show the actual exported objects rather than promising reference-image detail.
thumbs=OUT/'thumbnails';thumbs.mkdir(exist_ok=True)
for o in house.children_recursive:o.hide_render=True
scene.render.resolution_x=320;scene.render.resolution_y=240;scene.cycles.samples=12
cam.location=(1.5,-3,1.8);aim(cam,(0,0,.33));cam.data.ortho_scale=1.6
for root in assets:
    for o in root.children_recursive:o.hide_render=False
    scene.render.filepath=str(thumbs/(root['assetId']+'.png'));bpy.ops.render.render(write_still=True)
    for o in root.children_recursive:o.hide_render=True
(ART/'asset-info.json').write_text(json.dumps({'assets':reports,'reference':'public/memoryhouse','method':'Procedural Blender reconstruction based on supplied images; hidden surfaces inferred','rooms':[r[0] for r in rooms],'decorations':[r['assetId'] for r in assets],'up':'+Y','front':'+Z'},indent=2))
print('MEMORY_HOUSE_RESULT '+json.dumps(reports))
