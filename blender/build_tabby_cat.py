"""Procedural build of "Lou", the chain-smoking brown mackerel tabby.

Run:  blender --background --python blender/build_tabby_cat.py
Env:  LOU_FAST=1      1024 textures, fewer AO samples, quick preview (for iteration)
      LOU_NO_RENDER=1 skip the Cycles preview render

Writes blender/tabby_cat.blend, public/models/tabby_cat.glb (WebP textures + Draco) and
blender/preview.png.

Game contract kept from the first model (src/ relies on it):
  bones Root Spine Neck Head Tail1-3 Leg_FL/FR/BL/BR (extra bones are children of these),
  actions Idle Walk Puff Beg Steal VapeRip (+ Run Jump Pounce Sit Eat Drive Flop Dance),
  meshes named Cig* / Vape*, material CigEmber, empties CigTip / VapeTip on the Head bone,
  cat faces -Y (glTF +Z), feet at z=0, head centre (0,-0.262,0.542), eyes (+-0.053,-0.352,0.556),
  collar ring z 0.415 around y -0.218 (r 0.084), tag (0,-0.306,0.382).
"""

import math
import os
import time

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
GLB_OUT = os.path.join(PROJECT_DIR, "public", "models", "tabby_cat.glb")
BLEND_OUT = os.path.join(SCRIPT_DIR, "tabby_cat.blend")
PREVIEW_OUT = os.path.join(SCRIPT_DIR, "preview.png")

FAST = os.environ.get("LOU_FAST", "") == "1"
NO_RENDER = os.environ.get("LOU_NO_RENDER", "") == "1"
TEX = 1024 if FAST else 2048
FPS = 24
T0 = time.time()


def log(*args):
    print("[lou %6.1fs]" % (time.time() - T0), *args, flush=True)


# ---------------------------------------------------------------------------------------------
# Anatomy constants (Blender space, metres; cat faces -Y, left side of the cat is +X)
# ---------------------------------------------------------------------------------------------
HEAD_C = Vector((0.0, -0.262, 0.542))
EYE_R = 0.0205
EYE_C = {1: Vector((0.053, -0.347, 0.556)), -1: Vector((-0.053, -0.347, 0.556))}  # 5 mm deeper than the old iris
EYE_OUT_DEG = 15.0          # eyes face forward, splayed out a little
# Upper-lid line (elevation of the lid edge on the front meridian, degrees). Lou squints:
# his left eye (+X) sits lower than the right, the "judgy" look from the photos.
LID_UP_ELEV = {1: 1.0, -1: 7.0}
LID_UP_TILT = 26.0
LID_LO_ELEV = -31.0
LID_LO_TILT = 22.0

PAD_C = {s: Vector((0.029 * s, -0.357, 0.503)) for s in (1, -1)}
PAD_R = Vector((0.039, 0.038, 0.029))

FRONT_X = 0.085
HIND_X = 0.092
# joints per leg: (top, mid, low, paw-end), sole contact point and toe tip
LEG_GEO = {}
for _s, _lab in ((1, "L"), (-1, "R")):
    fx = FRONT_X * _s
    hx = HIND_X * _s
    LEG_GEO["F" + _lab] = dict(
        top=Vector((fx, -0.158, 0.290)), mid=Vector((fx + 0.002 * _s, -0.166, 0.172)),
        low=Vector((fx, -0.186, 0.056)), toe=Vector((fx, -0.248, 0.017)),
        sole=Vector((fx, -0.214, 0.0)), paw=Vector((fx, -0.214, 0.023)), side=_s, front=True,
    )
    LEG_GEO["B" + _lab] = dict(
        top=Vector((hx, 0.180, 0.290)), mid=Vector((hx + 0.006 * _s, 0.140, 0.178)),
        low=Vector((hx, 0.218, 0.096)), toe=Vector((hx - 0.002 * _s, 0.128, 0.017)),
        sole=Vector((hx - 0.002 * _s, 0.168, 0.0)), paw=Vector((hx - 0.002 * _s, 0.168, 0.023)), side=_s, front=False,
    )

TAIL_PTS = [(0.0, 0.258, 0.330), (0.0, 0.345, 0.390), (0.020, 0.425, 0.490), (0.030, 0.452, 0.600),
            (0.020, 0.425, 0.700), (0.002, 0.392, 0.745), (-0.020, 0.356, 0.760)]
TAIL_RAD = [0.043, 0.038, 0.033, 0.030, 0.027, 0.023, 0.016]

NECK_PTS = [(0.0, -0.168, 0.305), (0.0, -0.203, 0.383), (0.0, -0.220, 0.418), (0.0, -0.246, 0.492)]
NECK_RAD = [0.100, 0.079, 0.070, 0.079]

CIG_ROOT = Vector((-0.028, -0.366, 0.491))
CIG_DIR = Vector((-0.42, -0.88, -0.18)).normalized()
VAPE_ROOT = Vector((0.024, -0.365, 0.490))
VAPE_DIR = Vector((0.32, -0.91, -0.26)).normalized()


