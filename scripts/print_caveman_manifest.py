import json

with open('apps/game/public/sprites/prehistoric/caveman_animation.json', 'r') as f:
    data = json.load(f)

print(json.dumps(data, indent=2))
