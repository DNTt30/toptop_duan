import json

with open('C:/Users/duong/.gemini/antigravity/brain/d430af74-503a-41fc-a4d6-1162ee65b773/.system_generated/logs/transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        if data.get('step_index') == 1110:
            print("Prompt for 1110:")
            calls = data.get('tool_calls', [])
            for c in calls:
                print(c.get('args', {}).get('Prompt'))