def smooth01(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def eye_frame(s):
    """Unit vectors for one eye: forward (out of the face), u (towards +X), up."""
    a = math.radians(EYE_OUT_DEG) * s
    fwd = Vector((math.sin(a), -math.cos(a), 0.0)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    u = up.cross(fwd).normalized() * -1.0  # points to +X
    if u.x < 0:
        u = -u
    up = fwd.cross(u).normalized()
    if up.z < 0:
        up = -up
    return fwd, u, up


# ---------------------------------------------------------------------------------------------
# Generic mesh helpers
# ---------------------------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_smooth(obj):
    if obj.type == "MESH":
        obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_mod(obj, mod):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    link(obj)
    set_smooth(obj)
    return obj


def make_mat(name, color, roughness=0.5, metallic=0.0, emission=None, emission_strength=0.0,
             coat=0.0, coat_rough=0.05, spec=0.5, sheen=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Specular IOR Level"].default_value = spec
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if sheen > 0:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.45
    return mat


def srgb_to_lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def create_ellipsoid(name, center, radii, segs=24, rings=16, rot=(0, 0, 0), deform_fn=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if deform_fn is not None:
            p = deform_fn(p, v.co.copy())
        v.co = p
    obj = mesh_obj(name, bm)
    obj.location = center
    obj.rotation_euler = rot
    return obj


def tube_bmesh(bm, points, radii, segs=12, caps=True):
    """Lofted round tube along points into an existing bmesh; returns the new verts."""
    rings = []
    n = len(points)
    pts = [Vector(p) for p in points]
    prev_side = None
    new_verts = []
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - p).normalized()
        elif i == n - 1:
            tangent = (p - pts[i - 1]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        if prev_side is None:
            up = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
            side = tangent.cross(up).normalized()
        else:  # parallel transport keeps the rings from twisting
            side = (prev_side - tangent * prev_side.dot(tangent)).normalized()
        prev_side = side
        binorm = side.cross(tangent).normalized()
        ring = []
        for k in range(segs):
            a = 2.0 * math.pi * k / segs
            v = bm.verts.new(p + (side * math.cos(a) + binorm * math.sin(a)) * radii[i])
            ring.append(v)
            new_verts.append(v)
        rings.append(ring)
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(segs):
            kk = (k + 1) % segs
            bm.faces.new((r0[k], r0[kk], r1[kk], r1[k]))
    if caps:
        c0 = bm.verts.new(pts[0] - (pts[1] - pts[0]).normalized() * radii[0] * 0.5)
        c1 = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * max(radii[-1] * 0.5, 1e-5))
        new_verts += [c0, c1]
        for k in range(segs):
            kk = (k + 1) % segs
            bm.faces.new((rings[0][kk], rings[0][k], c0))
            bm.faces.new((rings[-1][k], rings[-1][kk], c1))
    return new_verts


def create_tube(name, points, radii, segs=12):
    bm = bmesh.new()
    tube_bmesh(bm, points, radii, segs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm)


def bezier_pts(p0, p1, p2, p3, n):
    out = []
    for i in range(n):
        t = i / (n - 1)
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append(p0 * a + p1 * b + p2 * c + p3 * d)
    return out


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


# ---------------------------------------------------------------------------------------------
# 1. Body sculpt: chunky Lou from primitives, voxel remeshed into one skin
# ---------------------------------------------------------------------------------------------
def build_body_parts():
    parts = []
    E = create_ellipsoid

    def torso_deform(p, u):
        mid = max(0.0, 1.0 - u.y * u.y)
        ws = 0.95 + 0.07 * max(u.y, 0.0) + 0.03 * mid
        if u.z < 0:
            ws *= 1.0 + 0.11 * mid * (-u.z)          # pear-shaped belly
        p.x *= ws
        if u.z > 0:
            p.z += 0.020 * mid * u.z
        else:
            p.z -= 0.030 * mid * (-u.z) ** 1.3       # belly sag
        return p

    parts.append(E("Torso", (0.0, 0.03, 0.300), (0.150, 0.262, 0.136), 36, 24, deform_fn=torso_deform))
    parts.append(E("Chest", (0.0, -0.180, 0.300), (0.128, 0.136, 0.135), 28, 20))
    parts.append(E("BellyPouch", (0.0, 0.075, 0.188), (0.112, 0.175, 0.062), 28, 18))
    for s in (1, -1):
        parts.append(E(f"Shoulder_{s}", (0.068 * s, -0.150, 0.368), (0.060, 0.085, 0.052), 18, 12))
        parts.append(E(f"Haunch_{s}", (0.078 * s, 0.172, 0.276), (0.088, 0.115, 0.118), 22, 16))
        parts.append(E(f"Elbow_{s}", (0.090 * s, -0.140, 0.205), (0.034, 0.036, 0.042), 14, 10))
    parts.append(create_tube("Neck", NECK_PTS, NECK_RAD, segs=20))

    def head_deform(p, u):
        if u.y < 0.15 and u.z < 0.1:
            p.x *= 1.07
        if u.z > 0.35:
            p.x *= 0.93
        if u.y < -0.55:
            p.y *= 0.975
        return p

    parts.append(E("Head", HEAD_C, (0.130, 0.116, 0.108), 32, 22, deform_fn=head_deform))
    for s in (1, -1):
        parts.append(E(f"Jowl_{s}", (0.100 * s, -0.276, 0.498), (0.057, 0.061, 0.051), 18, 12,
                       rot=(0, math.radians(-15 * s), math.radians(-20 * s))))
        # scruffy cheek tufts: short spikes that survive the remesh as a ragged silhouette
        for k, (dz, dy, ln) in enumerate(((0.018, 0.010, 0.030), (-0.004, 0.022, 0.034), (-0.026, 0.030, 0.028))):
            base = Vector((0.128 * s, -0.272 + dy, 0.505 + dz))
            d = Vector((1.0 * s, 0.45, -0.35 - 0.25 * k)).normalized()
            parts.append(create_tube(f"CheekTuft_{s}_{k}", [base, base + d * ln * 0.55, base + d * ln],
                                     [0.013, 0.007, 0.0012], segs=10))
        parts.append(E(f"Brow_{s}", (0.050 * s, -0.338, 0.585), (0.029, 0.020, 0.012), 14, 10,
                       rot=(0, math.radians(10 * s), math.radians(-16 * s))))
        parts.append(E(f"WhiskerPad_{s}", PAD_C[s], PAD_R, 20, 14))
        # fur mound over each eyeball; the almond-shaped lid opening is cut out of it later
        parts.append(E(f"EyeMound_{s}", EYE_C[s], (EYE_R + 0.0045, EYE_R + 0.0045, EYE_R + 0.0040), 24, 16))
    parts.append(E("NoseBridge", (0.0, -0.356, 0.541), (0.023, 0.030, 0.025), 16, 12))
    parts.append(E("NoseBase", (0.0, -0.377, 0.522), (0.017, 0.015, 0.013), 14, 10))
    parts.append(E("Chin", (0.0, -0.345, 0.474), (0.033, 0.036, 0.022), 16, 12))
    # chest ruff tufts
    for k, x in enumerate((-0.035, 0.0, 0.035)):
        base = Vector((x, -0.292, 0.262))
        d = Vector((x * 2.0, -0.35, -1.0)).normalized()
        parts.append(create_tube(f"ChestTuft_{k}", [base, base + d * 0.016, base + d * 0.03],
                                 [0.016, 0.009, 0.0015], segs=10))

    for key, g in LEG_GEO.items():
        s = g["side"]
        if g["front"]:
            pts = [g["top"], g["mid"], g["low"], Vector((g["top"].x, -0.204, 0.027))]
            rad = [0.056, 0.043, 0.034, 0.036]
            toe_y = -0.250
        else:
            pts = [g["top"], g["mid"], g["low"], Vector((g["paw"].x, 0.190, 0.027))]
            rad = [0.075, 0.051, 0.035, 0.037]
            toe_y = 0.130
        parts.append(create_tube(f"Leg_{key}", pts, rad, segs=16))
        parts.append(E(f"Paw_{key}", g["paw"], (0.040, 0.047, 0.023), 16, 12))
        for i, dx in enumerate((-0.024, -0.008, 0.008, 0.024)):
            outer = abs(dx) > 0.01
            parts.append(E(f"Toe_{key}_{i}", (g["paw"].x + dx, toe_y + (0.007 if outer else 0.0), 0.0165),
                           (0.0115, 0.0150, 0.0135), 12, 8))
    parts.append(create_tube("Tail", TAIL_PTS, TAIL_RAD, segs=16))
    return parts


def create_ear(name, s):
    """Thin cupped ear shell (crescent cross-section), not remeshed so the rim stays crisp.

    Returns (object, world matrix of the ear frame)."""
    NR, NA = 13, 8
    H, W, D = 0.140, 0.051, 0.027
    bm = bmesh.new()
    rings = []
    inner = {}
    for k in range(NR):
        t = k / (NR - 1) * 0.965
        w = W * (1.0 - t) ** 0.72 * (1.0 + 0.10 * math.sin(math.pi * t))
        d = D * (1.0 - t) ** 0.85 + 0.0015
        c = d * 0.80 * (1.0 - smooth01(0.70, 0.97, t))
        yc = 0.014 * t * t
        z = H * t
        ring = []
        for j in range(NA + 1):  # back arc
            a = math.pi * j / NA
            v = bm.verts.new((w * math.cos(a) * s, yc + d * math.sin(a), z))
            inner[v] = 0.35 if j in (0, NA) else 0.0
            ring.append(v)
        for j in range(NA - 1, 0, -1):  # concave front arc
            a = math.pi * j / NA
            v = bm.verts.new((w * math.cos(a) * s, yc + c * math.sin(a), z))
            inner[v] = 1.0 * smooth01(0.0, 0.06, t)
            ring.append(v)
        rings.append(ring)
    m = len(rings[0])
    for k in range(NR - 1):
        for j in range(m):
            jj = (j + 1) % m
            bm.faces.new((rings[k][j], rings[k][jj], rings[k + 1][jj], rings[k + 1][j]))
    tip = bm.verts.new((0.0, 0.014, H))
    inner[tip] = 0.3
    base = bm.verts.new((0.0, 0.006, -0.008))
    inner[base] = 0.0
    for j in range(m):
        jj = (j + 1) % m
        bm.faces.new((rings[-1][j], rings[-1][jj], tip))
        bm.faces.new((rings[0][jj], rings[0][j], base))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.verts.index_update()
    vals = [0.0] * len(bm.verts)
    for v, val in inner.items():
        vals[v.index] = val
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Mask", "FLOAT_COLOR", "POINT")
    for i, val in enumerate(vals):
        attr.data[i].color = (val, 1.0, 0.0, 1.0)
    obj = bpy.data.objects.new(name, me)
    link(obj)
    sub = obj.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    apply_mod(obj, sub)
    set_smooth(obj)
    loc = Vector((0.066 * s, -0.232, 0.604))
    rot = Euler((math.radians(-8), math.radians(15 * s), math.radians(18 * s)))
    mw = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
    obj.data.transform(mw)
    obj.data.update()
    return obj, mw


def build_body():
    parts = build_body_parts()
    body = join(parts, "CatBody")
    activate(body)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    log("body parts joined", len(body.data.polygons))

    rem = body.modifiers.new("Remesh", "REMESH")
    rem.mode = "VOXEL"
    rem.voxel_size = 0.0042
    apply_mod(body, rem)
    lap = body.modifiers.new("Lap", "LAPLACIANSMOOTH")
    lap.lambda_factor = 0.9
    lap.iterations = 6
    lap.use_volume_preserve = True
    lap.use_normalized = True
    apply_mod(body, lap)
    sm = body.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 2
    apply_mod(body, sm)
    log("remeshed", len(body.data.polygons))

    # cut the almond-shaped lid openings out of the eye mounds: only the opening between the lid
    # edges (plus a few degrees so the dark lid rims show) is removed, the lids stay under the fur
    bm = bmesh.new()
    for s in (1, -1):
        n_up, b_up, n_lo, b_lo = lid_axes(s)
        res = bmesh.ops.create_uvsphere(bm, u_segments=128, v_segments=96, radius=1.0)
        for v in res["verts"]:
            d = v.co.normalized()
            f = smooth01(b_up - math.radians(7), b_up - math.radians(2), d.angle(n_up)) *                 smooth01(b_lo - math.radians(7), b_lo - math.radians(2), d.angle(n_lo))
            r = (EYE_R - 0.004) + 0.016 * f
            v.co = EYE_C[s] + d * r
    cutter = mesh_obj("Sockets", bm)
    bo = body.modifiers.new("Sockets", "BOOLEAN")
    bo.operation = "DIFFERENCE"
    bo.object = cutter
    bo.solver = "EXACT"
    apply_mod(body, bo)
    bpy.data.objects.remove(cutter)
    log("eye openings cut", len(body.data.polygons))

    target_tris = 15000 if FAST else 30000
    dec = body.modifiers.new("Dec", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, target_tris / (2.0 * len(body.data.polygons)))
    dec.use_collapse_triangulate = True
    apply_mod(body, dec)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(body.data)
    bm.free()
    set_smooth(body)
    attr = body.data.color_attributes.new("Mask", "FLOAT_COLOR", "POINT")
    for d in attr.data:
        d.color = (0.0, 0.0, 0.0, 1.0)
    log("decimated", len(body.data.polygons))

    ears = {}
    ear_objs = []
    for s in (1, -1):
        eo, mw = create_ear("Ear_" + ("L" if s > 0 else "R"), s)
        bm = bmesh.new()
        bm.from_mesh(eo.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(eo.data)
        bm.free()
        ears[s] = mw
        ear_objs.append(eo)
    body = join([body] + ear_objs, "CatBody")
    set_smooth(body)
    log("body + ears", len(body.data.polygons), "tris")
    return body, ears


def unwrap_body(body):
    activate(body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.uv.seams_from_islands()
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    # give the face more texels: scale UV islands that sit on the head before packing
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    bm.faces.ensure_lookup_table()
    seen = set()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        island = []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                if e.seam:
                    continue
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        head_n = 0
        for g in island:
            c = g.calc_center_median()
            if (c - HEAD_C).length < 0.17 and c.z > 0.44:
                head_n += 1
        if head_n > 0.5 * len(island):
            k = 1.55
            uvs = [l[uvl].uv for g in island for l in g.loops]
            cu = sum((u.x for u in uvs)) / len(uvs)
            cv = sum((u.y for u in uvs)) / len(uvs)
            for g in island:
                for l in g.loops:
                    uv = l[uvl].uv
                    l[uvl].uv = ((uv.x - cu) * k + cu, (uv.y - cv) * k + cv)
    bm.to_mesh(me)
    bm.free()

    activate(body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.0045, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    log("uv done")


# ---------------------------------------------------------------------------------------------
# 2. Texture pipeline: bake position/normal/AO/mask per texel, paint Lou in numpy
# ---------------------------------------------------------------------------------------------
_GRAD = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]],
                 np.float32)


def _hash3(ix, iy, iz, seed):
    h = (ix.astype(np.uint32) * np.uint32(0x8DA6B343)) ^ (iy.astype(np.uint32) * np.uint32(0xD8163841)) \
        ^ (iz.astype(np.uint32) * np.uint32(0xCB1AB31F)) ^ np.uint32((seed * 0x9E3779B1 + 0x632BE5AB) & 0xFFFFFFFF)
    h ^= h >> np.uint32(15)
    h *= np.uint32(0x2C1B3C6D)
    h ^= h >> np.uint32(12)
    h *= np.uint32(0x297A2D39)
    h ^= h >> np.uint32(15)
    return h


def perlin(p, seed=0):
    p = p.astype(np.float32)
    fl = np.floor(p)
    i = fl.astype(np.int64)
    f = p - fl
    u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0)
    res = np.zeros(len(p), np.float32)
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1.0 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1.0 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1.0 - u[:, 2]
                h = _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed) & np.uint32(15)
                g = _GRAD[h]
                d = g[:, 0] * (f[:, 0] - dx) + g[:, 1] * (f[:, 1] - dy) + g[:, 2] * (f[:, 2] - dz)
                res += wx * wy * wz * d
    return res


def fbm(p, octaves=3, seed=0, gain=0.5):
    s = np.zeros(len(p), np.float32)
    a = 1.0
    norm = 0.0
    for o in range(octaves):
        s += a * perlin(p * (2.0 ** o) + np.float32(o * 17.31), seed + o * 101)
        norm += a
        a *= gain
    return s / norm


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def seg_dist(P, a, b):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    ab = b - a
    t = np.clip(((P - a) @ ab) / float(ab @ ab), 0.0, 1.0)
    q = a + t[:, None] * ab
    return np.linalg.norm(P - q, axis=1), t


def poly_dist(P, pts, radii=None):
    """Distance to a polyline (minus radius), arc length at the closest point, segment direction."""
    pts = [np.asarray(p, np.float32) for p in pts]
    best = np.full(len(P), 1e9, np.float32)
    arc = np.zeros(len(P), np.float32)
    dirs = np.zeros((len(P), 3), np.float32)
    acc = 0.0
    for i in range(len(pts) - 1):
        d, t = seg_dist(P, pts[i], pts[i + 1])
        L = float(np.linalg.norm(pts[i + 1] - pts[i]))
        if radii is not None:
            d = d - (radii[i] + (radii[i + 1] - radii[i]) * t)
        m = d < best
        best[m] = d[m]
        arc[m] = acc + t[m] * L
        dirs[m] = (pts[i + 1] - pts[i]) / max(L, 1e-9)
        acc += L
    return best, arc, dirs, acc


def lerp(a, b, t):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    t = np.asarray(t, np.float32)
    if t.ndim == 1 and (a.ndim == 2 or b.ndim == 2 or (a.ndim == 1 and a.shape[0] == 3 and t.shape[0] != 3)
                        or (b.ndim == 1 and b.shape[0] == 3 and t.shape[0] != 3)):
        t = t[:, None]
    return a + (b - a) * t


def col(hexstr):
    h = hexstr.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def whisker_roots():
    """Whisker-pad dot positions (rows x columns) per side; also used to grow the whiskers."""
    roots = {1: [], -1: []}
    for s in (1, -1):
        for row, el in enumerate((24.0, 9.0, -6.0, -21.0)):
            for colm, az in enumerate((24.0, 38.0, 52.0, 66.0)):
                az2 = math.radians(az + (5.0 if row % 2 else 0.0))
                el2 = math.radians(el)
                p = PAD_C[s] + Vector((PAD_R.x * math.sin(az2) * math.cos(el2) * s,
                                       -PAD_R.y * math.cos(az2) * math.cos(el2),
                                       PAD_R.z * math.sin(el2)))
                roots[s].append((row, colm, p))
    return roots


def paint_lou(P, N, AO, M, roots):
    """Return (albedo sRGB (n,3), height (n,)) for texel positions P / normals N."""
    n = len(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    side = np.where(x >= 0, 1.0, -1.0).astype(np.float32)
    ear = M[:, 1] > 0.5
    inner_ear = np.clip(M[:, 0], 0, 1) * ear

    # ---- region weights (soft nearest skeleton part)
    regions = {}
    regions["torso"] = poly_dist(P, [(0, -0.12, 0.30), (0, 0.20, 0.29)], [0.135, 0.140])
    regions["neck"] = poly_dist(P, NECK_PTS[1:3], NECK_RAD[1:3])
    regions["head"] = poly_dist(P, [HEAD_C, HEAD_C + Vector((0, -0.07, -0.03))], [0.112, 0.045])
    regions["tail"] = poly_dist(P, TAIL_PTS, TAIL_RAD)
    for key, g in LEG_GEO.items():
        regions["leg" + key] = poly_dist(P, [g["top"], g["mid"], g["low"], g["paw"]], [0.05, 0.04, 0.034, 0.036])
    names = list(regions.keys())
    D = np.stack([regions[k][0] for k in names], 1)
    dmin = D.min(1, keepdims=True)
    W = np.exp(-(D - dmin) / 0.010)
    W /= W.sum(1, keepdims=True)
    w = {k: W[:, i] for i, k in enumerate(names)}
    w_leg = sum(w[k] for k in names if k.startswith("leg"))
    w_head = w["head"] * (~ear) + ear * 1.0
    w_head = np.clip(w_head, 0, 1)

    # ---- fur flow direction (for strand noise and normals)
    flow = np.zeros((n, 3), np.float32)
    flow += w["torso"][:, None] * np.array([0.0, 1.0, -0.45], np.float32)
    flow += w["neck"][:, None] * np.array([0.0, 0.35, -1.0], np.float32)
    head_flow = np.stack([side * 0.55 * sstep(0.03, 0.09, ax), np.ones(n, np.float32), -0.25 * np.ones(n, np.float32)], 1)
    flow += w["head"][:, None] * head_flow
    flow += w["tail"][:, None] * regions["tail"][2]
    flow += w_leg[:, None] * np.array([0.0, 0.12, -1.0], np.float32)
    flow[ear] = np.array([0.0, 0.1, 1.0], np.float32)
    flow -= (flow * N).sum(1, keepdims=True) * N
    flow /= np.linalg.norm(flow, axis=1, keepdims=True) + 1e-6

    def aniso(scale_across, scale_along, seed, octaves=2):
        along = (P * flow).sum(1, keepdims=True)
        q = P * scale_across + along * flow * (scale_along - scale_across)
        return fbm(q, octaves, seed)

    strand = aniso(520.0, 60.0, 11, 2)                   # individual hair streaks
    clump = aniso(120.0, 28.0, 12, 2)                    # fur clumps
    fine = perlin(P * 1100.0, 13)                        # sub-strand grain
    big = fbm(P * 7.0, 2, 14)                            # large colour variation
    warpA = fbm(P * 9.0, 2, 21)
    warpB = fbm(P * 34.0, 2, 22)

    zc = 0.300 + 0.018 * (1.0 - ((y - 0.03) / 0.27) ** 2)
    theta = np.arctan2(ax, z - zc)                      # 0 on the spine, pi under the belly

    tick = np.clip(0.5 + 1.7 * strand + 0.12 * fine + 0.25 * clump, 0.0, 1.0)
    # agouti ground: warm brown-grey ticked, darker along the back
    dark_hair = col("#2a221c")
    light_hair = col("#9f8f79")
    ground = lerp(dark_hair, light_hair, tick)
    back_dark = (1.0 - sstep(0.25, 1.25, theta)) * w["torso"]
    ground *= (1.0 + 0.09 * big - 0.16 * back_dark)[:, None]
    stripe_col = lerp(col("#0f0c0a"), col("#33271e"), np.clip(tick * 0.8, 0, 1))
    dark = np.zeros(n, np.float32)

    def lines(phase, hw, soft=0.05):
        dph = np.abs(phase - np.round(phase))
        return 1.0 - sstep(hw - soft, hw + soft, dph)

    # ---- torso mackerel stripes, spine band, cream belly
    phase = (y + 0.026 * theta ** 1.5 + 0.015 * warpA + 0.005 * warpB) / 0.035 + np.where(x >= 0, 0.0, 0.35)
    hw = 0.15 + 0.06 * sstep(0.9, 0.2, theta) + 0.05 * fbm(P * 55.0, 1, 31)
    tor = lines(phase, hw, 0.045)
    tor *= sstep(-0.45, -0.15, fbm(P * 20.0, 2, 32))   # broken mackerel lines
    tor *= 1.0 - sstep(1.75, 2.35, theta)
    band = (1.0 - sstep(0.36, 0.66, theta + 0.10 * warpA)) * sstep(-0.215, -0.17, y) * sstep(0.30, 0.25, y)
    dark_t = np.maximum(tor, band * 0.96)
    belly = sstep(2.20, 2.65, theta + 0.12 * warpA) * w["torso"]
    dark += (w["torso"]) * dark_t

    # chest necklaces + white locket (front of the chest/neck)
    A = np.array([0.0, -0.16, 0.25], np.float32)
    u_ax = np.array([0.0, -0.10, 0.22], np.float32)
    u_ax /= np.linalg.norm(u_ax)
    sN = (P - A) @ u_ax
    radial = (P - A) - sN[:, None] * u_ax
    frontness = -radial[:, 1] / (np.linalg.norm(radial, axis=1) + 1e-6)
    neck_lines = np.zeros(n, np.float32)
    for s0, wd in ((0.212, 0.0085), (0.166, 0.0085), (0.122, 0.0080), (0.052, 0.0075)):
        dd = np.abs(sN - s0 - 0.006 * warpA)
        neck_lines = np.maximum(neck_lines, 1.0 - sstep(wd - 0.003, wd + 0.003, dd))
    # neck: nape lines down the back, necklace rings wrapping round the sides
    back_face = sstep(-0.1, 0.5, N[:, 1] * 0.6 + N[:, 2] * 0.8)
    nape = np.zeros(n, np.float32)
    for x0, hwid in ((0.010, 0.0055), (0.031, 0.0050), (0.052, 0.0045)):
        nape = np.maximum(nape, 1.0 - sstep(hwid - 0.0015, hwid + 0.0015, np.abs(ax - x0 - 0.002 * warpB)))
    dark += w["neck"] * np.maximum(nape * back_face, neck_lines * sstep(-0.6, -0.1, frontness))
    chest_zone = sstep(-0.35, 0.25, frontness) * sstep(-0.16, -0.22, y) * (z > 0.22)
    chest_zone = chest_zone * np.clip(w["torso"] + w["neck"], 0, 1)
    dark = np.maximum(dark * (1.0 - chest_zone), chest_zone * neck_lines * 0.92)
    lk = np.sqrt((ax / 0.017) ** 2 + ((sN - 0.096) / 0.0085) ** 2) + 0.45 * warpB + 0.25 * warpA + 0.35 * strand
    locket = 0.9 * (1.0 - sstep(0.6, 1.05, lk)) * sstep(0.2, 0.6, frontness) * (y < -0.2)

    # ---- legs: bars on the outside, plain-ish inside, dark paw soles handled by geometry
    for key in ("FL", "FR", "BL", "BR"):
        g = LEG_GEO[key]
        wl = w["leg" + key]
        outward = N[:, 0] * g["side"]
        vis = sstep(-0.75, 0.15, outward + 0.55 * (-N[:, 1] if g["front"] else N[:, 1] * 0.3))
        ph = z / 0.027 + 0.30 * warpA + 0.15 * warpB + (0.2 if g["front"] else 0.6)
        bars = lines(ph, 0.21 + 0.04 * fbm(P * 40.0, 1, 41), 0.05)
        bars *= sstep(0.032, 0.05, z) * (1.0 - sstep(0.23, 0.28, z))
        leg_dark = bars * vis * 0.95
        if not g["front"]:
            boot = sstep(0.25, 0.65, N[:, 1]) * (1.0 - sstep(0.10, 0.13, z)) * sstep(0.012, 0.03, z)
            leg_dark = np.maximum(leg_dark, boot * 0.85)
        dark += wl * leg_dark
        inner = sstep(-0.1, -0.6, outward) * sstep(0.05, 0.12, z) * (1.0 - sstep(0.2, 0.26, z))
        belly = np.maximum(belly, wl * inner * 0.30)

    # ---- tail rings + black tip
    tdist, tarc, tdir, tlen = regions["tail"]
    rings = lines(tarc / 0.040 + 0.15 * warpA, 0.26, 0.05)
    tip = sstep(tlen - 0.070, tlen - 0.045, tarc)
    tail_dark = np.maximum(rings * sstep(0.03, 0.06, tarc), tip)
    dark += w["tail"] * tail_dark

    # ---- head: forehead stripes forming the M, crown/nape lines, cheek mascara lines
    hp = P - np.array(HEAD_C, np.float32)
    v = np.arctan2(-hp[:, 1], hp[:, 2])                  # 0 on top, +1.57 face, -1.57 back of the head
    hx = hp[:, 0]
    head_dark = np.zeros(n, np.float32)
    line_defs = [  # (x at the brow, half width, v at the bottom end, convergence)
        (0.0085, 0.0048, 1.24, 0.55),
        (0.0265, 0.0050, 1.19, 0.15),
        (0.0445, 0.0042, 1.02, -0.25),
    ]
    for x0, hwid, vend, conv in line_defs:
        spread = 1.0 + 0.55 * sstep(0.2, -1.2, v)
        bend = 1.0 - conv * sstep(0.62, vend, v)
        xc = x0 * spread * bend + 0.0018 * warpB
        dline = np.abs(ax - xc)
        widen = 1.0 + 0.6 * sstep(0.4, -0.8, v)
        stroke = 1.0 - sstep(hwid * widen - 0.0016, hwid * widen + 0.0016, dline)
        stroke *= 1.0 - sstep(vend - 0.04, vend + 0.03, v)
        stroke *= sstep(-1.75, -1.35, v)
        head_dark = np.maximum(head_dark, stroke)
    # brow arcs: the M's outer legs curve out over the eyes
    for s in (1, -1):
        e = EYE_C[s]
        brow_pts = [(0.030 * s, -0.352, 0.586), (0.052 * s, -0.345, 0.590), (0.075 * s, -0.325, 0.584)]
        d_b, _, _, _ = poly_dist(P, brow_pts)
        head_dark = np.maximum(head_dark, (1.0 - sstep(0.0028, 0.0052, d_b + 0.001 * warpB)) * 0.85 * (side * s > 0))
    # cheek "mascara" lines, defined in head azimuth/elevation (degrees) so they always sit on the skin
    az = np.degrees(np.arctan2(ax, -hp[:, 1]))
    el = np.degrees(np.arctan2(hp[:, 2], np.hypot(hp[:, 0], hp[:, 1])))
    cheek_lines = [
        ([(46.0, 11.0), (54.0, 11.5), (61.0, 9.5), (66.0, 6.0)], 1.0),
        ([(38.0, -6.0), (46.0, -8.0), (54.0, -11.5), (59.0, -15.0)], 0.9),
        ([(60.0, -21.0), (66.0, -23.5)], 0.75),
    ]
    AE = np.stack([az, el], 1).astype(np.float32)
    for pts, hwid in cheek_lines:
        best = np.full(n, 1e9, np.float32)
        for a0, a1 in zip(pts, pts[1:]):
            dd, _ = seg_dist(np.concatenate([AE, np.zeros((n, 1), np.float32)], 1), (a0[0], a0[1], 0.0), (a1[0], a1[1], 0.0))
            best = np.minimum(best, dd)
        head_dark = np.maximum(head_dark, 0.82 * (1.0 - sstep(hwid - 0.5, hwid + 0.5, best + 0.4 * warpB)) * (hp[:, 1] < 0.03))
    dark = dark * (1.0 - w_head) + w_head * head_dark * (~ear)

    # ---- light / white / peach areas of the face
    white = np.zeros(n, np.float32)
    peach = np.zeros(n, np.float32)
    for s in (1, -1):
        q = (P - np.array(PAD_C[s], np.float32)) / np.array(PAD_R, np.float32) / 1.08
        dp = np.linalg.norm(q, axis=1)
        pad = (1.0 - sstep(0.92, 1.12, dp + 0.05 * warpB)) * (side * s > -0.5)
        white = np.maximum(white, pad * (0.55 + 0.45 * sstep(0.522, 0.498, z)))
        de = np.linalg.norm(P - np.array(EYE_C[s], np.float32), axis=1)
        ring = (1.0 - sstep(0.029, 0.036, de)) * sstep(0.019, 0.023, de)
        peach = np.maximum(peach, ring * 0.55)
        corner = np.exp(-np.sum(((P - np.array((0.030 * s, -0.372, 0.547), np.float32)) / np.array((0.011, 0.02, 0.012), np.float32)) ** 2, 1))
        peach = np.maximum(peach, corner * 0.9)
        under = np.exp(-np.sum(((P - np.array((0.068 * s, -0.338, 0.528), np.float32)) / np.array((0.022, 0.03, 0.012), np.float32)) ** 2, 1))
        peach = np.maximum(peach, under * 0.55)
        cheek = np.exp(-np.sum(((P - np.array((0.088 * s, -0.305, 0.512), np.float32)) / np.array((0.032, 0.04, 0.026), np.float32)) ** 2, 1))
        peach = np.maximum(peach, cheek * 0.32)
    bridge = np.exp(-np.sum(((P - np.array((0.0, -0.376, 0.540), np.float32)) / np.array((0.016, 0.03, 0.016), np.float32)) ** 2, 1))
    peach = np.maximum(peach, bridge * 0.85)
    chin = (1.0 - sstep(0.95, 1.25, np.linalg.norm((P - np.array((0.0, -0.343, 0.474), np.float32)) / np.array((0.036, 0.04, 0.026), np.float32), axis=1) + 0.06 * warpB))
    lips = (1.0 - sstep(0.004, 0.012, np.abs(z - 0.489) - 0.004)) * (1.0 - sstep(0.030, 0.042, ax)) * (y < -0.355)
    throat = (1.0 - sstep(0.025, 0.040, ax + 0.006 * warpB)) * sstep(0.43, 0.455, z) * (1.0 - sstep(0.47, 0.48, z)) * (y < -0.28)
    white = np.maximum.reduce([white, chin, lips * 0.9, throat * 0.8, locket])
    white *= (~ear)

    # whisker dots and the mouth line
    dots = np.zeros(n, np.float32)
    for s in (1, -1):
        for row, colm, p in roots[s]:
            rr = 0.0017 if row < 3 else 0.0013
            dd = np.linalg.norm(P - np.array(p, np.float32), axis=1)
            dots = np.maximum(dots, 1.0 - sstep(rr * 0.6, rr * 1.25, dd))
    mouth_pts_c = [(0.0, -0.392, 0.506), (0.0, -0.391, 0.497)]
    d_m, _, _, _ = poly_dist(P, mouth_pts_c)
    mouth = 1.0 - sstep(0.0009, 0.0019, d_m)
    for s in (1, -1):
        mp = [(0.0, -0.391, 0.497), (0.010 * s, -0.389, 0.4925), (0.021 * s, -0.383, 0.4895), (0.031 * s, -0.373, 0.4905)]
        d_m, _, _, _ = poly_dist(P, mp)
        mouth = np.maximum(mouth, 1.0 - sstep(0.0010, 0.0020, d_m))

    # ---- compose
    rgb = ground.copy()
    head_warm = w_head * (~ear)
    rgb = lerp(rgb, rgb * np.array([1.06, 0.98, 0.90], np.float32), head_warm)
    rgb = lerp(rgb, stripe_col, np.clip(dark, 0, 1))
    cream = lerp(col("#9f8a6c"), col("#d8c8ab"), tick)
    rgb = lerp(rgb, cream, np.clip(belly * (1.0 - 0.6 * dark), 0, 1))
    peach_col = lerp(col("#a77650"), col("#dcb894"), tick)
    rgb = lerp(rgb, peach_col, np.clip(peach * (1.0 - 0.8 * head_dark), 0, 1))
    white_col = lerp(col("#d7d0c6"), col("#f4f1ec"), np.clip(tick + 0.3, 0, 1))
    rgb = lerp(rgb, white_col, np.clip(white, 0, 1))
    # ears: brown-grey backs with darker rims, pink furred insides
    ear_back = lerp(col("#2a221b"), col("#7d6b56"), tick)
    rgb = np.where(ear[:, None], ear_back, rgb)
    furnish = np.clip(0.5 + 3.0 * aniso(260.0, 30.0, 51, 1), 0, 1)
    pink = lerp(col("#b9827b"), col("#e2b1a8"), np.clip(1.0 - inner_ear * 0.2, 0, 1))
    pink = lerp(pink, col("#efe4dc"), furnish * 0.30 * sstep(0.3, 0.9, inner_ear))
    rgb = lerp(rgb, pink, inner_ear)
    rgb = lerp(rgb, col("#2a1e19"), dots * 0.9 * (~ear))
    rgb = lerp(rgb, col("#20171a"), mouth * (~ear))
    # baked occlusion for creases (mouth, toes, ear cups)
    ao = np.clip(AO, 0.0, 1.0)
    rgb *= (0.38 + 0.62 * ao)[:, None]
    rgb = np.clip(rgb, 0.0, 1.0)

    # ---- height for the fur normal map
    height = 0.65 * strand + 0.35 * clump * 0.8
    height *= (1.0 - 0.6 * inner_ear)
    height *= (1.0 - 0.5 * mouth)

    # colour for the eyelid shells: the fur just outside the sockets
    near = np.zeros(n, bool)
    for s in (1, -1):
        de = np.linalg.norm(P - np.array(EYE_C[s], np.float32), axis=1)
        near |= (de > 0.025) & (de < 0.032) & (dark < 0.3)
    lid_col = rgb[near].mean(0) if near.any() else col("#9a8468")
    return rgb.astype(np.float32), height.astype(np.float32), lid_col


def dilate(img, mask, iters):
    img = img.copy()
    m = mask.copy()
    for _ in range(iters):
        acc = np.zeros_like(img)
        cnt = np.zeros(m.shape, np.float32)
        for sh in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            mm = np.roll(m, sh, (0, 1)).astype(np.float32)
            acc += np.roll(img, sh, (0, 1)) * (mm[..., None] if img.ndim == 3 else mm)
            cnt += mm
        new = (~m) & (cnt > 0)
        if img.ndim == 3:
            img[new] = acc[new] / cnt[new][:, None]
        else:
            img[new] = acc[new] / cnt[new]
        m |= new
    return img, m


def bake_and_paint(body, roots):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    scene.render.bake.use_clear = False
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.light_settings.distance = 0.035

    mat = bpy.data.materials.new("BakeMat")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Mask"
    madd = nt.nodes.new("ShaderNodeVectorMath")
    madd.operation = "MULTIPLY_ADD"
    madd.inputs[1].default_value = (0.5, 0.5, 0.5)
    madd.inputs[2].default_value = (0.5, 0.5, 0.5)
    texn = nt.nodes.new("ShaderNodeTexImage")
    nt.nodes.active = texn
    body.data.materials.clear()
    body.data.materials.append(mat)
    activate(body)

    def bake(name, src, encode, btype="EMIT", samples=1):
        img = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.pixels.foreach_set(np.zeros(TEX * TEX * 4, np.float32))
        texn.image = img
        for l in list(madd.inputs[0].links) + list(emit.inputs["Color"].links):
            nt.links.remove(l)
        if encode:
            nt.links.new(src, madd.inputs[0])
            nt.links.new(madd.outputs[0], emit.inputs["Color"])
        elif src is not None:
            nt.links.new(src, emit.inputs["Color"])
        scene.cycles.samples = samples
        bpy.ops.object.bake(type=btype, margin=0, use_clear=False)
        arr = np.empty(TEX * TEX * 4, np.float32)
        img.pixels.foreach_get(arr)
        bpy.data.images.remove(img)
        return arr.reshape(TEX, TEX, 4)

    pos = bake("BakePos", geo.outputs["Position"], True)
    nrm = bake("BakeNrm", geo.outputs["Normal"], True)
    msk = bake("BakeMask", attr.outputs["Color"], False)
    ao = bake("BakeAO", None, False, "AO", 8 if FAST else 48)
    log("bakes done")

    cov = pos[..., 0] > 0.01
    flat = cov.ravel()
    idx = np.nonzero(flat)[0]
    P = pos.reshape(-1, 4)[idx, :3] * 2.0 - 1.0
    N = nrm.reshape(-1, 4)[idx, :3] * 2.0 - 1.0
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-6
    AO = ao.reshape(-1, 4)[idx, 0]
    M = msk.reshape(-1, 4)[idx, :3]
    log("painting", len(idx), "texels")
    rgb, height, lid_col = paint_lou(P.astype(np.float32), N.astype(np.float32), AO, M, roots)
    log("paint done", "lid colour", lid_col)

    full = np.zeros((TEX * TEX, 3), np.float32)
    full[idx] = rgb
    full = full.reshape(TEX, TEX, 3)
    full, _ = dilate(full, cov, 20)
    hfull = np.zeros(TEX * TEX, np.float32)
    hfull[idx] = height
    hfull = hfull.reshape(TEX, TEX)
    hfull, _ = dilate(hfull, cov, 20)
    k = 1.15 * (TEX / 2048.0)
    gx = (np.roll(hfull, -1, 1) - np.roll(hfull, 1, 1)) * 0.5
    gy = (np.roll(hfull, -1, 0) - np.roll(hfull, 1, 0)) * 0.5
    nmap = np.stack([-k * gx, -k * gy, np.ones_like(gx)], -1)
    nmap /= np.linalg.norm(nmap, axis=-1, keepdims=True)

    albedo = bpy.data.images.new("LouFurAlbedo", TEX, TEX, alpha=False)
    albedo.colorspace_settings.name = "sRGB"
    px = np.ones((TEX, TEX, 4), np.float32)
    px[..., :3] = full
    albedo.pixels.foreach_set(px.ravel())
    albedo.pack()
    normal = bpy.data.images.new("LouFurNormal", TEX, TEX, alpha=False)
    normal.colorspace_settings.name = "Non-Color"
    px[..., :3] = nmap * 0.5 + 0.5
    normal.pixels.foreach_set(px.ravel())
    normal.pack()

    bpy.data.materials.remove(mat)
    fur = bpy.data.materials.new("TabbyFur")
    fur.use_nodes = True
    nt = fur.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.80
    bsdf.inputs["Specular IOR Level"].default_value = 0.28
    bsdf.inputs["Sheen Weight"].default_value = 0.35
    bsdf.inputs["Sheen Roughness"].default_value = 0.5
    bsdf.inputs["Sheen Tint"].default_value = (0.82, 0.76, 0.68, 1.0)
    t_alb = nt.nodes.new("ShaderNodeTexImage")
    t_alb.image = albedo
    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = normal
    nmn = nt.nodes.new("ShaderNodeNormalMap")
    nmn.inputs["Strength"].default_value = 1.0
    nt.links.new(t_alb.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t_nrm.outputs["Color"], nmn.inputs["Color"])
    nt.links.new(nmn.outputs["Normal"], bsdf.inputs["Normal"])
    body.data.materials.clear()
    body.data.materials.append(fur)
    return fur, tuple(float(c) for c in lid_col)


# ---------------------------------------------------------------------------------------------
# 3. Face & accessories
# ---------------------------------------------------------------------------------------------
def make_iris_image(size=512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    x = (xx + 0.5) / size * 2.0 - 1.0
    y = (yy + 0.5) / size * 2.0 - 1.0
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    pts = np.stack([np.cos(a) * 3.0, np.sin(a) * 3.0, r * 6.0], -1).reshape(-1, 3)
    fib = perlin(np.stack([np.cos(a) * 40.0, np.sin(a) * 40.0, r * 3.0], -1).reshape(-1, 3), 3).reshape(size, size)
    blot = fbm(pts * 2.0, 3, 4).reshape(size, size)
    gold = col("#cdb35e")
    mid = col("#b4bf78")
    green = col("#7f9a52")
    t = np.clip(r / 0.86, 0, 1)
    rgb = np.where((t < 0.45)[..., None], lerp(gold, mid, (t / 0.45).ravel()).reshape(size, size, 3),
                   lerp(mid, green, ((t - 0.45) / 0.55).clip(0, 1).ravel()).reshape(size, size, 3))
    rgb *= (0.86 + 0.5 * fib + 0.25 * blot)[..., None]
    rgb *= (1.0 - 0.55 * sstep(0.68, 0.87, r))[..., None]               # limbal ring
    sclera = col("#cbc39e")
    rgb = np.where((r > 0.88)[..., None], sclera * (1.0 - 0.2 * sstep(0.88, 1.0, r))[..., None], rgb)
    # vertical slit pupil (squinty daylight pupil)
    ph = 0.76
    pw = 0.085 * np.clip(1.0 - (y / ph) ** 2, 0, 1)
    pup = 1.0 - sstep(-0.012, 0.012, np.abs(x) - pw)
    pup *= (np.abs(y) < ph)
    halo = (1.0 - sstep(0.0, 0.07, np.abs(x) - pw)) * (np.abs(y) < ph * 1.05)
    rgb *= (1.0 - 0.25 * halo)[..., None]
    rgb = lerp(rgb.reshape(-1, 3), col("#060505"), pup.ravel()).reshape(size, size, 3)
    # painted depth: lid shadow on top, caustic glow at the bottom of the iris
    rgb *= (1.0 - 0.42 * sstep(-0.10, 0.62, y))[..., None]
    caus = np.exp(-(((x + 0.20) / 0.30) ** 2 + ((y + 0.48) / 0.20) ** 2)) * (r < 0.86)
    rgb += (caus * 0.20)[..., None] * col("#e8f0a0")
    rgb = np.clip(rgb, 0, 1)
    img = bpy.data.images.new("LouIris", size, size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    px = np.ones((size, size, 4), np.float32)
    px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def build_eyes():
    iris = make_iris_image(256 if FAST else 512)
    mat = bpy.data.materials.new("CatEye")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = iris
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.12
    bsdf.inputs["Roughness"].default_value = 0.32
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.02
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for s in (1, -1):
        fwd, u_ax, up = eye_frame(s)
        c = EYE_C[s]
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=28, v_segments=18, radius=EYE_R)
        rot = Matrix((u_ax, fwd, up)).transposed()  # local x->u, y->fwd, z->up
        for v in tmp.verts:
            lp = v.co.copy()
            f = lp.y / EYE_R
            if f > 0.45:  # cornea bulge
                lp.y += 0.0016 * smooth01(0.45, 1.0, f)
            v.co = c + rot @ lp
        me_tmp = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me_tmp)
        tmp.free()
        off = len(bm.verts)
        vmap = [bm.verts.new(v.co) for v in me_tmp.vertices]
        for p in me_tmp.polygons:
            f = bm.faces.new([vmap[i] for i in p.vertices])
            for l in f.loops:
                d = l.vert.co - c
                l[uvl].uv = (0.5 + 0.5 * d.dot(u_ax) / EYE_R, 0.5 + 0.5 * d.dot(up) / EYE_R)
        bpy.data.meshes.remove(me_tmp)
    eyes = mesh_obj("Eyes", bm)
    eyes.data.materials.append(mat)

    glint_mat = make_mat("EyeGlint", (1.0, 1.0, 1.0), 0.1, emission=(1.0, 1.0, 1.0), emission_strength=1.2)
    bm = bmesh.new()
    for s in (1, -1):
        fwd, u_ax, up = eye_frame(s)
        p = EYE_C[s] + (fwd * 0.97 - up * 0.07 + u_ax * 0.20).normalized() * (EYE_R + 0.0019)
        tmp = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0021)
        for v in tmp["verts"]:
            v.co = p + Vector((v.co.x * 1.15, v.co.y * 0.5, v.co.z * 0.9))
    glints = mesh_obj("EyeGlints", bm)
    glints.data.materials.append(glint_mat)
    return eyes, glints


def cap_mesh(bm, center, axis, half_angle, radius, rings=10, segs=36):
    """Spherical cap around axis; returns rows of verts from the pole to the edge."""
    axis = axis.normalized()
    t1 = axis.orthogonal().normalized()
    t2 = axis.cross(t1).normalized()
    rows = []
    pole = bm.verts.new(center + axis * radius)
    for i in range(1, rings + 1):
        th = half_angle * i / rings
        row = []
        for k in range(segs):
            ph = 2 * math.pi * k / segs
            d = axis * math.cos(th) + (t1 * math.cos(ph) + t2 * math.sin(ph)) * math.sin(th)
            row.append(bm.verts.new(center + d * radius))
        rows.append(row)
    for k in range(segs):
        bm.faces.new((pole, rows[0][k], rows[0][(k + 1) % segs]))
    faces_by_row = []
    for i in range(rings - 1):
        fr = []
        for k in range(segs):
            kk = (k + 1) % segs
            fr.append(bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][kk], rows[i][kk])))
        faces_by_row.append(fr)
    return rows, faces_by_row


