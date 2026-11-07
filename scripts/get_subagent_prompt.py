import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/duong/.gemini/antigravity/brain/d430af74-503a-41fc-a4d6-1162ee65b773/.system_generated/logs/transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        idx = data.get('step_index')
        if idx in range(1105, 1115) and data.get('tool_calls'):
            for c in data['tool_calls']:
                if 'invoke_subagent' in c.get('name', ''):
                    print(f"Step {idx}: {c['args'].get('Role')}")
                    print(c['args'].get('Prompt'))
