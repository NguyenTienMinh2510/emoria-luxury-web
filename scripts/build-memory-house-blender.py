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
    # Reduce dense curved surfaces without removing an item or photo anchor.
    for o in meshes:
        if root.name.startswith('decor_') and len(o.data.polygons)>400:
            modifier=o.modifiers.new('Mobile mesh budget','DECIMATE');modifier.ratio=.55
            bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=modifier.name)
    groups=[[o for o in meshes if o.data.materials and o.data.materials[0]==m] for m in list(bpy.data.materials)]
    for group in groups:
        if not group:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
        bpy.context.object.name=root.name+' / '+bpy.context.object.data.materials[0].name
        # Solid-colour geometry needs no texture coordinates. Editable photo
        # and text planes were excluded above and retain their UV mapping.
        if root.name.startswith('decor_'):
            for uv in list(bpy.context.object.data.uv_layers):bpy.context.object.data.uv_layers.remove(uv)

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

"""Insert after the builder's primitive helpers, before any asset is built.

Uses the builder's bpy/math/Vector, mat, finish, box, cyl and ellipsoid.
All geometry is real mesh geometry; no reference-image planes are used.
"""

def cozy_mat(name, rgb, roughness=.67, metallic=0):
    material = mat('Cozy / ' + name, rgb, metallic)
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = roughness
    return material

cozy_fur = cozy_mat('cream plush', (.86, .79, .65), .83)
cozy_honey = cozy_mat('honey plush', (.62, .36, .12), .82)
cozy_orange = cozy_mat('orange peel', (.83, .38, .10), .68)
cozy_yellow = cozy_mat('duck yellow', (.85, .65, .28), .76)
cozy_pear = cozy_mat('pear yellow green', (.70, .72, .36), .62)
cozy_green = cozy_mat('sage ceramic and knit', (.29, .40, .26), .75)
cozy_leaf_green = cozy_mat('fresh sage leaves', (.31, .44, .27), .63)
cozy_green_dark = cozy_mat('leaf and knit relief', (.23, .33, .20), .77)
cozy_blush = cozy_mat('soft pink', (.70, .43, .36), .72)
cozy_piping = cozy_mat('cream piping', (.85, .80, .68), .82)
cozy_amber = cozy_mat('honey wax', (.77, .49, .20), .65)
cozy_twine = cozy_mat('natural twine', (.52, .33, .13), .87)
cozy_bill = cozy_mat('terracotta duck bill', (.65, .29, .16), .72)
cozy_eye = cozy_mat('warm dark eyes', (.095, .055, .035), .57)
cozy_grey = cozy_mat('penguin grey sage', (.28, .35, .30), .9)
cozy_wood_edge = cozy_mat('pale wood edge', (.64, .45, .27), .68)
cozy_pine = cozy_mat('pine cone scales', (.46, .25, .08), .83)
cozy_pine_light = cozy_mat('pine cone tips', (.60, .36, .14), .80)

def cozy_glass(name, amber=False):
    rgb = (.83, .66, .43) if amber else (.89, .95, .96)
    material = cozy_mat(name, rgb, .12)
    principled = material.node_tree.nodes.get('Principled BSDF')
    transmission = principled.inputs.get('Transmission Weight') or principled.inputs.get('Transmission')
    if transmission is not None:
        transmission.default_value = .94
    principled.inputs['IOR'].default_value = 1.45
    # Alpha enables visible contents even in a viewer with no transmission buffer.
    principled.inputs['Alpha'].default_value = .24 if amber else .16
    material.diffuse_color = (*rgb, .24 if amber else .16)
    if hasattr(material, 'surface_render_method'):
        material.surface_render_method = 'DITHERED'
    elif hasattr(material, 'blend_method'):
        material.blend_method = 'BLEND'
    return material

cozy_clear_glass = cozy_glass('clear glass')
cozy_honey_glass = cozy_glass('amber candle glass', True)

def cozy_mesh(name, vertices, faces, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, material)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    return obj

def cozy_soften(obj, width=.01, segments=3):
    if width:
        modifier = obj.modifiers.new('Small rounded manufactured edge', 'BEVEL')
        modifier.width = width
        modifier.segments = segments
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.modifiers.new('Weighted crafted normals', 'WEIGHTED_NORMAL')
    return obj

def cozy_sphere(name, loc, radii, material, segments=20, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj = finish(bpy.context.object, name, material)
    obj.scale = radii
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj

def cozy_bezier(points, count=16):
    points = [Vector(point) for point in points]
    result = []
    for i in range(count + 1):
        t = i / count
        if len(points) == 3:
            point = (1-t)**2*points[0] + 2*t*(1-t)*points[1] + t*t*points[2]
        else:
            point = (1-t)**3*points[0] + 3*t*(1-t)**2*points[1] + 3*t*t*(1-t)*points[2] + t**3*points[3]
        result.append(tuple(point))
    return result

def cozy_tube(name, points, radius, material, sides=8, closed=False):
    points = [Vector(point) for point in points]
    vertices, faces = [], []
    previous_normal = None
    n = len(points)
    for i, point in enumerate(points):
        tangent = (points[(i+1) % n] - points[(i-1) % n]) if closed else (points[min(i+1,n-1)] - points[max(i-1,0)])
        tangent.normalize()
        if previous_normal is None:
            normal = tangent.cross(Vector((0,0,1)) if abs(tangent.z) < .9 else Vector((0,1,0))).normalized()
        else:
            normal = previous_normal - tangent * previous_normal.dot(tangent)
            if normal.length < 1e-7:
                normal = tangent.cross(Vector((0,1,0)))
            normal.normalize()
        bitangent = tangent.cross(normal).normalized()
        previous_normal = normal
        r = radius[i] if isinstance(radius, (list,tuple)) else radius
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(tuple(point + r*(math.cos(angle)*normal + math.sin(angle)*bitangent)))
    for i in range(n if closed else n-1):
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides, ((i+1)%n)*sides+(j+1)%sides, ((i+1)%n)*sides+j))
    if not closed:
        faces.extend([tuple(reversed(range(sides))), tuple((n-1)*sides+j for j in range(sides))])
    return cozy_mesh(name, vertices, faces, material)

def cozy_lathe(name, profile, material, segments=32, deform=None):
    # A closed radius/height profile includes the interior of vessels when needed.
    vertices, faces = [], []
    for radius, height in profile:
        for j in range(segments):
            angle = j*math.tau/segments
            r,z = deform(radius,height,angle) if deform else (radius,height)
            vertices.append((r*math.cos(angle), r*math.sin(angle), z))
    for i in range(len(profile)-1):
        for j in range(segments):
            faces.append((i*segments+j, i*segments+(j+1)%segments, (i+1)*segments+(j+1)%segments, (i+1)*segments+j))
    faces.extend([tuple(reversed(range(segments))),tuple((len(profile)-1)*segments+j for j in range(segments))])
    return cozy_mesh(name, vertices, faces, material)

def cozy_prism(name, contour, lower, upper, material, bevel=.008, plane='XY', depth=None):
    # Flat top/bottom caps are deliberate: tableware must contact a real planar top.
    n = len(contour)
    if plane == 'XY':
        vertices = [(x,y,lower) for x,y in contour] + [(x,y,upper) for x,y in contour]
    else:
        vertices = [(x,lower,z) for x,z in contour] + [(x,upper,z) for x,z in contour]
    faces = [tuple(reversed(range(n))), tuple(n+i for i in range(n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return cozy_soften(cozy_mesh(name,vertices,faces,material,False),bevel)

def cozy_round_rect(width, height, radius, steps=6):
    points = []
    for cx,cy,start in [(width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,90),(-width/2+radius,-height/2+radius,180),(width/2-radius,-height/2+radius,270)]:
        for i in range(steps+1):
            angle = math.radians(start+i*90/steps)
            points.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle)))
    return points

def cozy_closed_spline(knots, steps=5):
    knots = [Vector(point) for point in knots]
    points = []
    for i in range(len(knots)):
        a,b,c,d = [knots[(i+j)%len(knots)] for j in [-1,0,1,2]]
        for j in range(steps):
            t=j/steps
            p=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
            points.append(tuple(p))
    return points

def cozy_frame_ring(name, outer_size, inner_size, outer_radius, inner_radius, bottom, front, back, material):
    outer = cozy_round_rect(*outer_size,outer_radius)
    inner = cozy_round_rect(*inner_size,inner_radius)
    centre = bottom+outer_size[1]/2
    n=len(outer)
    vertices=[]
    for y,contour in [(front,outer),(front,inner),(back,outer),(back,inner)]:
        vertices += [(x,y,z+centre) for x,z in contour]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    return cozy_soften(cozy_mesh(name,vertices,faces,material,False),.008)

def cozy_leaf(name, centre, direction, length, width, material=cozy_leaf_green, heart=False):
    # Raised centre, rounded edge and solid underside produce a small curled leaf.
    contour=[]
    for j in range(24):
        angle=j*math.tau/24
        if heart:
            x=math.sin(angle)**3*width/2
            y=(13*math.cos(angle)-5*math.cos(2*angle)-2*math.cos(3*angle)-math.cos(4*angle))/17*length/2
        else:
            x=width/2*math.cos(angle)
            y=length/2*math.sin(angle)
        contour.append((x,y))
    vertices=[(0,0,.007),(0,0,-.004)]
    for t,z in [(.50,.006),(1,.001),(.50,-.003),(1,-.001)]:
        vertices.extend((x*t,y*t,z) for x,y in contour)
    faces=[]
    for j in range(24):
        k=(j+1)%24
        faces += [(0,2+j,2+k),(2+j,26+j,26+k,2+k),(1,50+k,50+j),(50+j,50+k,74+k,74+j),(26+j,74+j,74+k,26+k)]
    obj=cozy_mesh(name,vertices,faces,material)
    obj.location=centre
    obj.rotation_euler=Vector(direction).to_track_quat('Y','Z').to_euler()
    return obj

def cozy_face_arc(name, centre, width, height, material=cozy_eye, smile=False, radius=.0025):
    x,y,z=centre
    points=[(x+width*(t-.5),y,z+(height*math.sin(math.pi*t))*(-1 if smile else 1)) for t in [i/10 for i in range(11)]]
    return cozy_tube(name,points,radius,material,6)

def cozy_jar(name, radius, height, material=cozy_clear_glass):
    return cozy_lathe(name,[(radius*.78,0),(radius*.96,.008),(radius,.035),(radius,height*.64),(radius*.94,height*.79),(radius*.83,height*.84),(radius*.83,height*.94),(radius*.91,height*.975),(radius*.90,height),(radius*.80,height),(radius*.77,height*.955),(radius*.77,height*.845),(radius*.91,height*.77),(radius*.955,height*.64),(radius*.955,.04),(radius*.88,.018)],material,32)

def cozy_star(name, loc, radius, material, rotation=(0,0,0)):
    # Faceted, puffed folded-paper star, rather than a flat printed star.
    contour=[]
    for j in range(10):
        a=math.pi/2+j*math.pi/5;r=radius if j%2==0 else radius*.51
        contour.append((r*math.cos(a),r*math.sin(a),0))
    vertices=contour+[(0,0,radius*.38),(0,0,-radius*.26)]
    faces=[(j,(j+1)%10,10) for j in range(10)]+[((j+1)%10,j,11) for j in range(10)]
    obj=cozy_mesh(name,vertices,faces,material,False);obj.location=loc;obj.rotation_euler=rotation
    return obj

def cozy_crane(name, loc, size, material, angle=0):
    # Closed thin triangular folds form a body, two wings, tail and bent neck.
    vertices=[(-.16,-.15,0),(.16,-.15,0),(0,.16,0),(0,-.03,.23),(-.64,.08,.42),(.64,.08,.42),(0,.67,.44),(0,-.32,.51),(0,-.34,.69),(0,-.53,.61)]
    faces=[(0,1,3),(1,2,3),(2,0,3),(0,4,3),(3,4,2),(3,5,1),(2,5,3),(2,6,0),(0,6,3),(0,3,7),(7,3,8),(7,8,9),(0,2,1)]
    obj=cozy_mesh(name,vertices,faces,material,False)
    modifier=obj.modifiers.new('Folded paper thickness','SOLIDIFY');modifier.thickness=.016
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.location=loc;obj.scale=(size,size,size);obj.rotation_euler.z=angle
    return obj