def lid_axes(s):
    fwd, u_ax, up = eye_frame(s)
    e = math.radians(LID_UP_ELEV[s])
    tilt = math.radians(LID_UP_TILT)
    slant = math.radians(9.0) * s
    q_slant = Quaternion(fwd, -slant)
    n_up = q_slant @ (up * math.cos(tilt) - fwd * math.sin(tilt))
    beta_up = math.acos(max(-1.0, min(1.0, math.sin(e - tilt))))
    el = math.radians(LID_LO_ELEV)
    tl = math.radians(LID_LO_TILT)
    n_lo = q_slant @ (-up * math.cos(tl) - fwd * math.sin(tl))
    beta_lo = math.acos(max(-1.0, min(1.0, -math.sin(tl + el))))
    return n_up, beta_up, n_lo, beta_lo


def build_lids(lid_mat, rim_mat):
    """Upper lids (blinkable, one per Lid bone) and lower lids: thin spherical shells inside the sockets."""
    objs = {}
    for part in ("upper", "lower"):
        bm = bmesh.new()
        for s in (1, -1):
            n_up, b_up, n_lo, b_lo = lid_axes(s)
            if part == "upper":
                cap_mesh(bm, EYE_C[s], n_up, b_up, EYE_R + 0.0007, rings=10, segs=32)
            else:
                cap_mesh(bm, EYE_C[s], n_lo, b_lo, EYE_R + 0.0005, rings=8, segs=32)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # outward normals: flip if pointing to the eye centre
        for f in bm.faces:
            c = f.calc_center_median()
            s = 1 if c.x > 0 else -1
            if f.normal.dot(c - EYE_C[s]) < 0:
                f.normal_flip()
        name = "EyelidsUpper" if part == "upper" else "EyelidsLower"
        obj = mesh_obj(name, bm)
        obj.data.materials.append(lid_mat)
        obj.data.materials.append(rim_mat)
        sol = obj.modifiers.new("Solid", "SOLIDIFY")
        sol.thickness = 0.0016 if part == "upper" else 0.0012
        sol.offset = 1.0
        sol.material_offset_rim = 1
        sol.use_rim = True
        apply_mod(obj, sol)
        objs[part] = obj
    return objs["upper"], objs["lower"]


