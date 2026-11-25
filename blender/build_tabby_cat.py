import math
import os
import bpy
import bmesh
from mathutils import Vector, Euler, Matrix

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
GLB_OUT = os.path.join(PROJECT_DIR, "public", "models", "tabby_cat.glb")
BLEND_OUT = os.path.join(SCRIPT_DIR, "tabby_cat.blend")
PREVIEW_OUT = os.path.join(SCRIPT_DIR, "preview.png")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_smooth(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


def make_bsdf_mat(name, base_color, roughness=0.5, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def create_ellipsoid(name, center, radii, segs=22, rings=16, rot=(0, 0, 0), deform_fn=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if deform_fn is not None:
            p = deform_fn(p, v.co)
        v.co = p
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


def create_tapered_tube(name, points, radii, segs=14):
    """Build a smooth lofted tube along 3D points with per-ring radius."""
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, pt in enumerate(points):
        p = Vector(pt)
        if i == 0:
            tangent = (Vector(points[1]) - p).normalized()
        elif i == n - 1:
            tangent = (p - Vector(points[i - 1])).normalized()
        else:
            tangent = (Vector(points[i + 1]) - Vector(points[i - 1])).normalized()
        up = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
        side = tangent.cross(up).normalized()
        binorm = side.cross(tangent).normalized()
        r = radii[i]
        ring = []
        for s in range(segs):
            a = 2.0 * math.pi * s / segs
            offset = (side * math.cos(a) + binorm * math.sin(a)) * r
            ring.append(bm.verts.new(p + offset))
        rings.append(ring)

    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            ns = (s + 1) % segs
            bm.faces.new((r0[s], r0[ns], r1[ns], r1[s]))

    start_center = bm.verts.new(
        Vector(points[0]) - (Vector(points[1]) - Vector(points[0])).normalized() * (radii[0] * 0.45)
    )
    end_center = bm.verts.new(
        Vector(points[-1]) + (Vector(points[-1]) - Vector(points[-2])).normalized() * (radii[-1] * 0.45)
    )
    for s in range(segs):
        ns = (s + 1) % segs
        bm.faces.new((rings[0][ns], rings[0][s], start_center))
        bm.faces.new((rings[-1][s], rings[-1][ns], end_center))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


def create_ear(name, side_sign):
    """Sculpted pointed cat ear with folded outer rim and subtle ear tuft."""
    bm = bmesh.new()
    base = [
        bm.verts.new(Vector((0.0, 0.038, -0.014))),
        bm.verts.new(Vector((0.058 * side_sign, 0.008, -0.006))),
        bm.verts.new(Vector((0.022 * side_sign, -0.022, 0.002))),
        bm.verts.new(Vector((-0.045 * side_sign, -0.016, 0.006))),
        bm.verts.new(Vector((-0.045 * side_sign, 0.030, -0.004))),
    ]
    mid = [
        bm.verts.new(Vector((0.002 * side_sign, 0.025, 0.074))),
        bm.verts.new(Vector((0.040 * side_sign, 0.004, 0.074))),
        bm.verts.new(Vector((0.012 * side_sign, -0.009, 0.076))),
        bm.verts.new(Vector((-0.029 * side_sign, -0.010, 0.078))),
        bm.verts.new(Vector((-0.026 * side_sign, 0.021, 0.075))),
    ]
    tip = bm.verts.new(Vector((0.005 * side_sign, 0.003, 0.144)))

    n = len(base)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((base[i], base[ni], mid[ni], mid[i]))
        bm.faces.new((mid[i], mid[ni], tip))

    bm.faces.new(base[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Subsurf")
    set_smooth(obj)
    return obj


def build_cat_fur_shader(mat):
    """Detailed procedural mackerel tabby fur shader with forehead stripes, cheek markings, tail rings, and cream bib/paws."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.76
    bsdf.inputs["Specular IOR Level"].default_value = 0.24
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex_coord.outputs["Object"], sep.inputs["Vector"])

    # Organic fur distortion noise
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 8.0
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.65
    nt.links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])

    # Fine directional fur grain (stretched along Y so fur reads like short hair)
    fur_mapping = nt.nodes.new("ShaderNodeMapping")
    fur_mapping.inputs["Scale"].default_value = (1.6, 0.35, 1.6)
    nt.links.new(tex_coord.outputs["Object"], fur_mapping.inputs["Vector"])

    fine_noise = nt.nodes.new("ShaderNodeTexNoise")
    fine_noise.inputs["Scale"].default_value = 78.0
    fine_noise.inputs["Detail"].default_value = 10.0
    fine_noise.inputs["Roughness"].default_value = 0.72
    nt.links.new(fur_mapping.outputs["Vector"], fine_noise.inputs["Vector"])

    vec_mix = nt.nodes.new("ShaderNodeMix")
    vec_mix.data_type = "VECTOR"
    vec_mix.inputs["Factor"].default_value = 0.13
    nt.links.new(tex_coord.outputs["Object"], vec_mix.inputs["A"])
    nt.links.new(noise.outputs["Color"], vec_mix.inputs["B"])

    # Body stripes along Y
    wave_body = nt.nodes.new("ShaderNodeTexWave")
    wave_body.wave_type = "BANDS"
    wave_body.bands_direction = "Y"
    wave_body.wave_profile = "SIN"
    wave_body.inputs["Scale"].default_value = 5.4
    wave_body.inputs["Distortion"].default_value = 3.6
    wave_body.inputs["Detail"].default_value = 3.5
    nt.links.new(vec_mix.outputs["Result"], wave_body.inputs["Vector"])

    # Forehead & crown tabby stripes along X (creates classic tabby brow lines!)
    wave_head = nt.nodes.new("ShaderNodeTexWave")
    wave_head.wave_type = "BANDS"
    wave_head.bands_direction = "X"
    wave_head.wave_profile = "SIN"
    wave_head.inputs["Scale"].default_value = 12.0
    wave_head.inputs["Distortion"].default_value = 2.6
    wave_head.inputs["Detail"].default_value = 2.5
    nt.links.new(vec_mix.outputs["Result"], wave_head.inputs["Vector"])

    def range_node(val_sock, fmin, fmax, tmin=1.0, tmax=0.0):
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        mr.inputs["From Min"].default_value = fmin
        mr.inputs["From Max"].default_value = fmax
        mr.inputs["To Min"].default_value = tmin
        mr.inputs["To Max"].default_value = tmax
        nt.links.new(val_sock, mr.inputs["Value"])
        return mr.outputs["Result"]

    def mult(a, b):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        m.use_clamp = True
        nt.links.new(a, m.inputs[0])
        nt.links.new(b, m.inputs[1])
        return m.outputs["Value"]

    def max_n(a, b):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = "MAXIMUM"
        m.use_clamp = True
        nt.links.new(a, m.inputs[0])
        nt.links.new(b, m.inputs[1])
        return m.outputs["Value"]

    # Head crown mask (Z > 0.56 and Y < -0.18) so forehead uses X-stripes, body uses Y-stripes
    crown_z = range_node(sep.outputs["Z"], 0.54, 0.60, 0.0, 1.0)
    crown_y = range_node(sep.outputs["Y"], -0.22, -0.14, 1.0, 0.0)
    crown_mask = mult(crown_z, crown_y)

    stripe_fac = nt.nodes.new("ShaderNodeMix")
    stripe_fac.data_type = "FLOAT"
    nt.links.new(crown_mask, stripe_fac.inputs["Factor"])
    nt.links.new(wave_body.outputs["Fac"], stripe_fac.inputs["A"])
    nt.links.new(wave_head.outputs["Fac"], stripe_fac.inputs["B"])

    stripe_ramp = nt.nodes.new("ShaderNodeValToRGB")
    stripe_ramp.color_ramp.elements[0].position = 0.34
    stripe_ramp.color_ramp.elements[0].color = (0.17, 0.06, 0.018, 1.0)  # deep dark-rust tabby stripe
    stripe_ramp.color_ramp.elements[1].position = 0.62
    stripe_ramp.color_ramp.elements[1].color = (0.87, 0.43, 0.13, 1.0)   # rich warm ginger marmalade
    nt.links.new(stripe_fac.outputs["Result"], stripe_ramp.inputs["Fac"])

    # Warm gold undercoat highlights on fine fur strands
    coat_mix = nt.nodes.new("ShaderNodeMix")
    coat_mix.data_type = "RGBA"
    coat_mix.blend_type = "MULTIPLY"
    coat_mix.inputs["Factor"].default_value = 0.22
    nt.links.new(stripe_ramp.outputs["Color"], coat_mix.inputs["A"])
    nt.links.new(fine_noise.outputs["Color"], coat_mix.inputs["B"])

    abs_x = nt.nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["X"], abs_x.inputs[0])

    # 1) White/cream sock paws: Z < 0.065
    paw_mask = range_node(sep.outputs["Z"], 0.048, 0.070, 1.0, 0.0)

    # 2) Cream chest bib
    bib_y = range_node(sep.outputs["Y"], -0.22, -0.12, 1.0, 0.0)
    bib_z = range_node(sep.outputs["Z"], 0.34, 0.41, 1.0, 0.0)
    bib_z_low = range_node(sep.outputs["Z"], 0.14, 0.20, 0.0, 1.0)
    bib_x = range_node(abs_x.outputs["Value"], 0.045, 0.088, 1.0, 0.0)
    bib_mask = mult(mult(bib_y, bib_x), mult(bib_z, bib_z_low))

    # 3) Cream belly strip
    belly_z = range_node(sep.outputs["Z"], 0.19, 0.235, 1.0, 0.0)
    belly_x = range_node(abs_x.outputs["Value"], 0.032, 0.068, 1.0, 0.0)
    belly_y1 = range_node(sep.outputs["Y"], -0.20, -0.12, 0.0, 1.0)
    belly_y2 = range_node(sep.outputs["Y"], 0.12, 0.20, 0.0, 1.0)
    belly_mask = mult(mult(belly_z, belly_x), mult(belly_y1, belly_y2))

    # 4) Cream muzzle & chin
    muz_y = range_node(sep.outputs["Y"], -0.34, -0.295, 1.0, 0.0)
    muz_z_hi = range_node(sep.outputs["Z"], 0.515, 0.545, 1.0, 0.0)
    muz_z_lo = range_node(sep.outputs["Z"], 0.435, 0.465, 0.0, 1.0)
    muz_x = range_node(abs_x.outputs["Value"], 0.048, 0.078, 1.0, 0.0)
    muz_mask = mult(mult(muz_y, muz_x), mult(muz_z_hi, muz_z_lo))

    cream_mask = max_n(max_n(paw_mask, bib_mask), max_n(belly_mask, muz_mask))

    cream_mix = nt.nodes.new("ShaderNodeMix")
    cream_mix.data_type = "RGBA"
    cream_mix.inputs["B"].default_value = (0.96, 0.89, 0.77, 1.0)
    nt.links.new(cream_mask, cream_mix.inputs["Factor"])
    nt.links.new(coat_mix.outputs["Result"], cream_mix.inputs["A"])

    nt.links.new(cream_mix.outputs["Result"], bsdf.inputs["Base Color"])


def bake_fur_texture(cat_obj, tex_size=2048):
    """Bake procedural tabby shader onto a 2K UV-mapped image and pack into GLB."""
    img = bpy.data.images.new("TabbyFurAlbedo", width=tex_size, height=tex_size, alpha=False)
    img.colorspace_settings.name = "sRGB"

    mat = cat_obj.data.materials[0]
    nt = mat.node_tree
    img_node = nt.nodes.new("ShaderNodeTexImage")
    img_node.image = img
    nt.nodes.active = img_node

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 16

    bpy.ops.object.select_all(action="DESELECT")
    cat_obj.select_set(True)
    bpy.context.view_layer.objects.active = cat_obj
    bpy.ops.object.bake(type="DIFFUSE")
    img.pack()

    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.76
    bsdf.inputs["Specular IOR Level"].default_value = 0.24
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def build_scene():
    clear_scene()

    parts = []

    # Torso (athletic street cat silhouette: deep chest, lean waist, strong haunches)
    def torso_deform(p, unit):
        y_norm = unit.y
        arch = 0.028 * (1.0 - y_norm * y_norm)
        width_scale = 1.0 + 0.09 * y_norm - 0.07 * math.cos(y_norm * math.pi)
        p.x *= width_scale
        p.z += arch
        return p

    torso = create_ellipsoid(
        "Torso",
        center=(0.0, 0.02, 0.305),
        radii=(0.122, 0.258, 0.122),
        segs=26,
        rings=18,
        deform_fn=torso_deform,
    )
    parts.append(torso)

    # Fluffy chest ruff
    chest = create_ellipsoid("Chest", center=(0.0, -0.175, 0.315), radii=(0.106, 0.118, 0.118), segs=22, rings=14)
    parts.append(chest)

    # Neck
    neck = create_tapered_tube(
        "Neck",
        points=[(0.0, -0.19, 0.34), (0.0, -0.23, 0.42), (0.0, -0.245, 0.49)],
        radii=[0.088, 0.072, 0.066],
        segs=18,
    )
    parts.append(neck)

    # Detailed Head (cranium, cheek ruffs, subtle brow ridge)
    def head_deform(p, unit):
        if unit.y < 0.1 and unit.z < 0.15:
            p.x *= 1.12
        if unit.z > 0.32:
            p.x *= 0.90
        return p

    head = create_ellipsoid(
        "Head",
        center=(0.0, -0.262, 0.542),
        radii=(0.124, 0.114, 0.106),
        segs=26,
        rings=18,
        deform_fn=head_deform,
    )
    parts.append(head)

    # Side cheek tufts (gives that rich street-cat silhouette!)
    for s in (-1, 1):
        tuft = create_ellipsoid(
            f"CheekTuft_{s}",
            center=(0.112 * s, -0.268, 0.514),
            radii=(0.036, 0.044, 0.032),
            segs=14,
            rings=10,
            rot=(0, math.radians(-18 * s), math.radians(-20 * s)),
        )
        parts.append(tuft)

    # Brow ridges
    for s in (-1, 1):
        brow = create_ellipsoid(
            f"Brow_{s}",
            center=(0.048 * s, -0.342, 0.584),
            radii=(0.028, 0.020, 0.012),
            segs=12,
            rings=8,
            rot=(0, math.radians(10 * s), math.radians(-16 * s)),
        )
        parts.append(brow)

    # Muzzle & Cheek Pads
    for s in (-1, 1):
        cheek = create_ellipsoid(
            f"Cheek_{s}",
            center=(0.031 * s, -0.356, 0.503),
            radii=(0.039, 0.037, 0.028),
            segs=18,
            rings=12,
        )
        parts.append(cheek)

    nose_bridge = create_ellipsoid("NoseBridge", center=(0.0, -0.358, 0.542), radii=(0.022, 0.026, 0.024), segs=14, rings=10)
    chin = create_ellipsoid("Chin", center=(0.0, -0.348, 0.476), radii=(0.035, 0.038, 0.022), segs=14, rings=10)
    parts.extend([nose_bridge, chin])

    # Ears + Ear Tips
    for s, label in ((-1, "R"), (1, "L")):
        ear = create_ear(f"Ear_{label}", s)
        ear.location = (0.070 * s, -0.236, 0.616)
        ear.rotation_euler = Euler((math.radians(8), math.radians(16 * s), math.radians(-12 * s)))
        parts.append(ear)

    # 4 Legs + Sculpted Multi-Toe Paws
    for s, label in ((-1, "FR"), (1, "FL")):
        leg = create_tapered_tube(
            f"Leg_{label}",
            points=[
                (0.078 * s, -0.155, 0.275),
                (0.082 * s, -0.175, 0.165),
                (0.080 * s, -0.185, 0.055),
                (0.080 * s, -0.205, 0.024),
            ],
            radii=[0.050, 0.037, 0.030, 0.034],
            segs=14,
        )
        paw = create_ellipsoid(f"Paw_{label}", center=(0.080 * s, -0.214, 0.022), radii=(0.037, 0.044, 0.022), segs=14, rings=10)
        parts.extend([leg, paw])
        for toe_x in (-0.018, 0.0, 0.018):
            toe = create_ellipsoid(
                f"Toe_{label}_{toe_x}",
                center=(0.080 * s + toe_x, -0.252, 0.016),
                radii=(0.012, 0.016, 0.013),
                segs=10,
                rings=8,
            )
            parts.append(toe)

    for s, label in ((-1, "BR"), (1, "BL")):
        leg = create_tapered_tube(
            f"Leg_{label}",
            points=[
                (0.088 * s, 0.185, 0.285),
                (0.094 * s, 0.145, 0.175),
                (0.088 * s, 0.220, 0.095),
                (0.085 * s, 0.185, 0.024),
            ],
            radii=[0.060, 0.044, 0.032, 0.035],
            segs=14,
        )
        paw = create_ellipsoid(f"Paw_{label}", center=(0.085 * s, 0.166, 0.022), radii=(0.038, 0.046, 0.022), segs=14, rings=10)
        parts.extend([leg, paw])
        for toe_x in (-0.018, 0.0, 0.018):
            toe = create_ellipsoid(
                f"Toe_{label}_{toe_x}",
                center=(0.085 * s + toe_x, 0.126, 0.016),
                radii=(0.012, 0.016, 0.013),
                segs=10,
                rings=8,
            )
            parts.append(toe)

    # Expressive S-curved fluffy Tail
    tail = create_tapered_tube(
        "Tail",
        points=[
            (0.0, 0.255, 0.34),
            (0.0, 0.34, 0.39),
            (0.022, 0.42, 0.49),
            (0.032, 0.45, 0.60),
            (0.015, 0.42, 0.70),
        ],
        radii=[0.036, 0.033, 0.029, 0.026, 0.020],
        segs=14,
    )
    parts.append(tail)

    # Join & Voxel Remesh into seamless sculpted feline mesh
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = torso
    bpy.ops.object.join()
    cat_body = bpy.context.active_object
    cat_body.name = "CatBody"
    cat_body.data.name = "CatBody"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

    remesh = cat_body.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.0085
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier="Remesh")

    csmooth = cat_body.modifiers.new("Smooth", "SMOOTH")
    csmooth.factor = 0.5
    csmooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier="Smooth")
    cat_body.data.validate()
    set_smooth(cat_body)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")

    fur_mat = bpy.data.materials.new("TabbyFur")
    build_cat_fur_shader(fur_mat)
    cat_body.data.materials.append(fur_mat)
    bake_fur_texture(cat_body, tex_size=2048)

    # --- 2. FACIAL DETAILS, COLLAR & DETAILED LUXURY CIGARETTE ---
    mat_nose = make_bsdf_mat("PinkNose", (0.86, 0.42, 0.46), roughness=0.40)
    mat_inner_ear = make_bsdf_mat("InnerEar", (0.85, 0.48, 0.52), roughness=0.72)
    mat_eye_iris = make_bsdf_mat("CatIris", (0.22, 0.84, 0.34), roughness=0.06)
    mat_pupil = make_bsdf_mat("CatPupil", (0.015, 0.015, 0.015), roughness=0.04)
    mat_eye_glint = make_bsdf_mat("EyeGlint", (1.0, 1.0, 1.0), roughness=0.05, emission=(1.0, 1.0, 1.0), emission_strength=0.7)
    mat_eyelid = make_bsdf_mat("EyelidFur", (0.72, 0.34, 0.11), roughness=0.75)
    mat_whisker = make_bsdf_mat("Whisker", (0.96, 0.94, 0.90), roughness=0.35)
    mat_collar = make_bsdf_mat("NoirCollar", (0.28, 0.04, 0.08), roughness=0.38, metallic=0.12)
    mat_brass = make_bsdf_mat("BrassTag", (0.95, 0.74, 0.22), roughness=0.22, metallic=0.92)
    mat_cig_paper = make_bsdf_mat("CigPaper", (0.96, 0.94, 0.90), roughness=0.8)
    mat_cig_filter = make_bsdf_mat("CigFilter", (0.78, 0.46, 0.20), roughness=0.72)
    mat_cig_ash = make_bsdf_mat("CigAsh", (0.34, 0.33, 0.34), roughness=0.95)
    mat_cig_ember = make_bsdf_mat(
        "CigEmber",
        (0.95, 0.25, 0.04),
        roughness=0.9,
        emission=(1.0, 0.36, 0.05),
        emission_strength=6.0,
    )

    head_details = []

    # Sculpted Nose
    nose = create_ellipsoid("Nose", center=(0.0, -0.382, 0.520), radii=(0.018, 0.014, 0.012), segs=12, rings=8)
    nose.data.materials.append(mat_nose)
    head_details.append(nose)

    # Inner Ears
    for s, label in ((-1, "R"), (1, "L")):
        ie = create_ellipsoid(
            f"InnerEar_{label}",
            center=(0.068 * s, -0.254, 0.656),
            radii=(0.016, 0.007, 0.031),
            segs=10,
            rings=8,
            rot=(math.radians(8), math.radians(16 * s), math.radians(-12 * s)),
        )
        ie.data.materials.append(mat_inner_ear)
        head_details.append(ie)

    # Expressive Emerald Cat Eyes + Slit Pupils + Catchlights + Sleek Half-Lidded Eyelids
    for s, label in ((-1, "R"), (1, "L")):
        eye_pos = Vector((0.053 * s, -0.352, 0.556))
        iris = create_ellipsoid(f"EyeIris_{label}", center=eye_pos, radii=(0.023, 0.016, 0.024), segs=16, rings=12)
        iris.rotation_euler = Euler((0, 0, math.radians(-14 * s)))
        iris.data.materials.append(mat_eye_iris)

        pupil = create_ellipsoid(
            f"EyePupil_{label}",
            center=eye_pos + Vector((0.002 * s, -0.012, 0.0)),
            radii=(0.0055, 0.008, 0.017),
            segs=12,
            rings=10,
        )
        pupil.rotation_euler = Euler((0, 0, math.radians(-14 * s)))
        pupil.data.materials.append(mat_pupil)

        glint = create_ellipsoid(
            f"EyeGlint_{label}",
            center=eye_pos + Vector((0.007 * s, -0.016, 0.004)),
            radii=(0.0040, 0.0025, 0.0040),
            segs=8,
            rings=6,
        )
        glint.data.materials.append(mat_eye_glint)

        lid = create_ellipsoid(
            f"Eyelid_{label}",
            center=eye_pos + Vector((0.0, -0.001, 0.012)),
            radii=(0.025, 0.018, 0.013),
            segs=14,
            rings=10,
        )
        lid.rotation_euler = Euler((math.radians(14), math.radians(6 * s), math.radians(-14 * s)))
        lid.data.materials.append(mat_eyelid)
        head_details.extend([iris, pupil, glint, lid])

    # Whiskers (4 per side for extra detail!)
    for s in (-1, 1):
        for w_i, (dz, dy, tilt) in enumerate(
            ((0.010, 0.0, 0.018), (0.002, -0.002, 0.004), (-0.006, 0.0, -0.012), (-0.013, 0.004, -0.024))
        ):
            wh = create_tapered_tube(
                f"Whisker_{s}_{w_i}",
                points=[
                    (0.044 * s, -0.362 + dy, 0.502 + dz),
                    (0.098 * s, -0.354 + dy, 0.504 + dz + tilt * 0.4),
                    (0.152 * s, -0.336 + dy, 0.500 + dz + tilt),
                ],
                radii=[0.0021, 0.0015, 0.0007],
                segs=6,
            )
            wh.data.materials.append(mat_whisker)
            head_details.append(wh)

    # Luxury Cigarette (filter + gold band + paper + ash + ember)
    cig_root = Vector((-0.028, -0.366, 0.491))
    cig_dir = Vector((-0.42, -0.88, -0.18)).normalized()
    p_filter_end = cig_root + cig_dir * 0.026
    p_gold_end = cig_root + cig_dir * 0.031
    p_paper_end = cig_root + cig_dir * 0.090
    p_ash_end = cig_root + cig_dir * 0.097
    p_ember_end = cig_root + cig_dir * 0.104

    cig_filter = create_tapered_tube("CigFilter", [cig_root, p_filter_end], [0.0076, 0.0076], segs=10)
    cig_filter.data.materials.append(mat_cig_filter)

    cig_band = create_tapered_tube("CigGoldBand", [p_filter_end, p_gold_end], [0.0077, 0.0077], segs=10)
    cig_band.data.materials.append(mat_brass)

    cig_paper = create_tapered_tube("CigPaper", [p_gold_end, p_paper_end], [0.0074, 0.0073], segs=10)
    cig_paper.data.materials.append(mat_cig_paper)

    cig_ash = create_tapered_tube("CigAsh", [p_paper_end, p_ash_end], [0.0071, 0.0066], segs=10)
    cig_ash.data.materials.append(mat_cig_ash)

    cig_ember = create_tapered_tube("CigEmber", [p_ash_end, p_ember_end], [0.0065, 0.0048], segs=10)
    cig_ember.data.materials.append(mat_cig_ember)
    head_details.extend([cig_filter, cig_band, cig_paper, cig_ash, cig_ember])

    # Detailed 3D Neon Vape Mod (toggled in Three.js when switching to Vape Mode!)
    mat_vape_body = make_bsdf_mat("VapeBody", (0.14, 0.16, 0.24), roughness=0.22, metallic=0.88)
    mat_vape_tank = make_bsdf_mat("VapeTank", (0.18, 0.88, 0.95), roughness=0.1, emission=(0.15, 0.85, 1.0), emission_strength=1.4)
    mat_vape_led = make_bsdf_mat("VapeLED", (0.2, 0.95, 1.0), roughness=0.15, emission=(0.2, 0.95, 1.0), emission_strength=4.2)

    vape_root = Vector((0.024, -0.365, 0.490))
    vape_dir = Vector((0.32, -0.91, -0.26)).normalized()
    v_tip_end = vape_root + vape_dir * 0.022
    v_tank_end = vape_root + vape_dir * 0.052
    v_body_end = vape_root + vape_dir * 0.112

    vape_drip = create_tapered_tube("VapeDripTip", [vape_root, v_tip_end], [0.008, 0.009], segs=10)
    vape_drip.data.materials.append(mat_vape_body)
    vape_tank = create_tapered_tube("VapeTank", [v_tip_end, v_tank_end], [0.015, 0.015], segs=12)
    vape_tank.data.materials.append(mat_vape_tank)
    vape_body = create_tapered_tube("VapeBody", [v_tank_end, v_body_end], [0.017, 0.016], segs=8)
    vape_body.data.materials.append(mat_vape_body)
    vape_led = create_ellipsoid("VapeLED", center=(v_tank_end + v_body_end) * 0.5 + Vector((0, -0.014, 0.008)), radii=(0.007, 0.004, 0.014), segs=10, rings=8)
    vape_led.data.materials.append(mat_vape_led)
    head_details.extend([vape_drip, vape_tank, vape_body, vape_led])

    # Velvet Collar + Gold Poker-Chip Tag
    collar = create_tapered_tube(
        "Collar",
        points=[
            (0.084 * math.cos(a), -0.218 + 0.084 * math.sin(a), 0.415 - 0.018 * math.sin(a))
            for a in [2.0 * math.pi * i / 24 for i in range(25)]
        ],
        radii=[0.013] * 25,
        segs=10,
    )
    collar.data.materials.append(mat_collar)

    tag = create_ellipsoid("CollarTag", center=(0.0, -0.306, 0.382), radii=(0.022, 0.006, 0.022), segs=16, rings=10)
    tag.data.materials.append(mat_brass)

    # --- 3. ARMATURE RIGGING ---
    arm_data = bpy.data.armatures.new("CatRig")
    arm_obj = bpy.data.objects.new("CatRig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj

    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(name, head_pt, tail_pt, parent=None, connected=False):
        b = eb.new(name)
        b.head = Vector(head_pt)
        b.tail = Vector(tail_pt)
        if parent:
            b.parent = parent
            b.use_connect = connected
        return b

    root = add_bone("Root", (0, 0, 0.28), (0, -0.1, 0.28))
    spine = add_bone("Spine", (0, 0.14, 0.30), (0, -0.14, 0.31), parent=root)
    neck_b = add_bone("Neck", (0, -0.18, 0.33), (0, -0.24, 0.48), parent=spine)
    head_b = add_bone("Head", (0, -0.24, 0.48), (0, -0.28, 0.62), parent=neck_b, connected=True)

    tail_1 = add_bone("Tail1", (0, 0.25, 0.34), (0, 0.34, 0.40), parent=spine)
    tail_2 = add_bone("Tail2", (0, 0.34, 0.40), (0.02, 0.43, 0.54), parent=tail_1, connected=True)
    tail_3 = add_bone("Tail3", (0.02, 0.43, 0.54), (0.02, 0.42, 0.70), parent=tail_2, connected=True)

    leg_fl = add_bone("Leg_FL", (0.08, -0.16, 0.27), (0.08, -0.20, 0.02), parent=spine)
    leg_fr = add_bone("Leg_FR", (-0.08, -0.16, 0.27), (-0.08, -0.20, 0.02), parent=spine)
    leg_bl = add_bone("Leg_BL", (0.088, 0.18, 0.28), (0.085, 0.17, 0.02), parent=root)
    leg_br = add_bone("Leg_BR", (-0.088, 0.18, 0.28), (-0.085, 0.17, 0.02), parent=root)

    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    cat_body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    vgs = cat_body.vertex_groups
    bone_names = [b.name for b in arm_obj.data.bones]
    for bname in bone_names:
        if bname not in vgs:
            vgs.new(name=bname)
    for v in cat_body.data.vertices:
        total_w = sum(g.weight for g in v.groups)
        if total_w < 1e-4:
            best_name = "Spine"
            best_d = 1e9
            for b in arm_obj.data.bones:
                mid = (b.head_local + b.tail_local) * 0.5
                d = (v.co - mid).length
                if d < best_d:
                    best_d = d
                    best_name = b.name
            vgs[best_name].add([v.index], 1.0, "REPLACE")

    for hd in head_details:
        hd.parent = arm_obj
        hd.parent_type = "OBJECT"
        hd.matrix_parent_inverse = arm_obj.matrix_world.inverted()
        vg = hd.vertex_groups.new(name="Head")
        vg.add(list(range(len(hd.data.vertices))), 1.0, "REPLACE")
        mod = hd.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_obj

    for col_obj in (collar, tag):
        col_obj.parent = arm_obj
        col_obj.parent_type = "OBJECT"
        col_obj.matrix_parent_inverse = arm_obj.matrix_world.inverted()
        vg = col_obj.vertex_groups.new(name="Neck")
        vg.add(list(range(len(col_obj.data.vertices))), 1.0, "REPLACE")
        mod = col_obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_obj

    cig_tip = bpy.data.objects.new("CigTip", None)
    cig_tip.empty_display_type = "SPHERE"
    cig_tip.empty_display_size = 0.02
    cig_tip.location = p_ember_end
    bpy.context.collection.objects.link(cig_tip)
    cig_tip.parent = arm_obj
    cig_tip.parent_type = "BONE"
    cig_tip.parent_bone = "Head"
    bpy.context.view_layer.update()
    pb_head = arm_obj.pose.bones["Head"]
    cig_tip.matrix_parent_inverse = (arm_obj.matrix_world @ pb_head.matrix).inverted()
    cig_tip.matrix_world = Matrix.Translation(p_ember_end)

    vape_tip = bpy.data.objects.new("VapeTip", None)
    vape_tip.empty_display_type = "SPHERE"
    vape_tip.empty_display_size = 0.02
    vape_tip.location = vape_root
    bpy.context.collection.objects.link(vape_tip)
    vape_tip.parent = arm_obj
    vape_tip.parent_type = "BONE"
    vape_tip.parent_bone = "Head"
    bpy.context.view_layer.update()
    vape_tip.matrix_parent_inverse = (arm_obj.matrix_world @ pb_head.matrix).inverted()
    vape_tip.matrix_world = Matrix.Translation(vape_root)

    # --- 4. FIVE GLTF ANIMATIONS (Idle, Walk, Puff, Beg, Steal) ---
    arm_obj.animation_data_create()
    bones = arm_obj.pose.bones
    for b in bones:
        b.rotation_mode = "XYZ"

    def reset_poses():
        for b in bones:
            b.location = (0, 0, 0)
            b.rotation_euler = (0, 0, 0)

    def key_all(frame):
        for b in bones:
            b.keyframe_insert(data_path="location", frame=frame)
            b.keyframe_insert(data_path="rotation_euler", frame=frame)

    def make_action(name, fps_frames, fn_pose):
        act = bpy.data.actions.new(name=name)
        arm_obj.animation_data.action = act
        for f in fps_frames:
            reset_poses()
            fn_pose(f)
            key_all(f)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.name = name
        arm_obj.animation_data.action = None

    def pose_idle(f):
        t = (f - 1) / 60.0 * 2.0 * math.pi
        bones["Root"].location = (0, 0, 0.008 * math.sin(t))
        bones["Head"].rotation_euler = (math.radians(3.5 * math.sin(t)), math.radians(4.0 * math.sin(t * 0.5)), math.radians(6.0 * math.sin(t * 0.5)))
        bones["Tail1"].rotation_euler = (0, math.radians(14 * math.sin(t)), math.radians(10 * math.cos(t)))
        bones["Tail2"].rotation_euler = (0, math.radians(18 * math.sin(t - 0.8)), 0)
        bones["Tail3"].rotation_euler = (0, math.radians(20 * math.sin(t - 1.6)), 0)

    make_action("Idle", [1, 16, 31, 46, 61], pose_idle)

    def pose_walk(f):
        t = (f - 1) / 24.0 * 2.0 * math.pi
        bones["Root"].location = (0, 0, 0.018 * abs(math.sin(t)))
        bones["Spine"].rotation_euler = (math.radians(3.0 * math.sin(t * 2)), 0, math.radians(4.0 * math.sin(t)))
        bones["Head"].rotation_euler = (math.radians(-3.0 * math.sin(t * 2)), 0, math.radians(-3.0 * math.sin(t)))
        swing = math.radians(28)
        bones["Leg_FL"].rotation_euler = (swing * math.sin(t), 0, 0)
        bones["Leg_BR"].rotation_euler = (swing * math.sin(t + 0.3), 0, 0)
        bones["Leg_FR"].rotation_euler = (swing * math.sin(t + math.pi), 0, 0)
        bones["Leg_BL"].rotation_euler = (swing * math.sin(t + math.pi + 0.3), 0, 0)
        bones["Tail1"].rotation_euler = (math.radians(-6), math.radians(18 * math.sin(t)), 0)
        bones["Tail2"].rotation_euler = (0, math.radians(22 * math.sin(t - 0.7)), 0)
        bones["Tail3"].rotation_euler = (0, math.radians(22 * math.sin(t - 1.4)), 0)

    make_action("Walk", [1, 7, 13, 19, 25], pose_walk)

    def pose_puff(f):
        if f == 1 or f == 37:
            return
        if f == 12:
            bones["Neck"].rotation_euler = (math.radians(-6), 0, 0)
            bones["Head"].rotation_euler = (math.radians(-10), math.radians(-5), math.radians(-6))
            bones["Tail1"].rotation_euler = (0, math.radians(12), 0)
        elif f == 24:
            bones["Neck"].rotation_euler = (math.radians(8), 0, 0)
            bones["Head"].rotation_euler = (math.radians(16), math.radians(6), math.radians(4))
            bones["Tail1"].rotation_euler = (0, math.radians(-14), 0)

    make_action("Puff", [1, 12, 24, 37], pose_puff)

    # Beg: Sits back on haunches and raises front paws pleadingly!
    def pose_beg(f):
        if f == 1 or f == 45:
            return
        w = 1.0 if 12 <= f <= 33 else 0.5
        wave = math.sin((f - 12) * 0.45) * 0.22 if 12 <= f <= 33 else 0.0
        bones["Root"].location = (0, 0.04 * w, -0.09 * w)
        bones["Root"].rotation_euler = (math.radians(-26 * w), 0, 0)
        bones["Spine"].rotation_euler = (math.radians(-16 * w), 0, 0)
        bones["Leg_BL"].rotation_euler = (math.radians(32 * w), 0, 0)
        bones["Leg_BR"].rotation_euler = (math.radians(32 * w), 0, 0)
        bones["Leg_FL"].rotation_euler = (math.radians(-45 * w) + wave, 0, math.radians(10 * w))
        bones["Leg_FR"].rotation_euler = (math.radians(-45 * w) - wave, 0, math.radians(-10 * w))
        bones["Head"].rotation_euler = (math.radians(28 * w), math.radians(10 * w), 0)
        bones["Tail1"].rotation_euler = (math.radians(25 * w), 0, 0)

    make_action("Beg", [1, 10, 18, 26, 34, 45], pose_beg)

    # Steal: Sneaky crouch + fast front paw swipe
    def pose_steal(f):
        if f == 1 or f == 25:
            return
        if f == 8:
            bones["Root"].location = (0, 0.04, -0.05)
            bones["Spine"].rotation_euler = (math.radians(8), 0, math.radians(-8))
            bones["Leg_FR"].rotation_euler = (math.radians(-58), math.radians(14), math.radians(-12))
            bones["Head"].rotation_euler = (math.radians(10), 0, math.radians(-12))
        elif f == 15:
            bones["Root"].location = (0, -0.05, -0.02)
            bones["Spine"].rotation_euler = (math.radians(-6), 0, math.radians(10))
            bones["Leg_FR"].rotation_euler = (math.radians(24), math.radians(-10), 0)
            bones["Head"].rotation_euler = (math.radians(-6), 0, math.radians(10))

    make_action("Steal", [1, 8, 15, 25], pose_steal)

    # VapeRip: Longer head tilt back + big cloud exhale pose
    def pose_vape(f):
        if f == 1 or f == 49:
            return
        if f == 16:
            bones["Neck"].rotation_euler = (math.radians(-8), 0, math.radians(-4))
            bones["Head"].rotation_euler = (math.radians(-14), math.radians(-6), math.radians(-8))
            bones["Tail1"].rotation_euler = (0, math.radians(15), 0)
        elif f == 32:
            bones["Neck"].rotation_euler = (math.radians(12), 0, 0)
            bones["Head"].rotation_euler = (math.radians(24), math.radians(4), math.radians(4))
            bones["Tail1"].rotation_euler = (0, math.radians(-18), 0)

    make_action("VapeRip", [1, 16, 32, 49], pose_vape)

    reset_poses()
    bpy.context.view_layer.update()

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    cam.location = (-0.65, -1.10, 0.62)
    direction = Vector((0.0, -0.15, 0.36)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    light_data = bpy.data.lights.new("KeyLight", type="AREA")
    light_data.energy = 60.0
    light_data.size = 1.5
    light = bpy.data.objects.new("KeyLight", light_data)
    light.location = (-1.2, -1.6, 1.8)
    light.rotation_euler = (Vector((0, -0.2, 0.35)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(light)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.06, 0.08, 0.13, 1.0)
    bg.inputs["Strength"].default_value = 0.8
    bpy.context.scene.world = world

    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    bpy.context.scene.render.filepath = PREVIEW_OUT
    bpy.ops.render.render(write_still=True)
    print("EXPORT_DONE", GLB_OUT)


if __name__ == "__main__":
    build_scene()
