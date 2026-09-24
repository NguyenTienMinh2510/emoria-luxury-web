"""Local, repeatable Whisk-reference reconstruction. Blender 5.x, no add-ons.
Units authored in mm; glTF exports meters, face +Z, up +Y. Dimensions inferred.
Run blender --background --python-exit-code 1 --python scripts/build-jewelry-blender.py
Optional: -- lumen halo (only regenerate those designs). No reference pixels baked in.
"""
import bpy, math, json, sys, random
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'public/models/jewelry'
ART = ROOT/'docs/jewelry-blender'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
TAU = math.tau

def material(name, color, metal=0, rough=.2, transmission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    for k,v in {'Base Color':(*color,1),'Metallic':metal,'Roughness':rough,'Transmission Weight':transmission,'IOR':2.417 if transmission else 1.5,'Coat Weight':.3}.items():p.inputs[k].default_value=v
    return m

def mesh(name, verts, faces, mat, smooth=True):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(mat)
    for f in data.polygons:f.use_smooth=smooth
    return o

def tube(name, pts, r, mat, closed=False, sides=8):
    pts=list(map(Vector,pts));verts=[];faces=[]
    for i,p in enumerate(pts):
        a=pts[(i-1)%len(pts)] if closed or i else pts[0]
        b=pts[(i+1)%len(pts)] if closed or i<len(pts)-1 else pts[-1]
        t=(b-a).normalized();ref=Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0))
        u=t.cross(ref).normalized();v=t.cross(u).normalized()
        verts.extend(p+r*(u*math.cos(j*TAU/sides)+v*math.sin(j*TAU/sides)) for j in range(sides))
    for i in range(len(pts) if closed else len(pts)-1):
        k=(i+1)%len(pts)
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,k*sides+(j+1)%sides,k*sides+j))
    if not closed:faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,mat)

def ellipse(name,rx,ry,z,r,mat,cx=0,cy=0,n=128):
    return tube(name,[(cx+rx*math.cos(i*TAU/n),cy+ry*math.sin(i*TAU/n),z) for i in range(n)],r,mat,True,10)