# Helpers for D01-D13/D26-D29. All visible detail is editable mesh geometry.
def legacy_material(name, color, roughness=.72, metal=0):
    existing=bpy.data.materials.get('Cozy '+name)
    if existing:return existing
    values=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values]
    material=mat('Cozy '+name,linear,metal)
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=roughness
    return material

legacy_cream=legacy_material('warm ceramic','#e9e1cf')
legacy_paper=legacy_material('warm paper','#f0ede3')
legacy_sage=legacy_material('soft sage','#8d9f7f')
legacy_leaf_green=legacy_material('heart leaf','#809b73')
legacy_wood=legacy_material('light oak','#c1a073')
legacy_crust=legacy_material('toast crust','#c59450')
legacy_pink=legacy_material('blush clay','#d0a498')
legacy_coral=legacy_material('mushroom coral','#c67464')
legacy_jam=legacy_material('strawberry jam','#b66f69')
legacy_seed=legacy_material('strawberry dimples','#8c4945')
legacy_butter=legacy_material('butter yellow','#ead688')
legacy_gold=legacy_material('calendar brass','#bc8b3c',.38,.3)
legacy_dark=legacy_material('warm facial details','#61503b')
legacy_soil=legacy_material('potting soil','#6a5740')
legacy_avocado_inner=legacy_material('avocado interior','#c5ce9a')
legacy_pit=legacy_material('avocado pit','#b48038',.42)

def legacy_ball(name,loc,size,material,segments=20,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    obj=finish(bpy.context.object,name,material);obj.scale=size
    for polygon in obj.data.polygons:polygon.use_smooth=True
    return obj

def legacy_mesh(name,vertices,faces,material,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);finish(obj,name,material)
    for polygon in data.polygons:polygon.use_smooth=smooth
    return obj

def legacy_bevel(obj,width,segments=3):
    if not width:return obj
    modifier=obj.modifiers.new('Rounded ceramic edge','BEVEL');modifier.width=width;modifier.segments=segments
    modifier.limit_method='ANGLE';modifier.angle_limit=.4
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.modifiers.new('Crafted face normals','WEIGHTED_NORMAL')
    return obj

def legacy_outline(points,steps=3):
    result=[];n=len(points)
    for i in range(n):
        a,b,c,d=[Vector(points[j%n]) for j in (i-1,i,i+1,i+2)]
        for k in range(steps):
            t=k/steps
            p=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
            result.append(tuple(p))
    return result

def legacy_profile(name,points,y,depth,material,bevel=.006):
    points=list(points)
    if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))<0:points.reverse()
    n=len(points)
    vertices=[(x,y-depth/2,z) for x,z in points]+[(x,y+depth/2,z) for x,z in points]
    faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return legacy_bevel(legacy_mesh(name,vertices,faces,material),bevel)

def legacy_prism(name,points,z0,z1,material,bevel=.008):
    points=list(points)
    if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))<0:points.reverse()
    n=len(points);vertices=[(x,y,z0) for x,y in points]+[(x,y,z1) for x,y in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return legacy_bevel(legacy_mesh(name,vertices,faces,material),bevel)

def legacy_round_rect(width,height,radius,segments=6):
    result=[]
    for x,z,start in [(width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,90),(-width/2+radius,-height/2+radius,180),(width/2-radius,-height/2+radius,270)]:
        for i in range(segments+1):
            angle=math.radians(start+i*90/segments);result.append((x+radius*math.cos(angle),z+radius*math.sin(angle)))
    return result

def legacy_tube(name,points,radius,material,resolution=4):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=resolution
    curve.bevel_depth=radius;curve.bevel_resolution=1;curve.use_fill_caps=True
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,co in zip(spline.bezier_points,points):
        point.co=co;point.handle_left_type='AUTO';point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);finish(obj,name,material)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    for polygon in obj.data.polygons:polygon.use_smooth=True
    return obj

def legacy_lathe(name,profile,material,segments=32,loc=(0,0,0),flip=False,inner_material=None,inner_start=None):
    vertices=[(r*math.cos(j*math.tau/segments)+loc[0],r*math.sin(j*math.tau/segments)+loc[1],z+loc[2]) for r,z in profile for j in range(segments)]
    faces=[]
    for row in range(len(profile)-1):
        for j in range(segments):
            face=(row*segments+j,row*segments+(j+1)%segments,(row+1)*segments+(j+1)%segments,(row+1)*segments+j)
            faces.append(tuple(reversed(face)) if flip else face)
    obj=legacy_mesh(name,vertices,faces,material,True)
    if inner_material is not None:
        obj.data.materials.append(inner_material)
        for polygon in obj.data.polygons:
            if polygon.index//segments>=inner_start:polygon.material_index=1
    return obj

def legacy_leaf(name,loc,width,height,thickness,material,heart=True):
    outline=legacy_outline([(-.5,.15),(-.42,.43),(-.20,.48),(0,.30),(.20,.48),(.42,.43),(.5,.15),(.36,-.16),(0,-.5),(-.36,-.16)],2) if heart else legacy_outline([(0,.5),(.36,.27),(.5,-.08),(.27,-.42),(0,-.5),(-.27,-.42),(-.5,-.08),(-.36,.27)],3)
    n=len(outline);vertices=[]
    for scale,y in [(.001,-thickness),(.55,-thickness*.85),(1,0),(.55,thickness*.85),(.001,thickness)]:
        vertices.extend((x*width*scale+loc[0],y+loc[1],z*height*scale+loc[2]) for x,z in outline)
    faces=[tuple(reversed(range(n))),tuple(range(4*n,5*n))]
    for row in range(4):
        faces.extend((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i) for i in range(n))
    obj=legacy_mesh(name,vertices,faces,material,True)
    # Local pivot at leaf centre permits natural stem and rosette orientations.
    for vertex in obj.data.vertices:vertex.co-=Vector(loc)
    obj.location=loc
    return obj

def legacy_photo(name,loc,width,height,index=None,text=False,tilt=0,flat=False):
    bpy.ops.mesh.primitive_plane_add(size=2,location=loc,rotation=(0 if flat else math.pi/2,tilt,0))
    obj=finish(bpy.context.object,name,legacy_paper);obj.scale=(width/2,height/2,1)
    obj['photoAspect']=width/height
    if index is not None:obj['decorPhotoIndex']=index
    if text:obj['decorText']=True
    return obj

def legacy_star(name,x,y,z,radius,material):
    points=[]
    for i in range(10):
        angle=math.pi/2+i*math.pi/5;r=radius if i%2==0 else radius*.48
        points.append((x+r*math.cos(angle),z+r*math.sin(angle)))
    return legacy_profile(name,points,y,.026,material,.005)

def legacy_cup(name,radius,height,material,inside):
    profile=[(0,.012),(radius*.68,.012),(radius*.91,.035),(radius,.075),(radius*.98,height*.76),(radius*.91,height-.009),(radius*.85,height),
             (radius*.79,height-.006),(radius*.80,height-.032),(radius*.84,.075),(radius*.72,.046),(0,.046)]
    return legacy_lathe(name,profile,material,inner_material=inside,inner_start=6)

def legacy_cut(obj,name,loc,size):
    cutter=legacy_ball(name+' cutter',loc,size,None,24,12)
    modifier=obj.modifiers.new(name,'BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

def legacy_daisy(name,x,y,z,radius):
    for j in range(12):
        angle=j*math.tau/12
        petal=legacy_ball(name+' petal',(x+radius*.62*math.cos(angle),y,z+radius*.62*math.sin(angle)),(radius*.43,.009,radius*.14),legacy_cream,12,6)
        petal.rotation_euler.y=-angle
    legacy_ball(name+' golden centre',(x,y-.014,z),(radius*.24,.015,radius*.24),legacy_butter,16,8)

def legacy_scallops(width,height,bump=.020,nx=8,nz=6):
    points=[]
    for start,end,count,normal in [((-width/2,height/2),(width/2,height/2),nx,(0,1)),((width/2,height/2),(width/2,-height/2),nz,(1,0)),((width/2,-height/2),(-width/2,-height/2),nx,(0,-1)),((-width/2,-height/2),(-width/2,height/2),nz,(-1,0))]:
        for j in range(count):
            for k in range(5):
                t=(j+k/5)/count;bulge=bump*math.sin(math.pi*k/5)
                points.append((start[0]+(end[0]-start[0])*t+normal[0]*bulge,start[1]+(end[1]-start[1])*t+normal[1]*bulge))
    return points

def legacy_bag(name):
    rings=[(.090,.078,.012),(.108,.089,.025),(.104,.087,.115),(.092,.080,.224),(.110,.094,.232),(.115,.099,.261),(.103,.090,.274),(.090,.077,.260),(.085,.072,.231),(.083,.069,.200)]
    vertices=[];segments=32
    for row,(rx,ry,z) in enumerate(rings):
        for j in range(segments):
            angle=j*math.tau/segments;c=math.cos(angle);s=math.sin(angle)
            wrinkle=1+.025*math.sin(5*angle+row*.5)
            vertices.append((math.copysign(abs(c)**.52,c)*rx*wrinkle,math.copysign(abs(s)**.52,s)*ry*wrinkle,z))
    faces=[tuple(reversed(range(segments)))]
    for row in range(len(rings)-1):
        faces.extend((row*segments+j,row*segments+(j+1)%segments,(row+1)*segments+(j+1)%segments,(row+1)*segments+j) for j in range(segments))
    return legacy_mesh(name,vertices,faces,legacy_wood,True)
# Cozy architecture from H01-H04. Preserve room coordinates and photo IDs.
def cozy_srgb(rgb):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)

ivory = mat('Warm cream plaster', cozy_srgb((.93,.875,.77)))
white = mat('Cream painted wood', cozy_srgb((.965,.94,.87)))
oak = mat('Pale oak', cozy_srgb((.76,.59,.39)))
rose = mat('Cozy blush doorway trim', cozy_srgb((.80,.56,.47)))
sage = mat('Sage skirting', cozy_srgb((.56,.63,.45)))
glass = mat('Frosted window glass', cozy_srgb((.84,.86,.80)))
oak_variation = mat('Warm oak variation',cozy_srgb((.77,.60,.41)))

def cozy_beam(name, a, b, radius, material):
    a,b=Vector(a),Vector(b)
    o=cyl(name,(a+b)/2,radius,(b-a).length,material)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def cozy_arch_profile(y,z,width,spring,segments=24):
    radius=width/2
    return [(y-radius,z),(y+radius,z)] + [(y+radius*math.cos(i*math.pi/segments),z+spring+radius*math.sin(i*math.pi/segments)) for i in range(segments+1)]

def cozy_extrude_yz(name,x,profile,thickness,material):
    n=len(profile); vertices=[(x+side*thickness/2,y,z) for side in [-1,1] for y,z in profile]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,material)

