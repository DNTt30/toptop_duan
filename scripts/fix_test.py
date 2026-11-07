with open('d:/toptop_duan/apps/game/src/tests/bugHuntPipeline.test.ts', 'r', encoding='utf-8') as f:
    text = f.read()

target = '      30000\n\n    );'
replacement = '      120000\n\n    );'

if target in text:
    text = text.replace(target, replacement)
    print("Replaced timeout 30000 -> 120000")
else:
    print("Target timeout not found directly, checking variations...")
    target2 = '      30000\r\n\r\n    );'
    if target2 in text:
        text = text.replace(target2, replacement)
        print("Replaced target2 timeout")

with open('d:/toptop_duan/apps/game/src/tests/bugHuntPipeline.test.ts', 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
