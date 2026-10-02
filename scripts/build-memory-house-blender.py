"""Blender --background --python scripts/build-memory-house-blender.py
Editable low-poly reconstruction of emoria-cozy-reference and retained original assets.
Reference photos guide silhouettes; unseen surfaces are inferred, not photogrammetry.
Blender Z-up / front -Y exports as glTF Y-up / front +Z. Units: metres.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/memoryhouse/models'
ART = ROOT / 'docs/memoryhouse'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
CATALOG = json.loads((ART / 'cozy-catalog.json').read_text(encoding='utf-8'))
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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=loc)
    o=finish(bpy.context.object,name,m);o.scale=size
    for p in o.data.polygons:p.use_smooth=True
    return o

def cyl(name,loc,radius,depth,m,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=radius,radius2=radius if r2 is None else r2,depth=depth,location=loc)
    o=finish(bpy.context.object,name,m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def torus(name,loc,major,minor,m,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,location=loc,major_radius=major,minor_radius=minor,rotation=rotation)
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

def normalize_asset(root, dimensions):
    # Bake a centred floor pivot into vertices so editor transforms stay identity.
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    points=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    size=Vector((dimensions['width'],dimensions['depth'],dimensions['height']))
    factor=Vector(tuple(size[i]/(hi[i]-lo[i]) for i in range(3)))
    for o in meshes:
        world=o.matrix_world.copy()
        for v in o.data.vertices:
            p=world @ v.co-centre
            v.co=Vector(tuple(p[i]*factor[i] for i in range(3)))
        o.matrix_basis=Matrix.Identity(4);o.data.update()
    root['dimensions']=[size.x,size.z,size.y]

house=empty('EMORIA Cozy Memory House',assetVersion=2,architectureOnly=True);parent=house
box('Floating plinth',(0,0,-.12),(9.8,3.15,.26),white,.10)
rooms=[('beginning',-2.8,0,2.8),('first',0,0,2.8),('little-things',2.8,0,2.8),('memories',-1.8,2.25,3.6),('next-chapter',1.8,2.25,3.6)]
for rid,x,z,w in rooms:
    parent=house;room=empty('room_'+rid,roomId=rid);parent=room
    box('Floor',(x,0,z+.04),(w,2.6,.14),white)
    box('Back wall',(x,1.22,z+1.12),(w,.16,2.1),ivory)
    for side in [-1,1]:box('Wall edge',(x+side*(w/2-.065),0,z+1.12),(.13,2.6,2.1),white)
    for j in range(int(w/.22)):
        box('Oak floorboard',(x-w/2+.13+j*.22,0,z+.125),(.21,2.44,.025),oak,.003)
    # Three frames per room, two upper rooms have wider spacing.
    for i,dx in enumerate([-.72,0,.72]):
        bpy.ops.mesh.primitive_plane_add(size=2,location=(x+dx,1.00,z+1.43),rotation=(math.pi/2,0,0))
        surface=finish(bpy.context.object,'photo_'+rid+'_'+str(i),paper);surface.scale=(.31,.2325,1);surface['photoAspect']=4/3
        surface['roomId']=rid;surface['photoIndex']=i
    # Stable attachment points are stored in GLB metadata; no arbitrary transforms from DB.
    empty('slot_'+rid+'_left',(x-w*.29,-.28,z+.16),roomId=rid,slot='left')
    empty('slot_'+rid+'_right',(x+w*.29,-.38,z+.16),roomId=rid,slot='right')
    table_y,table_z = (-.70,.51) if rid=='beginning' else ((.14,.77) if rid=='first' else (.57,.76))
    empty('slot_'+rid+'_table',(x,table_y,z+table_z),roomId=rid,slot='table')
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
for asset in ['calendar','cat','nameplate','plant','mugs','lamp','vase','album','bunting','frame','birdcage','candles','rabbit','teddy','cloud-lamp','honey-candle','turntable','camera','daisy-rug','fern','vine','cushion','shelf','sofa','coffee-table','bistro-table','chair','cubby','desk']:
    parent=library;root=empty('decor_'+asset,assetId=asset);parent=root;assets.append(root)
    if asset=='calendar':
        # Four round lobes reproduce the clover silhouette, with a real text panel.
        box('Calendar easel',(0,.04,.04),(.30,.22,.07),oak)
        for x,z in [(-.13,.38),(.13,.38),(-.13,.19),(.13,.19)]:ellipsoid('Clover rim',(x,0,z),(.14,.045,.14),sage)
        box('Calendar page',(0,-.03,.28),(.32,.025,.32),white,.04)
        frame('Calendar insert',0,-.065,.28,.28,.29)['decorText']=True
        for x in [-.10,0,.10]:torus('Binding ring',(x,-.04,.45),.028,.009,gold,(math.pi/2,0,0))
    elif asset=='cat':
        ellipsoid('Sleeping cat body',(.05,.03,.14),(.22,.17,.14),white)
        ellipsoid('Cat head',(-.18,-.07,.12),(.115,.10,.10),white)
        for x in [-.245,-.12]:cyl('Ear',(x,-.06,.23),.04,.10,white,0)
        for x in [-.225,-.15]:box('Closed eyelid',(x,-.165,.125),(.032,.01,.008),dark,.002)
        torus('Curled tail',(.08,.03,.12),.16,.033,white)
    elif asset=='nameplate':
        box('Nameplate foot',(0,0,.035),(.38,.20,.07),oak)
        for x,z,r in [(-.22,.19,.13),(-.13,.29,.15),(0,.29,.18),(.16,.24,.15),(.25,.17,.12)]:ellipsoid('Cloud silhouette',(x,.015,z),(r,.045,r),white)
        frame('Cloud message',0,-.025,.21,.40,.22)['decorText']=True
    elif asset in ['plant','fern','vine','vase']:
        if asset=='vase':
            box('Paper bag vase',(0,0,.14),(.23,.20,.28),oak,.045)
            torus('Folded bag rim',(0,0,.29),.11,.025,oak)
        else:
            cyl('Ceramic pot',(0,0,.11),.14,.20,rose if asset=='plant' else white,.17)
            cyl('Soil',(0,0,.214),.145,.008,dark)
        if asset=='vine':
            for k in range(3):
                for j in range(6):
                    z=.34-j*.045;x=.09+k*.015;y=-.06-j*.015
                    ellipsoid('Trailing leaf',(x+(-1 if j%2 else 1)*.045,y,z),(.065,.026,.038),sage)
                    cyl('Vine stem',(x,y,z),.008,.07,sage)
        elif asset=='fern':
            for k in range(5):
                a=k*math.tau/5
                for j in range(4):
                    dist=.035+j*.05;z=.30+j*.062
                    for side in [-1,1]:
                        leaf=ellipsoid('Fern leaflet',(math.cos(a)*dist+side*.035,math.sin(a)*dist,z),(.06,.025,.018),sage);leaf.rotation_euler.z=a
        else:
            for i in range(5):
                a=i*2.4;x=.10*math.cos(a);y=.10*math.sin(a);z=.34+i*.032
                cyl('Stem',(x*.5,y*.5,(z+.22)/2),.008,z-.20,sage)
                if asset=='plant':
                    for side in [-1,1]:ellipsoid('Heart leaf',(x+side*.025,y,z),(.045,.018,.052),sage)
                    cyl('Heart point',(x,y,z-.04),.036,.075,sage,0)
                else:
                    for petal in range(6):
                        pa=petal*math.tau/6;ellipsoid('Daisy petal',(x+.035*math.cos(pa),y+.035*math.sin(pa),z),(.025,.025,.011),white)
                    ellipsoid('Flower centre',(x,y,z+.006),(.021,.021,.018),gold)
    elif asset=='mugs':
        box('Toast mug body',(0,0,.17),(.27,.21,.30),oak,.07)
        box('Cream toast face',(0,-.113,.17),(.22,.025,.24),white,.055)
        cyl('Tea',(0,0,.32),.087,.004,dark)
        torus('Mug opening',(0,0,.324),.094,.013,white)
        torus('Handle',(.19,0,.18),.09,.028,oak,(math.pi/2,0,0))
        box('Butter pat',(0,-.138,.17),(.07,.018,.07),gold,.015)
    elif asset=='lamp':
        cyl('Mushroom foot',(0,0,.025),.12,.05,white)
        cyl('Mushroom stalk',(0,0,.19),.075,.31,white,.10)
        ellipsoid('Mushroom cap',(0,0,.36),(.26,.26,.12),rose)
        for x,y in [(-.13,-.10),(.10,-.14),(.12,.10),(-.12,.10)]:ellipsoid('Cap spot',(x,y,.435),(.04,.04,.012),white)
    elif asset=='album':
        for side in [-1,1]:
            box('Album cover',(side*.14,0,.035),(.28,.42,.035),rose,.012)
            page=box('Album pages',(side*.14,0,.061),(.26,.39,.018),paper,.006);page.rotation_euler.y=side*-.08
            bpy.ops.mesh.primitive_plane_add(size=2,location=(side*.14,0,.088))
            o=finish(bpy.context.object,'Album photo',paper);o.scale=(.103,.15,1);o['decorPhotoIndex']=0 if side==-1 else 1;o['photoAspect']=.206/.30
    elif asset=='bunting':
        box('Photo stand base',(0,0,.025),(.95,.24,.05),oak)
        for x in [-.44,.44]:cyl('Stand pole',(x,0,.35),.022,.65,oak)
        box('Cord',(0,0,.62),(.91,.012,.015),oak,.003)
        for index,x in enumerate([-.28,0,.28]):
            box('Polaroid',(x,-.02,.43),(.23,.022,.28),paper,.008)
            bpy.ops.mesh.primitive_plane_add(size=2,location=(x,-.037,.46),rotation=(math.pi/2,0,0))
            o=finish(bpy.context.object,'Hanging photo',paper);o.scale=(.0925,.09,1);o['decorPhotoIndex']=index;o['photoAspect']=.185/.18
            ellipsoid('Star clip centre',(x,-.025,.60),(.035,.025,.035),gold)
            for j in range(5):
                a=j*math.tau/5;cyl('Star point',(x+.034*math.cos(a),-.025,.60+.034*math.sin(a)),.025,.04,gold,0)
    elif asset=='frame':
        frame('Biscuit picture',0,0,.22,.42,.32)['decorPhotoIndex']=0
        box('Frame support',(0,.08,.10),(.05,.16,.19),oak)
        for x in [-.21,.21]:
            for z in [.08,.17,.26,.35]:ellipsoid('Biscuit scallop',(x,0,z),(.04,.04,.04),oak)
        for x in [-.13,-.04,.05,.14]:
            for z in [.06,.38]:ellipsoid('Biscuit scallop',(x,0,z),(.04,.04,.04),oak)
    elif asset=='birdcage':
        cyl('Open perch base',(0,0,.035),.14,.07,white)
        cyl('Perch stem',(0,0,.15),.025,.20,oak)
        perch=cyl('Open wooden perch',(0,0,.25),.035,.28,oak);perch.rotation_euler.y=math.pi/2
        ellipsoid('Songbird body',(0,0,.36),(.10,.075,.12),white)
        ellipsoid('Songbird head',(.03,-.02,.46),(.07,.065,.07),white)
        ellipsoid('Sage wing',(-.055,-.045,.36),(.07,.03,.07),sage)
        ellipsoid('Beak',(.075,-.075,.46),(.032,.033,.025),gold)
        ellipsoid('Eye',(.052,-.078,.482),(.009,.008,.009),dark)
    elif asset in ['rabbit','teddy']:
        m=white if asset=='rabbit' else oak
        ellipsoid('Body',(0,.01,.21),(.12,.10,.17),m)
        ellipsoid('Head',(0,-.02,.39),(.14,.115,.13),m)
        for x in [-.09,.09]:
            ellipsoid('Paw',(x,-.055,.06),(.07,.08,.06),m)
            ellipsoid('Arm',(x*1.5,-.005,.24),(.05,.065,.10),m)
            ear=ellipsoid('Ear',(x,-.005,.48 if asset=='teddy' else .39),(.055,.048,.055 if asset=='teddy' else .16),m)
            if asset=='rabbit':ear.rotation_euler.y=x*4
        for x in [-.045,.045]:ellipsoid('Eye',(x,-.13,.41),(.009,.008,.009),dark)
        ellipsoid('Muzzle',(0,-.127,.355),(.06,.025,.04),white)
        ellipsoid('Nose',(0,-.155,.375),(.015,.012,.012),rose)
        if asset=='teddy':
            ellipsoid('Sage sweater',(0,0,.225),(.135,.105,.13),sage)
            torus('Sweater collar',(0,0,.34),.085,.014,sage)
        else:
            carrot=cyl('Carrot',(0,-.14,.25),.05,.17,gold,0);carrot.rotation_euler.x=.4
            ellipsoid('Carrot leaf',(0,-.13,.35),(.04,.018,.07),sage)
    elif asset=='cloud-lamp':
        box('Cloud base',(0,0,.04),(.42,.19,.08),white,.04)
        for x,z,r in [(-.17,.13,.11),(-.10,.22,.14),(.04,.26,.15),(.17,.14,.12)]:ellipsoid('Cloud lobe',(x,0,z),(r,.09,r),white)
        for x in [-.055,.055]:box('Sleepy eyelid',(x,-.101,.17),(.035,.01,.007),oak,.002)
    elif asset in ['candles','honey-candle']:
        if asset=='honey-candle':
            cyl('Honey jar',(0,0,.11),.13,.21,gold,.145)
            cyl('Wax',(0,0,.222),.12,.012,white)
            torus('Jar rim',(0,0,.23),.134,.009,oak)
            torus('Twine',(0,0,.19),.144,.008,sage)
            box('Wick',(0,0,.235),(.012,.012,.028),dark,.002)
        else:
            cyl('Candle tray',(0,0,.025),.17,.05,oak)
            for x,h in [(-.075,.16),(.065,.24)]:
                cyl('Wax candle',(x,0,h/2+.05),.055,h,white)
                ellipsoid('Flame',(x,0,h+.065),(.012,.012,.032),gold)
    elif asset=='turntable':
        box('Record player',(0,0,.07),(.55,.42,.14),sage,.04)
        cyl('Vinyl',(0,0,.144),.17,.008,dark)
        cyl('Record label',(0,0,.153),.047,.005,gold)
        box('Tonearm',(.13,.03,.17),(.018,.22,.02),gold,.005)
        for x in [.12,.20]:
            knob=cyl('Control knob',(x,-.221,.085),.024,.025,white);knob.rotation_euler.x=math.pi/2
    elif asset=='camera':
        box('Camera body',(0,0,.17),(.34,.18,.28),rose,.04)
        box('Sage grip',(-.12,-.095,.18),(.10,.025,.24),sage,.015)
        for r,y,m in [(.105,-.107,white),(.074,-.137,oak),(.052,-.155,dark)]:
            lens=cyl('Lens',(0,y,.18),r,.026,m);lens.rotation_euler.x=math.pi/2
        box('Viewfinder',(.10,-.098,.28),(.06,.022,.035),white,.008)
        box('Instant photo tray',(0,-.10,.025),(.21,.23,.025),paper,.008)
    elif asset=='daisy-rug':
        for i in range(10):
            a=i*math.tau/10
            o=ellipsoid('Rug petal',(.39*math.cos(a),.39*math.sin(a),.018),(.27,.14,.018),white);o.rotation_euler.z=a
        cyl('Daisy centre',(0,0,.02),.23,.035,gold)
    elif asset=='cushion':
        ellipsoid('Round floor cushion',(0,0,.11),(.325,.325,.11),sage)
        torus('Cushion seam',(0,0,.105),.32,.008,white)
        ellipsoid('Centre tuft',(0,0,.211),(.025,.025,.005),oak)
    elif asset=='shelf':
        box('Shelf top',(0,0,.17),(1,.35,.06),oak,.025)
        for x in [-.42,-.25,-.08,.09,.26,.43]:ellipsoid('Scalloped apron',(x,-.14,.12),(.085,.045,.07),oak)
        for x in [-.38,.38]:box('Shelf bracket',(x,.115,.075),(.06,.09,.15),oak,.012)
    elif asset=='sofa':
        for x in [-.65,.65]:
            for y in [-.23,.23]:box('Sofa foot',(x,y,.065),(.10,.10,.13),oak,.015)
        box('Sofa base',(0,0,.22),(1.65,.72,.20),rose,.09)
        box('Sofa back',(0,.24,.55),(1.48,.20,.50),white,.09)
        for x in [-.73,.73]:box('Rounded sofa arm',(x,0,.43),(.19,.65,.43),rose,.08)
        for x in [-.32,.32]:box('Seat cushion',(x,-.07,.36),(.63,.52,.16),white,.07)
    elif asset in ['coffee-table','bistro-table','desk']:
        h=.37 if asset=='coffee-table' else .63
        if asset=='coffee-table':
            ellipsoid('Bean tabletop',(0,0,h-.025),(.575,.325,.035),oak)
            # A flat inset supports placed objects despite the rounded outline.
            box('Flat tabletop',(0,0,h-.005),(.78,.42,.05),oak,.015)
            for x,y in [(-.36,-.16),(.36,-.16),(0,.19)]:cyl('Table leg',(x,y,(h-.06)/2),.045,h-.06,oak,.035)
        elif asset=='bistro-table':
            cyl('Round tabletop',(0,0,h-.03),.55,.06,oak)
            cyl('Pedestal',(0,0,(h-.06)/2),.085,h-.06,white)
            for i in range(4):
                a=i*math.pi/2;box('Cross foot',(.14*math.cos(a),.14*math.sin(a),.035),(.30 if i%2==0 else .11,.11 if i%2==0 else .30,.07),white,.035)
        else:
            box('Desk top',(0,0,h-.035),(1.6,.60,.07),oak,.035)
            for x in [-.70,.70]:
                for y in [-.23,.23]:box('Desk leg',(x,y,(h-.07)/2),(.07,.07,h-.07),oak,.012)
            box('Drawer casing',(.46,0,h-.15),(.48,.51,.23),oak,.025)
            box('Sage drawer front',(.46,-.27,h-.15),(.40,.025,.16),sage,.018)
            ellipsoid('Drawer knob',(.46,-.299,h-.15),(.024,.018,.024),gold)
    elif asset=='chair':
        for x in [-.17,.17]:
            for y in [-.17,.17]:box('Chair leg',(x,y,.18),(.055,.055,.36),oak,.012)
        cyl('Sage seat cushion',(0,0,.405),.23,.09,sage)
        for x in [-.20,.20]:box('Backrest support',(x,.18,.53),(.045,.045,.40),oak,.012)
        back=box('Curved backrest',(0,.21,.66),(.46,.08,.15),oak,.06)
    elif asset=='cubby':
        for z in [.035,.375,.715]:box('Cubby shelf',(0,0,z),(1.2,.45,.07),oak,.025)
        for x in [-.565,0,.565]:box('Cubby divider',(x,0,.375),(.07,.43,.75),oak,.025)
        box('Cubby backing',(0,.205,.375),(1.15,.035,.68),ivory,.015)
    meta=next(a for a in CATALOG['assets'] if a['id']==asset)
    root['referenceId']=meta['referenceId'] or 'legacy'
    root['category']=meta['category'];root['editable']=True
    bpy.context.view_layer.update();normalize_asset(root,meta['dimensions'])
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
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1300;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for loc,power,size in [((-5,-7,10),1500,7),((6,-3,6),900,6),((0,5,9),1300,5)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;aim(o,(0,0,2))
bpy.ops.object.camera_add(location=(7,-19,8));cam=bpy.context.object;aim(cam,(0,0,2.3));cam.data.type='ORTHO';cam.data.ortho_scale=12.4;scene.camera=cam
box('Studio ground',(0,0,-.37),(200,200,.2),mat('Backdrop',(.71,.66,.58)),0)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'memory-house-cozy.blend'),compress=False)
# Render a furnished preview from separate model instances, never baked in shell.
preview=[]
for asset,x,y,z in [('sofa',-2.8,.38,.14),('coffee-table',-2.8,-.70,.14),('bistro-table',0,.14,.14),('chair',-.95,.25,.14),('chair',.95,.25,.14),('cubby',2.8,.57,.14),('desk',-1.8,.57,2.25),('desk',1.8,.57,2.25),('lamp',-2.8,-.7,.51),('plant',2.8,.57,.89),('teddy',-2.9,-.5,2.25),('bunting',1.8,.57,2.88)]:
    original=next(a for a in assets if a['assetId']==asset)
    for source in original.children_recursive:
        if source.type!='MESH':continue
        copy=source.copy();copy.data=source.data;copy.parent=None;copy.location+=Vector((x,y,z));copy.hide_render=False;copy.hide_set(False);bpy.context.collection.objects.link(copy);preview.append(copy)
for o in house.children_recursive:
    if 'photoIndex' in o:o.hide_render=True
scene.render.filepath=str(OUT/'house-preview.png');bpy.ops.render.render(write_still=True)
# Catalog thumbnails show the actual exported objects rather than promising reference-image detail.
thumbs=OUT/'thumbnails';thumbs.mkdir(exist_ok=True)
for o in house.children_recursive:o.hide_render=True
for o in preview:o.hide_render=True
scene.render.resolution_x=240;scene.render.resolution_y=180;scene.cycles.samples=8
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=85
cam.location=(1.5,-3,1.8);aim(cam,(0,0,.33));cam.data.ortho_scale=1.9
for root in assets:
    dim=next(a['dimensions'] for a in CATALOG['assets'] if a['id']==root['assetId'])
    centre=Vector((0,0,dim['height']/2))
    cam.location=centre+Vector((.65,-2.4,1.0));aim(cam,centre)
    cam.data.ortho_scale=max(dim['width']*.78+dim['depth']*.25,dim['height']+dim['depth']*.25)*1.42
    for o in root.children_recursive:o.hide_render=False
    scene.render.filepath=str(thumbs/(root['assetId']+'.jpg'));bpy.ops.render.render(write_still=True)
    for o in root.children_recursive:o.hide_render=True
(ART/'asset-info.json').write_text(json.dumps({'assets':reports,'reference':'emoria-cozy-reference','method':'Procedural Blender reconstruction based on supplied images; hidden surfaces inferred','rooms':[r[0] for r in rooms],'decorations':[r['assetId'] for r in assets],'up':'+Y','front':'+Z'},indent=2))
print('MEMORY_HOUSE_RESULT '+json.dumps(reports))