def cozy_cut(wall,cutter):
    bpy.context.view_layer.objects.active=wall
    for existing in list(wall.modifiers):
        if existing.type=='WEIGHTED_NORMAL':wall.modifiers.remove(existing)
    modifier=wall.modifiers.new('Real opening','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    wall.modifiers.new('Opening weighted normals','WEIGHTED_NORMAL')

def cozy_arch_wall(x,z,height):
    left,right=.06-.42,.06+.42
    wall=box('Doorway front pier',(x,(-1.3+left)/2,z+height/2+.14),(.13,left+1.3,height),white,.008)
    box('Doorway rear pier',(x,(right+1.3)/2,z+height/2+.14),(.13,1.3-right,height),white,.008)
    arc=list(reversed(cozy_arch_profile(.06,z+.14,.84,1.14)[2:]))
    for a,b in zip(arc,arc[1:]):
        cozy_extrude_yz('Curved doorway header',x,[a,b,(b[0],z+height+.14),(a[0],z+height+.14)],.13,white)
    # Trim is a continuous curved ribbon, not stacked cylinders.
    inner=cozy_arch_profile(.06,z+.14,.86,1.14)
    outer=cozy_arch_profile(.06,z+.14,1.04,1.14)
    n=len(inner)
    for face in [-1,1]:
        vertices=[(x+face*.076,y,h) for y,h in inner+outer]
        faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(1,n)]
        mesh=bpy.data.meshes.new('Arched blush trim');mesh.from_pydata(vertices,[],faces);mesh.update()
        o=bpy.data.objects.new('Arched blush trim',mesh);bpy.context.collection.objects.link(o);finish(o,'Arched blush trim',rose)
        solid=o.modifiers.new('Trim thickness','SOLIDIFY');solid.thickness=.035
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    return wall

def cozy_window(x,y,z,side_wall=False,wall=None):
    # H01-H03: three side windows. H04: five exterior back windows.
    width,height=.77,1.04
    if side_wall:
        if wall:cozy_cut(wall,box('Window opening',(x,y,z),(.4,width-.07,height-.07),None,.045))
        for dy in [-width/2,width/2]:box('Oak window jamb',(x,y+dy,z),(.17,.055,height),oak,.018)
        for dz in [-height/2,height/2]:box('Oak window head',(x,y,z+dz),(.17,width,.06),oak,.018)
        box('Window central mullion',(x,y,z),(.10,.032,height-.08),oak,.006)
        box('Window crossbar',(x,y,z),(.10,width-.06,.035),oak,.006)
        box('Frosted window panes',(x+.004,y,z),(.014,width-.10,height-.10),glass,.015)
        box('Oak window sill',(x,y,z-height/2-.025),(.25,width+.12,.075),oak,.015)
    else:
        for dx in [-width/2,width/2]:box('Exterior window jamb',(x+dx,y,z),(.055,.13,height),oak,.02)
        for dz in [-height/2,height/2]:box('Exterior window head',(x,y,z+dz),(width,.13,.06),oak,.02)
        box('Exterior window glass',(x,y-.005,z),(width-.10,.015,height-.10),glass,.02)
        box('Exterior window mullion',(x,y+.03,z),(.035,.10,height-.07),oak,.006)
        box('Exterior window crossbar',(x,y+.03,z),(width-.07,.10,.035),oak,.006)
        box('Exterior window sill',(x,y+.03,z-height/2-.025),(width+.12,.23,.075),oak,.015)

house=empty('EMORIA Cozy Memory House',assetVersion=3,architectureOnly=True);parent=house
house['styleReference']='S00';house['cozyWindowCount']=8;house['cozyDoorwayCount']=3
box('Oak house foundation',(0.18,0,-.03),(9.85,3.14,.22),oak,.055)
rooms=[('beginning',-2.8,0,2.8),('first',0,0,2.8),('little-things',2.8,0,2.8),('memories',-1.8,2.25,3.6),('next-chapter',1.8,2.25,3.6)]
for rid,x,z,w in rooms:
    parent=house;room=empty('room_'+rid,roomId=rid);parent=room
    box('Cream floor edge',(x,0,z+.04),(w,2.6,.14),white,.012)
    box('Back plaster wall',(x,1.22,z+1.12),(w,.16,2.1),ivory,.012)
    for side in [-1,1]:
        boundary=x+side*(w/2-.065)
        internal=(z==0 and (side==1 and rid!='little-things' or side==-1 and rid!='beginning')) or (z>0 and (rid=='memories' and side==1 or rid=='next-chapter' and side==-1))
        if internal:cozy_arch_wall(boundary,z,2.1)
        else:
            wall=box('Outer plaster wall',(boundary,0,z+1.12),(.13,2.6,2.1),white,.012)
            if side==-1 or rid=='next-chapter':cozy_window(boundary,.36,z+1.12,True,wall)
        # Skirting stops at real doorway openings.
        if internal:
            for centre,length in [(-.84,.92),(.95,.69)]:box('Sage doorway skirting',(boundary,centre,z+.22),(.16,length,.15),sage,.014)
        else:box('Sage side skirting',(boundary,0,z+.22),(.16,2.40,.15),sage,.014)
    box('Sage back skirting',(x,1.115,z+.22),(w-.20,.085,.15),sage,.014)
    cozy_window(x,1.345,z+1.12)
    # Alternating boards and fine grain follow the reference's warm timber floor.
    for j in range(int(w/.18)):
        board_mat=oak if j%3 else oak_variation
        box('Oak floorboard',(x-w/2+.11+j*.18,0,z+.125),(.177,2.43,.025),board_mat,.002)
    # Memories form an offset string of small cards, away from the window and
    # table centre. Stable indices keep existing photos and their order intact.
    card_positions=[(-.98,1.54),(-.70,1.43),(-.42,1.59)]
    cozy_tube('Sage photo cord',[(x-1.16,1.08,z+1.91),(x-.74,1.08,z+1.82),(x-.22,1.08,z+1.94)],.009,sage)
    for i,(dx,h) in enumerate(card_positions):
        box('Oak photo peg',(x+dx,1.075,z+h+.19),(.036,.035,.075),oak,.008)
        bpy.ops.mesh.primitive_plane_add(size=2,location=(x+dx,1.055,z+h),rotation=(math.pi/2,0,0))
        surface=finish(bpy.context.object,'photo_'+rid+'_'+str(i),paper);surface.scale=(.135,.10125,1);surface['photoAspect']=4/3
        surface['roomId']=rid;surface['photoIndex']=i
    empty('slot_'+rid+'_left',(x-w*.29,-.28,z+.16),roomId=rid,slot='left')
    empty('slot_'+rid+'_right',(x+w*.29,-.38,z+.16),roomId=rid,slot='right')
    table_y,table_z=(-.70,.51) if rid=='beginning' else ((.14,.77) if rid=='first' else (.57,.76))
    empty('slot_'+rid+'_table',(x,table_y,z+table_z),roomId=rid,slot='table')
    merge_static(room)

parent=house
box('Upper central gable partition',(0,0,4.99),(.20,2.6,1.04),white,.009)
mesh=bpy.data.meshes.new('Gable');mesh.from_pydata([(-3.67,1.22,4.43),(3.67,1.22,4.43),(0,1.22,5.53)],[],[(0,1,2)]);mesh.update()
o=bpy.data.objects.new('Cream rear gable',mesh);bpy.context.collection.objects.link(o);finish(o,'Cream rear gable',ivory)
for side in [-1,1]:
    slope=math.atan(1.12/3.75)
    roof=box('Cream pitched roof',(side*1.875,0,4.98),(3.94,2.96,.12),white,.018);roof.rotation_euler.y=side*slope
    trim=box('Cream front roof fascia',(side*1.875,-1.48,4.98),(3.98,.065,.19),white,.015);trim.rotation_euler.y=side*slope
box('Cream roof ridge',(0,0,5.542),(.075,2.96,.075),white,.012)
# The smaller left wing is visibly distinct from the upper gable.
wing=box('Left wing sloped roof',(-3.92,0,2.33),(.92,2.91,.12),white,.02);wing.rotation_euler.y=-.52
fascia=box('Left wing roof fascia',(-3.92,-1.465,2.33),(.94,.065,.17),white,.015);fascia.rotation_euler.y=-.52

# Closed stair risers, oak treads, cream parapet, real sloping handrail and landing.
steps=12;rise=2.25/steps;run=2.54/steps
for i in range(steps):
    top=.14+(i+1)*rise;y=-1.24+(i+.5)*run
    box('Cream stair riser',(4.59,y,(top+.12)/2),(.73,run+.012,top-.12),ivory,.008)
    box('Oak stair tread',(4.59,y,top+.012),(.76,run+.025,.038),oak,.006)
box('Upper stair landing',(4.20,1.05,2.34),(1.46,.52,.15),white,.018)
profile=[(-1.33,.14),(1.32,.14),(1.32,2.82),(-1.33,.65)]
cozy_extrude_yz('Cream stair parapet',5.0,profile,.14,white)
cozy_beam('Oak stair handrail',(5.01,-1.30,.82),(5.01,1.28,3.03),.045,oak)
for y,z in [(-1.30,.82),(1.28,3.03)]:
    cyl('Stair newel post',(5.01,y,z-.24),.052,.54,oak)
    ellipsoid('Rounded newel cap',(5.01,y,z+.045),(.08,.08,.055),oak)
cozy_beam('Landing wooden rail',(3.67,1.30,2.96),(5.01,1.30,2.96),.045,oak)
for i in range(6):
    x=3.70+i*.255
    cyl('Landing baluster',(x,1.30,2.66),.028,.57,oak)
    ellipsoid('Baluster carved collar',(x,1.30,2.72),(.045,.045,.055),oak)
box('Small engraved house plaque',(0,-1.587,-.015),(2.5,.025,.15),oak,.012)
empty('title_anchor',(0,-1.615,-.015),titleAnchor=True)