def build_nose():
    leather = make_mat("NoseLeather", srgb_to_lin((0.80, 0.52, 0.52)), roughness=0.36, spec=0.6)
    nostril = make_mat("Nostril", srgb_to_lin((0.16, 0.10, 0.10)), roughness=0.5)
    rim = make_mat("NoseRim", srgb_to_lin((0.25, 0.17, 0.16)), roughness=0.45)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
    for v in bm.verts:
        u = v.co.copy()
        wf = 0.42 + 0.58 * ((u.z + 1.0) / 2.0) ** 0.75
        p = Vector((0.0172 * u.x * wf, 0.0092 * u.y, 0.0112 * u.z))
        # philtrum notch at the bottom centre
        p.y += 0.0025 * math.exp(-((u.x / 0.18) ** 2 + ((u.z + 0.95) / 0.25) ** 2))
        for sx in (1, -1):
            g = math.exp(-(((u.x - 0.60 * sx) / 0.22) ** 2 + ((u.z + 0.30) / 0.26) ** 2)) * (1.0 if u.y < 0 else 0.0)
            p.y += 0.0046 * g
            v.tag = v.tag or g > 0.22
        v.co = p
    for f in bm.faces:
        if all(v.tag for v in f.verts):
            f.material_index = 1
    mw = Matrix.Translation((0.0, -0.389, 0.521)) @ Euler((math.radians(16), 0, 0)).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=mw, verts=bm.verts)
    # dark outline: a slightly larger shell behind the leather
    bm2 = bmesh.new()
    bmesh.ops.create_uvsphere(bm2, u_segments=20, v_segments=12, radius=1.0)
    for v in bm2.verts:
        u = v.co.copy()
        wf = 0.42 + 0.58 * ((u.z + 1.0) / 2.0) ** 0.75
        v.co = Vector((0.0184 * u.x * wf, 0.0085 * u.y + 0.0021, 0.0121 * u.z - 0.0003))
    bmesh.ops.transform(bm2, matrix=mw, verts=bm2.verts)
    me2 = bpy.data.meshes.new("tmp")
    bm2.to_mesh(me2)
    bm2.free()
    vmap = [bm.verts.new(v.co) for v in me2.vertices]
    for p in me2.polygons:
        f = bm.faces.new([vmap[i] for i in p.vertices])
        f.material_index = 2
    bpy.data.meshes.remove(me2)
    nose = mesh_obj("Nose", bm)
    for m in (leather, nostril, rim):
        nose.data.materials.append(m)
    return nose


