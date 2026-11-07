import struct
import json
import os

def create_sample_glb(output_path: str):
    # Triangle / Quad positions: 3 vertices
    positions = [
        0.0,  0.5, 0.0,
       -0.5, -0.5, 0.0,
        0.5, -0.5, 0.0,
    ]
    indices = [0, 1, 2]
    
    # Animation: 3 keyframes (0.0s, 1.75s, 3.5s)
    anim_times = [0.0, 1.75, 3.5]
    anim_translations = [
        0.0, 0.0, 0.0,
        0.0, 0.3, 0.0,
        0.0, 0.0, 0.0,
    ]
    
    # Pack binary buffer
    pos_bytes = struct.pack(f'<{len(positions)}f', *positions)
    # Align to 4 bytes if needed
    ind_bytes = struct.pack(f'<{len(indices)}H', *indices)
    # Pad ind_bytes to 4-byte boundary
    if len(ind_bytes) % 4 != 0:
        ind_bytes += b'\x00' * (4 - (len(ind_bytes) % 4))
        
    time_bytes = struct.pack(f'<{len(anim_times)}f', *anim_times)
    trans_bytes = struct.pack(f'<{len(anim_translations)}f', *anim_translations)
    
    offset_pos = 0
    len_pos = len(pos_bytes)
    offset_ind = offset_pos + len_pos
    len_ind = len(indices) * 2 # actual indices byteLength
    offset_time = offset_ind + len(ind_bytes)
    len_time = len(time_bytes)
    offset_trans = offset_time + len_time
    len_trans = len(trans_bytes)
    
    bin_buffer = pos_bytes + ind_bytes + time_bytes + trans_bytes
    # Pad bin_buffer to 4-byte boundary
    if len(bin_buffer) % 4 != 0:
        bin_buffer += b'\x00' * (4 - (len(bin_buffer) % 4))
        
    gltf_dict = {
        "asset": {"version": "2.0", "generator": "BuddhaLiveStudio S2 Fixture"},
        "scene": 0,
        "scenes": [{"name": "DefaultScene", "nodes": [0]}],
        "nodes": [{"name": "MonkNode", "mesh": 0, "translation": [0.0, 0.0, 0.0]}],
        "meshes": [{
            "name": "MonkMesh",
            "primitives": [{
                "attributes": {"POSITION": 0},
                "indices": 1
            }]
        }],
        "animations": [{
            "name": "Pray",
            "channels": [{
                "sampler": 0,
                "target": {"node": 0, "path": "translation"}
            }],
            "samplers": [{
                "input": 2,
                "interpolation": "LINEAR",
                "output": 3
            }]
        }],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": offset_pos,
                "componentType": 5126, # FLOAT
                "count": 3,
                "type": "VEC3",
                "max": [0.5, 0.5, 0.0],
                "min": [-0.5, -0.5, 0.0]
            },
            {
                "bufferView": 0,
                "byteOffset": offset_ind,
                "componentType": 5123, # UNSIGNED_SHORT
                "count": 3,
                "type": "SCALAR",
                "max": [2],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126, # FLOAT
                "count": 3,
                "type": "SCALAR",
                "max": [3.5],
                "min": [0.0]
            },
            {
                "bufferView": 1,
                "byteOffset": len_time,
                "componentType": 5126, # FLOAT
                "count": 3,
                "type": "VEC3",
                "max": [0.0, 0.3, 0.0],
                "min": [0.0, 0.0, 0.0]
            }
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": offset_time,
                "target": 34962 # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": offset_time,
                "byteLength": len_time + len_trans
            }
        ],
        "buffers": [{
            "byteLength": len(bin_buffer)
        }]
    }
    
    json_bytes = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
    # Pad JSON to 4-byte boundary with spaces
    if len(json_bytes) % 4 != 0:
        json_bytes += b' ' * (4 - (len(json_bytes) % 4))
        
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_buffer)
    
    header = struct.pack('<4sII', b'glTF', 2, total_length)
    chunk0_header = struct.pack('<I4s', len(json_bytes), b'JSON')
    chunk1_header = struct.pack('<I4s', len(bin_buffer), b'BIN\x00')
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(header)
        f.write(chunk0_header)
        f.write(json_bytes)
        f.write(chunk1_header)
        f.write(bin_buffer)
    print(f"Created {output_path} ({total_length} bytes)")

if __name__ == '__main__':
    create_sample_glb('d:/toptop_duan/tests/fixtures/assets/sample-character.glb')
