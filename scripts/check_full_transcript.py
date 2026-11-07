import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/duong/.gemini/antigravity/brain/d430af74-503a-41fc-a4d6-1162ee65b773/.system_generated/logs/transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'image-generator' in line:
            data = json.loads(line)
            calls = data.get('tool_calls', [])
            for c in calls:
                if c.get('args', {}).get('TypeName') == 'image-generator':
                    print(f"Role: {c['args'].get('Role')}")
                    print(f"Prompt: {c['args'].get('Prompt')[:200]}...")
                    print("-" * 50)
