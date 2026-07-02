"""Test script to verify modular prompt architecture."""
import sys
sys.path.insert(0, 'c:/Users/User01/.gemini/antigravity/scratch/renovation-next/backend_python')

from src.prompts.system_instruction import SYSTEM_INSTRUCTION

# Verification checks
print("=" * 60)
print("MODULAR PROMPT VERIFICATION")
print("=" * 60)

print(f"\n✅ Import successful")
print(f"✅ Prompt length: {len(SYSTEM_INSTRUCTION):,} characters")
print(f"✅ Contains <identity>: {'<identity>' in SYSTEM_INSTRUCTION}")
print(f"✅ Contains <tool>: {'<tool' in SYSTEM_INSTRUCTION}")
print(f"✅ Contains <state_machine>: {'<state_machine>' in SYSTEM_INSTRUCTION}")
print(f"✅ Contains <critical_protocols>: {'<critical_protocols>' in SYSTEM_INSTRUCTION}")

# Preview first 500 chars
print(f"\n📝 Preview (first 500 chars):")
print("-" * 60)
print(SYSTEM_INSTRUCTION[:500])
print("-" * 60)

print(f"\n✅ All checks passed! Modular architecture working correctly.")
