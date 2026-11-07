"""
Generate full frame set for Caveman:
- idle: 4 frames (8 fps, subtle breathing cycle)
- walk: 8 frames (12 fps, 4 key poses x 2 alternating legs: contact, down, pass, up)
- attack: 8 frames (12-15 fps, 2 windup, 2 swing with motion smear, 2 impact/settle, 2 recovery, pinned hit frame)
- hurt: 3 frames (12 fps, recoil & recovery)
- die: 3 frames (fall & settle)
All frames 256x256, anchor Y = 0.90 (ground at Y=230).
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

BASE_DIR = Path("d:/toptop_duan")
SLICES_DIR = BASE_DIR / "art/scratch/caveman_slices"
OUT_FRAMES_DIR = BASE_DIR / "art/scratch/caveman_retimed_frames"
OUT_ATLAS_DIR = BASE_DIR / "apps/game/public/sprites/prehistoric"

OUT_FRAMES_DIR.mkdir(parents=True, exist_ok=True)

def load_slice(idx: int) -> Image.Image:
    path = SLICES_DIR / f"frame_{idx:03d}.png"
    return Image.open(path).convert("RGBA")

def create_idle():
    base = load_slice(0) # 256x256
    arr = np.array(base)
    # Split upper body (y < 165) and legs (y >= 165)
    # Breathing lifts upper body by 0, 1.5, 2.5, 1.0 px
    frames = []
    lifts = [0.0, 1.4, 2.6, 1.2]
    for i, lift in enumerate(lifts):
        if lift == 0.0:
            frames.append(base.copy())
            continue
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        # Lower body (legs remain planted firmly on ground)
        legs_mask = arr[..., 3] > 0
        legs_mask[:165, :] = False
        legs_img = Image.fromarray(arr * legs_mask[..., None])
        canvas.paste(legs_img, (0, 0), legs_img)
        
        # Upper body (torso, arms, head, club)
        upper_mask = arr[..., 3] > 0
        upper_mask[165:, :] = False
        upper_img = Image.fromarray(arr * upper_mask[..., None])
        
        # Slight chest expansion (width scale 1.015 at peak)
        scale_x = 1.0 + (lift / 2.6) * 0.015
        new_w = int(256 * scale_x)
        upper_scaled = upper_img.resize((new_w, 256), Image.Resampling.BILINEAR)
        offset_x = (256 - new_w) // 2
        offset_y = -int(round(lift))
        canvas.paste(upper_scaled, (offset_x, offset_y), upper_scaled)
        frames.append(canvas)
    return frames

def create_walk():
    # 4 core poses from source:
    f6 = load_slice(6)  # Contact L
    f7 = load_slice(7)  # Down L
    f8 = load_slice(8)  # Passing R
    f9 = load_slice(9)  # Up L
    
    # We construct alternating stride (Contact R, Down R, Passing L, Up R)
    # To alternate: the front/back leg positions flip horizontally in the leg region (y >= 160)
    # while the upper torso maintains the forward-facing angle and club swing.
    def make_alternating(src_frame: Image.Image, leg_x_offset: int, club_rock: int) -> Image.Image:
        src_arr = np.array(src_frame)
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        
        # Upper body (y < 162) with slight forward/back rock
        upper_mask = src_arr[..., 3] > 0
        upper_mask[162:, :] = False
        upper = Image.fromarray(src_arr * upper_mask[..., None])
        canvas.paste(upper, (club_rock, 0), upper)
        
        # Lower body (legs & hips y >= 160)
        lower_mask = src_arr[..., 3] > 0
        lower_mask[:160, :] = False
        lower = Image.fromarray(src_arr * lower_mask[..., None])
        
        # Flip lower body horizontally around waist center X=128, then adjust stride offset
        lower_flipped = lower.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        # Shift back into position
        canvas.paste(lower_flipped, (leg_x_offset, 0), lower_flipped)
        return canvas

    f10 = make_alternating(f6, leg_x_offset=0, club_rock=-1) # Contact R
    f11 = make_alternating(f7, leg_x_offset=-2, club_rock=1) # Down R
    f12 = make_alternating(f8, leg_x_offset=0, club_rock=0)  # Passing L
    f13 = make_alternating(f9, leg_x_offset=2, club_rock=-1) # Up R

    return [f6, f7, f8, f9, f10, f11, f12, f13]

def draw_motion_smear(canvas: Image.Image):
    """Draw dynamic arc motion smear for caveman attack frame 3"""
    overlay = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Smear arc from club top to swing front
    # White-gold energetic swing trail
    arc_points = [
        (85, 45), (130, 48), (175, 68), (210, 105), (232, 150), (228, 195)
    ]
    # Draw fading wide arc
    for i in range(len(arc_points) - 1):
        alpha = int(70 + (i / len(arc_points)) * 160)
        w = int(6 + (i / len(arc_points)) * 8)
        color = (255, 235, 140, alpha)
        draw.line([arc_points[i], arc_points[i+1]], fill=color, width=w)
    
    # Inner sharp white core trail
    for i in range(len(arc_points) - 1):
        alpha = int(120 + (i / len(arc_points)) * 135)
        color = (255, 255, 255, alpha)
        draw.line([arc_points[i], arc_points[i+1]], fill=color, width=3)
    
    # Spikes trail sparks
    sparks = [(220, 130), (238, 165), (225, 185), (200, 110)]
    for sx, sy in sparks:
        draw.ellipse([sx-3, sy-3, sx+3, sy+3], fill=(255, 250, 190, 220))
        draw.ellipse([sx-1, sy-1, sx+1, sy+1], fill=(255, 255, 255, 255))
        
    canvas.paste(overlay, (0, 0), overlay)

def create_attack():
    f12 = load_slice(12) # High wind-up
    f13 = load_slice(13) # Swing down
    f14 = load_slice(14) # Ground impact
    
    # F0: Prep 1 - Windup Start (slight pull back from idle)
    base_idle = load_slice(0)
    f_prep1 = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f_prep1.paste(base_idle, (-8, 2), base_idle)
    
    # F1: Prep 2 - High Windup
    f_prep2 = f12.copy()
    
    # F2: Swing onset (transition between prep2 and swing)
    f_swing_onset = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    # Lean forward +10px, lower slightly +3px
    f_swing_onset.paste(f12, (10, 3), f12)
    
    # F3: Full Swing with Motion Smear (HIT FRAME!)
    f_smear = f13.copy()
    draw_motion_smear(f_smear)
    
    # F4: Impact / Floor strike
    f_impact = f14.copy()
    
    # F5: Follow-through / hold (vibration settle at bottom)
    f_hold = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f_hold.paste(f14, (1, 1), f14)
    # Small dust puff at club head (x: 210-230, y: 220-230)
    dust_overlay = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    d_draw = ImageDraw.Draw(dust_overlay)
    d_draw.ellipse([215, 218, 232, 228], fill=(210, 180, 140, 120))
    d_draw.ellipse([200, 221, 216, 229], fill=(210, 180, 140, 90))
    f_hold.paste(dust_overlay, (0, 0), dust_overlay)
    
    # F6: Recovery 1 - Lifting club up from ground
    f_rec1 = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f_rec1.paste(f14, (-5, -8), f14)
    
    # F7: Recovery 2 - Returning towards neutral
    f_rec2 = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f_rec2.paste(base_idle, (4, 0), base_idle)
    
    return [f_prep1, f_prep2, f_swing_onset, f_smear, f_impact, f_hold, f_rec1, f_rec2]

def create_hurt():
    f18 = load_slice(18) # Hurt 1
    f19 = load_slice(19) # Hurt 2
    
    # F0: Impact shock (f18)
    f0 = f18.copy()
    # F1: Peak recoil (f19)
    f1 = f19.copy()
    # F2: Recovery (returning to stance)
    f2 = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f2.paste(f18, (8, 0), f18)
    return [f0, f1, f2]

def create_die():
    f20 = load_slice(20) # Falling
    f21 = load_slice(21) # Lying down
    # F0: Falling
    f0 = f20.copy()
    # F1: Knee collapse (intermediate)
    f1 = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    f1.paste(f20, (12, 10), f20)
    # F2: Flat ground settle (f21)
    f2 = f21.copy()
    return [f0, f1, f2]

print("Synthesizing frames...")
idle_frames = create_idle()
walk_frames = create_walk()
attack_frames = create_attack()
hurt_frames = create_hurt()
die_frames = create_die()

print(f"Idle: {len(idle_frames)} frames")
print(f"Walk: {len(walk_frames)} frames")
print(f"Attack: {len(attack_frames)} frames")
print(f"Hurt: {len(hurt_frames)} frames")
print(f"Die: {len(die_frames)} frames")

# Save individual frames for review and retime
for idx, fr in enumerate(idle_frames):
    fr.save(OUT_FRAMES_DIR / f"idle_{idx:02d}.png")
for idx, fr in enumerate(walk_frames):
    fr.save(OUT_FRAMES_DIR / f"walk_{idx:02d}.png")
for idx, fr in enumerate(attack_frames):
    fr.save(OUT_FRAMES_DIR / f"attack_{idx:02d}.png")
for idx, fr in enumerate(hurt_frames):
    fr.save(OUT_FRAMES_DIR / f"hurt_{idx:02d}.png")
for idx, fr in enumerate(die_frames):
    fr.save(OUT_FRAMES_DIR / f"die_{idx:02d}.png")

# Now build the full new Atlas: 8 columns x 4 rows = 2048 x 1024 px
# Row 0: Idle (4 frames + 4 rest)
# Row 1: Walk (8 frames)
# Row 2: Attack (8 frames)
# Row 3: Hurt (3 frames) + Die (3 frames) + 2 padding
atlas = Image.new("RGBA", (2048, 1024), (0, 0, 0, 0))
cw, ch = 256, 256

# Row 0: Idle
for c in range(4):
    atlas.paste(idle_frames[c], (c * cw, 0 * ch), idle_frames[c])

# Row 1: Walk
for c in range(8):
    atlas.paste(walk_frames[c], (c * cw, 1 * ch), walk_frames[c])

# Row 2: Attack
for c in range(8):
    atlas.paste(attack_frames[c], (c * cw, 2 * ch), attack_frames[c])

# Row 3: Hurt (0..2) + Die (3..5)
for c in range(3):
    atlas.paste(hurt_frames[c], (c * cw, 3 * ch), hurt_frames[c])
for c in range(3):
    atlas.paste(die_frames[c], ((c + 3) * cw, 3 * ch), die_frames[c])

# Save Atlas
atlas_path = OUT_ATLAS_DIR / "caveman_atlas.png"
atlas.save(atlas_path)
print(f"Saved new 2048x1024 atlas to {atlas_path}")

# Build a comprehensive Contact Sheet for User Review with grid annotations & labels
sheet = Image.new("RGBA", (2048 + 80, 1024 + 140), (22, 27, 34, 255)) # Dark theme background
sheet_draw = ImageDraw.Draw(sheet)

# Header
sheet_draw.text((30, 20), "VIDEO2DSPRITE CONTACT SHEET — NGƯỜI VƯỢN (CAVEMAN)", fill=(240, 246, 252))
sheet_draw.text((30, 45), "Kỷ Nguyên 1 Tiền Sử | Grid 256x256 | Anchor [0.5, 0.90] (Y=230) | Walk 8F 12fps | Attack 8F 12-15fps (Hit F3) | Hurt 3F 12fps | Idle 4F 8fps", fill=(139, 148, 158))

row_labels = ["ROW 0: IDLE (4F @ 8fps)", "ROW 1: WALK (8F @ 12fps)", "ROW 2: ATTACK (8F @ 12-15fps)", "ROW 3: HURT (3F) & DIE (3F)"]
for r, label in enumerate(row_labels):
    sheet_draw.text((25, 90 + r * 256 + 115), label, fill=(180, 190, 205))

# Paste atlas
sheet.paste(atlas, (70, 80), atlas)

# Draw cell borders and ground line (Y=230 inside each cell)
for r in range(4):
    for c in range(8):
        x0 = 70 + c * 256
        y0 = 80 + r * 256
        x1 = x0 + 256
        y1 = y0 + 256
        sheet_draw.rectangle([x0, y0, x1, y1], outline=(56, 68, 85, 255), width=1)
        # Ground line indicator (y = 230)
        gy = y0 + 230
        sheet_draw.line([(x0, gy), (x1, gy)], fill=(40, 120, 200, 100), width=1)

# Annotate specific key frames
# Walk poses
walk_poses = ["0: Contact L", "1: Down L", "2: Pass R", "3: Up L", "4: Contact R", "5: Down R", "6: Pass L", "7: Up R"]
for c, p in enumerate(walk_poses):
    sheet_draw.text((75 + c * 256, 80 + 1 * 256 + 6), p, fill=(88, 166, 255))

# Attack poses
atk_poses = ["0: Prep 1", "1: Prep 2", "2: Swing Start", "3: HIT SMEAR ★", "4: Impact", "5: Settle", "6: Recov 1", "7: Recov 2"]
for c, p in enumerate(atk_poses):
    col = (255, 120, 120) if c == 3 else (210, 153, 34)
    sheet_draw.text((75 + c * 256, 80 + 2 * 256 + 6), p, fill=col)

contact_sheet_path = BASE_DIR / "art/scratch/caveman_contact_sheet.png"
sheet.save(contact_sheet_path)
print(f"Saved contact sheet to {contact_sheet_path}")
