#!/usr/bin/env python3
"""Generate BoxingCat app icons — a cute boxing cat."""

import math
import struct
import os
from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT_DIR = Path("src-tauri/icons")
ICON_SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 1024,  # master
}

# ─── Master icon (1024x1024) ───────────────────────────────────────────

def create_master_icon(size=1024):
    """Draw a cute boxing cat icon at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2
    r = size * 0.46

    # ── Background circle with gradient ──────────────────────────────
    # Draw radial gradient from warm orange to coral
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= r:
                t = dist / r  # 0 at center, 1 at edge
                # Interpolate: #FF8C42 (center) → #E85D3A (edge)
                rr = int(255 + (232 - 255) * t)
                gg = int(140 + (93 - 140) * t)
                bb = int(66 + (58 - 66) * t)
                aa = 255
                # Smooth edge anti-aliasing
                if r - dist < 1.5:
                    aa = int(255 * max(0, min(1, (r - dist) / 1.5)))
                img.putpixel((x, y), (rr, gg, bb, aa))
            elif dist <= r + 8:
                # Soft shadow ring
                t2 = (dist - r) / 8
                alpha = int(30 * (1 - t2))
                if alpha > 0:
                    img.putpixel((x, y), (0, 0, 0, alpha))

    # ── Cat ears (triangles on top) ──────────────────────────────────
    ear_h = size * 0.22
    ear_w = size * 0.15
    ear_base_y = cy - r * 0.72

    # Left ear
    left_ear = [
        (cx - r * 0.45, ear_base_y),
        (cx - r * 0.20, ear_base_y),
        (cx - r * 0.38, ear_base_y - ear_h),
    ]
    # Right ear
    right_ear = [
        (cx + r * 0.20, ear_base_y),
        (cx + r * 0.45, ear_base_y),
        (cx + r * 0.38, ear_base_y - ear_h),
    ]

    for ear in [left_ear, right_ear]:
        draw.polygon(ear, fill=(255, 140, 66, 255))
        # Inner ear (pink)
        inner_scale = 0.55
        ear_cx = sum(p[0] for p in ear) / 3
        ear_cy = sum(p[1] for p in ear) / 3
        inner = [(ear_cx + (p[0] - ear_cx) * inner_scale,
                  ear_cy + (p[1] - ear_cy) * inner_scale) for p in ear]
        draw.polygon(inner, fill=(255, 182, 148, 255))

    # ── Cat face (within the orange circle) ──────────────────────────
    face_color = (255, 220, 180, 255)
    # Draw the face area (slightly smaller circle of cream color)
    face_r = r * 0.88
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= face_r and dist <= r:
                # Only draw within face circle AND within background circle
                pass  # Handled below with putpixel

    # Actually let's draw elements directly — face shape is just the orange bg

    # ── Eyes ─────────────────────────────────────────────────────────
    eye_spacing = r * 0.28
    eye_y = cy - r * 0.10
    eye_r_outer = r * 0.13
    eye_r_inner = r * 0.08
    pupil_r = r * 0.05

    for side in [-1, 1]:
        ex = cx + side * eye_spacing

        # Eye white
        for y in range(size):
            for x in range(size):
                dx, dy = x - ex, y - eye_y
                dist = math.sqrt(dx * dx + dy * dy)
                if dist <= eye_r_outer and dist > eye_r_inner:
                    # Eyeball ring
                    aa = 255
                    if eye_r_outer - dist < 1.5:
                        aa = int(255 * max(0, min(1, (eye_r_outer - dist) / 1.5)))
                    if aa > 0:
                        img.putpixel((x, y), (255, 255, 255, aa))
                elif dist <= eye_r_inner:
                    aa = 255
                    if eye_r_inner - dist < 1.5:
                        aa = int(255 * max(0, min(1, (eye_r_inner - dist) / 1.5)))
                    if aa > 0:
                        img.putpixel((x, y), (45, 30, 25, aa))

        # Pupil highlight (small white dot)
        phx = ex + eye_r_inner * 0.3
        phy = eye_y - eye_r_inner * 0.25
        for y in range(size):
            for x in range(size):
                dx, dy = x - phx, y - phy
                dist = math.sqrt(dx * dx + dy * dy)
                if dist <= pupil_r * 0.4:
                    aa = 255
                    if pupil_r * 0.4 - dist < 1:
                        aa = int(255 * max(0, min(1, (pupil_r * 0.4 - dist) / 1)))
                    if aa > 0:
                        img.putpixel((x, y), (255, 255, 255, aa))

    # ── Nose ─────────────────────────────────────────────────────────
    nose_y = cy + r * 0.10
    nose_w, nose_h = r * 0.08, r * 0.06
    # Small pink triangle nose
    nose_pts = [
        (cx, nose_y - nose_h),
        (cx - nose_w, nose_y + nose_h * 0.6),
        (cx + nose_w, nose_y + nose_h * 0.6),
    ]
    draw.polygon(nose_pts, fill=(255, 130, 130, 255))

    # ── Mouth ────────────────────────────────────────────────────────
    mouth_y = nose_y + nose_h * 0.8
    mouth_w = r * 0.12

    # Cat mouth — two curves down from nose
    draw.line([(cx, nose_y + nose_h * 0.5), (cx - mouth_w, mouth_y + r * 0.05)],
              fill=(80, 50, 40, 255), width=max(2, int(r * 0.025)))
    draw.line([(cx, nose_y + nose_h * 0.5), (cx + mouth_w, mouth_y + r * 0.05)],
              fill=(80, 50, 40, 255), width=max(2, int(r * 0.025)))
    # Smile curves
    draw.arc([cx - mouth_w - r * 0.03, mouth_y - r * 0.02,
              cx - r * 0.02, mouth_y + r * 0.17],
             start=200, end=340, fill=(80, 50, 40, 255), width=max(2, int(r * 0.025)))
    draw.arc([cx + r * 0.02, mouth_y - r * 0.02,
              cx + mouth_w + r * 0.03, mouth_y + r * 0.17],
             start=200, end=340, fill=(80, 50, 40, 255), width=max(2, int(r * 0.025)))

    # ── Whiskers ─────────────────────────────────────────────────────
    whisker_y = nose_y + r * 0.02
    whisker_len = r * 0.28
    whisker_gap = r * 0.12
    whisker_color = (80, 50, 40, 180)
    whisker_w = max(2, int(r * 0.015))

    for side in [-1, 1]:
        wx = cx + side * whisker_gap
        # Two whiskers per side
        for angle_offset in [-8, 8]:
            rad = math.radians(angle_offset)
            end_x = wx + side * whisker_len * math.cos(rad)
            end_y = whisker_y + whisker_len * math.sin(rad) * 0.3
            draw.line([(wx, whisker_y), (end_x, end_y)],
                      fill=whisker_color, width=whisker_w)

    # ── Boxing gloves (small, at bottom of face) ────────────────────
    glove_y = cy + r * 0.58
    glove_r = r * 0.10

    for side in [-1, 1]:
        gx = cx + side * r * 0.28

        # Glove circle (red)
        for y in range(size):
            for x in range(size):
                dx, dy = x - gx, y - glove_y
                dist = math.sqrt(dx * dx + dy * dy)
                if dist <= glove_r:
                    aa = 255
                    if glove_r - dist < 1.5:
                        aa = int(255 * max(0, min(1, (glove_r - dist) / 1.5)))
                    if aa > 0:
                        img.putpixel((x, y), (220, 40, 40, aa))

        # Glove highlight
        ghx = gx - glove_r * 0.25
        ghy = glove_y - glove_r * 0.3
        for y in range(size):
            for x in range(size):
                dx, dy = x - ghx, y - ghy
                dist = math.sqrt(dx * dx + dy * dy)
                if dist <= glove_r * 0.3:
                    aa = min(100, int(255 * max(0, 1 - dist / (glove_r * 0.3))))
                    if aa > 0:
                        r_old, g_old, b_old, a_old = img.getpixel((x, y))
                        if a_old > 0:
                            img.putpixel((x, y), (
                                min(255, r_old + 60),
                                min(255, g_old + 40),
                                min(255, b_old + 40),
                                a_old,
                            ))

    return img


# ─── Generate all sizes ────────────────────────────────────────────────

def generate_all():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("🎨 Drawing master icon (1024x1024)...")
    master = create_master_icon(1024)
    master.save(OUTPUT_DIR / "icon.png")

    for name, size in ICON_SIZES.items():
        if name == "icon.png":
            continue
        print(f"  → {name} ({size}x{size})")
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(OUTPUT_DIR / name)

    # ── macOS .icns ──────────────────────────────────────────────────
    print("🍎 Creating icon.icns...")
    create_icns(OUTPUT_DIR / "icon.icns", master)

    # ── Windows .ico ─────────────────────────────────────────────────
    print("🪟 Creating icon.ico...")
    create_ico(OUTPUT_DIR / "icon.ico", master)

    print("✅ All icons generated in src-tauri/icons/")


def create_icns(path, master):
    """Create macOS .icns file from master image."""
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    iconset = OUTPUT_DIR / "icon.iconset"
    iconset.mkdir(exist_ok=True)

    for s in sizes:
        img = master.resize((s, s), Image.LANCZOS)
        img.save(iconset / f"icon_{s}x{s}.png")
        # @2x version
        s2 = s * 2
        if s2 <= 1024:
            img2 = master.resize((s2, s2), Image.LANCZOS)
            img2.save(iconset / f"icon_{s}x{s}@2x.png")

    os.system(f"iconutil -c icns -o {path} {iconset}")

    # Clean up iconset
    import shutil
    shutil.rmtree(iconset)


def create_ico(path, master):
    """Create Windows .ico file from master image."""
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    for s in sizes:
        img = master.resize((s, s), Image.LANCZOS)
        # Ensure RGBA
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        images.append(img)

    # Save as ICO
    images[0].save(
        path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )

    print(f"  ICO saved with sizes: {sizes}")


if __name__ == "__main__":
    generate_all()