def build_whiskers(body, roots):
    mat = make_mat("Whisker", srgb_to_lin((0.95, 0.94, 0.91)), roughness=0.3, spec=0.6)
    me_b = body.data
    bvh = BVHTree.FromPolygons([v.co for v in me_b.vertices], [list(p.vertices) for p in me_b.polygons])
    bm = bmesh.new()
    rnd = np.random.default_rng(7)
    for s in (1, -1):
        for row, colm, p in roots[s]:
            if row > 2 or colm == 0:
                continue
            loc, nrm, fi, dist = bvh.find_nearest(p)
            base = loc - nrm * 0.001
            L = 0.115 + 0.035 * (colm / 3.0) + 0.012 * (1 - row) + rnd.uniform(-0.008, 0.008)
            d = Vector((1.0 * s, -0.55 + 0.12 * colm, 0.10 - 0.16 * row)).normalized()
            p1 = base + d * L * 0.33
            p2 = base + d * L * 0.68 + Vector((0, 0, -0.010 - 0.004 * row))
            p3 = base + d * L + Vector((0, 0.01, -0.030 - 0.008 * row))
            pts = bezier_pts(base, p1, p2, p3, 7)
            tube_bmesh(bm, pts, [0.0009 * (1 - i / 6.0) ** 0.8 + 0.0001 for i in range(7)], segs=5, caps=False)
        # eyebrow whiskers
        for k in range(3):
            base = Vector((0.050 * s + 0.010 * s * k, -0.344 + 0.006 * k, 0.586 + 0.002 * k))
            d = Vector((0.55 * s, -0.55, 0.65)).normalized()
            L = 0.055 + 0.01 * k
            pts = bezier_pts(base, base + d * L * 0.4, base + d * L * 0.75 + Vector((0.01 * s, 0, 0)),
                             base + d * L + Vector((0.02 * s, 0.01, -0.008)), 5)
            tube_bmesh(bm, pts, [0.0008, 0.0006, 0.0004, 0.00025, 0.00012], segs=4, caps=False)
        # cheek (genal) whiskers
        for k in range(2):
            base = Vector((0.118 * s, -0.300 + 0.012 * k, 0.535 - 0.012 * k))
            d = Vector((1.0 * s, 0.25, 0.1)).normalized()
            L = 0.05
            pts = bezier_pts(base, base + d * L * 0.4, base + d * L * 0.7, base + d * L + Vector((0, 0.01, -0.012)), 5)
            tube_bmesh(bm, pts, [0.0008, 0.0006, 0.0004, 0.00025, 0.00012], segs=4, caps=False)
    wh = mesh_obj("Whiskers", bm)
    wh.data.materials.append(mat)
    return wh


def build_ear_fur(ears):
    mat = make_mat("EarFur", srgb_to_lin((0.84, 0.80, 0.74)), roughness=0.85, spec=0.25)
    bm = bmesh.new()
    rnd = np.random.default_rng(3)
    for s, mw in ears.items():
        for k in range(18):
            fx = rnd.uniform(-0.6, 0.6)
            tz = rnd.uniform(0.006, 0.060)
            ln = rnd.uniform(0.020, 0.040)
            base = Vector((0.046 * fx * s, 0.012 + 0.006 * (1 - abs(fx)), tz))
            d = Vector((0.6 * fx * s + 0.3 * s, -0.5, 1.0)).normalized()
            pts = bezier_pts(base, base + d * ln * 0.4, base + d * ln * 0.75 + Vector((0.004 * s, 0, 0)),
                             base + d * ln + Vector((0.010 * s, -0.003, -0.002)), 4)
            pts = [mw @ p for p in pts]
            tube_bmesh(bm, pts, [0.0013, 0.0009, 0.0005, 0.0001], segs=4, caps=False)
    obj = mesh_obj("EarFur", bm)
    obj.data.materials.append(mat)
    vgl = obj.vertex_groups.new(name="Ear_L")
    vgr = obj.vertex_groups.new(name="Ear_R")
    for v in obj.data.vertices:
        (vgl if v.co.x > 0 else vgr).add([v.index], 1.0, "REPLACE")
    return obj


def build_paw_pads():
    mat = make_mat("PawPad", srgb_to_lin((0.17, 0.13, 0.13)), roughness=0.45, spec=0.5)
    bm = bmesh.new()
    spans = {}
    for key, g in LEG_GEO.items():
        px, py = g["paw"].x, g["paw"].y
        main_y = py + (0.006 if g["front"] else 0.010)
        res = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
        for v in res["verts"]:
            v.co = Vector((px + v.co.x * 0.0175 * (1.0 - 0.25 * max(0.0, v.co.y)), main_y + v.co.y * 0.0135, 0.0047 + v.co.z * 0.0044))
        toe_y = (-0.243 if g["front"] else 0.137)
        for i, dx in enumerate((-0.024, -0.008, 0.008, 0.024)):
            outer = abs(dx) > 0.01
            res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
            for v in res["verts"]:
                v.co = Vector((px + dx + v.co.x * 0.0062, toe_y + (0.007 if outer else 0.0) + v.co.y * 0.0074, 0.0042 + v.co.z * 0.0038))
    obj = mesh_obj("PawPads", bm)
    obj.data.materials.append(mat)
    # bmesh primitive ops don't keep creation order, so bind each vertex to its nearest paw
    vgs = {key: obj.vertex_groups.new(name=f"Leg_{key}_Paw") for key in LEG_GEO}
    for v in obj.data.vertices:
        key = min(LEG_GEO, key=lambda k: (Vector((LEG_GEO[k]["paw"].x, LEG_GEO[k]["paw"].y, 0.0)) - v.co).length)
        vgs[key].add([v.index], 1.0, "REPLACE")
    return obj


def build_collar():
    mat_collar = make_mat("NoirCollar", srgb_to_lin((0.42, 0.06, 0.10)), roughness=0.42, metallic=0.05, sheen=0.4)
    mat_brass = make_mat("BrassTag", srgb_to_lin((0.93, 0.74, 0.30)), roughness=0.22, metallic=0.95)
    mat_enamel = make_mat("TagEnamel", srgb_to_lin((0.07, 0.05, 0.05)), roughness=0.35)
    # flat band following the original ring path
    N = 40
    path = []
    for i in range(N):
        a = 2.0 * math.pi * i / N
        path.append(Vector((0.084 * math.cos(a), -0.218 + 0.084 * math.sin(a), 0.415 - 0.018 * math.sin(a))))
    prof = []
    hh, ht = 0.0115, 0.0042
    for k in range(12):
        a = 2.0 * math.pi * k / 12
        cx, cz = math.cos(a), math.sin(a)
        sx = math.copysign(abs(cx) ** 0.35, cx)
        sz = math.copysign(abs(cz) ** 0.35, cz)
        prof.append((sx * ht, sz * hh))
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(path):
        t = (path[(i + 1) % N] - path[i - 1]).normalized()
        r = (p - Vector((0.0, -0.218, p.z))).normalized()
        r = (r - t * r.dot(t)).normalized()
        vv = t.cross(r).normalized()
        if vv.z < 0:
            vv = -vv
        rings.append([bm.verts.new(p + r * a + vv * b) for a, b in prof])
    for i in range(N):
        ii = (i + 1) % N
        for k in range(12):
            kk = (k + 1) % 12
            bm.faces.new((rings[i][k], rings[i][kk], rings[ii][kk], rings[ii][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # stitched gold studs on the front half
    for i in range(N):
        a = 2.0 * math.pi * i / N
        if math.sin(a) > -0.35 or i % 2:
            continue
        p = path[i]
        r = (p - Vector((0.0, -0.218, p.z))).normalized()
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0026)
        for v in res["verts"]:
            v.co = p + r * 0.0042 + Vector((v.co.x, v.co.y, v.co.z * 1.0))
            v.select = True
        for f in bm.faces:
            if all(vv in res["verts"] for vv in f.verts):
                f.material_index = 1
    collar = mesh_obj("Collar", bm)
    collar.data.materials.append(mat_collar)
    collar.data.materials.append(mat_brass)

    # tag: brass poker-chip disc with a raised rim, a jump ring up to the collar, "LOU" in black enamel
    tc = Vector((0.0, -0.306, 0.382))
    bm = bmesh.new()
    R, th = 0.021, 0.0042
    seg = 32
    prof = [(0.0, -th * 0.5 + 0.0008), (R * 0.80, -th * 0.5 + 0.0008), (R * 0.84, -th * 0.5), (R * 0.97, -th * 0.5 - 0.0002),
            (R, -th * 0.25), (R, th * 0.25), (R * 0.97, th * 0.5), (R * 0.84, th * 0.5), (R * 0.80, th * 0.5 - 0.0008), (0.0, th * 0.5 - 0.0008)]
    rings = []
    for k in range(seg):
        a = 2.0 * math.pi * k / seg
        rings.append([bm.verts.new(tc + Vector((r * math.cos(a), yv, r * math.sin(a)))) for r, yv in prof])
    for k in range(seg):
        kk = (k + 1) % seg
        for j in range(len(prof) - 1):
            a1, a2, b1, b2 = rings[k][j], rings[k][j + 1], rings[kk][j + 1], rings[kk][j]
            if j == 0 or j == len(prof) - 2:
                pass
            bm.faces.new((a1, a2, b1, b2))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ring_res = bmesh.ops.create_circle(bm, cap_ends=False, segments=16, radius=0.0062)
    ring_verts = ring_res["verts"]
    jr_c = Vector((0.0, -0.3055, 0.4085))
    # sweep a small tube around the jump-ring circle (ring in the YZ plane)
    for v in ring_verts:
        bm.verts.remove(v)
    jr_pts = [jr_c + Vector((0.0, 0.0062 * math.cos(2 * math.pi * i / 16), 0.0062 * math.sin(2 * math.pi * i / 16))) for i in range(17)]
    tube_bmesh(bm, jr_pts, [0.0012] * 17, segs=6, caps=False)
    tag = mesh_obj("CollarTag", bm)
    tag.data.materials.append(mat_brass)

    cu = bpy.data.curves.new("LouText", "FONT")
    cu.body = "LOU"
    cu.size = 0.0145
    cu.extrude = 0.00045
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.resolution_u = 3
    cu.space_character = 1.05
    txt = bpy.data.objects.new("CollarTagText", cu)
    link(txt)
    txt.location = (0.0, tc.y - th * 0.5 + 0.0008 - 0.00045, tc.z - 0.0005)
    txt.rotation_euler = (math.radians(90), 0, 0)
    activate(txt)
    bpy.ops.object.convert(target="MESH")
    txt = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    txt.name = "CollarTagText"
    txt.data.materials.clear()
    txt.data.materials.append(mat_enamel)
    # back side engraving too, so the tag reads when it flips
    return collar, tag, txt, mat_brass


def build_cig_and_vape(mat_brass):
    mat_cig_paper = make_mat("CigPaper", (0.96, 0.94, 0.90), roughness=0.8)
    mat_cig_filter = make_mat("CigFilter", (0.78, 0.46, 0.20), roughness=0.72)
    mat_cig_ash = make_mat("CigAsh", (0.34, 0.33, 0.34), roughness=0.95)
    mat_cig_ember = make_mat("CigEmber", (0.95, 0.25, 0.04), roughness=0.9, emission=(1.0, 0.36, 0.05), emission_strength=6.0)
    d = CIG_DIR
    p_filter = CIG_ROOT + d * 0.026
    p_gold = CIG_ROOT + d * 0.031
    p_paper = CIG_ROOT + d * 0.090
    p_ash = CIG_ROOT + d * 0.097
    p_ember = CIG_ROOT + d * 0.104
    parts = []
    for name, a, b, r, mat in (("CigFilter", CIG_ROOT, p_filter, (0.0076, 0.0076), mat_cig_filter),
                               ("CigGoldBand", p_filter, p_gold, (0.0077, 0.0077), mat_brass),
                               ("CigPaper", p_gold, p_paper, (0.0074, 0.0073), mat_cig_paper),
                               ("CigAsh", p_paper, p_ash, (0.0071, 0.0066), mat_cig_ash),
                               ("CigEmber", p_ash, p_ember, (0.0065, 0.0048), mat_cig_ember)):
        o = create_tube(name, [a, b], list(r), segs=10)
        o.data.materials.append(mat)
        parts.append(o)

    mat_vape_body = make_mat("VapeBody", (0.14, 0.16, 0.24), roughness=0.22, metallic=0.88)
    mat_vape_tank = make_mat("VapeTank", (0.18, 0.88, 0.95), roughness=0.1, emission=(0.15, 0.85, 1.0), emission_strength=1.4)
    mat_vape_led = make_mat("VapeLED", (0.2, 0.95, 1.0), roughness=0.15, emission=(0.2, 0.95, 1.0), emission_strength=4.2)
    v_tip = VAPE_ROOT + VAPE_DIR * 0.022
    v_tank = VAPE_ROOT + VAPE_DIR * 0.052
    v_body = VAPE_ROOT + VAPE_DIR * 0.112
    for name, a, b, r, mat, sg in (("VapeDripTip", VAPE_ROOT, v_tip, (0.008, 0.009), mat_vape_body, 10),
                                   ("VapeTank", v_tip, v_tank, (0.015, 0.015), mat_vape_tank, 12),
                                   ("VapeBody", v_tank, v_body, (0.017, 0.016), mat_vape_body, 8)):
        o = create_tube(name, [a, b], list(r), segs=sg)
        o.data.materials.append(mat)
        parts.append(o)
    led = create_ellipsoid("VapeLED", (v_tank + v_body) * 0.5 + Vector((0, -0.014, 0.008)), (0.007, 0.004, 0.014), 10, 8)
    led.data.materials.append(mat_vape_led)
    parts.append(led)
    return parts, p_ember


# ---------------------------------------------------------------------------------------------
# 4. Rig
# ---------------------------------------------------------------------------------------------
def build_rig(ears):
    arm_data = bpy.data.armatures.new("CatRig")
    arm = bpy.data.objects.new("CatRig", arm_data)
    link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add(name, h, t, parent=None, connected=False, roll=0.0):
        b = eb.new(name)
        b.head = Vector(h)
        b.tail = Vector(t)
        b.roll = roll
        if parent is not None:
            b.parent = eb[parent]
            b.use_connect = connected
        return b

    add("Root", (0, 0, 0.28), (0, -0.1, 0.28))
    add("Spine", (0, 0.14, 0.30), (0, -0.14, 0.31), "Root")
    add("Neck", (0, -0.18, 0.33), (0, -0.24, 0.48), "Spine")
    add("Head", (0, -0.24, 0.48), (0, -0.28, 0.62), "Neck", True)
    add("Jaw", (0, -0.300, 0.497), (0, -0.352, 0.474), "Head")
    for s, lab in ((1, "L"), (-1, "R")):
        mw = ears[s]
        add("Ear_" + lab, mw @ Vector((0, 0.004, 0.012)), mw @ Vector((0, 0.010, 0.125)), "Head")
        fwd, u_ax, up = eye_frame(s)
        add("Lid_" + lab, EYE_C[s], EYE_C[s] + fwd * 0.03, "Head")
    add("Tail1", (0, 0.25, 0.34), (0, 0.34, 0.40), "Spine")
    add("Tail2", (0, 0.34, 0.40), (0.02, 0.43, 0.54), "Tail1", True)
    add("Tail3", (0.02, 0.43, 0.54), (0.02, 0.42, 0.70), "Tail2", True)
    add("Tail4", (0.02, 0.42, 0.70), (-0.02, 0.356, 0.758), "Tail3", True)
    add("Belly", (0, 0.06, 0.25), (0, 0.06, 0.15), "Root")
    for key, g in LEG_GEO.items():
        parent = "Spine" if g["front"] else "Root"
        add(f"Leg_{key}", g["top"], g["mid"], parent)
        add(f"Leg_{key}_Lower", g["mid"], g["low"], f"Leg_{key}", True)
        add(f"Leg_{key}_Paw", g["low"], g["toe"], f"Leg_{key}_Lower", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


# ---------------------------------------------------------------------------------------------
# 5. Animation authoring: rest-space FK + analytic two-bone leg IK, keyed per frame
# ---------------------------------------------------------------------------------------------
AXES = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}


class Pose:
    def __init__(self):
        self.root_t = Vector((0, 0, 0))
        self.root_r = []
        self.rots = {}
        self.locs = {}
        self.feet = {}
        self.ground = None
        self.ground_w = 1.0
        self.blink = {1: 0.0, -1: 0.0}

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        lst = self.rots.setdefault(bone, [])
        for ax, v in (("x", x), ("y", y), ("z", z)):
            if v:
                lst.append((AXES[ax], v))
        return self

    def rv(self, bone, axis, deg):
        self.rots.setdefault(bone, []).append((Vector(axis).normalized(), deg))
        return self

    def root(self, t=None, x=0.0, y=0.0, z=0.0):
        if t is not None:
            self.root_t = Vector(t)
        for ax, v in (("x", x), ("y", y), ("z", z)):
            if v:
                self.root_r.append((AXES[ax], v))
        return self

    def lids(self, l, r=None):
        self.blink = {1: l, -1: l if r is None else r}
        return self


def qcompose(lst):
    q = Quaternion()
    for axis, deg in lst:
        q = Quaternion(axis, math.radians(deg)) @ q
    return q


class Animator:
    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.rest_q = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
        self.rest_inv = {b.name: b.matrix_local.inverted() for b in arm.data.bones}
        self.leg_data = {}
        for key, g in LEG_GEO.items():
            self.leg_data[key] = dict(chain=(f"Leg_{key}", f"Leg_{key}_Lower", f"Leg_{key}_Paw"),
                                      sole=g["sole"].copy(), low=g["low"].copy(), toe=g["toe"].copy())
        # blink axis/sign per eye: rotation that moves the upper lid edge down
        self.lid_axis = {}
        for s in (1, -1):
            fwd, u_ax, up = eye_frame(s)
            n_up, b_up, n_lo, b_lo = lid_axes(s)
            edge = (fwd * math.cos(math.radians(LID_UP_ELEV[s])) + up * math.sin(math.radians(LID_UP_ELEV[s])))
            q = Quaternion(u_ax, math.radians(10))
            sign = 1.0 if (q @ edge).z < edge.z else -1.0
            close = LID_UP_ELEV[s] - LID_LO_ELEV + 4.0
            self.lid_axis[s] = (u_ax * sign, close)
        self.diag = {}

    def upd(self):
        bpy.context.view_layer.update()

    def world_pt(self, bone, p):
        return self.pb[bone].matrix @ (self.rest_inv[bone] @ Vector(p))

    def reset(self):
        for pb in self.pb:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.scale = (1, 1, 1)

    def set_root(self, P, t):
        rq = self.rest_q["Root"]
        q = qcompose(P.root_r)
        self.pb["Root"].rotation_quaternion = rq.inverted() @ q @ rq
        self.pb["Root"].location = rq.inverted() @ t

    def apply(self, P):
        self.reset()
        self.set_root(P, P.root_t)
        for b, lst in P.rots.items():
            rq = self.rest_q[b]
            self.pb[b].rotation_quaternion = rq.inverted() @ qcompose(lst) @ rq
        for b, v in P.locs.items():
            self.pb[b].location = self.rest_q[b].inverted() @ Vector(v)
        for s, lab in ((1, "L"), (-1, "R")):
            axis, close = self.lid_axis[s]
            ang = P.blink[s] * close
            if ang:
                rq = self.rest_q["Lid_" + lab]
                self.pb["Lid_" + lab].rotation_quaternion = rq.inverted() @ Quaternion(axis, math.radians(ang)) @ rq
        self.upd()
        if P.ground:
            zmin = min(self.world_pt(b, p).z for b, p in P.ground)
            t = P.root_t.copy()
            t.z -= zmin * P.ground_w
            self.set_root(P, t)
            self.upd()
        for key, spec in P.feet.items():
            self.place_leg(key, spec)

    def place_leg(self, key, spec):
        LD = self.leg_data[key]
        A, B, C = LD["chain"]
        pitch = spec.get("pitch", 0.0)
        Rp = Matrix.Rotation(math.radians(pitch), 3, "X")
        if "wrist" in spec:
            target = Vector(spec["wrist"])
        else:
            target = Vector(spec["sole"]) + Rp @ (LD["low"] - LD["sole"])
        paw_dir = Vector(spec["paw_dir"]) if "paw_dir" in spec else Rp @ (LD["toe"] - LD["low"])
        err = self.two_bone_ik(A, B, target)
        self.diag[key] = err
        self.orient(C, paw_dir)

    def two_bone_ik(self, A, B, target):
        pa, pbn = self.pb[A], self.pb[B]
        S = pa.head.copy()
        K = pbn.head.copy()
        Wt = pbn.tail.copy()
        L1 = (K - S).length
        L2 = (Wt - K).length
        D = (target - S).length
        Dc = min(max(D, abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9995)
        g_des = math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - Dc * Dc) / (2 * L1 * L2))))
        v1 = S - K
        v2 = Wt - K
        g_cur = v1.angle(v2)
        nrm = v1.cross(v2)
        if nrm.length < 1e-9:
            nrm = pa.matrix.to_3x3() @ Vector((1, 0, 0))
        nrm.normalize()
        best = None
        for sg in (1.0, -1.0):
            R = Matrix.Rotation(sg * (g_des - g_cur), 3, nrm)
            gn = v1.angle(R @ v2)
            if best is None or abs(gn - g_des) < best[0]:
                best = (abs(gn - g_des), R)
        R4 = best[1].to_4x4()
        pbn.matrix = Matrix.Translation(K) @ R4 @ Matrix.Translation(-K) @ pbn.matrix
        self.upd()
        Wt = pbn.tail.copy()
        q = (Wt - S).rotation_difference(target - S)
        pa.matrix = Matrix.Translation(S) @ q.to_matrix().to_4x4() @ Matrix.Translation(-S) @ pa.matrix
        self.upd()
        return D - Dc

    def orient(self, C, d):
        pc = self.pb[C]
        H = pc.head.copy()
        q = (pc.tail - pc.head).rotation_difference(d)
        pc.matrix = Matrix.Translation(H) @ q.to_matrix().to_4x4() @ Matrix.Translation(-H) @ pc.matrix
        self.upd()

    def make_action(self, name, nframes, fn):
        arm = self.arm
        act = bpy.data.actions.new(name=name)
        arm.animation_data.action = act
        prev = {}
        worst = {}
        for i in range(nframes + 1):
            t = i / nframes
            P = fn(t)
            self.diag = {}
            self.apply(P)
            for k, e in self.diag.items():
                worst[k] = max(worst.get(k, 0.0), e)
            f = 1 + i
            for pb in self.pb:
                q = pb.rotation_quaternion.copy()
                if pb.name in prev and prev[pb.name].dot(q) < 0:
                    q.negate()
                    pb.rotation_quaternion = q
                prev[pb.name] = q
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.name = name
        arm.animation_data.action = None
        short = {k: round(v, 3) for k, v in worst.items() if v > 0.004}
        log("action", name, "%d frames (%.2fs)" % (nframes + 1, nframes / FPS), ("IK short " + str(short)) if short else "")