def ball(name,loc,r,mat,scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8 if r<.2 else 20,ring_count=4 if r<.2 else 12,radius=r,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    return o

def plate(name,points,depth,z,mat,bevel=.12):
    # Beveled extruded silhouette, including concave hearts and the Latin cross.
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='2D';cu.fill_mode='BOTH';cu.extrude=depth/2;cu.bevel_depth=0;cu.bevel_resolution=3
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for p,(x,y) in zip(sp.points,points):p.co=(x,y,0,1)
    sp.use_cyclic_u=True;o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.location.z=z;cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    o=bpy.context.object
    mod=o.modifiers.new('Rounded edge','BEVEL');mod.width=bevel;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def disk(rx,ry,mat,z=0,depth=1.4):
    return plate('Beveled medallion',[(rx*math.cos(i*TAU/128),ry*math.sin(i*TAU/128)) for i in range(128)],depth,z,mat)

def stone(loc,r=.4,mat=None):
    # Brilliant crown/star facets and pavilion. Deliberately flat facet normals.
    mat=mat or crystal;verts=[];n=16 if r>1 else 8
    for rad,h,phase in [(0,-r*.7,0),(r,-.03*r,0),(r,.06*r,0),(.72*r,.39*r,math.pi/n),(.32*r,.59*r,0)]:
        for i in range(n):
            a=i*TAU/n+phase;verts.append((loc[0]+rad*math.cos(a),loc[1]+rad*math.sin(a),loc[2]+h))
    faces=[]
    for k in range(4):
        for j in range(n):
            a=k*n+j;b=k*n+(j+1)%n;c=(k+1)*n+(j+1)%n;d=(k+1)*n+j
            faces.extend([(a,b,c),(a,c,d)])
    faces.append(tuple(4*n+j for j in range(n)))
    return mesh('Brilliant-cut gemstone',verts,faces,mat,False)

def pave(points,r=.38,prongs=True):
    for i,(x,y,z) in enumerate(points):
        stone((x,y,z),r)
        if prongs:
            # Shared bead settings and dark recess provide contrast around each stone.
            tube('Pave seat',[(x+r*.93*math.cos(j*TAU/10),y+r*.93*math.sin(j*TAU/10),z-.08) for j in range(10)],.07,silver,True,5)
            for dx in [-r*.75,r*.75]:ball('Pave prong',(x+dx,y+r*.72,z+.11),.085,silver)

def bail(y,double=False):
    ellipse('Connector',1,1.4,.15,.3,silver,cy=y)
    for x in ([-.85,.85] if double else [0]):
        tube('Sculpted bail',[(x+.45*math.sin(t),y+2.9+2.65*math.sin(t),1.18*math.cos(t)) for t in [i*TAU/96 for i in range(96)]],.48,silver,True,16)

def chain_anchor(y):
    o=bpy.data.objects.new('ChainAnchor',None);bpy.context.collection.objects.link(o)
    o.location=(0,y,0);o.empty_display_size=.5
    return o

def leaf(angle,start,length,width,z,mat,name='Sculpted petal'):
    # Curved raised surface, tapered point, real thickness and smooth highlight ridge.
    verts=[];steps=18;across=8
    for i in range(steps+1):
        t=i/steps;r=start+length*t;w=max(.008,width*math.sin(math.pi*t)**.9)
        for j in range(across+1):
            s=j/across*2-1;q=w*s;h=z+.65*math.sin(math.pi*t)*(1-s*s)
            verts.append((r*math.cos(angle)-q*math.sin(angle),r*math.sin(angle)+q*math.cos(angle),h))
    faces=[]
    for i in range(steps):
        for j in range(across):
            a=i*(across+1)+j;faces.append((a,a+1,a+across+2,a+across+1))
    o=mesh(name,verts,faces,mat);mod=o.modifiers.new('Petal thickness','SOLIDIFY');mod.thickness=.16
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def lumen():
    disk(14,14,silver);disk(12,12,black,1,.45)
    for r,z,w in [(13.88,.92,.18),(12.06,1.2,.2),(13.6,-.6,.14)]:ellipse('Polished border',r,r,z,w,silver)
    pave([(12.96*math.cos(i*TAU/80),12.96*math.sin(i*TAU/80),1.13) for i in range(80)],.39)
    for i in range(12):
        a=math.pi/2+i*TAU/12;length=(6.7 if i%3==0 else 4.6)
        o=leaf(a,2.2,length,.69 if i%3==0 else .58,1.35,silver,'Fluted star ray');o.location.y=.7
    ellipse('Gold bezel',3.08,3.08,1.82,.30,gold,cy=.7)
    ellipse('Gold bezel inner lip',2.74,2.74,2.1,.10,gold,cy=.7)
    stone((0,.7,2.02),2.7)
    for i in range(8):
        a=i*TAU/8
        tube('Centre stone claw',[(2.95*math.cos(a),.7+2.95*math.sin(a),1.75),(2.58*math.cos(a),.7+2.58*math.sin(a),2.55)],.115,gold,sides=10)
        ball('Rounded claw tip',(2.58*math.cos(a),.7+2.58*math.sin(a),2.55),.13,gold)
    for cx,cy,r in [(0,-13.5,5.6),(0,-13.5,4.15),(0,-13.5,2.7),(-8.1,-11.7,3.9),(8.1,-11.7,3.9)]:
        pts=[(cx+r*math.cos(i*math.pi/160),cy+r*math.sin(i*math.pi/160),1.48) for i in range(161)]
        pts=[p for p in pts if p[0]**2+p[1]**2<11.93**2]
        if len(pts)>2:tube('Nested wave',pts,.24,silver)
    bail(14,True)

def faith():
    disk(6.4,6.4,silver,0,1.2);disk(5.65,5.65,blue,.74,.25)
    ellipse('Circle border',6.25,6.25,.85,.22,silver)
    pts=[(-.95,12),(.95,12),(.95,1.05),(9,1.05),(9,-1.05),(.95,-1.05),(.95,-17),(-.95,-17),(-.95,-1.05),(-9,-1.05),(-9,1.05),(-.95,1.05)]
    plate('Latin cross',pts,.8,1.38,silver,.25)
    for pts in [[(0,11.3,1.94),(0,-16.2,1.94)],[(-8.2,0,1.94),(8.2,0,1.94)]]:
        tube('Recessed line shadow',pts,.22,darkSilver);tube('Groove highlight',[(x+.07,y,z+.015) for x,y,z in pts],.075,silver)
    stone((0,0,2),.9);pave([(.9*math.cos(i*TAU/12),.9*math.sin(i*TAU/12),2) for i in range(12)],.16,False)
    bail(13.6)

def sen():
    for i in range(8):
        a=i*TAU/8
        leaf(a,1,12,3.05,.2,darkSilver)
        leaf(a,1.6,9.1,2.45,.52,green)
        # Rolled silver edges around outer petals; fine engraved veins on silver tips.
        for side in [-1,1]:
            pts=[]
            for j in range(41):
                t=j/40;r=1+12*t;q=side*3.05*math.sin(math.pi*t)**.9
                pts.append((r*math.cos(a)-q*math.sin(a),r*math.sin(a)+q*math.cos(a),.28))
            tube('Petal rim',pts,.16,silver)
            for k in range(6):
                t=.65+k*.035;r=1+12*t;q=side*2.5*math.sin(math.pi*t)
                tube('Engraved vein',[(r*math.cos(a),r*math.sin(a),.6),((r-.9)*math.cos(a)-q*math.sin(a),(r-.9)*math.sin(a)+q*math.cos(a),.55)],.035,silver,sides=5)
    for i in range(6):
        a=math.pi/2+i*TAU/6;leaf(a,.8,6.8,1.7,1.05,pearl)
        for side in [-1,1]:
            pts=[]
            for j in range(30):
                t=j/29;r=.8+6.8*t;q=side*1.7*math.sin(math.pi*t)**.9
                pts.append((r*math.cos(a)-q*math.sin(a),r*math.sin(a)+q*math.cos(a),1.12))
            tube('Pearl petal edge',pts,.13,silver)
        leaf(a+TAU/12,.6,3.85,.85,1.85,gold)
    ellipse('Pearl gold seat',1.95,1.95,2.4,.22,gold)
    ball('Central pearl',(0,0,2.5),1.75,pearl,scale=(1,1,.85))
    bail(14)
    # Clasp silhouette retained above the lotus.
    tube('Lobster clasp',[(.4*math.sin(t),20+2.4*math.sin(t),1.6*math.cos(t)) for t in [i*TAU/96 for i in range(96)]],.53,silver,True,12)
    ball('Clasp release',(.4,19.4,1.6),.6,silver,scale=(.7,1.5,.7))

def horizon():
    disk(17,11.5,silver);disk(15.35,9.9,blue,.95,.5)
    ellipse('Oval bezel',16.8,11.3,1,.2,silver);ellipse('Inner oval lip',15.4,10,1.2,.15,silver)
    pave([(16.1*math.cos(i*TAU/94),10.7*math.sin(i*TAU/94),1.1) for i in range(94)],.36)
    pts=[(3.1*math.cos(i*math.pi/48),.9+3.1*math.sin(i*math.pi/48)) for i in range(49)]
    plate('Rising sun',pts,.3,1.42,gold,.1)
    for i in range(7):
        a=i*math.pi/6;tube('Sunbeam',[(3.9*math.cos(a),.9+3.9*math.sin(a),1.5),(5.8*math.cos(a),.9+5.8*math.sin(a),1.5)],.16,gold)
    for row in range(4):
        pts=[]
        for j in range(150):
            x=-15.3+30.6*j/149;y=1.1-2.6*row+1.65*math.sin((x+row*4)/8)
            if (x/15.3)**2+(y/9.85)**2<1:pts.append((x,y,1.5))
        if len(pts)>2:tube('Raised silver wave',pts,.20,silver)
    for x in [-18.8,18.8]:ellipse('Side connector',1.7,1.7,.3,.4,silver,cx=x)

def orbit():
    disk(10.2,10.7,silver,0,1.5);disk(9.65,10.15,blue,.9,.5)
    ellipse('Orbit polished rim',10.05,10.55,1,.26,silver)
    ellipse('Orbit inner lip',9.6,10.1,1.2,.12,silver)
    for angle,paved in [(-.6,False),(.4,True)]:
        points=[]
        for i in range(160):
            t=i*TAU/160;x=11.9*math.cos(t);y=3.7*math.sin(t)
            points.append((x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),1.6+1.35*math.sin(t)))
        tube('Pave orbital band' if paved else 'Polished orbital band',points,.38 if paved else .3,silver,True,12)
        if paved:pave([(x,y,z+.28) for x,y,z in points[::3]],.28)
    # Front intersection of the two rotated ellipses: the gold hub joins both bands.
    theta=math.pi/2-.1
    radius=1/math.sqrt((math.cos(theta+.6)/11.9)**2+(math.sin(theta+.6)/3.7)**2)
    hx,hy=radius*math.cos(theta),radius*math.sin(theta)
    ball('Gold orbital centre',(hx,hy,3.15),1.62,gold,scale=(1,1,.8))
    ellipse('Gold centre bezel',1.68,1.68,2.9,.16,gold,cx=hx,cy=hy)
    for x in [-11.95,11.95]:ellipse('Side connector',1.5,1.45,.2,.35,silver,cx=x)