parent=None;library=empty('Decoration library');assets=[]
for meta in CATALOG['assets']:
    asset=meta['id']
    parent=library;root=empty('decor_'+asset,assetId=asset);parent=root;assets.append(root)
    if asset=='calendar':
        outline=legacy_outline([(-.015,.366),(-.105,.424),(-.190,.386),(-.218,.304),(-.191,.247),(-.167,.233),(-.201,.204),(-.209,.130),(-.158,.066),(-.082,.083),(-.038,.130),(-.026,.047),(.026,.047),(.038,.130),(.082,.083),(.158,.066),(.209,.130),(.201,.204),(.167,.233),(.191,.247),(.218,.304),(.190,.386),(.105,.424),(.015,.366)],3)
        legacy_profile('Clover sage rounded outline',outline,.015,.061,legacy_sage,.009)
        inset=[(x*.93,.228+(z-.228)*.93) for x,z in outline]
        legacy_profile('Clover ivory face',inset,-.022,.018,legacy_cream,.005)
        box('Calendar blush binding cover',(0,-.053,.255),(.280,.018,.240),legacy_pink,.010)
        box('Calendar paper pad',(0,-.066,.249),(.265,.018,.214),legacy_paper,.006)
        legacy_photo('Calendar insert',(0,-.0765,.247),.259,.204,text=True)
        for x in [-.090,-.030,.030,.090]:
            legacy_tube('Four brass binding loops',[(x,-.020,.342),(x,-.073,.354),(x,-.096,.340),(x,-.096,.314),(x,-.063,.306)],.0065,legacy_gold)
        base=legacy_profile('Ivory calendar easel foot',[(-.064,.002),(.064,.002),(.046,.036),(-.046,.036)],.060,.190,legacy_cream,.010)
        legacy_tube('Blush stem cradle',[(-.044,-.010,.037),(0,-.010,.023),(.044,-.010,.037)],.012,legacy_pink)
    elif asset=='cat':
        legacy_ball('Curled sleeping cat body',(.065,.038,.132),(.174,.175,.132),legacy_cream,24,12)
        head=legacy_ball('Soft sleeping cat head',(-.130,-.090,.139),(.120,.098,.109),legacy_cream,24,12);head.rotation_euler.y=-.12
        for x,z,tilt in [(-.219,.216,-.30),(-.065,.230,.20)]:
            ear=legacy_ball('Rounded cat ear',(x,-.065,z),(.043,.045,.063),legacy_cream);ear.rotation_euler.y=tilt
            inner=legacy_ball('Blush inner ear',(x,-.106,z+.005),(.027,.006,.038),legacy_pink,16,8);inner.rotation_euler.y=tilt
        for x in [-.210,-.112]:legacy_ball('Folded sleeping paw',(x,-.140,.055),(.067,.071,.050),legacy_cream)
        legacy_tube('Cat curled tail',[(.002,-.112,.099),(.040,-.181,.055),(.153,-.176,.050),(.227,-.092,.067),(.225,.033,.084),(.173,.114,.116)],.040,legacy_cream,5)
        for x,z in [(-.176,.142),(-.088,.156)]:
            legacy_tube('Curved closed eyelid',[(x-.020,-.181,z+.006),(x-.010,-.187,z-.003),(x+.005,-.188,z-.006),(x+.020,-.181,z+.005)],.003,legacy_dark)
        nose=legacy_ball('Tiny honey cat nose',(-.126,-.191,.126),(.012,.008,.008),legacy_butter,12,6);nose.rotation_euler.y=-.25
    elif asset=='nameplate':
        outline=legacy_outline([(-.19,.047),(-.31,.060),(-.367,.113),(-.352,.185),(-.285,.218),(-.268,.274),(-.198,.288),(-.134,.275),(-.102,.326),(-.026,.354),(.068,.330),(.112,.277),(.202,.292),(.276,.276),(.303,.221),(.352,.187),(.365,.116),(.328,.081),(.246,.072),(.197,.039),(.112,.032),(.021,.047),(-.075,.030)],3)
        legacy_profile('Ivory cloud message plaque',outline,.009,.068,legacy_cream,.013)
        box('Cloud paper message insert',(0,-.032,.183),(.418,.008,.230),legacy_paper,.003)
        legacy_photo('Cloud message',(0,-.037,.183),.411,.222,text=True)
        for x,z in [(-.283,.154),(.005,.324)]:legacy_ball('Blush cloud pin',(x,-.033,z),(.013,.004,.013),legacy_pink,12,6)
        foot=[(.084*math.cos(j*math.pi/12),.006+.055*math.sin(j*math.pi/12)) for j in range(13)]
        legacy_profile('Half round oak nameplate foot',foot,.057,.229,legacy_wood,.009)
    elif asset=='plant':
        legacy_lathe('Round blush heart-plant pot',[(0,.007),(.098,.007),(.133,.026),(.156,.085),(.155,.144),(.138,.193),(.113,.216),(.103,.213),(.111,.191),(.111,.174),(0,.174)],legacy_pink)
        torus('Ivory rounded pot lip',(0,0,.211),.115,.013,legacy_cream)
        cyl('Visible heart plant soil',(0,0,.183),.103,.008,legacy_soil)
        stems=[((-.015,.018,.191),(-.005,.027,.455)),((-.044,.012,.190),(-.121,.021,.376)),((.037,.020,.190),(.105,.040,.364)),((-.025,-.010,.190),(-.044,-.046,.313)),((.027,-.004,.190),(.104,-.031,.278)),((-.045,-.010,.190),(-.096,-.038,.272)),((.052,-.033,.188),(.053,-.054,.216))]
        for i,(start,end) in enumerate(stems):
            midpoint=tuple((a+b)/2 for a,b in zip(start,end));legacy_tube('Woody heart plant branch',[start,midpoint,end],.009 if i<3 else .006,legacy_wood)
            leaf=legacy_leaf('Rounded heart-shaped leaf',end,.145 if i==0 else (.122 if i<3 else .105),.154 if i==0 else (.122 if i<3 else .087),.015,legacy_leaf_green)
            leaf.rotation_euler.y=[-.1,-.55,.6,.2,.8,-.6,.2][i]
            if i>=3:leaf.rotation_euler.x=.65 if i!=6 else .05
    elif asset in ['mugs','mugs-jam']:
        legacy_cup('Hollow ivory toast mug',.155,.301,legacy_cream,legacy_cream)
        toast=legacy_outline([(-.135,.031),(.135,.031),(.136,.116),(.117,.188),(.148,.245),(.126,.283),(.074,.296),(-.074,.296),(-.126,.283),(-.148,.245),(-.117,.188),(-.136,.116)],3)
        legacy_profile('Golden bread-slice crust',toast,-.139,.038,legacy_crust,.011)
        crumb=[(x*.86,.161+(z-.161)*.86) for x,z in toast]
        legacy_profile('Ivory toast crumb face',crumb,-.163,.018,legacy_cream,.009)
        legacy_tube('Open toast mug handle',[(.143,.008,.241),(.236,.008,.234),(.281,.008,.157),(.242,.008,.087),(.145,.008,.082)],.029,legacy_crust,5)
        if asset=='mugs':box('Rounded yellow butter pat',(0,-.179,.161),(.070,.018,.070),legacy_butter,.013)
        else:
            jam=[(.043*(1+.09*math.cos(5*a))*math.cos(a),.160+.043*(1+.09*math.cos(5*a))*math.sin(a)) for a in [j*math.tau/32 for j in range(32)]]
            legacy_profile('Five-lobed strawberry jam dollop',jam,-.179,.018,legacy_jam,.006)
    elif asset=='lamp':
        legacy_lathe('Mushroom lamp ivory stalk',[(0,.005),(.099,.005),(.124,.018),(.120,.039),(.077,.056),(.085,.105),(.086,.155),(.064,.219),(.053,.267),(0,.267)],legacy_cream)
        legacy_lathe('Warm ivory cap underside',[(0,.257),(.119,.257),(.240,.266),(.254,.278),(.246,.291),(0,.291)],legacy_cream)
        legacy_lathe('Coral mushroom dome',[(0,.273),(.176,.273),(.254,.286),(.268,.309),(.241,.348),(.203,.400),(.157,.441),(.099,.471),(.042,.483),(0,.486)],legacy_coral,40)
        for radius,angle,spot in [(0,0,.054),(.151,-math.pi/2,.050),(.191,-2.4,.047),(.186,-.60,.043),(.215,-1.95,.025),(.164,.75,.043),(.175,2.10,.040)]:
            x=radius*math.cos(angle);y=radius*math.sin(angle);z=.309+.178*(1-(radius/.268)**1.75)
            disc=legacy_ball('Cream mushroom cap spot',(x,y,z+.003),(spot,spot,.005),legacy_cream,20,8)
            normal=Vector((x/(.268*.268),y/(.268*.268),max(.025,z-.309)/(.178*.178)))
            disc.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    elif asset=='vase':
        legacy_bag('Folded paper bag vase with hollow collar')
        for x in [-.070,.067]:legacy_tube('Bag paper crease',[(x,-.085,.035),(x*.84,-.090,.121),(x*.9,-.085,.221)],.0018,legacy_wood)
        legacy_tube('Tall daisy stem',[(.018,.006,.225),(.030,.012,.391),(.038,.014,.518)],.0048,legacy_leaf_green)
        legacy_tube('Small daisy stem',[(-.018,.010,.225),(-.045,-.006,.321),(-.039,-.019,.387)],.0045,legacy_leaf_green)
        legacy_daisy('Tall daisy',.038,.005,.517,.077)
        legacy_daisy('Small daisy',-.039,-.032,.385,.058)
        legacy_tube('Baby breath main stem',[(-.028,.029,.225),(-.073,.040,.332),(-.102,.039,.423)],.0045,legacy_sage)
        for j in range(13):
            a=j*2.4;end=(-.097+.047*math.cos(a),.027+.022*math.sin(a),.378+.073*(j/12))
            legacy_tube('Baby breath branch',[(-.082,.035,.344),((- .082+end[0])/2,.035,(.344+end[2])/2),end],.0025,legacy_sage,3)
            legacy_ball('Cream baby breath bud',end,(.009,.009,.011),legacy_cream,12,6)
    elif asset=='album':
        for side in [-1,1]:
            box('Blush album cover',(side*.136,0,.012),(.273,.444,.020),legacy_pink,.011)
            xs=[0,.020,.070,.170,.265];ys=[-.214,.214]
            vertices=[]
            for layer in [0,1]:
                for x in xs:
                    z=.032 if layer==0 else .073+.265*x-.005*math.sin(x/.265*math.pi)
                    vertices.extend((side*x,y,z) for y in ys)
            n=len(xs)*2;faces=[]
            for i in range(len(xs)-1):
                a=i*2;faces.extend([(a,a+2,a+3,a+1),(n+a,n+a+1,n+a+3,n+a+2),(a,n+a,n+a+2,a+2),(a+1,a+3,n+a+3,n+a+1)])
            faces.extend([(0,1,n+1,n),(n-2,2*n-2,2*n-1,n-1)])
            if side==-1:faces=[tuple(reversed(f)) for f in faces]
            legacy_bevel(legacy_mesh('Thick open album page block',vertices,faces,legacy_paper),.002,2)
            angle=-side*math.atan(.265)
            legacy_photo('Album photo',(side*.139,0,.110),.207,.238,index=0 if side==-1 else 1,tilt=angle,flat=True)
            for row in range(4):
                legacy_tube('Fine album page edge',[(side*.018,-.215,.040+row*.008),(side*.132,-.215,.045+row*.008),(side*.253,-.215,.046+row*.008)],.0008,legacy_cream,3)
        legacy_tube('Curved blush album spine',[(0,-.225,.019),(0,0,.014),(0,.225,.019)],.013,legacy_pink)
    elif asset=='bunting':
        box('Rounded oak photo stand base',(0,.018,.033),(.928,.214,.066),legacy_wood,.031)
        for x in [-.417,.417]:
            cyl('Wooden photo stand upright',(x,.029,.353),.025,.592,legacy_wood)
            legacy_ball('Rounded upright cap',(x,.029,.649),(.025,.025,.010),legacy_wood,16,8)
        cord=[]
        for j in range(9):
            x=-.428+j*.107;cord.append((x,-.003,.610-.100*(1-(x/.428)**2)))
        legacy_tube('Soft sagging golden twine',cord,.012,legacy_crust,3)
        for index,x,tilt in [(0,-.263,-.18),(1,0,0),(2,.263,.17)]:
            z=.369 if index!=1 else .327
            backing=box('Hanging ivory Polaroid',(x,-.038,z),(.234,.014,.284),legacy_paper,.008);backing.rotation_euler.y=tilt
            # Shift the inset along each card's local upright axis, preserving its angle.
            centre=Vector((x,-.048,z))+Vector((math.sin(tilt)*.027,0,math.cos(tilt)*.027))
            legacy_photo('Hanging photo',centre,.184,.186,index=index,tilt=tilt)
            legacy_star('Rounded golden star photo clip',x,-.027,.510+.100*(x/.428)**2,.047,legacy_crust)
        for x in [-.417,.417]:torus('Twine loop on upright',(x,.029,.608),.029,.009,legacy_crust)
    elif asset=='frame':
        outline=[(x,z+.205) for x,z in legacy_scallops(.470,.345,.020,9,7)]
        legacy_profile('Golden scalloped biscuit frame',outline,0,.052,legacy_crust,.007)
        box('Cream biscuit image backing',(0,-.031,.205),(.357,.008,.260),legacy_paper,.012)
        legacy_photo('Biscuit picture',(0,-.036,.205),.345,.248,index=0)
        for x in [-.225,.225]:
            for z in [.041,.367]:legacy_ball('Four cream biscuit buttons',(x,-.031,z),(.015,.008,.015),legacy_cream,16,8)
        legacy_profile('Wooden frame easel leg',[(-.024,.009),(.024,.009),(.024,.173),(-.024,.173)],.104,.164,legacy_wood,.008)
    elif asset=='birdcage':
        legacy_lathe('Ivory domed bird perch foot',[(0,0),(.094,0),(.106,.014),(.103,.046),(.080,.074),(.043,.090),(0,.094)],legacy_cream)
        legacy_tube('Curved short oak songbird perch',[(-.141,.012,.181),(-.088,-.007,.157),(.025,-.003,.158),(.120,.010,.197)],.026,legacy_wood,5)
        body=legacy_ball('Pear-shaped ivory songbird',(0,.009,.301),(.104,.082,.132),legacy_cream,24,12);body.rotation_euler.y=.17
        legacy_ball('Rounded songbird head',(.036,-.008,.399),(.079,.071,.082),legacy_cream,24,12)
        for side in [-1,1]:
            wing=legacy_leaf('Sage songbird wing',(side*.066,-.038,.302),.115,.151,.016,legacy_sage,False);wing.rotation_euler.y=-side*.42;wing.rotation_euler.z=side*.45
        for x in [-.045,.018]:
            for dx in [-.012,0,.012]:legacy_tube('Rounded songbird grasping toe',[(x+dx,-.020,.192),(x+dx,-.037,.170),(x+dx,-.018,.157)],.006,legacy_cream,3)
        for j in range(2):
            tail=legacy_ball('Ivory songbird tail feather',(-.090-j*.013,.043,.269+j*.016),(.086,.032,.020),legacy_cream,16,8);tail.rotation_euler.y=.35
        legacy_ball('Honey yellow rounded songbird beak',(.078,-.073,.397),(.035,.030,.020),legacy_crust,16,8)
        legacy_ball('Songbird warm brown eye',(.045,-.075,.426),(.008,.005,.008),legacy_dark,12,6)
        legacy_ball('Songbird blush cheek',(.010,-.077,.392),(.018,.003,.018),legacy_pink,16,8)
    elif asset=='candles':
        footprint=legacy_outline([(-.146,-.106),(.144,-.106),(.121,-.057),(-.118,.106),(-.148,.091)],4)
        legacy_prism('Cake lower vanilla sponge',footprint,.008,.082,legacy_cream,.011)
        legacy_prism('Visible strawberry jam cake layer',footprint,.080,.112,legacy_jam,.007)
        legacy_prism('Cake upper vanilla sponge',footprint,.111,.184,legacy_cream,.010)
        legacy_prism('Rounded vanilla icing top',[(x*1.012,y*1.012) for x,y in footprint],.180,.216,legacy_paper,.013)
        icing=legacy_outline([(-.148,.210),(.146,.210),(.145,.176),(.115,.189),(.090,.175),(.071,.122),(.047,.125),(.035,.174),(-.010,.181),(-.043,.151),(-.072,.148),(-.104,.174),(-.145,.162)],3)
        legacy_profile('Soft icing drips across cake front',icing,-.106,.019,legacy_paper,.006)
        box('Ivory icing stripe down slice edge',(-.142,-.104,.099),(.019,.019,.187),legacy_paper,.008)
        berry=legacy_lathe('Red strawberry candle topper',[(0,0),(.027,0),(.037,.014),(.036,.038),(.027,.062),(.014,.080),(0,.086)],legacy_jam,28,(-.071,.019,.213))
        for j in range(9):
            angle=-math.pi/2+(j%3-1)*.48;z=.229+(j//3)*.019;r=.034-(j//3)*.004
            x=-.071+r*math.cos(angle);y=.019+r*math.sin(angle)
            legacy_cut(berry,'Strawberry seed dimple',(x,y,z),(.0026,.0026,.0036))
        wick=legacy_tube('Ivory candle wick with charred tip',[(.031,-.006,.213),(.034,-.006,.244)],.0038,legacy_cream,2)
        legacy_tube('Charred black wick tip',[(.034,-.006,.241),(.035,-.006,.254)],.0039,legacy_dark,2)
    elif asset=='star-frame':
        # The open wooden frame is a continuous rounded ring, not a solid board.
        outer=legacy_round_rect(.476,.440,.070,8);inner=legacy_round_rect(.371,.337,.047,8)
        n=len(outer);vertices=[]
        for y in [-.036,.036]:vertices.extend((x,y,z+.235) for x,z in outer);vertices.extend((x,y,z+.235) for x,z in inner)
        faces=[]
        for j in range(n):
            k=(j+1)%n;faces.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)])
        legacy_bevel(legacy_mesh('Rounded open oak star frame',vertices,faces,legacy_wood),.009)
        legacy_tube('Sage cord inside wood frame',[(-.189,-.006,.365),(-.090,-.012,.341),(0,-.014,.333),(.090,-.012,.341),(.189,-.006,.365)],.0065,legacy_sage)
        box('Cream hanging star-frame card',(0,-.028,.245),(.279,.012,.243),legacy_paper,.005)
        legacy_photo('Star-frame hanging photo',(0,-.035,.245),.230,.183,index=0)
        for x in [-.077,.077]:legacy_star('Two wooden star clips',x,-.022,.347,.035,legacy_wood)
        leg=box('Oak star-frame rear easel',(0,.104,.129),(.128,.034,.210),legacy_wood,.010);leg.rotation_euler.x=-.25
    elif asset in ['avocado-mug','avocado-mug-cutout']:
        body=legacy_cup('Hollow sage avocado mug',.149,.321,legacy_sage,legacy_avocado_inner)
        legacy_tube('Rounded avocado mug handle',[(.133,.014,.259),(.223,.014,.245),(.264,.014,.165),(.223,.014,.091),(.139,.014,.091)],.028,legacy_sage,5)
        if asset=='avocado-mug':
            legacy_ball('Raised golden avocado pit',(0,-.145,.143),(.064,.029,.075),legacy_pit,24,12)
        else:
            legacy_cut(body,'Real recessed pit cavity',(0,-.163,.143),(.064,.030,.075))
            pit=legacy_lathe('Concave golden avocado pit interior',[(0,-.020),(.017,-.019),(.033,-.016),(.049,-.010),(.061,0)],legacy_pit,32,flip=True)
            pit.rotation_euler.x=math.pi/2;pit.location=(0,-.160,.143);pit.scale.y=1.18
    elif asset=='succulent':
        legacy_cup('Ivory teacup succulent planter',.144,.222,legacy_cream,legacy_cream)
        legacy_tube('Ivory teacup handle',[(.128,.018,.174),(.207,.018,.163),(.239,.018,.108),(.207,.018,.057),(.132,.018,.057)],.024,legacy_cream,5)
        cyl('Succulent potting soil',(0,0,.191),.115,.009,legacy_soil)
        for x,z in [(-.079,.149),(.027,.080),(.093,.156)]:
            y=-math.sqrt(max(.0001,.139*.139-x*x))-.004
            for j in range(5):
                angle=j*math.tau/5;legacy_ball('Blush teacup flower stamp',(x+.008*math.cos(angle),y,z+.008*math.sin(angle)),(.005,.0025,.005),legacy_pink,12,6)
            legacy_ball('Flower stamp centre',(x,y-.001,z),(.004,.003,.004),legacy_cream,12,6)
        for row,count,radius,height,tilt,size in [(0,8,.068,.232,1.02,.110),(1,7,.044,.270,.78,.095),(2,5,.022,.305,.48,.075),(3,3,.008,.322,.22,.054)]:
            for j in range(count):
                angle=j*math.tau/count+row*.55
                leaf=legacy_leaf('Fleshy succulent rosette leaf',(radius*math.cos(angle),radius*math.sin(angle),height),size*.57,size,.013,legacy_sage,False)
                zaxis=Vector((math.cos(angle)*math.sin(tilt),math.sin(angle)*math.sin(tilt),math.cos(tilt)))
                xaxis=Vector((-math.sin(angle),math.cos(angle),0));yaxis=zaxis.cross(xaxis)
                leaf.rotation_euler=Matrix((xaxis,yaxis,zaxis)).transposed().to_euler()

    elif asset == 'rabbit':
        cozy_sphere('Lop rabbit pear shaped body',(0,.025,.185),(.12,.10,.165),cozy_fur)
        cozy_sphere('Rabbit round head',(0,-.022,.40),(.128,.108,.124),cozy_fur)
        for side in [-1,1]:
            ear=cozy_sphere('Long hanging lop ear',(side*.142,-.005,.394),(.044,.042,.151),cozy_fur)
            ear.rotation_euler.y=-side*.27
            lining=cozy_sphere('Lop ear inner fold',(side*.149,-.043,.394),(.025,.009,.116),white)
            lining.rotation_euler.y=-side*.27
            cozy_sphere('Rabbit forward foot',(side*.079,-.082,.053),(.051,.068,.058),cozy_fur)
            cozy_sphere('Rabbit little eye',(side*.043,-.125,.422),(.0065,.005,.0075),cozy_eye,12,6)
            cozy_sphere('Rabbit soft cheek',(side*.066,-.124,.392),(.020,.004,.012),cozy_blush,12,6)
        cozy_sphere('Rabbit cotton tail',(0,.12,.13),(.046,.043,.043),white)
        cozy_sphere('Rabbit tiny pink nose',(0,-.131,.40),(.009,.007,.007),cozy_blush,12,6)
        carrot=cozy_lathe('Rounded carrot held diagonally',[(0,0),(.016,.01),(.033,.05),(.049,.116),(.044,.15),(.025,.16),(0,.16)],cozy_orange,20)
        carrot.location=(-.012,-.148,.145);carrot.rotation_euler.y=-.52
        for j in range(3):
            direction=(-.08+j*.035,.012,.10-j*.01)
            cozy_leaf('Carrot leaf',(-.109+j*.018,-.137,.324+j*.024),direction,.109,.048,cozy_leaf_green)
        cozy_tube('Carrot stem',[(-.093,-.147,.279),(-.104,-.140,.337)],.006,cozy_leaf_green)
        arm=cozy_sphere('Rabbit hand wrapped around carrot',(.037,-.15,.265),(.075,.032,.034),cozy_fur)
        arm.rotation_euler.y=.18
        arm=cozy_sphere('Rabbit hand on carrot shoulder',(-.103,-.125,.281),(.042,.039,.044),cozy_fur)
        arm.rotation_euler.y=-.42

    elif asset == 'teddy':
        cozy_sphere('Teddy seated body',(0,.018,.16),(.13,.102,.13),cozy_honey)
        cozy_sphere('Teddy honey round head',(0,-.006,.411),(.132,.109,.128),cozy_honey)
        for side in [-1,1]:
            cozy_sphere('Round teddy ear',(side*.104,.002,.502),(.052,.041,.054),cozy_honey)
            cozy_sphere('Teddy ear hollow',(side*.104,-.037,.502),(.029,.009,.031),cozy_wood_edge)
            cozy_sphere('Teddy foot',(side*.086,-.083,.056),(.061,.068,.056),cozy_honey)
            cozy_sphere('Teddy dark eye',(side*.043,-.108,.426),(.007,.006,.008),cozy_eye,12,6)
        cozy_sphere('Teddy ivory muzzle',(0,-.114,.390),(.046,.019,.041),white)
        cozy_sphere('Teddy nose',(0,-.135,.403),(.011,.007,.008),cozy_eye,12,6)
        cozy_face_arc('Teddy smile',(0,-.135,.382),.022,.005,cozy_eye,True,.0014)
        cozy_lathe('Rib knit sweater body',[(.08,.157),(.117,.170),(.126,.20),(.124,.270),(.105,.315),(.08,.338)],cozy_green,48,
            lambda r,z,a:(r*(1+.015*math.cos(a*24)),z))
        for side in [-1,1]:
            sleeve=cozy_sphere('Teddy knitted sleeve',(side*.129,.001,.259),(.048,.068,.08),cozy_green)
            sleeve.rotation_euler.y=side*.35
            cozy_sphere('Teddy exposed paw',(side*.149,-.016,.19),(.038,.044,.034),cozy_honey)
            collar=cozy_sphere('Peter Pan sweater collar',(side*.035,-.084,.327),(.045,.020,.025),cozy_green)
            collar.rotation_euler.y=side*.26
        for j in range(19):
            x=-.108+j*.012
            points=[]
            for k in range(9):
                z=.177+k*.017
                r=.124 if z<.28 else .124-(z-.28)*.6
                y=-math.sqrt(max(.0002,r*r-x*x))-.001
                points.append((x,y,z))
            cozy_tube('Vertical sweater knit rib',points,.0019,cozy_green_dark,6)
        for z,r in [(.177,.118),(.327,.085)]:
            cozy_tube('Sweater hem and neckline',[(r*math.cos(a),r*math.sin(a),z) for a in [i*math.tau/40 for i in range(40)]],.0045,cozy_green,8,True)

    elif asset == 'cloud-lamp':
        contour=cozy_closed_spline([(-.25,.052),(-.28,.102),(-.266,.176),(-.219,.215),(-.197,.271),(-.135,.303),(-.08,.31),(-.025,.36),(.037,.37),(.100,.332),(.134,.286),(.18,.281),(.23,.231),(.24,.174),(.275,.122),(.263,.069),(.217,.040),(-.16,.036)],4)
        cozy_prism('Continuous rounded cloud lamp',contour,-.105,.105,white,.034,'XZ')
        for side in [-1,1]:
            cozy_face_arc('Cloud closed sleepy eye',(side*.062,-.109,.183),.031,.014,cozy_wood_edge,True,.0021)
            cozy_sphere('Cloud blush cheek',(side*.08,-.109,.145),(.024,.003,.013),cozy_blush,12,6)

    elif asset == 'honey-candle':
        cozy_jar('Transparent squat honey candle jar',.15,.28,cozy_honey_glass)
        cozy_lathe('Golden wax inside glass',[(0,.02),(.132,.02),(.137,.045),(.137,.18),(.128,.218),(0,.218)],cozy_amber,32)
        for z,r in [(.245,.128),(.270,.135),(.012,.143)]:
            cozy_tube('Glass lip and base highlight',[(r*math.cos(a),r*math.sin(a),z) for a in [i*math.tau/40 for i in range(40)]],.004,cozy_honey_glass,8,True)
        cozy_lathe('Gingham fabric neck ribbon',[(.145,.207),(.146,.237),(.141,.237),(.140,.207)],white,32)
        for row in range(2):
            for j in range(24):
                if (j+row)%2: continue
                a,b=j*math.tau/24,(j+1)*math.tau/24
                lo,hi=.208+row*.014,.208+(row+1)*.014
                v=[(r*math.cos(t),r*math.sin(t),z) for r in [.146,.147] for z in [lo,hi] for t in [a,b]]
                cozy_mesh('Sage gingham woven square',v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],cozy_green,False)
        cozy_tube('Jar neck twine',[(.148*math.cos(a),.148*math.sin(a),.219) for a in [i*math.tau/40 for i in range(40)]],.0028,cozy_twine,8,True)
        for side in [-1,1]:
            points=cozy_bezier([(0,-.153,.219),(side*.068,-.16,.247),(side*.073,-.16,.193),(0,-.154,.217)],14)
            cozy_tube('Twine bow loop',points,.0028,cozy_twine,6)
            cozy_tube('Twine bow tail',cozy_bezier([(0,-.154,.218),(side*.012,-.161,.172),(side*.035,-.158,.133)],12),.0028,cozy_twine,6)
        cozy_tube('Single unlit candle wick',[(0,0,.216),(0,0,.236)],.0022,cozy_eye,6)

    elif asset == 'turntable':
        box('Sage rounded turntable housing',(0,0,.083),(.55,.42,.15),cozy_green,.038)
        for side in [-1,1]:
            box('Pale wood side cheek',(side*.263,0,.081),(.027,.40,.137),oak,.012)
        cyl('Black vinyl record',(-.035,.015,.164),.175,.012,cozy_eye)
        for radius in [.067,.082,.099,.117,.135,.153,.169]:
            cozy_tube('Actual vinyl groove',[(-.035+radius*math.cos(a),.015+radius*math.sin(a),.171) for a in [i*math.tau/40 for i in range(40)]],.00065,dark,6,True)
        cyl('Honey coloured record label',(-.035,.015,.172),.048,.005,cozy_honey)
        cyl('Record spindle',(-.035,.015,.181),.007,.014,cozy_honey)
        pivot=cyl('Tonearm round rear pivot',(.161,.139,.192),.025,.023,cozy_honey);pivot.rotation_euler.x=math.pi/2
        cozy_tube('Curved S shaped tonearm',cozy_bezier([(.161,.14,.201),(.264,.081,.21),(.187,.025,.205),(.115,-.019,.181)],20),.011,cozy_honey,10)
        box('Tonearm cartridge',(.111,-.024,.177),(.037,.023,.024),cozy_honey,.009)
        for x in [.135,.208]:
            knob=cyl('Ivory front control knob',(x,-.215,.079),.024,.018,white);knob.rotation_euler.x=math.pi/2
            cozy_tube('Knob indicator',[(x,-.226,.079),(x,-.226,.093)],.0011,cozy_wood_edge,6)

    elif asset == 'camera':
        box('Blush instant camera rounded body',(0,.012,.172),(.335,.18,.289),cozy_blush,.038)
        box('Sage sculpted hand grip',(-.120,-.083,.173),(.079,.067,.222),cozy_green,.029)
        for radius,y,depth,material in [(.103,-.105,.055,white),(.078,-.143,.027,cozy_piping),(.045,-.161,.017,cozy_eye),(.029,-.172,.006,dark)]:
            lens=cyl('Layered circular camera lens',(0,y,.185),radius,depth,material);lens.rotation_euler.x=math.pi/2
        cozy_tube('Lens engraved inner ring',[(.059*math.cos(a),-.161,.185+.059*math.sin(a)) for a in [i*math.tau/32 for i in range(32)]],.0016,cozy_wood_edge,6,True)
        shutter=cyl('Gold top shutter',(-.109,-.025,.323),.019,.011,cozy_honey)
        button=cyl('Little gold camera button',(-.072,-.087,.29),.012,.012,cozy_honey);button.rotation_euler.x=math.pi/2
        box('Top ivory film switch',(.045,.03,.322),(.041,.020,.013),white,.005)
        box('Side strap anchor',(.172,.01,.27),(.018,.027,.009),white,.004)
        box('Dark film output slot',(0,-.085,.060),(.214,.015,.016),cozy_eye,.005)
        photo=box('Ejected instant photo border',(0,-.166,.043),(.216,.188,.012),paper,.006);photo.rotation_euler.x=.17
        inset=box('Blank instant photo centre',(0,-.155,.052),(.18,.132,.003),white,.002);inset.rotation_euler.x=.17

    elif asset == 'daisy-rug':
        petal_contour=cozy_round_rect(.48,.235,.117,7)
        for j in range(12):
            angle=j*math.tau/12
            contour=[((x+.407)*math.cos(angle)-y*math.sin(angle),(x+.407)*math.sin(angle)+y*math.cos(angle)) for x,y in petal_contour]
            cozy_prism('Flat padded daisy rug petal',contour,.002,.027,white,.006)
            cozy_tube('Petal sewn perimeter',[(x,y,.013) for x,y in contour],.0021,cozy_piping,6,True)
        cozy_lathe('Flat mustard flower centre',[(0,.021),(.215,.021),(.235,.027),(.228,.035),(0,.035)],cozy_yellow,40)

    elif asset == 'fern':
        cozy_lathe('Squat sage rounded fern pot',[(0,0),(.11,0),(.14,.016),(.155,.059),(.157,.111),(.148,.176),(.146,.196),(0,.196)],cozy_green,32)
        cozy_tube('Broad ivory pot rim',[(.151*math.cos(a),.151*math.sin(a),.191) for a in [i*math.tau/40 for i in range(40)]],.019,white,10,True)
        cyl('Visible fern soil',(0,0,.192),.132,.007,dark)
        fronds=[((-.025,0,.197),(-.06,.012,.38),(-.24,.01,.435)),((-.01,.01,.197),(-.02,.04,.48),(-.15,.07,.565)),((0,.015,.197),(.035,.038,.50),(.17,.047,.60)),((.025,0,.197),(.075,.00,.42),(.26,-.012,.454)),((.018,-.022,.197),(.06,-.12,.34),(.17,-.14,.385)),((-.028,-.014,.197),(-.08,-.07,.32),(-.17,-.13,.327))]
        for index,controls in enumerate(fronds):
            points=cozy_bezier(controls,18)
            cozy_tube('Curved fern frond stem',points,.0036,cozy_green_dark,6)
            for j in range(4,18,3):
                p=Vector(points[j]);tangent=(Vector(points[j+1])-Vector(points[j-1])).normalized()
                sideways=Vector((-tangent.z*.8,.25 if index%2 else -.25,tangent.x*.8)).normalized()
                for side in [-1,1]:
                    direction=(side*sideways+tangent*.38).normalized()
                    length=.058 if j<15 else .041
                    centre=p+direction*length*.39
                    cozy_leaf('Paired rounded fern leaflet',tuple(centre),tuple(direction),length,.030 if j<15 else .021)
            cozy_leaf('Fern tip leaflet',points[-1],tuple(Vector(points[-1])-Vector(points[-3])),.040,.025)

    elif asset == 'vine':
        cozy_lathe('Cream vine planter',[(0,0),(.112,0),(.140,.019),(.148,.074),(.145,.186),(.132,.231),(0,.231)],white,32)
        cozy_tube('Rolled sage planter lip',[(.137*math.cos(a),.137*math.sin(a),.236) for a in [i*math.tau/40 for i in range(40)]],.016,cozy_green,10,True)
        cyl('Vine soil',(0,0,.232),.120,.007,dark)
        path=cozy_bezier([(.01,0,.234),(.079,-.014,.361),(.184,-.071,.32),(.166,-.129,.215)],18)
        path+=cozy_bezier([(.166,-.129,.215),(.160,-.147,.129),(.181,-.170,.070),(.115,-.176,.030)],16)[1:]
        cozy_tube('Continuous trailing vine',path,.009,cozy_green,8)
        for j in [4,8,12,17,21,25,29,32]:
            p=Vector(path[j]);side=-1 if j%2 else 1
            direction=Vector((side*.075,-.025,.025 if j<18 else -.035)).normalized()
            centre=p+direction*.031
            cozy_leaf('Trailing heart shaped vine leaf',tuple(centre),tuple(direction),.074 if j<22 else .06,.061 if j<22 else .052,cozy_leaf_green,True)
        cozy_leaf('Upright vine new leaf',(-.009,-.021,.322),(-.06,0,.08),.095,.067,cozy_leaf_green,True)

    elif asset == 'cushion':
        def cushion_dents(r,z,a):
            dent=.010*(.5+.5*math.cos(10*a))*math.exp(-((r-.13)/.095)**2) if z>.165 else 0
            return r,z-dent
        cozy_lathe('Tufted round floor cushion',[(0,.006),(.263,.006),(.303,.02),(.324,.065),(.325,.125),(.312,.166),(.275,.204),(.195,.220),(.11,.204),(.027,.173),(0,.172)],cozy_green,64,cushion_dents)
        for radius,z in [(.319,.145),(.302,.024)]:
            cozy_tube('Cream cushion piping',[(radius*math.cos(a),radius*math.sin(a),z) for a in [i*math.tau/64 for i in range(64)]],.0035,cozy_piping,8,True)
        cozy_tube('Recessed centre tuft stitch',[(.014*math.cos(a),.014*math.sin(a),.173) for a in [i*math.tau/24 for i in range(24)]],.002,cozy_green_dark,6,True)

    elif asset == 'shelf':
        box('Flat rounded wall shelf top',(0,0,.199),(1,.35,.042),oak,.012)
        # One continuous scalloped apron, rather than a row of floating spheres.
        contour=[(-.5,.199),(-.5,.114)]
        contour += [(-.5+t,.111-.033*(1-math.cos(t*math.tau*6))/2) for t in [i/72 for i in range(73)]]
        contour += [(.5,.199)]
        cozy_prism('Continuous scalloped shelf apron',contour,-.174,-.139,oak,.008,'XZ')
        box('Wall shelf rear attachment',(0,.142,.109),(.94,.064,.185),oak,.012)
        for side in [-1,1]:
            bracket=[(side*.334-.032,.013),(side*.334+.032,.013),(side*.334+.039,.158),(side*.334-.039,.158)]
            cozy_prism('Rounded shelf underside bracket',bracket,-.113,.116,oak,.016,'XZ')

    elif asset == 'sofa':
        for side in [-1,1]:
            for y in [-.23,.22]:
                box('Small rounded oak sofa foot',(side*.642,y,.044),(.112,.101,.088),oak,.018)
        box('Rounded blush sofa base',(0,-.005,.174),(1.60,.69,.169),cozy_blush,.071)
        for side in [-1,1]:
            box('Soft upholstered sofa arm',(side*.706,-.009,.407),(.238,.71,.477),cozy_blush,.101)
        box('Broad cream upholstered back',(0,.221,.529),(1.388,.214,.542),white,.101)
        for side in [-1,1]:
            box('Separate cream seat cushion',(side*.315,-.065,.313),(.62,.499,.150),white,.065)
            contour=cozy_round_rect(.592,.472,.093,6)
            cozy_tube('Sofa cushion side seam',[(x+side*.315,y-.065,.297) for x,y in contour],.0025,cozy_piping,6,True)

    elif asset == 'coffee-table':
        outline=cozy_closed_spline([(-.54,-.04),(-.46,-.239),(-.14,-.31),(.13,-.254),(.45,-.213),(.569,-.039),(.477,.185),(.13,.302),(-.25,.284),(-.49,.158)],6)
        cozy_prism('Bean outline flat oak tabletop',outline,.310,.370,oak,.012)
        cozy_prism('Bean tabletop underside apron',[(x*.925,y*.91) for x,y in outline],.269,.315,oak,.014)
        for x,y in [(-.37,-.149),(.334,-.124),(.17,.191)]:
            points=cozy_bezier([(x*1.04,y*1.06,0),(x,y,.19),(x*.94,y*.95,.308)],10)
            cozy_tube('Rounded tapered bean table leg',points,[.035+i*.0018 for i in range(11)],oak,12)

    elif asset == 'bistro-table':
        cozy_lathe('Flat round oak bistro top',[(0,.568),(.510,.568),(.541,.577),(.550,.594),(.550,.615),(.532,.630),(0,.630)],oak,48)
        foot=[((.181+.042*math.cos(4*a))*math.cos(a),(.181+.042*math.cos(4*a))*math.sin(a)) for a in [i*math.tau/64 for i in range(64)]]
        cozy_prism('Soft clover pedestal foot',foot,0,.079,white,.025)
        cozy_lathe('Ivory pedestal with curved base',[(0,.04),(.126,.04),(.104,.089),(.081,.14),(.078,.50),(.086,.55),(.119,.572),(0,.572)],white,32)

    elif asset == 'chair':
        for x in [-.168,.168]:
            for y in [-.166,.166]:
                points=cozy_bezier([(x*1.055,y*1.055,0),(x,y,.20),(x*.97,y*.97,.373)],10)
                cozy_tube('Tapered chair leg',points,[.020+i*.0010 for i in range(11)],oak,10)
        cozy_lathe('Circular oak seat frame',[(0,.333),(.207,.333),(.235,.349),(.233,.380),(.211,.391),(0,.391)],oak,40)
        cozy_lathe('Rounded sage seat pad',[(0,.384),(.194,.384),(.207,.399),(.200,.427),(.176,.436),(0,.437)],cozy_green,40)
        for side in [-1,1]:
            cozy_tube('Chair back upright',[(side*.168,.149,.365),(side*.177,.164,.55),(side*.178,.156,.69)],.021,oak,10)
        verts=[];faces=[];count=33
        for radius,z in [(.207,.582),(.253,.582),(.207,.73),(.253,.73)]:
            for j in range(count):
                a=math.radians(12+j*156/(count-1))
                verts.append((radius*math.cos(a),radius*math.sin(a)-.017,z))
        for j in range(count-1):
            k=j+1
            faces += [(j,k,count+k,count+j),(2*count+j,3*count+j,3*count+k,2*count+k),(j,2*count+j,2*count+k,k),(count+j,count+k,3*count+k,3*count+j)]
        faces += [(0,count,3*count,2*count),(count-1,3*count-1,4*count-1,2*count-1)]
        cozy_soften(cozy_mesh('Actually curved wraparound chair back',verts,faces,oak,False),.013)

    elif asset == 'cubby':
        # D45 is four rounded compartments. R03's low capsule console is distinct.
        cozy_frame_ring('Continuous rounded cubby outer shell',(1.2,.704),(1.070,.582),.083,.032,.046,-.225,.225,oak)
        box('Inset cream cubby backing',(0,.202,.395),(1.073,.029,.59),ivory,.023)
        box('Thin cubby horizontal shelf',(0,-.008,.394),(1.083,.423,.047),oak,.009)
        box('Thin cubby centre divider',(0,-.008,.397),(.047,.421,.592),oak,.009)
        for side in [-1,1]:
            box('Small cubby foot',(side*.458,.015,.025),(.103,.28,.050),oak,.016)

    elif asset == 'desk':
        outline=cozy_closed_spline([(-.788,-.187),(-.690,-.292),(-.37,-.251),(0,-.202),(.38,-.265),(.691,-.289),(.80,-.192),(.792,.204),(.696,.292),(-.702,.292),(-.8,.197)],5)
        cozy_prism('Curved writing desk flat top',outline,.564,.63,oak,.015)
        for x in [-.695,.695]:
            for y in [-.223,.220]:
                points=cozy_bezier([(x*1.022,y*1.035,0),(x*.997,y,.32),(x*.918,y*.91,.565)],14)
                cozy_tube('Gently curved tapered desk leg',points,[.025+i*.0014 for i in range(15)],oak,12)
        for side in [-1,1]:
            box('Side desk apron',(side*.674,.008,.492),(.065,.455,.155),oak,.014)
        front=[(x,y) for x,y in outline if y<-.19]
        front=sorted(front)
        if len(front)>2:
            apron=front+[(x,y+.042) for x,y in reversed(front)]
            cozy_prism('Curved desk front apron',apron,.502,.571,oak,.008)
        box('Oak drawer casing',(.457,-.006,.467),(.463,.475,.195),oak,.022)
        box('Inset sage drawer',(.457,-.254,.464),(.397,.020,.145),cozy_green,.012)
        box('Fine cream drawer rim',(.457,-.245,.464),(.425,.013,.17),cozy_wood_edge,.014)
        cozy_sphere('Ivory rounded drawer knob',(.457,-.278,.464),(.018,.015,.018),white,16,8)

    elif asset == 'capybara':
        cozy_sphere('Capybara low reclining body',(.092,.035,.158),(.204,.121,.143),cozy_honey)
        cozy_sphere('Capybara broad head',(-.133,-.018,.236),(.150,.122,.140),cozy_honey)
        cozy_sphere('Capybara squared soft muzzle',(-.173,-.111,.218),(.094,.046,.092),cozy_wood_edge)
        for side in [-1,1]:
            cozy_sphere('Capybara forward resting paw',(-.095+side*.072,-.092,.040),(.070,.078,.040),cozy_honey)
            cozy_sphere('Capybara rear haunch',(.229,side*.078,.093),(.073,.047,.081),cozy_honey)
            cozy_sphere('Capybara little rounded ear',(-.141+side*.079,.002,.346),(.033,.023,.039),cozy_honey)
            cozy_sphere('Capybara ear hollow',(-.141+side*.079,-.020,.347),(.016,.005,.022),cozy_wood_edge,12,6)
            cozy_sphere('Capybara nostril',(-.175+side*.029,-.156,.240),(.006,.004,.004),cozy_twine,12,6)
        cozy_face_arc('Sleeping capybara eye',(-.071,-.116,.271),.027,.010,cozy_eye,True,.0026)
        cozy_face_arc('Capybara gentle mouth',(-.173,-.158,.173),.064,.008,cozy_twine,True,.0018)
        cozy_tube('Capybara muzzle centre seam',[(-.173,-.16,.219),(-.173,-.163,.178)],.0018,cozy_twine,6)
        cozy_sphere('Tiny orange on capybara head',(-.148,.002,.407),(.047,.044,.045),cozy_orange)
        cozy_tube('Orange stem',[(-.149,.002,.439),(-.155,.004,.468)],.009,cozy_green,8)
        cozy_leaf('Orange leaf',(-.107,.004,.457),(.10,0,.026),.095,.058)

    elif asset == 'corgi':
        for side in [-1,1]:
            cozy_sphere('Corgi rump cushion lobe',(side*.148,0,.142),(.189,.233,.14),cozy_honey,28,12)
        cozy_sphere('White corgi cushion centre seam',(0,-.125,.102),(.046,.119,.096),white)
        outline=cozy_closed_spline([(-.123,.119),(-.077,.157),(-.014,.129),(.041,.154),(.112,.133),(.142,.082),(.093,.012),(.043,-.074),(.024,-.208),(-.027,-.217),(-.049,-.072),(-.116,.026)],4)
        vertices=[]
        for offset in [0,.006]:
            for x,y in [(0,0)]+outline:
                height=max(.115+.141*math.sqrt(max(.005,1-((x-side*.148)/.189)**2-(y/.233)**2)) for side in [-1,1])
                vertices.append((x,y,height+offset))
        n=len(outline)+1;faces=[]
        for j in range(1,n):
            k=1+j%(n-1)
            faces += [(n,n+j,n+k),(0,k,j),(j,k,n+k,n+j)]
        cozy_mesh('Raised white heart marking on corgi cushion',vertices,faces,white)
        for side in [-1,1]:
            cosy_seam=[]
            for j in range(40):
                a=j*math.tau/40
                cosy_seam.append((side*.148+.180*math.cos(a),.216*math.sin(a),.087))
            cozy_tube('Corgi cushion sewn seam',cosy_seam,.0019,cozy_wood_edge,6,True)
        cozy_sphere('Corgi small tail nub',(0,.181,.295),(.029,.026,.037),cozy_honey)

    elif asset == 'shiba':
        cozy_sphere('Seated shiba torso',(0,.029,.242),(.113,.108,.183),cozy_honey)
        cozy_sphere('Shiba round head',(0,-.024,.431),(.140,.119,.129),cozy_honey)
        cozy_sphere('Cream shiba chest',(0,-.073,.236),(.074,.040,.135),white)
        for side in [-1,1]:
            ear=[(side*.100-.041,.477),(side*.100+.043,.486),(side*.100+.026,.597),(side*.100-.002,.608)]
            cozy_prism('Rounded triangular shiba ear',ear,-.030,.041,cozy_honey,.012,'XZ')
            inner=[(side*.101-.025,.498),(side*.101+.025,.501),(side*.101+.015,.580)]
            cozy_prism('Soft pink inner shiba ear',inner,-.043,-.035,cozy_blush,.005,'XZ')
            cozy_sphere('Shiba seated back thigh',(side*.103,.059,.115),(.061,.083,.108),cozy_honey)
            cozy_sphere('Shiba front leg',(side*.064,-.083,.124),(.033,.039,.112),cozy_honey)
            cozy_sphere('Shiba front paw',(side*.064,-.101,.033),(.041,.052,.033),cozy_honey)
            cozy_sphere('Cream shiba cheek',(side*.050,-.126,.394),(.075,.037,.052),white)
            cozy_face_arc('Shiba happy closed eye',(side*.051,-.130,.453),.026,.008,cozy_eye,False,.003)
            eyebrow=cozy_sphere('Shiba cream eyebrow',(side*.054,-.122,.481),(.019,.005,.008),white,12,6);eyebrow.rotation_euler.y=side*.2
        cozy_sphere('Shiba dark nose',(0,-.172,.410),(.021,.016,.016),cozy_eye)
        tail=[(-.118+.061*math.cos(a),.103,.151+.066*math.sin(a)) for a in [math.radians(15+i*270/24) for i in range(25)]]
        cozy_tube('Curled shiba tail',tail,.025,cozy_honey,10)
        letter=box('Pink envelope held by shiba',(0,-.170,.330),(.178,.018,.114),cozy_blush,.008)
        cozy_prism('Envelope folded triangular flap',[(-.086,.384),(.086,.384),(0,.337)],-.183,-.179,cozy_blush,.002,'XZ')
        cozy_tube('Envelope diagonal fold left',[(-.081,-.185,.283),(-.035,-.185,.329)],.0012,rose,6)
        cozy_tube('Envelope diagonal fold right',[(.081,-.185,.283),(.035,-.185,.329)],.0012,rose,6)

    elif asset in ['duck','duckling']:
        small=asset=='duckling'
        cozy_sphere('Round yellow duck body',(0,.016,.206),(.146,.142,.159),cozy_yellow)
        cozy_sphere('Duck round head',(0,-.039,.407),(.119,.113,.126),cozy_yellow)
        cozy_sphere('Duck rising rear tail',(0,.124,.258),(.075,.071,.086),cozy_yellow)
        for side in [-1,1]:
            cozy_sphere('Duck cream wing',(side*.130,.026,.23),(.026,.087,.078),white)
            for j in range(3):
                feather=cozy_sphere('Wing rounded feather',(side*.129,.077+j*.012,.236-j*.024),(.020,.044,.025),white,16,8)
                feather.rotation_euler.x=.2
            foot_material=cozy_bill if small else cozy_yellow
            cozy_sphere('Duck little webbed foot',(side*.055,-.017,.03),(.048,.062,.030),foot_material)
            for toe in [-1,0,1]:
                cozy_sphere('Duck rounded toe',(side*.055+toe*.021,-.061,.021),(.018,.026,.017),foot_material,12,6)
            cozy_sphere('Duck bright eye',(side*.064,-.129,.435),(.010,.007,.011) if small else (.008,.006,.009),cozy_eye,12,6)
        cozy_sphere('Duck upper flat orange bill',(0,-.16,.392),(.065,.064,.021),cozy_bill)
        cozy_sphere('Duck lower bill lip',(0,-.163,.375),(.059,.06,.011),cozy_bill)
        cozy_tube('Duck bill separation',[(-.047,-.195,.380),(0,-.221,.379),(.047,-.195,.380)],.0017,rose,6)

    elif asset == 'penguin':
        cozy_lathe('Plush penguin egg silhouette',[(0,.011),(.097,.011),(.145,.038),(.17,.12),(.165,.27),(.143,.405),(.098,.49),(.040,.532),(0,.54)],cozy_grey,40)
        cozy_sphere('Cream penguin rounded belly',(0,-.119,.232),(.118,.051,.180),white,24,12)
        for side in [-1,1]:
            cozy_sphere('Cream penguin face lobe',(side*.057,-.106,.384),(.065,.042,.095),white)
            fin=cozy_sphere('Long soft penguin flipper',(side*.167,.008,.231),(.046,.033,.137),cozy_grey)
            fin.rotation_euler.y=-side*.37
            cozy_sphere('Penguin mustard foot',(side*.075,-.085,.036),(.055,.046,.039),cozy_yellow)
            cozy_sphere('Penguin round dark eye',(side*.049,-.144,.398),(.008,.006,.009),cozy_eye,12,6)
        cozy_sphere('Penguin little mustard beak',(0,-.158,.372),(.026,.025,.015),cozy_honey)
        cozy_tube('Penguin stitched crown seam',cozy_bezier([(0,-.128,.4),(0,-.116,.535),(0,.025,.537)],18),.0015,cozy_grey,6)

    elif asset == 'pear-lamp':
        cozy_lathe('Pear lamp sculpted pear body',[(0,0),(.088,0),(.128,.014),(.152,.067),(.155,.145),(.134,.235),(.111,.326),(.099,.38),(.071,.407),(0,.412)],cozy_pear,40)
        stem=cozy_tube('Bent pear stem',cozy_bezier([(0,0,.4),(.012,0,.464),(-.022,0,.49)],12),.017,cozy_honey,10)
        cozy_leaf('Pear lamp green leaf',(.060,.002,.455),(.12,.01,.035),.12,.079)
        for side in [-1,1]:
            cozy_sphere('Pear lamp dot eye',(side*.040,-.117,.262),(.006,.004,.007),cozy_wood_edge,12,6)
            cozy_sphere('Pear lamp blush',(side*.066,-.113,.235),(.018,.003,.012),cozy_blush,12,6)

    elif asset == 'orange-lamp':
        cozy_lathe('Round orange lamp with flat base',[(0,0),(.082,0),(.130,.018),(.171,.080),(.180,.168),(.165,.251),(.120,.299),(.063,.315),(0,.319)],cozy_orange,40)
        cozy_tube('Orange lamp green stalk',cozy_bezier([(0,0,.306),(-.005,0,.355),(-.023,0,.385)],12),.018,cozy_green,10)
        cozy_leaf('Orange lamp upper leaf',(.060,.016,.365),(.14,.016,.04),.13,.070)
        cozy_leaf('Orange lamp lower leaf',(.07,-.012,.330),(.13,-.015,-.028),.125,.074)
        for side in [-1,1]:
            cozy_sphere('Orange lamp dot eye',(side*.037,-.169,.185),(.006,.004,.007),cozy_wood_edge,12,6)
            cozy_sphere('Orange lamp blush',(side*.061,-.164,.159),(.017,.003,.011),cozy_blush,12,6)
        cozy_sphere('Orange lamp tiny smile dot',(0,-.180,.171),(.005,.003,.0035),cozy_wood_edge,12,6)

    elif asset == 'snow-globe':
        cozy_lathe('Rounded wooden snow globe base',[(0,0),(.190,0),(.214,.014),(.216,.035),(.204,.099),(.182,.116),(0,.116)],oak,40)
        cozy_lathe('Snow scene circular platform',[(0,.109),(.17,.109),(.181,.124),(.169,.145),(0,.145)],white,40)
        profile=[]
        for radius,reverse in [(.224,False),(.220,True)]:
            angles=[math.radians(153-i*153/24) for i in range(25)]
            if reverse:angles.reverse()
            profile += [(radius*math.sin(a),.325+radius*math.cos(a)) for a in angles]
        cozy_lathe('Clear real glass snow globe shell',profile,cozy_clear_glass,40)
        box('Miniature cream house',(-.048,-.050,.200),(.111,.097,.116),white,.009)
        gable=[(-.105,.244),(.009,.244),(-.048,.301)]
        cozy_prism('Miniature gable',gable,-.1,-.001,white,.003,'XZ')
        for side in [-1,1]:
            roof=box('Pink miniature pitched roof',(-.048+side*.039,-.047,.279),(.099,.12,.014),cozy_blush,.005);roof.rotation_euler.y=side*math.radians(38)
        box('Miniature chimney',(-.083,-.008,.281),(.019,.022,.062),white,.004)
        box('Miniature arched door',(-.050,-.102,.169),(.023,.008,.048),oak,.009)
        box('Miniature side window',(.011,-.024,.209),(.007,.020,.026),cozy_wood_edge,.003)
        for x,y,height in [(.055,.05,.280),(.126,.036,.235)]:
            cyl('Tree trunk inside globe',(x,y,.172),.015,.060,oak)
            for j in range(3):
                base=.168+j*height*.23
                radius=.048-j*.009
                tree=cozy_lathe('Soft layered evergreen',[(0,base),(radius*.7,base),(radius,base+.011),(radius*.89,base+.030),(radius*.54,base+height*.22),(0,base+height*.31)],cozy_green,24)
                tree.location.x=x;tree.location.y=y
        for x,y in [(-.115,-.089),(-.088,.062),(.026,-.11),(.124,-.06),(.081,-.09),(-.121,.027)]:
            cozy_sphere('Little snow pebble',(x,y,.153),(.009,.008,.009),white,12,6)

    elif asset == 'star-jar':
        cozy_jar('Open clear paper star jar',.170,.320)
        stars=[(-.084,-.066,.040,.048,cozy_blush),(.021,-.088,.039,.051,white),(.086,-.04,.06,.05,white),(-.071,.026,.076,.054,cozy_green),(.071,.055,.088,.055,cozy_green),(0,-.005,.086,.057,cozy_blush),(.025,.063,.132,.049,cozy_honey),(-.114,-.013,.049,.037,cozy_green),(.111,.024,.041,.033,cozy_honey)]
        for j,(x,y,z,r,material) in enumerate(stars):
            cozy_star('Puffed folded paper star',(x,y,z),r,material,(.12+j*.31,.16+j*.17,j*.82))

    elif asset == 'crane-jar':
        cozy_jar('Open clear origami crane jar',.180,.380)
        cozy_crane('Ivory origami crane',(-.077,-.036,.024),.12,white,-.35)
        cozy_crane('Pink origami crane',(.075,-.04,.022),.12,cozy_blush,.25)
        cozy_crane('Sage origami crane',(.006,.067,.044),.145,cozy_green,.1)

    elif asset == 'pinecone':
        cozy_sphere('Dark pine cone inner core',(0,0,.132),(.177,.077,.083),cozy_pine)
        for row in range(6):
            x=-.152+row*.057
            radius=.086*math.sqrt(max(.14,1-(x/.206)**2))
            for j in range(8):
                angle=j*math.tau/8+row*.38
                centre=(x,radius*math.cos(angle),.132+radius*math.sin(angle))
                direction=(-.45,math.cos(angle),math.sin(angle))
                leaf=cozy_leaf('Overlapping curved pine cone scale',centre,direction,.099,.064,cozy_pine_light if (row+j)%3 else cozy_pine)
                leaf.scale.z=2.2
        stem=cozy_tube('Short woody pine cone stem',[(.15,0,.132),(.236,0,.136)],.025,cozy_pine,10)

    root['referenceId']=meta['referenceId'];root['category']=meta['category'];root['editable']=True
    bpy.context.view_layer.update();normalize_asset(root,meta['dimensions']);merge_static(root);normalize_asset(root,meta['dimensions'])