def pulse(t, c, w):
    d = abs(t - c)
    d = min(d, 1.0 - d)
    if d >= w:
        return 0.0
    return 0.5 + 0.5 * math.cos(math.pi * d / w)


def keyed(t, keys):
    """Piecewise smoothstep interpolation through (t, value) keys."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-9)
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return keys[-1][1]


def env(t, a, b, c, d):
    """0 before a, ramps to 1 by b, holds, back to 0 between c and d."""
    return smooth01(a, b, t) * (1.0 - smooth01(c, d, t))


SIN = math.sin
TAU = 2.0 * math.pi
REAR_CONTACTS = [("Root", (0.0, 0.05, 0.130)), ("Root", (0.0, 0.12, 0.136)), ("Root", (0.0, 0.19, 0.152)),
                 ("Root", (0.07, 0.19, 0.160)), ("Root", (-0.07, 0.19, 0.160)), ("Root", (0.0, 0.245, 0.185)),
                 ("Root", (0.0, 0.275, 0.235)), ("Root", (0.0, 0.29, 0.29))]


def author_animations(arm):
    an = Animator(arm)
    arm.animation_data_create()
    LD = an.leg_data
    rest_sole = {k: v["sole"].copy() for k, v in LD.items()}

    def plant(P, keys=("FL", "FR", "BL", "BR")):
        for k in keys:
            P.feet[k] = dict(sole=rest_sole[k], pitch=0.0)

    def tail_sway(P, t, amp=12.0, lift=0.0, base=0.0):
        P.r("Tail1", x=base, y=amp * SIN(TAU * t))
        P.r("Tail2", x=lift, y=amp * 1.2 * SIN(TAU * t - 0.8))
        P.r("Tail3", y=amp * 1.3 * SIN(TAU * t - 1.6))
        P.r("Tail4", y=amp * 1.4 * SIN(TAU * t - 2.4))

    # ---------------- Idle (2.5 s): breathe, look around, ear flick, one slow blink
    def idle(t):
        P = Pose()
        P.r("Spine", x=0.9 * SIN(TAU * t))
        P.locs["Belly"] = (0, 0, -0.003 * SIN(TAU * t))
        P.r("Neck", x=-1.5 * SIN(TAU * t), z=4 * SIN(TAU * t))
        P.r("Head", x=2.5 * SIN(2 * TAU * t), z=8 * SIN(TAU * t + 0.6), y=4 * SIN(TAU * t + 1.4))
        e = pulse(t, 0.32, 0.05)
        P.r("Ear_L", y=16 * e, x=-8 * e)
        P.r("Ear_R", z=-6 * SIN(TAU * t))
        b = pulse(t, 0.70, 0.09)
        P.lids(b, b)
        tail_sway(P, t, 10.0)
        P.r("Tail4", x=-10 * pulse(t, 0.5, 0.2))
        return P

    an.make_action("Idle", 60, idle)

    # ---------------- Walk (1.0 s): lateral-sequence waddle, planted feet via IK
    def gait(P, t, offs, duty, stride, lift, fpk, hpk):
        for key, off in offs.items():
            ph = (t + off) % 1.0
            base = rest_sole[key]
            front = key[0] == "F"
            if ph < duty:
                s = ph / duty
                yy = base.y + stride * (s - 0.5)
                zz = 0.0
                pitch = 22.0 * smooth01(0.70, 1.0, s)
            else:
                s = (ph - duty) / (1.0 - duty)
                e = s * s * (3 - 2 * s)
                yy = base.y + stride * (0.5 - e)
                zz = lift * SIN(math.pi * s)
                pk = fpk if front else hpk
                pitch = 22.0 * (1 - s) + pk * SIN(math.pi * s)
            P.feet[key] = dict(sole=Vector((base.x, yy, zz)), pitch=pitch)

    def walk(t):
        P = Pose()
        P.root(t=(0.004 * SIN(TAU * t), 0.0, -0.014 + 0.005 * math.cos(2 * TAU * t)), y=3.0 * SIN(TAU * t), z=1.5 * SIN(TAU * t))
        P.r("Spine", z=-3.0 * SIN(TAU * t), x=1.0 * math.cos(2 * TAU * t))
        P.r("Neck", x=-2.0 * math.cos(2 * TAU * t), z=-2.0 * SIN(TAU * t))
        P.r("Head", z=-2.0 * SIN(TAU * t))
        P.locs["Belly"] = (0.004 * SIN(TAU * t - 0.6), 0, 0.005 * SIN(2 * TAU * t - 1.0))
        gait(P, t, {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75}, 0.62, 0.11, 0.035, 75.0, 30.0)
        tail_sway(P, t, 12.0, base=8.0)
        P.r("Ear_L", x=-3 * SIN(2 * TAU * t))
        P.r("Ear_R", x=-3 * SIN(2 * TAU * t))
        return P

    an.make_action("Walk", 24, walk)

    # ---------------- Puff (1.5 s): savour a drag, eyes shut, then exhale skyward
    def puff(t):
        P = Pose()
        inh = env(t, 0.0, 0.30, 0.34, 0.45)
        exh = env(t, 0.36, 0.50, 0.70, 1.0)
        P.r("Spine", x=-2.0 * inh)
        P.locs["Belly"] = (0, 0, -0.006 * inh)
        P.r("Neck", x=4 * inh - 8 * exh, z=-5 * inh)
        P.r("Head", x=6 * inh - 16 * exh, y=-5 * inh + 5 * exh, z=-6 * inh + 4 * exh)
        P.r("Jaw", x=6 * exh)
        P.lids(min(1.0, 0.95 * inh + 0.35 * exh), min(1.0, 0.95 * inh + 0.30 * exh))
        P.r("Ear_L", y=8 * exh)
        P.r("Ear_R", y=-8 * exh)
        P.r("Tail1", y=12 * inh - 14 * exh)
        P.r("Tail4", x=-15 * exh)
        return P

    an.make_action("Puff", 36, puff)

    # ---------------- Sit base, shared by Sit / Drive / Beg / Dance
    def sit_base(P, w=1.0, pitch=50.0, head_fix=None, hind_pitch=-58.0, front=True, spine=20.0):
        # rump rotates under (Root), the chest stays less steep (Spine bends forward) so the
        # front paws still reach the floor on Lou's short legs
        P.root(x=-pitch * w)
        P.r("Spine", x=spine * w)
        hf = (pitch - spine) * 0.85 if head_fix is None else head_fix
        P.r("Neck", x=hf * 0.6 * w)
        P.r("Head", x=hf * 0.4 * w)
        P.ground = REAR_CONTACTS + [("Leg_BL", (HIND_X, 0.16, 0.18)), ("Leg_BR", (-HIND_X, 0.16, 0.18))]
        P.ground_w = w
        P.r("Tail1", x=-55 * w, z=10 * w)
        P.r("Tail2", x=-25 * w, z=35 * w)
        P.r("Tail3", z=40 * w, x=-10 * w)
        P.r("Tail4", z=35 * w)

    def sit_feet(P, w=1.0, front=True, spread=0.0):
        an.apply(P)  # body solved first so feet can be placed relative to the posed shoulders/hips
        sh = {k: an.pb[f"Leg_{k}"].head.copy() for k in ("FL", "FR", "BL", "BR")}
        for k in ("BL", "BR"):
            s = 1 if k[1] == "L" else -1
            tgt = Vector((s * (HIND_X + 0.012), sh["FL"].y + 0.075, 0.0))
            P.feet[k] = dict(sole=rest_sole[k].lerp(tgt, w), pitch=-58.0 * w)
        if front:
            for k in ("FL", "FR"):
                s = 1 if k[1] == "L" else -1
                tgt = Vector((s * (FRONT_X - 0.010 + spread), sh[k].y - 0.018, 0.0))
                P.feet[k] = dict(sole=rest_sole[k].lerp(tgt, w), pitch=0.0)
        return sh

    def sit(t):
        P = Pose()
        sit_base(P)
        P.r("Spine", x=1.0 * SIN(TAU * t))
        P.locs["Belly"] = (0, 0.002 * SIN(TAU * t), -0.003 * SIN(TAU * t))
        P.r("Head", z=7 * SIN(TAU * t), y=3 * SIN(TAU * t + 1.0))
        P.r("Ear_L", y=14 * pulse(t, 0.18, 0.05))
        P.r("Ear_R", z=-8 * SIN(TAU * t))
        P.r("Tail4", z=18 * pulse(t, 0.4, 0.1) - 10 * pulse(t, 0.48, 0.08))
        b = pulse(t, 0.66, 0.08)
        P.lids(b, b)
        sit_feet(P)
        return P

    an.make_action("Sit", 48, sit)

    # ---------------- Beg (1.9 s one-shot): sit up on the haunches, paws up, little wave
    def beg(t):
        P = Pose()
        w = env(t, 0.0, 0.28, 0.76, 1.0)
        sit_base(P, w, pitch=62.0, head_fix=48.0, spine=-5.0)
        P.r("Head", y=10 * w, x=6 * w)
        P.r("Ear_L", y=10 * w)
        P.r("Ear_R", y=-10 * w)
        P.lids(-0.25 * w, -0.25 * w)
        sh = sit_feet(P, w, front=False)
        up = smooth01(0.15, 0.40, t) * (1.0 - smooth01(0.70, 0.92, t))
        wave = SIN(TAU * 3.0 * t) * env(t, 0.32, 0.40, 0.66, 0.74)
        for k in ("FL", "FR"):
            s = 1 if k[1] == "L" else -1
            planted = rest_sole[k] + (LD[k]["low"] - LD[k]["sole"])
            raised = sh[k] + Vector((-0.032 * s, -0.075, 0.030 + 0.025 * wave * s))
            P.feet[k] = dict(wrist=planted.lerp(raised, up), paw_dir=Vector((0, -0.25, -1.0)).lerp(Vector((0, -1.0, -0.5)), 1 - up))
        return P

    an.make_action("Beg", 44, beg)

    # ---------------- Steal (1.0 s one-shot): crouch, right paw swipes the goods
    def steal(t):
        P = Pose()
        w = env(t, 0.0, 0.25, 0.70, 1.0)
        P.root(t=(0.0, 0.02 * w, -0.045 * w), z=-7 * w, x=3 * w)
        P.r("Spine", z=-6 * w)
        P.r("Head", z=-12 * w, x=10 * w)
        P.r("Ear_L", x=6 * w)
        P.r("Ear_R", x=6 * w)
        P.lids(-0.3 * w, -0.3 * w)
        plant(P, ("FL", "BL", "BR"))
        sw = env(t, 0.22, 0.35, 0.62, 0.82)
        path = keyed(t, [(0.22, 0.0), (0.42, 1.0), (0.58, 2.0), (0.82, 3.0)])
        p0 = rest_sole["FR"] + (LD["FR"]["low"] - LD["FR"]["sole"])
        p1 = Vector((-0.10, -0.34, 0.12))
        p2 = Vector((-0.03, -0.27, 0.07))
        if path <= 1.0:
            wr = p0.lerp(p1, path)
        elif path <= 2.0:
            wr = p1.lerp(p2, path - 1.0)
        else:
            wr = p2.lerp(p0, path - 2.0)
        P.feet["FR"] = dict(wrist=wr, paw_dir=Vector((0.0, -0.7, -0.7)).lerp(Vector((0.3, -0.9, -0.3)), sw))
        P.r("Tail1", y=-15 * w)
        P.r("Tail4", x=-20 * sw)
        return P

    an.make_action("Steal", 24, steal)

    # ---------------- VapeRip (2.0 s one-shot): lean back, big rip, cloud to the sky
    def vape(t):
        P = Pose()
        inh = env(t, 0.0, 0.30, 0.36, 0.48)
        exh = env(t, 0.38, 0.55, 0.78, 1.0)
        P.root(t=(0, 0, -0.014 * exh), x=-2.5 * exh)
        P.r("Spine", x=-3 * inh - 5 * exh)
        P.locs["Belly"] = (0, 0, -0.008 * inh)
        P.r("Neck", x=6 * inh - 14 * exh, z=-4 * inh)
        P.r("Head", x=8 * inh - 22 * exh, y=-6 * inh + 6 * exh, z=-8 * inh)
        P.r("Jaw", x=10 * exh)
        P.lids(min(1.0, inh + 0.85 * exh), min(1.0, inh + 0.8 * exh))
        P.r("Ear_L", y=12 * exh, x=-8 * exh)
        P.r("Ear_R", y=-12 * exh, x=-8 * exh)
        P.r("Tail1", y=15 * inh - 18 * exh)
        P.r("Tail3", y=-20 * exh)
        plant(P)
        return P

    an.make_action("VapeRip", 48, vape)

    # ---------------- Run (0.5 s): rotary gallop with spine flex/extend
    def run(t):
        P = Pose()
        ph = TAU * t
        P.root(t=(0.0, 0.0, -0.042 + 0.022 * max(0.0, SIN(ph - 0.9))), x=6.0 * SIN(ph - 0.3))
        P.r("Spine", x=10.0 * SIN(ph + 0.4))
        P.r("Neck", x=-6.0 * SIN(ph - 0.3) - 6)
        P.r("Head", x=-4.0 * SIN(ph + 0.4) + 4)
        P.locs["Belly"] = (0, 0, 0.012 * SIN(ph - 1.6))
        gait(P, t, {"BL": 0.0, "BR": 0.08, "FL": 0.46, "FR": 0.54}, 0.38, 0.21, 0.07, 95.0, 45.0)
        P.r("Tail1", x=-55 + 6 * SIN(ph), y=6 * SIN(ph))
        P.r("Tail2", x=-25 + 10 * SIN(ph - 0.8))
        P.r("Tail3", x=-5 + 12 * SIN(ph - 1.6))
        P.r("Tail4", x=10 * SIN(ph - 2.4))
        P.r("Ear_L", x=-22, y=8)
        P.r("Ear_R", x=-22, y=-8)
        P.lids(-0.15, -0.15)
        return P

    an.make_action("Run", 12, run)

    # ---------------- Jump (1.0 s loop): tucked mid-air pose with a little float
    def jump(t):
        P = Pose()
        ph = TAU * t
        P.root(t=(0, 0, 0.004 * SIN(ph)), x=-6 + 2 * SIN(ph))
        P.r("Spine", x=10 + 2 * SIN(ph))
        P.r("Neck", x=-6)
        P.r("Head", x=10 + 2 * SIN(ph + 1))
        P.locs["Belly"] = (0, 0, 0.006 * SIN(ph - 1.0))
        for k in ("FL", "FR"):
            s = 1 if k[1] == "L" else -1
            P.feet[k] = dict(sole=Vector((s * 0.072, -0.245, 0.165 + 0.004 * SIN(ph))), pitch=105.0)
        for k in ("BL", "BR"):
            s = 1 if k[1] == "L" else -1
            P.feet[k] = dict(sole=Vector((s * 0.088, 0.075, 0.105 + 0.004 * SIN(ph + 1))), pitch=35.0)
        P.r("Tail1", x=-40 + 5 * SIN(ph), y=8 * SIN(ph))
        P.r("Tail2", x=15, y=10 * SIN(ph - 0.8))
        P.r("Tail3", x=15, y=12 * SIN(ph - 1.6))
        P.r("Tail4", x=10, y=14 * SIN(ph - 2.4))
        P.r("Ear_L", x=-15, y=10)
        P.r("Ear_R", x=-15, y=-10)
        P.lids(-0.3, -0.3)
        return P

    an.make_action("Jump", 24, jump)

    # ---------------- Pounce (0.8 s one-shot): crouch + butt wiggle, leap, headbutt, land
    def pounce(t):
        P = Pose()
        rz = keyed(t, [(0, 0), (0.14, -0.05), (0.32, -0.065), (0.44, 0.03), (0.56, 0.085), (0.70, 0.03), (0.80, -0.02), (1.0, 0)])
        ry = keyed(t, [(0, 0), (0.32, 0.025), (0.46, -0.03), (0.60, -0.06), (0.76, -0.05), (1.0, 0)])
        pitch = keyed(t, [(0, 0), (0.30, 4), (0.43, -14), (0.58, 12), (0.72, 6), (1.0, 0)])
        wig = 6.0 * SIN(TAU * 3.2 * t) * env(t, 0.06, 0.12, 0.26, 0.32)
        P.root(t=(0.006 * wig / 6.0, ry, rz), x=pitch, z=wig)
        P.r("Spine", x=keyed(t, [(0, 0), (0.3, 8), (0.45, -12), (0.6, 8), (1.0, 0)]))
        P.r("Neck", x=keyed(t, [(0, 0), (0.3, -6), (0.46, -10), (0.58, 20), (0.68, 12), (1.0, 0)]))
        P.r("Head", x=keyed(t, [(0, 0), (0.3, -4), (0.48, -6), (0.58, 16), (0.70, 6), (1.0, 0)]))
        P.locs["Belly"] = (0, 0, keyed(t, [(0, 0), (0.3, 0.004), (0.45, -0.012), (0.6, 0.01), (0.75, -0.006), (1.0, 0)]))
        ears_back = env(t, 0.35, 0.48, 0.66, 0.85)
        P.r("Ear_L", x=-25 * ears_back, y=10 * ears_back)
        P.r("Ear_R", x=-25 * ears_back, y=-10 * ears_back)
        P.lids(-0.35 * env(t, 0.1, 0.3, 0.55, 0.7) + 0.6 * env(t, 0.52, 0.58, 0.62, 0.70))
        for k in ("FL", "FR"):
            base = rest_sole[k]
            air = env(t, 0.36, 0.44, 0.66, 0.74)
            fy = keyed(t, [(0, 0), (0.36, 0), (0.52, -0.16), (0.66, -0.10), (0.74, -0.06), (0.86, -0.06), (1.0, 0)])
            fz = 0.09 * air
            P.feet[k] = dict(sole=Vector((base.x, base.y + fy, fz)), pitch=40.0 * air)
        for k in ("BL", "BR"):
            base = rest_sole[k]
            air = env(t, 0.42, 0.50, 0.74, 0.82)
            fy = keyed(t, [(0, 0), (0.42, 0), (0.55, 0.10), (0.70, -0.02), (0.82, -0.05), (0.9, -0.05), (1.0, 0)])
            P.feet[k] = dict(sole=Vector((base.x, base.y + fy, 0.05 * air)), pitch=30.0 * air)
        P.r("Tail1", x=keyed(t, [(0, 0), (0.3, -10), (0.5, -45), (0.7, -30), (1.0, 0)]), y=8 * wig / 6.0)
        P.r("Tail2", x=keyed(t, [(0, 0), (0.5, -15), (1.0, 0)]))
        P.r("Tail4", x=-25 * env(t, 0.0, 0.2, 0.3, 0.45))
        return P

    an.make_action("Pounce", 19, pounce)

    # ---------------- Eat (0.75 s loop): front crouch, head in the bowl, chomp chomp
    def eat(t):
        P = Pose()
        ph = TAU * t
        P.root(t=(0, 0.0, -0.030), x=12)
        P.r("Spine", x=8)
        P.r("Neck", x=34 + 2 * SIN(2 * ph))
        P.r("Head", x=18 + 3 * SIN(2 * ph + 0.5), y=6 * SIN(ph))
        P.r("Jaw", x=13 * max(0.0, SIN(2 * ph)))
        P.r("Ear_L", x=-6, y=6 + 4 * SIN(ph))
        P.r("Ear_R", x=-6, y=-6 + 4 * SIN(ph))
        P.lids(0.42, 0.40)
        plant(P)
        tail_sway(P, t, 8.0, base=10.0)
        return P

    an.make_action("Eat", 18, eat)

    # ---------------- Drive (2.0 s loop): sit, paws on a wheel, steering and bobbing
    def drive(t):
        P = Pose()
        ph = TAU * t
        steer = 22.0 * SIN(ph) + 7.0 * SIN(2 * ph + 1.0)
        sit_base(P, 1.0, pitch=50.0, spine=16.0)
        P.root(y=-4.0 * steer / 22.0)
        P.r("Neck", x=3 * SIN(2 * ph))
        P.r("Head", z=-9 * steer / 22.0, y=-4 * steer / 22.0)
        P.r("Ear_L", y=6 * SIN(2 * ph))
        P.r("Ear_R", y=-6 * SIN(2 * ph))
        P.lids(0.15, 0.15)
        sh = sit_feet(P, 1.0, front=False)
        mid = (sh["FL"] + sh["FR"]) * 0.5
        c = mid + Vector((0.0, -0.125, -0.005))
        for k, a0 in (("FL", 55.0), ("FR", -55.0)):
            a = math.radians(a0 - steer)
            hand = c + Vector((0.066 * math.sin(a), 0.0, 0.066 * math.cos(a)))
            P.feet[k] = dict(wrist=hand + Vector((0.0, 0.028, -0.004)), paw_dir=Vector((0.0, -0.75, 0.25)))
        return P

    an.make_action("Drive", 48, drive)

    # ---------------- Flop (2.0 s loop): lying on his right side, limp, belly breathing
    def flop(t):
        P = Pose()
        ph = TAU * t
        P.root(y=-90.0)
        P.r("Spine", x=6)
        P.r("Neck", x=-6, y=-10)
        P.r("Head", x=6, y=-8)
        P.r("Jaw", x=3)
        P.locs["Belly"] = (0.0, 0.0, -0.007 * (0.5 + 0.5 * SIN(ph)))
        P.r("Spine", z=0.8 * SIN(ph))
        for k in ("FL", "FR"):
            P.r(f"Leg_{k}", x=-38, y=22)
            P.r(f"Leg_{k}_Lower", x=18)
            P.r(f"Leg_{k}_Paw", x=35)
        for k in ("BL", "BR"):
            P.r(f"Leg_{k}", x=28, y=20)
            P.r(f"Leg_{k}_Lower", x=12)
            P.r(f"Leg_{k}_Paw", x=-10)
        P.r("Tail1", x=-62)
        P.r("Tail2", x=-25, y=8)
        P.r("Tail3", x=-8)
        P.r("Tail4", z=14 * pulse(t, 0.3, 0.08) - 10 * pulse(t, 0.38, 0.06))
        P.r("Ear_L", x=-8, y=12 * pulse(t, 0.72, 0.05))
        P.lids(1.0, 1.0)
        P.ground = [("Spine", (-0.155, y0, 0.30)) for y0 in (-0.12, 0.0, 0.12)] + \
                   [("Root", (-0.168, 0.17, 0.275)), ("Head", (-0.13, -0.27, 0.53)), ("Neck", (-0.09, -0.21, 0.40)),
                    ("Spine", (-0.14, -0.16, 0.33))]
        return P

    an.make_action("Flop", 48, flop)

    # ---------------- Dance (1.0 s loop): sit up, hip sway, alternating paw pumps, head bob
    def dance(t):
        P = Pose()
        ph = TAU * t
        sit_base(P, 1.0, pitch=58.0, head_fix=44.0, spine=-5.0)
        P.root(t=(0.012 * SIN(ph), 0, 0), y=7.0 * SIN(ph))
        P.r("Spine", y=-5.0 * SIN(ph))
        P.r("Neck", x=6.0 * max(0.0, SIN(2 * ph)), y=-4 * SIN(ph))
        P.r("Head", y=-10.0 * SIN(ph), z=6 * SIN(ph))
        P.locs["Belly"] = (0.006 * SIN(ph), 0, 0.008 * SIN(2 * ph))
        P.r("Ear_L", y=12 * max(0.0, SIN(2 * ph)))
        P.r("Ear_R", y=-12 * max(0.0, -SIN(2 * ph)))
        P.lids(0.45, 0.45)
        P.r("Tail1", x=-55, z=10 + 25 * SIN(ph))
        sh = sit_feet(P, 1.0, front=False)
        for k, sgn in (("FL", 1.0), ("FR", -1.0)):
            s = 1 if k[1] == "L" else -1
            pump = max(0.0, sgn * SIN(2 * ph))
            wr = sh[k] + Vector((-0.010 * s, -0.070, 0.010 + 0.085 * pump))
            P.feet[k] = dict(wrist=wr, paw_dir=Vector((0.0, -0.4, 1.0)).lerp(Vector((0, -1.0, -0.3)), 1 - pump))
        return P

    an.make_action("Dance", 24, dance)

    an.reset()
    an.upd()
    return an


# ---------------------------------------------------------------------------------------------
# 6. Skinning
# ---------------------------------------------------------------------------------------------
LEG_SKIN_RAD = {True: (0.056, 0.043, 0.034, 0.030), False: (0.075, 0.051, 0.035, 0.030)}


def leg_skin(co):
    """Leg membership and per-segment weights for a body vertex (bone heat gives the flanks to the
    leg bones on a body this fat, so legs are weighted from the leg tubes instead)."""
    best = None
    for key, g in LEG_GEO.items():
        side_f = smooth01(0.0, 0.045, co.x * g["side"]) if g["front"] else smooth01(0.02, 0.07, co.x * g["side"])
        if side_f <= 0.0:
            continue
        pts = [g["top"], g["mid"], g["low"], g["toe"]]
        rad = LEG_SKIN_RAD[g["front"]]
        lens = [(pts[i + 1] - pts[i]).length for i in range(3)]
        acc = 0.0
        m = 0.0
        wsum = 0.0
        arc = 0.0
        for i in range(3):
            a, b = pts[i], pts[i + 1]
            ab = b - a
            t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
            dd = (co - (a + ab * t)).length - (rad[i] + (rad[i + 1] - rad[i]) * t)
            if i == 0 and g["front"]:
                mi = smooth01(0.034, 0.004, dd) * smooth01(0.27, 0.19, co.z)
            elif i == 0:
                mi = 0.8 * smooth01(0.032, 0.0, dd) * smooth01(0.31, 0.22, co.z) * smooth01(0.05, 0.11, co.x * g["side"])
            else:
                mi = smooth01(0.034, 0.004, dd)
            m = max(m, mi)
            wi = math.exp(-max(dd, 0.0) / 0.008)
            wsum += wi
            arc += wi * (acc + t * lens[i])
            acc += lens[i]
        arc /= max(wsum, 1e-9)
        m *= side_f
        if m <= 1e-3 or (best is not None and m <= best[0]):
            continue
        a_mid, a_low = lens[0], lens[0] + lens[1]
        w_up = 1.0 - smooth01(a_mid - 0.025, a_mid + 0.02, arc)
        w_paw = smooth01(a_low - 0.012, a_low + 0.015, arc)
        w_low = max(0.0, 1.0 - w_up - w_paw)
        best = (m, {f"Leg_{key}": w_up, f"Leg_{key}_Lower": w_low, f"Leg_{key}_Paw": w_paw})
    return best


HEAD_PLANE_P = Vector((0.0, -0.236, 0.446))
HEAD_PLANE_N = Vector((0.0, -0.38, 0.92)).normalized()


def tail_joint_arcs(arm):
    pts = [Vector(p) for p in TAIL_PTS]
    out = []
    for name in ("Tail2", "Tail3", "Tail4"):
        h = arm.data.bones[name].head_local
        best = None
        acc = 0.0
        for i in range(len(pts) - 1):
            ab = pts[i + 1] - pts[i]
            for k in range(41):
                tt = k / 40.0
                d = (h - (pts[i] + ab * tt)).length
                if best is None or d < best[0]:
                    best = (d, acc + tt * ab.length)
            acc += ab.length
        out.append(best[1])
    return out


def tail_skin(co, joints):
    """Tail membership and Tail1..4 weights by arc length along the tail tube."""
    pts = [Vector(p) for p in TAIL_PTS]
    best = None
    acc = 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
        dd = (co - (a + ab * t)).length - (TAIL_RAD[i] + (TAIL_RAD[i + 1] - TAIL_RAD[i]) * t)
        if best is None or dd < best[0]:
            best = (dd, acc + t * ab.length, i, t)
        acc += ab.length
    dd, arc, seg, t = best
    m = smooth01(0.014, 0.002, dd) * smooth01(0.0, 0.045, arc)
    if seg == 0 and t <= 0.0:
        m = 0.0
    if m <= 1e-3:
        return None
    s = [1.0 - smooth01(j - 0.025, j + 0.025, arc) for j in joints]  # share before each joint
    w1 = s[0]
    w2 = (1.0 - s[0]) * s[1]
    w3 = (1.0 - s[1]) * s[2]
    w4 = 1.0 - s[2]
    return m, {"Tail1": w1, "Tail2": w2, "Tail3": w3, "Tail4": w4}


def trunk_skin(co):
    h = (co - HEAD_PLANE_P).dot(HEAD_PLANE_N)
    head = smooth01(-0.006, 0.026, h)
    neck = (1.0 - head) * smooth01(-0.095, -0.040, h) * smooth01(-0.05, -0.15, co.y)
    rest = max(0.0, 1.0 - head - neck)
    spine = smooth01(0.13, -0.07, co.y)
    return {"Head": head, "Neck": neck, "Spine": rest * spine, "Root": rest * (1.0 - spine)}


def skin(body, arm, details):
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    body.parent = arm
    body.parent_type = "OBJECT"
    body.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    vgs = body.vertex_groups
    for b in arm.data.bones:
        if b.name not in vgs:
            vgs.new(name=b.name)
    me = body.data
    mask = me.color_attributes["Mask"].data
    joints = tail_joint_arcs(arm)
    for v in me.vertices:
        co = v.co
        weights = trunk_skin(co)
        tail = tail_skin(co, joints) if co.y > 0.2 else None
        if tail is not None:
            m, tw = tail
            weights = {k: wv * (1.0 - m) for k, wv in weights.items()}
            for k, wv in tw.items():
                weights[k] = weights.get(k, 0.0) + wv * m
        weights = {k: wv for k, wv in weights.items() if wv > 1e-4}
        is_ear = mask[v.index].color[1] > 0.5
        if is_ear:
            weights = {("Ear_L" if co.x > 0 else "Ear_R"): 1.0}
        else:
            leg = leg_skin(co)
            if leg is not None:
                m, lw = leg
                tot = sum(weights.values())
                weights = {k: wv / tot * (1.0 - m) for k, wv in weights.items()}
                for k, wv in lw.items():
                    if wv > 1e-3:
                        weights[k] = weights.get(k, 0.0) + wv * m
            jw = smooth01(0.494, 0.478, co.z) * smooth01(0.046, 0.026, abs(co.x)) * smooth01(-0.296, -0.330, co.y)
            bw = 0.75 * smooth01(0.245, 0.150, co.z) * smooth01(0.17, 0.07, abs(co.x)) * \
                smooth01(-0.15, -0.06, co.y) * smooth01(0.27, 0.18, co.y)
            for extra_name, ew in (("Jaw", jw), ("Belly", bw)):
                if ew > 1e-3:
                    tot = sum(weights.values())
                    weights = {k: wv / tot * (1.0 - ew) for k, wv in weights.items()}
                    weights[extra_name] = ew
        top = sorted(weights.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(wv for _, wv in top) or 1.0
        gids = [g.group for g in v.groups]
        for gid in gids:
            vgs[gid].remove([v.index])
        for name, wv in top:
            vgs[name].add([v.index], wv / tot, "REPLACE")

    for obj, groups in details:
        if obj.matrix_world != Matrix.Identity(4):
            activate(obj)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.parent = arm
        obj.parent_type = "OBJECT"
        obj.matrix_parent_inverse = arm.matrix_world.inverted()
        if isinstance(groups, str):
            vg = obj.vertex_groups.new(name=groups)
            vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    arm.data.pose_position = "POSE"


def tip_empty(name, arm, pos):
    arm.data.pose_position = "REST"
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = 0.02
    link(e)
    e.parent = arm
    e.parent_type = "BONE"
    e.parent_bone = "Head"
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(pos)
    bpy.context.view_layer.update()
    arm.data.pose_position = "POSE"
    return e


# ---------------------------------------------------------------------------------------------
# 7. Preview render
# ---------------------------------------------------------------------------------------------
def setup_render_scene():
    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.055, 0.07, 0.11, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    for name, loc, energy, size, color in (("KeyLight", (-1.2, -1.6, 1.8), 75.0, 1.4, (1.0, 0.96, 0.9)),
                                          ("RimLight", (1.1, 1.3, 1.2), 45.0, 1.0, (0.75, 0.85, 1.0)),
                                          ("FillLight", (1.4, -1.2, 0.5), 18.0, 1.6, (1.0, 0.9, 0.85))):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, -0.15, 0.35)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        link(lo)
    floor_me = bpy.data.meshes.new("PreviewFloor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0)
    bm.to_mesh(floor_me)
    bm.free()
    floor = bpy.data.objects.new("PreviewFloor", floor_me)
    floor.is_shadow_catcher = True
    link(floor)
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    cam.location = (-0.72, -1.18, 0.66)
    cam.rotation_euler = (Vector((0.0, -0.10, 0.37)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    link(cam)
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24 if FAST else 64
    scene.cycles.use_denoising = True
    scene.render.film_transparent = False
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.view_settings.view_transform = "AgX"
    return floor


def solo_track(arm, name):
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != name


# ---------------------------------------------------------------------------------------------
def build_scene():
    clear_scene()
    roots = whisker_roots()
    body, ears = build_body()
    unwrap_body(body)
    fur, lid_col = bake_and_paint(body, roots)
    rim_mat = make_mat("LidRim", srgb_to_lin((0.05, 0.04, 0.04)), roughness=0.4)
    lid_mat = make_mat("LidFur", srgb_to_lin(lid_col), roughness=0.8, spec=0.3, sheen=0.3)
    eyes, glints = build_eyes()
    lid_up, lid_lo = build_lids(lid_mat, rim_mat)
    nose = build_nose()
    whiskers = build_whiskers(body, roots)
    ear_fur = build_ear_fur(ears)
    pads = build_paw_pads()
    collar, tag, tag_text, mat_brass = build_collar()
    cig_vape, p_ember = build_cig_and_vape(mat_brass)
    log("details built")

    arm = build_rig(ears)
    author_animations(arm)

    for obj in [lid_up]:
        for s, lab in ((1, "L"), (-1, "R")):
            vg = obj.vertex_groups.new(name="Lid_" + lab)
            vg.add([v.index for v in obj.data.vertices if (v.co.x > 0) == (s > 0)], 1.0, "REPLACE")
    details = [(eyes, "Head"), (glints, "Head"), (lid_up, None), (lid_lo, "Head"), (nose, "Head"), (whiskers, "Head"),
               (ear_fur, None), (pads, None), (collar, "Neck"), (tag, "Neck"), (tag_text, "Neck")]
    details += [(o, "Head") for o in cig_vape]
    skin(body, arm, details)
    tip_empty("CigTip", arm, p_ember)
    tip_empty("VapeTip", arm, VAPE_ROOT)
    log("skinned")

    bpy.context.scene.frame_set(1)
    solo_track(arm, "Idle")
    for tr in arm.animation_data.nla_tracks:
        tr.mute = False
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    log("saved blend")

    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_nla_strips=True,
        export_anim_slide_to_zero=True,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=85,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_generic_quantization=12,
        export_cameras=False,
        export_lights=False,
    )
    log("exported", GLB_OUT, "%.2f MB" % (os.path.getsize(GLB_OUT) / 1e6))

    if not NO_RENDER:
        setup_render_scene()
        solo_track(arm, "Idle")
        bpy.context.scene.frame_set(1)
        bpy.context.scene.render.filepath = PREVIEW_OUT
        bpy.ops.render.render(write_still=True)
        log("preview rendered")
    print("EXPORT_DONE", GLB_OUT)


if __name__ == "__main__":
    build_scene()