def heart(t):return (16*math.sin(t)**3/1.45,(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/1.45+1.7)

def pulse():
    pts=[heart(i*TAU/160) for i in range(160)]
    plate('Heart body',pts,1.25,0,silver,.28)
    plate('Ruby enamel heart',[(x*.87,y*.87) for x,y in pts],.35,.96,ruby,.22)
    tube('Heart polished lip',[(x*.90,y*.90,1.12) for x,y in pts],.18,silver,True)
    pave([(heart(t)[0]*.974,heart(t)[1]*.974,1.04) for t in [math.pi+i*math.pi/42 for i in range(43)]],.30)
    trace=[(-8.8,-1),(-4.1,-1),(-3.4,.8),(-1.9,-3.5),(0,3.2),(2.2,-3.3),(3.7,.6),(4.5,-1),(9.5,-1)]
    tube('ECG silver relief',[(x,y,1.6) for x,y in trace],.23,silver,sides=10)
    stone((0,1.35,1.9),.95,ruby)
    for a in [i*TAU/4 for i in range(4)]:ball('Ruby prong',(math.cos(a),1.35+math.sin(a),2),.14,silver)
    for side in [-1,1]:
        ellipse('Side connector',1.3,.7,.15,.26,silver,cx=side*12.6)
        tube('Inner connector',[(side*10.5,-.4,.2),(side*11.5,-.4,.2)],.28,silver)
        tube('Curved side bar',[(side*(14+14*t),-1.0-1.1*math.sin(t*math.pi),-.1-13.9*t*t) for t in [i/40 for i in range(41)]],.62,silver,sides=12)
        ellipse('Bar end loop',1.3,.8,-14,.28,silver,cx=side*28)

def ring_surface(name,outer,inner,width,mat):
    # Ring hole axis Y, ornament faces +Z. Rounded rectangular radial profile.
    # Resolve the comfort-fit bevel with real curved surfaces for close AR views.
    bevel=min(.22,(outer-inner)*.45)
    profile=[]
    for r,y,start in [(inner+bevel,-width/2+bevel,180),(outer-bevel,-width/2+bevel,270),(outer-bevel,width/2-bevel,0),(inner+bevel,width/2-bevel,90)]:
        for j in range(6):
            angle=math.radians(start+j*18)
            profile.append((r+bevel*math.cos(angle),y+bevel*math.sin(angle)))
    count=len(profile)
    verts=[(r*math.sin(i*TAU/192),y,r*math.cos(i*TAU/192)) for i in range(192) for r,y in profile];faces=[]
    for i in range(192):
        for j in range(count):faces.append((i*count+j,((i+1)%192)*count+j,((i+1)%192)*count+(j+1)%count,i*count+(j+1)%count))
    return mesh(name,verts,faces,mat)

def ring(kind):
    ring_surface('Comfort-fit silver band',9.85,8.5,5.3,silver)
    ring_surface('Recessed inlay',9.94,9.7,3.65,blue if kind=='echo' else ivory)
    for y in [-1.92,1.92]:tube('Polished edge',[(9.94*math.sin(i*TAU/192),y,9.94*math.cos(i*TAU/192)) for i in range(192)],.11,silver,True)
    for k in range(3 if kind=='echo' else 1):
        tube('Flowing orbital ribbon',[(10.01*math.sin(a),.35+k*.52+.32*math.sin(a*2+k),10.01*math.cos(a)) for a in [i*TAU/192 for i in range(192)]],.12,silver,True)
    ball('Gold signature dot',(-.8,.94,10.03),.58,gold,scale=(1,1,.55))
    for i in range(27 if kind=='halo' else 9):
        a=(-.75+i*.055) if kind=='halo' else (.05+i*.095)
        o=stone((0,0,0),.31)
        o.rotation_euler[1]=a;o.location=(10.04*math.sin(a),1.37,10.04*math.cos(a))
        for dy in [-.3,.3]:ball('Channel bead',(10.04*math.sin(a),1.37+dy,10.04*math.cos(a)),.075,silver)
    if kind=='echo':
        rng=random.Random(19)
        for i in range(160):
            a=rng.uniform(-math.pi,math.pi);y=rng.uniform(-1.6,.2)
            ball('Stardust inlay',(9.96*math.sin(a),y,9.96*math.cos(a)),rng.uniform(.008,.022),silver)
    else:
        for k in range(3):
            tube('Signature ripples',[(.05+(k*.17+.35)*math.cos(t),.45+(k*.17+.35)*math.sin(t),10.03) for t in [math.pi+i*math.pi/24 for i in range(25)]],.045,darkSilver)

def wrist_chain(kind):
    # Separate linked cable wrapping the inferred wrist. Front ornaments remain rigid.
    # ponytail: inferred ellipse, not cloth simulation; calibrate from measured bracelet later.
    start=1.31 if kind=='pulse' else .49 if kind=='orbit' else .79
    for i in range(98):
        a=start+i*(TAU-2*start)/97
        center=Vector((29*math.sin(a),0,19*(math.cos(a)-1)))
        tangent=Vector((29*math.cos(a),0,-19*math.sin(a))).normalized()
        u=Vector((0,1,0)) if i%2==0 else Vector((math.sin(a),0,math.cos(a)))
        tube('Wrist cable link',[center+tangent*(.83*math.cos(t))+u*(.48*math.sin(t)) for t in [j*TAU/16 for j in range(16)]],.16,silver,True,6)
        if kind=='orbit' and i%9==4:ball('Orbit chain bead',center,.62,silver)

    if kind=='orbit':
        for side in [-1,1]:
            for i in range(3):
                ellipse('Orbit connector link',.65,.95,-.2-i*.85,.2,silver,cx=side*(13.2+i*.25),n=32)

    if kind=='horizon':
        for side in [-1,1]:
            for i in range(4):
                tube('Connector cable',[(side*20.6+.48*math.cos(t),.15*math.cos(t),-.5-i*1.4+.82*math.sin(t)) for t in [j*TAU/16 for j in range(16)]],.16,silver,True,6)

def combine():
    items=[o for o in bpy.context.scene.objects if o.type=='MESH'];groups={}
    for o in items:groups.setdefault(o.data.materials[0].name,[]).append(o)
    result=[]
    for name,group in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=name;result.append(o)
    return result

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()

names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['lumen','faith','sen','horizon','pulse','echo','halo','orbit']
reports=[]
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    silver=material('Polished silver',(.76,.80,.85),1,.17)
    darkSilver=material('Engraved silver',(.21,.24,.28),1,.29)
    gold=material('Warm gold',(.83,.58,.26),1,.19)
    black=material('Onyx enamel',(.004,.006,.010),0,.15)
    blue=material('Midnight blue enamel',(.003,.009,.052),.12,.16)
    green=material('Jade enamel',(.005,.043,.019),.05,.23)
    ruby=material('Wine ruby',(.105,.005,.017),.07,.15)
    pearl=material('Pearl',(.83,.80,.67),.22,.23)
    ivory=material('Champagne inlay',(.79,.65,.39),.65,.20)
    # Lower transmission improves readability against a live camera without expensive caustics.
    crystal=material('Brilliant crystal',(.63,.72,.84),.85,.09)
    if name in ['echo','halo']:ring(name)
    else:globals()[name]()
    if name in ['horizon','pulse','orbit']:wrist_chain(name)
    items=combine()
    if name in ['lumen','faith','sen']:items.append(chain_anchor({'lumen':16.9,'faith':16.5,'sen':20}[name]))
    bpy.context.view_layer.update()
    transform=Matrix.Rotation(math.pi/2,4,'X') @ Matrix.Diagonal((.001,.001,.001,1))
    for o in items:o.matrix_world=transform @ o.matrix_world
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    path=OUT/f'emoria-{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    triangles=0
    for o in items:
        if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    assert 1000<triangles<140000,(name,triangles)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.26,.30,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    scene.view_settings.view_transform='AgX'
    for loc,power,size in [((.03,-.045,.06),.35,.045),((-.04,-.025,.015),.24,.025),((.005,.015,.04),.4,.035)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,0))
    ring_mode=name in ['echo','halo'];bracelet=name in ['horizon','pulse','orbit']
    bpy.ops.object.camera_add(location=(.03,-.065,.043) if ring_mode else (.012,-.095,.032))
    cam=bpy.context.object;aim(cam,(0,0,0 if ring_mode else .003));cam.data.type='ORTHO';cam.data.ortho_scale=.036 if ring_mode else (.076 if bracelet else .047);cam.data.clip_start=.001;scene.camera=cam
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ART/f'{name}.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/f'emoria-{name}.blend'))
    # Verify render from GLB roundtrip, not from unexported procedural materials.
    for o in items:bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
    assert imported and all(max(o.dimensions)<.2 for o in imported),name
    bpy.ops.render.render(write_still=True)
    report={'product':name,'file':path.name,'triangles':triangles,'bytes':path.stat().st_size,'reference':f'/ar/{name}.jpg','dimensionsVerified':False}
    (ART/f'{name}.json').write_text(json.dumps(report,indent=2),encoding='utf-8');reports.append(report)
    print('JEWELRY_RESULT '+json.dumps(report),flush=True)
print('COMPLETE '+json.dumps(reports),flush=True)
