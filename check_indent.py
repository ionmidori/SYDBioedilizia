with open(r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\backend_python\src\graph\agent.py", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 105 <= i <= 115:
            print(f"Line {i+1}: {repr(line)}")