def export(root,name):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
    triangles=0
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    return {'file':name,'bytes':(OUT/name).stat().st_size,'triangles':triangles}

assert len(assets)==46 and len({a['assetId'] for a in assets})==46
reports=[export(house,'memory-house.glb'),export(library,'decorations.glb')]
assert all(r['triangles']<220000 and r['bytes']<8_000_000 for r in reports),reports
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

# Render a furnished preview from separate model instances, never baked in shell.
preview=[]
for room in json.loads((ART/'cozy-layout.json').read_text(encoding='utf-8')):
    for decoration in room['decorations']:
        original=next(a for a in assets if a['assetId']==decoration['item'])
        group=empty('Preview '+decoration['id'])
        x,y,z=decoration['position'];group.location=(x,-z,y)
        scale=decoration['scale'];group.scale=scale if isinstance(scale,list) else (scale,scale,scale)
        group.rotation_euler.z=-math.radians(decoration['rotation'])
        for source in original.children_recursive:
            if source.type!='MESH':continue
            copy=source.copy();copy.data=source.data;copy.parent=group;copy.hide_render=False;copy.hide_set(False);bpy.context.collection.objects.link(copy);preview.append(copy)
for o in house.children_recursive:
    if 'photoIndex' in o:o.hide_render=True
scene.render.filepath=str(OUT/'house-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'memory-house-cozy.blend'),compress=True)
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
    scene.render.filepath=str(ROOT/'.local/house-completion'/('thumb-final-'+root['assetId']+'.jpg'))
    bpy.ops.render.render(write_still=True)
    # Atomic replacement also avoids Windows refusing to truncate a preview
    # file while another program is reading it.
    Path(scene.render.filepath).replace(thumbs/(root['assetId']+'.jpg'))
    for o in root.children_recursive:o.hide_render=True
(ART/'asset-info.json').write_text(json.dumps({'assets':reports,'reference':'emoria-cozy-reference','method':'Procedural Blender reconstruction based on supplied images; hidden surfaces inferred','rooms':[r[0] for r in rooms],'decorations':[r['assetId'] for r in assets],'up':'+Y','front':'+Z'},indent=2))
print('MEMORY_HOUSE_RESULT '+json.dumps(reports))
