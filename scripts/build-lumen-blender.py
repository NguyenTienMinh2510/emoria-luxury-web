"""Run with Blender --background --python scripts/build-lumen-blender.py.
Reference-based visual reconstruction; dimensions/rear are provisional, not CAD.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/jewelry'
ART = ROOT / 'docs/lumen-blender'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.25, transmission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Transmission Weight'].default_value = transmission
    p.inputs['IOR'].default_value = 2.1 if transmission else 1.5
    return m

silver = material('Polished silver', (.76,.80,.85), 1, .20)
gold = material('Warm gold bezel', (.72,.43,.17), 1, .23)
black = material('Black enamel', (.007,.009,.014), 0, .17)
gem = material('Faceted crystal', (.94,.97,1), 0, .075, .65)
gem.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .4
parts = []
chain_parts = []

def finish(obj, name, mat, smooth=True, chain=False):
    obj.name = name
    obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for f in obj.data.polygons: f.use_smooth = smooth
    (chain_parts if chain else parts).append(obj)
    return obj

def cylinder(name, radius, depth, z, mat, bevel=.12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=radius, depth=depth, location=(0,0,z))
    obj = finish(bpy.context.object, name, mat)
    mod = obj.modifiers.new('Rounded manufactured edge','BEVEL')
    mod.width=bevel; mod.segments=3
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def tube(name, points, radius, mat, closed=False, sides=8, chain=False):
    # Explicit tube mesh keeps export topology predictable and needs no add-ons.
    pts=[Vector(p) for p in points]; verts=[]; faces=[]
    for i,p in enumerate(pts):
        a=pts[(i-1)%len(pts)] if closed or i>0 else pts[0]
        b=pts[(i+1)%len(pts)] if closed or i<len(pts)-1 else pts[-1]
        t=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0))
        u=t.cross(ref).normalized(); v=t.cross(u).normalized()
        for j in range(sides):
            q=p+radius*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides))
            verts.append(q)
    for i in range(len(pts) if closed else len(pts)-1):
        k=(i+1)%len(pts)
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,k*sides+(j+1)%sides,k*sides+j))
    if not closed:
        faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    return finish(obj,name,mat,chain=chain)

def circle(name, r, z, width, mat, n=128):
    return tube(name,[(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),z) for i in range(n)],width,mat,True)

def crystal(name, center, radius, height, segments=12):
    verts=[]
    # Pavilion, girdle, crown and table: genuine facets, not a smooth sphere.
    for rad,z,phase in [(radius*.05,-height*.50,0),(radius,0,0),(radius*.98,height*.12,0),(radius*.53,height*.56,math.pi/segments)]:
        for i in range(segments):
            a=2*math.pi*i/segments+phase
            verts.append((center[0]+rad*math.cos(a),center[1]+rad*math.sin(a),center[2]+z))
    faces=[]
    for k in range(3):
        for j in range(segments):
            a=k*segments+j; b=k*segments+(j+1)%segments; c=(k+1)*segments+(j+1)%segments; d=(k+1)*segments+j
            faces.extend([(a,b,c),(a,c,d)])
    faces.extend([tuple(reversed(range(segments))),tuple(3*segments+j for j in range(segments))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return finish(obj,name,gem,False)

cylinder('Silver body - assumed 28mm diameter',14,1.7,0,silver,.22)
cylinder('Solid black face',12.0,.50,1.0,black,.12)
circle('Outer rounded rim',13.72,1.02,.27,silver)
circle('Inner bright border',12.18,1.20,.17,silver)
circle('Rear seam',13.58,-.73,.13,silver)
for i in range(72):
    a=i*2*math.pi/72; x=12.96*math.cos(a);y=12.96*math.sin(a)
    crystal('Rim crystal', (x,y,1.08), .43,.46,8)
    # Two shared-looking micro beads at each setting, built as low-poly spheres.
    for off in [-.47,.47]:
        b=a+off/12.96
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.12,location=(12.96*math.cos(b),12.96*math.sin(b),1.3))
        finish(bpy.context.object,'Pave silver bead',silver)

# Twelve sculpted rays. Alternating long/short points approximate the catalog.
for i in range(12):
    a=math.pi/2+i*2*math.pi/12
    length=8.0 if i%3==0 else (6.8 if i%2==0 else 5.9)
    w=.72 if i%2==0 else .52
    local=[(2.45,-w,1.38),(length*.67,-w*.42,1.4),(length,0,1.36),(length*.67,w*.42,1.4),(2.45,w,1.38),(length*.53,0,2.10)]
    verts=[(r*math.cos(a)-s*math.sin(a),r*math.sin(a)+s*math.cos(a)+.9,z) for r,s,z in local]
    faces=[(j,(j+1)%5,5) for j in range(5)]+[(4,3,2,1,0)]
    mesh=bpy.data.meshes.new('Ray');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Sculpted sun ray',mesh);bpy.context.collection.objects.link(obj)
    finish(obj,obj.name,silver,False)

bezel=circle('Gold center setting',3.03,1.92,.26,gold);bezel.location.y=.9
crystal('Center brilliant', (0,.9,1.88),2.69,1.75,16)
inner=circle('Stone seat silver',2.72,1.79,.12,silver);inner.location.y=.9

# Nested arches clipped against the circular inset, never protruding past rim.
for cx,cy,r in [(0,-13.5,5.6),(0,-13.5,4.2),(0,-13.5,2.8),(-8.1,-11.7,3.9),(8.1,-11.7,3.9)]:
    runs=[];run=[]
    for i in range(161):
        a=i*math.pi/160;x=cx+r*math.cos(a);y=cy+r*math.sin(a)
        if x*x+y*y<11.93**2:run.append((x,y,1.49))
        elif run:runs.append(run);run=[]
    if run:runs.append(run)
    for run in runs:
        if len(run)>2:tube('Nested silver arch',run,.23,silver)

# Two sculptural oval bails and a real connector hole.
for side in [-1,1]:
    tube('Double-loop bail',[(side*.95+1.0*math.cos(t),16.9+2.9*math.sin(t),.05+side*.60*math.sin(t)) for t in [i*2*math.pi/64 for i in range(64)]],.36,silver,True,10)
tube('Pendant connector',[(.80*math.cos(i*2*math.pi/48),14.0+1.2*math.sin(i*2*math.pi/48),.15) for i in range(48)],.28,silver,True)

# Separate static display chain: linked ovals along a V-shaped hanging path.
# AR must deform/replace this chain; it is not a calibrated neck simulation.
for side in [-1,1]:
    for i in range(102):
        t=i/101; center=Vector((side*(.4+58*t),18.7+133*t,-.25-12*t*t))
        tangent=Vector((side*58,133,-24*t)).normalized()
        u=Vector((tangent.y,-tangent.x,0)).normalized()
        v=tangent.cross(u).normalized()
        across=u if i%2==0 else (u*.42+v*.907)
        pts=[center+tangent*(1.08*math.cos(j*2*math.pi/16))+across*(.60*math.sin(j*2*math.pi/16)) for j in range(16)]
        tube('Cable link',pts,.16,silver,True,6,True)

# Join by material per asset, reducing draw calls without losing surface groups.
def consolidate(items, prefix):
    result=[]
    groups=[(mat,[o for o in items if o.data.materials[0]==mat]) for mat in [silver,gold,black,gem]]
    for mat,group in groups:
        if not group:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        bpy.ops.object.join();obj=bpy.context.object;obj.name=prefix+' / '+mat.name
        result.append(obj)
    return result
parts=consolidate(parts,'Lumen pendant')
chain_parts=consolidate(chain_parts,'Display chain')

# Blender world uses Z up; exported glTF becomes Y up, face +Z. Units: meters.
transform=Matrix.Rotation(math.pi/2,4,'X') @ Matrix.Diagonal((.001,.001,.001,1))
for obj in parts+chain_parts:
    obj.matrix_world=transform @ obj.matrix_world
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)

def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    triangles=0
    for obj in objects:
        obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    return {'file':name,'triangles':triangles,'bytes':(OUT/name).stat().st_size}

reports=[export('emoria-lumen-pendant.glb',parts),export('emoria-lumen-necklace.glb',parts+chain_parts)]
assert all(r['bytes']>10000 and r['triangles']<100000 for r in reports), reports
(ART/'asset-info.json').write_text(json.dumps({'assets':reports,'diameter_mm':28,'dimensions_verified':False,'rear':'plain inferred silver back','front_axis_gltf':'+Z','up_axis_gltf':'+Y','origin':'pendant disk center','bail_anchor_m':[0,.018,0],'chain':'static display chain, separate mesh; requires AR deformation','reference':'public/assets/catalog/emoria-lumen.png'},indent=2),encoding='utf-8')

scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22)
scene.view_settings.view_transform='AgX'
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name,position,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=position);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;aim(o,(0,0,.006))
light('Large cool softbox',(.035,-.045,.055),.22,.045,(.87,.93,1))
light('Warm rim',(-.04,.015,.035),.30,.03,(1,.87,.70))
light('Top strip',(.01,.005,.07),.22,.025,(1,1,1))
backmat=material('Backdrop',(.035,.048,.07),0,.85)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,.007,0),rotation=(math.pi/2,0,0))
back=bpy.context.object;back.name='Render backdrop - excluded GLB';back.data.materials.append(backmat)
bpy.ops.object.camera_add(location=(.018,-.085,.033));cam=bpy.context.object;aim(cam,(0,0,.003));cam.data.type='ORTHO';cam.data.ortho_scale=.048;cam.data.lens=70;cam.data.clip_start=.001;scene.camera=cam
for o in chain_parts:o.hide_render=True
scene.render.filepath=str(ART/'lumen-pendant-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'emoria-lumen.blend'))
# Render the exported/reimported GLB, not just the Blender source scene.
for obj in parts+chain_parts:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'emoria-lumen-pendant.glb'))
imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
assert imported and all(max(o.dimensions)<.1 for o in imported), 'Invalid export scale'
assert {m.name.split('.')[0] for o in imported for m in o.data.materials} >= {'Polished silver','Warm gold bezel','Black enamel','Faceted crystal'}, 'Missing exported materials'
bpy.ops.render.render(write_still=True)
print('LUMEN_RESULT '+json.dumps(reports))
